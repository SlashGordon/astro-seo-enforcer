import type { Severity, Violation } from '../types.js';
import { normalizeWhitespace } from '../util/dom.js';

/** One page's extracted value for a cross-page duplicate check. */
export interface DuplicateValuesPage {
  /** POSIX path of the page relative to the build output directory. */
  file: string;
  /** The value to compare, e.g. the page's `<title>` text. Whitespace need not be collapsed. */
  value: string | undefined;
}

/** How to report a duplicate found by {@link findDuplicateValues}. */
export interface DuplicateValuesSpec {
  rule: string;
  severity: Severity;
  label: string;
  hint: string;
}

/**
 * Flags any value shared verbatim by more than one page — the shape behind
 * "duplicate `<title>`", "duplicate meta description" and "duplicate `<h1>`".
 * Pages with an empty or `undefined` value are left out: that state is
 * already reported by the rule that owns the field.
 */
export function findDuplicateValues(
  pages: readonly DuplicateValuesPage[],
  spec: DuplicateValuesSpec,
): Violation[] {
  const registry = new Map<string, string[]>();
  for (const { file, value } of pages) {
    const key = normalizeWhitespace(value ?? '');
    if (key.length === 0) continue;
    const bucket = registry.get(key);
    if (bucket) bucket.push(file);
    else registry.set(key, [file]);
  }

  const violations: Violation[] = [];
  for (const [value, files] of registry) {
    if (files.length < 2) continue;
    for (const file of files) {
      const others = files.filter((candidate) => candidate !== file);
      violations.push({
        file,
        rule: spec.rule,
        severity: spec.severity,
        message: `${spec.label} "${value}" — also on: ${others.join(', ')}.`,
        hint: spec.hint,
      });
    }
  }
  return violations;
}
