import type { Rule } from '../types.js';

/**
 * Astro ships static HTML, so a page whose `<body>` contains almost no text is
 * a strong signal that its content is injected client-side and therefore
 * invisible to crawlers that do not execute JavaScript.
 */
export const jsDependencyRule: Rule = (ctx) => {
  const options = ctx.config.rules.jsDependency;
  if (!options) return [];

  const length = ctx.bodyText.length;
  if (length >= options.minTextLength) return [];

  return [
    {
      file: ctx.file,
      rule: 'jsDependency',
      severity: 'error',
      message: `<body> exposes only ${length} character(s) of static text (min ${options.minTextLength}). Content may be rendered client-side and invisible to crawlers.`,
      hint: 'Server-render meaningful content instead of hydrating the whole page on the client.',
    },
  ];
};
