import { lookup as dnsLookup } from 'node:dns/promises';
import { parse } from 'node-html-parser';
import type { ResolvedConfig } from './config.js';
import { allRules } from './rules/index.js';
import { parseRobotsTxt } from './rules/robots-txt.js';
import { findCspViolations } from './rules/security-headers.js';
import type { CspPage } from './rules/security-headers.js';
import { extractLocs } from './rules/sitemap-coverage.js';
import type { RunResult } from './runner.js';
import { computeScore } from './score.js';
import type { PageContext, Severity, Violation } from './types.js';
import { dim, green, red, yellow } from './util/color.js';
import { collectCspResources, parseCsp } from './util/csp.js';
import { extractMainText, extractVisibleText } from './util/dom.js';
import { countErrors } from './util/violations.js';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
/** Resolves when `hostname` has an A/AAAA record, rejects otherwise. */
export type LookupLike = (hostname: string) => Promise<unknown>;

export interface LiveOptions {
  /** The deployed site, e.g. `https://www.example.com/`. */
  url: string;
  config: ResolvedConfig;
  /** How many pages (homepage plus a spread of sitemap URLs) to fetch and lint. Default 20. */
  maxPages?: number;
  /** Per-request timeout in milliseconds. Default 10000. */
  timeoutMs?: number;
  fetch?: FetchLike;
  lookup?: LookupLike;
  /** Called with a short description of each step, e.g. to drive a spinner. */
  onProgress?: (message: string) => void;
}

/** What each live check group looks at, in report order. */
const LIVE_CHECKS = [
  { rule: 'liveDomain', covers: 'DNS, https, www redirect, redirect chains' },
  { rule: 'liveHeaders', covers: 'HSTS, CSP, framing, nosniff, referrer …' },
  { rule: 'liveHttp', covers: 'homepage, robots.txt, sitemap, status' },
  { rule: 'pageRules', covers: 'per-page rules on the sampled pages' },
] as const;

export interface LiveCheck {
  rule: (typeof LIVE_CHECKS)[number]['rule'];
  covers: string;
  /** `false` when an earlier failure (e.g. DNS) stopped the run before this group. */
  ran: boolean;
  errors: number;
  warnings: number;
}

export interface LiveResult extends RunResult {
  /** Every check group, including the ones that passed or were skipped. */
  checks: LiveCheck[];
}

const USER_AGENT = 'astro-seo-enforcer (+https://github.com/SlashGordon/astro-seo-enforcer)';
// 180 days: the minimum hstspreload.org and most audits accept.
const MIN_HSTS_MAX_AGE = 15_552_000;
const MAX_SITEMAPS = 10;
// Browsers give up after 20; anything near that is broken, not just slow.
const MAX_REDIRECTS = 10;
const CONCURRENCY = 4;

/**
 * Checks a deployed site over the network: DNS and redirects for the apex and
 * `www` hosts, the security headers actually served, `robots.txt` and the
 * sitemap, and every per-page rule on a sample of the live pages. Catches what
 * the build output cannot show: host and CDN configuration, and a deploy that
 * differs from the build.
 */
export async function runLiveChecks(options: LiveOptions): Promise<LiveResult> {
  const live = new LiveRun(options);
  await live.run();
  return live.result();
}

class LiveRun {
  private readonly violations: Violation[] = [];
  private readonly fetchImpl: FetchLike;
  private readonly lookup: LookupLike;
  private readonly timeoutMs: number;
  private readonly base: URL;
  private scannedPages = 0;
  private readonly ran = new Set<string>();

  constructor(private readonly options: LiveOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.lookup = options.lookup ?? dnsLookup;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.base = new URL(options.url);
  }

  async run(): Promise<void> {
    this.ran.add('liveDomain');
    this.progress(`Checking DNS and redirects for ${this.base.hostname}`);
    if (!(await this.checkHosts())) return;

    this.ran.add('liveHttp');
    this.progress('Fetching the homepage');
    const home = await this.get(this.base.href, 'follow');
    if (!home || home.status !== 200) {
      this.add(
        this.base.href,
        'liveHttp',
        'error',
        `Homepage answers ${home ? home.status : 'nothing'}.`,
        'The site is down or misconfigured; nothing else was checked.',
      );
      return;
    }
    const origin = new URL(home.url || this.base.href).origin;
    this.ran.add('liveHeaders');
    this.checkHeaders(home.headers, origin);

    this.progress('Reading robots.txt and the sitemap');
    const sitemapUrls = await this.checkRobotsAndSitemap(origin);
    await this.checkPages([home.url || this.base.href, ...sitemapUrls]);
  }

