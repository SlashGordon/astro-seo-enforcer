import type { RobotsTxtRuleOptions } from '../config.js';
import type { Violation } from '../types.js';
import { matchOutputFile, resolveInternalPath, urlPathsForFile } from '../util/links.js';

export const ROBOTS_TXT_FILE = 'robots.txt';

export interface RobotsRule {
  allow: boolean;
  path: string;
}

export interface RobotsGroup {
  /** Lower-cased `User-agent` values. */
  agents: string[];
  rules: RobotsRule[];
}

export interface ParsedRobotsTxt {
  groups: RobotsGroup[];
  sitemaps: string[];
}

/** Parse `robots.txt` into user-agent groups and `Sitemap:` URLs (RFC 9309). */
export function parseRobotsTxt(text: string): ParsedRobotsTxt {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | undefined;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    // An empty `Disallow:` allows everything, which is the default anyway.
    if ((field === 'allow' || field === 'disallow') && current && value) {
      current.rules.push({ allow: field === 'allow', path: value });
    }
  }

  return { groups, sitemaps };
}

/**
 * The rule deciding whether `agent` may crawl `urlPath`, or `undefined` when
 * no rule matches (crawling allowed). Longest match wins; `Allow` wins ties.
 */
export function matchRobotsRule(
  robots: ParsedRobotsTxt,
  agent: string,
  urlPath: string,
): RobotsRule | undefined {
  const own = robots.groups.filter((group) => group.agents.includes(agent));
  const groups = own.length > 0 ? own : robots.groups.filter((g) => g.agents.includes('*'));

  let best: RobotsRule | undefined;
  for (const rule of groups.flatMap((group) => group.rules)) {
    if (!robotsPattern(rule.path).test(urlPath)) continue;
    if (
      !best ||
      rule.path.length > best.path.length ||
      (rule.path.length === best.path.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best;
}

function robotsPattern(path: string): RegExp {
  const anchored = path.endsWith('$');
  const body = (anchored ? path.slice(0, -1) : path)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

export interface RobotsTxtInput {
  /** Contents of `robots.txt`, or `undefined` when the build has none. */
  robotsTxt: string | undefined;
  siteFiles: ReadonlySet<string>;
  /** Pages some sitemap lists. */
  sitemapFiles: ReadonlySet<string>;
  /** Whether the build contains any `sitemap*.xml`. */
  hasSitemap: boolean;
}

const AGENTS = ['*', 'googlebot'];

/**
 * Checks `robots.txt`: it exists, does not block the whole site, points at a
 * sitemap that exists, and does not block pages that a sitemap lists.
 */
export function findRobotsTxtIssues(
  input: RobotsTxtInput,
  options: RobotsTxtRuleOptions,
): Violation[] {
  const report = (message: string, hint: string, file = ROBOTS_TXT_FILE): Violation => ({
    file,
    rule: 'robotsTxt',
    severity: options.severity,
    message,
    hint,
  });

  if (input.robotsTxt === undefined) {
    return [
      report(
        'No robots.txt in the build output.',
        'Add public/robots.txt with at least "User-agent: *", "Allow: /" and a "Sitemap:" line.',
      ),
    ];
  }

  const robots = parseRobotsTxt(input.robotsTxt);
  const violations: Violation[] = [];

  for (const sitemap of robots.sitemaps) {
    let url: URL;
    try {
      url = new URL(sitemap);
    } catch {
      violations.push(
        report(
          `Sitemap "${sitemap}" is not an absolute URL.`,
          'Use the full URL, e.g. "Sitemap: https://example.com/sitemap-index.xml".',
        ),
      );
      continue;
    }
    const rel = resolveInternalPath(url.pathname, 'index.html');
    if (matchOutputFile(rel, input.siteFiles) === undefined) {
      violations.push(
        report(
          `Sitemap "${sitemap}" does not exist in the build output.`,
          'Point it at the sitemap your build generates (with @astrojs/sitemap: /sitemap-index.xml).',
        ),
      );
    }
  }

  if (options.requireSitemap && robots.sitemaps.length === 0 && input.hasSitemap) {
    violations.push(
      report(
        'robots.txt has no "Sitemap:" line.',
        'Add "Sitemap: https://<your-site>/sitemap-index.xml" so crawlers find the sitemap.',
      ),
    );
  }

  for (const agent of AGENTS) {
    const rule = matchRobotsRule(robots, agent, '/');
    if (rule && !rule.allow) {
      violations.push(
        report(
          `robots.txt blocks the whole site for User-agent "${agent}" (Disallow: ${rule.path}).`,
          'Remove the rule unless this build is meant to stay out of search engines.',
        ),
      );
      return violations;
    }
  }

  for (const file of [...input.sitemapFiles].sort()) {
    const blocked = firstBlock(robots, urlPathsForFile(file));
    if (blocked) {
      violations.push(
        report(
          `Page is listed in a sitemap but robots.txt blocks User-agent "${blocked.agent}" from crawling it (Disallow: ${blocked.rule.path}).`,
          'Drop it from the sitemap or allow it in robots.txt; the two contradict each other.',
          file,
        ),
      );
    }
  }

  return violations;
}

function firstBlock(
  robots: ParsedRobotsTxt,
  urlPaths: string[],
): { agent: string; rule: RobotsRule } | undefined {
  for (const agent of AGENTS) {
    for (const urlPath of urlPaths) {
      const rule = matchRobotsRule(robots, agent, urlPath);
      if (rule && !rule.allow) return { agent, rule };
    }
  }
  return undefined;
}
