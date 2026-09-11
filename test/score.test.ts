import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORE } from '../src/config.js';
import { computeScore } from '../src/score.js';
import type { Violation } from '../src/types.js';

const error = (rule: string, file = 'a.html'): Violation => ({
  file,
  rule,
  severity: 'error',
  message: 'x',
});
const warning = (rule: string, file = 'a.html'): Violation => ({
  file,
  rule,
  severity: 'warning',
  message: 'x',
});

describe('computeScore', () => {
  it('is a perfect 100 (grade A) with no violations', () => {
    const score = computeScore([], 10, DEFAULT_SCORE);
    expect(score.value).toBe(100);
    expect(score.grade).toBe('A');
    expect(score.rawDeduction).toBe(0);
    expect(score.byRule).toEqual([]);
  });

  it('deducts more for the same violation count on fewer pages', () => {
    const violations = [error('title'), error('title')];
    const small = computeScore(violations, 2, DEFAULT_SCORE);
    const large = computeScore(violations, 200, DEFAULT_SCORE);

    expect(small.value).toBeLessThan(large.value);
    expect(large.value).toBeGreaterThanOrEqual(99);
  });

  it('deducts more for an error than for a warning', () => {
    const withError = computeScore([error('title')], 1, DEFAULT_SCORE);
    const withWarning = computeScore([warning('robots')], 1, DEFAULT_SCORE);

    expect(withError.value).toBeLessThan(withWarning.value);
  });

  it('never drops below 0', () => {
    const manyErrors = Array.from({ length: 50 }, (_, i) => error(`rule${i}`));
    const score = computeScore(manyErrors, 1, DEFAULT_SCORE);
    expect(score.value).toBe(0);
  });

  it('ranks rules by impact and sums their impact to the raw deduction', () => {
    const violations = [error('title'), error('title'), warning('robots')];
    const score = computeScore(violations, 5, DEFAULT_SCORE);

    expect(score.byRule[0]).toMatchObject({ rule: 'title', errors: 2, warnings: 0 });
    expect(score.byRule[1]).toMatchObject({ rule: 'robots', errors: 0, warnings: 1 });
    const summedImpact = score.byRule.reduce((sum, r) => sum + r.impact, 0);
    expect(Math.round(summedImpact * 100)).toBe(Math.round(score.rawDeduction * 100));
  });

  it('respects custom weights', () => {
    const heavy = computeScore([error('title')], 1, { errorWeight: 50, warningWeight: 1 });
    expect(heavy.value).toBe(50);
  });

  it('treats zero scanned files as one page, avoiding division by zero', () => {
    expect(() => computeScore([error('title')], 0, DEFAULT_SCORE)).not.toThrow();
  });
});
