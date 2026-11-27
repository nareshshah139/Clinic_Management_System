import { execFileSync } from 'node:child_process';
import { PrescriptionsService } from '../prescriptions.service';

async function pdfText(items: object[]) {
  const prescription = {
    id: 'title-case-rx',
    items: JSON.stringify(items),
    visit: { consultationType: 'IN_PERSON', createdAt: new Date('2026-11-27'), patient: { name: 'Synthetic Patient' }, doctor: { firstName: 'Test', lastName: 'Doctor' } },
  };
  const db = { prescription: { findFirst: jest.fn().mockResolvedValue(prescription) }, prescriptionPrintEvent: { create: jest.fn().mockResolvedValue({}) } };
  const result = await new PrescriptionsService(db as any, {} as any).generatePrescriptionPdf('title-case-rx', 'branch', {});
  return execFileSync(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-', '-'], { input: Buffer.from(result.fileUrl.split(',')[1], 'base64') }).toString();
}

it('reprints an old prescription without catalogue codes or pack sizes and keeps a new one exactly as saved', async () => {
  const prescription = {
    id: 'old-rx',
    items: JSON.stringify([
      { drugName: '13 74 | Flutas 150Mg(Pc)', dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_WEEKLY', duration: 4, durationUnit: 'WEEKS' },
      { drugName: '1 Antoxid-Hc Capsules 30S (loose capsules)', dosage: 1, dosageUnit: 'CAPSULE', frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS' },
      { drugName: 'Syp. Teczine 2.5mg/5ml', dosage: 5, dosageUnit: 'ML', frequency: 'ONCE_DAILY', duration: 5, durationUnit: 'DAYS' },
      { drugName: 'Moisturiser', dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', durationUnit: 'DAYS' },
    ]),
    visit: { consultationType: 'IN_PERSON', createdAt: new Date('2026-09-27'), patient: { name: 'Synthetic Patient' }, doctor: { firstName: 'Test', lastName: 'Doctor' } },
  };
  const db = { prescription: { findFirst: jest.fn().mockResolvedValue(prescription) }, prescriptionPrintEvent: { create: jest.fn().mockResolvedValue({}) } };
  const service = new PrescriptionsService(db as any, {} as any);
  const result = await service.generatePrescriptionPdf('old-rx', 'branch', {});
  const text = execFileSync(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-', '-'], { input: Buffer.from(result.fileUrl.split(',')[1], 'base64') }).toString();
  expect(text.split('\n').filter((line) => /^\d\. /.test(line))).toEqual([
    '1. Flutas 150 mg 1 TABLET — ONCE_WEEKLY x 4 WEEKS',
    '2. Antoxid-HC Capsules 1 CAPSULE — ONCE_DAILY x 30 DAYS',
    '3. Syp. Teczine 2.5mg/5ml 5 ML — ONCE_DAILY x 5 DAYS',
    '4. Moisturiser 1 TABLET — ONCE_DAILY',
  ]);
  expect(text).not.toContain('13 74');
  expect(text).not.toContain('30S');
});

it('prints catalogue names typed in capitals in title case, with the same abbreviations and units as the preview', async () => {
  const rx = { dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS' };
  const text = await pdfText([
    { ...rx, drugName: 'Ahaglo facewash' },
    { ...rx, drugName: 'HYBLOK-ACE GEL CREAM 50 G' },
    { ...rx, drugName: 'PHOTODERM XDEF INVISIBLE SUNSCREEN' },
    { ...rx, drugName: 'TYRODIN FSR 500MG TABLET', instructions: 'START AFTER NOSE PIERCING' },
    { ...rx, drugName: 'ZOCEF CV 500 TABLET', instructions: 'Start after nose piercing' },
  ]);
  const suffix = ' 1 TABLET — ONCE_DAILY x 30 DAYS';
  expect(text.split('\n').filter((line) => /^\d\. /.test(line))).toEqual([
    `1. Ahaglo Facewash${suffix}`,
    `2. Hyblok-Ace Gel Cream 50 g${suffix}`,
    `3. Photoderm XDEF Invisible Sunscreen${suffix}`,
    `4. Tyrodin FSR 500 mg Tablet${suffix}`,
    `5. Zocef CV 500 Tablet${suffix}`,
  ]);
  expect(text.split('\n').filter((line) => line.startsWith('Notes: '))).toEqual(['Notes: Start After Nose Piercing', 'Notes: Start after nose piercing']);
});
