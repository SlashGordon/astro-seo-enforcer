import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seoEnforcer from '../src/index.js';
import { resolveConfig } from '../src/config.js';
import { runSeoChecks } from '../src/runner.js';
import { CLEAN_PAGE } from './helpers.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'seo-enforcer-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(relPath: string, contents: string): Promise<void> {
  const full = path.join(dir, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, contents, 'utf8');
}

describe('runSeoChecks', () => {
  it('reports zero violations for a clean site', async () => {
    await write('index.html', CLEAN_PAGE);
    await write(
      'sitemap.xml',
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        '<url><loc>https://example.com/</loc></url></urlset>',
    );

    const result = await runSeoChecks({ distPath: dir, config: resolveConfig() });

    expect(result.scannedFiles).toBe(1);
    expect(result.violations).toEqual([]);
    expect(result.errorCount).toBe(0);
    expect(result.score).toEqual({ value: 100, grade: 'A', rawDeduction: 0, byRule: [] });
  });

  it('collects violations from a broken page', async () => {
    await write('bad.html', '<!doctype html><html><head></head><body><div>hi</div></body></html>');

    const result = await runSeoChecks({ distPath: dir, config: resolveConfig() });

    expect(result.errorCount).toBeGreaterThan(0);
    const brokenRules = new Set(result.violations.map((v) => v.rule));
    expect(brokenRules).toContain('title');
    expect(brokenRules).toContain('metaDescription');
    expect(brokenRules).toContain('canonical');
    expect(brokenRules).toContain('semanticHtml');
    expect(brokenRules).toContain('headingHierarchy');
    expect(brokenRules).toContain('jsDependency');
  });

  it('detects duplicate titles across pages', async () => {
    await write('a.html', CLEAN_PAGE);
    await write('b.html', CLEAN_PAGE);

    const result = await runSeoChecks({ distPath: dir, config: resolveConfig() });

    const titleViolations = result.violations.filter((v) => v.rule === 'title');
    expect(titleViolations).toHaveLength(2);
    expect(titleViolations.every((v) => v.message.includes('Duplicate <title>'))).toBe(true);
    expect(new Set(titleViolations.map((v) => v.file))).toEqual(new Set(['a.html', 'b.html']));
  });

  it('does not flag duplicate titles when checkDuplicates is off', async () => {
    await write('a.html', CLEAN_PAGE);
    await write('b.html', CLEAN_PAGE);

    const result = await runSeoChecks({
      distPath: dir,
      config: resolveConfig({ rules: { title: { checkDuplicates: false } } }),
    });

    expect(result.violations.some((v) => v.rule === 'title')).toBe(false);
  });

  it('flags near-duplicate content across pages with distinct titles', async () => {
    const filler = Array.from({ length: 220 }, (_, i) => `word${i}`).join(' ');
    const page = (slug: string) =>
      `<!doctype html><html lang="en"><head>` +
      `<title>Unique title for the ${slug} page about widgets</title>` +
      `<meta name="description" content="A meta description that is comfortably longer than fifty characters so the rule stays quiet.">` +
      `<link rel="canonical" href="https://example.com/${slug}">` +
      `</head><body><header><nav>Home</nav></header><main><h1>${slug}</h1>` +
      `<p>${filler}</p></main><footer>Copyright 2026</footer></body></html>`;
    await write('a.html', page('a'));
    await write('b.html', page('b'));

    const result = await runSeoChecks({ distPath: dir, config: resolveConfig() });

    const dupes = result.violations.filter((v) => v.rule === 'duplicateContent');
    expect(dupes).toHaveLength(2);
    expect(new Set(dupes.map((v) => v.file))).toEqual(new Set(['a.html', 'b.html']));
    expect(
      result.violations.some((v) => v.rule === 'title' && v.message.includes('Duplicate')),
    ).toBe(false);
  });

  it('does not run the duplicateContent check when the rule is disabled', async () => {
    const filler = Array.from({ length: 220 }, (_, i) => `word${i}`).join(' ');
    const page =
      `<!doctype html><html lang="en"><head>` +
      `<title>Reasonably descriptive shared page title about widgets</title>` +
      `<meta name="description" content="A meta description that is comfortably longer than fifty characters so the rule stays quiet.">` +
      `<link rel="canonical" href="https://example.com/x">` +
      `</head><body><main><h1>Widgets</h1><p>${filler}</p></main></body></html>`;
    await write('a.html', page);
    await write('b.html', page);

    const result = await runSeoChecks({
      distPath: dir,
      config: resolveConfig({ rules: { duplicateContent: false } }),
    });

    expect(result.violations.some((v) => v.rule === 'duplicateContent')).toBe(false);
  });

  it('skips excluded paths', async () => {
    await write('index.html', CLEAN_PAGE);
    await write('drafts/wip.html', '<html><head></head><body></body></html>');

    const result = await runSeoChecks({
      distPath: dir,
      config: resolveConfig({ exclude: ['drafts/**'] }),
    });

    expect(result.scannedFiles).toBe(1);
    expect(result.violations.some((v) => v.file.startsWith('drafts/'))).toBe(false);
  });

  it('recurses into nested directories and normalises paths to POSIX', async () => {
    await write(
      path.join('blog', 'post', 'index.html'),
      '<html><head></head><body><div>x</div></body></html>',
    );

    const result = await runSeoChecks({ distPath: dir, config: resolveConfig() });

    expect(result.scannedFiles).toBe(1);
    expect(result.violations[0]?.file).toBe('blog/post/index.html');
  });

  it('returns nothing to do for an empty directory', async () => {
    const result = await runSeoChecks({ distPath: dir, config: resolveConfig() });
    expect(result.scannedFiles).toBe(0);
    expect(result.violations).toEqual([]);
  });
});

