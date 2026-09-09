import type { OrphanPagesRuleOptions } from '../config.js';
import type { Violation } from '../types.js';

/** Everything {@link findOrphanPages} needs, assembled by the runner. */
export interface OrphanPagesInput {
  /** Every scanned (non-excluded) HTML page, as dist-relative POSIX paths. */
  pages: readonly string[];
  /** Output files at least one page links to via an internal `<a href>`. */
  linkedFiles: ReadonlySet<string>;
  /** Output files listed in a sitemap — also counted as reachable. */
  sitemapFiles: ReadonlySet<string>;
}

/**
 * Flags HTML pages that nothing in the build links to and no sitemap advertises.
 * Programmatic page sets routinely leave individual spokes with no inbound link
 * when a hub or pagination step is missed — crawlers may never find them and
 * they accrue no internal link equity.
 */
export function findOrphanPages(
  input: OrphanPagesInput,
  options: OrphanPagesRuleOptions,
): Violation[] {
  const entryPoints = new Set(options.entryPoints);
  const violations: Violation[] = [];

  for (const file of input.pages) {
    if (entryPoints.has(file)) continue;
    if (input.linkedFiles.has(file)) continue;
    if (input.sitemapFiles.has(file)) continue;
    if (isIgnored(file, options.ignore)) continue;

    violations.push({
      file,
      rule: 'orphanPages',
      severity: options.severity,
      message: 'Orphan page: no other page in the build links to it and no sitemap lists it.',
      hint: 'Link to it from a hub or section page, add it to a sitemap, or remove it if it should not be indexed.',
    });
  }

  return violations;
}

function isIgnored(file: string, patterns: Array<string | RegExp>): boolean {
  return patterns.some((pattern) =>
    typeof pattern === 'string'
      ? pattern === file || file.startsWith(pattern.endsWith('/') ? pattern : `${pattern}/`)
      : pattern.test(file),
  );
}
