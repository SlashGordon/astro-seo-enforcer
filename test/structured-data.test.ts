import { describe, expect, it } from 'vitest';
import { structuredDataRule } from '../src/rules/structured-data.js';
import { makeContext } from './helpers.js';

const withLd = (json: string): string =>
  `<!doctype html><html><head><script type="application/ld+json">${json}</script></head><body><main><h1>x</h1></main></body></html>`;

const NOTHING = '<!doctype html><html><head></head><body><main><h1>x</h1></main></body></html>';

describe('structuredDataRule', () => {
  it('accepts a page with valid JSON-LD', () => {
    expect(structuredDataRule(makeContext(withLd('{"@type":"Article"}')))).toEqual([]);
  });

  it('flags a JSON-LD block that does not parse', () => {
    const found = structuredDataRule(makeContext(withLd('{ not json ]')));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'structuredData', severity: 'warning' });
    expect(found[0]?.message).toContain('Invalid JSON-LD');
  });

  it('does not nag about missing JSON-LD by default', () => {
    expect(structuredDataRule(makeContext(NOTHING))).toEqual([]);
  });

  it('flags missing JSON-LD when require is set', () => {
    const found = structuredDataRule(
      makeContext(NOTHING, {
        rules: { structuredData: { require: true } },
      }),
    );
    expect(found[0]?.message).toContain('No JSON-LD');
  });

  it('checks requireTypes against @graph entries', () => {
    const ctx = makeContext(withLd('{"@graph":[{"@type":"WebPage"},{"@type":"BreadcrumbList"}]}'), {
      rules: { structuredData: { requireTypes: ['BreadcrumbList', 'Product'] } },
    });
    const found = structuredDataRule(ctx);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('Product');
    expect(found[0]?.message).not.toContain('BreadcrumbList');
  });

  it('is a no-op when disabled', () => {
    expect(
      structuredDataRule(makeContext(withLd('nope'), { rules: { structuredData: false } })),
    ).toEqual([]);
  });
});
