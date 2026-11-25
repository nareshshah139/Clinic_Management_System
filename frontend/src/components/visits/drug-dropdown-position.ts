export type DropdownPlacement = { left: number; width: number; maxHeight: number } & ({ top: number } | { bottom: number });

const GUTTER = 8;
const GAP = 4;
const MIN_WIDTH = 500;
const MAX_HEIGHT = 256;

/** Viewport coordinates for a `position: fixed` list anchored to an input. */
export function placeDrugDropdown(
  anchor: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>,
  viewport: { width: number; height: number },
): DropdownPlacement {
  const width = Math.min(viewport.width - 2 * GUTTER, Math.max(anchor.width, MIN_WIDTH));
  const left = Math.max(GUTTER, Math.min(anchor.left, viewport.width - GUTTER - width));
  const below = viewport.height - anchor.bottom - GAP - GUTTER;
  const above = anchor.top - GAP - GUTTER;
  if (below < MAX_HEIGHT && above > below) {
    return { left, width, bottom: viewport.height - anchor.top + GAP, maxHeight: Math.min(MAX_HEIGHT, above) };
  }
  return { left, width, top: anchor.bottom + GAP, maxHeight: Math.min(MAX_HEIGHT, Math.max(below, 0)) };
}

export function samePlacement(a: DropdownPlacement | null, b: DropdownPlacement): boolean {
  return a !== null && JSON.stringify(a) === JSON.stringify(b);
}