  result(): LiveResult {
    const violations = this.violations.sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        Number(a.severity === 'warning') - Number(b.severity === 'warning') ||
        a.rule.localeCompare(b.rule),
    );
    const errorCount = countErrors(violations);
    return {
      violations,
      scannedFiles: this.scannedPages,
      errorCount,
      warningCount: violations.length - errorCount,
      score: computeScore(violations, this.scannedPages, this.options.config.score),
      checks: LIVE_CHECKS.map(({ rule, covers }) => {
        const own = violations.filter((v) =>
          rule === 'pageRules' ? !v.rule.startsWith('live') : v.rule === rule,
        );
        const errors = countErrors(own);
        return {
          rule,
          covers,
          ran: rule === 'pageRules' ? this.scannedPages > 0 : this.ran.has(rule),
          errors,
          warnings: own.length - errors,
        };
      }),
    };
  }

  /** DNS for the host and its apex / `www` twin, plus how the twin and `http://` redirect. */
  private async checkHosts(): Promise<boolean> {
    const host = this.base.hostname;
    if (!(await this.resolves(host))) {
      this.add(
        host,
        'liveDomain',
        'error',
        `${host} does not resolve (no A/AAAA record).`,
        'Check the DNS records for the domain.',
      );
      return false;
    }

    const twin = twinHost(host);
    const twinResolves = twin ? await this.resolves(twin) : false;
    if (twin) {
      if (!twinResolves) {
        this.add(
          twin,
          'liveDomain',
          'error',
          `${twin} does not resolve (no A/AAAA record), so every link and type-in using ${twin} fails.`,
          `Add a DNS record for ${twin} and redirect it to ${this.base.origin} (on Cloudflare: a proxied record plus a Redirect Rule, or add it as a custom domain).`,
        );
      } else {
        await this.checkTwinRedirect(twin, host);
      }
    }

    const insecure = await this.get(`http://${host}/`, 'manual');
    if (insecure?.status === 200) {
      this.add(
        host,
        'liveDomain',
        'error',
        `http://${host}/ serves the page instead of redirecting to https.`,
        'Redirect all http traffic to https with a 301 (on Cloudflare: "Always Use HTTPS").',
      );
    } else if (insecure && isRedirect(insecure.status)) {
      const target = location(insecure, `http://${host}/`);
      if (target && target.protocol !== 'https:') {
        this.add(
          host,
          'liveDomain',
          'warning',
          `http://${host}/ redirects to ${target.href}, not to https.`,
          'Redirect http straight to the https URL.',
        );
      }
    }

    const entries = [`http://${host}/`];
    if (twin && twinResolves) entries.push(`http://${twin}/`, `https://${twin}/`);
    for (const entry of entries) await this.checkRedirectChain(entry, host);
    return true;
  }

  /**
   * Follows `url` hop by hop and flags chains: a misconfigured CDN often
   * upgrades to https in one rule and moves to the canonical host in another,
   * so visitors and crawlers pay two round trips where one would do.
   */
  private async checkRedirectChain(url: string, host: string): Promise<void> {
    const chain = [url];
    const seen = new Set(chain);
    let lastResponse: Response | undefined;
    while (chain.length <= MAX_REDIRECTS) {
      const current = chain[chain.length - 1]!;
      const response = await this.get(current, 'manual');
      if (!response || !isRedirect(response.status)) break;
      const next = location(response, current);
      if (!next) break;
      lastResponse = response;
      if (seen.has(next.href)) {
        this.add(
          new URL(url).hostname,
          'liveDomain',
          'error',
          `${url} ends in a redirect loop: ${[...chain, next.href].join(' → ')}.`,
          'Check the redirect rules on your host or CDN (on Cloudflare: SSL/TLS mode "Flexible" behind an https-only origin loops; use "Full (strict)").',
        );
        return;
      }
      seen.add(next.href);
      chain.push(next.href);
    }

    const hops = chain.length - 1;
    if (hops > MAX_REDIRECTS) {
      this.add(
        new URL(url).hostname,
        'liveDomain',
        'error',
        `${url} still redirects after ${MAX_REDIRECTS} hops.`,
        'Check the redirect rules on your host or CDN.',
      );
      return;
    }
    if (hops < 2 || isPreloadUpgrade(chain, lastResponse)) return;

    this.add(
      new URL(url).hostname,
      'liveDomain',
      'warning',
      `${url} takes ${hops} redirects to reach ${chain[hops]}: ${chain.join(' → ')}.`,
      `Redirect every variant straight to https://${host}/ in one hop. On Cloudflare, "Always Use HTTPS" runs before your Redirect Rules; one rule that matches both http and the other host avoids the double hop.`,
    );
  }

  private async checkTwinRedirect(twin: string, host: string): Promise<void> {
    const url = `https://${twin}/`;
    const response = await this.get(url, 'manual');
    if (!response) {
      this.add(
        twin,
        'liveDomain',
        'error',
        `${url} resolves but does not answer over https.`,
        `Serve ${twin} with a valid certificate and redirect it to https://${host}/.`,
      );
      return;
    }
    if (isRedirect(response.status)) {
      const target = location(response, url);
      if (target && target.hostname !== host) {
        this.add(
          twin,
          'liveDomain',
          'warning',
          `${url} redirects to ${target.href} instead of https://${host}/.`,
          'Redirect straight to the canonical host to avoid a redirect chain.',
        );
      }
      if (response.status === 302 || response.status === 307) {
        this.add(
          twin,
          'liveDomain',
          'warning',
          `${url} uses a temporary ${response.status} redirect.`,
          'Use a permanent 301 or 308 so search engines merge both hosts into one.',
        );
      }
      return;
    }
    if (response.status === 200) {
      this.add(
        twin,
        'liveDomain',
        'warning',
        `${url} serves the site as well as https://${host}/ (duplicate content).`,
        `Redirect ${twin} to https://${host}/ with a 301.`,
      );
      return;
    }
    this.add(
      twin,
      'liveDomain',
      'error',
      `${url} answers ${response.status}.`,
      `Add ${twin} to your host (custom domain) or redirect it to https://${host}/.`,
    );
  }

  private checkHeaders(headers: Headers, origin: string): void {
    const file = `${origin}/`;
    const warn = (message: string, hint: string) =>
      this.add(file, 'liveHeaders', 'warning', message, hint);

    const hsts = headers.get('strict-transport-security');
    const maxAge = Number(/max-age\s*=\s*"?(\d+)/i.exec(hsts ?? '')?.[1] ?? NaN);
    if (!hsts) {
      warn(
        'No Strict-Transport-Security (HSTS) header.',
        'Send "Strict-Transport-Security: max-age=31536000; includeSubDomains" (on Cloudflare: SSL/TLS > Edge Certificates > HSTS).',
      );
    } else if (!(maxAge >= MIN_HSTS_MAX_AGE)) {
      warn(
        `Strict-Transport-Security max-age is ${Number.isNaN(maxAge) ? 'missing' : maxAge} (min ${MIN_HSTS_MAX_AGE}, 180 days).`,
        'Raise max-age to at least six months, ideally a year.',
      );
    }

    const csp = headers.get('content-security-policy');
    if (!csp) {
      const reportOnly = headers.has('content-security-policy-report-only');
      warn(
        reportOnly
          ? 'Content-Security-Policy is only sent as Report-Only, so nothing is enforced.'
          : 'No Content-Security-Policy header.',
        `Start from "default-src 'self'" and allow only the hosts your pages use.`,
      );
    }
    if ((headers.get('x-content-type-options') ?? '').toLowerCase() !== 'nosniff') {
      warn('X-Content-Type-Options is not "nosniff".', 'Send "X-Content-Type-Options: nosniff".');
    }
    if (!headers.has('referrer-policy')) {
      warn(
        'No Referrer-Policy header.',
        'Send "Referrer-Policy: strict-origin-when-cross-origin".',
      );
    }
    const framed =
      headers.has('x-frame-options') ||
      splitPolicies(csp).some((p) => parseCsp(p).has('frame-ancestors'));
    if (!framed) {
      warn(
        'Neither X-Frame-Options nor CSP frame-ancestors is set (clickjacking).',
        `Send "X-Frame-Options: DENY" or add "frame-ancestors 'none'" to the CSP.`,
      );
    }
    if (!headers.has('permissions-policy')) {
      warn(
        'No Permissions-Policy header.',
        'Send e.g. "Permissions-Policy: camera=(), microphone=(), geolocation=()".',
      );
    }
  }

  /** Returns the page URLs the live sitemap lists. */
  private async checkRobotsAndSitemap(origin: string): Promise<string[]> {
    const robotsUrl = `${origin}/robots.txt`;
    const robots = await this.get(robotsUrl, 'follow');
    let sitemapCandidates = [`${origin}/sitemap-index.xml`, `${origin}/sitemap.xml`];

    if (!robots || robots.status !== 200) {
      this.add(
        robotsUrl,
        'liveHttp',
        'warning',
        `robots.txt answers ${robots ? robots.status : 'nothing'}.`,
        'Make sure robots.txt is deployed at the site root.',
      );
    } else if (/html/i.test(robots.headers.get('content-type') ?? '')) {
      this.add(
        robotsUrl,
        'liveHttp',
        'warning',
        'robots.txt is served as HTML; the host probably falls back to index.html.',
        'Deploy a real robots.txt (text/plain) at the site root.',
      );
    } else {
      const listed = parseRobotsTxt(await robots.text()).sitemaps;
      if (listed.length > 0) sitemapCandidates = listed;
    }

    const pages: string[] = [];
    const queue = [...sitemapCandidates];
    const seen = new Set<string>();
    let found = false;
    while (queue.length > 0 && seen.size < MAX_SITEMAPS) {
      const url = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);
      const response = await this.get(url, 'follow');
      if (!response || response.status !== 200) continue;
      found = true;
      for (const loc of extractLocs(await response.text())) {
        if (/\.xml(\?|$)/i.test(loc)) queue.push(loc);
        else pages.push(loc);
      }
    }
    if (!found) {
      this.add(
        `${origin}/`,
        'liveHttp',
        'warning',
        'No sitemap is reachable.',
        `Tried ${sitemapCandidates.join(', ')}. List it in robots.txt with a "Sitemap:" line.`,
      );
    }
    return pages;
  }

  private async checkPages(urls: string[]): Promise<void> {
    const max = Math.max(1, this.options.maxPages ?? 20);
    const sample = spread([...new Set(urls)], max);
    const config = liveConfig(this.options.config);
    const cspPages: CspPage[] = [];
    let done = 0;
    this.progress(`Checking pages (0/${sample.length})`);

    await pool(sample, CONCURRENCY, async (url) => {
      const file = new URL(url).pathname;
      const response = await this.get(url, 'follow');
      this.progress(`Checking pages (${++done}/${sample.length})`);
      if (!response || response.status !== 200) {
        this.add(
          file,
          'liveHttp',
          'error',
          `${url} answers ${response ? response.status : 'nothing'}.`,
          'Fix the page or remove it from the sitemap.',
        );
        return;
      }
      this.scannedPages += 1;
      if (response.url && stripHash(response.url) !== stripHash(url)) {
        this.add(
          file,
          'liveHttp',
          'warning',
          `${url} redirects to ${response.url}.`,
          'List the final URL in the sitemap and internal links, not one that redirects.',
        );
      }
      const robotsTag = response.headers.get('x-robots-tag') ?? '';
      if (/noindex/i.test(robotsTag)) {
        this.add(
          file,
          'liveHttp',
          'error',
          `Served with "X-Robots-Tag: ${robotsTag}", so search engines drop it.`,
          'Remove the header for pages that should be indexed.',
        );
      }
      if (!/html/i.test(response.headers.get('content-type') ?? 'text/html')) return;

      const root = parse(await response.text(), {
        lowerCaseTagName: true,
        comment: false,
        blockTextElements: { script: true, noscript: true, style: true, pre: true },
      });
      const ctx: PageContext = {
        file,
        absolutePath: url,
        distPath: '',
        root,
        bodyText: extractVisibleText(root),
        mainText: extractMainText(root),
        siteFiles: new Set(),
        config,
      };
      for (const rule of allRules) this.violations.push(...rule(ctx));

      cspPages.push({
        file,
        pageUrl: new URL(response.url || url),
        policies: splitPolicies(response.headers.get('content-security-policy')),
        resources: collectCspResources(root),
      });
    });

    this.violations.push(
      ...findCspViolations(cspPages, (message, hint) => ({
        file: `${this.base.origin}/`,
        rule: 'liveHeaders',
        severity: 'warning',
        message,
        hint,
      })),
    );
  }

  private progress(message: string): void {
    this.options.onProgress?.(message);
  }

  private async resolves(hostname: string): Promise<boolean> {
    try {
      await this.lookup(hostname);
      return true;
    } catch {
      return false;
    }
  }

  /** One request with a timeout and a single retry; `undefined` when the network fails. */
  private async get(url: string, redirect: 'follow' | 'manual'): Promise<Response | undefined> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.fetchImpl(url, {
          redirect,
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: { 'user-agent': USER_AGENT },
        });
      } catch {
        // Retry once, then report the URL as unreachable.
      }
    }
    return undefined;
  }

  private add(file: string, rule: string, severity: Severity, message: string, hint: string): void {
    this.violations.push({ file, rule, severity, message, hint });
  }
}

