import { useSyncExternalStore } from 'react';

/** Shortest a time slot row may be: a comfortable thumb target, so a day of 10-minute slots scrolls instead of crushing. */
export const MIN_TILE_PX = 40;

const DAY_FRACTION_OF_VIEWPORT = 0.8;
const SERVER_VIEWPORT_PX = 800;

/** Rows share ~80% of the viewport between them, but none shrinks below MIN_TILE_PX. */
export function tileHeightPx(viewportPx: number, slotCount: number): number {
  return Math.max(MIN_TILE_PX, (DAY_FRACTION_OF_VIEWPORT * viewportPx) / Math.max(1, slotCount));
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};

export function useViewportHeight(): number {
  return useSyncExternalStore(subscribe, () => window.innerHeight, () => SERVER_VIEWPORT_PX);
}
