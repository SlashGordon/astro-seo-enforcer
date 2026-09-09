import type { Rule, Violation } from '../types.js';

/** Pull every `@type` value out of a parsed JSON-LD node (handles `@graph`). */
function collectTypes(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, into);
    return;
  }
  if (!node || typeof node !== 'object') return;

  const record = node as Record<string, unknown>;
  const type = record['@type'];
  if (typeof type === 'string') into.add(type);
  else if (Array.isArray(type)) for (const t of type) if (typeof t === 'string') into.add(t);

  if ('@graph' in record) collectTypes(record['@graph'], into);
}

/**
 * Checks the page's JSON-LD structured data.
 *
 * Every `<script type="application/ld+json">` block must contain valid JSON.
 * With `requireTypes`, each listed `@type` (e.g. `Article`, `BreadcrumbList`)
 * must appear somewhere in the page's structured data. With `require`, a page
 * that ships no JSON-LD at all is flagged.
 *
 * All findings are warnings by default — missing or malformed schema will not
 * break a build unless you raise `failOn`.
 */
export const structuredDataRule: Rule = (ctx) => {
  const options = ctx.config.rules.structuredData;
  if (!options) return [];

  const blocks = ctx.root
    .querySelectorAll('script')
    .filter(
      (script) =>
        (script.getAttribute('type') ?? '').trim().toLowerCase() === 'application/ld+json',
    );

  const violations: Violation[] = [];
  const types = new Set<string>();
  let validBlocks = 0;

  for (const block of blocks) {
    const raw = block.text.trim();
    if (raw.length === 0) continue;
    try {
      collectTypes(JSON.parse(raw), types);
      validBlocks += 1;
    } catch (error) {
      violations.push({
        file: ctx.file,
        rule: 'structuredData',
        severity: options.severity,
        message: `Invalid JSON-LD: ${(error as Error).message}`,
        hint: 'Fix the JSON in the <script type="application/ld+json"> block — crawlers discard schema they cannot parse.',
      });
    }
  }

  if (options.require && validBlocks === 0 && violations.length === 0) {
    violations.push({
      file: ctx.file,
      rule: 'structuredData',
      severity: options.severity,
      message: 'No JSON-LD structured data on this page.',
      hint: 'Emit a <script type="application/ld+json"> block describing the page (Article, Product, BreadcrumbList, …).',
    });
  }

  const missing = options.requireTypes.filter((wanted) => !types.has(wanted));
  if (missing.length > 0 && (validBlocks > 0 || options.require)) {
    violations.push({
      file: ctx.file,
      rule: 'structuredData',
      severity: options.severity,
      message: `Structured data is missing required @type(s): ${missing.join(', ')}.`,
      hint: 'Add the missing schema type, or drop it from `requireTypes` if this page type does not need it.',
    });
  }

  return violations;
};
