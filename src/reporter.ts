import type { SeoScore } from './score.js';
import type { Violation } from './types.js';
import { bold, dim, green, red, yellow } from './util/color.js';
import { countErrors, groupByFile } from './util/violations.js';

export interface ReportSummary {
  scannedFiles: number;
  errorCount: number;
  warningCount: number;
}

const DIVIDER = dim('─'.repeat(64));

const GRADE_COLOR: Record<SeoScore['grade'], (text: string) => string> = {
  A: green,
  B: green,
  C: yellow,
  D: red,
  F: red,
};

/**
 * Build a human readable, grouped report from a flat list of violations.
 * `score` is optional so existing callers keep working unchanged.
 */
export function formatReport(
  violations: Violation[],
  summary: ReportSummary,
  score?: SeoScore,
): string {
  const lines: string[] = [];
  lines.push(bold('astro-seo-enforcer — SEO violation report'));
  if (score) {
    const color = GRADE_COLOR[score.grade];
    lines.push(`${bold('SEO health score:')} ${color(`${score.value}/100 (${score.grade})`)}`);
  }
  lines.push(DIVIDER);

  const files = groupByFile(violations);
  for (const [file, fileViolations] of files) {
    const errors = countErrors(fileViolations);
    const warnings = fileViolations.length - errors;

    lines.push('');
    lines.push(`${bold(file)}  ${dim(`(${errors} error(s), ${warnings} warning(s))`)}`);

    for (const violation of fileViolations) {
      const label = violation.severity === 'error' ? red('✖ error  ') : yellow('⚠ warning');
      lines.push(`  ${label} ${dim(`[${violation.rule}]`)} ${violation.message}`);
      if (violation.hint) {
        lines.push(`             ${dim(`↳ ${violation.hint}`)}`);
      }
    }
  }

  lines.push('');
  lines.push(DIVIDER);

  const errorText =
    summary.errorCount > 0 ? red(`${summary.errorCount} error(s)`) : green('0 errors');
  const warningText =
    summary.warningCount > 0 ? yellow(`${summary.warningCount} warning(s)`) : dim('0 warnings');
  lines.push(
    `${summary.scannedFiles} page(s) scanned  ${dim('·')}  ${errorText}  ${dim('·')}  ${warningText}`,
  );

  return lines.join('\n');
}
