import { NotFoundException } from '@nestjs/common';
import { PharmacyPrescriptionQueueService } from '../pharmacy-prescription-queue.service';
import { PrescriptionQueueStatus } from '../dto/pharmacy-prescription-queue.dto';

describe('PharmacyPrescriptionQueueService', () => {
  let service: PharmacyPrescriptionQueueService;
  let prisma: any;
  let drugService: any;

  const branchId = 'branch-1';
  const patient = {
    id: 'patient-1',
    name: 'Anika Rao',
    patientCode: 'A1234',
  };
  const doctor = {
    id: 'doctor-1',
    firstName: 'Maya',
    lastName: 'Iyer',
  };

  const prescription = (overrides: Record<string, unknown> = {}) => ({
    id: 'rx-1',
    createdAt: new Date(Date.now() - 60 * 60 * 1000),
    items: JSON.stringify([
      {
        drugName: 'Azithral 500',
        dosage: 500,
        dosageUnit: 'MG',
        frequency: 'ONCE_DAILY',
        duration: 3,
        durationUnit: 'DAYS',
        quantity: 3,
      },
    ]),
    visit: {
      patient,
      doctor,
    },
    pharmacyInvoices: [],
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      prescription: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      drug: {
        findFirst: jest.fn(),
      },
      inventoryItem: {
        findMany: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.id.in.map((id: string) => ({ id, unit: 'PIECES' })))),
      },
    };
    drugService = {
      getAlternatives: jest.fn(),
    };
    service = new PharmacyPrescriptionQueueService(prisma, drugService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    [{ dosage: 2, dosageUnit: 'TABLET', frequency: 'TWICE_DAILY', duration: 5 }, 20],
    [{ dosage: 2, dosageUnit: 'CAPSULE', dosePattern: '2-0-2', frequency: 'TWICE_DAILY', duration: 5 }, 20],
    [{ dosageUnit: 'TABLET', dosePattern: '1-0-1', duration: 5 }, 10],
    [{ dosage: 2, dosageUnit: 'TABLET', dosePattern: '1-0-1', frequency: 'TWICE_DAILY', duration: 5 }, null],
    [{ dosageUnit: 'TABLET', dosePattern: '1-0-1', frequency: 'THREE_TIMES_DAILY', duration: 5 }, null],
    [{ dosage: 1, dosageUnit: 'TABLET', dosePattern: 'q8h', duration: 3 }, 9],
    [{ dosage: 500, dosageUnit: 'MG', frequency: 'TWICE_DAILY', duration: 5 }, null],
    [{ dosage: 1, dosageUnit: 'TABLET', dosePattern: 'as directed', frequency: 'TWICE_DAILY', duration: 5 }, null],
    [{ dosage: '2 tablets', dosageUnit: 'TABLET', frequency: 'TWICE_DAILY', duration: 5 }, null],
    [{ quantity: 7, dosage: 500, dosageUnit: 'MG', frequency: 'TWICE_DAILY', duration: 5 }, 7],
  ])('transfers a safe prescribed quantity for %o', async (regimen, expected) => {
    prisma.prescription.findFirst.mockResolvedValue(prescription({
      items: JSON.stringify([{ drugName: 'Azithral 500', ...regimen }]),
    }));

    const result = await service.findOne('rx-1', branchId);

    expect(result.medications[0].prescribedQuantity).toBe(expected);
  });

  it.each([
    [[{ drugName: 'Azithral 500', quantity: 10 }], [{ quantity: 3, drug: { id: 'drug-1', name: 'Azithral 500' } }], [3, 7]],
    [[{ drugName: 'Azithral 500', quantity: 10 }, { drugName: 'Azithral 500', quantity: 5 }], [{ quantity: 3, drug: { id: 'drug-1', name: 'Azithral 500' } }], [null, null]],
    [[{ drugName: 'Azithral 500', quantity: 10 }, { drugName: 'Azithral', quantity: 5 }], [{ quantity: 3, drug: { id: 'drug-1', name: 'Azithral 500' } }], [null, null]],
    [[{ drugName: 'Azithral 500', quantity: 10 }], [{ quantity: 3, drug: { id: 'drug-2', name: 'Azithral 250' } }], [null, null]],
    [[{ drugName: 'Azithral 500' }], [], [0, null]],
  ])('returns only attributable billed and remaining quantities', async (lines, billed, expected) => {
    prisma.prescription.findFirst.mockResolvedValue(prescription({
      items: JSON.stringify(lines),
      pharmacyInvoices: billed.length ? [{ id: 'inv-1', status: 'CONFIRMED', items: billed.map((item) => ({ ...item, inventoryItemId: 'batch-1' })) }] : [],
    }));
    jest.spyOn(service as any, 'stockCheckMedication').mockResolvedValue({ drugName: 'Azithral 500', unit: 'PIECES' });

    const result = await service.stockCheck('rx-1', branchId);

    expect([result.items[0].dispensedQuantity, result.items[0].remainingQuantity]).toEqual(expected);
  });

  it.each([
    [{ dosage: 2, dosageUnit: 'TABLET', frequency: 'TWICE_DAILY', duration: 5 }, 'PIECES', 20],
    [{ dosage: 2, dosageUnit: 'TABLET', frequency: 'TWICE_DAILY', duration: 5 }, 'STRIPS', null],
    [{ quantity: 5, dosage: 500, dosageUnit: 'MG' }, 'PIECES', 5],
    [{ quantity: 5, dosage: 500, dosageUnit: 'MG' }, 'STRIPS', null],
    [{ quantity: 2, quantityUnit: 'STRIPS' }, 'STRIPS', 2],
    [{ quantity: 2 }, 'TUBES', null],
    [{ quantity: 2 }, null, null],
  ])('transfers %o only when stock unit %s is compatible', async (regimen, unit, expected) => {
    prisma.prescription.findFirst.mockResolvedValue(prescription({
      items: JSON.stringify([{ drugName: 'Azithral 500', ...regimen }]),
    }));
    jest.spyOn(service as any, 'stockCheckMedication').mockResolvedValue({ drugName: 'Azithral 500', unit });
    const result = await service.stockCheck('rx-1', branchId);
    expect(result.items[0].remainingQuantity).toBe(expected);
    expect(result.items[0].quantityUnavailableReason === null).toBe(expected !== null);
  });

  it('does not subtract a historical strip from a current piece quantity or mark it dispensed', async () => {
    prisma.prescription.findFirst.mockResolvedValue(prescription({
      items: JSON.stringify([{ drugName: 'Azithral 500', dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 3 }]),
      pharmacyInvoices: [{ id: 'inv-1', status: 'COMPLETED', items: [{ quantity: 3, inventoryItemId: 'old-batch', drug: { id: 'drug-1', name: 'Azithral 500' } }] }],
    }));
    prisma.inventoryItem.findMany.mockResolvedValue([{ id: 'old-batch', unit: 'STRIPS' }]);
    jest.spyOn(service as any, 'stockCheckMedication').mockResolvedValue({ drugName: 'Azithral 500', unit: 'PIECES' });
    const entry = await service.findOne('rx-1', branchId);
    const stock = await service.stockCheck('rx-1', branchId);
    expect(entry.status).toBe(PrescriptionQueueStatus.PARTIAL);
    expect(stock.items[0].remainingQuantity).toBeNull();
    expect(stock.items[0].quantityUnavailableReason).toContain('Previously billed stock units');
  });

  it('requires review when historical invoice stock units cannot be read', async () => {
    prisma.prescription.findFirst.mockResolvedValue(prescription({
      pharmacyInvoices: [{ id: 'inv-1', status: 'COMPLETED', items: [{ quantity: 3, inventoryItemId: 'batch-1', drug: { id: 'drug-1', name: 'Azithral 500' } }] }],
    }));
    prisma.inventoryItem.findMany.mockRejectedValue(new Error('lookup unavailable'));
    jest.spyOn(service as any, 'stockCheckMedication').mockResolvedValue({ drugName: 'Azithral 500', unit: 'PIECES' });
    const entry = await service.findOne('rx-1', branchId);
    const stock = await service.stockCheck('rx-1', branchId);
    expect(entry.status).toBe(PrescriptionQueueStatus.PARTIAL);
    expect(stock.items[0].remainingQuantity).toBeNull();
    expect(stock.items[0].quantityUnavailableReason).toContain('Previously billed stock units');
  });

  it('marks unlinked prescriptions older than 24 hours as expired', async () => {
    prisma.prescription.findMany.mockResolvedValue([
      prescription({
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      }),
    ]);

    const result = await service.findAll(
      { status: PrescriptionQueueStatus.EXPIRED, page: 1, limit: 20 },
      branchId,
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      prescriptionId: 'rx-1',
      status: PrescriptionQueueStatus.EXPIRED,
      isOverTwoHours: true,
      patient: {
        id: 'patient-1',
        name: 'Anika Rao',
      },
      doctor: {
        id: 'doctor-1',
        name: 'Maya Iyer',
      },
      linkedInvoiceIds: [],
    });
    expect(result.data[0].pendingHours).toBeGreaterThan(24);
  });

  it('marks linked invoices as partial when inferred quantities are not fully covered', async () => {
    prisma.prescription.findMany.mockResolvedValue([
      prescription({
        pharmacyInvoices: [
          {
            id: 'pharm-invoice-1',
            status: 'CONFIRMED',
            items: [
              {
                quantity: 1,
                drug: {
                  id: 'drug-1',
                  name: 'Azithral 500',
                },
              },
            ],
          },
        ],
      }),
    ]);

    const result = await service.findAll({ page: 1, limit: 20 }, branchId);

    expect(result.data[0].status).toBe(PrescriptionQueueStatus.PARTIAL);
    expect(result.data[0].medications[0]).toMatchObject({
      drugName: 'Azithral 500',
      prescribedQuantity: 3,
      dispensedQuantity: 1,
      coverageStatus: 'partial',
    });
  });

  it.each(['DISPENSED', 'COMPLETED'])('keeps a %s invoice partial until all prescribed units are covered', async (status) => {
    prisma.prescription.findFirst.mockResolvedValue(prescription({
      pharmacyInvoices: [{ id: 'inv-1', status, items: [{ quantity: 1, drug: { id: 'drug-1', name: 'Azithral 500' } }] }],
    }));
    const result = await service.findOne('rx-1', branchId);
    expect(result.status).toBe(PrescriptionQueueStatus.PARTIAL);
  });

  it('marks the prescription dispensed when all lines are reliably covered across invoices', async () => {
    prisma.prescription.findFirst.mockResolvedValue(prescription({
      pharmacyInvoices: [
        { id: 'inv-1', status: 'DISPENSED', items: [{ quantity: 1, inventoryItemId: 'batch-1', drug: { id: 'drug-1', name: 'Azithral 500' } }] },
        { id: 'inv-2', status: 'COMPLETED', items: [{ quantity: 2, inventoryItemId: 'batch-1', drug: { id: 'drug-1', name: 'Azithral 500' } }] },
      ],
    }));
    const result = await service.findOne('rx-1', branchId);
    expect(result.status).toBe(PrescriptionQueueStatus.DISPENSED);
  });

  it('does not treat duplicate prescription lines as covered by the same invoice item', async () => {
    prisma.prescription.findFirst.mockResolvedValue(prescription({
      items: JSON.stringify([{ drugName: 'Azithral 500', quantity: 3 }, { drugName: 'Azithral 500', quantity: 3 }]),
      pharmacyInvoices: [{ id: 'inv-1', status: 'COMPLETED', items: [{ quantity: 3, drug: { id: 'drug-1', name: 'Azithral 500' } }] }],
    }));
    const result = await service.findOne('rx-1', branchId);
    expect(result.status).toBe(PrescriptionQueueStatus.PARTIAL);
  });

  it('keeps partial coverage visible when an existing task was marked dispensed', async () => {
    prisma.prescription.findFirst.mockResolvedValue(prescription({
      pharmacyInvoices: [{ id: 'inv-1', status: 'DISPENSED', items: [{ quantity: 1, drug: { id: 'drug-1', name: 'Azithral 500' } }] }],
    }));
    const task = { id: 'task-1', status: 'DISPENSED', lines: [] };
    prisma.pharmacyDispenseTask = { findFirst: jest.fn().mockResolvedValue(task), update: jest.fn().mockResolvedValue(task) };
    const result = await service.findOne('rx-1', branchId);
    expect(result.status).toBe(PrescriptionQueueStatus.PARTIAL);
  });

  it('shows complete coverage when a partially filled task has not yet reflected posted invoices', async () => {
    prisma.prescription.findFirst.mockResolvedValue(prescription({
      pharmacyInvoices: [{ id: 'inv-1', status: 'DISPENSED', items: [{ quantity: 3, inventoryItemId: 'batch-1', drug: { id: 'drug-1', name: 'Azithral 500' } }] }],
    }));
    const task = { id: 'task-1', status: 'PARTIALLY_FILLED', lines: [] };
    prisma.pharmacyDispenseTask = { findFirst: jest.fn().mockResolvedValue(task), update: jest.fn().mockResolvedValue(task) };
    const result = await service.findOne('rx-1', branchId);
    expect(result.status).toBe(PrescriptionQueueStatus.DISPENSED);
  });

  it('keeps cancelled linked invoices out of coverage without treating the prescription as pending', async () => {
    prisma.prescription.findMany.mockResolvedValue([
      prescription({
        pharmacyInvoices: [
          {
            id: 'cancelled-invoice-1',
            status: 'CANCELLED',
            items: [
              {
                quantity: 3,
                drug: {
                  id: 'drug-1',
                  name: 'Azithral 500',
                },
              },
            ],
          },
        ],
      }),
    ]);

    const result = await service.findAll({ page: 1, limit: 20 }, branchId);

    expect(result.data[0].status).toBe(PrescriptionQueueStatus.PARTIAL);
    expect(result.data[0].linkedInvoiceIds).toEqual(['cancelled-invoice-1']);
    expect(result.data[0].medications[0]).toMatchObject({
      dispensedQuantity: 0,
      coverageStatus: 'not_started',
    });
  });

  it('keeps a completed linked invoice partial when prescribed quantities are unknown', async () => {
    prisma.prescription.findMany.mockResolvedValue([
      prescription({
        items: JSON.stringify([
          {
            drugName: 'Clindamycin Gel',
            frequency: 'Apply at night',
          },
        ]),
        pharmacyInvoices: [
          {
            id: 'pharm-invoice-1',
            status: 'COMPLETED',
            items: [
              {
                quantity: 1,
                drug: {
                  id: 'drug-1',
                  name: 'Clindamycin Gel',
                },
              },
            ],
          },
        ],
      }),
    ]);

    const result = await service.findAll({ page: 1, limit: 20 }, branchId);

    expect(result.data[0].status).toBe(PrescriptionQueueStatus.PARTIAL);
    expect(result.data[0].medications[0]).toMatchObject({
      prescribedQuantity: null,
      quantityInferred: false,
      dispensedQuantity: 1,
      coverageStatus: 'unknown',
    });
  });

  it('returns FEFO available stock checks with low stock and near expiry', async () => {
    const futureExpiry = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const laterExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const expired = new Date(Date.now() - 24 * 60 * 60 * 1000);

    prisma.prescription.findFirst.mockResolvedValue(prescription());
    const batches = [
        {
          id: 'batch-late',
          currentStock: 4,
          minStockLevel: 5,
          batchNumber: 'LATE',
          expiryDate: laterExpiry,
          sellingPrice: 35,
          mrp: 40,
          stockStatus: 'IN_STOCK',
          storageLocation: 'A2',
        },
        {
          id: 'batch-expired',
          currentStock: 100,
          minStockLevel: 5,
          batchNumber: 'EXP',
          expiryDate: expired,
          sellingPrice: 20,
          mrp: 30,
          stockStatus: 'EXPIRED',
          storageLocation: 'A0',
        },
        {
          id: 'batch-early',
          currentStock: 3,
          minStockLevel: 5,
          batchNumber: 'EARLY',
          expiryDate: futureExpiry,
          sellingPrice: 30,
          mrp: 35,
          stockStatus: 'LOW_STOCK',
          storageLocation: 'A1',
        },
      ].map(b => ({ ...b, minStockLevel: 10, status: 'ACTIVE', unit: 'TABLETS', branchId, heldStock: 0, drugs: [{ id: 'drug-1', isActive: true, isDiscontinued: false, name: 'Azithral 500', manufacturerName: 'Alembic', minStockLevel: 10, branchId }] }));
    prisma.prescriptionInventoryLink = { findUnique: jest.fn().mockResolvedValue(null) };
    prisma.inventoryItem = { findMany: jest.fn().mockResolvedValue(batches) };
    drugService.getAlternatives.mockResolvedValue([
      {
        id: 'alt-1',
        name: 'Azithro 500',
        totalStock: 12,
      },
    ]);

    const result = await service.stockCheck('rx-1', branchId);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      drugName: 'Azithral 500',
      matchedDrug: {
        id: 'drug-1',
        name: 'Azithral 500',
        manufacturerName: 'Alembic',
      },
      stockStatus: 'LOW_STOCK',
      totalNonExpiredStock: 7,
      lowStock: true,
      nearExpiry: true,
      alternatives: [],
    });
    expect(
      result.items[0].batches.map((batch: any) => batch.batchNumber),
    ).toEqual(['EARLY', 'LATE']);
    expect(drugService.getAlternatives).not.toHaveBeenCalled();
  });

  it('throws not found for prescriptions outside the branch', async () => {
    prisma.prescription.findFirst.mockResolvedValue(null);

    await expect(service.findOne('rx-missing', branchId)).rejects.toThrow(
      NotFoundException,
    );
  });
});
