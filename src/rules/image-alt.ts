import type { Rule, Violation } from '../types.js';
import { describeEl } from '../util/dom.js';

/**
 * Every `<img>` must carry an `alt` attribute. An empty value (`alt=""`) is
 * accepted for decorative images; a completely missing attribute is not.
 */
export const imageAltRule: Rule = (ctx) => {
  if (!ctx.config.rules.imageAlt) return [];

  const violations: Violation[] = [];
  for (const image of ctx.root.querySelectorAll('img')) {
    if (!image.hasAttribute('alt')) {
      violations.push({
        file: ctx.file,
        rule: 'imageAlt',
        severity: 'error',
        message: `<img> is missing the alt attribute: ${describeEl(image)}`,
        hint: 'Use alt="" for purely decorative images, or a short description otherwise.',
      });
    }
  }
  return violations;
};
