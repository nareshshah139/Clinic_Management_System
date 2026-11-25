import { placeDrugDropdown } from '@/components/visits/drug-dropdown-position';

const rect = (left: number, top: number, width: number, height = 36) => ({ left, top, width, bottom: top + height });

describe('placeDrugDropdown', () => {
  it('fits a phone screen with an 8px gutter on each side', () => {
    expect(placeDrugDropdown(rect(16, 100, 200), { width: 375, height: 667 }))
      .toEqual({ left: 8, width: 359, top: 140, maxHeight: 256 });
  });

  it('keeps the 500px minimum on a desktop and slides left instead of overflowing the right edge', () => {
    expect(placeDrugDropdown(rect(1000, 200, 300), { width: 1280, height: 800 }))
      .toEqual({ left: 772, width: 500, top: 240, maxHeight: 256 });
  });

  it('matches a wide input', () => {
    expect(placeDrugDropdown(rect(40, 200, 640), { width: 1280, height: 800 }))
      .toEqual({ left: 40, width: 640, top: 240, maxHeight: 256 });
  });

  it('opens upward when the input is near the bottom of the screen', () => {
    expect(placeDrugDropdown(rect(16, 600, 200), { width: 375, height: 667 }))
      .toEqual({ left: 8, width: 359, bottom: 71, maxHeight: 256 });
  });

  it('stays below and shrinks when there is more room below than above', () => {
    expect(placeDrugDropdown(rect(16, 60, 200), { width: 375, height: 300 }))
      .toEqual({ left: 8, width: 359, top: 100, maxHeight: 192 });
  });
});
