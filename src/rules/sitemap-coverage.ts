import type { SitemapCoverageRuleOptions } from '../config.js';
import type { Violation } from '../types.js';
import { matchOutputFile, resolveInternalPath } from '../util/links.js';

/** One parsed `sitemap*.xml` file: its path plus every `<loc>` it contains. */
export interface SitemapDoc {
  /** Dist-relative POSIX path of the sitemap file. */
  file: string;
  /** Raw `<loc>` values (page URLs and, for a sitemap index, sub-sitemap URLs). */
  locs: string[];
}

/** Everything {@link findSitemapCoverage} needs, assembled by the runner. */
export interface SitemapCoverageInput {
  sitemaps: readonly SitemapDoc[];
  /** Every output path (pages + assets), dist-relative POSIX. */
  siteFiles: ReadonlySet<string>;
  /** Every scanned (non-excluded) HTML page. */
  pages: readonly string[];
  /** Pages carrying a robots `noindex` directive. */
  noindexPages: ReadonlySet<string>;
}

export interface SitemapCoverageResult {
  violations: Violation[];
  /** Output files a sitemap resolves to — reused for orphan-page detection. */
  sitemapFiles: Set<string>;
}

/**
 * Cross-checks the build output against its XML sitemap(s):
 *
 * - every `<loc>` must resolve to a file that exists,
 * - every indexable page should appear in a sitemap (`requireInSitemap`),
 * - a page must not be both `noindex` and listed in a sitemap.
 *
 * Pull `<loc>` values out of a sitemap file with {@link extractLocs}.
 */
export function findSitemapCoverage(
  input: SitemapCoverageInput,
  options: SitemapCoverageRuleOptions,
): SitemapCoverageResult {
  const violations: Violation[] = [];
  const sitemapFiles = new Set<string>();

  if (input.sitemaps.length === 0) {
    if (options.requireInSitemap && input.pages.length > 0) {
      violations.push({
        file: input.pages[0]!,
        rule: 'sitemapCoverage',
        severity: options.severity,
        message: 'No sitemap*.xml found in the build output.',
        hint: 'Add @astrojs/sitemap so every page ships in an XML sitemap, or set `requireInSitemap: false`.',
      });
    }
    return { violations, sitemapFiles };
  }

  for (const doc of input.sitemaps) {
    for (const loc of doc.locs) {
      let pathname = loc;
      try {
        pathname = new URL(loc).pathname;
      } catch {
        // A relative <loc> — use it as-is.
      }
      const match = matchOutputFile(resolveInternalPath(pathname, 'index.html'), input.siteFiles);
      if (match === undefined) {
        violations.push({
          file: doc.file,
          rule: 'sitemapCoverage',
          severity: options.severity,
          message: `Sitemap lists "${loc}" but no matching page or file exists in the build output.`,
          hint: 'Remove stale URLs from the sitemap, or check the trailing slash and casing.',
        });
        continue;
      }
      sitemapFiles.add(match);
    }
  }

  for (const file of sitemapFiles) {
    if (input.noindexPages.has(file)) {
      violations.push({
        file,
        rule: 'sitemapCoverage',
        severity: options.severity,
        message: 'This page is listed in a sitemap but carries a robots "noindex" directive.',
        hint: 'Drop it from the sitemap or remove the noindex — the two directives contradict each other.',
      });
    }
  }

  if (options.requireInSitemap) {
    for (const file of input.pages) {
      if (sitemapFiles.has(file)) continue;
      if (input.noindexPages.has(file)) continue;
      if (isIgnored(file, options.ignore)) continue;
      violations.push({
        file,
        rule: 'sitemapCoverage',
        severity: options.severity,
        message: 'Indexable page missing from every sitemap*.xml.',
        hint: 'Add it to your sitemap, or noindex it if it should not appear in search results.',
      });
    }
  }

  return { violations, sitemapFiles };
}

/** Pull the text of every `<loc>` element out of a sitemap XML string. */
export function extractLocs(xml: string): string[] {
  const locs: string[] = [];
  const pattern = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const value = decodeXmlEntities(match[1]!.trim());
    if (value.length > 0) locs.push(value);
  }
  return locs;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

function isIgnored(file: string, patterns: Array<string | RegExp>): boolean {
  return patterns.some((pattern) =>
    typeof pattern === 'string'
      ? pattern === file || file.startsWith(pattern.endsWith('/') ? pattern : `${pattern}/`)
      : pattern.test(file),
  );
}
