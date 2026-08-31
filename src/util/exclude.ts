/** Return `true` when `relPath` matches any of the exclude `patterns`. */
export function isExcluded(relPath: string, patterns: Array<string | RegExp>): boolean {
  return patterns.some((pattern) => matchPattern(relPath, pattern));
}

function matchPattern(relPath: string, pattern: string | RegExp): boolean {
  if (pattern instanceof RegExp) return pattern.test(relPath);
  if (!pattern) return false;

  // Exact file match.
  if (pattern === relPath) return true;

  // Directory prefix match ("blog" or "blog/" excludes "blog/post/index.html").
  const asDir = pattern.endsWith('/') ? pattern : `${pattern}/`;
  if (relPath.startsWith(asDir)) return true;

  // Glob match ("drafts/**", "**/*.amp.html", "posts/*.html").
  if (pattern.includes('*')) return globToRegExp(pattern).test(relPath);

  return false;
}

/** Convert a tiny glob dialect (`*`, `**`) into an anchored regular expression. */
function globToRegExp(glob: string): RegExp {
  // Escape every regex metacharacter except "*", then expand the wildcards in a
  // single pass so "**" and "*" cannot interfere with each other.
  const escaped = glob.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  const body = escaped.replace(/\*\*|\*/g, (match) => (match === '**' ? '.*' : '[^/]*'));
  return new RegExp(`^${body}$`);
}
