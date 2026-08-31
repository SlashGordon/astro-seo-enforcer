/**
 * Minimal, dependency-free image dimension reader.
 *
 * Reads the intrinsic pixel dimensions out of the file header of the most
 * common web raster formats (PNG, JPEG, GIF, WebP). It never decodes pixel
 * data, only the few header bytes that carry the dimensions, so it is fast and
 * safe to run synchronously inside a rule.
 *
 * Vector formats (SVG) have no fixed pixel size, so they intentionally return
 * `undefined` — the "is this image scaled down?" heuristic does not apply.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

/** Detect the format from the magic bytes and delegate to the right reader. */
export function readImageDimensions(buffer: Buffer): ImageDimensions | undefined {
  if (buffer.length < 24) return undefined;

  if (isPng(buffer)) return readPng(buffer);
  if (isGif(buffer)) return readGif(buffer);
  if (isJpeg(buffer)) return readJpeg(buffer);
  if (isWebp(buffer)) return readWebp(buffer);

  return undefined;
}

/* -------------------------------------------------------------------------- */
/*  PNG                                                                        */
/* -------------------------------------------------------------------------- */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(buffer: Buffer): boolean {
  return buffer.subarray(0, 8).equals(PNG_SIGNATURE);
}

function readPng(buffer: Buffer): ImageDimensions | undefined {
  // 8-byte signature, then the IHDR chunk (4-byte length + "IHDR" + 4-byte
  // width + 4-byte height), all big-endian.
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

/* -------------------------------------------------------------------------- */
/*  GIF                                                                        */
/* -------------------------------------------------------------------------- */

function isGif(buffer: Buffer): boolean {
  const header = buffer.toString('ascii', 0, 6);
  return header === 'GIF87a' || header === 'GIF89a';
}

function readGif(buffer: Buffer): ImageDimensions | undefined {
  // Logical screen descriptor: width and height are 16-bit little-endian.
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

/* -------------------------------------------------------------------------- */
/*  JPEG                                                                       */
/* -------------------------------------------------------------------------- */

function isJpeg(buffer: Buffer): boolean {
  return buffer[0] === 0xff && buffer[1] === 0xd8;
}

function readJpeg(buffer: Buffer): ImageDimensions | undefined {
  // Walk the marker segments until a Start-Of-Frame (SOFn) marker is found.
  let offset = 2;
  const length = buffer.length;

  while (offset + 9 < length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1] as number;

    // Standalone markers without a length payload.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) return undefined;

    // SOF0–SOF15, excluding the non-frame markers DHT (C4), DAC (CC) and RSTn.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isSof) {
      // Segment: length(2) precision(1) height(2) width(2) …
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return width > 0 && height > 0 ? { width, height } : undefined;
    }

    offset += 2 + segmentLength;
  }

  return undefined;
}

/* -------------------------------------------------------------------------- */
/*  WebP                                                                       */
/* -------------------------------------------------------------------------- */

function isWebp(buffer: Buffer): boolean {
  return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
}

function readWebp(buffer: Buffer): ImageDimensions | undefined {
  const format = buffer.toString('ascii', 12, 16);

  // Simple lossy format (VP8 ).
  if (format === 'VP8 ') {
    if (buffer.length < 30) return undefined;
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : undefined;
  }

  // Simple lossless format (VP8L).
  if (format === 'VP8L') {
    if (buffer.length < 25) return undefined;
    const bits =
      (buffer[21] as number) |
      ((buffer[22] as number) << 8) |
      ((buffer[23] as number) << 16) |
      ((buffer[24] as number) << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return width > 0 && height > 0 ? { width, height } : undefined;
  }

  // Extended format (VP8X) — 24-bit little-endian canvas dimensions minus one.
  if (format === 'VP8X') {
    if (buffer.length < 30) return undefined;
    const width =
      1 + ((buffer[24] as number) | ((buffer[25] as number) << 8) | ((buffer[26] as number) << 16));
    const height =
      1 + ((buffer[27] as number) | ((buffer[28] as number) << 8) | ((buffer[29] as number) << 16));
    return width > 0 && height > 0 ? { width, height } : undefined;
  }

  return undefined;
}
