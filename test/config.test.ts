import { describe, expect, it } from 'vitest';
import { defineSeoEnforcerConfig, resolveConfig } from '../src/config.js';

describe('resolveConfig', () => {
  it('applies sensible defaults', () => {
    const config = resolveConfig();

    expect(config.enabled).toBe(true);
    expect(config.failOn).toBe('error');
    expect(config.exclude).toEqual(['404.html']);
    expect(config.rules.title).toMatchObject({
      minLength: 30,
      maxLength: 60,
      checkDuplicates: true,
    });
    expect(config.rules.metaDescription).toMatchObject({ minLength: 50, maxLength: 160 });
    expect(config.rules.imageAlt).toBe(true);
    expect(config.rules.duplicateId).toBe(true);
    expect(config.rules.imageSize).toMatchObject({
      severity: 'warning',
      maxBytes: 200 * 1024,
      requireDimensions: true,
      maxScaleFactor: 2,
    });
    expect(config.rules.duplicateContent).toMatchObject({
      severity: 'warning',
      threshold: 0.9,
      minUniqueRatio: 0.2,
      scopeToMain: true,
      minWords: 200,
      maxPages: 1500,
    });
    expect(config.rules.metaDescription).toMatchObject({ checkDuplicates: true });
    expect(config.rules.headingHierarchy).toMatchObject({ checkDuplicateH1: true });
    expect(config.rules.internalLinks).toMatchObject({
      severity: 'error',
      checkFragments: true,
      fragmentSeverity: 'warning',
    });
    expect(config.rules.thinContent).toMatchObject({
      severity: 'warning',
      minWords: 250,
      scopeToMain: true,
    });
    expect(config.rules.structuredData).toMatchObject({
      severity: 'warning',
      require: false,
      requireTypes: [],
    });
    expect(config.rules.orphanPages).toMatchObject({
      severity: 'warning',
      entryPoints: ['index.html'],
    });
    expect(config.rules.sitemapCoverage).toMatchObject({
      severity: 'warning',
      requireInSitemap: true,
    });
  });

  it('disables the programmatic-SEO rules when set to false', () => {
    const config = resolveConfig({
      rules: {
        thinContent: false,
        structuredData: false,
        orphanPages: false,
        sitemapCoverage: false,
      },
    });
    expect(config.rules.thinContent).toBe(false);
    expect(config.rules.structuredData).toBe(false);
    expect(config.rules.orphanPages).toBe(false);
    expect(config.rules.sitemapCoverage).toBe(false);
  });

  it('disables a rule when it is set to false', () => {
    const config = resolveConfig({ rules: { title: false, imageAlt: false, robots: false } });

    expect(config.rules.title).toBe(false);
    expect(config.rules.imageAlt).toBe(false);
    expect(config.rules.robots).toBe(false);
  });

  it('merges partial rule options over the defaults', () => {
    const config = resolveConfig({ rules: { title: { maxLength: 70 } } });

    expect(config.rules.title).toMatchObject({
      minLength: 30,
      maxLength: 70,
      checkDuplicates: true,
    });
  });

  it('keeps user-provided top-level options', () => {
    const config = resolveConfig({ enabled: false, failOn: 'warning', exclude: ['drafts/**'] });

    expect(config.enabled).toBe(false);
    expect(config.failOn).toBe('warning');
    expect(config.exclude).toEqual(['drafts/**']);
  });

  it('treats `true` the same as "enabled with defaults"', () => {
    expect(resolveConfig({ rules: { title: true } }).rules.title).toEqual(
      resolveConfig().rules.title,
    );
  });
});

describe('defineSeoEnforcerConfig', () => {
  it('is an identity helper', () => {
    const input = { failOn: 'never' as const };
    expect(defineSeoEnforcerConfig(input)).toBe(input);
  });
});
