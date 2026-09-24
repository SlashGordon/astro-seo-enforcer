import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { runLiveChecks, twinHost } from '../src/live.js';
import type { FetchLike } from '../src/live.js';
import { CLEAN_PAGE } from './helpers.js';

interface FakeRoute {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  /** Final URL after redirects (for `redirect: 'follow'`). */
  url?: string;
}

const GOOD_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=()',
};

const SITEMAP =
  '<urlset><url><loc>https://www.example.com/</loc></url>' +
  '<url><loc>https://www.example.com/about/</loc></url></urlset>';

function fakeFetch(routes: Record<string, FakeRoute>): FetchLike {
  return async (url) => {
    const route = routes[url];
    if (!route) throw new TypeError(`fetch failed: ${url}`);
    const response = new Response(route.body ?? '', {
      status: route.status ?? 200,
      headers: route.headers,
    });
    Object.defineProperty(response, 'url', { value: route.url ?? url });
    return response;
  };
}

const healthySite = (): Record<string, FakeRoute> => ({
  'https://example.com/': { status: 301, headers: { location: 'https://www.example.com/' } },
  'http://www.example.com/': { status: 301, headers: { location: 'https://www.example.com/' } },
  'https://www.example.com/': { body: CLEAN_PAGE, headers: GOOD_HEADERS },
  'https://www.example.com/about/': {
    body: CLEAN_PAGE.replace('Widgets', 'About'),
    headers: GOOD_HEADERS,
  },
  'https://www.example.com/robots.txt': {
    body: 'User-agent: *\nAllow: /\nSitemap: https://www.example.com/sitemap-index.xml\n',
    headers: { 'content-type': 'text/plain' },
  },
  'https://www.example.com/sitemap-index.xml': {
    body: '<sitemapindex><sitemap><loc>https://www.example.com/sitemap-0.xml</loc></sitemap></sitemapindex>',
  },
  'https://www.example.com/sitemap-0.xml': { body: SITEMAP },
});

const run = (routes: Record<string, FakeRoute>, resolvable = ['www.example.com', 'example.com']) =>
  runLiveChecks({
    url: 'https://www.example.com/',
    config: resolveConfig({ rules: { title: { checkDuplicates: false } } }),
    fetch: fakeFetch(routes),
    lookup: async (host) => {
      if (!resolvable.includes(host)) throw new Error('ENODATA');
    },
  });

describe('twinHost', () => {
  it('pairs apex and www, and leaves other hosts alone', () => {
    expect(twinHost('www.example.com')).toBe('example.com');
    expect(twinHost('example.com')).toBe('www.example.com');
    expect(twinHost('blog.example.com')).toBeUndefined();
    expect(twinHost('127.0.0.1')).toBeUndefined();
  });
});

