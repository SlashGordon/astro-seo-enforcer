import type { Rule, Violation } from '../types.js';
import { tag, walkElements } from '../util/dom.js';
import { isExcluded } from '../util/exclude.js';

interface Tracker {
  name: string;
  /** Hosts (and their subdomains) the tracker loads from. */
  hosts: string[];
  /** Matches the tracker's inline snippet. */
  inline: RegExp;
}

const TRACKERS: Tracker[] = [
  {
    name: 'Google Analytics / Tag Manager',
    hosts: ['googletagmanager.com', 'google-analytics.com', 'analytics.google.com'],
    inline: /\bgtag\s*\(|\bga\s*\(\s*['"]create['"]|googletagmanager\.com|google-analytics\.com/,
  },
  {
    name: 'Google Ads',
    hosts: ['googleadservices.com', 'googlesyndication.com', 'doubleclick.net'],
    inline: /googleadservices\.com|googlesyndication\.com|doubleclick\.net/,
  },
  {
    name: 'Meta Pixel',
    hosts: ['connect.facebook.net'],
    inline: /\bfbq\s*\(\s*['"]init['"]|connect\.facebook\.net/,
  },
  { name: 'Hotjar', hosts: ['hotjar.com'], inline: /static\.hotjar\.com/ },
  { name: 'Microsoft Clarity', hosts: ['clarity.ms'], inline: /clarity\.ms\/tag/ },
  {
    name: 'LinkedIn Insight Tag',
    hosts: ['snap.licdn.com', 'px.ads.linkedin.com'],
    inline: /_linkedin_partner_id|snap\.licdn\.com/,
  },
  { name: 'TikTok Pixel', hosts: ['analytics.tiktok.com'], inline: /analytics\.tiktok\.com/ },
  {
    name: 'Yandex Metrica',
    hosts: ['mc.yandex.ru', 'mc.yandex.com'],
    inline: /mc\.yandex\.(ru|com)/,
  },
];

const GOOGLE_FONTS_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const EXECUTABLE_SCRIPT = /^((text|application)\/(x-)?(java|ecma)script|module|text\/partytown)$/i;
const CSS_URL = /@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)|url\(\s*['"]?([^'")\s]+)/gi;
// Stands in for the page's own origin when the site URL is unknown.
const LOCAL_BASE = 'https://first-party.invalid/';

/**
 * Flags what a page sends to third parties before the visitor has agreed to
 * anything: trackers without a consent banner (§ 25 TDDDG, Art. 6 DSGVO),
 * Google Fonts and other hot-linked fonts, embeds and any other script,
 * stylesheet, image or preconnect on a foreign host. Each of those requests
 * hands the visitor's IP address to that host.
 */
export const gdprRule: Rule = (ctx) => {
  const options = ctx.config.rules.gdpr;
  if (!options || isExcluded(ctx.file, options.ignore)) return [];

  const siteHost = hostOf(ctx.site);
  const trackers = new Set<string>();
  const thirdParty = new Map<string, Set<string>>();
  let googleFonts = false;
  let consent = false;

  const addUrl = (raw: string | undefined, kind: string): void => {
    const value = raw?.trim();
    if (!value) return;
    if (test(options.consent, value)) {
      consent = true;
      return;
    }
    const host = foreignHost(value, siteHost);
    if (!host || options.allowedHosts.some((allowed) => hostAllowed(host, allowed))) return;

    const tracker = TRACKERS.find((candidate) =>
      candidate.hosts.some((trackerHost) => hostMatches(host, trackerHost)),
    );
    if (tracker) trackers.add(tracker.name);
    else if (GOOGLE_FONTS_HOSTS.includes(host)) googleFonts = true;
    else if (options.checkThirdParty) {
      const kinds = thirdParty.get(host) ?? new Set<string>();
      kinds.add(kind);
      thirdParty.set(host, kinds);
    }
  };

  const addCss = (css: string): void => {
    for (const match of css.matchAll(CSS_URL)) addUrl(match[1] ?? match[2], 'CSS resource');
  };

  for (const element of walkElements(ctx.root)) {
    const name = tag(element);
    const marker = `${element.getAttribute('id') ?? ''} ${element.getAttribute('class') ?? ''}`;
    if (marker.trim() && test(options.consent, marker)) consent = true;
    const style = element.getAttribute('style');
    if (style) addCss(style);

    if (name === 'script') {
      // `type="text/plain"` and friends are how consent managers hold scripts back.
      const type = element.getAttribute('type')?.trim() ?? '';
      if (type && !EXECUTABLE_SCRIPT.test(type)) continue;
      const src = element.getAttribute('src');
      if (src !== undefined) {
        addUrl(src, 'script');
        continue;
      }
      const code = element.rawText;
      if (test(options.consent, code)) consent = true;
      for (const tracker of TRACKERS) if (tracker.inline.test(code)) trackers.add(tracker.name);
    } else if (name === 'style') {
      addCss(element.rawText);
    } else if (name === 'link') {
      const rel = (element.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
      const href = element.getAttribute('href');
      if (rel.includes('stylesheet')) addUrl(href, 'stylesheet');
      else if (rel.includes('modulepreload')) addUrl(href, 'script');
      else if (rel.includes('preload') || rel.includes('prefetch')) {
        addUrl(href, element.getAttribute('as')?.toLowerCase() || 'preload');
      } else if (rel.includes('preconnect')) addUrl(href, 'preconnect');
      else if (rel.includes('icon')) addUrl(href, 'image');
    } else if (name === 'img' || name === 'source') {
      const media = name === 'source' && element.parentNode?.tagName?.toLowerCase() !== 'picture';
      addUrl(element.getAttribute('src'), media ? 'media' : 'image');
      for (const url of srcsetUrls(element.getAttribute('srcset'))) addUrl(url, 'image');
    } else if (name === 'video' || name === 'audio' || name === 'track') {
      addUrl(element.getAttribute('src'), 'media');
      if (name === 'video') addUrl(element.getAttribute('poster'), 'image');
    } else if (name === 'iframe') {
      addUrl(element.getAttribute('src'), 'iframe');
    }
  }

  const violations: Violation[] = [];
  const report = (message: string, hint: string): void => {
    violations.push({ file: ctx.file, rule: 'gdpr', severity: options.severity, message, hint });
  };

  if (!consent) {
    for (const tracker of trackers) {
      report(
        `${tracker} runs on page load, but the page has no consent banner.`,
        'Load it only after opt-in consent (§ 25 TDDDG, Art. 6 DSGVO), e.g. through a consent manager. For a custom banner, extend the `consent` pattern so it is recognised.',
      );
    }
  }
  if (googleFonts) {
    report(
      'Loads Google Fonts from Google’s servers, which sends every visitor’s IP address to Google.',
      'Self-host the font files (LG München I, 3 O 17493/20).',
    );
  }
  for (const [host, kinds] of thirdParty) {
    const list = [...kinds].join(', ');
    report(
      `Loads ${list} from ${host} without consent, which sends every visitor’s IP address to that host.`,
      kinds.has('iframe')
        ? 'Replace the embed with a click-to-load placeholder, or add the host to `allowedHosts` if consent or a data processing agreement covers it.'
        : 'Self-host the file, or add the host to `allowedHosts` if consent or a data processing agreement covers it.',
    );
  }
  return violations;
};

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/** The host `url` loads from, or `undefined` for the page's own site and non-http URLs. */
function foreignHost(url: string, siteHost: string | undefined): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url, LOCAL_BASE);
  } catch {
    return undefined;
  }
  if (!/^https?:$/.test(parsed.protocol)) return undefined;
  const host = parsed.hostname.toLowerCase();
  if (host === 'first-party.invalid') return undefined;
  if (siteHost && stripWww(host) === stripWww(siteHost)) return undefined;
  return host;
}

function stripWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

/** `host` is `domain` or one of its subdomains. */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function hostAllowed(host: string, allowed: string | RegExp): boolean {
  return allowed instanceof RegExp ? test(allowed, host) : hostMatches(host, allowed.toLowerCase());
}

function test(pattern: RegExp, value: string): boolean {
  // A global or sticky RegExp keeps `lastIndex` between calls.
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function srcsetUrls(srcset: string | undefined): string[] {
  if (!srcset) return [];
  return srcset
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean);
}
