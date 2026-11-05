import { spawnSync } from 'node:child_process';
import { InventoryLabelService } from './inventory-label.service';
import { InventoryPurchaseActionsService } from './inventory-purchase-actions.service';

const actor = { id: 'staff', branchId: 'clinic', role: 'OWNER' };
const textOf = (pdf: Buffer) => {
  const result = spawnSync('pdftotext', ['-', '-'], { input: pdf });
  if (result.error) throw result.error;
  expect(result.status).toBe(0);
  return result.stdout.toString().replace(/\s+/g, ' ');
};

it('prints the stored month-end expiry on a stock label', async () => {
  const service = new InventoryLabelService({ item: async () => ({ item: {
    name: 'Sample cream', batchNumber: 'B1', expiryDate: '2026-11-30T23:59:59.999Z', unit: 'tube', mrp: 100,
  } }) } as any, {} as any);
  const text = textOf(await service.label(actor, 'stock-1'));
  expect(text).toContain('Expiry: 30 Nov 2026');
  expect(text).not.toContain('01 Dec 2026');
});

it('prints a workflow label creation date in the clinic timezone', async () => {
  const service = new InventoryLabelService({} as any, { document: async () => ({
    reference: 'PO-1', kind: 'PURCHASE_ORDER', status: 'DRAFT', createdAt: new Date('2026-11-05T20:00:00Z'),
  }) } as any);
  expect(textOf(await service.label(actor, 'order-1', true))).toContain('Date: 06 Nov 2026');
});

const purchaseService = () => new InventoryPurchaseActionsService({} as any, {
  permissions: async () => new Set(['*']),
} as any, { findOne: async () => ({
  id: 'purchase-1', invoiceNumber: 'P1', distributorName: 'Sample supplier', distributorGstin: '', status: 'DRAFT',
  invoiceDate: new Date('2026-11-30T00:00:00Z'), dueDate: new Date('2026-12-05T00:00:00Z'),
  createdAt: new Date('2026-11-05T20:00:00Z'), netPayable: 100, taxableAmount: 100, totalGst: 0, rounding: 0,
  items: [{ lineNumber: 1, productName: 'Sample cream', batchNumber: 'B1', expiryMonth: 11, expiryYear: 2026,
    quantityPurchased: 1, freeQuantity: 0, packUnitType: 'TUBE', packSize: 1, mrp: 100, purchaseRate: 100,
    taxableAmount: 100, gstAmount: 0, lineTotal: 100 }], documents: [],
}) } as any);

it('prints purchase calendar dates, month-only expiry and clinic creation time', async () => {
  const result = await purchaseService().export(actor, 'pdf', 'purchase-1');
  const text = textOf(result.data);
  expect(text).toContain('Invoice Date: 30 Nov 2026');
  expect(text).toContain('Due Date: 05 Dec 2026');
  expect(text).toContain('Created At: 06 Nov 2026, 01:30 am');
  expect(text).toContain('Expiry Nov 2026');
  expect(text).not.toContain('Expiry 01 Nov 2026');
});

it('uses the same purchase day on its QR sheet while CSV retains machine timestamps', async () => {
  const service = purchaseService();
  const qr = await service.export(actor, 'qr', 'purchase-1');
  expect(textOf(qr.data)).toContain('Invoice date: 30 Nov 2026');
  const csv = await service.export(actor, 'csv', 'purchase-1');
  expect(csv.data.toString()).toContain('2026-11-30T00:00:00.000Z');
  expect(csv.data.toString()).toContain('2026-11-05T20:00:00.000Z');
});
