import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { localDatabase } from '../../../shared/testing/local-database';
import { gate } from '../../../shared/testing/interleave';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PharmacyInvoiceService } from '../../pharmacy/pharmacy-invoice.service';
import { PrescriptionsService } from '../prescriptions.service';

const databaseTests = process.env.FORMAL_REPLAY_TEST_DATABASE_URL ? describe : describe.skip;

databaseTests('Prescriptions formal model replays (verification/state-machines/prescriptions)', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let prisma: PrismaClient;
  let branchId: string;
  let doctorId: string;
  let reviewerId: string;
  let pharmacistId: string;
  let patientId: string;

  const prescriptions = (client: object = prisma) =>
    new PrescriptionsService(client as PrismaService, {} as NotificationsService);
  const invoices = () => new PharmacyInvoiceService(prisma as any, new InvoiceNumbersService(prisma as any));
  const outcome = (promise: Promise<unknown>) => promise.then(() => 'done', () => 'refused');

  const throwingOn = <T extends object>(client: T, model: string, method: string): T =>
    new Proxy(client, {
      get(target, key) {
        const value = (target as any)[key];
        if (key === '$transaction') {
          return (work: (tx: object) => unknown, ...rest: unknown[]) =>
            value.call(target, (tx: object) => work(throwingOn(tx, model, method)), ...rest);
        }
        if (key !== model) return typeof value === 'function' ? value.bind(target) : value;
        return new Proxy(value, {
          get(delegate, name) {
            if (name === method) return async () => { throw new Error('the review record insert failed'); };
            const member = delegate[name];
            return typeof member === 'function' ? member.bind(delegate) : member;
          },
        });
      },
    });

  beforeAll(async () => {
    Logger.overrideLogger(false);
    fixture = await localDatabase(process.env.FORMAL_REPLAY_TEST_DATABASE_URL!);
    prisma = fixture.prisma;
    branchId = (await prisma.branch.create({ data: { name: 'Synthetic replay clinic', address: 'Synthetic' } })).id;
    const user = (role: 'DOCTOR' | 'ADMIN' | 'PHARMACIST') =>
      prisma.user.create({ data: { branchId, firstName: 'Synthetic', lastName: role, email: `${randomUUID()}@example.invalid`, password: 'no-login', role } });
    doctorId = (await user('DOCTOR')).id;
    reviewerId = (await user('ADMIN')).id;
    pharmacistId = (await user('PHARMACIST')).id;
    patientId = (await prisma.patient.create({ data: { branchId, name: 'Synthetic Patient', phone: '9876543210', gender: 'F' } })).id;
  }, 120_000);
  afterAll(() => fixture?.cleanup());

  const prescription = async (maxRefills: number) => {
    const drug = await prisma.drug.create({ data: { branchId, name: `Synthetic ${randomUUID()}`, price: 20, manufacturerName: 'Synthetic', packSizeLabel: '10 tablets' } });
    const stock = await prisma.inventoryItem.create({ data: {
      branchId, name: drug.name, type: 'MEDICINE', costPrice: 10, sellingPrice: 20, unit: 'STRIPS' as any, packSize: 10, packUnit: 'tablets',
      currentStock: 20, expiryDate: new Date('2030-01-31'), batchNumber: `B-${randomUUID().slice(0, 8)}`, drugs: { connect: { id: drug.id } },
    } });
    const visit = await prisma.visit.create({ data: { patientId, doctorId, complaints: '[]' } });
    const rx = await prisma.prescription.create({ data: { visitId: visit.id, maxRefills, items: JSON.stringify([
      { drugName: drug.name, drugId: drug.id, inventoryItemId: stock.id, quantity: 10 },
    ]) } });
    const bill = () => invoices().checkout({
      patientId, doctorId, prescriptionId: rx.id, paymentMethod: 'CASH', billingName: 'Synthetic Patient', billingPhone: '9876543210',
      requestKey: `rx-replay-${randomUUID()}`,
      items: [{ drugId: drug.id, inventoryItemId: stock.id, itemType: 'DRUG', quantity: 10, unitPrice: 20, discountPercent: 0, taxPercent: 12 }],
    } as any, branchId, pharmacistId);
    const unitsLeft = async () => (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: stock.id } })).currentStock;
    return { id: rx.id, bill, unitsLeft };
  };

  const statusOf = async (id: string) => (await prisma.prescription.findUniqueOrThrow({ where: { id } })).status;
  const refillStatus = async (id: string) => (await prisma.prescriptionRefill.findUniqueOrThrow({ where: { id } })).status;

  const pendingVersion = async () => {
    const template = await prisma.prescriptionTemplate.create({ data: { branchId, createdBy: doctorId, name: `Synthetic ${randomUUID()}`, items: '[]' } });
    const version = await prescriptions().createTemplateVersion(template.id, { content: { items: [] } }, branchId, doctorId);
    await prescriptions().submitTemplateVersion(template.id, version.id, branchId, doctorId);
    const read = async () => ({
      status: (await prisma.prescriptionTemplateVersion.findUniqueOrThrow({ where: { id: version.id } })).status,
      records: (await prisma.templateVersionApproval.findMany({ where: { versionId: version.id }, orderBy: { createdAt: 'asc' } })).map((row) => row.status),
    });
    return { templateId: template.id, versionId: version.id, read };
  };

  describe('BillsWithinAllowance: two bills on a prescription with no refills', () => {
    const replay = async () => {
      const rx = await prescription(0);
      expect((await rx.bill()).status).toBe('CONFIRMED');
      const second = await outcome(rx.bill());
      return [second, await rx.unitsLeft()];
    };

    it.failing('BillsWithinAllowance: a second full bill needs an approved refill', async () => {
      expect(await replay()).toEqual(['refused', 10]);
    });

    it('today: the second full bill posts and takes another course of stock', async () => {
      expect(await replay()).toEqual(['done', 0]);
    });
  });

  describe('CompletedStaysCompleted: the doctor marks it completed, then cancels it', () => {
    const replay = async () => {
      const rx = await prescription(0);
      await prescriptions().updatePrescription(rx.id, { status: 'COMPLETED' } as any, branchId, doctorId);
      const cancel = await outcome(prescriptions().cancelPrescription(rx.id, branchId, 'Synthetic reason', doctorId));
      return [cancel, await statusOf(rx.id)];
    };

    it('CompletedStaysCompleted: cancelling a completed prescription is refused', async () => {
      expect(await replay()).toEqual(['refused', 'COMPLETED']);
    });
  });

  describe('StrandedRequestsClose: a refill request is waiting when the doctor marks the prescription completed', () => {
    const replay = async () => {
      const rx = await prescription(1);
      const refill = await prescriptions().requestRefill({ prescriptionId: rx.id } as any, branchId);
      await prescriptions().updatePrescription(rx.id, { status: 'COMPLETED' } as any, branchId, doctorId);
      return { rx, refill };
    };

    it('StrandedRequestsClose: the waiting request is closed once the prescription is completed', async () => {
      const { refill } = await replay();
      expect(await refillStatus(refill.id)).toBe('REJECTED');
    });
  });

  describe('OneDecision: two reviewers approve the same version at once', () => {
    const replay = async () => {
      const v = await pendingVersion();
      const second = gate(prisma, 'prescriptionTemplateVersion.updateMany', { when: 'before' });
      const late = outcome(prescriptions(second.client).approveTemplateVersion(v.templateId, v.versionId, branchId, doctorId));
      await second.arrived;
      const early = await outcome(prescriptions().approveTemplateVersion(v.templateId, v.versionId, branchId, reviewerId));
      second.release();
      return [early, await late, (await v.read()).records];
    };

    it('OneDecision: the second approval is refused and one review record exists', async () => {
      expect(await replay()).toEqual(['done', 'refused', ['APPROVED']]);
    });
  });

  describe('DecidedStaysDecided: one reviewer approves while another rejects', () => {
    const replay = async () => {
      const v = await pendingVersion();
      const rejecter = gate(prisma, 'prescriptionTemplateVersion.updateMany', { when: 'before' });
      const rejection = outcome(prescriptions(rejecter.client).rejectTemplateVersion(v.templateId, v.versionId, branchId, doctorId));
      await rejecter.arrived;
      await prescriptions().approveTemplateVersion(v.templateId, v.versionId, branchId, reviewerId);
      const afterApproval = (await v.read()).status;
      rejecter.release();
      const rejected = await rejection;
      const afterRejection = (await v.read()).status;
      return [afterApproval, rejected, afterRejection];
    };

    it('DecidedStaysDecided: the late rejection is refused and the version stays approved', async () => {
      expect(await replay()).toEqual(['APPROVED', 'refused', 'APPROVED']);
    });
  });

  describe('DecisionRecorded: a reviewer approves and the review record insert fails', () => {
    const replay = async () => {
      const v = await pendingVersion();
      const failingRecord = throwingOn(prisma, 'templateVersionApproval', 'create');
      const approval = await outcome(prescriptions(failingRecord).approveTemplateVersion(v.templateId, v.versionId, branchId, reviewerId));
      return [approval, await v.read()];
    };

    it('DecisionRecorded: a failed review record leaves the version undecided', async () => {
      expect(await replay()).toEqual(['refused', { status: 'PENDING', records: [] }]);
    });
  });
});