/** One aligned line per live check group, so passing checks show up too. */
export function formatLiveChecks(checks: readonly LiveCheck[]): string {
  const rows = checks.map((check): [string, string, (text: string) => string, string] => {
    if (!check.ran) return [check.rule, '– skipped', dim, check.covers];
    if (check.errors > 0) return [check.rule, `✖ ${check.errors} error(s)`, red, check.covers];
    if (check.warnings > 0)
      return [check.rule, `⚠ ${check.warnings} warning(s)`, yellow, check.covers];
    return [check.rule, '✔ passed', green, check.covers];
  });
  const nameWidth = Math.max(...rows.map(([name]) => name.length));
  const statusWidth = Math.max(...rows.map(([, status]) => status.length));
  // Pad before coloring, so escape codes do not skew the columns.
  return rows
    .map(
      ([name, status, color, covers]) =>
        `${name.padEnd(nameWidth)}  ${color(status.padEnd(statusWidth))}  ${dim(covers)}`,
    )
    .join('\n');
}

/** Rules that read the build output make no sense against fetched pages. */
function liveConfig(config: ResolvedConfig): ResolvedConfig {
  return { ...config, rules: { ...config.rules, internalLinks: false, imageSize: false } };
}

/** `www.example.com` ↔ `example.com`; `undefined` for other subdomains. */
export function twinHost(host: string): string | undefined {
  if (host.startsWith('www.')) return host.slice(4);
  if (/^[\d.]+$/.test(host) || host.includes(':')) return undefined;
  return host.split('.').length === 2 ? `www.${host}` : undefined;
}