describe('runLiveChecks', () => {
  it('passes a healthy site and lints every sitemap page', async () => {
    const result = await run(healthySite());
    expect(result.violations).toEqual([]);
    expect(result.scannedFiles).toBe(2);
  });

  it('lists every check group, including passed and skipped ones', async () => {
    const healthy = await run(healthySite());
    expect(healthy.checks.map((c) => [c.rule, c.ran, c.errors + c.warnings])).toEqual([
      ['liveDomain', true, 0],
      ['liveHeaders', true, 0],
      ['liveHttp', true, 0],
      ['pageRules', true, 0],
    ]);

    const down = await run(healthySite(), []);
    expect(down.checks.map((c) => [c.rule, c.ran, c.errors])).toEqual([
      ['liveDomain', true, 1],
      ['liveHeaders', false, 0],
      ['liveHttp', false, 0],
      ['pageRules', false, 0],
    ]);
  });

  it('reports the problems from a real review', async () => {
    const routes = healthySite();
    routes['https://www.example.com/'] = {
      body: CLEAN_PAGE.replace('<h1>Widgets</h1>', '<h1>JavaScript required</h1>'),
      headers: { 'content-type': 'text/html' },
    };
    const result = await run(routes, ['www.example.com']);
    const messages = result.violations.map((v) => `${v.rule}: ${v.message}`);

    expect(messages).toContain(
      'liveDomain: example.com does not resolve (no A/AAAA record), so every link and type-in using example.com fails.',
    );
    expect(messages).toContain('liveHeaders: No Strict-Transport-Security (HSTS) header.');
    expect(messages).toContain('liveHeaders: No Content-Security-Policy header.');
    expect(messages).toContain('liveHeaders: No Permissions-Policy header.');
    expect(messages).toContain(
      'liveHeaders: Neither X-Frame-Options nor CSP frame-ancestors is set (clickjacking).',
    );
    expect(
      messages.some((m) => m.startsWith("jsDependency: The page's <h1> is a no-JavaScript notice")),
    ).toBe(true);
  });

  it('flags an apex that answers with a 5xx, and one serving duplicate content', async () => {
    const broken = healthySite();
    broken['https://example.com/'] = { status: 530 };
    expect((await run(broken)).violations[0]).toMatchObject({
      file: 'example.com',
      severity: 'error',
      message: 'https://example.com/ answers 530.',
    });

    const duplicate = healthySite();
    duplicate['https://example.com/'] = { body: CLEAN_PAGE };
    expect((await run(duplicate)).violations[0]?.message).toContain('duplicate content');
  });

  it('flags temporary redirects and http that is not redirected', async () => {
    const routes = healthySite();
    routes['https://example.com/'] = {
      status: 302,
      headers: { location: 'https://www.example.com/' },
    };
    routes['http://www.example.com/'] = { body: CLEAN_PAGE };
    const messages = (await run(routes)).violations.map((v) => v.message);
    expect(messages).toContain('https://example.com/ uses a temporary 302 redirect.');
    expect(messages).toContain(
      'http://www.example.com/ serves the page instead of redirecting to https.',
    );
  });

  it('flags redirect chains where one hop would do', async () => {
    const routes = healthySite();
    routes['http://example.com/'] = { status: 301, headers: { location: 'https://example.com/' } };
    const result = await run(routes);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: 'example.com',
        rule: 'liveDomain',
        severity: 'warning',
        message:
          'http://example.com/ takes 2 redirects to reach https://www.example.com/: ' +
          'http://example.com/ → https://example.com/ → https://www.example.com/.',
      }),
    ]);
  });

  it('accepts the same-host https upgrade that HSTS preload requires', async () => {
    const routes = healthySite();
    routes['http://example.com/'] = { status: 301, headers: { location: 'https://example.com/' } };
    routes['https://example.com/'] = {
      status: 301,
      headers: {
        location: 'https://www.example.com/',
        'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
      },
    };
    expect((await run(routes)).violations).toEqual([]);
  });

  it('flags redirect loops', async () => {
    const routes = healthySite();
    routes['http://www.example.com/'] = {
      status: 301,
      headers: { location: 'https://www.example.com/start' },
    };
    routes['https://www.example.com/start'] = {
      status: 301,
      headers: { location: 'http://www.example.com/' },
    };
    const messages = (await run(routes)).violations.map((v) => v.message);
    expect(messages).toContain(
      'http://www.example.com/ ends in a redirect loop: ' +
        'http://www.example.com/ → https://www.example.com/start → http://www.example.com/.',
    );
  });

  it('flags robots.txt served as HTML, broken sitemap pages and noindex headers', async () => {
    const routes = healthySite();
    routes['https://www.example.com/robots.txt'] = {
      body: CLEAN_PAGE,
      headers: { 'content-type': 'text/html' },
    };
    routes['https://www.example.com/sitemap-index.xml'] = {
      body: SITEMAP.replace('/about/', '/gone/'),
    };
    routes['https://www.example.com/gone/'] = { status: 404 };
    routes['https://www.example.com/'] = {
      body: CLEAN_PAGE,
      headers: { ...GOOD_HEADERS, 'x-robots-tag': 'noindex' },
    };
    const messages = (await run(routes)).violations.map((v) => v.message);

    expect(messages).toContain(
      'robots.txt is served as HTML; the host probably falls back to index.html.',
    );
    expect(messages).toContain('https://www.example.com/gone/ answers 404.');
    expect(messages).toContain('Served with "X-Robots-Tag: noindex", so search engines drop it.');
  });

  it('stops early when the host itself does not resolve', async () => {
    const result = await run(healthySite(), []);
    expect(result.violations.map((v) => v.message)).toEqual([
      'www.example.com does not resolve (no A/AAAA record).',
    ]);
  });

  it('checks live pages against the CSP they are served with', async () => {
    const routes = healthySite();
    routes['https://www.example.com/about/'] = {
      body: CLEAN_PAGE.replace(
        '</head>',
        '<script src="https://cdn.other.com/x.js"></script></head>',
      ),
      headers: GOOD_HEADERS,
    };
    const csp = (await run(routes)).violations.filter((v) => v.rule === 'liveHeaders');
    expect(csp.map((v) => v.message)).toEqual([
      'Content-Security-Policy "default-src" blocks <script src> "https://cdn.other.com/x.js" on /about/.',
    ]);
  });
});
