import type { ScoreOptions } from './config.js';
import type { Violation } from './types.js';
import { countErrors } from './util/violations.js';

/** One rule's share of the score deduction, most impactful first. */
export interface ScoreRuleImpact {
  rule: string;
  errors: number;
  warnings: number;
  /** This rule's contribution to `rawDeduction` — the two sum to it exactly. */
  impact: number;
}

export interface SeoScore {
  /** Overall health, `0` (worst) to `100` (perfect). */
  value: number;
  /** Letter grade derived from `value`: A (90+), B (80+), C (70+), D (60+), F (below). */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Deduction applied to 100 before clamping `value` to `[0, 100]`. */
  rawDeduction: number;
  /** Every rule that produced at least one finding, ranked by impact. */
  byRule: ScoreRuleImpact[];
}

const GRADE_BANDS: ReadonlyArray<{ min: number; grade: SeoScore['grade'] }> = [
  { min: 90, grade: 'A' },
  { min: 80, grade: 'B' },
  { min: 70, grade: 'C' },
  { min: 60, grade: 'D' },
  { min: 0, grade: 'F' },
];

/**
 * Scores a site's SEO health from `0` to `100` based on how many errors and
 * warnings its pages carry **on average** — a handful of findings on an
 * otherwise large, clean site barely moves the score, while the same findings
 * on a five-page site are a much bigger share of it.
 */
export function computeScore(
  violations: readonly Violation[],
  scannedFiles: number,
  weights: ScoreOptions,
): SeoScore {
  const pages = Math.max(1, scannedFiles);
  const byRuleCounts = new Map<string, { errors: number; warnings: number }>();
  for (const violation of violations) {
    const counts = byRuleCounts.get(violation.rule) ?? { errors: 0, warnings: 0 };
    if (violation.severity === 'error') counts.errors += 1;
    else counts.warnings += 1;
    byRuleCounts.set(violation.rule, counts);
  }

  const byRule = [...byRuleCounts.entries()]
    .map(([rule, counts]) => ({
      rule,
      ...counts,
      // Per-page average, so every rule's impact sums exactly to rawDeduction.
      impact: round(
        (counts.errors / pages) * weights.errorWeight +
          (counts.warnings / pages) * weights.warningWeight,
      ),
    }))
    .sort((a, b) => b.impact - a.impact);

  const errorCount = countErrors(violations);
  const warningCount = violations.length - errorCount;
  const rawDeduction = round(
    (errorCount / pages) * weights.errorWeight + (warningCount / pages) * weights.warningWeight,
  );

  const value = Math.max(0, Math.round(100 - rawDeduction));
  const grade = GRADE_BANDS.find((band) => value >= band.min)?.grade ?? 'F';

  return { value, grade, rawDeduction, byRule };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
