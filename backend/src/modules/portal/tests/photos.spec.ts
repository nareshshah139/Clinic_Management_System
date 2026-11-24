import sharp from 'sharp';
import { MAX_EDGE, MAX_STORED_BYTES, PhotoRejected, reencodePhoto } from '../photos';

const dataUrl = (b: Buffer, mime = 'image/jpeg') => `data:${mime};base64,${b.toString('base64')}`;

describe('patient photo re-encoding (PP-43)', () => {
  it('re-encodes to JPEG within 2048 px and 1.5 MB with no metadata', async () => {
    const noisy = Buffer.alloc(3000 * 2000 * 3).map(() => Math.floor(Math.random() * 256));
    const input = await sharp(noisy, { raw: { width: 3000, height: 2000, channels: 3 } })
      .withMetadata({ exif: { IFD0: { Artist: 'Synthetic Patient', ImageDescription: 'GPS 17.38N' } } })
      .jpeg({ quality: 95 })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const out = await reencodePhoto(dataUrl(input));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(MAX_EDGE);
    expect(out.length).toBeLessThanOrEqual(MAX_STORED_BYTES);
    expect(meta.exif).toBeUndefined();
    expect(out.includes(Buffer.from('Synthetic Patient'))).toBe(false);
  }, 60000);

  it('rejects anything that is not an image', async () => {
    await expect(reencodePhoto(dataUrl(Buffer.from('<svg onload=alert(1)>'), 'image/svg+xml'))).rejects.toBeInstanceOf(PhotoRejected);
    await expect(reencodePhoto(dataUrl(Buffer.from('%PDF-1.4 not an image')))).rejects.toBeInstanceOf(PhotoRejected);
    await expect(reencodePhoto('data:text/html;base64,PGgxPg==')).rejects.toBeInstanceOf(PhotoRejected);
  });
});
