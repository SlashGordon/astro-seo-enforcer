import type { Violation } from './types.js';
import { bold, dim, green, red, yellow } from './util/color.js';

export interface ReportSummary {
  scannedFiles: number;
  errorCount: number;
  warningCount: number;
}

const DIVIDER = dim('─'.repeat(64));

/** Build a human readable, grouped report from a flat list of violations. */
export function formatReport(violations: Violation[], summary: ReportSummary): string {
  const byFile = new Map<string, Violation[]>();
  for (const violation of violations) {
    const list = byFile.get(violation.file);
    if (list) list.push(violation);
    else byFile.set(violation.file, [violation]);
  }

  const lines: string[] = [];
  lines.push(bold('astro-seo-enforcer — SEO violation report'));
  lines.push(DIVIDER);

  const files = [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [file, fileViolations] of files) {
    const errors = fileViolations.filter((v) => v.severity === 'error').length;
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
