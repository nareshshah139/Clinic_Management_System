import { PrismaClient } from '@prisma/client';
import { localDatabase } from '../../../shared/testing/local-database';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';
import { PharmacyInvoiceService } from '../pharmacy-invoice.service';
import { PharmacyPrescriptionQueueService } from '../pharmacy-prescription-queue.service';
import {
  PharmacyDispenseLineActionDto,
  PharmacyDispenseTaskStatusDto,
} from '../dto/pharmacy-dispense-task.dto';

// Replays of verification/state-machines/dispense-queue/results/code.md, one call per model step.
const databaseTests = process.env.FORMAL_REPLAY_TEST_DATABASE_URL
  ? describe
  : describe.skip;

const branchId = 'branch';
const pharmacist = 'asha';
const doctorId = 'doctor';
const patientId = 'patient';

databaseTests('Dispense queue formal replay on PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let db: PrismaClient;
  let queue: PharmacyPrescriptionQueueService;
  let invoices: PharmacyInvoiceService;
  let prescriptions = 0;

  beforeAll(async () => {
    fixture = await localDatabase(process.env.FORMAL_REPLAY_TEST_DATABASE_URL!);
    db = fixture.prisma;
    await db.branch.create({
      data: { id: branchId, name: 'Synthetic Pharmacy', address: 'Synthetic' },
    });
    for (const [id, role] of [
      [pharmacist, 'PHARMACIST'],
      [doctorId, 'DOCTOR'],
    ] as const)
      await db.user.create({
        data: {
          id,
          firstName: id,
          lastName: 'Synthetic',
          email: `${id}@example.invalid`,
          password: 'no-login',
          role,
          branchId,
        },
      });
    await db.patient.create({
      data: { id: patientId, name: 'Meera Shah', gender: 'F', phone: '9876543210', branchId },
    });
    await db.drug.create({
      data: {
        id: 'cream',
        name: 'Synthetic Cream',
        price: 50,
        manufacturerName: 'Synthetic',
        packSizeLabel: '1',
        branchId,
      },
    });
    await db.inventoryItem.create({
      data: {
        id: 'cream-batch',
        branchId,
        name: 'Synthetic Cream',
        type: 'MEDICINE',
        costPrice: 25,
        sellingPrice: 50,
        unit: 'PIECES',
        packSize: 1,
        currentStock: 100,
        stockStatus: 'IN_STOCK',
        expiryDate: new Date('2099-01-01'),
        drugs: { connect: { id: 'cream' } },
      },
    });
    queue = new PharmacyPrescriptionQueueService(db as any, {} as any);
    invoices = new PharmacyInvoiceService(db as any, new InvoiceNumbersService(db as any));
  }, 120000);

  afterAll(async () => {
    await fixture?.cleanup();
  });

  async function newPrescription() {
    const id = `rx-${++prescriptions}`;
    const visit = await db.visit.create({ data: { patientId, doctorId, complaints: '[]' } });
    await db.prescription.create({
      data: {
        id,
        visitId: visit.id,
        items: JSON.stringify([
          { drugName: 'Synthetic Cream', drugId: 'cream', inventoryItemId: 'cream-batch', quantity: 2 },
        ]),
      },
    });
    return id;
  }

  const youOpenThePrescription = async (id: string) => (await queue.pull(id, branchId)).data;

  const theBillPosts = (id: string) =>
    invoices.checkout(
      {
        patientId,
        doctorId,
        prescriptionId: id,
        paymentMethod: 'CASH' as any,
        billingName: 'Meera Shah',
        billingPhone: '9876543210',
        items: [{ drugId: 'cream', inventoryItemId: 'cream-batch', quantity: 2, unitPrice: 50 }],
        requestKey: `bill-${id}`,
      },
      branchId,
      pharmacist,
    );

  const setStatus = (taskId: string, status: PharmacyDispenseTaskStatusDto) =>
    queue.updateTaskStatus(taskId, { status }, branchId, pharmacist).then(
      () => 'saved',
      () => 'refused',
    );

  const youMarkTheMedicine = async (id: string, action: PharmacyDispenseLineActionDto) => {
    const entry = await queue.findOne(id, branchId);
    await queue.updateTaskLine(entry.dispenseTaskId!, entry.medications[0].lineId!, { action }, branchId, pharmacist);
  };

  const shown = async (id: string) => (await queue.findOne(id, branchId)).dispenseStatus;
  const storedTask = (taskId: string) =>
    db.pharmacyDispenseTask.findUniqueOrThrow({ where: { id: taskId } });
  const queueStatus = async (id: string) => [
    (await queue.findOne(id, branchId)).status,
    (await queue.findAll({ limit: 100 } as any, branchId)).data.find(entry => entry.prescriptionId === id)?.status,
  ];

  async function paidWithNoBill() {
    const id = await newPrescription();
    const task = (await youOpenThePrescription(id)).dispenseTaskId!;
    const marked = await setStatus(task, PharmacyDispenseTaskStatusDto.PAID);
    return { id, task, marked };
  }

  it.failing('PaidNeedsBill: marking a task paid with no bill is refused', async () => {
    const { task, marked } = await paidWithNoBill();
    expect([marked, (await storedTask(task)).status]).toEqual(['refused', 'QUEUED']);
  });

  it('today: PaidNeedsBill: a task with no bill is saved as Paid', async () => {
    const { id, task, marked } = await paidWithNoBill();
    expect([
      marked,
      (await storedTask(task)).status,
      await db.pharmacyInvoice.count({ where: { prescriptionId: id } }),
    ]).toEqual(['saved', 'PAID', 0]);
  });

  async function cancelledThenReopened() {
    const id = await newPrescription();
    const task = (await youOpenThePrescription(id)).dispenseTaskId!;
    const cancelled = await setStatus(task, PharmacyDispenseTaskStatusDto.CANCELLED);
    const reopened = await setStatus(task, PharmacyDispenseTaskStatusDto.IN_REVIEW);
    return { id, cancelled, reopened };
  }

  it.failing('FinishedStaysFinished: a cancelled task cannot be opened for review again', async () => {
    const { id } = await cancelledThenReopened();
    expect(await shown(id)).toBe('CANCELLED');
  });

  it('today: FinishedStaysFinished: a cancelled task goes back to In Review', async () => {
    const { id, cancelled, reopened } = await cancelledThenReopened();
    expect([cancelled, reopened, await shown(id)]).toEqual(['saved', 'saved', 'IN_REVIEW']);
  });

  async function dispensedThenCancelled() {
    const id = await newPrescription();
    const task = (await youOpenThePrescription(id)).dispenseTaskId!;
    await theBillPosts(id);
    const before = await shown(id);
    const cancelled = await setStatus(task, PharmacyDispenseTaskStatusDto.CANCELLED);
    return { id, before, cancelled };
  }

  it.failing('DispensedStaysDispensed: a dispensed prescription keeps showing Dispensed after a cancel', async () => {
    const { id } = await dispensedThenCancelled();
    expect(await shown(id)).toBe('DISPENSED');
  });

  it('today: DispensedStaysDispensed: a cancel turns a dispensed task into Cancelled', async () => {
    const { id, before, cancelled } = await dispensedThenCancelled();
    expect([before, cancelled, await shown(id)]).toEqual(['DISPENSED', 'saved', 'CANCELLED']);
  });

  async function billedBeforeOpened() {
    const id = await newPrescription();
    await theBillPosts(id);
    const task = await storedTask((await youOpenThePrescription(id)).dispenseTaskId!);
    return [task.status, task.dispensedAt !== null];
  }

  it('StatusHasTimestamp: a task created as Dispensed records when it was dispensed', async () => {
    expect(await billedBeforeOpened()).toEqual(['DISPENSED', true]);
  });

  async function billedThenCancelled() {
    const id = await newPrescription();
    const task = (await youOpenThePrescription(id)).dispenseTaskId!;
    await youMarkTheMedicine(id, PharmacyDispenseLineActionDto.PENDING);
    await theBillPosts(id);
    await youOpenThePrescription(id);
    const path = [await shown(id)];
    path.push(await setStatus(task, PharmacyDispenseTaskStatusDto.PAID), await shown(id));
    path.push(await setStatus(task, PharmacyDispenseTaskStatusDto.PAUSED), await shown(id));
    path.push(await setStatus(task, PharmacyDispenseTaskStatusDto.CANCELLED), await shown(id));
    for (let round = 0; round < 2; round++) {
      await youMarkTheMedicine(id, PharmacyDispenseLineActionDto.ACCEPTED);
      await youMarkTheMedicine(id, PharmacyDispenseLineActionDto.UNAVAILABLE);
    }
    return { id, path };
  }

  it.failing('BillShowsDone: a prescription whose bill posted is listed as dispensed', async () => {
    const { id } = await billedThenCancelled();
    expect(await queueStatus(id)).toEqual(['dispensed', 'dispensed']);
  });

  it('today: BillShowsDone: a cancelled task keeps a billed prescription under Paused', async () => {
    const { id, path } = await billedThenCancelled();
    expect([path, await queueStatus(id), await shown(id)]).toEqual([
      ['DISPENSED', 'saved', 'PAID', 'saved', 'DISPENSED', 'saved', 'CANCELLED'],
      ['expired', 'expired'],
      'CANCELLED',
    ]);
  });
});
