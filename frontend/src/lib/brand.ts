// Minimal brand color extraction and palette utilities
// Uses canvas to extract dominant colors from public/letterhead.png

export type BrandPalette = {
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  ring: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function getRelativeLuminance(r: number, g: number, b: number): number {
  const srgb = [r, g, b].map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function getContrastRatio(fg: { r: number; g: number; b: number }, bg: { r: number; g: number; b: number }): number {
  const L1 = getRelativeLuminance(fg.r, fg.g, fg.b) + 0.05;
  const L2 = getRelativeLuminance(bg.r, bg.g, bg.b) + 0.05;
  const [lighter, darker] = L1 > L2 ? [L1, L2] : [L2, L1];
  return lighter / darker;
}

function adjustLightness(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const factor = amount; // -1..+1
  const r = clamp(rgb.r + factor * 255, 0, 255);
  const g = clamp(rgb.g + factor * 255, 0, 255);
  const b = clamp(rgb.b + factor * 255, 0, 255);
  return rgbToHex(r, g, b);
}

function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function isNearWhiteOrBlack({ r, g, b }: { r: number; g: number; b: number }): boolean {
  const luminance = getRelativeLuminance(r, g, b);
  return luminance > 0.94 || luminance < 0.06;
}

export async function extractBrandPaletteFromImage(imageUrl: string = '/letterhead.png'): Promise<BrandPalette> {
  const img = await loadImage(imageUrl);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return defaultPalette();
  }
  const targetSize = 64;
  canvas.width = targetSize;
  canvas.height = targetSize;
  ctx.drawImage(img, 0, 0, targetSize, targetSize);

  const imageData = ctx.getImageData(0, 0, targetSize, targetSize).data;

  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  const bucketSize = 24; // coarse quantization

  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const alpha = imageData[i + 3];
    if (alpha < 128) continue; // skip transparent
    const key = `${Math.floor(r / bucketSize)}-${Math.floor(g / bucketSize)}-${Math.floor(b / bucketSize)}`;
    const avg = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    avg.r += r; avg.g += g; avg.b += b; avg.count += 1;
    buckets.set(key, avg);
  }

  const entries = Array.from(buckets.values())
    .filter(e => e.count > 0)
    .map(e => ({ r: Math.round(e.r / e.count), g: Math.round(e.g / e.count), b: Math.round(e.b / e.count), count: e.count }))
    .filter(rgb => !isNearWhiteOrBlack(rgb))
    .sort((a, b) => b.count - a.count);

  const bgRgb = { r: 255, g: 255, b: 255 };
  const primary = entries[0] || { r: 2, g: 73, b: 181, count: 1 }; // fallback blue

  // Choose accent: farthest color from primary among top candidates
  let accent = entries.find(c => colorDistance(c, primary) > 60) || entries[1] || primary;
  if (!accent) accent = primary;

  const primaryHex = rgbToHex(primary.r, primary.g, primary.b);
  const accentHex = rgbToHex(accent.r, accent.g, accent.b);

  // Foregrounds: ensure at least 4.5:1 contrast
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const ph = hexToRgb(primaryHex)!;
  const ah = hexToRgb(accentHex)!;
  const primaryFg = getContrastRatio(white, ph) >= 4.5 ? '#ffffff' : '#000000';
  const accentFg = getContrastRatio(white, ah) >= 4.5 ? '#ffffff' : '#000000';

  // Ring follows primary but a bit lighter
  const ring = adjustLightness(primaryHex, 0.1);

  return {
    primary: primaryHex,
    primaryForeground: primaryFg,
    accent: accentHex,
    accentForeground: accentFg,
    ring,
  };
}

export function applyBrandPaletteToCssVariables(palette: BrandPalette) {
  const root = document.documentElement;
  root.style.setProperty('--primary', palette.primary);
  root.style.setProperty('--primary-foreground', palette.primaryForeground);
  root.style.setProperty('--accent', palette.accent);
  root.style.setProperty('--accent-foreground', palette.accentForeground);
  root.style.setProperty('--ring', palette.ring);
  // Sidebar and charts: align primary and ring for a cohesive look
  root.style.setProperty('--sidebar-primary', palette.primary);
  root.style.setProperty('--sidebar-primary-foreground', palette.primaryForeground);
  root.style.setProperty('--sidebar-ring', palette.ring);
}

export function defaultPalette(): BrandPalette {
  return {
    // Linaé mood defaults: charcoal primary, sage accent
    primary: '#5b5d5d',
    primaryForeground: '#ffffff',
    accent: '#98aa95',
    accentForeground: '#2e3730',
    ring: '#74807b',
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}


