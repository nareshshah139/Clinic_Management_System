export const PRESCRIPTION_LETTERHEAD_URL = '/prescription-letterhead-praneeta.jpg';
export const PRESCRIPTION_TOP_MARGIN_PX = 200;
export const PRESCRIPTION_BOTTOM_MARGIN_PX = 86;

/**
 * @cc [owner:nareshshah139,label:product] prescription-letterhead-default
 * Missing, empty, legacy /letterhead.png and stale built-in backgrounds MUST resolve to the
 * prescribing doctor's own letterhead: the supplied Dr. Praneeta Jain letterhead for her, an
 * uploaded one for others, and none when that doctor has none. Another doctor's prescription
 * MUST NOT fall back to Dr. Praneeta Jain's letterhead. Explicit custom background URLs MUST be preserved.
 */
export function prescriptionLetterheadUrl(url: string | null | undefined, doctorLetterheadUrl: string | null | undefined): string {
  return !url || url === '/letterhead.png' || url === PRESCRIPTION_LETTERHEAD_URL ? doctorLetterheadUrl || '' : url;
}

export const printBackgroundKey = (doctorId: string) => `rx_print_bg_url:${doctorId}`;
const LEGACY_PRINT_BACKGROUND_KEY = 'rx_print_bg_url';

/**
 * @cc [owner:nareshshah139,label:product] print-background-override-scope
 * A custom print background chosen in this browser MUST apply only to the doctor who chose it.
 * The legacy browser-wide override predates other doctors, so it MUST carry over only to the
 * doctor with the bundled letterhead (Dr. Praneeta Jain), and only when it is a real custom image.
 */
export function savedPrintBackground(
  storage: Pick<Storage, 'getItem'>,
  doctorId: string,
  doctorLetterheadSource: 'uploaded' | 'bundled' | undefined,
): string {
  const saved = storage.getItem(printBackgroundKey(doctorId));
  if (saved !== null) return saved;
  const legacy = storage.getItem(LEGACY_PRINT_BACKGROUND_KEY);
  return doctorLetterheadSource === 'bundled' && legacy && legacy !== '/letterhead.png' && legacy !== PRESCRIPTION_LETTERHEAD_URL ? legacy : '';
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
  resolvedBackgroundUrl: string,
  withLetterhead = true,
): number {
  const minimum = edge === 'top' ? PRESCRIPTION_TOP_MARGIN_PX : PRESCRIPTION_BOTTOM_MARGIN_PX;
  const margin = value ?? minimum;
  return withLetterhead && resolvedBackgroundUrl === PRESCRIPTION_LETTERHEAD_URL
    ? Math.max(minimum, margin)
    : margin;
}
