import path from 'node:path';
import type { HTMLElement } from 'node-html-parser';

/**
 * How an `<a href>` value routes once the site is served as static files.
 * `skip` covers everything out of scope for the internal-link checks
 * (external URLs, `mailto:`, `href="#"`, query-only links, …).
 */
export type HrefTarget =
  | { kind: 'skip' }
  | { kind: 'fragment'; fragment: string }
  | { kind: 'path'; pathname: string; fragment: string | undefined };

/** Split an `href` into a routable path + fragment, or mark it as out of scope. */
export function classifyHref(href: string): HrefTarget {
  if (href === '#') return { kind: 'skip' };
  if (href.startsWith('#')) return { kind: 'fragment', fragment: safeDecode(href.slice(1)) };

  // Any explicit scheme (http:, https:, mailto:, tel:, data:, javascript:, …).
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { kind: 'skip' };
  // Protocol-relative external URL (//host/…).
  if (href.startsWith('//')) return { kind: 'skip' };

  const hashIndex = href.indexOf('#');
  const beforeHash = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? undefined : safeDecode(href.slice(hashIndex + 1));

  const queryIndex = beforeHash.indexOf('?');
  const pathname = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);

  if (pathname.length === 0) {
    // "?q=…" or "#frag" relative to the current page.
    return fragment === undefined ? { kind: 'skip' } : { kind: 'fragment', fragment };
  }

  return { kind: 'path', pathname, fragment };
}

/** `#` and `#top` always resolve to the top of the document. */
export function isDocumentTop(fragment: string): boolean {
  return fragment === '' || fragment.toLowerCase() === 'top';
}

export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Resolve a link `pathname` to a POSIX path relative to the build output root,
 * the way a static file host would. `currentFile` is the page the link sits on
 * (also a dist-relative POSIX path).
 */
export function resolveInternalPath(pathname: string, currentFile: string): string {
  const decoded = pathname
    .split('/')
    .map((segment) => safeDecode(segment))
    .join('/');

  const rooted = decoded.startsWith('/')
    ? decoded
    : path.posix.join('/', path.posix.dirname(`/${currentFile}`), decoded);

  // `normalize` keeps a trailing slash, which we need to tell "/dir/" from "/file".
  const normalized = path.posix.normalize(rooted);
  return normalized.replace(/^\/+/, '');
}

/** Return the output file a resolved path serves, or `undefined` when none exists. */
export function matchOutputFile(rel: string, siteFiles: ReadonlySet<string>): string | undefined {
  const candidates =
    rel === '' || rel.endsWith('/')
      ? [`${rel}index.html`]
      : [rel, `${rel}.html`, `${rel}/index.html`];

  for (const candidate of candidates) {
    if (siteFiles.has(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Every output file reachable from this document via an internal `<a href>`,
 * resolved the way a static host serves files. Used to build the site-wide
 * link graph for orphan-page detection — fragments, external links and
 * unresolvable paths are simply left out.
 */
export function collectLinkTargets(
  root: HTMLElement,
  file: string,
  siteFiles: ReadonlySet<string>,
): Set<string> {
  const targets = new Set<string>();

  for (const anchor of root.querySelectorAll('a')) {
    const rawHref = anchor.getAttribute('href');
    if (rawHref == null) continue;
    const href = rawHref.trim();
    if (href.length === 0) continue;

    const target = classifyHref(href);
    if (target.kind !== 'path') continue;

    const match = matchOutputFile(resolveInternalPath(target.pathname, file), siteFiles);
    if (match !== undefined) targets.add(match);
  }

  return targets;
}
