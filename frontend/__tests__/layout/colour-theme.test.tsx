import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ColourThemeSetting } from '@/components/layout/colour-theme-setting';
import { PALETTE_BOOT_SCRIPT } from '@/lib/palette';
import { getGlobalPrintStyleTag } from '@/lib/printStyles';

const html = document.documentElement;
const runBootScript = () => new Function(PALETTE_BOOT_SCRIPT)();

beforeEach(() => {
  localStorage.clear();
  delete html.dataset.palette;
});

it('switches the page to the branded palette and remembers it in this browser', async () => {
  html.dataset.palette = 'original';
  render(<ColourThemeSetting />);
  const select = screen.getByRole('combobox', { name: 'Colour theme' });
  expect(select).toHaveValue('original');
  expect(select).toHaveAccessibleDescription('Saved for this browser only.');

  await userEvent.selectOptions(select, 'Branded');

  expect(html.getAttribute('data-palette')).toBe('branded');
  expect(localStorage.getItem('cms-palette')).toBe('branded');
  expect(select).toHaveValue('branded');
});

it('shows the palette already on the page when opened', () => {
  html.dataset.palette = 'branded';
  render(<ColourThemeSetting />);
  expect(screen.getByRole('combobox', { name: 'Colour theme' })).toHaveValue('branded');
});

describe('pre-paint script', () => {
  it('applies the saved palette', () => {
    localStorage.setItem('cms-palette', 'branded');
    runBootScript();
    expect(html.getAttribute('data-palette')).toBe('branded');
  });

  it('falls back to the original palette when nothing is saved', () => {
    runBootScript();
    expect(html.getAttribute('data-palette')).toBe('original');
  });

  it('falls back to the original palette when the saved value is unknown', () => {
    localStorage.setItem('cms-palette', 'dark');
    runBootScript();
    expect(html.getAttribute('data-palette')).toBe('original');
  });

  it('falls back to the original palette when storage throws', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    runBootScript();
    expect(html.getAttribute('data-palette')).toBe('original');
    getItem.mockRestore();
  });
});

it('prints with the inks of the active palette', () => {
  html.dataset.palette = 'branded';
  expect(getGlobalPrintStyleTag()).toContain('--print-accent: #616B60;');
  html.dataset.palette = 'original';
  expect(getGlobalPrintStyleTag()).toContain('--print-accent: #2563EB;');
});
