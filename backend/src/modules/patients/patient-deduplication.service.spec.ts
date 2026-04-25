import { PatientDeduplicationService } from './patient-deduplication.service';

describe('PatientDeduplicationService', () => {
  const makePatient = (overrides: Record<string, unknown> = {}) => ({
    id: 'patient-default',
    patientCode: null,
    abhaId: null,
    name: 'John Doe',
    gender: 'MALE',
    dob: null,
    age: null,
    phone: '9876543210',
    email: null,
    address: null,
    city: null,
    state: null,
    pincode: null,
    emergencyContact: null,
    allergies: null,
    photoUrl: null,
    referralSource: null,
    secondaryPhone: null,
    maritalStatus: null,
    bloodGroup: null,
    occupation: null,
    guardianName: null,
    medicalHistory: null,
    consultationType: null,
    portalUserId: null,
    branchId: 'branch-1',
    isArchived: false,
    archivedAt: null,
    createdAt: new Date('2026-04-01T10:00:00.000Z'),
    updatedAt: new Date('2026-04-01T10:00:00.000Z'),
    ...overrides,
  });

  const makeVisit = (overrides: Record<string, unknown> = {}) => ({
    id: 'visit-default',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    appointmentId: null,
    vitals: null,
    complaints: '[]',
    history: null,
    exam: null,
    diagnosis: null,
    plan: null,
    followUp: null,
    attachments: null,
    scribeJson: null,
    createdAt: new Date('2026-04-01T10:00:00.000Z'),
    updatedAt: new Date('2026-04-01T10:00:00.000Z'),
    appointment: null,
    ...overrides,
  });

  const createTxMock = () => ({
    patient: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    appointment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    visit: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    consent: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    deviceLog: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    invoice: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    labOrder: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    newInvoice: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    referral: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    pharmacyInvoice: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    draftAttachment: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    experimentAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  });

  it('skips the merge run when another instance holds the advisory lock', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValueOnce([{ locked: false }]),
      patient: { findMany: jest.fn() },
    } as any;

    const service = new PatientDeduplicationService(prisma);
    const result = await service.runDuplicatePatientMergeJob();

    expect(result).toEqual({
      skipped: true,
      duplicateGroupsFound: 0,
      duplicateGroupsMerged: 0,
      patientsArchived: 0,
      visitsRenumbered: 0,
    });
    expect(prisma.patient.findMany).not.toHaveBeenCalled();
  });

  it('merges duplicate patients and renumbers visits by date order', async () => {
    const canonical = makePatient({
      id: 'patient-1',
      createdAt: new Date('2026-01-01T09:00:00.000Z'),
      medicalHistory: 'Hypertension',
    });
    const duplicate = makePatient({
      id: 'patient-2',
      createdAt: new Date('2026-03-01T09:00:00.000Z'),
      medicalHistory: 'Diabetes',
      portalUserId: 'portal-2',
    });

    const tx = createTxMock();
    tx.patient.findMany.mockResolvedValue([canonical, duplicate]);
    tx.patient.update.mockImplementation(async ({ where, data }: any) => ({
      ...(where.id === canonical.id ? canonical : duplicate),
      ...data,
      id: where.id,
    }));
    tx.visit.findMany.mockResolvedValue([
      makeVisit({
        id: 'visit-oldest',
        patientId: canonical.id,
        createdAt: new Date('2026-01-10T09:00:00.000Z'),
        scribeJson: JSON.stringify({ visitNumber: 4 }),
      }),
      makeVisit({
        id: 'visit-newest',
        patientId: canonical.id,
        createdAt: new Date('2026-03-10T09:00:00.000Z'),
        scribeJson: JSON.stringify({ visitNumber: 1 }),
      }),
    ]);

    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([{ unlocked: true }]),
      $transaction: jest.fn(async (fn: any) => fn(tx)),
      patient: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: canonical.id,
            branchId: canonical.branchId,
            name: canonical.name,
            phone: canonical.phone,
            createdAt: canonical.createdAt,
          },
          {
            id: duplicate.id,
            branchId: duplicate.branchId,
            name: duplicate.name,
            phone: duplicate.phone,
            createdAt: duplicate.createdAt,
          },
        ]),
      },
    } as any;

    const service = new PatientDeduplicationService(prisma);
    const result = await service.runDuplicatePatientMergeJob();

    expect(result).toEqual({
      skipped: false,
      duplicateGroupsFound: 1,
      duplicateGroupsMerged: 1,
      patientsArchived: 1,
      visitsRenumbered: 2,
    });

    expect(tx.appointment.updateMany).toHaveBeenCalledWith({
      where: { patientId: duplicate.id },
      data: { patientId: canonical.id },
    });
    expect(tx.visit.updateMany).toHaveBeenCalledWith({
      where: { patientId: duplicate.id },
      data: { patientId: canonical.id },
    });

    expect(tx.patient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: canonical.id },
        data: expect.objectContaining({
          medicalHistory: 'Hypertension\nDiabetes',
          portalUserId: 'portal-2',
        }),
      }),
    );

    expect(tx.patient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: duplicate.id },
        data: expect.objectContaining({
          isArchived: true,
          portalUserId: null,
        }),
      }),
    );

    expect(tx.visit.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'visit-oldest' },
        data: { scribeJson: JSON.stringify({ visitNumber: 1 }) },
      }),
    );
    expect(tx.visit.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'visit-newest' },
        data: { scribeJson: JSON.stringify({ visitNumber: 2 }) },
      }),
    );
  });
});
