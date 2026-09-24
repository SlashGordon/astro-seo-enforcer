import type { LlmsTxtRuleOptions } from '../config.js';
import type { Violation } from '../types.js';
import { classifyHref, matchOutputFile, resolveInternalPath } from '../util/links.js';

export const LLMS_TXT_FILE = 'llms.txt';

export interface LlmsTxtInput {
  /** Contents of `llms.txt`, or `undefined` when the build has none. */
  llmsTxt: string | undefined;
  siteFiles: ReadonlySet<string>;
  /** Astro's `site` URL; absolute links on this origin are checked too. */
  site: string | undefined;
}

const MARKDOWN_LINK = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

/**
 * Checks `llms.txt` (https://llmstxt.org): it exists, opens with a `# Title`
 * heading, and its links to this site resolve to files in the build output.
 */
export function findLlmsTxtIssues(input: LlmsTxtInput, options: LlmsTxtRuleOptions): Violation[] {
  const report = (message: string, hint: string): Violation => ({
    file: LLMS_TXT_FILE,
    rule: 'llmsTxt',
    severity: options.severity,
    message,
    hint,
  });

  if (input.llmsTxt === undefined) {
    return [
      report(
        'No llms.txt in the build output.',
        'Add public/llms.txt: a "# Site name" heading, a "> summary" line and "## Section" link lists.',
      ),
    ];
  }

  const violations: Violation[] = [];
  const firstLine = input.llmsTxt.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine || !/^#\s+\S/.test(firstLine.trim())) {
    violations.push(
      report(
        'llms.txt must start with a "# Title" heading.',
        'The llms.txt format requires the site or project name as its first line, e.g. "# SlashGordon".',
      ),
    );
  }

  if (!options.checkLinks) return violations;

  const siteOrigin = originOf(input.site);
  const seen = new Set<string>();
  for (const match of input.llmsTxt.matchAll(MARKDOWN_LINK)) {
    const href = match[1]!;
    if (seen.has(href)) continue;
    seen.add(href);

    const pathname = internalPathname(href, siteOrigin);
    if (pathname === undefined) continue;
    const rel = resolveInternalPath(pathname, LLMS_TXT_FILE);
    if (matchOutputFile(rel, input.siteFiles) === undefined) {
      violations.push(
        report(
          `llms.txt links to "${href}", which does not exist in the build output.`,
          'Fix or remove the link; LLM crawlers follow these to fetch your content.',
        ),
      );
    }
  }

  return violations;
}

function internalPathname(href: string, siteOrigin: string | undefined): string | undefined {
  if (/^https?:\/\//i.test(href)) {
    if (!siteOrigin) return undefined;
    try {
      const url = new URL(href);
      return url.origin === siteOrigin ? url.pathname : undefined;
    } catch {
      return undefined;
    }
  }
  const target = classifyHref(href);
  return target.kind === 'path' ? target.pathname : undefined;
}

function originOf(site: string | undefined): string | undefined {
  if (!site) return undefined;
  try {
    return new URL(site).origin;
  } catch {
    return undefined;
  }
}
