import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { localDatabase } from '../../../shared/testing/local-database';
import { PatientDeduplicationService } from '../patient-deduplication.service';

const databaseTests = process.env.PATIENT_MERGE_TEST_DATABASE_URL
  ? describe
  : describe.skip;

const linkedDelegates = [
  'appointment',
  'visit',
  'consent',
  'deviceLog',
  'invoice',
  'labOrder',
  'newInvoice',
  'referral',
  'pharmacyInvoice',
  'draftAttachment',
  'experimentAssignment',
] as const;

databaseTests('Patient merge with PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let prisma: PrismaClient;
  let branchId: string;
  let doctorId: string;
  let experimentId: string;
  let variantId: string;

  beforeAll(async () => {
    Logger.overrideLogger(false);
    fixture = await localDatabase(process.env.PATIENT_MERGE_TEST_DATABASE_URL!);
    prisma = fixture.prisma;
    const branch = await prisma.branch.create({
      data: { name: 'Synthetic merge', address: 'Synthetic' },
    });
    branchId = branch.id;
    const doctor = await prisma.user.create({
      data: {
        email: `merge-${randomUUID()}@example.invalid`,
        password: 'no-login',
        firstName: 'Synthetic',
        lastName: 'Doctor',
        role: 'DOCTOR',
        branchId,
      },
    });
    doctorId = doctor.id;
    const experiment = await prisma.layoutExperiment.create({
      data: { branchId, key: `exp-${randomUUID()}`, name: 'Synthetic' },
    });
    experimentId = experiment.id;
    variantId = (
      await prisma.layoutVariant.create({ data: { experimentId, key: 'A' } })
    ).id;
  }, 120000);

  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.$disconnect();
    for (const delegate of [
      'deviceLog',
      'labOrder',
      'visit',
      'appointment',
      'consent',
      'invoice',
      'newInvoice',
      'referral',
      'pharmacyInvoice',
      'draftAttachment',
      'experimentAssignment',
      'pharmacyDispenseTask',
      'patient',
    ])
      await (prisma as any)[delegate].deleteMany({});
  });
  afterAll(async () => {
    await fixture?.cleanup();
  });

  const createPatient = (overrides: Record<string, unknown> = {}) =>
    prisma.patient.create({
      data: {
        name: 'Asha Rao',
        gender: 'F',
        phone: '98765 43210',
        branchId,
        ...overrides,
      } as any,
    });

  async function seedLinkedRows(
    patientId: string,
    tag: string,
    visitDate: Date,
    visitNumber: number,
  ) {
    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        doctorId,
        branchId,
        date: visitDate,
        slot: '10:00-10:15',
        tokenNumber: visitNumber + Math.floor(Math.random() * 1e6),
      },
    });
    const visit = await prisma.visit.create({
      data: {
        patientId,
        doctorId,
        appointmentId: appointment.id,
        complaints: '[]',
        scribeJson: JSON.stringify({ visitNumber, note: tag }),
      },
    });
    await prisma.consent.create({
      data: { patientId, consentType: 'GENERAL_CARE', text: tag },
    });
    await prisma.deviceLog.create({
      data: {
        patientId,
        visitId: visit.id,
        deviceModel: 'm',
        serialNo: tag,
        parameters: '{}',
        operatorId: doctorId,
      },
    });
    await prisma.invoice.create({
      data: {
        patientId,
        total: 1,
        balance: 1,
        invoiceNo: `INV-${tag}-${randomUUID()}`,
      },
    });
    await prisma.labOrder.create({
      data: { patientId, visitId: visit.id, tests: '[]', partner: tag },
    });
    await prisma.newInvoice.create({
      data: {
        patientId,
        branchId,
        total: 1,
        balance: 1,
        invoiceNo: `NEW-${tag}-${randomUUID()}`,
      },
    });
    await prisma.referral.create({ data: { patientId, source: tag } });
    await prisma.pharmacyInvoice.create({
      data: {
        patientId,
        branchId,
        invoiceNumber: `PH-${tag}-${randomUUID()}`,
        subtotal: 1,
        totalAmount: 1,
        paymentMethod: 'CASH',
        billingName: tag,
        billingPhone: '9876543210',
      },
    });
    await prisma.draftAttachment.create({
      data: {
        patientId,
        dateStr: '2026-01-01',
        filename: `${tag}.pdf`,
        contentType: 'application/pdf',
        sizeBytes: 1,
        data: Buffer.from('x'),
      },
    });
    await prisma.experimentAssignment.create({
      data: { patientId, experimentId, variantId },
    });
    return visit.id;
  }

  async function linkedCounts(patientId: string) {
    const counts: Record<string, number> = {};
    for (const delegate of linkedDelegates)
      counts[delegate] = await (prisma as any)[delegate].count({
        where: { patientId },
      });
    return counts;
  }

  const allOnes = Object.fromEntries(linkedDelegates.map((d) => [d, 1]));
  const allTwos = Object.fromEntries(linkedDelegates.map((d) => [d, 2]));
  const allZeros = Object.fromEntries(linkedDelegates.map((d) => [d, 0]));

  async function seedDuplicatePair() {
    const kept = await createPatient({
      createdAt: new Date('2026-01-01T00:00:00Z'),
      allergies: 'Penicillin',
    });
    const duplicate = await createPatient({
      name: 'asha  RAO',
      phone: '98765-43210',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      allergies: 'Sulfa',
      email: 'asha@example.invalid',
    });
    const keptVisit = await seedLinkedRows(
      kept.id,
      'kept',
      new Date('2026-03-10T00:00:00Z'),
      1,
    );
    const duplicateVisit = await seedLinkedRows(
      duplicate.id,
      'dup',
      new Date('2026-03-01T00:00:00Z'),
      1,
    );
    return { kept, duplicate, keptVisit, duplicateVisit };
  }

  it('moves every linked row of the duplicate to the kept patient and archives the duplicate', async () => {
    const { kept, duplicate } = await seedDuplicatePair();
    const bystander = await createPatient({
      name: 'Other Person',
      phone: '9123456780',
    });
    await seedLinkedRows(
      bystander.id,
      'other',
      new Date('2026-03-05T00:00:00Z'),
      1,
    );

    const summary = await new PatientDeduplicationService(
      prisma as any,
    ).runDuplicatePatientMergeJob();

    expect(summary).toMatchObject({
      skipped: false,
      duplicateGroupsFound: 1,
      duplicateGroupsMerged: 1,
      patientsArchived: 1,
    });
    expect(await linkedCounts(kept.id)).toEqual(allTwos);
    expect(await linkedCounts(duplicate.id)).toEqual(allZeros);
    expect(await linkedCounts(bystander.id)).toEqual(allOnes);
    const archived = await prisma.patient.findUniqueOrThrow({
      where: { id: duplicate.id },
    });
    expect(archived.isArchived).toBe(true);
    const keptAfter = await prisma.patient.findUniqueOrThrow({
      where: { id: kept.id },
    });
    expect(keptAfter).toMatchObject({
      isArchived: false,
      allergies: 'Penicillin\nSulfa',
      email: 'asha@example.invalid',
    });
    expect(
      (await prisma.patient.findUniqueOrThrow({ where: { id: bystander.id } }))
        .isArchived,
    ).toBe(false);
  });

  it('numbers the kept patient visits 1..n in appointment-date order and keeps other scribe fields', async () => {
    const { kept, keptVisit, duplicateVisit } = await seedDuplicatePair();
    const third = await createPatient({
      name: 'Asha Rao',
      phone: '9876543210',
      createdAt: new Date('2026-02-15T00:00:00Z'),
    });
    const thirdVisit = await seedLinkedRows(
      third.id,
      'third',
      new Date('2026-03-20T00:00:00Z'),
      7,
    );

    const summary = await new PatientDeduplicationService(
      prisma as any,
    ).runDuplicatePatientMergeJob();

    expect(summary).toMatchObject({
      duplicateGroupsMerged: 1,
      patientsArchived: 2,
    });
    const visits = await prisma.visit.findMany({
      where: { patientId: kept.id },
    });
    const byId = Object.fromEntries(
      visits.map((v) => [v.id, JSON.parse(v.scribeJson!)]),
    );
    expect(byId[duplicateVisit]).toEqual({ visitNumber: 1, note: 'dup' });
    expect(byId[keptVisit]).toEqual({ visitNumber: 2, note: 'kept' });
    expect(byId[thirdVisit]).toEqual({ visitNumber: 3, note: 'third' });

    const rerun = await new PatientDeduplicationService(
      prisma as any,
    ).runDuplicatePatientMergeJob();
    expect(rerun).toMatchObject({
      duplicateGroupsFound: 0,
      visitsRenumbered: 0,
    });
  });

  it('leaves every row unchanged when a step fails mid-merge', async () => {
    const { kept, duplicate } = await seedDuplicatePair();
    const before = await prisma.patient.findMany({ orderBy: { id: 'asc' } });
    const visitsBefore = await prisma.visit.findMany({
      orderBy: { id: 'asc' },
    });
    const realTransaction = prisma.$transaction.bind(prisma) as any;
    jest.spyOn(prisma, '$transaction').mockImplementation(((
      fn: any,
      options: any,
    ) =>
      realTransaction(async (tx: any) => {
        const failingTx = new Proxy(tx, {
          get(target, prop) {
            if (prop === 'referral')
              return {
                updateMany: async () => {
                  throw new Error('referral store unavailable');
                },
              };
            return target[prop];
          },
        });
        return fn(failingTx);
      }, options)) as any);

    await expect(
      new PatientDeduplicationService(
        prisma as any,
      ).runDuplicatePatientMergeJob(),
    ).rejects.toThrow('referral store unavailable');

    expect(await linkedCounts(kept.id)).toEqual(allOnes);
    expect(await linkedCounts(duplicate.id)).toEqual(allOnes);
    expect(await prisma.patient.findMany({ orderBy: { id: 'asc' } })).toEqual(
      before,
    );
    expect(await prisma.visit.findMany({ orderBy: { id: 'asc' } })).toEqual(
      visitsBefore,
    );
  });

  it('skips the run without touching patients while another process holds the merge lock', async () => {
    const { kept, duplicate } = await seedDuplicatePair();
    const other = new PrismaClient({
      datasourceUrl: process.env.PATIENT_MERGE_TEST_DATABASE_URL,
    });
    try {
      await other.$transaction(async (holder) => {
        await holder.$executeRaw`SELECT pg_advisory_xact_lock(8042601)`;
        const summary = await new PatientDeduplicationService(
          prisma as any,
        ).runDuplicatePatientMergeJob();
        expect(summary).toMatchObject({
          skipped: true,
          duplicateGroupsFound: 0,
        });
      });
    } finally {
      await other.$disconnect();
    }
    expect(await linkedCounts(duplicate.id)).toEqual(allOnes);
    expect(await linkedCounts(kept.id)).toEqual(allOnes);
  });

  // Target merge-repoints-unlinked-patient-ids: dispense tasks have no Patient relation to follow.
  it.failing(
    'moves pharmacy dispense tasks of the duplicate to the kept patient',
    async () => {
      const { kept, duplicate } = await seedDuplicatePair();
      const task = await prisma.pharmacyDispenseTask.create({
        data: {
          branchId,
          patientId: duplicate.id,
          patientName: duplicate.name,
        },
      });
      await new PatientDeduplicationService(
        prisma as any,
      ).runDuplicatePatientMergeJob();
      expect(
        (
          await prisma.pharmacyDispenseTask.findUniqueOrThrow({
            where: { id: task.id },
          })
        ).patientId,
      ).toBe(kept.id);
    },
  );

  it('releases the merge lock after every run, so the next run in any process merges again', async () => {
    const other = new PrismaClient({
      datasourceUrl: process.env.PATIENT_MERGE_TEST_DATABASE_URL,
    });
    try {
      await Promise.all(
        Array.from({ length: 8 }, () => prisma.$executeRaw`SELECT pg_sleep(0.05)`),
      );
      const runs: { skipped: boolean; merged: number; lockFree: boolean }[] = [];
      for (let run = 0; run < 10; run++) {
        await seedDuplicatePair();
        let requestsInFlight = true;
        const otherRequests = Promise.all(
          Array.from({ length: 16 }, async () => {
            while (requestsInFlight) await prisma.$executeRaw`SELECT pg_sleep(0.01)`;
          }),
        );
        const summary = await new PatientDeduplicationService(
          prisma as any,
        ).runDuplicatePatientMergeJob();
        requestsInFlight = false;
        await otherRequests;
        const lockFree = await other.$transaction(async (probe) => {
          const [row] = await probe.$queryRaw<
            { locked: boolean }[]
          >`SELECT pg_try_advisory_xact_lock(8042601) AS locked`;
          return row.locked;
        });
        runs.push({ skipped: summary.skipped, merged: summary.duplicateGroupsMerged, lockFree });
      }
      expect(runs).toEqual(
        Array.from({ length: 10 }, () => ({ skipped: false, merged: 1, lockFree: true })),
      );
    } finally {
      await other.$disconnect();
    }
  });
});
