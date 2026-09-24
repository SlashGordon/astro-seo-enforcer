import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LLMS_TXT, DEFAULT_ROBOTS_TXT, DEFAULT_SECURITY_HEADERS } from '../src/config.js';
import type { SecurityHeadersRuleOptions } from '../src/config.js';
import { findLlmsTxtIssues } from '../src/rules/llms-txt.js';
import { legalPagesRule } from '../src/rules/legal-pages.js';
import { findRobotsTxtIssues, matchRobotsRule, parseRobotsTxt } from '../src/rules/robots-txt.js';
import {
  findSecurityHeaderIssues,
  headersForPath,
  parseHeadersFile,
} from '../src/rules/security-headers.js';
import { computeScore } from '../src/score.js';
import { collectCspResources, cspHash } from '../src/util/csp.js';
import { makeContext } from './helpers.js';

const siteFiles = new Set(['index.html', 'about/index.html', 'blog/a/index.html', 'sitemap.xml']);

describe('robotsTxt', () => {
  const run = (robotsTxt: string | undefined, sitemapFiles: string[] = []) =>
    findRobotsTxtIssues(
      { robotsTxt, siteFiles, sitemapFiles: new Set(sitemapFiles), hasSitemap: true },
      DEFAULT_ROBOTS_TXT,
    );

  it('flags a missing robots.txt', () => {
    expect(run(undefined).map((v) => v.message)).toEqual(['No robots.txt in the build output.']);
  });

  it('accepts a sane robots.txt', () => {
    expect(run('User-agent: *\nAllow: /\nSitemap: https://x.com/sitemap.xml\n')).toEqual([]);
  });

  it('flags a missing Sitemap line and a sitemap that does not exist', () => {
    expect(run('User-agent: *\nAllow: /\n')[0]?.message).toContain('no "Sitemap:" line');
    expect(run('User-agent: *\nSitemap: https://x.com/nope.xml')[0]?.message).toContain(
      'does not exist',
    );
    expect(run('User-agent: *\nSitemap: /sitemap.xml')[0]?.message).toContain(
      'not an absolute URL',
    );
  });

  it('flags a whole-site block once instead of per page', () => {
    const violations = run('User-agent: *\nDisallow: /\nSitemap: https://x.com/sitemap.xml', [
      'index.html',
      'about/index.html',
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('blocks the whole site');
  });

  it('flags sitemap pages that robots.txt blocks', () => {
    const violations = run('User-agent: *\nDisallow: /blog/\nSitemap: https://x.com/sitemap.xml', [
      'index.html',
      'blog/a/index.html',
    ]);
    expect(violations.map((v) => v.file)).toEqual(['blog/a/index.html']);
  });

  it('uses the most specific group and the longest rule', () => {
    const robots = parseRobotsTxt(
      'User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nDisallow: /private\nAllow: /private/ok$\n',
    );
    expect(matchRobotsRule(robots, 'googlebot', '/')).toBeUndefined();
    expect(matchRobotsRule(robots, 'googlebot', '/private/x')?.allow).toBe(false);
    expect(matchRobotsRule(robots, 'googlebot', '/private/ok')?.allow).toBe(true);
    expect(matchRobotsRule(robots, '*', '/anything')?.allow).toBe(false);
  });
});

describe('llmsTxt', () => {
  const run = (llmsTxt: string | undefined) =>
    findLlmsTxtIssues(
      { llmsTxt, siteFiles: new Set([...siteFiles, 'about.md']), site: 'https://x.com' },
      DEFAULT_LLMS_TXT,
    );

  it('flags a missing file and a missing title', () => {
    expect(run(undefined)[0]?.message).toContain('No llms.txt');
    expect(run('> summary\n\n# Title')[0]?.message).toContain('must start with');
  });

  it('checks links to this site only', () => {
    const violations = run(
      '# X\n\n> Summary\n\n## Docs\n\n- [About](/about.md): about\n- [Blog](https://x.com/blog/a/)\n' +
        '- [Gone](https://x.com/gone/)\n- [Elsewhere](https://other.com/nope)\n',
    );
    expect(violations.map((v) => v.message)).toEqual([
      'llms.txt links to "https://x.com/gone/", which does not exist in the build output.',
    ]);
  });
});

const HEADERS = `/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://umami.dieck-labs.de; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://umami.dieck-labs.de; frame-ancestors 'none'
`;

const TOOLS_PAGE = `<!doctype html><html><head>
<script type="application/ld+json">{"@type":"WebSite"}</script>
<script defer src="https://umami.dieck-labs.de/getinfo.js"></script>
<link rel="stylesheet" href="/assets/Layout.css"><link rel="icon" href="/favicon.svg">
</head><body><script type="module">document.body.dataset.ready = '1';</script>
<main><h1>Tools</h1><img src="/a.png" alt=""></main></body></html>`;

describe('securityHeaders', () => {
  const run = (
    headersFile: string | undefined,
    pages: Array<{ file: string; html: string }> = [],
    overrides: Partial<SecurityHeadersRuleOptions> = {},
  ) =>
    findSecurityHeaderIssues(
      {
        headersFile,
        pages: pages.map(({ file, html }) => ({
          file,
          resources: collectCspResources(parse(html)),
        })),
        site: 'https://www.slashgordon.link',
      },
      { ...DEFAULT_SECURITY_HEADERS, ...overrides },
    );

  it('flags a missing _headers file', () => {
    expect(run(undefined)[0]?.message).toBe('No _headers file in the build output.');
  });

  it('passes a real-world _headers file and page', () => {
    expect(run(HEADERS, [{ file: 'tools/index.html', html: TOOLS_PAGE }])).toEqual([]);
  });

  it('flags missing required headers and missing frame protection', () => {
    const messages = run('/*\n  Referrer-Policy: no-referrer\n').map((v) => v.message);
    expect(messages).toEqual([
      'Header "Content-Security-Policy" is not set for "/".',
      'Header "X-Content-Type-Options" is not set for "/".',
      'Nothing stops other sites from framing your pages (clickjacking).',
    ]);
  });

  it('flags a third-party script the CSP does not allow, once across pages', () => {
    const html = TOOLS_PAGE.replace(
      '</head>',
      '<script src="https://cdn.example.com/lib.js"></script></head>',
    );
    const violations = run(HEADERS, [
      { file: 'a/index.html', html },
      { file: 'b/index.html', html },
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toBe(
      'Content-Security-Policy "script-src" blocks <script src> "https://cdn.example.com/lib.js" on a/index.html and 1 other page(s).',
    );
    expect(violations[0]?.hint).toContain('https://cdn.example.com');
  });

  it('suggests the hash for a blocked inline script', () => {
    const headers = HEADERS.replace("script-src 'self' 'unsafe-inline'", "script-src 'self'");
    const violations = run(headers, [{ file: 'index.html', html: TOOLS_PAGE }]);
    const hash = cspHash("document.body.dataset.ready = '1';");
    expect(violations).toHaveLength(1);
    expect(violations[0]?.hint).toContain(`'${hash}'`);

    const hashed = headers.replace("script-src 'self'", `script-src 'self' '${hash}'`);
    expect(run(hashed, [{ file: 'index.html', html: TOOLS_PAGE }])).toEqual([]);
  });

  it('flags images from hosts img-src does not list', () => {
    const html = TOOLS_PAGE.replace('/a.png', 'https://images.example.com/a.png');
    expect(run(HEADERS, [{ file: 'index.html', html }])[0]?.message).toContain('"img-src"');
  });

  it('applies path-specific blocks and detaches headers', () => {
    const blocks = parseHeadersFile(
      '/*\n  X-Frame-Options: DENY\n/embed/*\n  ! X-Frame-Options\n  X-Robots-Tag: noindex\n',
    );
    expect(headersForPath(blocks, '/').has('x-frame-options')).toBe(true);
    const embed = headersForPath(blocks, '/embed/widget/');
    expect(embed.has('x-frame-options')).toBe(false);
    expect(embed.get('x-robots-tag')).toEqual(['noindex']);
  });
});

describe('legalPages', () => {
  const page = (footer: string) =>
    `<!doctype html><html><body><main><h1>Hi</h1></main><footer>${footer}</footer></body></html>`;

  it('is off by default', () => {
    expect(legalPagesRule(makeContext(page('')))).toEqual([]);
  });

  it('flags pages without Impressum or privacy links', () => {
    const violations = legalPagesRule(
      makeContext(page('<a href="/impressum/">Impressum</a>'), { rules: { legalPages: true } }),
    );
    expect(violations.map((v) => v.message)).toEqual([
      'No link to the privacy policy on this page.',
    ]);
  });

  it('matches link text as well as href', () => {
    const violations = legalPagesRule(
      makeContext(page('<a href="/legal/">Imprint</a><a href="/p/">Privacy</a>'), {
        rules: { legalPages: true },
      }),
    );
    expect(violations).toEqual([]);
  });

  it('honours ignore', () => {
    const ctx = makeContext(page(''), { rules: { legalPages: { ignore: ['index.html'] } } });
    expect(legalPagesRule(ctx)).toEqual([]);
  });
});

describe('score', () => {
  it('ignores site-hygiene rules', () => {
    const score = computeScore(
      [
        { file: '_headers', rule: 'securityHeaders', severity: 'error', message: 'x' },
        { file: 'index.html', rule: 'legalPages', severity: 'warning', message: 'x' },
        { file: 'llms.txt', rule: 'llmsTxt', severity: 'warning', message: 'x' },
      ],
      1,
      { errorWeight: 6, warningWeight: 1.5 },
    );
    expect(score.value).toBe(100);
  });
});
