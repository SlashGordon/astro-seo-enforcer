import type { HTMLElement } from 'node-html-parser';
import type { Rule, Violation } from '../types.js';
import { normalizeWhitespace } from '../util/dom.js';

/** The page's `<title>` text, whitespace-normalised (empty when absent). */
export function extractTitle(root: HTMLElement): string {
  return normalizeWhitespace(root.querySelector('title')?.text ?? '');
}

/**
 * Requires a non-empty `<title>` whose length falls inside the configured range.
 *
 * Cross-page duplicate detection is handled by the runner (it needs to see every
 * page before it can decide), driven by the `checkDuplicates` option.
 */
export const titleRule: Rule = (ctx) => {
  const options = ctx.config.rules.title;
  if (!options) return [];

  const title = extractTitle(ctx.root);

  if (title.length === 0) {
    return [
      {
        file: ctx.file,
        rule: 'title',
        severity: 'error',
        message: 'Missing or empty <title> tag.',
        hint: 'Add a unique, descriptive <title> inside <head>.',
      },
    ];
  }

  const violations: Violation[] = [];
  if (title.length < options.minLength) {
    violations.push({
      file: ctx.file,
      rule: 'title',
      severity: 'error',
      message: `<title> is too short: ${title.length} chars (min ${options.minLength}) — "${title}".`,
    });
  } else if (title.length > options.maxLength) {
    violations.push({
      file: ctx.file,
      rule: 'title',
      severity: 'error',
      message: `<title> is too long: ${title.length} chars (max ${options.maxLength}) — "${title}".`,
    });
  }

  return violations;
};
