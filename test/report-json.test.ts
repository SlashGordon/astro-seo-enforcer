import { describe, expect, it } from 'vitest';
import { formatJsonReport } from '../src/report-json.js';
import type { JsonReport } from '../src/report-json.js';
import type { Violation } from '../src/types.js';

const violations: Violation[] = [
  { file: 'a.html', rule: 'title', severity: 'error', message: 'Missing title.' },
];
const summary = { scannedFiles: 3, errorCount: 1, warningCount: 0 };
const score = { value: 90, grade: 'A' as const, rawDeduction: 10, byRule: [] };

describe('formatJsonReport', () => {
  it('produces valid, pretty-printed JSON with the expected shape', () => {
    const text = formatJsonReport(violations, summary, score);
    const report = JSON.parse(text) as JsonReport;

    expect(text).toContain('\n  '); // pretty-printed, not minified
    expect(report.summary).toEqual(summary);
    expect(report.score).toEqual(score);
    expect(report.violations).toEqual(violations);
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('does not mutate the input violations array', () => {
    const text = formatJsonReport(violations, summary, score);
    const report = JSON.parse(text) as JsonReport;
    report.violations.push({ file: 'z.html', rule: 'x', severity: 'error', message: 'x' });
    expect(violations).toHaveLength(1);
  });
});
