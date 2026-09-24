import type { Rule, Violation } from '../types.js';
import { collectVisibleText } from '../util/dom.js';

// Notices are short ("JavaScript required"); longer headings are real articles.
const MAX_NOTICE_LENGTH = 40;

/**
 * Astro ships static HTML, so a page whose content is almost empty, or whose
 * `<h1>` is a "JavaScript required" notice, is rendered client-side and
 * invisible to crawlers that do not execute JavaScript.
 */
export const jsDependencyRule: Rule = (ctx) => {
  const options = ctx.config.rules.jsDependency;
  if (!options) return [];

  const violations: Violation[] = [];
  const hint = 'Prerender the content instead of rendering the whole page on the client.';

  const scoped = options.scopeToMain && ctx.mainText !== undefined;
  const text = scoped ? (ctx.mainText as string) : ctx.bodyText;
  if (text.length < options.minTextLength) {
    violations.push({
      file: ctx.file,
      rule: 'jsDependency',
      severity: 'error',
      message: `${scoped ? '<main>' : '<body>'} exposes only ${text.length} character(s) of static text (min ${options.minTextLength}). Content may be rendered client-side and invisible to crawlers.`,
      hint,
    });
  }

  const notice = options.noJsNotice;
  if (notice) {
    for (const h1 of ctx.root.querySelectorAll('h1')) {
      const heading = collectVisibleText(h1);
      notice.lastIndex = 0;
      if (heading.length > MAX_NOTICE_LENGTH || !notice.test(heading)) continue;
      violations.push({
        file: ctx.file,
        rule: 'jsDependency',
        severity: 'error',
        message: `The page's <h1> is a no-JavaScript notice ("${heading}"). Crawlers that do not run JavaScript take it as the page topic.`,
        hint,
      });
    }
  }

  return violations;
};
