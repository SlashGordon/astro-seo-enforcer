import type { Rule, Violation } from '../types.js';
import { tag, walkElements } from '../util/dom.js';

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/**
 * Enforces a sane heading outline:
 * - exactly one `<h1>` (configurable),
 * - optionally the first heading must be the `<h1>`,
 * - heading levels must not jump by more than one step.
 */
export const headingHierarchyRule: Rule = (ctx) => {
  const options = ctx.config.rules.headingHierarchy;
  if (!options) return [];

  const headings: Array<{ level: number; text: string }> = [];
  for (const element of walkElements(ctx.root)) {
    const name = tag(element);
    if (HEADING_TAGS.has(name)) {
      headings.push({
        level: Number(name.slice(1)),
        text: (element.text ?? '').replace(/\s+/g, ' ').trim(),
      });
    }
  }

  const violations: Violation[] = [];
  const h1Count = headings.filter((heading) => heading.level === 1).length;

  if (options.requireSingleH1 && h1Count !== 1) {
    violations.push({
      file: ctx.file,
      rule: 'headingHierarchy',
      severity: 'error',
      message:
        h1Count === 0
          ? 'No <h1> found — every page must contain exactly one <h1>.'
          : `Found ${h1Count} <h1> elements — only one <h1> is allowed per page.`,
    });
  }

  const first = headings[0];
  if (options.requireH1First && first && first.level !== 1) {
    violations.push({
      file: ctx.file,
      rule: 'headingHierarchy',
      severity: 'error',
      message: `First heading is <h${first.level}> ("${first.text || '—'}"), expected <h1>.`,
    });
  }

  if (options.enforceNoSkips) {
    let previousLevel: number | undefined;
    for (const heading of headings) {
      if (previousLevel !== undefined && heading.level - previousLevel > 1) {
        violations.push({
          file: ctx.file,
          rule: 'headingHierarchy',
          severity: 'error',
          message: `Heading level jumps from <h${previousLevel}> to <h${heading.level}> ("${heading.text || '—'}") — do not skip levels.`,
        });
      }
      previousLevel = heading.level;
    }
  }

  return violations;
};
