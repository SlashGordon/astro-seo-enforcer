import type { Rule } from '../types.js';
import { tag, walkElements } from '../util/dom.js';

// ARIA landmark roles mapped to the equivalent semantic element.
const ROLE_EQUIVALENT: Record<string, string> = {
  banner: 'header',
  navigation: 'nav',
  main: 'main',
  contentinfo: 'footer',
  complementary: 'aside',
  region: 'section',
  article: 'article',
};

/**
 * Flags pages that rely purely on `<div>` / `<span>` by requiring a minimum
 * number of structural landmark tags (or their ARIA-role equivalents).
 */
export const semanticHtmlRule: Rule = (ctx) => {
  const options = ctx.config.rules.semanticHtml;
  if (!options) return [];

  const wanted = new Set(options.landmarkTags.map((name) => name.toLowerCase()));
  const found = new Set<string>();

  for (const element of walkElements(ctx.root)) {
    const name = tag(element);
    if (wanted.has(name)) found.add(name);

    const role = (element.getAttribute('role') ?? '').toLowerCase();
    const equivalent = ROLE_EQUIVALENT[role];
    if (equivalent && wanted.has(equivalent)) found.add(equivalent);
  }

  if (found.size >= options.minLandmarks) return [];

  return [
    {
      file: ctx.file,
      rule: 'semanticHtml',
      severity: 'error',
      message: `Page exposes ${found.size} semantic landmark(s) [${[...found].join(', ') || 'none'}], expected at least ${options.minLandmarks} of: ${[...wanted].join(', ')}.`,
      hint: 'Wrap page regions in <header>, <nav>, <main> and <footer> instead of generic <div>/<span>.',
    },
  ];
};
