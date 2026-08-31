import type { Rule, Violation } from '../types.js';

/**
 * Requires a non-empty `<title>` whose length falls inside the configured range.
 *
 * Cross-page duplicate detection is handled by the runner (it needs to see every
 * page before it can decide), driven by the `checkDuplicates` option.
 */
export const titleRule: Rule = (ctx) => {
  const options = ctx.config.rules.title;
  if (!options) return [];

  const element = ctx.root.querySelector('title');
  const title = (element?.text ?? '').replace(/\s+/g, ' ').trim();

  if (!element || title.length === 0) {
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
