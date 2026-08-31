import type { Rule, Violation } from '../types.js';

/**
 * Flags links whose text is not descriptive on its own ("click here", "read
 * more", …) and links that have no discernible accessible name at all.
 * These are emitted as warnings by default.
 */
export const anchorTextRule: Rule = (ctx) => {
  const options = ctx.config.rules.anchorText;
  if (!options) return [];

  const banned = new Set(options.bannedPhrases.map((phrase) => phrase.toLowerCase().trim()));
  const violations: Violation[] = [];

  for (const anchor of ctx.root.querySelectorAll('a')) {
    const href = anchor.getAttribute('href') ?? '';
    const text = (anchor.text ?? '').replace(/\s+/g, ' ').trim();
    // Drop surrounding quotes / trailing punctuation before comparing.
    const normalized = text.toLowerCase().replace(/^[\s"'“”(]+|[\s."'“”):;,!?]+$/g, '');

    if (text.length === 0) {
      const hasImageAlt = anchor
        .querySelectorAll('img')
        .some((image) => (image.getAttribute('alt') ?? '').trim().length > 0);
      const hasAccessibleName =
        (anchor.getAttribute('aria-label') ?? '').trim().length > 0 ||
        (anchor.getAttribute('title') ?? '').trim().length > 0 ||
        hasImageAlt;

      if (!hasAccessibleName) {
        violations.push({
          file: ctx.file,
          rule: 'anchorText',
          severity: 'warning',
          message: `<a href="${href || '#'}"> has no discernible link text.`,
          hint: 'Add visible text or an aria-label that describes the link target.',
        });
      }
      continue;
    }

    if (banned.has(normalized)) {
      violations.push({
        file: ctx.file,
        rule: 'anchorText',
        severity: 'warning',
        message: `Non-descriptive link text "${text}" (href="${href}").`,
        hint: 'Use link text that still makes sense out of context, e.g. "Read the setup guide".',
      });
    }
  }

  return violations;
};
