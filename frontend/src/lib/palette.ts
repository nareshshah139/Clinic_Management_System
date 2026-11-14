export const PALETTES = {
  original: 'Original',
  branded: 'Branded',
} as const;

export type Palette = keyof typeof PALETTES;

export const DEFAULT_PALETTE: Palette = 'original';

export const PALETTE_STORAGE_KEY = 'cms-palette';

export function isPalette(value: unknown): value is Palette {
  return typeof value === 'string' && Object.hasOwn(PALETTES, value);
}

export function activePalette(): Palette {
  if (typeof document === 'undefined') return DEFAULT_PALETTE;
  const value = document.documentElement.dataset.palette;
  return isPalette(value) ? value : DEFAULT_PALETTE;
}

export function choosePalette(palette: Palette): void {
  document.documentElement.dataset.palette = palette;
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, palette);
  } catch {}
}

export const PALETTE_BOOT_SCRIPT = `(function(){var p;try{p=localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEY)})}catch(e){}document.documentElement.dataset.palette=${JSON.stringify(Object.keys(PALETTES))}.indexOf(p)<0?${JSON.stringify(DEFAULT_PALETTE)}:p})()`;
