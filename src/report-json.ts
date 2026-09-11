import type { ReportSummary } from './reporter.js';
import type { SeoScore } from './score.js';
import type { Violation } from './types.js';

/** Shape of the JSON report — every violation plus the score, as a CI/CD artifact. */
export interface JsonReport {
  generatedAt: string;
  summary: ReportSummary;
  score: SeoScore;
  violations: Violation[];
}

/** Render the machine-readable report: a pretty-printed JSON string. */
export function formatJsonReport(
  violations: readonly Violation[],
  summary: ReportSummary,
  score: SeoScore,
): string {
  const report: JsonReport = {
    generatedAt: new Date().toISOString(),
    summary,
    score,
    violations: [...violations],
  };
  return JSON.stringify(report, null, 2);
}
