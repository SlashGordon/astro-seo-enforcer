import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration, AstroIntegrationLogger } from 'astro';
import { resolveConfig } from './config.js';
import type { ResolvedConfig, SeoEnforcerUserConfig } from './config.js';
import { formatHtmlReport } from './report-html.js';
import { formatJsonReport } from './report-json.js';
import { formatReport } from './reporter.js';
import type { ReportSummary } from './reporter.js';
import { runSeoChecks } from './runner.js';
import type { RunResult } from './runner.js';

const INTEGRATION_NAME = 'astro-seo-enforcer';

/** Thrown from the `astro:build:done` hook to fail the build on SEO violations. */
export class SeoEnforcerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeoEnforcerError';
  }
}

/**
 * Astro integration that parses the generated static HTML and fails the build
 * when it finds SEO violations.
 *
 * @example
 * ```ts
 * import { defineConfig } from 'astro/config';
 * import seoEnforcer from 'astro-seo-enforcer';
 *
 * export default defineConfig({
 *   site: 'https://example.com',
 *   integrations: [seoEnforcer()],
 * });
 * ```
 */
export default function seoEnforcer(userConfig: SeoEnforcerUserConfig = {}): AstroIntegration {
  const config = resolveConfig(userConfig);
  // Set by `astro:config:done`, which always runs before `astro:build:done`.
  let projectRoot = new URL(`file://${process.cwd()}/`);

  return {
    name: INTEGRATION_NAME,
    hooks: {
      'astro:config:done': ({ config: astroConfig }) => {
        projectRoot = astroConfig.root;
      },
      'astro:build:done': async ({ dir, logger }) => {
        if (!config.enabled) {
          logger.info('Disabled via config — skipping SEO checks.');
          return;
        }

        const distPath = fileURLToPath(dir);
        logger.info('Analysing generated HTML for SEO violations…');

        const result = await runSeoChecks({ distPath, config });
        const { violations, scannedFiles, errorCount, warningCount, score } = result;

        if (scannedFiles === 0) {
          logger.warn(`No .html files found under ${distPath} — nothing to check.`);
          return;
        }

        await writeReports(result, config, projectRoot, logger);

        if (violations.length === 0) {
          logger.info(
            `✔ ${scannedFiles} page(s) checked, no SEO violations found. ` +
              `SEO health score: ${score.value}/100 (${score.grade}).`,
          );
          return;
        }

        // Print the report straight to stderr so its layout and colours survive.
        console.error(
          `\n${formatReport(violations, { scannedFiles, errorCount, warningCount }, score)}\n`,
        );

        const shouldFail =
          config.failOn === 'never'
            ? false
            : config.failOn === 'warning'
              ? errorCount + warningCount > 0
              : errorCount > 0;

        if (shouldFail) {
          // Belt and braces: set a non-zero exit code *and* throw so the build fails.
          process.exitCode = 1;
          throw new SeoEnforcerError(
            `${INTEGRATION_NAME}: ${errorCount} error(s) and ${warningCount} warning(s) found. See the report above.`,
          );
        }

        logger.warn(
          `${INTEGRATION_NAME}: ${errorCount} error(s) and ${warningCount} warning(s) found ` +
            `(failOn: "${config.failOn}", build not failed).`,
        );
      },
    },
  };
}

/** Write the configured JSON/HTML reports to disk, relative to the project root. */
async function writeReports(
  result: RunResult,
  config: ResolvedConfig,
  root: URL,
  logger: AstroIntegrationLogger,
): Promise<void> {
  const summary: ReportSummary = {
    scannedFiles: result.scannedFiles,
    errorCount: result.errorCount,
    warningCount: result.warningCount,
  };

  if (config.report.json) {
    const target = resolveReportTarget(root, config.report.json);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, formatJsonReport(result.violations, summary, result.score), 'utf8');
    logger.info(`Wrote JSON report to ${target}`);
  }
  if (config.report.html) {
    const target = resolveReportTarget(root, config.report.html);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, formatHtmlReport(result.violations, summary, result.score), 'utf8');
    logger.info(`Wrote HTML report to ${target}`);
  }
}

function resolveReportTarget(root: URL, target: string): string {
  return path.isAbsolute(target) ? target : path.join(fileURLToPath(root), target);
}

export { resolveConfig, defineSeoEnforcerConfig } from './config.js';
export type {
  SeoEnforcerUserConfig,
  RulesConfig,
  ResolvedConfig,
  ScoreOptions,
  ReportOutputConfig,
  TitleRuleOptions,
  MetaDescriptionRuleOptions,
  HeadingHierarchyRuleOptions,
  SemanticHtmlRuleOptions,
  AnchorTextRuleOptions,
  JsDependencyRuleOptions,
  CanonicalRuleOptions,
  RobotsRuleOptions,
  ImageSizeRuleOptions,
  InternalLinksRuleOptions,
  DuplicateContentRuleOptions,
  ThinContentRuleOptions,
  StructuredDataRuleOptions,
  OrphanPagesRuleOptions,
  SitemapCoverageRuleOptions,
} from './config.js';
export type { Violation, Severity, PageContext, Rule } from './types.js';
export { formatReport } from './reporter.js';
export type { ReportSummary } from './reporter.js';
export { formatJsonReport } from './report-json.js';
export type { JsonReport } from './report-json.js';
export { formatHtmlReport } from './report-html.js';
export { computeScore } from './score.js';
export type { SeoScore, ScoreRuleImpact } from './score.js';
export { runSeoChecks } from './runner.js';
export type { RunOptions, RunResult } from './runner.js';
