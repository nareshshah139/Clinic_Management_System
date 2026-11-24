export const TARGET_EDGE = 1600;
export const TARGET_BYTES = 800 * 1024;
export const MAX_PHOTOS = 4;

/** The size to draw an image at so its long edge is at most `edge`. */
export function fitWithin(width: number, height: number, edge = TARGET_EDGE): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** Shrinks a photo in the browser before upload; the server re-encodes it again (PP-43). */
export async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not-image');
  const bitmap = await createImageBitmap(file);
  const size = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close?.();
  for (const quality of [0.82, 0.7, 0.58, 0.46]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (blob && blob.size <= TARGET_BYTES) return toDataUrl(blob);
  }
  throw new Error('too-large');
}
