import { PharmacyInvoiceService } from '../pharmacy-invoice.service';

describe('Pharmacy invoice inclusive prices', () => {
  const items = [
    {
      drugId: 'drug-1',
      quantity: 2,
      unitPrice: 100,
      discountPercent: 10,
      taxPercent: 12,
    },
    {
      itemType: 'PACKAGE',
      packageId: 'package-1',
      quantity: 1,
      taxPercent: 12,
    },
    {
      drugId: 'drug-2',
      quantity: 3,
      unitPrice: 0.99,
      discountPercent: 10,
      taxPercent: 5,
    },
    { drugId: 'drug-2', quantity: 1, unitPrice: 1.005, taxPercent: 0 },
  ];
  const expectedLines = [
    { unitPrice: 100, discountAmount: 20, taxAmount: 19.29, totalAmount: 180 },
    { unitPrice: 112, discountAmount: 0, taxAmount: 12, totalAmount: 112 },
    {
      unitPrice: 0.99,
      discountAmount: 0.3,
      taxAmount: 0.13,
      totalAmount: 2.67,
    },
    { unitPrice: 1.005, discountAmount: 0, taxAmount: 0, totalAmount: 1.01 },
  ];
  const expectedTotals = {
    subtotal: 315.98,
    discountAmount: 20.3,
    taxAmount: 31.42,
    totalAmount: 295.68,
  };

  it.each(['create', 'update'] as const)(
    'persists discounted inclusive totals on %s',
    async (operation) => {
      const tx: any = {
        inventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
        drug: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'drug-1' }, { id: 'drug-2' }]),
        },
        pharmacyPackage: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 'package-1', packagePrice: 112, items: [] },
            ]),
        },
        pharmacyInvoice: {
          create: jest.fn(async ({ data }) => ({ id: 'invoice-1', ...data })),
          update: jest.fn(async ({ data }) => ({ id: 'invoice-1', ...data })),
        },
        pharmacyInvoiceItem: {
          create: jest.fn(async ({ data }) => data),
          deleteMany: jest.fn(),
        },
      };
      const prisma: any = {
        ...tx,
        patient: {
          findFirst: jest.fn().mockResolvedValue({ id: 'patient-1' }),
        },
        pharmacyInvoice: {
          findFirst: jest
            .fn()
            .mockResolvedValue({
              id: 'invoice-1',
              patientId: 'patient-1',
              status: 'DRAFT',
            }),
        },
        $transaction: jest.fn((fn) => fn(tx)),
      };
      const service = new PharmacyInvoiceService(prisma, {
        reserve: jest
          .fn()
          .mockResolvedValue({ sequence: 1, periodKey: '2026' }),
      } as any);

      if (operation === 'create') {
        await service.create(
          { patientId: 'patient-1', items } as any,
          'branch-1',
        );
      } else {
        await service.update('invoice-1', { items } as any, 'branch-1');
      }

      expect(tx.pharmacyInvoice[operation]).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining(expectedTotals),
        }),
      );
      expect(tx.pharmacyInvoiceItem.create).toHaveBeenCalledTimes(4);
      expectedLines.forEach((line, index) => {
        expect(
          tx.pharmacyInvoiceItem.create.mock.calls[index][0].data,
        ).toMatchObject(line);
      });
    },
  );

  it('prints taxable amounts from the saved inclusive totals', async () => {
    const prisma: any = {
      pharmacyInvoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'invoice-1',
          invoiceNumber: 'PHI-2026-001',
          subtotal: 200,
          discountAmount: 20,
          taxAmount: 19.29,
          totalAmount: 180,
          patient: { id: 'patient-1', name: 'Patient' },
          branch: { id: 'branch-1', name: 'Branch' },
          payments: [],
          items: [
            {
              itemType: 'DRUG',
              drugId: 'drug-1',
              quantity: 2,
              unitPrice: 100,
              discountAmount: 20,
              taxPercent: 12,
              taxAmount: 19.29,
              totalAmount: 180,
              drug: { name: 'Drug' },
            },
          ],
        }),
      },
      stockTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PharmacyInvoiceService(prisma, {} as any);
    const result = await service.getPrintData('invoice-1', 'branch-1');
    expect(result.invoice).toMatchObject({
      taxableAmount: 160.71,
      taxAmount: 19.29,
      totalAmount: 180,
    });
    expect(result.lines[0]).toMatchObject({
      taxableAmount: 160.71,
      taxAmount: 19.29,
      totalAmount: 180,
    });
    expect(result.gstSummary[0]).toMatchObject({
      taxableAmount: 160.71,
      cgst: 9.65,
      sgst: 9.64,
      totalTax: 19.29,
      grossAmount: 180,
    });
  });
});
