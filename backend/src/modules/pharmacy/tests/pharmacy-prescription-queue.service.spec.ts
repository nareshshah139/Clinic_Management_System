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
    };
    drugService = {
      getAlternatives: jest.fn(),
    };
    service = new PharmacyPrescriptionQueueService(prisma, drugService);
  });

  afterEach(() => {
    jest.clearAllMocks();
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

  it('marks a completed linked invoice as dispensed even when quantities are unknown', async () => {
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

    expect(result.data[0].status).toBe(PrescriptionQueueStatus.DISPENSED);
    expect(result.data[0].medications[0]).toMatchObject({
      prescribedQuantity: null,
      quantityInferred: false,
      dispensedQuantity: 1,
      coverageStatus: 'unknown',
    });
  });

  it('returns FEFO stock checks with low stock, near expiry, and alternatives', async () => {
    const futureExpiry = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const laterExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const expired = new Date(Date.now() - 24 * 60 * 60 * 1000);

    prisma.prescription.findFirst.mockResolvedValue(prescription());
    prisma.drug.findFirst.mockResolvedValueOnce({
      id: 'drug-1',
      name: 'Azithral 500',
      manufacturerName: 'Alembic',
      minStockLevel: 10,
      inventoryItems: [
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
      ],
    });
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
      alternatives: [
        {
          id: 'alt-1',
          name: 'Azithro 500',
          totalStock: 12,
        },
      ],
    });
    expect(
      result.items[0].batches.map((batch: any) => batch.batchNumber),
    ).toEqual(['EARLY', 'LATE']);
    expect(drugService.getAlternatives).toHaveBeenCalledWith(
      'drug-1',
      branchId,
    );
  });

  it('throws not found for prescriptions outside the branch', async () => {
    prisma.prescription.findFirst.mockResolvedValue(null);

    await expect(service.findOne('rx-missing', branchId)).rejects.toThrow(
      NotFoundException,
    );
  });
});
