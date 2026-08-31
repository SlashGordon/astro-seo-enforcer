import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';
import type { HTMLElement } from 'node-html-parser';
import type { ResolvedConfig } from './config.js';
import type { PageContext, Violation } from './types.js';
import { allRules } from './rules/index.js';
import { extractVisibleText } from './util/dom.js';
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

/** Parse every HTML file under `distPath` and run all enabled rules against it. */
export async function runSeoChecks({ distPath, config }: RunOptions): Promise<RunResult> {
  const files = await collectHtmlFiles(distPath);
  const violations: Violation[] = [];
  const titleRegistry = new Map<string, string[]>();
  let scannedFiles = 0;

  for (const absolutePath of files) {
    const file = toPosix(path.relative(distPath, absolutePath));
    if (isExcluded(file, config.exclude)) continue;
    scannedFiles += 1;

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

    // Collect titles so cross-page duplicates can be reported once all files are in.
    const titleOptions = config.rules.title;
    if (titleOptions && titleOptions.checkDuplicates) {
      const titleText = (root.querySelector('title')?.text ?? '').replace(/\s+/g, ' ').trim();
      if (titleText.length > 0) {
        const bucket = titleRegistry.get(titleText) ?? [];
        bucket.push(file);
        titleRegistry.set(titleText, bucket);
      }
    }
  }

  for (const [titleText, pages] of titleRegistry) {
    if (pages.length < 2) continue;
    for (const page of pages) {
      const others = pages.filter((candidate) => candidate !== page);
      violations.push({
        file: page,
        rule: 'title',
        severity: 'error',
        message: `Duplicate <title> "${titleText}" — also used on: ${others.join(', ')}.`,
        hint: 'Give every page a unique <title>.',
      });
    }
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

  return { violations, scannedFiles, errorCount, warningCount };
}

function severityRank(severity: Violation['severity']): number {
  return severity === 'error' ? 0 : 1;
}

/** Recursively collect every `*.html` file under `dir` (sorted, absolute paths). */
async function collectHtmlFiles(dir: string): Promise<string[]> {
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
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
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
