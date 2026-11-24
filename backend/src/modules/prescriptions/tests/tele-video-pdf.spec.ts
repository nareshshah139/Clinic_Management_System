import { execFileSync } from 'node:child_process';
import { PrescriptionsService } from '../prescriptions.service';
import { TELE_VIDEO_DISCLAIMER } from '../../visits/consultation';

it.each(['download', 'WHATSAPP', 'EMAIL'])('includes the tele-video disclaimer in %s PDFs and removes it for in-person', async channel => {
  const prescription = {
    id: 'tele-rx', items: JSON.stringify(Array.from({ length: 55 }, (_, i) => ({ drugName: `Synthetic medication ${i + 1}`, duration: 7, durationUnit: 'DAYS', instructions: 'Synthetic instruction to exercise pagination' }))),
    visit: { consultationType: 'TELE_VIDEO', createdAt: new Date('2026-09-27'), patient: { name: 'Synthetic Patient' }, doctor: { firstName: 'Test', lastName: 'Doctor' } },
  };
  const db = { prescription: { findFirst: jest.fn().mockResolvedValue(prescription) }, prescriptionPrintEvent: { create: jest.fn().mockResolvedValue({}) } };
  const notifications = { sendEmail: jest.fn(), sendWhatsAppDocument: jest.fn() };
  const service = new PrescriptionsService(db as any, notifications as any);
  for (const tele of [true, false]) {
    prescription.visit.consultationType = tele ? 'TELE_VIDEO' : 'IN_PERSON';
    let bytes: Buffer;
    if (channel === 'download') {
      const result = await service.generatePrescriptionPdf('tele-rx', 'branch', {});
      bytes = Buffer.from(result.fileUrl.split(',')[1], 'base64');
    } else {
      await service.sharePrescription('tele-rx', 'branch', 'staff', { channel: channel as any, to: 'synthetic@example.test', includePdf: true });
      bytes = channel === 'EMAIL' ? notifications.sendEmail.mock.calls.at(-1)![0].attachments[0].content : notifications.sendWhatsAppDocument.mock.calls.at(-1)![0].pdfBuffer;
    }
    const text = execFileSync(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-', '-'], { input: bytes }).toString();
    if (tele) {
      expect(text.replace(/\s+/g, ' ')).toContain(TELE_VIDEO_DISCLAIMER);
      expect(text).toMatch(/Date:.*Consultation: Tele-video/);
      const page = text.split('\f').find(page => page.includes('medico-legal'))!;
      expect(page).toContain('Signature');
      expect(page.indexOf('medico-legal')).toBeLessThan(page.indexOf('Signature'));
    } else {
      expect(text).not.toContain('Tele-video');
      expect(text).not.toContain('medico-legal');
    }
  }
});

it('rejects cross-branch prescriptions and invalid uploads before sharing', async () => {
  const db = { prescription: { findFirst: jest.fn().mockResolvedValue(null) }, prescriptionPrintEvent: { create: jest.fn() } };
  const notifications = { sendEmail: jest.fn(), sendWhatsAppDocument: jest.fn() };
  const service = new PrescriptionsService(db as any, notifications as any);
  const body = { channel: 'EMAIL' as const, to: 'synthetic@example.test' };
  const file = { buffer: Buffer.from('%PDF-synthetic'), mimetype: 'application/pdf' } as any;
  await expect(service.sharePrescriptionPreview('rx', 'branch', body, file)).rejects.toThrow('Prescription not found');
  expect(db.prescription.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'rx', visit: { deletedAt: null, patient: { branchId: 'branch' } } } }));
  db.prescription.findFirst.mockResolvedValue({ id: 'rx' } as any);
  await expect(service.sharePrescriptionPreview('rx', 'branch', body, { ...file, buffer: Buffer.from('not a pdf') })).rejects.toThrow('valid prescription PDF');
  await expect(service.sharePrescriptionPreview('rx', 'branch', { ...body, to: '' }, file)).rejects.toThrow('recipient');
  expect(notifications.sendEmail).not.toHaveBeenCalled();
  expect(notifications.sendWhatsAppDocument).not.toHaveBeenCalled();
  expect(db.prescriptionPrintEvent.create).not.toHaveBeenCalled();
});

it('names the shared preview attachment after the patient and visit day, ignoring the client file name', async () => {
  const db = {
    prescription: { findFirst: jest.fn().mockResolvedValue({ id: 'rx', createdAt: new Date('2026-11-25T00:00:00Z'), visit: { createdAt: new Date('2026-11-23T20:00:00Z'), patient: { name: 'Priya Sharma' } } }) },
    prescriptionPrintEvent: { create: jest.fn() },
  };
  const notifications = { sendEmail: jest.fn(), sendWhatsAppDocument: jest.fn() };
  const service = new PrescriptionsService(db as any, notifications as any);
  const file = { buffer: Buffer.from('%PDF-synthetic'), mimetype: 'application/pdf', originalname: 'evil.pdf' } as any;
  await service.sharePrescriptionPreview('rx', 'branch', { channel: 'EMAIL', to: 'synthetic@example.test' }, file);
  expect(notifications.sendEmail.mock.calls[0][0].attachments[0].filename).toBe('Prescription - Priya Sharma - 2026-11-24.pdf');
  await service.sharePrescriptionPreview('rx', 'branch', { channel: 'WHATSAPP', to: '+919000000000' }, file);
  expect(notifications.sendWhatsAppDocument.mock.calls[0][0].fileName).toBe('Prescription - Priya Sharma - 2026-11-24.pdf');
});
