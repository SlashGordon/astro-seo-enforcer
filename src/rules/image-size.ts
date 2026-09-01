import { statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { HTMLElement } from 'node-html-parser';
import type { PageContext, Rule, Violation } from '../types.js';
import { describeEl } from '../util/dom.js';
import { readImageDimensions } from '../util/image-size.js';

/**
 * Page speed is an SEO ranking signal, and images are usually the heaviest part
 * of a page. This rule inspects the *actual* image files referenced by the page
 * and flags three common performance problems:
 *
 *  1. **Oversized files** — a single image heavier than `maxBytes`. Checked for
 *     every candidate the browser might download: `<img src>`, plus every URL in
 *     an `<img srcset>` or a `<source srcset>` (responsive `<picture>`) set.
 *  2. **Missing dimensions** — no `width`/`height`, which causes layout shift (CLS).
 *  3. **Wrong scale** — intrinsic pixels far larger than the displayed size,
 *     i.e. the browser downloads a huge image only to shrink it (the Lighthouse
 *     "Properly size images" audit). Only the painted `<img src>` is checked
 *     here: `srcset` candidates are *meant* to come in a range of sizes.
 *
 * Remote images (`http(s)://`, `//host/…`), inline `data:` URIs and vector
 * `.svg` files are skipped: their weight/scale either cannot be measured from
 * disk or does not apply.
 */
export const imageSizeRule: Rule = (ctx) => {
  const options = ctx.config.rules.imageSize;
  if (!options) return [];

  const extensions = new Set(options.extensions.map((ext) => ext.toLowerCase()));
  const violations: Violation[] = [];
  // Weight is a per-file property — check each referenced file at most once per page.
  const weighed = new Set<string>();

  const checkWeight = (rawSrc: string, context: string): void => {
    const src = rawSrc.trim();
    const resolved = resolveLocalImage(src, ctx);
    if (!resolved) return;

    const extension = path.extname(resolved).slice(1).toLowerCase();
    if (!extensions.has(extension)) return;
    if (weighed.has(resolved)) return;
    weighed.add(resolved);

    let bytes: number;
    try {
      bytes = statSync(resolved).size;
    } catch {
      // A missing/unreadable file is out of scope for a performance check.
      return;
    }

    if (bytes > options.maxBytes) {
      violations.push({
        file: ctx.file,
        rule: 'imageSize',
        severity: options.severity,
        message: `Image "${src}"${context} is ${formatBytes(bytes)} (max ${formatBytes(options.maxBytes)}).`,
        hint: 'Compress the asset, or serve a modern format (WebP/AVIF). Astro <Image> optimises images automatically.',
      });
    }
  };

  // `<source srcset>` inside a `<picture>` is downloaded just like `<img src>`.
  for (const source of ctx.root.querySelectorAll('source')) {
    for (const candidate of parseSrcset(source.getAttribute('srcset'))) {
      checkWeight(candidate, ' (srcset candidate)');
    }
  }

  for (const image of ctx.root.querySelectorAll('img')) {
    const src = (image.getAttribute('src') ?? '').trim();

    const displayed = getDisplayedSize(image);

    if (
      options.requireDimensions &&
      (displayed.width === undefined || displayed.height === undefined)
    ) {
      violations.push({
        file: ctx.file,
        rule: 'imageSize',
        severity: options.severity,
        message: `<img> is missing intrinsic width/height: ${describeEl(image)}`,
        hint: 'Add width and height attributes so the browser can reserve space and avoid layout shift (CLS).',
      });
    }

    for (const candidate of parseSrcset(image.getAttribute('srcset'))) {
      checkWeight(candidate, ' (srcset candidate)');
    }
    checkWeight(src, '');

    const resolved = resolveLocalImage(src, ctx);
    if (!resolved) continue;

    const extension = path.extname(resolved).slice(1).toLowerCase();
    if (!extensions.has(extension)) continue;

    let buffer: Buffer;
    try {
      buffer = readFileSync(resolved);
    } catch {
      // A missing/unreadable file is out of scope for a performance check.
      continue;
    }

    if (
      options.maxScaleFactor > 0 &&
      displayed.width !== undefined &&
      displayed.height !== undefined
    ) {
      const intrinsic = readImageDimensions(buffer);
      if (intrinsic) {
        const widthRatio = displayed.width > 0 ? intrinsic.width / displayed.width : 0;
        const heightRatio = displayed.height > 0 ? intrinsic.height / displayed.height : 0;
        const ratio = Math.max(widthRatio, heightRatio);

        if (ratio > options.maxScaleFactor) {
          violations.push({
            file: ctx.file,
            rule: 'imageSize',
            severity: options.severity,
            message:
              `Image "${src}" is served at ${intrinsic.width}×${intrinsic.height}px ` +
              `but displayed at ${displayed.width}×${displayed.height}px ` +
              `(${ratio.toFixed(1)}× larger, max ${options.maxScaleFactor}×).`,
            hint: 'Resize the source image closer to its displayed size (allow up to 2× for high-DPI screens).',
          });
        }
      }
    }
  }

  return violations;
};

interface DisplayedSize {
  width: number | undefined;
  height: number | undefined;
}

/** Read the displayed size from `width`/`height` attributes or inline `style`. */
function getDisplayedSize(image: HTMLElement): DisplayedSize {
  const style = image.getAttribute('style') ?? '';
  return {
    width: parseLength(image.getAttribute('width')) ?? parseStyleLength(style, 'width'),
    height: parseLength(image.getAttribute('height')) ?? parseStyleLength(style, 'height'),
  };
}

/** Parse an HTML length ("800", "800px") into a positive pixel number. */
function parseLength(value: string | undefined | null): number | undefined {
  if (value == null) return undefined;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(px)?\s*$/i.exec(value);
  if (!match) return undefined;
  const num = Number.parseFloat(match[1] as string);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

/** Pull a `width`/`height` declaration in `px` out of an inline style string. */
function parseStyleLength(style: string, property: 'width' | 'height'): number | undefined {
  const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i').exec(style);
  return match ? parseLength(match[1]) : undefined;
}

/**
 * Pull the URLs out of a `srcset` attribute, dropping the `w`/`x` descriptors.
 *
 * `srcset` is a comma-separated list of `<url> [descriptor]` entries. URLs may
 * legally contain a comma, but Astro (and every build tool in practice) emits
 * plain hashed filenames, so splitting on `,` between entries is safe enough;
 * any mangled fragment simply fails to resolve to a file and is ignored.
 */
function parseSrcset(value: string | undefined | null): string[] {
  if (!value) return [];
  const urls: string[] = [];
  for (const entry of value.split(',')) {
    const url = entry.trim().split(/\s+/)[0];
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * Turn an `src` into an absolute filesystem path, or return `undefined` when it
 * is not a local file we can inspect (remote URL, data URI, empty, …).
 */
function resolveLocalImage(src: string, ctx: PageContext): string | undefined {
  if (src.length === 0) return undefined;
  // Remote, protocol-relative, data/blob URIs — nothing on disk to read.
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) return undefined;

  // Drop query string and hash fragment.
  const clean = src.split(/[?#]/)[0] ?? '';
  if (clean.length === 0) return undefined;

  if (clean.startsWith('/')) {
    return path.join(ctx.distPath, clean);
  }
  return path.resolve(path.dirname(ctx.absolutePath), clean);
}

/** Human-readable byte size (e.g. "1.2 MB", "240 KB"). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}
