/**
 * @cc [owner:nareshshah139,label:product] fit-to-one-page-print
 * Fit to 1 page MUST print with the roomiest spacing and largest text that
 * keeps the prescription on one page. It MUST tighten spacing before it shrinks
 * text, and MUST NOT shrink text below PRINT_FIT_MIN_FONT_PX. When even the
 * smallest step overflows, it MUST print every line at that step on as many
 * pages as needed and say so.
 */

export interface PrintFitStep {
  fontPx: number;
  lineHeight: number;
  /** Vertical padding above and below each printed block. */
  blockPadPx: number;
  /** Vertical padding inside each Rx row. */
  rowPadPx: number;
  /** Gap above the signature rule, and between the rule and the signature. */
  signGapPx: number;
}

/**
 * Ordered from roomiest to most compact. Spacing tightens first at the normal
 * 14 px text size; text shrinks only after spacing reaches the Tight level.
 */
export const PRINT_FIT_STEPS: readonly PrintFitStep[] = [
  { fontPx: 14, lineHeight: 1.45, blockPadPx: 10, rowPadPx: 6, signGapPx: 20 },
  { fontPx: 14, lineHeight: 1.4, blockPadPx: 6, rowPadPx: 4, signGapPx: 14 },
  { fontPx: 14, lineHeight: 1.3, blockPadPx: 3, rowPadPx: 3, signGapPx: 10 },
  { fontPx: 14, lineHeight: 1.2, blockPadPx: 2, rowPadPx: 2, signGapPx: 8 },
  { fontPx: 13.5, lineHeight: 1.2, blockPadPx: 2, rowPadPx: 2, signGapPx: 8 },
  { fontPx: 13, lineHeight: 1.2, blockPadPx: 1, rowPadPx: 2, signGapPx: 6 },
  { fontPx: 12.5, lineHeight: 1.2, blockPadPx: 1, rowPadPx: 1, signGapPx: 6 },
  { fontPx: 12, lineHeight: 1.2, blockPadPx: 1, rowPadPx: 1, signGapPx: 6 },
  { fontPx: 11.5, lineHeight: 1.15, blockPadPx: 1, rowPadPx: 1, signGapPx: 4 },
  { fontPx: 11, lineHeight: 1.15, blockPadPx: 0, rowPadPx: 1, signGapPx: 4 },
];

export const PRINT_FIT_MIN_FONT_PX = PRINT_FIT_STEPS[PRINT_FIT_STEPS.length - 1].fontPx;

/** The CSS custom properties the print stylesheet reads in fit mode. */
export function printFitVariables(step: PrintFitStep): Record<string, string> {
  return {
    '--fit-font-size': `${step.fontPx}px`,
    '--fit-line-height': String(step.lineHeight),
    '--fit-block-pad': `${step.blockPadPx}px`,
    '--fit-row-pad': `${step.rowPadPx}px`,
    '--fit-sign-gap': `${step.signGapPx}px`,
  };
}

export function applyPrintFitStep(el: HTMLElement, index: number) {
  for (const [name, value] of Object.entries(printFitVariables(PRINT_FIT_STEPS[index]))) el.style.setProperty(name, value);
  el.setAttribute('data-fit-step', String(index));
}

/**
 * The index of the first (roomiest) step whose height fits, starting at
 * `from`. Heights only shrink from one step to the next, so this is also the
 * roomiest step that fits. Returns the last step when none fits.
 */
export function chooseFitStep(heightAt: (index: number) => number, availablePx: number, from = 0): { index: number; fits: boolean } {
  for (let i = from; i < PRINT_FIT_STEPS.length; i++) {
    if (heightAt(i) <= availablePx) return { index: i, fits: true };
  }
  return { index: PRINT_FIT_STEPS.length - 1, fits: false };
}

const PX_PER_MM = 96 / 25.4;

export function pageContentBoxPx(paper: 'A4' | 'LETTER' | string | undefined, margins: { topMm: number; bottomMm: number; leftMm: number; rightMm: number }) {
  const [widthMm, heightMm] = paper === 'LETTER' ? [215.9, 279.4] : [210, 297];
  return {
    widthPx: (widthMm - margins.leftMm - margins.rightMm) * PX_PER_MM,
    heightPx: (heightMm - margins.topMm - margins.bottomMm) * PX_PER_MM,
  };
}

/**
 * Lays the print markup out off-screen at the page's content width and picks
 * the roomiest step that fits `availablePx`. Returns the markup with that
 * step applied. `hostClassName` must give the host the same print font scope
 * as the Paged.js container, so the measured lines wrap the same way.
 */
export function fitPrintMarkup(html: string, opts: { widthPx: number; availablePx: number; from?: number; hostClassName: string }): { html: string; index: number; fits: boolean } {
  const host = document.createElement('div');
  host.className = opts.hostClassName;
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:absolute;left:-100000px;top:0;visibility:hidden;display:flow-root;width:${opts.widthPx}px;`;
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    const root = host.querySelector<HTMLElement>('[data-fit-to-page]');
    if (!root) return { html, index: 0, fits: true };
    const heightAt = (i: number) => {
      applyPrintFitStep(root, i);
      return host.getBoundingClientRect().height;
    };
    const result = chooseFitStep(heightAt, opts.availablePx, opts.from ?? 0);
    applyPrintFitStep(root, result.index);
    return { html: host.innerHTML, ...result };
  } finally {
    host.remove();
  }
}
