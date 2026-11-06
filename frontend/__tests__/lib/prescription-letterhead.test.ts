import { PRESCRIPTION_LETTERHEAD_URL, prescriptionLetterheadUrl, prescriptionPageMargin, savedPrintBackground } from '@/lib/prescription-letterhead';

const storage = (entries: Record<string, string>) => ({ getItem: (key: string) => entries[key] ?? null });
const OWN = 'data:image/jpeg;base64,T1dO';

describe('prescriptionLetterheadUrl', () => {
  it.each([undefined, null, '', '/letterhead.png', PRESCRIPTION_LETTERHEAD_URL])('resolves %p to the prescribing doctor\'s letterhead', (url) => {
    expect(prescriptionLetterheadUrl(url, PRESCRIPTION_LETTERHEAD_URL)).toBe(PRESCRIPTION_LETTERHEAD_URL);
    expect(prescriptionLetterheadUrl(url, OWN)).toBe(OWN);
    expect(prescriptionLetterheadUrl(url, null)).toBe('');
  });

  it('keeps an explicit custom background', () => {
    expect(prescriptionLetterheadUrl('/custom.jpg', OWN)).toBe('/custom.jpg');
  });
});

describe('prescriptionPageMargin', () => {
  it('reserves header and footer space only for the bundled letterhead', () => {
    expect(prescriptionPageMargin(150, 'top', PRESCRIPTION_LETTERHEAD_URL)).toBe(200);
    expect(prescriptionPageMargin(45, 'bottom', PRESCRIPTION_LETTERHEAD_URL)).toBe(86);
    expect(prescriptionPageMargin(150, 'top', OWN)).toBe(150);
    expect(prescriptionPageMargin(150, 'top', '')).toBe(150);
    expect(prescriptionPageMargin(150, 'top', PRESCRIPTION_LETTERHEAD_URL, false)).toBe(150);
  });
});

describe('savedPrintBackground', () => {
  it('keeps each doctor\'s override separate', () => {
    const s = storage({ 'rx_print_bg_url:a': '/a.jpg', 'rx_print_bg_url:b': '' });
    expect(savedPrintBackground(s, 'a', 'uploaded')).toBe('/a.jpg');
    expect(savedPrintBackground(s, 'b', 'bundled')).toBe('');
  });

  it('carries the legacy browser-wide custom background over only to Dr. Praneeta Jain', () => {
    const s = storage({ rx_print_bg_url: '/her-custom.jpg' });
    expect(savedPrintBackground(s, 'praneeta', 'bundled')).toBe('/her-custom.jpg');
    expect(savedPrintBackground(s, 'other', 'uploaded')).toBe('');
    expect(savedPrintBackground(s, 'other', undefined)).toBe('');
  });

  it('ignores a legacy value that only stored the old default letterhead', () => {
    expect(savedPrintBackground(storage({ rx_print_bg_url: PRESCRIPTION_LETTERHEAD_URL }), 'praneeta', 'bundled')).toBe('');
    expect(savedPrintBackground(storage({ rx_print_bg_url: '/letterhead.png' }), 'praneeta', 'bundled')).toBe('');
  });
});
