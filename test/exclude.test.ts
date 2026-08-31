import { describe, expect, it } from 'vitest';
import { isExcluded } from '../src/util/exclude.js';

describe('isExcluded', () => {
  it('matches an exact path', () => {
    expect(isExcluded('404.html', ['404.html'])).toBe(true);
    expect(isExcluded('index.html', ['404.html'])).toBe(false);
  });

  it('matches a directory prefix', () => {
    expect(isExcluded('blog/post/index.html', ['blog'])).toBe(true);
    expect(isExcluded('blog/post/index.html', ['blog/'])).toBe(true);
    expect(isExcluded('blogger/index.html', ['blog'])).toBe(false);
  });

  it('supports single-segment "*" globs', () => {
    expect(isExcluded('posts/a.html', ['posts/*.html'])).toBe(true);
    expect(isExcluded('posts/nested/a.html', ['posts/*.html'])).toBe(false);
  });

  it('supports cross-segment "**" globs', () => {
    expect(isExcluded('drafts/2026/a.html', ['drafts/**'])).toBe(true);
    expect(isExcluded('a/b/c.amp.html', ['**/*.amp.html'])).toBe(true);
    expect(isExcluded('a/b/c.html', ['**/*.amp.html'])).toBe(false);
  });

  it('supports RegExp patterns', () => {
    expect(isExcluded('private/x.html', [/^private\//])).toBe(true);
    expect(isExcluded('public/x.html', [/^private\//])).toBe(false);
  });

  it('returns false when no pattern matches', () => {
    expect(isExcluded('index.html', [])).toBe(false);
    expect(isExcluded('index.html', ['blog/**', /admin/])).toBe(false);
  });
});
