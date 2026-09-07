import type { DuplicateContentRuleOptions } from '../config.js';
import type { Violation } from '../types.js';

/** One page's visible text, as fed to {@link findDuplicateContent}. */
export interface DuplicateContentPage {
  /** POSIX path of the page relative to the build output directory. */
  file: string;
  /**
   * Visible text of the page to fingerprint (whitespace does not need to be
   * collapsed). The runner passes the `<main>` / `<article>` text when
   * `scopeToMain` is set and the page has such a region, otherwise `<body>`.
   */
  text: string;
}

/** Length, in words, of the sliding window used to fingerprint a page. */
const SHINGLE_SIZE = 5;

/**
 * Flags pages whose visible text is near-identical to another page's.
 *
 * The `title` rule already catches byte-exact duplicate `<title>` tags. This
 * catches the case it misses: distinct titles wrapped around near-identical
 * bodies, which is what templated listing pages, thin tag/location pages and
 * leftover staging copies produce.
 *
 * Similarity is the Jaccard overlap of the two pages' {@link SHINGLE_SIZE}-word
 * shingle sets: `shared shingles / combined shingles`, `1` for identical prose
 * and `0` when the pages share no run of five words. Pages with fewer than
 * `minWords` words are left out, since short pages overlap on nav and footer
 * boilerplate alone. The comparison is pairwise, so it is skipped above
 * `maxPages`.
 *
 * A second pass flags any page whose share of shingles unique to it (present on
 * no other eligible page) falls below `minUniqueRatio`. This catches many-way
 * templating where every page is close to the set but no single pair reaches
 * `threshold`.
 */
export function findDuplicateContent(
  pages: readonly DuplicateContentPage[],
  options: DuplicateContentRuleOptions,
): Violation[] {
  const eligible = pages
    .map((page) => ({ file: page.file, shingles: shingle(tokenize(page.text), options.minWords) }))
    .filter((page) => page.shingles.size > 0);

  if (eligible.length < 2) return [];

  if (eligible.length > options.maxPages) {
    return [
      {
        file: eligible[0]!.file,
        rule: 'duplicateContent',
        severity: options.severity,
        message:
          `Skipped the near-duplicate content check: ${eligible.length} pages carry enough text ` +
          `to compare, over the maxPages limit of ${options.maxPages}. Every pair of pages is ` +
          `compared, so the work grows with the square of the page count.`,
        hint: 'Raise the "maxPages" option to scan a site this size.',
      },
    ];
  }

  // file -> ["about.html (94%)", …] of the pages it is too close to.
  const matches = new Map<string, string[]>();
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i]!;
      const b = eligible[j]!;
      const similarity = jaccard(a.shingles, b.shingles);
      if (similarity < options.threshold) continue;

      const percent = Math.round(similarity * 100);
      append(matches, a.file, `${b.file} (${percent}%)`);
      append(matches, b.file, `${a.file} (${percent}%)`);
    }
  }

  // How many of the eligible pages each shingle appears on, for the unique-ratio
  // pass — this catches many-way templating that no single pair trips the
  // `threshold` on (e.g. 200 location pages that are each 85% boilerplate).
  const pagesPerShingle = new Map<string, number>();
  if (options.minUniqueRatio > 0) {
    for (const page of eligible) {
      for (const value of page.shingles) {
        pagesPerShingle.set(value, (pagesPerShingle.get(value) ?? 0) + 1);
      }
    }
  }
  const lowUnique = new Map<string, number>();
  if (options.minUniqueRatio > 0) {
    for (const page of eligible) {
      let unique = 0;
      for (const value of page.shingles) {
        if (pagesPerShingle.get(value) === 1) unique += 1;
      }
      const ratio = unique / page.shingles.size;
      if (ratio < options.minUniqueRatio) lowUnique.set(page.file, ratio);
    }
  }

  const violations: Violation[] = [];
  for (const file of new Set([...matches.keys(), ...lowUnique.keys()])) {
    const parts: string[] = [];
    const others = matches.get(file);
    if (others) parts.push(`shares most of its text with ${others.join(', ')}`);
    if (lowUnique.has(file)) {
      parts.push(`only ${Math.round(lowUnique.get(file)! * 100)}% of its content is unique to it`);
    }
    violations.push({
      file,
      rule: 'duplicateContent',
      severity: options.severity,
      message: `Near-duplicate content: this page ${parts.join('; ')}.`,
      hint: 'Give the page its own content, or drop it and point a canonical link at the version you keep.',
    });
  }
  return violations;
}

/** Lower-case the text and split it into word tokens (letters and digits). */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Build the set of consecutive {@link SHINGLE_SIZE}-word phrases in `words`.
 * Returns an empty set when the page has fewer than `minWords` words.
 */
function shingle(words: string[], minWords: number): Set<string> {
  const shingles = new Set<string>();
  if (words.length < minWords || words.length < SHINGLE_SIZE) return shingles;

  for (let i = 0; i + SHINGLE_SIZE <= words.length; i++) {
    shingles.add(words.slice(i, i + SHINGLE_SIZE).join(' '));
  }
  return shingles;
}

/** Jaccard similarity of two sets: `|A ∩ B| / |A ∪ B|`, in `[0, 1]`. */
function jaccard(a: Set<string>, b: Set<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const value of small) {
    if (large.has(value)) shared += 1;
  }
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

function append(map: Map<string, string[]>, key: string, value: string): void {
  const bucket = map.get(key) ?? [];
  bucket.push(value);
  map.set(key, bucket);
}
