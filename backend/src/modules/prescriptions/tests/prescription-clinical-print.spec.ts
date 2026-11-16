import { execFileSync } from 'node:child_process';
import { PrescriptionsService } from '../prescriptions.service';

describe('direct PDF clinical content', () => {
  it.each(['download', 'WhatsApp'])('preserves nonempty clinical sections and canonical medicine names in %s exports', async channel => {
    const prescription = { id: 'rx-test', items: JSON.stringify([{ drugName: '13 74 | Flutas 150Mg(Pc)', dosageForm: 'tablet', dosage: 1 }]),
      visit: { patient: { name: 'Synthetic Patient' }, doctor: { firstName: 'Test', lastName: 'Doctor' },
        complaints: JSON.stringify([{ complaint: 'Itchy rash' }]), exam: JSON.stringify({ generalAppearance: 'Red plaques on forearm' }),
        diagnosis: JSON.stringify([{ diagnosis: 'Eczema' }]), history: JSON.stringify({ personalHistory: 'Works outdoors', pastHistory: 'Past allergy' }),
        plan: JSON.stringify({ investigations: ['CBC'], followUpInstructions: 'Return if worsening', followUpDate: '2026-11-10' }) } };
    const before = JSON.stringify(prescription);
    const prisma = { prescription: { findFirst: jest.fn().mockResolvedValue(prescription) }, prescriptionPrintEvent: { create: jest.fn().mockResolvedValue({}) } };
    const notifications = { sendWhatsAppDocument: jest.fn().mockResolvedValue(undefined) };
    const service = new PrescriptionsService(prisma as any, notifications as any);
    let bytes: Buffer;
    if (channel === 'download') {
      const result = await service.generatePrescriptionPdf('rx-test', 'branch', {});
      bytes = Buffer.from(result.fileUrl.split(',')[1], 'base64');
    } else {
      await service.sharePrescription('rx-test', 'branch', 'doctor', { channel: 'WHATSAPP', to: '+10000000000', includePdf: true });
      bytes = notifications.sendWhatsAppDocument.mock.calls[0][0].pdfBuffer;
    }
    const output = execFileSync(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-', '-'], { input: bytes }).toString();
    for (const value of ['Chief complaints:', 'Itchy rash', 'Examination:', 'Red plaques on forearm', 'Diagnosis:', 'Eczema', 'Personal history:', 'Works outdoors', 'Past allergy', 'CBC', 'Return if worsening', '10/11/2026', 'Tab. Flutas 150 mg']) expect(output).toContain(value);
    expect(output.indexOf('Chief complaints:')).toBeLessThan(output.indexOf('Examination:'));
    expect(output.indexOf('Examination:')).toBeLessThan(output.indexOf('Diagnosis:'));
    expect(output).not.toContain('13 74');
    expect(JSON.stringify(prescription)).toBe(before);
  });
  it('omits cleared clinical fields and absent review data', async () => {
    const prescription = { id: 'empty', items: '[]', visit: { patient: {}, doctor: {}, complaints: '[]', history: '{"personalHistory":""}', exam: '{}', diagnosis: '[]' } };
    const prisma = { prescription: { findFirst: jest.fn().mockResolvedValue(prescription) }, prescriptionPrintEvent: { create: jest.fn() } };
    const pdf = await new PrescriptionsService(prisma as any, {} as any).generatePrescriptionPdf('empty', 'branch', {});
    const output = execFileSync(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-', '-'], { input: Buffer.from(pdf.fileUrl.split(',')[1], 'base64') }).toString();
    expect(output).not.toMatch(/Chief complaints:|Examination:|Diagnosis:|Personal history:|Review date:/);
  });
});
