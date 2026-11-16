import { PharmacyPrescriptionQueueService } from '../pharmacy-prescription-queue.service';
import { PharmacyDispenseTaskStatusDto } from '../dto/pharmacy-dispense-task.dto';

it('rejects dispensing a prescription with no posted invoice', async () => {
  const task = { id: 'task', branchId: 'branch', prescriptionId: 'rx', status: 'READY_TO_BILL', lines: [] };
  const prisma = {
    pharmacyDispenseTask: { findFirst: jest.fn().mockResolvedValue(task), update: jest.fn() },
    prescription: { findFirst: jest.fn().mockResolvedValue({
      id: 'rx', createdAt: new Date(), items: '[]', visit: { patient: { id: 'patient' }, doctor: { id: 'doctor' } }, pharmacyInvoices: [],
    }) },
  };
  const service = new PharmacyPrescriptionQueueService(prisma as any, {} as any);
  jest.spyOn(service, 'findOne').mockResolvedValue({} as any);

  await expect(service.updateTaskStatus('task', { status: PharmacyDispenseTaskStatusDto.DISPENSED }, 'branch', 'user'))
    .rejects.toThrow('Complete and post the pharmacy bill');
  expect(prisma.pharmacyDispenseTask.update).not.toHaveBeenCalled();
});

it.each([
  ['DRAFT', 3, false],
  ['CONFIRMED', 2, false],
  ['CONFIRMED', 3, true],
])('allows dispensing only for complete posted coverage (%s, %s units)', async (status, quantity, allowed) => {
  const task = { id: 'task', branchId: 'branch', prescriptionId: 'rx', status: 'READY_TO_BILL', lines: [] };
  const prisma = {
    pharmacyDispenseTask: { findFirst: jest.fn().mockResolvedValue(task), update: jest.fn() },
    prescription: { findFirst: jest.fn().mockResolvedValue({
      id: 'rx', createdAt: new Date(), items: JSON.stringify([{ drugName: 'Medicine', quantity: 3, dosageUnit: 'TABLET' }]),
      visit: { patient: { id: 'patient', name: 'Patient' }, doctor: { id: 'doctor', firstName: 'Doctor', lastName: 'One' } },
      pharmacyInvoices: [{ id: 'invoice', status, items: [{ quantity, inventoryItemId: 'batch', drug: { id: 'drug', name: 'Medicine' } }] }],
    }) },
    inventoryItem: { findMany: jest.fn().mockResolvedValue([{ id: 'batch', unit: 'PIECES' }]) },
  };
  const service = new PharmacyPrescriptionQueueService(prisma as any, {} as any);
  jest.spyOn(service, 'findOne').mockResolvedValue({} as any);
  const result = service.updateTaskStatus('task', { status: PharmacyDispenseTaskStatusDto.DISPENSED }, 'branch', 'user');

  if (allowed) {
    await expect(result).resolves.toEqual({});
    expect(prisma.pharmacyDispenseTask.update).toHaveBeenCalled();
  } else {
    await expect(result).rejects.toThrow('Complete and post the pharmacy bill');
    expect(prisma.pharmacyDispenseTask.update).not.toHaveBeenCalled();
  }
});
