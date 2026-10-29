export const PRESCRIPTION_LETTERHEAD_URL = '/prescription-letterhead-praneeta.jpg';
export const PRESCRIPTION_TOP_MARGIN_PX = 200;
export const PRESCRIPTION_BOTTOM_MARGIN_PX = 86;

/**
 * @cc [owner:nareshshah139,label:product] prescription-letterhead-default
 * Missing, empty and legacy /letterhead.png backgrounds MUST resolve to the supplied
 * Dr. Praneeta Jain letterhead. Explicit custom background URLs MUST be preserved.
 */
export function prescriptionLetterheadUrl(url?: string | null): string {
  return !url || url === '/letterhead.png' ? PRESCRIPTION_LETTERHEAD_URL : url;
}

/**
 * @cc [owner:nareshshah139,label:product] prescription-letterhead-clearance
 * With the built-in letterhead enabled, pagination MUST reserve at least 200px above
 * and 86px below its content on every page, including saved printer profiles. Custom backgrounds
 * and no-letterhead printing MUST retain explicit margins without this minimum.
 */
export function prescriptionPageMargin(
  value: number | undefined,
  edge: 'top' | 'bottom',
  backgroundUrl?: string,
  withLetterhead = true,
): number {
  const minimum = edge === 'top' ? PRESCRIPTION_TOP_MARGIN_PX : PRESCRIPTION_BOTTOM_MARGIN_PX;
  const margin = value ?? minimum;
  return withLetterhead && prescriptionLetterheadUrl(backgroundUrl) === PRESCRIPTION_LETTERHEAD_URL
    ? Math.max(minimum, margin)
    : margin;
}
