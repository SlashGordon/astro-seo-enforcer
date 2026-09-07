import type { HTMLElement } from 'node-html-parser';
import type { Rule, Violation } from '../types.js';
import { tag, walkElements } from '../util/dom.js';
import {
  classifyHref,
  isDocumentTop,
  matchOutputFile,
  resolveInternalPath,
} from '../util/links.js';

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
    severity: options.fragmentSeverity,
    message: `Broken fragment link "${href}" — nothing with id="${fragment}" (or <a name="${fragment}">) on this page.`,
    hint: 'Fix the anchor, or add the matching id to the target element. Anchors added by client-side JavaScript are not in the built HTML — set `checkFragments: false` if the page hydrates its own targets.',
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
