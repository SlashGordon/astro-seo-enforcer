import { describe, expect, it } from 'vitest';
import { DEFAULT_ORPHAN_PAGES } from '../src/config.js';
import type { OrphanPagesRuleOptions } from '../src/config.js';
import { findOrphanPages } from '../src/rules/orphan-pages.js';
import type { OrphanPagesInput } from '../src/rules/orphan-pages.js';

const run = (input: OrphanPagesInput, overrides: Partial<OrphanPagesRuleOptions> = {}) =>
  findOrphanPages(input, { ...DEFAULT_ORPHAN_PAGES, ...overrides });

describe('findOrphanPages', () => {
  it('flags a page nothing links to', () => {
    const found = run({
      pages: ['index.html', 'blog/a.html', 'blog/orphan.html'],
      linkedFiles: new Set(['blog/a.html']),
      sitemapFiles: new Set(),
    });
    expect(found.map((v) => v.file)).toEqual(['blog/orphan.html']);
    expect(found[0]).toMatchObject({ rule: 'orphanPages', severity: 'warning' });
  });

  it('never flags an entry point', () => {
    const found = run({
      pages: ['index.html'],
      linkedFiles: new Set(),
      sitemapFiles: new Set(),
    });
    expect(found).toEqual([]);
  });

  it('treats a sitemap entry as reachable', () => {
    const found = run({
      pages: ['index.html', 'lonely.html'],
      linkedFiles: new Set(),
      sitemapFiles: new Set(['lonely.html']),
    });
    expect(found).toEqual([]);
  });

  it('honours the ignore list (exact and prefix)', () => {
    const found = run(
      {
        pages: ['index.html', 'thanks.html', 'lp/a.html', 'lp/b.html'],
        linkedFiles: new Set(),
        sitemapFiles: new Set(),
      },
      { ignore: ['thanks.html', 'lp'] },
    );
    expect(found).toEqual([]);
  });

  it('respects custom entry points', () => {
    const found = run(
      { pages: ['home.html'], linkedFiles: new Set(), sitemapFiles: new Set() },
      { entryPoints: ['home.html'] },
    );
    expect(found).toEqual([]);
  });
});
