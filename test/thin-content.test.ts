import { describe, expect, it } from 'vitest';
import { thinContentRule } from '../src/rules/thin-content.js';
import { makeContext } from './helpers.js';

const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

const page = (main: string, extra = ''): string =>
  `<!doctype html><html><head></head><body><header><nav>${words(40)}</nav></header>` +
  `<main>${main}</main><footer>${words(40)}</footer>${extra}</body></html>`;

describe('thinContentRule', () => {
  it('flags a page whose main content is below minWords', () => {
    const found = thinContentRule(makeContext(page(`<p>${words(50)}</p>`)));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'thinContent', severity: 'warning' });
    expect(found[0]?.message).toContain('50 word(s)');
    expect(found[0]?.message).toContain('main content');
  });

  it('accepts a page with enough main content', () => {
    expect(thinContentRule(makeContext(page(`<p>${words(300)}</p>`)))).toEqual([]);
  });

  it('ignores nav and footer boilerplate when scoped to main', () => {
    // 40 + 40 words of chrome, only 20 in <main> -> still thin.
    const found = thinContentRule(makeContext(page(`<p>${words(20)}</p>`)));
    expect(found[0]?.message).toContain('20 word(s)');
  });

  it('falls back to <body> when there is no main region', () => {
    const html = `<!doctype html><html><head></head><body><div>${words(10)}</div></body></html>`;
    const found = thinContentRule(makeContext(html));
    expect(found[0]?.message).toContain('<body>');
  });

  it('counts the whole body when scopeToMain is off', () => {
    const ctx = makeContext(page(`<p>${words(20)}</p>`), {
      rules: { thinContent: { scopeToMain: false, minWords: 50 } },
    });
    // 40 + 20 + 40 = 100 words in the body, above the 50 floor.
    expect(thinContentRule(ctx)).toEqual([]);
  });

  it('respects a custom minWords', () => {
    const ctx = makeContext(page(`<p>${words(30)}</p>`), {
      rules: { thinContent: { minWords: 20 } },
    });
    expect(thinContentRule(ctx)).toEqual([]);
  });

  it('is a no-op when disabled', () => {
    expect(
      thinContentRule(makeContext(page('<p>x</p>'), { rules: { thinContent: false } })),
    ).toEqual([]);
  });
});