/**
 * `http://example.com/ → https://example.com/ → https://www.example.com/` is
 * what hstspreload.org requires (upgrade on the same host first), so it is fine
 * when the middle hop sends an HSTS header with `preload`.
 */
function isPreloadUpgrade(chain: string[], lastRedirect: Response | undefined): boolean {
  if (chain.length !== 3 || !lastRedirect) return false;
  const [from, via] = [new URL(chain[0]!), new URL(chain[1]!)];
  const hsts = lastRedirect.headers.get('strict-transport-security') ?? '';
  return (
    from.protocol === 'http:' &&
    via.protocol === 'https:' &&
    from.hostname === via.hostname &&
    /\bpreload\b/i.test(hsts)
  );
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function location(response: Response, from: string): URL | undefined {
  const value = response.headers.get('location');
  if (!value) return undefined;
  try {
    return new URL(value, from);
  } catch {
    return undefined;
  }
}

function splitPolicies(value: string | null): string[] {
  // Multiple CSP headers arrive comma-joined; commas never occur inside a policy.
  return (value ?? '')
    .split(',')
    .map((policy) => policy.trim())
    .filter(Boolean);
}

function stripHash(url: string): string {
  return url.replace(/#.*$/, '');
}

/** The first item, then an even spread over the rest, `max` in total. */
function spread<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const [first, ...rest] = items;
  const step = rest.length / (max - 1);
  const picked = Array.from({ length: max - 1 }, (_, i) => rest[Math.floor(i * step)]!);
  return [first!, ...picked];
}

async function pool<T>(items: T[], size: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await task(items[next++]!);
  });
  await Promise.all(workers);
}