describe('programmatic-SEO checks', () => {
  const w = (n: number, prefix = 'w'): string =>
    Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');

  // Deliberately large shared chrome — the exact "the nav and footer are most of
  // the page" shape that trips naive whole-body duplicate detection.
  const CHROME_HEAD = `<header><nav>${w(120, 'nav')}</nav></header>`;
  const CHROME_FOOT = `<footer>${w(120, 'foot')} copyright</footer>`;

  interface PageParts {
    key?: string;
    title?: string;
    desc?: string;
    h1?: string;
    main?: string;
    head?: string;
  }

  const mkPage = ({
    key = 'k',
    title = `A sufficiently descriptive page title about ${key}`,
    desc = `A meta description for ${key} that is comfortably past the fifty character minimum length.`,
    h1 = `Heading ${key}`,
    main = `<p>${w(260, key)}</p>`,
    head = '',
  }: PageParts = {}): string =>
    `<!doctype html><html lang="en"><head><title>${title}</title>` +
    `<meta name="description" content="${desc}">` +
    `<link rel="canonical" href="https://example.com/${key}">${head}</head>` +
    `<body>${CHROME_HEAD}<main><h1>${h1}</h1>${main}</main>${CHROME_FOOT}</body></html>`;

  const dupeContent = (vs: { rule: string }[]) => vs.filter((v) => v.rule === 'duplicateContent');

  it('does not flag shared header/footer as duplicate content when the main content differs', async () => {
    await write('a.html', mkPage({ key: 'alpha', main: `<p>${w(240, 'alpha')}</p>` }));
    await write('b.html', mkPage({ key: 'beta', main: `<p>${w(240, 'beta')}</p>` }));

    const result = await runSeoChecks({ distPath: dir, config: resolveConfig() });

    expect(dupeContent(result.violations)).toEqual([]);
  });

  it('would flag those same pages if the comparison were not scoped to <main>', async () => {
    // Tiny distinct main, huge identical chrome: with scopeToMain off the pages
    // read as near-duplicates; with it on (the default) they are not compared.
    const pages = {
      'a.html': mkPage({ key: 'a', main: `<p>${w(40, 'a')}</p>` }),
      'b.html': mkPage({ key: 'b', main: `<p>${w(40, 'b')}</p>` }),
    };
    for (const [name, html] of Object.entries(pages)) await write(name, html);

    const scoped = await runSeoChecks({ distPath: dir, config: resolveConfig() });
    expect(dupeContent(scoped.violations)).toEqual([]);

    const unscoped = await runSeoChecks({
      distPath: dir,
      config: resolveConfig({
        rules: { duplicateContent: { scopeToMain: false, minWords: 50 } },
      }),
    });
    expect(
      dupeContent(unscoped.violations)
        .map((v) => v.file)
        .sort(),
    ).toEqual(['a.html', 'b.html']);
  });

  it('does not let header/footer text lift a thin page over the word floor', async () => {
    // ~240 words of chrome, only 30 in <main>.
    await write('thin.html', mkPage({ key: 'thin', main: `<p>${w(30, 'thin')}</p>` }));

    const result = await runSeoChecks({ distPath: dir, config: resolveConfig() });

    const thin = result.violations.filter((v) => v.rule === 'thinContent');
    expect(thin).toHaveLength(1);
    // ~32 words counted (30 in the <p> + the <h1>), proving the ~240 words of
    // header/footer chrome were left out.
    const counted = Number(thin[0]?.message.match(/holds (\d+) word/)?.[1]);
    expect(counted).toBeGreaterThan(0);
    expect(counted).toBeLessThan(60);
    expect(thin[0]?.message).toContain('main content');
  });

  it('flags a duplicate meta description across pages', async () => {
    const desc =
      'One meta description reused verbatim on two different pages, which is over fifty chars.';
    await write('a.html', mkPage({ key: 'a', desc }));
    await write('b.html', mkPage({ key: 'b', desc }));

    const result = await runSeoChecks({ distPath: dir, config: resolveConfig() });

    const dupes = result.violations.filter(
      (v) => v.rule === 'metaDescription' && v.message.includes('Duplicate'),
    );
    expect(new Set(dupes.map((v) => v.file))).toEqual(new Set(['a.html', 'b.html']));
    expect(dupes.every((v) => v.severity === 'warning')).toBe(true);
  });

  it('flags a duplicate <h1> across pages', async () => {
    await write('a.html', mkPage({ key: 'a', h1: 'Best Widgets in Austin' }));
    await write('b.html', mkPage({ key: 'b', h1: 'Best Widgets in Austin' }));

    const result = await runSeoChecks({ distPath: dir, config: resolveConfig() });

    const dupes = result.violations.filter(
      (v) => v.rule === 'headingHierarchy' && v.message.includes('Duplicate <h1>'),
    );
    expect(new Set(dupes.map((v) => v.file))).toEqual(new Set(['a.html', 'b.html']));
  });

  it('flags an orphan page and spares linked and entry pages', async () => {
    await write(
      'index.html',
      mkPage({ key: 'home', main: `<p>${w(260, 'home')} <a href="/a/">see a</a></p>` }),
    );
    await write('a/index.html', mkPage({ key: 'a' }));
    await write('lonely/index.html', mkPage({ key: 'lonely' }));

    const result = await runSeoChecks({ distPath: dir, config: resolveConfig() });

    const orphans = result.violations.filter((v) => v.rule === 'orphanPages');
    expect(orphans.map((v) => v.file)).toEqual(['lonely/index.html']);
  });

  it('cross-checks pages against the XML sitemap', async () => {
    await write('index.html', mkPage({ key: 'home' }));
    await write('about/index.html', mkPage({ key: 'about' }));
    await write(
      'sitemap.xml',
      '<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc></url>' +
        '<url><loc>https://example.com/ghost/</loc></url></urlset>',
    );

    const result = await runSeoChecks({ distPath: dir, config: resolveConfig() });
    const sitemap = result.violations.filter((v) => v.rule === 'sitemapCoverage');

    expect(sitemap.some((v) => v.file === 'sitemap.xml' && v.message.includes('ghost'))).toBe(true);
    expect(
      sitemap.some(
        (v) => v.file === 'about/index.html' && v.message.includes('missing from every sitemap'),
      ),
    ).toBe(true);
  });

  it('does not fail the build on any of the new warning-level checks by default', async () => {
    await write('a.html', mkPage({ key: 'a', main: '<p>thin</p>', desc: 'short' }));
    await write('b.html', mkPage({ key: 'a', main: '<p>thin</p>', desc: 'short' }));

    const result = await runSeoChecks({ distPath: dir, config: resolveConfig() });

    expect(result.warningCount).toBeGreaterThan(0);
    const newRules = ['thinContent', 'structuredData', 'orphanPages', 'sitemapCoverage'];
    for (const rule of newRules) {
      const found = result.violations.filter((v) => v.rule === rule);
      expect(found.every((v) => v.severity === 'warning')).toBe(true);
    }
  });
});

