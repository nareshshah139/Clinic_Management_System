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

  it('keeps real names that look like placeholder words', () => {
    expect(pdfFileName('Prescription', 'Na', '2026-11-24')).toBe('Prescription - Na - 2026-11-24.pdf');
    expect(pdfFileName('Prescription', 'NA', '2026-11-24')).toBe('Prescription - NA - 2026-11-24.pdf');
    expect(pdfFileName('Prescription', 'Null', '2026-11-24')).toBe('Prescription - Null - 2026-11-24.pdf');
    expect(pdfFileName('Prescription', 'N/A', '2026-11-24')).toBe('Prescription - N A - 2026-11-24.pdf');
  });

  it('drops names with no letter or digit, and missing or invalid dates', () => {
    expect(pdfFileName('Prescription', '—', '2026-11-24')).toBe('Prescription - 2026-11-24.pdf');
    expect(pdfFileName('Prescription', '-', '2026-11-24')).toBe('Prescription - 2026-11-24.pdf');
    expect(pdfFileName('Prescription', '...', '2026-11-24')).toBe('Prescription - 2026-11-24.pdf');
    expect(pdfFileName('Prescription', '', '2026-11-24')).toBe('Prescription - 2026-11-24.pdf');
    expect(pdfFileName('Prescription', null, '2026-11-24')).toBe('Prescription - 2026-11-24.pdf');
    expect(pdfFileName('Prescription', '\u200b', '2026-11-24')).toBe('Prescription - 2026-11-24.pdf');
    expect(pdfFileName('Prescription', '—', null)).toBe('Prescription.pdf');
    expect(pdfFileName('Invoice INV-1', undefined, 'not a date')).toBe('Invoice INV-1.pdf');
  });

  it('drops invisible and text-direction characters', () => {
    expect(pdfFileName('Prescription', 'Priya\u202eSharma', '2026-11-24')).toBe('Prescription - PriyaSharma - 2026-11-24.pdf');
    expect(pdfFileName('Prescription', '\u200bPriya', '2026-11-24')).toBe('Prescription - Priya - 2026-11-24.pdf');
    expect(pdfFileName('Prescription', '\ufeffPriya', '2026-11-24')).toBe('Prescription - Priya - 2026-11-24.pdf');
  });

  it('joins words separated only by a removed format character', () => {
    expect(pdfFileName('Prescription', 'Priya\u200bSharma', '2026-11-24')).toBe('Prescription - PriyaSharma - 2026-11-24.pdf');
    expect(pdfFileName('Prescription', 'Priya \u200b Sharma', '2026-11-24')).toBe('Prescription - Priya Sharma - 2026-11-24.pdf');
  });

  it('keeps the joiners that shape Indic and Persian names', () => {
    expect(pdfFileName('Prescription', 'क्\u200dष', '2026-11-24')).toBe('Prescription - क्\u200dष - 2026-11-24.pdf');
    expect(pdfFileName('Prescription', 'می\u200cخواهم', '2026-11-24')).toBe('Prescription - می\u200cخواهم - 2026-11-24.pdf');
  });

  it('caps a long Hindi name at 200 bytes', () => {
    const result = pdfFileName('Prescription', 'प्रिया शर्मा '.repeat(20), '2026-11-24');
    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(200);
    expect(result).toBe('Prescription - प्रिया शर्मा प्रिया शर्मा प्रिया शर्मा प्रिया शर्मा प्रिया श - 2026-11-24.pdf');
  });

  it('never cuts a Hindi name inside a grapheme cluster', () => {
    const result = pdfFileName('Prescription', 'शर्मा'.repeat(40), '2026-11-24');
    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(200);
    expect(result).toBe(`Prescription - ${'शर्मा'.repeat(11)}श - 2026-11-24.pdf`);
  });

  it('truncates a long ASCII patient name and keeps the title and day', () => {
    expect(pdfFileName('Prescription', 'x'.repeat(300), '2026-11-24')).toBe(
      `Prescription - ${'x'.repeat(168)} - 2026-11-24.pdf`,
    );
  });

  it('truncates the title too when title and day alone overflow', () => {
    const result = pdfFileName('T'.repeat(300), 'Priya', '2026-11-24');
    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(200);
    expect(result).toBe(`${'T'.repeat(183)} - 2026-11-24.pdf`);
    expect(pdfFileName('T'.repeat(300), 'Priya').endsWith('.pdf')).toBe(true);
  });
});
