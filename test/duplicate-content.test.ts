import { describe, expect, it } from 'vitest';
import { DEFAULT_DUPLICATE_CONTENT } from '../src/config.js';
import type { DuplicateContentRuleOptions } from '../src/config.js';
import { findDuplicateContent } from '../src/rules/duplicate-content.js';

/** `n` distinct space-separated words, each prefixed with `prefix`. */
const words = (n: number, prefix = 'w'): string =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');

const run = (
  pages: Array<{ file: string; text: string }>,
  overrides: Partial<DuplicateContentRuleOptions> = {},
) => findDuplicateContent(pages, { ...DEFAULT_DUPLICATE_CONTENT, ...overrides });

describe('findDuplicateContent', () => {
  it('flags two pages with identical text, once per page', () => {
    const body = words(220);
    const found = run([
      { file: 'a.html', text: body },
      { file: 'b.html', text: body },
    ]);

    expect(found.map((v) => v.file).sort()).toEqual(['a.html', 'b.html']);
    expect(found.every((v) => v.rule === 'duplicateContent' && v.severity === 'warning')).toBe(
      true,
    );
    expect(found[0]?.message).toContain('100%');
    expect(found.find((v) => v.file === 'a.html')?.message).toContain('b.html');
  });

  it('flags near-identical text below 100%', () => {
    const shared = words(220);
    const found = run([
      { file: 'a.html', text: shared },
      { file: 'b.html', text: `${shared} ${words(8, 'extra')}` },
    ]);

    expect(found).toHaveLength(2);
    const percent = Number(found[0]?.message.match(/(\d+)%/)?.[1]);
    expect(percent).toBeGreaterThan(90);
    expect(percent).toBeLessThan(100);
  });

  it('ignores pages whose text is genuinely different', () => {
    expect(
      run([
        { file: 'a.html', text: words(220, 'alpha') },
        { file: 'b.html', text: words(220, 'beta') },
      ]),
    ).toEqual([]);
  });

  it('ignores pages shorter than minWords', () => {
    const body = words(50);
    expect(
      run([
        { file: 'a.html', text: body },
        { file: 'b.html', text: body },
      ]),
    ).toEqual([]);
  });

  it('respects a lower minWords override', () => {
    const body = words(50);
    const found = run(
      [
        { file: 'a.html', text: body },
        { file: 'b.html', text: body },
      ],
      { minWords: 20 },
    );
    expect(found).toHaveLength(2);
  });

  it('respects the threshold option', () => {
    const pages = [
      { file: 'a.html', text: words(300) },
      { file: 'b.html', text: `${words(150)} ${words(150, 'x')}` },
    ];

    expect(run(pages)).toEqual([]); // ~33% overlap, under the 0.9 default
    expect(run(pages, { threshold: 0.3 })).toHaveLength(2);
  });

  it('returns nothing when fewer than two pages are eligible', () => {
    expect(run([{ file: 'only.html', text: words(220) }])).toEqual([]);
    expect(run([])).toEqual([]);
  });

  it('reports every near-duplicate partner for a page', () => {
    const body = words(220);
    const found = run([
      { file: 'a.html', text: body },
      { file: 'b.html', text: body },
      { file: 'c.html', text: words(220, 'other') },
    ]);

    expect(found.map((v) => v.file).sort()).toEqual(['a.html', 'b.html']);
    expect(found).toHaveLength(2);
  });

  it('skips the check with a single notice when maxPages is exceeded', () => {
    const body = words(220);
    const pages = Array.from({ length: 6 }, (_, i) => ({ file: `p${i}.html`, text: body }));

    const found = run(pages, { maxPages: 5 });

    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('maxPages limit of 5');
  });
});
