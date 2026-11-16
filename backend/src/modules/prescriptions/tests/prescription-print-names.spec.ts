import { execFileSync } from 'node:child_process';
import { PrescriptionsService } from '../prescriptions.service';

describe('Prescription PDF medicine names (CR-01)', () => {
  it.each(['download', 'WhatsApp'])('omits selling labels from %s PDFs without changing saved names or clinical details', async (channel) => {
    const names = [
      'Test Medicine 7.5 mg (SR) (loose tablets)',
      'Test Medicine 10 mg (  LOOSE   TABLETS  ) ',
      'Test Medicine 5 mg (enteric coated)',
    ];
    const prescription = {
      id: 'rx-test',
      items: JSON.stringify(names.map(drugName => ({ drugName, dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 7, durationUnit: 'DAYS', instructions: 'Synthetic instructions' }))),
      visit: { patient: { name: 'Synthetic Patient' }, doctor: { firstName: 'Test', lastName: 'Doctor' } },
    };
    const originalItems = prescription.items;
    const prisma = {
      prescription: { findFirst: jest.fn().mockResolvedValue(prescription) },
      prescriptionPrintEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const notifications = { sendWhatsAppDocument: jest.fn().mockResolvedValue(undefined) };
    const service = new PrescriptionsService(prisma as any, notifications as any);
    let bytes: Buffer;
    if (channel === 'download') {
      const pdf = await service.generatePrescriptionPdf(prescription.id, 'test-branch', {});
      bytes = Buffer.from(pdf.fileUrl.split(',')[1], 'base64');
    } else {
      await service.sharePrescription(prescription.id, 'test-branch', 'test-doctor', { channel: 'WHATSAPP', to: '+10000000000', includePdf: true });
      bytes = notifications.sendWhatsAppDocument.mock.calls[0][0].pdfBuffer;
    }
    const text = execFileSync(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-', '-'], { input: bytes }).toString();
    expect(text).not.toMatch(/loose\s+tablets/i);
    expect(text).toContain('Test Medicine 7.5 mg (SR)');
    expect(text).toContain('Test Medicine 10 mg');
    expect(text).toContain('Test Medicine 5 mg (enteric coated)');
    expect(text).toContain('1 TABLET');
    expect(text).toContain('ONCE_DAILY x 7 DAYS');
    expect(text).toContain('Synthetic instructions');
    expect(prescription.items).toBe(originalItems);
  });
});
