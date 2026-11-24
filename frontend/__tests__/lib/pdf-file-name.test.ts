import { pdfFileName } from '@/lib/pdf-file-name';

describe('pdfFileName', () => {
  it('joins title, patient and day', () => {
    expect(pdfFileName('Prescription', 'Priya Sharma', '2026-11-24')).toBe('Prescription - Priya Sharma - 2026-11-24.pdf');
  });

  it('uses the Asia/Kolkata day for instants that cross midnight UTC', () => {
    expect(pdfFileName('Prescription', 'Priya Sharma', new Date('2026-11-23T20:00:00Z'))).toBe('Prescription - Priya Sharma - 2026-11-24.pdf');
    expect(pdfFileName('Prescription', 'Priya Sharma', '2026-11-23T20:00:00.000Z')).toBe('Prescription - Priya Sharma - 2026-11-24.pdf');
  });

  it('strips characters illegal in filenames', () => {
    expect(pdfFileName('Invoice INV-1', 'A/B:C*D?"E<F>G|H\\I', '2026-11-24')).toBe('Invoice INV-1 - A B C D E F G H I - 2026-11-24.pdf');
    expect(pdfFileName('Prescription', '  ..Priya\t\nSharma..  ')).toBe('Prescription - Priya Sharma.pdf');
  });

  it('keeps Hindi names', () => {
    expect(pdfFileName('Prescription', 'प्रिया शर्मा', '2026-11-24')).toBe('Prescription - प्रिया शर्मा - 2026-11-24.pdf');
  });

  it('drops placeholder names and missing or invalid dates', () => {
    expect(pdfFileName('Prescription', '—', '2026-11-24')).toBe('Prescription - 2026-11-24.pdf');
    expect(pdfFileName('Prescription', 'N/A', null)).toBe('Prescription.pdf');
    expect(pdfFileName('Invoice INV-1', undefined, 'not a date')).toBe('Invoice INV-1.pdf');
  });

  it('truncates the patient name and never the title', () => {
    const result = pdfFileName('Prescription', 'x'.repeat(300), '2026-11-24');
    expect(result.length).toBeLessThanOrEqual(124);
    expect(result.startsWith('Prescription - xxx')).toBe(true);
    expect(result.endsWith(' - 2026-11-24.pdf')).toBe(true);
  });
});
