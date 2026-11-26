/**
 * @cc [owner:nareshshah139,label:product] pack-multiplier-contents
 * A pack written "1x10", "1 × 10" or "2*15" MUST count its units as the product of the two numbers, so a
 * strip of 10 tablets is never read as 1. Text without a multiplier MUST come back unchanged.
 */
export const expandPackMultiplier = (label: string): string =>
  label.replace(/(\d+)\s*[x×*]\s*(\d+)/i, (_, packs, units) => String(Number(packs) * Number(units)));
