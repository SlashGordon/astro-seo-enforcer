import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import type { SeoEnforcerUserConfig } from '../src/config.js';
import { imageSizeRule } from '../src/rules/image-size.js';
import type { PageContext } from '../src/types.js';
import { extractVisibleText } from '../src/util/dom.js';
import { readImageDimensions } from '../src/util/image-size.js';

/* -------------------------------------------------------------------------- */
/*  Fixture builders — minimal but valid image headers.                        */
/* -------------------------------------------------------------------------- */

function png(width: number, height: number, padTo = 0): Buffer {
  const size = Math.max(24, padTo);
  const b = Buffer.alloc(size);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

function gif(width: number, height: number): Buffer {
  const b = Buffer.alloc(24);
  b.write('GIF89a', 0, 'ascii');
  b.writeUInt16LE(width, 6);
  b.writeUInt16LE(height, 8);
  return b;
}

function jpeg(width: number, height: number): Buffer {
  const b = Buffer.alloc(32);
  let o = 0;
  b[o++] = 0xff;
  b[o++] = 0xd8;
  b[o++] = 0xff;
  b[o++] = 0xc0;
  b.writeUInt16BE(17, o);
  o += 2;
  b[o++] = 0x08;
  b.writeUInt16BE(height, o);
  o += 2;
  b.writeUInt16BE(width, o);
  return b;
}

function webpVP8X(width: number, height: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.write('WEBP', 8, 'ascii');
  b.write('VP8X', 12, 'ascii');
  const wm = width - 1;
  const hm = height - 1;
  b[24] = wm & 0xff;
  b[25] = (wm >> 8) & 0xff;
  b[26] = (wm >> 16) & 0xff;
  b[27] = hm & 0xff;
  b[28] = (hm >> 8) & 0xff;
  b[29] = (hm >> 16) & 0xff;
  return b;
}

describe('readImageDimensions', () => {
  it('reads PNG dimensions', () => {
    expect(readImageDimensions(png(800, 600))).toEqual({ width: 800, height: 600 });
  });

  it('reads GIF dimensions', () => {
    expect(readImageDimensions(gif(120, 90))).toEqual({ width: 120, height: 90 });
  });

  it('reads JPEG dimensions', () => {
    expect(readImageDimensions(jpeg(1024, 768))).toEqual({ width: 1024, height: 768 });
  });

  it('reads extended WebP (VP8X) dimensions', () => {
    expect(readImageDimensions(webpVP8X(1600, 900))).toEqual({ width: 1600, height: 900 });
  });

  it('returns undefined for unknown / too-short data', () => {
    expect(readImageDimensions(Buffer.from('not an image at all!!!!'))).toBeUndefined();
    expect(readImageDimensions(Buffer.alloc(4))).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  Rule tests — write real files to a temp dir and point the context at it.   */
/* -------------------------------------------------------------------------- */

describe('imageSizeRule', () => {
  let dist: string;

  const write = (name: string, data: Buffer) => writeFileSync(path.join(dist, name), data);

  const ctxFor = (body: string, userConfig: SeoEnforcerUserConfig = {}): PageContext => {
    const html = `<!doctype html><html><head></head><body>${body}</body></html>`;
    const root = parse(html, { lowerCaseTagName: true, comment: false });
    return {
      file: 'index.html',
      absolutePath: path.join(dist, 'index.html'),
      distPath: dist,
      root,
      bodyText: extractVisibleText(root),
      config: resolveConfig(userConfig),
    };
  };

  beforeAll(() => {
    dist = mkdtempSync(path.join(tmpdir(), 'seo-imgsize-'));
    write('small.png', png(400, 300)); // tiny, correctly sized when shown 400x300
    write('huge.png', png(400, 300, 300 * 1024)); // 300 KB payload
    write('oversized.png', png(2000, 1500)); // large intrinsic pixels
  });

  afterAll(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it('flags a file heavier than maxBytes', () => {
    const found = imageSizeRule(ctxFor('<img src="/huge.png" width="400" height="300">'));
    expect(found.some((v) => v.message.includes('huge.png') && v.message.includes('max'))).toBe(
      true,
    );
    expect(found[0]?.rule).toBe('imageSize');
    expect(found[0]?.severity).toBe('warning');
  });

  it('flags a missing width/height (layout shift)', () => {
    const found = imageSizeRule(ctxFor('<img src="/small.png">'));
    expect(found.some((v) => v.message.includes('missing intrinsic width/height'))).toBe(true);
  });

  it('flags an image scaled far below its intrinsic size', () => {
    const found = imageSizeRule(ctxFor('<img src="/oversized.png" width="400" height="300">'));
    expect(found.some((v) => v.message.includes('served at 2000×1500'))).toBe(true);
  });

  it('accepts a small, correctly sized image', () => {
    expect(imageSizeRule(ctxFor('<img src="/small.png" width="400" height="300">'))).toEqual([]);
  });

  it('reads dimensions from inline style as well as attributes', () => {
    const found = imageSizeRule(
      ctxFor('<img src="/small.png" style="width: 400px; height: 300px;">'),
    );
    expect(found).toEqual([]);
  });

  it('allows up to 2x scaling by default (high-DPI)', () => {
    // oversized.png is 2000x1500; displayed at 1000x750 -> exactly 2x, allowed.
    expect(imageSizeRule(ctxFor('<img src="/oversized.png" width="1000" height="750">'))).toEqual(
      [],
    );
  });

  it('honours a custom maxScaleFactor', () => {
    const found = imageSizeRule(
      ctxFor('<img src="/oversized.png" width="1000" height="750">', {
        rules: { imageSize: { maxScaleFactor: 1 } },
      }),
    );
    expect(found.some((v) => v.message.includes('larger'))).toBe(true);
  });

  it('skips remote and data URIs', () => {
    const found = imageSizeRule(
      ctxFor(
        '<img src="https://cdn.example.com/x.png" width="10" height="10">' +
          '<img src="data:image/png;base64,AAAA" width="10" height="10">',
      ),
    );
    expect(found).toEqual([]);
  });

  it('is a no-op when disabled', () => {
    expect(imageSizeRule(ctxFor('<img src="/huge.png">', { rules: { imageSize: false } }))).toEqual(
      [],
    );
  });

  it('weighs heavy files referenced only through <img srcset>', () => {
    const found = imageSizeRule(
      ctxFor(
        '<img src="/small.png" srcset="/small.png 400w, /huge.png 1280w" width="400" height="300">',
      ),
    );
    expect(
      found.some((v) => v.message.includes('huge.png') && v.message.includes('srcset candidate')),
    ).toBe(true);
  });

  it('weighs heavy files referenced through a <picture> <source srcset>', () => {
    const found = imageSizeRule(
      ctxFor(
        '<picture><source srcset="/huge.png 1280w" type="image/webp">' +
          '<img src="/small.png" width="400" height="300"></picture>',
      ),
    );
    expect(found.some((v) => v.message.includes('huge.png'))).toBe(true);
  });

  it('does not apply the scale check to srcset candidates', () => {
    // oversized.png is 2000x1500; only flagged via the <img src> scale check,
    // never because it appears as a large srcset candidate.
    const found = imageSizeRule(
      ctxFor('<img src="/small.png" srcset="/oversized.png 2000w" width="400" height="300">'),
    );
    expect(found).toEqual([]);
  });

  it('reports a file shared by src and srcset only once', () => {
    const found = imageSizeRule(
      ctxFor('<img src="/huge.png" srcset="/huge.png 1280w" width="400" height="300">'),
    );
    expect(found.filter((v) => v.message.includes('huge.png')).length).toBe(1);
  });
});
