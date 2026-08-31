import type { Rule, Violation } from '../types.js';
import { walkElements } from '../util/dom.js';

/** Flags `id` attribute values that are used more than once in a document. */
export const duplicateIdRule: Rule = (ctx) => {
  if (!ctx.config.rules.duplicateId) return [];

  const counts = new Map<string, number>();
  for (const element of walkElements(ctx.root)) {
    const id = (element.getAttribute('id') ?? '').trim();
    if (id.length > 0) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const violations: Violation[] = [];
  for (const [id, count] of counts) {
    if (count > 1) {
      violations.push({
        file: ctx.file,
        rule: 'duplicateId',
        severity: 'error',
        message: `Duplicate id="${id}" appears ${count} times. IDs must be unique within a document.`,
      });
    }
  }
  return violations;
};
