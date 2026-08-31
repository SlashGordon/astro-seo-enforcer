import type { Rule } from '../types.js';

/** Requires a `<meta name="description">` whose length is within the range. */
export const metaDescriptionRule: Rule = (ctx) => {
  const options = ctx.config.rules.metaDescription;
  if (!options) return [];

  const meta = ctx.root
    .querySelectorAll('meta')
    .find((element) => (element.getAttribute('name') ?? '').toLowerCase() === 'description');
  const content = (meta?.getAttribute('content') ?? '').replace(/\s+/g, ' ').trim();

  if (!meta || content.length === 0) {
    return [
      {
        file: ctx.file,
        rule: 'metaDescription',
        severity: 'error',
        message: 'Missing or empty <meta name="description">.',
        hint: `Add a summary between ${options.minLength} and ${options.maxLength} characters.`,
      },
    ];
  }

  if (content.length < options.minLength) {
    return [
      {
        file: ctx.file,
        rule: 'metaDescription',
        severity: 'error',
        message: `Meta description is too short: ${content.length} chars (min ${options.minLength}).`,
      },
    ];
  }

  if (content.length > options.maxLength) {
    return [
      {
        file: ctx.file,
        rule: 'metaDescription',
        severity: 'error',
        message: `Meta description is too long: ${content.length} chars (max ${options.maxLength}).`,
      },
    ];
  }

  return [];
};
