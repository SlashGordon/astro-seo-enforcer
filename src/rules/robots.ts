import type { Rule } from '../types.js';

/**
 * Surfaces `<meta name="robots">` / `<meta name="googlebot">` directives such as
 * `noindex` / `nofollow`. Emitted as a warning by default so an accidental
 * de-indexing directive on a production page is impossible to miss.
 */
export const robotsRule: Rule = (ctx) => {
  const options = ctx.config.rules.robots;
  if (!options) return [];

  const directives = new Set(options.directives.map((directive) => directive.toLowerCase()));
  const hits = new Set<string>();

  for (const meta of ctx.root.querySelectorAll('meta')) {
    const name = (meta.getAttribute('name') ?? '').toLowerCase();
    if (name !== 'robots' && name !== 'googlebot') continue;

    const tokens = (meta.getAttribute('content') ?? '')
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);
    for (const token of tokens) {
      if (directives.has(token)) hits.add(token);
    }
  }

  if (hits.size === 0) return [];

  return [
    {
      file: ctx.file,
      rule: 'robots',
      severity: options.severity,
      message: `This page sets robots directive(s): ${[...hits].join(', ')}. It may be dropped from search results or have its links ignored.`,
      hint: 'Remove the directive for production pages, or add this route to `exclude` if the exclusion is intentional.',
    },
  ];
};
