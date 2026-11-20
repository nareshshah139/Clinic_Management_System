import { execFileSync } from 'node:child_process';
import { PrescriptionsService } from '../prescriptions.service';

const DOCTOR_ROW: Record<string, unknown> = {
  id: 'doc-1',
  firstName: 'Asha',
  lastName: 'Rao',
  email: 'asha@example.test',
  password: 'synthetic-hash',
  permissions: '["x"]',
  role: 'DOCTOR',
  branchId: 'branch',
};

// Resolves `doctor` the way Prisma does: `true` loads every column, a select only the chosen ones.
function buildDb() {
  const loaded: { doctor?: Record<string, unknown> } = {};
  const db = {
    prescription: {
      findFirst: jest.fn(async ({ include }: any) => {
        const doctorArg = include.visit.include.doctor;
        loaded.doctor = doctorArg === true
          ? { ...DOCTOR_ROW }
          : Object.fromEntries(Object.keys(doctorArg.select).filter((k) => doctorArg.select[k]).map((k) => [k, DOCTOR_ROW[k]]));
        return {
          id: 'rx-1',
          createdAt: new Date('2026-09-27'),
          items: JSON.stringify([{ drugName: 'Syp. Teczine', dosage: 5, dosageUnit: 'ML', frequency: 'ONCE_DAILY', duration: 5, durationUnit: 'DAYS' }]),
          visit: {
            id: 'visit-1',
            doctorId: 'doc-1',
            consultationType: 'IN_PERSON',
            createdAt: new Date('2026-09-27'),
            patient: { name: 'Synthetic Patient' },
            doctor: loaded.doctor,
          },
        };
      }),
    },
    prescriptionPrintEvent: { create: jest.fn().mockResolvedValue({}) },
    clinicAsset: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  return { db, loaded };
}

const textOf = (result: { fileUrl: string }) =>
  execFileSync(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-', '-'], { input: Buffer.from(result.fileUrl.split(',')[1], 'base64') }).toString();

describe('prescription PDF doctor fields', () => {
  it('loads only the doctor fields the PDF prints and prints the doctor name', async () => {
    const { db, loaded } = buildDb();
    const service = new PrescriptionsService(db as any, {} as any);

    const text = textOf(await service.generatePrescriptionPdf('rx-1', 'branch', {}));

    expect(Object.keys(loaded.doctor!).sort()).toEqual(['firstName', 'id', 'lastName']);
    expect(text).toContain('Doctor: Asha Rao');
    expect(text).toContain('Dr. Asha Rao');
  });

  it('looks up the signature for the visit doctor without loading more doctor columns', async () => {
    const { db, loaded } = buildDb();
    const service = new PrescriptionsService(db as any, {} as any);

    await service.generatePrescriptionPdf('rx-1', 'branch', { showSignature: true });

    expect(db.clinicAsset.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerId: 'doc-1' }) }));
    expect(Object.keys(loaded.doctor!).sort()).toEqual(['firstName', 'id', 'lastName']);
  });
});
