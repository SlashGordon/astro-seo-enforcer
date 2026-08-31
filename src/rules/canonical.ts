import type { Rule } from '../types.js';

/**
 * Requires exactly one `<link rel="canonical">` with a usable `href`.
 * When `requireAbsolute` is set (default), the href must be an absolute
 * http(s) URL — relative canonicals are a common and costly mistake.
 */
export const canonicalRule: Rule = (ctx) => {
  const options = ctx.config.rules.canonical;
  if (!options) return [];

  const canonicals = ctx.root
    .querySelectorAll('link')
    .filter((link) =>
      (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).includes('canonical'),
    );

  if (canonicals.length === 0) {
    return [
      {
        file: ctx.file,
        rule: 'canonical',
        severity: 'error',
        message: 'Missing <link rel="canonical" href="…">.',
        hint: 'Emit a canonical link in your <head> (e.g. using Astro.url and the `site` config).',
      },
    ];
  }

  if (canonicals.length > 1) {
    return [
      {
        file: ctx.file,
        rule: 'canonical',
        severity: 'error',
        message: `Found ${canonicals.length} canonical <link> tags — exactly one is allowed.`,
      },
    ];
  }

  const href = (canonicals[0]?.getAttribute('href') ?? '').trim();
  if (href.length === 0) {
    return [
      {
        file: ctx.file,
        rule: 'canonical',
        severity: 'error',
        message: 'The canonical <link> has no href value.',
      },
    ];
  }

  if (options.requireAbsolute) {
    let url: URL | undefined;
    try {
      url = new URL(href);
    } catch {
      url = undefined;
    }
    if (!url || !/^https?:$/.test(url.protocol)) {
      return [
        {
          file: ctx.file,
          rule: 'canonical',
          severity: 'error',
          message: `Canonical href is not an absolute http(s) URL: "${href}".`,
          hint: 'Set `site` in astro.config.* so Astro can build absolute canonical URLs.',
        },
      ];
    }
  }

  return [];
};
