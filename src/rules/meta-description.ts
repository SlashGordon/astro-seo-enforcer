import type { HTMLElement } from 'node-html-parser';
import type { Rule } from '../types.js';
import { normalizeWhitespace } from '../util/dom.js';

/** The page's `<meta name="description">` content, whitespace-normalised (empty when absent). */
export function extractMetaDescription(root: HTMLElement): string {
  const meta = root
    .querySelectorAll('meta')
    .find((element) => (element.getAttribute('name') ?? '').toLowerCase() === 'description');
  return normalizeWhitespace(meta?.getAttribute('content') ?? '');
}

/**
 * Requires a `<meta name="description">` whose length is within the range.
 *
 * Cross-page duplicate detection is handled by the runner, driven by the
 * `checkDuplicates` option.
 */
export const metaDescriptionRule: Rule = (ctx) => {
  const options = ctx.config.rules.metaDescription;
  if (!options) return [];

  const content = extractMetaDescription(ctx.root);

  if (content.length === 0) {
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
