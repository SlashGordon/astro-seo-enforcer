import type { Rule } from '../types.js';

/** Count word-like tokens (letters and digits) in a string. */
function wordCount(text: string): number {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

/**
 * Flags pages whose main content is too thin to rank — the classic failure of
 * programmatic pages that swap a variable into a template and little else.
 *
 * When `scopeToMain` is set (default), the count is taken from the first
 * `<main>` / `<article>` / `role="main"` region so shared nav, header and
 * footer boilerplate does not inflate it. Pages that declare no such region
 * fall back to the full `<body>` text.
 *
 * This is the "thin but not empty" tier: `jsDependency` already fails a build
 * whose `<body>` is almost text-free.
 */
export const thinContentRule: Rule = (ctx) => {
  const options = ctx.config.rules.thinContent;
  if (!options) return [];

  const scoped = options.scopeToMain && ctx.mainText !== undefined;
  const text = scoped ? (ctx.mainText as string) : ctx.bodyText;
  const words = wordCount(text);
  if (words >= options.minWords) return [];

  const region = scoped ? 'main content' : '<body>';
  return [
    {
      file: ctx.file,
      rule: 'thinContent',
      severity: options.severity,
      message: `Thin content: ${region} holds ${words} word(s) (min ${options.minWords}).`,
      hint: 'Add substantive, page-specific content, or drop the page and consolidate it into a stronger one. noindex genuinely thin variations so they do not dilute the site.',
    },
  ];
};
