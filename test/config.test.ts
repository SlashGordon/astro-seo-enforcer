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
