import type { Violation } from '../types.js';

/** Group violations by file, sorted alphabetically by file path. */
export function groupByFile(violations: readonly Violation[]): Array<[string, Violation[]]> {
  const byFile = new Map<string, Violation[]>();
  for (const violation of violations) {
    const bucket = byFile.get(violation.file);
    if (bucket) bucket.push(violation);
    else byFile.set(violation.file, [violation]);
  }
  return [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Count the `error`-severity violations in a list. */
export function countErrors(violations: readonly Violation[]): number {
  return violations.filter((violation) => violation.severity === 'error').length;
}
