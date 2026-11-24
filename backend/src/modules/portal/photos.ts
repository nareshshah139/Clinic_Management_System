import sharp from 'sharp';

export const MAX_PHOTOS = 4;
export const MAX_STORED_BYTES = 1.5 * 1024 * 1024;
export const MAX_EDGE = 2048;
const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'heif', 'gif', 'avif', 'tiff']);
const HEADER = /^data:image\/[a-z0-9.+-]+;base64$/;
const NOT_BASE64 = /[^A-Za-z0-9+/=]|=[^=]|={3}/;

/** The base64 body of an image data URL, checked without a whole-string regex (photos run to megabytes). */
function imageBase64(dataUrl: string): string | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0 || !HEADER.test(dataUrl.slice(0, comma))) return null;
  const body = dataUrl.slice(comma + 1);
  return body && !NOT_BASE64.test(body) ? body : null;
}

export class PhotoRejected extends Error {}

/**
 * @cc [owner:nareshshah139,label:security] photo-reencode
 * A patient photo MUST be decoded as an image and re-encoded as JPEG with no metadata, a long
 * edge of at most 2048 pixels and at most 1.5 MB stored; anything else is rejected (PP-43).
 */
export async function reencodePhoto(dataUrl: string): Promise<Buffer> {
  const body = imageBase64(dataUrl);
  if (!body) throw new PhotoRejected('Only images can be attached.');
  const input = Buffer.from(body, 'base64');
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new PhotoRejected('Only images can be attached.');
  }
  if (!format || !ACCEPTED.has(format)) throw new PhotoRejected('Only images can be attached.');
  for (const quality of [82, 70, 58, 46, 34]) {
    const out = await sharp(input, { pages: 1 })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (out.length <= MAX_STORED_BYTES) return out;
  }
  throw new PhotoRejected('This photo is too large. Please take a smaller photo.');
}
