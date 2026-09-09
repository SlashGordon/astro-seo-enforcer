import { describe, expect, it } from 'vitest';
import { DEFAULT_SITEMAP_COVERAGE } from '../src/config.js';
import type { SitemapCoverageRuleOptions } from '../src/config.js';
import { extractLocs, findSitemapCoverage } from '../src/rules/sitemap-coverage.js';
import type { SitemapCoverageInput } from '../src/rules/sitemap-coverage.js';

const run = (input: SitemapCoverageInput, overrides: Partial<SitemapCoverageRuleOptions> = {}) =>
  findSitemapCoverage(input, { ...DEFAULT_SITEMAP_COVERAGE, ...overrides });

const siteFiles = new Set(['index.html', 'about/index.html', 'blog/a/index.html', 'sitemap.xml']);

describe('extractLocs', () => {
  it('pulls and decodes every <loc>', () => {
    const xml =
      '<urlset><url><loc>https://x.com/a</loc></url>' +
      '<url><loc> https://x.com/b?p=1&amp;q=2 </loc></url></urlset>';
    expect(extractLocs(xml)).toEqual(['https://x.com/a', 'https://x.com/b?p=1&q=2']);
  });
});

describe('findSitemapCoverage', () => {
  it('warns once when there is no sitemap at all', () => {
    const { violations } = run({
      sitemaps: [],
      siteFiles,
      pages: ['index.html', 'about/index.html'],
      noindexPages: new Set(),
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('No sitemap');
  });

  it('stays quiet with no sitemap when requireInSitemap is off', () => {
    const { violations } = run(
      { sitemaps: [], siteFiles, pages: ['index.html'], noindexPages: new Set() },
      { requireInSitemap: false },
    );
    expect(violations).toEqual([]);
  });

  it('flags a <loc> that resolves to nothing', () => {
    const { violations } = run({
      sitemaps: [{ file: 'sitemap.xml', locs: ['https://x.com/', 'https://x.com/ghost/'] }],
      siteFiles,
      pages: ['index.html'],
      noindexPages: new Set(),
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: 'sitemap.xml' });
    expect(violations[0]?.message).toContain('ghost');
  });

  it('flags an indexable page missing from the sitemap', () => {
    const { violations, sitemapFiles } = run({
      sitemaps: [{ file: 'sitemap.xml', locs: ['https://x.com/'] }],
      siteFiles,
      pages: ['index.html', 'about/index.html'],
      noindexPages: new Set(),
    });
    expect(sitemapFiles).toEqual(new Set(['index.html']));
    expect(violations.map((v) => v.file)).toEqual(['about/index.html']);
    expect(violations[0]?.message).toContain('missing from every sitemap');
  });

  it('does not require noindex pages to be in the sitemap', () => {
    const { violations } = run({
      sitemaps: [{ file: 'sitemap.xml', locs: ['https://x.com/'] }],
      siteFiles,
      pages: ['index.html', 'about/index.html'],
      noindexPages: new Set(['about/index.html']),
    });
    expect(violations).toEqual([]);
  });

  it('flags a noindex page that is nonetheless in the sitemap', () => {
    const { violations } = run({
      sitemaps: [{ file: 'sitemap.xml', locs: ['https://x.com/', 'https://x.com/about/'] }],
      siteFiles,
      pages: ['index.html', 'about/index.html'],
      noindexPages: new Set(['about/index.html']),
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: 'about/index.html' });
    expect(violations[0]?.message).toContain('noindex');
  });

  it('resolves a relative <loc>', () => {
    const { sitemapFiles } = run({
      sitemaps: [{ file: 'sitemap.xml', locs: ['/about/'] }],
      siteFiles,
      pages: ['about/index.html'],
      noindexPages: new Set(),
    });
    expect(sitemapFiles).toEqual(new Set(['about/index.html']));
  });
});
