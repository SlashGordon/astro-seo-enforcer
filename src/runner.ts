import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';
import type { HTMLElement } from 'node-html-parser';
import type { ResolvedConfig } from './config.js';
import { DEFAULT_SITEMAP_COVERAGE } from './config.js';
import type { PageContext, Violation } from './types.js';
import { allRules } from './rules/index.js';
import { findDuplicateContent } from './rules/duplicate-content.js';
import { findDuplicateValues } from './rules/duplicate-values.js';
import type { DuplicateValuesPage } from './rules/duplicate-values.js';
import { extractSingleH1 } from './rules/heading-hierarchy.js';
import { extractMetaDescription } from './rules/meta-description.js';
import { findOrphanPages } from './rules/orphan-pages.js';
import { extractLocs, findSitemapCoverage } from './rules/sitemap-coverage.js';
import type { SitemapDoc } from './rules/sitemap-coverage.js';
import { extractTitle } from './rules/title.js';
import { computeScore } from './score.js';
import type { SeoScore } from './score.js';
import { extractMainText, extractVisibleText } from './util/dom.js';
import { collectLinkTargets } from './util/links.js';
import { isExcluded } from './util/exclude.js';
import { countErrors } from './util/violations.js';

export interface RunOptions {
  /** Absolute path of the directory that holds the generated `.html` files. */
  distPath: string;
  config: ResolvedConfig;
}

export interface RunResult {
  violations: Violation[];
  scannedFiles: number;
  errorCount: number;
  warningCount: number;
  score: SeoScore;
}

const SITEMAP_FILE = /(^|\/)sitemap[^/]*\.xml$/i;