describe('seoEnforcer integration', () => {
  it('exposes the astro:build:done hook', () => {
    const integration = seoEnforcer();
    expect(integration.name).toBe('astro-seo-enforcer');
    expect(typeof integration.hooks['astro:build:done']).toBe('function');
  });

  it('throws from the hook when errors are found', async () => {
    await write('bad.html', '<html><head></head><body></body></html>');
    const integration = seoEnforcer();
    const hook = integration.hooks['astro:build:done']!;

    await expect(
      hook(
        {
          dir: new URL(`file://${dir}/`),
          routes: [],
          pages: [],
          assets: new Map(),
          logger: silentLogger(),
        } as never,
        {} as never,
      ),
    ).rejects.toThrow(/error\(s\)/);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0; // reset so a failing hook does not fail the vitest process
  });

  it('writes JSON and HTML reports when configured, relative to the project root', async () => {
    await write('bad.html', '<html><head></head><body></body></html>');
    const integration = seoEnforcer({ report: { json: true, html: true }, failOn: 'never' });
    const configDone = integration.hooks['astro:config:done']!;
    const buildDone = integration.hooks['astro:build:done']!;

    await configDone({ config: { root: new URL(`file://${dir}/`) } } as never, {} as never);
    await buildDone(
      {
        dir: new URL(`file://${dir}/`),
        routes: [],
        pages: [],
        assets: new Map(),
        logger: silentLogger(),
      } as never,
      {} as never,
    );

    const jsonText = await readFile(path.join(dir, 'seo-report.json'), 'utf8');
    const report = JSON.parse(jsonText);
    expect(report.summary.errorCount).toBeGreaterThan(0);
    expect(report.score.value).toBeLessThan(100);
    expect(Array.isArray(report.violations)).toBe(true);

    const htmlText = await readFile(path.join(dir, 'seo-report.html'), 'utf8');
    expect(htmlText).toContain('<!doctype html>');
    expect(htmlText).toContain(String(report.score.value));
  });

  it('does not write reports that are not configured', async () => {
    await write('index.html', CLEAN_PAGE);
    const integration = seoEnforcer();
    const configDone = integration.hooks['astro:config:done']!;
    const buildDone = integration.hooks['astro:build:done']!;

    await configDone({ config: { root: new URL(`file://${dir}/`) } } as never, {} as never);
    await buildDone(
      {
        dir: new URL(`file://${dir}/`),
        routes: [],
        pages: [],
        assets: new Map(),
        logger: silentLogger(),
      } as never,
      {} as never,
    );

    await expect(readFile(path.join(dir, 'seo-report.json'), 'utf8')).rejects.toThrow();
    await expect(readFile(path.join(dir, 'seo-report.html'), 'utf8')).rejects.toThrow();
  });

  it('does not throw when failOn is "never"', async () => {
    await write('bad.html', '<html><head></head><body></body></html>');
    const integration = seoEnforcer({ failOn: 'never' });
    const hook = integration.hooks['astro:build:done']!;

    await expect(
      hook(
        {
          dir: new URL(`file://${dir}/`),
          routes: [],
          pages: [],
          assets: new Map(),
          logger: silentLogger(),
        } as never,
        {} as never,
      ),
    ).resolves.toBeUndefined();
  });
});

function silentLogger() {
  const noop = () => {};
  return { info: noop, warn: noop, error: noop, debug: noop, fork: () => silentLogger() };
}
