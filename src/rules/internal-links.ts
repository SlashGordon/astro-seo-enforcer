import path from 'node:path';
import type { HTMLElement } from 'node-html-parser';
import type { Rule, Violation } from '../types.js';
import { tag, walkElements } from '../util/dom.js';

/**
 * Catches broken **internal** links: `<a href>` values that point at a page or
 * asset which does not exist in the build output, and (with `checkFragments`)
 * same-page `#fragment` links with no matching `id` / `<a name>`.
 *
 * A link is resolved against the generated files on disk the same way a static
 * host would serve them: a directory URL (`/blog/` or `/blog`) maps to
 * `blog/index.html`, an extensionless URL also tries `<path>.html`, and a URL
 * with an extension must match a file exactly.
 *
 * External links (`http(s)://`, `//host/…`, `mailto:`, `tel:`, …), query-only
 * and `href="#"` links are ignored. Cross-page fragments are not resolved —
 * only the target page's existence is checked.
 */
export const internalLinksRule: Rule = (ctx) => {
  const options = ctx.config.rules.internalLinks;
  if (!options) return [];

  const violations: Violation[] = [];

  // Anchor targets (`id` / `<a name>`) of the current document — built on demand.
  let currentAnchors: Set<string> | undefined;
  const anchorsHere = (): Set<string> => (currentAnchors ??= collectAnchorNames(ctx.root));

  const fragmentViolation = (href: string, fragment: string): Violation => ({
    file: ctx.file,
    rule: 'internalLinks',
    severity: options.severity,
    message: `Broken fragment link "${href}" — nothing with id="${fragment}" (or <a name="${fragment}">) on this page.`,
    hint: 'Fix the anchor, or add the matching id to the target element.',
  });

  for (const anchor of ctx.root.querySelectorAll('a')) {
    const rawHref = anchor.getAttribute('href');
    if (rawHref == null) continue;
    const href = rawHref.trim();
    if (href.length === 0) continue;
    if (isIgnored(href, options.ignore)) continue;

    const target = classifyHref(href);
    if (target.kind === 'skip') continue;

    if (target.kind === 'fragment') {
      if (
        options.checkFragments &&
        !isDocumentTop(target.fragment) &&
        !anchorsHere().has(target.fragment)
      ) {
        violations.push(fragmentViolation(href, target.fragment));
      }
      continue;
    }

    const rel = resolveInternalPath(target.pathname, ctx.file);
    const match = matchOutputFile(rel, ctx.siteFiles);

    if (match === undefined) {
      violations.push({
        file: ctx.file,
        rule: 'internalLinks',
        severity: options.severity,
        message: `Broken internal link "${href}" — no page or asset at "${target.pathname}" in the build output.`,
        hint: 'Check the path, trailing slash and casing — links are resolved against the generated files on disk.',
      });
      continue;
    }

    // Only same-page fragments can be resolved without parsing the target page.
    if (
      options.checkFragments &&
      target.fragment !== undefined &&
      !isDocumentTop(target.fragment) &&
      match === ctx.file &&
      !anchorsHere().has(target.fragment)
    ) {
      violations.push(fragmentViolation(href, target.fragment));
    }
  }

  return violations;
};

type HrefTarget =
  | { kind: 'skip' }
  | { kind: 'fragment'; fragment: string }
  | { kind: 'path'; pathname: string; fragment: string | undefined };

/** Split an `href` into a routable path + fragment, or mark it as out of scope. */
function classifyHref(href: string): HrefTarget {
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
function isDocumentTop(fragment: string): boolean {
  return fragment === '' || fragment.toLowerCase() === 'top';
}

function safeDecode(value: string): string {
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
function resolveInternalPath(pathname: string, currentFile: string): string {
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
function matchOutputFile(rel: string, siteFiles: ReadonlySet<string>): string | undefined {
  const candidates =
    rel === '' || rel.endsWith('/')
      ? [`${rel}index.html`]
      : [rel, `${rel}.html`, `${rel}/index.html`];

  for (const candidate of candidates) {
    if (siteFiles.has(candidate)) return candidate;
  }
  return undefined;
}

/** Every `id` value and `<a name>` value in the document. */
function collectAnchorNames(root: HTMLElement): Set<string> {
  const names = new Set<string>();
  for (const element of walkElements(root)) {
    const id = element.getAttribute('id');
    if (id) names.add(id);
    if (tag(element) === 'a') {
      const name = element.getAttribute('name');
      if (name) names.add(name);
    }
  }
  return names;
}

function isIgnored(href: string, patterns: Array<string | RegExp>): boolean {
  return patterns.some((pattern) =>
    typeof pattern === 'string' ? pattern === href : pattern.test(href),
  );
}
