import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PharmacyInvoiceService } from '../pharmacy-invoice.service';

describe('PharmacyInvoiceService defensive stock confirmation', () => {
  let service: PharmacyInvoiceService;
  let prisma: any;
  let tx: any;

  const branchId = 'branch-1';
  const userId = 'user-1';
  const futureExpiry = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
  const laterExpiry = new Date(Date.now() + 240 * 24 * 60 * 60 * 1000);
  const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const makeInvoice = (quantity = 5, status = 'DRAFT') => ({
    id: 'invoice-1',
    invoiceNumber: 'PHI-2026-001',
    status,
    items: [
      {
        id: 'invoice-item-1',
        itemType: 'DRUG',
        drugId: 'drug-1',
        drug: {
          id: 'drug-1',
          name: 'Azithral 500',
        },
        quantity,
        unitPrice: 30,
      },
    ],
  });

  beforeEach(() => {
    tx = {
      inventoryItem: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      pharmacyInvoice: {
        update: jest.fn(),
      },
      stockTransaction: {
        create: jest.fn(),
      },
    };

    prisma = {
      pharmacyInvoice: {
        findFirst: jest.fn(),
      },
      stockTransaction: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(
        (callback: (transactionClient: any) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    service = new PharmacyInvoiceService(prisma, {
      reserve: jest.fn(),
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('blocks confirmation when only expired or insufficient stock is available', async () => {
    prisma.pharmacyInvoice.findFirst.mockResolvedValue(makeInvoice(5));
    tx.inventoryItem.findMany.mockResolvedValue([
      {
        id: 'batch-expired',
        currentStock: 100,
        sellingPrice: 30,
        costPrice: 20,
        batchNumber: 'EXP',
        expiryDate: expiredDate,
        stockStatus: 'IN_STOCK',
      },
      {
        id: 'batch-short',
        currentStock: 3,
        sellingPrice: 30,
        costPrice: 20,
        batchNumber: 'SHORT',
        expiryDate: futureExpiry,
        stockStatus: 'IN_STOCK',
      },
    ]);

    await expect(
      service.updateStatus('invoice-1', 'CONFIRMED', branchId, userId),
    ).rejects.toThrow(BadRequestException);

    expect(tx.pharmacyInvoice.update).not.toHaveBeenCalled();
    expect(tx.stockTransaction.create).not.toHaveBeenCalled();
    expect(tx.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it('deducts stock in FEFO order and records batch metadata', async () => {
    prisma.pharmacyInvoice.findFirst.mockResolvedValue(makeInvoice(8));
    tx.inventoryItem.findMany.mockResolvedValue([
      {
        id: 'batch-late',
        currentStock: 10,
        sellingPrice: 35,
        costPrice: 22,
        batchNumber: 'LATE',
        expiryDate: laterExpiry,
        stockStatus: 'IN_STOCK',
      },
      {
        id: 'batch-early',
        currentStock: 3,
        sellingPrice: 30,
        costPrice: 20,
        batchNumber: 'EARLY',
        expiryDate: futureExpiry,
        stockStatus: 'IN_STOCK',
      },
    ]);
    tx.pharmacyInvoice.update
      .mockResolvedValueOnce({ id: 'invoice-1', status: 'CONFIRMED' })
      .mockResolvedValueOnce({
        mutationVersion: 1,
        invoiceNumber: 'PHI-2026-001',
      });
    tx.stockTransaction.create.mockResolvedValue({});
    tx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    tx.inventoryItem.findUnique
      .mockResolvedValueOnce({
        id: 'batch-early',
        currentStock: 0,
        reorderLevel: 5,
        minStockLevel: 5,
        expiryDate: futureExpiry,
      })
      .mockResolvedValueOnce({
        id: 'batch-late',
        currentStock: 5,
        reorderLevel: 5,
        minStockLevel: 5,
        expiryDate: laterExpiry,
      });
    tx.inventoryItem.update.mockResolvedValue({});

    const result = await service.updateStatus(
      'invoice-1',
      'CONFIRMED',
      branchId,
      userId,
    );

    expect(result).toEqual({ id: 'invoice-1', status: 'CONFIRMED' });
    expect(tx.stockTransaction.create).toHaveBeenCalledTimes(2);
    expect(tx.stockTransaction.create.mock.calls[0][0].data).toMatchObject({
      itemId: 'batch-early',
      quantity: 3,
      batchNumber: 'EARLY',
      reference: 'INV-PHI-2026-001',
      branchId,
      userId,
    });
    expect(tx.stockTransaction.create.mock.calls[1][0].data).toMatchObject({
      itemId: 'batch-late',
      quantity: 5,
      batchNumber: 'LATE',
      reference: 'INV-PHI-2026-001',
      branchId,
      userId,
    });
    expect(tx.inventoryItem.updateMany.mock.calls[0][0]).toMatchObject({
      where: {
        id: 'batch-early',
        branchId,
        currentStock: {
          gte: 3,
        },
      },
      data: {
        currentStock: {
          decrement: 3,
        },
      },
    });
    expect(tx.inventoryItem.updateMany.mock.calls[1][0]).toMatchObject({
      where: {
        id: 'batch-late',
        branchId,
        currentStock: {
          gte: 5,
        },
      },
    });
  });

  it('rejects invalid backwards status transitions before opening a transaction', async () => {
    prisma.pharmacyInvoice.findFirst.mockResolvedValue(
      makeInvoice(1, 'COMPLETED'),
    );

    await expect(
      service.updateStatus('invoice-1', 'CONFIRMED', branchId, userId),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('builds standardized print data with GST slab and batch allocations', async () => {
    prisma.pharmacyInvoice.findFirst.mockResolvedValue({
      id: 'invoice-1',
      invoiceNumber: 'PHI-2026-001',
      status: 'CONFIRMED',
      paymentStatus: 'COMPLETED',
      invoiceDate: new Date('2026-05-04T10:00:00.000Z'),
      dueDate: null,
      subtotal: 100,
      discountAmount: 0,
      taxAmount: 18,
      totalAmount: 118,
      billingName: 'John Doe',
      billingPhone: '9000001000',
      billingAddress: 'Road 1',
      billingCity: 'Hyderabad',
      billingState: 'TS',
      billingPincode: '500001',
      notes: 'Take as directed',
      patient: {
        id: 'patient-1',
        name: 'John Doe',
        phone: '9000001000',
        address: 'Road 1',
        city: 'Hyderabad',
        state: 'TS',
        pincode: '500001',
      },
      doctor: {
        id: 'doctor-1',
        firstName: 'Asha',
        lastName: 'Rao',
        phone: null,
        email: null,
        metadata: JSON.stringify({ registrationNumber: 'TS-MC-12345' }),
      },
      branch: {
        id: branchId,
        name: 'Main Branch',
        address: 'Clinic Road',
        city: 'Hyderabad',
        state: 'TS',
        pincode: '500001',
        phone: '9999999999',
        email: 'main@clinic.test',
        gstNumber: '36ABCDE1234F1Z5',
        licenseNumber: 'DL-12345',
      },
      payments: [
        {
          id: 'payment-1',
          amount: 118,
          method: 'CASH',
          status: 'COMPLETED',
          reference: 'CASH-1',
          paymentDate: new Date('2026-05-04T10:01:00.000Z'),
        },
      ],
      items: [
        {
          id: 'invoice-item-1',
          itemType: 'DRUG',
          drugId: 'drug-1',
          packageId: null,
          quantity: 2,
          unitPrice: 50,
          discountPercent: 0,
          discountAmount: 0,
          taxPercent: 18,
          taxAmount: 18,
          totalAmount: 118,
          dosage: '1 tablet',
          frequency: 'BID',
          duration: '3 days',
          instructions: 'After food',
          drug: {
            id: 'drug-1',
            name: 'Azithral 500',
            manufacturerName: 'Alembic',
            packSizeLabel: 'Strip of 3',
            composition1: 'Azithromycin',
            composition2: null,
            strength: '500mg',
            dosageForm: 'Tablet',
          },
          package: null,
        },
      ],
    });
    prisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: 'stock-tx-1',
        itemId: 'inventory-1',
        quantity: 2,
        batchNumber: 'AZT2401',
        expiryDate: new Date('2027-12-31T23:59:59.999Z'),
        item: {
          id: 'inventory-1',
          name: 'Azithral 500',
          mrp: 78,
          hsnCode: '3004',
          batchNumber: 'AZT2401',
          expiryDate: new Date('2027-12-31T23:59:59.999Z'),
          drugs: [{ id: 'drug-1' }],
        },
      },
    ]);

    const result = await service.getPrintData('invoice-1', branchId, {
      format: 'A5',
      copyType: 'DUPLICATE',
    });

    expect(result.copyType).toBe('DUPLICATE');
    expect(result.invoice.amountInWords).toBe(
      'One hundred eighteen rupees only',
    );
    expect(result.branch.gstNumber).toBe('36ABCDE1234F1Z5');
    expect(result.branch.drugLicenseNumber).toBe('DL-12345');
    expect(result.doctor?.registrationNumber).toBe('TS-MC-12345');
    expect(result.gstSummary).toEqual([
      {
        taxPercent: 18,
        taxableAmount: 100,
        cgst: 9,
        sgst: 9,
        igst: 0,
        totalTax: 18,
        grossAmount: 118,
      },
    ]);
    expect(result.lines[0]).toMatchObject({
      name: 'Azithral 500',
      hsnCode: '3004',
      mrp: 78,
      batchAllocations: [
        expect.objectContaining({
          batchNumber: 'AZT2401',
          quantity: 2,
        }),
      ],
    });
    expect(prisma.stockTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          branchId,
          reference: 'INV-PHI-2026-001',
          type: 'SALE',
        },
      }),
    );
  });

  it('does not build print data for invoices outside the branch', async () => {
    prisma.pharmacyInvoice.findFirst.mockResolvedValue(null);

    await expect(
      service.getPrintData('invoice-1', branchId, {}),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.stockTransaction.findMany).not.toHaveBeenCalled();
  });
});
