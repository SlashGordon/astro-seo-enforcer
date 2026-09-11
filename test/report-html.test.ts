import { describe, expect, it } from 'vitest';
import { formatHtmlReport } from '../src/report-html.js';
import type { Violation } from '../src/types.js';

const summary = { scannedFiles: 2, errorCount: 1, warningCount: 1 };
const score = {
  value: 82,
  grade: 'B' as const,
  rawDeduction: 18,
  byRule: [{ rule: 'title', errors: 1, warnings: 0, impact: 12 }],
};

describe('formatHtmlReport', () => {
  it('renders a complete, well-formed HTML document', () => {
    const html = formatHtmlReport([], summary, score);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
  });

  it('shows the score value and grade', () => {
    const html = formatHtmlReport([], summary, score);
    expect(html).toContain('82');
    expect(html).toContain('B');
  });

  it('shows a success state when there are no violations', () => {
    const html = formatHtmlReport([], summary, score);
    expect(html).toContain('No SEO violations found');
  });

  it('groups violations by file and includes rule, message and hint', () => {
    const violations: Violation[] = [
      {
        file: 'a.html',
        rule: 'title',
        severity: 'error',
        message: 'Too short.',
        hint: 'Lengthen it.',
      },
      { file: 'b.html', rule: 'robots', severity: 'warning', message: 'noindex found.' },
    ];
    const html = formatHtmlReport(violations, summary, score);

    expect(html).toContain('a.html');
    expect(html).toContain('b.html');
    expect(html).toContain('Too short.');
    expect(html).toContain('Lengthen it.');
    expect(html.indexOf('a.html')).toBeLessThan(html.indexOf('b.html'));
  });

  it('escapes HTML found in violation text instead of injecting it', () => {
    const violations: Violation[] = [
      {
        file: '<img src=x onerror=alert(1)>.html',
        rule: 'title',
        severity: 'error',
        message: 'Duplicate <title> "<script>alert(1)</script>" — also on: b.html.',
        hint: '"><svg onload=alert(2)>',
      },
    ];
    const html = formatHtmlReport(violations, summary, score);

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<svg onload=alert(2)>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders the rule breakdown table when scores carry impact data', () => {
    const html = formatHtmlReport([], summary, score);
    expect(html).toContain('Impact by rule');
    expect(html).toContain('title');
  });

  it('omits the rule breakdown table when nothing has scored an impact', () => {
    const clean = { value: 100, grade: 'A' as const, rawDeduction: 0, byRule: [] };
    const html = formatHtmlReport([], summary, clean);
    expect(html).not.toContain('Impact by rule');
  });
});
