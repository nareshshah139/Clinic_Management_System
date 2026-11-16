import { PharmacyPrescriptionQueueService } from '../pharmacy-prescription-queue.service';
import { PrescriptionQueueStatus } from '../dto/pharmacy-prescription-queue.dto';
import { DrugService } from '../drug.service';

describe('CR-09 billed prescriptions in the Pending queue', () => {
  it('exposes inferred prescription quantities to the bill loader', async () => {
    const prisma: any = { prescription: { findFirst: jest.fn().mockResolvedValue({
      id: 'rx-quantity', createdAt: new Date(), items: JSON.stringify([{ drugName: 'Test medicine', frequency: 'TWICE_DAILY', duration: 7, durationUnit: 'DAYS' }]),
      visit: { patient: { id: 'patient-1' }, doctor: { id: 'doctor-1' } }, pharmacyInvoices: [],
    }) } };
    const service = new PharmacyPrescriptionQueueService(prisma, {} as any);
    jest.spyOn(service as any, 'stockCheckMedication').mockResolvedValue({ drugName: 'Test medicine', stockStatus: 'UNMATCHED', matchedDrug: null });
    const result = await service.stockCheck('rx-quantity', 'branch-1');
    expect(result.items[0]).toMatchObject({ drugName: 'Test medicine', prescribedQuantity: 14 });
  });

  it.each([0, 5, null])('product lookup by ID returns Inventory GST %s', async (gstRate) => {
    const prisma: any = {
      drug: { findFirst: jest.fn().mockResolvedValue({ id: 'drug-1', name: 'Test medicine' }) },
      inventoryItem: { findMany: jest.fn().mockResolvedValue([{ gstRate, currentStock: 10, heldStock: 0, drugs: [{ id: 'drug-1' }] }]) },
    };
    const result = await new DrugService(prisma).findOne('drug-1', 'branch-1');
    expect(result).toMatchObject({ id: 'drug-1', gstRate });
    expect(prisma.drug.findFirst.mock.calls[0][0].where).toEqual({ id: 'drug-1', branchId: 'branch-1' });
  });

  it.each(['QUEUED', 'IN_REVIEW', 'READY_TO_BILL', 'PAID'])('excludes a saved partial bill even when the dispensing task is %s', async (status) => {
    const prescription = {
      id: 'rx-1', createdAt: new Date(), items: JSON.stringify([{ drugName: 'Original cream', quantity: 2 }]),
      visit: { patient: { id: 'patient-1', name: 'Synthetic Patient' }, doctor: { id: 'doctor-1', firstName: 'Test', lastName: 'Doctor' } },
      pharmacyInvoices: [{ id: 'invoice-1', status: 'CONFIRMED', items: [{ quantity: 1, drug: { id: 'replacement-1', name: 'Replacement cream' } }] }],
    };
    const task = { id: 'task-1', status, lines: [], patientId: 'patient-1' };
    const prisma: any = {
      prescription: { findMany: jest.fn().mockResolvedValue([prescription]) },
      pharmacyDispenseTask: {
        findFirst: jest.fn().mockResolvedValue(task),
        update: jest.fn().mockImplementation(async ({ data }) => ({ ...task, ...data })),
      },
    };
    const service = new PharmacyPrescriptionQueueService(prisma, {} as any);
    const pending = await service.findAll({ status: PrescriptionQueueStatus.PENDING }, 'branch-1');
    expect(pending.data).toHaveLength(0);
    const all = await service.findAll({}, 'branch-1');
    expect(all.data[0]).toMatchObject({ status: PrescriptionQueueStatus.PARTIAL, linkedInvoiceIds: ['invoice-1'] });
  });
});
