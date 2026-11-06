import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PatientDeduplicationService } from '../patient-deduplication.service';

const reviewedExclusions: Record<string, string> = {
  User: 'portalUserId and primaryDoctorId live on the Patient row; the merge moves the portal link there',
  Branch:
    'branchId lives on the Patient row and every duplicate group shares one branch',
};

const knownGaps: Record<string, string> = {
  PharmacyDispenseTask:
    'patientId has no Prisma relation, so dispense tasks stay on the archived duplicate',
};

type Model = (typeof Prisma.dmmf.datamodel.models)[number];

function patientLinkedModels(models: readonly Model[]): string[] {
  return models
    .filter((model) => model.name !== 'Patient')
    .filter((model) =>
      model.fields.some(
        (field) =>
          (field.kind === 'object' && field.type === 'Patient') ||
          (field.kind === 'scalar' && field.name === 'patientId'),
      ),
    )
    .map((model) => model.name)
    .sort();
}

const delegateFor = (modelName: string) =>
  modelName[0].toLowerCase() + modelName.slice(1);

async function modelsRepointedByMerge(): Promise<Set<string>> {
  const kept = {
    id: 'kept',
    branchId: 'branch',
    name: 'Asha Rao',
    phone: '9876543210',
    createdAt: new Date('2026-01-01'),
    portalUserId: null,
  };
  const duplicate = {
    ...kept,
    id: 'duplicate',
    createdAt: new Date('2026-02-01'),
  };
  const repointed = new Set<string>();
  const tx = new Proxy({} as Record<string, unknown>, {
    get(_, delegate: string) {
      if (delegate === 'patient')
        return {
          findMany: async () => [kept, duplicate],
          update: async ({ where, data }: any) => ({
            ...(where.id === kept.id ? kept : duplicate),
            ...data,
          }),
        };
      return {
        findMany: async () => [],
        update: async () => ({}),
        updateMany: async ({ where, data }: any) => {
          if (where?.patientId === duplicate.id && data?.patientId === kept.id)
            repointed.add(delegate);
          return { count: 0 };
        },
      };
    },
  });
  const prisma = {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValue([]),
    $transaction: async (fn: (client: unknown) => unknown) => fn(tx),
    patient: { findMany: async () => [kept, duplicate] },
  };
  const summary = await new PatientDeduplicationService(
    prisma as any,
  ).runDuplicatePatientMergeJob();
  expect(summary).toMatchObject({
    duplicateGroupsMerged: 1,
    patientsArchived: 1,
  });
  return repointed;
}

const unaccounted = (linked: string[], repointed: Set<string>) =>
  linked.filter(
    (name) =>
      !repointed.has(delegateFor(name)) &&
      !(name in reviewedExclusions) &&
      !(name in knownGaps),
  );

describe('Patient merge covers every patient-linked model', () => {
  beforeAll(() => Logger.overrideLogger(false));

  it('repoints, excludes after review, or lists as a known gap every model that references Patient', async () => {
    const linked = patientLinkedModels(Prisma.dmmf.datamodel.models);
    expect(linked.length).toBeGreaterThanOrEqual(11);
    expect(unaccounted(linked, await modelsRepointedByMerge())).toEqual([]);
  });

  it('repoints all eleven foreign-key children of Patient', async () => {
    expect([...(await modelsRepointedByMerge())].sort()).toEqual([
      'appointment',
      'consent',
      'deviceLog',
      'draftAttachment',
      'experimentAssignment',
      'invoice',
      'labOrder',
      'newInvoice',
      'pharmacyInvoice',
      'referral',
      'visit',
    ]);
  });

  it('keeps the exclusion and known-gap lists honest', async () => {
    const linked = patientLinkedModels(Prisma.dmmf.datamodel.models);
    const repointed = await modelsRepointedByMerge();
    for (const name of [
      ...Object.keys(reviewedExclusions),
      ...Object.keys(knownGaps),
    ]) {
      expect({ name, linked: linked.includes(name) }).toEqual({
        name,
        linked: true,
      });
      expect({ name, repointed: repointed.has(delegateFor(name)) }).toEqual({
        name,
        repointed: false,
      });
    }
  });

  it('flags a patient-linked model added later that the merge does not repoint', async () => {
    const planted = {
      name: 'PatientNote',
      fields: [{ name: 'patient', kind: 'object', type: 'Patient' }],
    } as unknown as Model;
    const linked = patientLinkedModels([
      ...Prisma.dmmf.datamodel.models,
      planted,
    ]);
    expect(unaccounted(linked, await modelsRepointedByMerge())).toEqual([
      'PatientNote',
    ]);
  });
});
