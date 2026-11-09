import { PRINT_FIT_MIN_FONT_PX, PRINT_FIT_STEPS, chooseFitStep, pageContentBoxPx, printFitVariables } from '@/lib/print-fit';

describe('print fit steps', () => {
  it('go from roomiest to most compact, tightening spacing before text', () => {
    let shrunkText = false;
    for (let i = 1; i < PRINT_FIT_STEPS.length; i++) {
      const [a, b] = [PRINT_FIT_STEPS[i - 1], PRINT_FIT_STEPS[i]];
      expect(b.fontPx).toBeLessThanOrEqual(a.fontPx);
      expect(b.lineHeight).toBeLessThanOrEqual(a.lineHeight);
      expect(b.blockPadPx).toBeLessThanOrEqual(a.blockPadPx);
      expect(b.rowPadPx).toBeLessThanOrEqual(a.rowPadPx);
      if (b.fontPx < 14) shrunkText = true;
      else expect(shrunkText).toBe(false);
    }
    expect(PRINT_FIT_STEPS[0]).toMatchObject({ fontPx: 14 });
    expect(PRINT_FIT_MIN_FONT_PX).toBe(11);
  });

  it('exposes each step as CSS variables', () => {
    expect(printFitVariables(PRINT_FIT_STEPS[0])).toEqual({
      '--fit-font-size': '14px',
      '--fit-line-height': '1.45',
      '--fit-block-pad': '10px',
      '--fit-row-pad': '6px',
      '--fit-sign-gap': '20px',
    });
  });
});

describe('chooseFitStep', () => {
  const heights = PRINT_FIT_STEPS.map((_, i) => 1200 - i * 50);

  it('picks the roomiest step that fits', () => {
    expect(chooseFitStep(i => heights[i], 2000)).toEqual({ index: 0, fits: true });
    expect(chooseFitStep(i => heights[i], 1000)).toEqual({ index: 4, fits: true });
  });

  it('starts from a later step when asked', () => {
    expect(chooseFitStep(i => heights[i], 2000, 3)).toEqual({ index: 3, fits: true });
  });

  it('falls back to the smallest step when nothing fits', () => {
    expect(chooseFitStep(i => heights[i], 100)).toEqual({ index: PRINT_FIT_STEPS.length - 1, fits: false });
  });
});

describe('pageContentBoxPx', () => {
  it('subtracts the margins from the paper size at 96 dpi', () => {
    const a4 = pageContentBoxPx('A4', { topMm: 50, bottomMm: 20, leftMm: 10, rightMm: 10 });
    expect(a4.widthPx).toBeCloseTo(190 * 96 / 25.4, 3);
    expect(a4.heightPx).toBeCloseTo(227 * 96 / 25.4, 3);
    const letter = pageContentBoxPx('LETTER', { topMm: 0, bottomMm: 0, leftMm: 0, rightMm: 0 });
    expect(letter.widthPx).toBeCloseTo(816, 0);
    expect(letter.heightPx).toBeCloseTo(1056, 0);
  });
});
