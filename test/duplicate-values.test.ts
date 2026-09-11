import { describe, expect, it } from 'vitest';
import { findDuplicateValues } from '../src/rules/duplicate-values.js';
import type { DuplicateValuesSpec } from '../src/rules/duplicate-values.js';

const SPEC: DuplicateValuesSpec = {
  rule: 'title',
  severity: 'error',
  label: 'Duplicate <title>',
  hint: 'Give every page a unique <title>.',
};

describe('findDuplicateValues', () => {
  it('flags a value shared by two or more pages, from every page it appears on', () => {
    const found = findDuplicateValues(
      [
        { file: 'a.html', value: 'Widgets' },
        { file: 'b.html', value: 'Widgets' },
        { file: 'c.html', value: 'Gadgets' },
      ],
      SPEC,
    );

    expect(found.map((v) => v.file).sort()).toEqual(['a.html', 'b.html']);
    expect(found.every((v) => v.rule === 'title' && v.severity === 'error')).toBe(true);
    expect(found.find((v) => v.file === 'a.html')?.message).toContain('also on: b.html');
    expect(found.find((v) => v.file === 'b.html')?.message).toContain('also on: a.html');
  });

  it('does not flag a value that appears on only one page', () => {
    const found = findDuplicateValues(
      [
        { file: 'a.html', value: 'Widgets' },
        { file: 'b.html', value: 'Gadgets' },
      ],
      SPEC,
    );
    expect(found).toEqual([]);
  });

  it('ignores empty and undefined values', () => {
    const found = findDuplicateValues(
      [
        { file: 'a.html', value: '' },
        { file: 'b.html', value: undefined },
        { file: 'c.html', value: '   ' },
      ],
      SPEC,
    );
    expect(found).toEqual([]);
  });

  it('treats values as equal after whitespace normalisation', () => {
    const found = findDuplicateValues(
      [
        { file: 'a.html', value: 'Best  Widgets' },
        { file: 'b.html', value: '  Best Widgets  ' },
      ],
      SPEC,
    );
    expect(found.map((v) => v.file).sort()).toEqual(['a.html', 'b.html']);
  });

  it('reports more than two pages sharing a value, each pointing at the others', () => {
    const found = findDuplicateValues(
      [
        { file: 'a.html', value: 'Widgets' },
        { file: 'b.html', value: 'Widgets' },
        { file: 'c.html', value: 'Widgets' },
      ],
      SPEC,
    );

    expect(found).toHaveLength(3);
    expect(found.find((v) => v.file === 'a.html')?.message).toContain('b.html, c.html');
  });
});
