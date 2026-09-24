#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { intro, log, note, outro, spinner } from '@clack/prompts';
import { resolveConfig } from './config.js';
import type { SeoEnforcerUserConfig } from './config.js';
import { formatLiveChecks, runLiveChecks } from './live.js';
import { formatHtmlReport } from './report-html.js';
import { formatJsonReport } from './report-json.js';
import type { SeoScore } from './score.js';
import type { Violation } from './types.js';
import { bold, dim, green, red, yellow } from './util/color.js';
import { countErrors, groupByFile } from './util/violations.js';

const USAGE = `Usage: astro-seo-enforcer live <url> [options]

Checks a deployed site: DNS and redirects for the apex and www hosts, the
security headers actually served, robots.txt, the sitemap, and every page rule
on a sample of live pages.

Options:
  --pages <n>        Pages to fetch and lint (default 20)
  --fail-on <level>  error | warning | never (default: error, or failOn from --config)
  --config <file>    Module whose default export is the seoEnforcer() options
  --json <file>      Write a JSON report
  --html <file>      Write an HTML report
  --timeout <ms>     Per-request timeout (default 10000)
  -h, --help         Show this help`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      pages: { type: 'string' },
      'fail-on': { type: 'string' },
      config: { type: 'string' },
      json: { type: 'string' },
      html: { type: 'string' },
      timeout: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const [command, url] = positionals;
  if (values.help || command !== 'live' || !url) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }

  const userConfig: SeoEnforcerUserConfig = values.config
    ? (
        (await import(pathToFileURL(path.resolve(values.config)).href)) as {
          default: SeoEnforcerUserConfig;
        }
      ).default
    : {};
  const config = resolveConfig(userConfig);
  const failOn = values['fail-on'] ?? config.failOn;
  if (!['error', 'warning', 'never'].includes(failOn)) {
    console.error(`--fail-on must be error, warning or never, got "${failOn}".`);
    return 2;
  }

  const siteUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  intro(bold(' astro-seo-enforcer live '));
  const progress = spinner();
  const started = Date.now();
  progress.start(`Checking ${siteUrl}`);
  const result = await runLiveChecks({
    url: siteUrl,
    config,
    maxPages: values.pages ? Number(values.pages) : undefined,
    timeoutMs: values.timeout ? Number(values.timeout) : undefined,
    onProgress: (message) => progress.message(message),
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  progress.stop(`Checked ${siteUrl} (${result.scannedFiles} page(s) in ${seconds}s)`);

  for (const [file, violations] of groupByFile(result.violations)) logFile(file, violations);
  note(formatLiveChecks(result.checks), 'Live checks');

  const summary = {
    scannedFiles: result.scannedFiles,
    errorCount: result.errorCount,
    warningCount: result.warningCount,
  };
  if (values.json) {
    await write(values.json, formatJsonReport(result.violations, summary, result.score));
    log.info(`JSON report written to ${values.json}`);
  }
  if (values.html) {
    await write(values.html, formatHtmlReport(result.violations, summary, result.score));
    log.info(`HTML report written to ${values.html}`);
  }
  outro(formatSummary(result.score, result.errorCount, result.warningCount));

  if (failOn === 'never') return 0;
  return result.errorCount + (failOn === 'warning' ? result.warningCount : 0) > 0 ? 1 : 0;
}

/** One log block per page or host: its violations, each with its hint. */
function logFile(file: string, violations: Violation[]): void {
  const lines = [bold(file)];
  for (const violation of violations) {
    const label = violation.severity === 'error' ? red('✖') : yellow('⚠');
    lines.push(`${label} ${violation.message} ${dim(`[${violation.rule}]`)}`);
    if (violation.hint) lines.push(dim(`  ↳ ${violation.hint}`));
  }
  const message = lines.join('\n');
  if (countErrors(violations) > 0) log.error(message);
  else log.warn(message);
}

function formatSummary(score: SeoScore, errors: number, warnings: number): string {
  const grade = ['A', 'B'].includes(score.grade) ? green : score.grade === 'C' ? yellow : red;
  return [
    `SEO health score ${grade(bold(`${score.value}/100 (${score.grade})`))}`,
    errors > 0 ? red(`${errors} error(s)`) : green('0 errors'),
    warnings > 0 ? yellow(`${warnings} warning(s)`) : dim('0 warnings'),
  ].join(dim('  ·  '));
}

async function write(file: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true });
  await fs.writeFile(file, contents, 'utf8');
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  },
);
