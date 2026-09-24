import type { Rule, Violation } from '../types.js';
import { collectVisibleText } from '../util/dom.js';
import { isExcluded } from '../util/exclude.js';

/**
 * Every page must link to the configured legal pages (Impressum, privacy
 * policy). German law (§ 5 DDG) requires the Impressum to be reachable from
 * every page, which in practice means a link in the shared footer.
 */
export const legalPagesRule: Rule = (ctx) => {
  const options = ctx.config.rules.legalPages;
  if (!options || isExcluded(ctx.file, options.ignore)) return [];

  const anchors = ctx.root.querySelectorAll('a').map((anchor) => ({
    href: anchor.getAttribute('href') ?? '',
    text: collectVisibleText(anchor),
  }));

  const violations: Violation[] = [];
  for (const { label, pattern } of options.links) {
    const found = anchors.some(({ href, text }) => test(pattern, href) || test(pattern, text));
    if (!found) {
      violations.push({
        file: ctx.file,
        rule: 'legalPages',
        severity: options.severity,
        message: `No link to the ${label} on this page.`,
        hint: 'Link it from the shared footer so it is reachable from every page.',
      });
    }
  }
  return violations;
};

function test(pattern: RegExp, value: string): boolean {
  // A global or sticky RegExp keeps `lastIndex` between calls.
  pattern.lastIndex = 0;
  return pattern.test(value);
}
