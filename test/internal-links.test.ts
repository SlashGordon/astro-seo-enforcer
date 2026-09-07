import { describe, expect, it } from 'vitest';
import { internalLinksRule } from '../src/rules/internal-links.js';
import { makeContext } from './helpers.js';

const doc = (body: string): string =>
  `<!doctype html><html><head></head><body>${body}</body></html>`;

describe('internalLinksRule', () => {
  it('flags a link to a file that is not in the build, at error severity', () => {
    const ctx = makeContext(doc('<a href="/missing/">Gone</a>'), {}, 'index.html', ['index.html']);
    const found = internalLinksRule(ctx);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'internalLinks', severity: 'error' });
  });

  it('accepts a link that resolves to a built file', () => {
    const ctx = makeContext(doc('<a href="/about/">About</a>'), {}, 'index.html', [
      'index.html',
      'about/index.html',
    ]);
    expect(internalLinksRule(ctx)).toEqual([]);
  });

  it('reports a broken same-page fragment as a warning, not an error', () => {
    const ctx = makeContext(doc('<a href="#nope">Jump</a>'), {}, 'index.html', ['index.html']);
    const found = internalLinksRule(ctx);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'internalLinks', severity: 'warning' });
    expect(found[0]?.message).toContain('#nope');
  });

  it('lets fragmentSeverity be raised back to error', () => {
    const ctx = makeContext(doc('<a href="#nope">Jump</a>'), {
      rules: { internalLinks: { fragmentSeverity: 'error' } },
    });
    expect(internalLinksRule(ctx)[0]?.severity).toBe('error');
  });

  it('does not flag a fragment whose target id exists', () => {
    const ctx = makeContext(doc('<a href="#here">Jump</a><h2 id="here">Here</h2>'));
    expect(internalLinksRule(ctx)).toEqual([]);
  });

  it('skips fragment checks entirely when checkFragments is off', () => {
    const ctx = makeContext(doc('<a href="#nope">Jump</a>'), {
      rules: { internalLinks: { checkFragments: false } },
    });
    expect(internalLinksRule(ctx)).toEqual([]);
  });
});