/** Parse every HTML file under `distPath` and run all enabled rules against it. */
export async function runSeoChecks({ distPath, config }: RunOptions): Promise<RunResult> {
  const allFiles = await collectFiles(distPath);
  // Every output path (pages + assets), so rules can resolve internal links.
  const siteFiles = new Set(
    allFiles.map((absolutePath) => toPosix(path.relative(distPath, absolutePath))),
  );
  const files = allFiles.filter((absolutePath) => absolutePath.toLowerCase().endsWith('.html'));
  const violations: Violation[] = [];

  const { rules } = config;
  // Extracted value per page, kept only when its rule's `checkDuplicates` option is on.
  const titlePages: DuplicateValuesPage[] = [];
  const metaDescriptionPages: DuplicateValuesPage[] = [];
  const h1Pages: DuplicateValuesPage[] = [];
  // Visible text per page, kept only when the duplicateContent rule is enabled.
  const contentPages: Array<{ file: string; text: string }> = [];
  const scannedPages: string[] = [];
  const noindexPages = new Set<string>();
  const linkedFiles = new Set<string>();

  const wantOrphan = rules.orphanPages !== false;
  const wantSitemap = rules.sitemapCoverage !== false;

  for (const absolutePath of files) {
    const file = toPosix(path.relative(distPath, absolutePath));
    if (isExcluded(file, config.exclude)) continue;
    scannedPages.push(file);

    let html: string;
    try {
      html = await fs.readFile(absolutePath, 'utf8');
    } catch (error) {
      violations.push({
        file,
        rule: 'io',
        severity: 'error',
        message: `Unable to read file: ${(error as Error).message}`,
      });
      continue;
    }

    let root: HTMLElement;
    try {
      root = parse(html, {
        lowerCaseTagName: true,
        comment: false,
        // Keep the raw text of these elements instead of parsing it as markup.
        blockTextElements: { script: true, noscript: true, style: true, pre: true },
      });
    } catch (error) {
      violations.push({
        file,
        rule: 'parse',
        severity: 'error',
        message: `Unable to parse HTML: ${(error as Error).message}`,
      });
      continue;
    }

    const ctx: PageContext = {
      file,
      absolutePath,
      distPath,
      root,
      bodyText: extractVisibleText(root),
      mainText: extractMainText(root),
      siteFiles,
      config,
    };

    for (const rule of allRules) {
      try {
        violations.push(...rule(ctx));
      } catch (error) {
        violations.push({
          file,
          rule: 'internal',
          severity: 'error',
          message: `Rule threw an exception: ${(error as Error).message}`,
        });
      }
    }

    const duplicateContentOptions = rules.duplicateContent;
    if (duplicateContentOptions) {
      const scoped = duplicateContentOptions.scopeToMain && ctx.mainText !== undefined;
      contentPages.push({ file, text: scoped ? (ctx.mainText as string) : ctx.bodyText });
    }

    // Collect values so cross-page duplicates can be reported once all files are in.
    if (rules.title && rules.title.checkDuplicates) {
      titlePages.push({ file, value: extractTitle(root) });
    }
    if (rules.metaDescription && rules.metaDescription.checkDuplicates) {
      metaDescriptionPages.push({ file, value: extractMetaDescription(root) });
    }
    if (rules.headingHierarchy && rules.headingHierarchy.checkDuplicateH1) {
      h1Pages.push({ file, value: extractSingleH1(root) });
    }

    if ((wantSitemap || wantOrphan) && hasNoindex(root)) noindexPages.add(file);
    if (wantOrphan) {
      for (const target of collectLinkTargets(root, file, siteFiles)) linkedFiles.add(target);
    }
  }

  violations.push(
    ...findDuplicateValues(titlePages, {
      rule: 'title',
      severity: 'error',
      label: 'Duplicate <title>',
      hint: 'Give every page a unique <title>.',
    }),
    ...findDuplicateValues(metaDescriptionPages, {
      rule: 'metaDescription',
      severity: 'warning',
      label: 'Duplicate <meta name="description">',
      hint: 'Write a description that reflects each page individually.',
    }),
    ...findDuplicateValues(h1Pages, {
      rule: 'headingHierarchy',
      severity: 'warning',
      label: 'Duplicate <h1> text',
      hint: 'Vary the <h1> so pages do not compete for the same query.',
    }),
  );

  const duplicateContentOptions = rules.duplicateContent;
  if (duplicateContentOptions) {
    violations.push(...findDuplicateContent(contentPages, duplicateContentOptions));
  }

  let sitemapFiles = new Set<string>();
  if (wantSitemap || wantOrphan) {
    const sitemaps = await readSitemaps(distPath, siteFiles);
    const result = findSitemapCoverage(
      { sitemaps, siteFiles, pages: scannedPages, noindexPages },
      rules.sitemapCoverage || DEFAULT_SITEMAP_COVERAGE,
    );
    sitemapFiles = result.sitemapFiles;
    if (wantSitemap) violations.push(...result.violations);
  }
  if (rules.orphanPages) {
    violations.push(
      ...findOrphanPages({ pages: scannedPages, linkedFiles, sitemapFiles }, rules.orphanPages),
    );
  }

  // Stable ordering: by file, then errors before warnings, then by rule name.
  violations.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      severityRank(a.severity) - severityRank(b.severity) ||
      a.rule.localeCompare(b.rule),
  );

  const errorCount = countErrors(violations);
  const warningCount = violations.length - errorCount;
  const score = computeScore(violations, scannedPages.length, config.score);

  return { violations, scannedFiles: scannedPages.length, errorCount, warningCount, score };
}

function severityRank(severity: Violation['severity']): number {
  return severity === 'error' ? 0 : 1;
}

function hasNoindex(root: HTMLElement): boolean {
  for (const meta of root.querySelectorAll('meta')) {
    const name = (meta.getAttribute('name') ?? '').toLowerCase();
    if (name !== 'robots' && name !== 'googlebot') continue;
    if (
      (meta.getAttribute('content') ?? '')
        .toLowerCase()
        .split(/[\s,]+/)
        .includes('noindex')
    ) {
      return true;
    }
  }
  return false;
}

/** Read and parse every `sitemap*.xml` in the build output. */
async function readSitemaps(
  distPath: string,
  siteFiles: ReadonlySet<string>,
): Promise<SitemapDoc[]> {
  const docs: SitemapDoc[] = [];
  for (const file of siteFiles) {
    if (!SITEMAP_FILE.test(file)) continue;
    try {
      const xml = await fs.readFile(path.join(distPath, file), 'utf8');
      docs.push({ file, locs: extractLocs(xml) });
    } catch {
      // Unreadable sitemap — skip it rather than fail the whole run.
    }
  }
  return docs;
}

/** Recursively collect every file under `dir` (sorted, absolute paths). */
async function collectFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  }

  await walk(dir);
  return results.sort();
}

function toPosix(input: string): string {
  return input.split(path.sep).join('/');
}
