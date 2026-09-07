import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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

    const result = await runSeoChecks({ distPath: dir, config: resolveConfig() });

    expect(result.scannedFiles).toBe(1);
    expect(result.violations).toEqual([]);
    expect(result.errorCount).toBe(0);
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

    expect(result.violations).toEqual([]);
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
