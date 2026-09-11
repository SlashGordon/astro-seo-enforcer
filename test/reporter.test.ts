import { describe, expect, it } from 'vitest';
import { formatReport } from '../src/reporter.js';
import type { Violation } from '../src/types.js';

const violations: Violation[] = [
  {
    file: 'b.html',
    rule: 'title',
    severity: 'error',
    message: 'Missing or empty <title> tag.',
    hint: 'Add one.',
  },
  { file: 'a.html', rule: 'robots', severity: 'warning', message: 'noindex found.' },
  { file: 'a.html', rule: 'imageAlt', severity: 'error', message: '<img> is missing alt.' },
];

describe('formatReport', () => {
  const report = formatReport(violations, { scannedFiles: 5, errorCount: 2, warningCount: 1 });

  it('groups violations by file, sorted alphabetically', () => {
    expect(report.indexOf('a.html')).toBeLessThan(report.indexOf('b.html'));
  });

  it('lists rule names and messages', () => {
    expect(report).toContain('[imageAlt]');
    expect(report).toContain('<img> is missing alt.');
    expect(report).toContain('↳ Add one.');
  });

  it('marks errors and warnings distinctly', () => {
    expect(report).toContain('error');
    expect(report).toContain('warning');
  });

  it('ends with a summary line', () => {
    expect(report).toContain('5 page(s) scanned');
    expect(report).toContain('2 error(s)');
    expect(report).toContain('1 warning(s)');
  });

  it('omits the score line when no score is given', () => {
    expect(report).not.toContain('SEO health score');
  });
});

describe('formatReport with a score', () => {
  it('includes the score value and grade', () => {
    const withScore = formatReport(
      violations,
      { scannedFiles: 5, errorCount: 2, warningCount: 1 },
      { value: 74, grade: 'C', rawDeduction: 26, byRule: [] },
    );
    expect(withScore).toContain('SEO health score');
    expect(withScore).toContain('74/100 (C)');
  });
});
