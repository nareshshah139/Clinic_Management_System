import { execFileSync } from 'node:child_process';
import { PrescriptionsService } from '../prescriptions.service';

describe('Empty complaints in prescription outputs (CR-03)', () => {
  it.each(['[]', JSON.stringify([{ complaint: '  \n  ' }])])('omits empty complaint sections from server PDF and sharing for %s', async (complaints) => {
    const prescription = {
      id: 'synthetic-rx',
      items: JSON.stringify([{ drugName: 'Synthetic medicine', frequency: 'ONCE_DAILY', duration: 7, durationUnit: 'DAYS' }]),
      visit: { complaints, patient: { name: 'Synthetic Patient' }, doctor: { firstName: 'Test', lastName: 'Doctor' } },
    };
    const prisma = {
      prescription: { findFirst: jest.fn().mockResolvedValue(prescription) },
      prescriptionPrintEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const notifications = { sendWhatsAppDocument: jest.fn().mockResolvedValue(undefined), sendEmail: jest.fn().mockResolvedValue(undefined) };
    const service = new PrescriptionsService(prisma as any, notifications as any);
    const pdf = await service.generatePrescriptionPdf(prescription.id, 'branch', {});
    await service.sharePrescription(prescription.id, 'branch', 'doctor', { channel: 'WHATSAPP', to: '+10000000000', includePdf: true });
    for (const bytes of [Buffer.from(pdf.fileUrl.split(',')[1], 'base64'), notifications.sendWhatsAppDocument.mock.calls[0][0].pdfBuffer]) {
      const text = execFileSync(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-', '-'], { input: bytes }).toString();
      expect(text).toContain('Synthetic medicine');
      expect(text).not.toMatch(/Chief Complaints|General consultation/i);
    }
    // Email currently sends a readiness message, without a clinical body or attachment.
    await service.sharePrescription(prescription.id, 'branch', 'doctor', { channel: 'EMAIL', to: 'synthetic@example.test', message: 'Your prescription is ready.' });
    expect(notifications.sendEmail).toHaveBeenCalledWith({ to: 'synthetic@example.test', subject: 'Your Prescription', text: 'Your prescription is ready.' });
    expect(prescription.visit.complaints).toBe(complaints);
  });
});
