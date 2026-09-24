import type { SecurityHeadersRuleOptions } from '../config.js';
import type { Violation } from '../types.js';
import { cspHash, evaluateCsp, parseCsp } from '../util/csp.js';
import type { CspResource } from '../util/csp.js';
import { urlPathsForFile } from '../util/links.js';

export interface HeadersBlock {
  /** URL path pattern, e.g. `/*` or `/blog/:slug`. */
  pattern: string;
  /** `value: null` detaches a header set by an earlier block (`! Name`). */
  headers: Array<{ name: string; value: string | null }>;
}

/** Parse a Netlify / Cloudflare Pages `_headers` file. */
export function parseHeadersFile(text: string): HeadersBlock[] {
  const blocks: HeadersBlock[] = [];
  let current: HeadersBlock | undefined;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    if (!/^\s/.test(raw)) {
      current = { pattern: line, headers: [] };
      blocks.push(current);
      continue;
    }
    if (!current) continue;

    if (line.startsWith('!')) {
      current.headers.push({ name: line.slice(1).trim().toLowerCase(), value: null });
      continue;
    }
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    current.headers.push({
      name: line.slice(0, colon).trim().toLowerCase(),
      value: line.slice(colon + 1).trim(),
    });
  }

  return blocks;
}

/** Headers (lower-cased names) the blocks apply to `urlPath`; repeats are kept. */
export function headersForPath(blocks: HeadersBlock[], urlPath: string): Map<string, string[]> {
  const headers = new Map<string, string[]>();
  for (const block of blocks) {
    if (!patternToRegExp(block.pattern).test(urlPath)) continue;
    for (const { name, value } of block.headers) {
      if (value === null) headers.delete(name);
      else headers.set(name, [...(headers.get(name) ?? []), value]);
    }
  }
  return headers;
}

function patternToRegExp(pattern: string): RegExp {
  const pathOnly = pattern.replace(/^https?:\/\/[^/]+/i, '') || '/';
  const body = pathOnly
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/:[A-Za-z_]\w*/g, '[^/]+');
  return new RegExp(`^${body}$`);
}

export interface SecurityHeadersInput {
  /** Contents of the headers file, or `undefined` when the build has none. */
  headersFile: string | undefined;
  /** Every scanned page with the resources it loads (only needed for `checkCsp`). */
  pages: ReadonlyArray<{ file: string; resources: readonly CspResource[] }>;
  /** Astro's `site` URL, so absolute links to it count as `'self'`. */
  site: string | undefined;
}

/**
 * Checks the `_headers` file: the headers in `requiredHeaders` and some form
 * of framing protection apply to `/`, and every page's resources pass the
 * Content-Security-Policy that applies to it.
 */
export function findSecurityHeaderIssues(
  input: SecurityHeadersInput,
  options: SecurityHeadersRuleOptions,
): Violation[] {
  const report = (message: string, hint: string): Violation => ({
    file: options.file,
    rule: 'securityHeaders',
    severity: options.severity,
    message,
    hint,
  });

  if (input.headersFile === undefined) {
    return [
      report(
        `No ${options.file} file in the build output.`,
        `Add public/${options.file} with a "/*" block that sets your security headers, or point \`file\` at your headers file.`,
      ),
    ];
  }

  const blocks = parseHeadersFile(input.headersFile);
  const violations: Violation[] = [];
  const rootHeaders = headersForPath(blocks, '/');

  for (const name of options.requiredHeaders) {
    if (!rootHeaders.has(name.toLowerCase())) {
      violations.push(
        report(
          `Header "${name}" is not set for "/".`,
          `Add it to the "/*" block in ${options.file}.`,
        ),
      );
    }
  }

  if (options.requireFrameProtection) {
    const csp = rootHeaders.get('content-security-policy') ?? [];
    const framed =
      rootHeaders.has('x-frame-options') ||
      csp.some((value) => parseCsp(value).has('frame-ancestors'));
    if (!framed) {
      violations.push(
        report(
          'Nothing stops other sites from framing your pages (clickjacking).',
          `Add "X-Frame-Options: DENY" or a CSP "frame-ancestors 'none'" to ${options.file}.`,
        ),
      );
    }
  }

  if (options.checkCsp) violations.push(...findCspBlocks(input, blocks, report));
  return violations;
}

function findCspBlocks(
  input: SecurityHeadersInput,
  blocks: HeadersBlock[],
  report: (message: string, hint: string) => Violation,
): Violation[] {
  const origin = siteOrigin(input.site);
  return findCspViolations(
    input.pages.map((page) => {
      const urlPath = urlPathsForFile(page.file)[0]!;
      return {
        file: page.file,
        pageUrl: new URL(urlPath, origin),
        policies: headersForPath(blocks, urlPath).get('content-security-policy') ?? [],
        resources: page.resources,
      };
    }),
    report,
  );
}

/** One page's CSP header values and the resources it loads. */
export interface CspPage {
  file: string;
  pageUrl: URL;
  /** Every `Content-Security-Policy` value served for the page; all are enforced. */
  policies: readonly string[];
  resources: readonly CspResource[];
}

/**
 * Checks each page's resources against its CSPs. A blocked source is reported
 * once for the whole site, naming the first page it appears on.
 */
export function findCspViolations(
  pages: readonly CspPage[],
  report: (message: string, hint: string) => Violation,
): Violation[] {
  const findings = new Map<string, { message: string; hint: string; pages: string[] }>();

  for (const page of pages) {
    const policies = page.policies.map(parseCsp);
    if (policies.length === 0) continue;

    for (const resource of page.resources) {
      const decision = policies
        .map((policy) => evaluateCsp(policy, resource, page.pageUrl))
        .find((result) => !result.allowed);
      if (!decision) continue;

      const { key, message, hint } = describe(resource, decision.directive, page.pageUrl);
      const finding = findings.get(key) ?? { message, hint, pages: [] };
      if (!finding.pages.includes(page.file)) finding.pages.push(page.file);
      findings.set(key, finding);
    }
  }

  return [...findings.values()].map(({ message, hint, pages }) => {
    const others = pages.length > 1 ? ` and ${pages.length - 1} other page(s)` : '';
    return report(`${message} on ${pages[0]}${others}.`, hint);
  });
}

function describe(
  resource: CspResource,
  directive: string,
  pageUrl: URL,
): { key: string; message: string; hint: string } {
  if (resource.kind === 'inline') {
    const isAttribute = resource.directive.endsWith('-attr');
    const hash = cspHash(resource.content);
    return {
      key: `${directive}|inline|${isAttribute ? resource.element : hash}`,
      message: `Content-Security-Policy "${directive}" blocks an inline ${resource.element}`,
      hint: isAttribute
        ? `Add 'unsafe-inline' to ${directive}, or move the inline code into a file.`
        : `Add '${hash}' (or 'unsafe-inline') to ${directive}.`,
    };
  }

  const url = new URL(resource.url, pageUrl);
  const source = /^https?:$/.test(url.protocol) ? url.origin : url.protocol;
  return {
    key: `${directive}|${source}`,
    message: `Content-Security-Policy "${directive}" blocks ${resource.element} "${truncateUrl(resource.url)}"`,
    hint:
      source === pageUrl.origin
        ? `Add 'self' to ${directive}.`
        : `Add ${source} to ${directive}, or stop loading it.`,
  };
}

function truncateUrl(url: string): string {
  return url.length > 80 ? `${url.slice(0, 79)}…` : url;
}

function siteOrigin(site: string | undefined): string {
  try {
    if (site) return new URL(site).origin;
  } catch {
    // Fall through to the placeholder.
  }
  return 'https://site.invalid';
}
