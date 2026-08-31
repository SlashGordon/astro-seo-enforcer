import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { resolveConfig } from './config.js';
import type { SeoEnforcerUserConfig } from './config.js';
import { formatReport } from './reporter.js';
import { runSeoChecks } from './runner.js';

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

  return {
    name: INTEGRATION_NAME,
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        if (!config.enabled) {
          logger.info('Disabled via config — skipping SEO checks.');
          return;
        }

        const distPath = fileURLToPath(dir);
        logger.info('Analysing generated HTML for SEO violations…');

        const { violations, scannedFiles, errorCount, warningCount } = await runSeoChecks({
          distPath,
          config,
        });

        if (scannedFiles === 0) {
          logger.warn(`No .html files found under ${distPath} — nothing to check.`);
          return;
        }

        if (violations.length === 0) {
          logger.info(`✔ ${scannedFiles} page(s) checked, no SEO violations found.`);
          return;
        }

        // Print the report straight to stderr so its layout and colours survive.
        console.error(
          `\n${formatReport(violations, { scannedFiles, errorCount, warningCount })}\n`,
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

export { resolveConfig, defineSeoEnforcerConfig } from './config.js';
export type {
  SeoEnforcerUserConfig,
  RulesConfig,
  ResolvedConfig,
  TitleRuleOptions,
  MetaDescriptionRuleOptions,
  HeadingHierarchyRuleOptions,
  SemanticHtmlRuleOptions,
  AnchorTextRuleOptions,
  JsDependencyRuleOptions,
  CanonicalRuleOptions,
  RobotsRuleOptions,
} from './config.js';
export type { Violation, Severity, PageContext, Rule } from './types.js';
export { formatReport } from './reporter.js';
export type { ReportSummary } from './reporter.js';
export { runSeoChecks } from './runner.js';
export type { RunOptions, RunResult } from './runner.js';
