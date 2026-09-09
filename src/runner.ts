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
import { findOrphanPages } from './rules/orphan-pages.js';
import { extractLocs, findSitemapCoverage } from './rules/sitemap-coverage.js';
import type { SitemapDoc } from './rules/sitemap-coverage.js';
import { extractMainText, extractVisibleText } from './util/dom.js';
import { collectLinkTargets } from './util/links.js';
import { isExcluded } from './util/exclude.js';

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
  const titleRegistry = new Map<string, string[]>();
  const metaDescriptionRegistry = new Map<string, string[]>();
  const h1Registry = new Map<string, string[]>();
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

    // Collect titles so cross-page duplicates can be reported once all files are in.
    const titleOptions = rules.title;
    if (titleOptions && titleOptions.checkDuplicates) {
      register(titleRegistry, normalizeText(root.querySelector('title')?.text), file);
    }

    const metaOptions = rules.metaDescription;
    if (metaOptions && metaOptions.checkDuplicates) {
      register(metaDescriptionRegistry, normalizeText(metaDescriptionOf(root)), file);
    }

    const headingOptions = rules.headingHierarchy;
    if (headingOptions && headingOptions.checkDuplicateH1) {
      const h1s = root.querySelectorAll('h1');
      if (h1s.length === 1) register(h1Registry, normalizeText(h1s[0]?.text), file);
    }

    if ((wantSitemap || wantOrphan) && hasNoindex(root)) noindexPages.add(file);
    if (wantOrphan) {
      for (const target of collectLinkTargets(root, file, siteFiles)) linkedFiles.add(target);
    }
  }

  emitDuplicates(violations, titleRegistry, {
    rule: 'title',
    severity: 'error',
    label: 'Duplicate <title>',
    hint: 'Give every page a unique <title>.',
  });
  emitDuplicates(violations, metaDescriptionRegistry, {
    rule: 'metaDescription',
    severity: 'warning',
    label: 'Duplicate <meta name="description">',
    hint: 'Write a description that reflects each page individually.',
  });
  emitDuplicates(violations, h1Registry, {
    rule: 'headingHierarchy',
    severity: 'warning',
    label: 'Duplicate <h1> text',
    hint: 'Vary the <h1> so pages do not compete for the same query.',
  });

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

  const errorCount = violations.filter((violation) => violation.severity === 'error').length;
  const warningCount = violations.length - errorCount;

  return { violations, scannedFiles: scannedPages.length, errorCount, warningCount };
}

function severityRank(severity: Violation['severity']): number {
  return severity === 'error' ? 0 : 1;
}

function normalizeText(text: string | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** Add `file` to `registry` under `key`, unless the key is empty. */
function register(registry: Map<string, string[]>, key: string, file: string): void {
  if (key.length === 0) return;
  const bucket = registry.get(key) ?? [];
  bucket.push(file);
  registry.set(key, bucket);
}

function metaDescriptionOf(root: HTMLElement): string | undefined {
  const meta = root
    .querySelectorAll('meta')
    .find((element) => (element.getAttribute('name') ?? '').toLowerCase() === 'description');
  return meta?.getAttribute('content') ?? undefined;
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

interface DuplicateSpec {
  rule: string;
  severity: Violation['severity'];
  label: string;
  hint: string;
}

function emitDuplicates(
  violations: Violation[],
  registry: Map<string, string[]>,
  spec: DuplicateSpec,
): void {
  for (const [value, pages] of registry) {
    if (pages.length < 2) continue;
    for (const page of pages) {
      const others = pages.filter((candidate) => candidate !== page);
      violations.push({
        file: page,
        rule: spec.rule,
        severity: spec.severity,
        message: `${spec.label} "${value}" — also on: ${others.join(', ')}.`,
        hint: spec.hint,
      });
    }
  }
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
