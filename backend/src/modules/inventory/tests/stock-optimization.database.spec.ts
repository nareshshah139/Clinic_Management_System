import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { localDatabase } from '../../../shared/testing/local-database';
import { ROLE_PERMISSIONS } from '../../../shared/access/role-permissions';
import { InventoryWorkflowService } from '../inventory-workflow.service';
import { InventoryWorkspaceService } from '../inventory-workspace.service';
import { InventoryOptimizationService } from '../stock-optimization.service';
import { PharmacySupplierCreditService } from '../../pharmacy/pharmacy-supplier-credit.service';
import { PharmacyPurchaseReturnsRegisterService } from '../../pharmacy/pharmacy-purchase-returns-register.service';
import { clinicDay } from '../../pharmacy/register-utils';

const databaseTests = process.env.PURCHASE_RETURNS_TEST_DATABASE_URL ? describe : describe.skip;
const DAY = 86400000;
const SLV = '27AABCS1234F1Z5';
const APX = '27AAACA5678B1ZQ';

databaseTests('Stock optimization on PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let db: PrismaClient;
  let workflow: InventoryWorkflowService;
  let workspace: InventoryWorkspaceService;
  let optimization: InventoryOptimizationService;
  let returns: PharmacyPurchaseReturnsRegisterService;
  const branchId = 'branch';
  const now = Date.now();
  const ago = (days: number) => new Date(now - days * DAY);
  const actors = {
    admin: { id: 'asha', branchId, role: 'ADMIN' },
    pharmacist: { id: 'kiran', branchId, role: 'PHARMACIST' },
    doctor: { id: 'priya', branchId, role: 'DOCTOR' },
    reception: { id: 'sunita', branchId, role: 'RECEPTION' },
  };
  const lines: Record<string, string> = {};
  const bills: Record<string, string> = {};
  const today = clinicDay(new Date());
  const summary = (run: Awaited<ReturnType<InventoryOptimizationService['run']>>) => ({
    returnable: run.returnable.map((g) => [g.name, g.value, g.blocker, g.rows.map((r) => `${r.name}:${r.quantity}x${r.ptr}@${r.gstRate}%`)]),
    nonReturnable: run.nonReturnable.map((g) => [g.name, g.value, g.rows.map((r) => `${r.name}:${r.quantity}x${r.ptr}`)]),
  });

  beforeAll(async () => {
    fixture = await localDatabase(process.env.PURCHASE_RETURNS_TEST_DATABASE_URL!);
    db = fixture.prisma;
    await db.branch.createMany({ data: [{ id: branchId, name: 'Skin Care Clinic', address: 'Synthetic' }, { id: 'other', name: 'Other', address: 'Synthetic' }] });
    for (const [id, role, first] of [
      ['asha', 'ADMIN', 'Asha'], ['kiran', 'PHARMACIST', 'Kiran'], ['priya', 'DOCTOR', 'Priya'], ['sunita', 'RECEPTION', 'Sunita'],
    ] as const)
      await db.user.create({
        data: { id, firstName: first, lastName: 'Test', email: `${id}@example.invalid`, password: 'x', role, branchId, permissions: JSON.stringify(role === 'RECEPTION' ? ['appointments:read'] : ROLE_PERMISSIONS[role]) },
      });
    await db.supplier.create({ data: { id: 'slv', branchId, name: 'Shree Laxmi Vitality Pharma', gstNumber: SLV } });
    await db.supplier.create({ data: { id: 'apx', branchId, name: 'Apex Medico Distributors', gstNumber: APX } });
    for (const id of ['clob', 'mino', 'fresh', 'tret'])
      await db.drug.create({ data: { id: `drug-${id}`, name: `Drug ${id}`, price: 1, manufacturerName: 'Synthetic', packSizeLabel: '1 tube', branchId } });
    const item = (id: string, name: string, stock: number, extra: Record<string, unknown>) =>
      db.inventoryItem.create({
        data: {
          id, branchId, name, type: 'MEDICINE', costPrice: 100, sellingPrice: 160, unit: 'TUBES', currentStock: stock, gstRate: 12, packSize: 1, packUnit: 'tube',
          batchNumber: `${id.toUpperCase()}-1`, expiryDate: new Date('2027-06-30T00:00:00Z'), storageLocation: 'R1', category: 'Cream', hsnCode: '3004',
          minStockLevel: 2, maxStockLevel: 20, createdAt: ago(300), ...extra,
        },
      });
    await item('clob', 'Clobetasol Cream 15g', 30, { expiryDate: new Date('2027-03-31T00:00:00Z'), drugs: { connect: { id: 'drug-clob' } } });
    await item('adap', 'Adapalene Gel 15g', 20, { costPrice: 75, gstRate: 18, storageLocation: null, category: 'Gel', minStockLevel: null, expiryDate: new Date('2027-01-31T00:00:00Z') });
    await item('keto', 'Ketoconazole Shampoo 100ml', 10, { costPrice: 120, storageLocation: 'R2', category: null, hsnCode: null });
    await item('calam', 'Calamine Lotion 100ml', 15, { costPrice: 50, storageLocation: '  ', category: 'Lotion', hsnCode: '', maxStockLevel: null });
    await item('mino', 'Minoxidil 5% Solution', 10, { costPrice: 200, drugs: { connect: { id: 'drug-mino' } } });
    await item('fresh', 'Fresh Sunscreen 50g', 6, { drugs: { connect: { id: 'drug-fresh' } } });
    await item('tret-a', 'Tretinoin Cream 0.025% (A)', 8, { drugs: { connect: { id: 'drug-tret' } } });
    await item('tret-b', 'Tretinoin Cream 0.025% (B)', 0, { drugs: { connect: { id: 'drug-tret' } } });
    await item('pending', 'Waiting Mapping Gel', 0, { metadata: JSON.stringify({ mappingStatus: 'PENDING' }) });
    await db.inventoryItem.create({
      data: { id: 'elsewhere', branchId: 'other', name: 'Other Branch Cream', type: 'MEDICINE', costPrice: 1, sellingPrice: 2, unit: 'TUBES', currentStock: 5 },
    });
    const bill = async (key: string, gstin: string, name: string, age: number, rows: [string, number, number, [number, number, number]][]) => {
      const invoice = await db.pharmacyPurchaseInvoice.create({
        data: {
          branchId, createdBy: 'asha', distributorName: name, distributorGstin: gstin, distributorDlNo: 'synthetic', invoiceNumber: key, invoiceDate: ago(age),
          billType: 'CREDIT', doctorNameOrRegNo: 'Synthetic', status: 'STOCK_COMMITTED', stockCommittedAt: ago(age), grossAmount: 1, taxableAmount: 1, totalGst: 0, netPayable: 1,
        },
      });
      bills[key] = invoice.id;
      for (const [index, [inventoryItemId, quantity, rate, [cgst, sgst, igst]]] of rows.entries())
        lines[`${key}:${inventoryItemId}`] = (
          await db.pharmacyPurchaseInvoiceItem.create({
            data: {
              purchaseInvoiceId: invoice.id, lineNumber: index + 1, productName: inventoryItemId, manufacturer: 'Synthetic', packSize: '1', packUnitType: 'TUBE',
              hsnCode: '3004', batchNumber: `${inventoryItemId.toUpperCase()}-1`, expiryMonth: 6, expiryYear: 2027, quantityPurchased: quantity, mrp: 160,
              discountPercent: 0, purchaseRate: rate, taxableAmount: quantity * rate, cgstPercent: cgst, sgstPercent: sgst, igstPercent: igst, gstAmount: 0, lineTotal: 0, inventoryItemId,
            },
          })
        ).id;
    };
    await bill('SLV/2026/01', SLV, 'Shree Laxmi Vitality Pharma', 200, [['clob', 40, 100, [6, 6, 0]], ['tret-a', 10, 90, [6, 6, 0]]]);
    await bill('SLV/2026/02', SLV, 'Shree Laxmi Vitality Pharma', 150, [['adap', 30, 75, [9, 9, 0]]]);
    await bill('SLV/2026/03', SLV, 'Shree Laxmi Vitality Pharma', 100, [['mino', 10, 200, [6, 6, 0]]]);
    await bill('SLV/2025/90', SLV, 'Shree Laxmi Vitality Pharma', 400, [['calam', 20, 50, [6, 6, 0]]]);
    await bill('APX/2026/01', APX, 'Apex Medico Distributors', 120, [['keto', 10, 120, [0, 0, 12]]]);
    await bill('APX/2026/02', APX, 'Apex Medico Distributors', 5, [['fresh', 6, 100, [0, 0, 12]]]);
    const movement = (itemId: string, type: 'SALE' | 'PURCHASE', age: number) =>
      db.stockTransaction.create({ data: { branchId, itemId, userId: 'asha', type, quantity: 1, quantityDelta: type === 'SALE' ? -1 : 1, unitPrice: 1, totalAmount: 1, createdAt: ago(age) } });
    await movement('fresh', 'PURCHASE', 5);
    await movement('mino', 'SALE', 75);
    await movement('tret-b', 'SALE', 10);
    await movement('clob', 'SALE', 120);
    workflow = new InventoryWorkflowService(db as any);
    workspace = new InventoryWorkspaceService(db as any, workflow, new PharmacySupplierCreditService(db as any));
    optimization = new InventoryOptimizationService(db as any, workflow);
    returns = new PharmacyPurchaseReturnsRegisterService(db as any);
  }, 180000);

  afterAll(async () => {
    await fixture?.cleanup();
  });

  it('counts each data-quality gap over the whole branch and lists exactly those batches when filtered', async () => {
    expect(await optimization.gaps(actors.pharmacist)).toEqual({ LOCATION: 2, CATEGORY: 1, HSN: 2, MIN_MAX: 2, UNMAPPED: 3 });
    const listed: Record<string, string[]> = {};
    for (const gap of ['LOCATION', 'CATEGORY', 'HSN', 'MIN_MAX', 'UNMAPPED']) {
      const page = await workspace.stock(actors.pharmacist, { gap, limit: '100' });
      listed[gap] = page.rows.map((row: any) => row.id);
      expect(page.total).toBe(listed[gap].length);
    }
    expect(listed).toEqual({
      LOCATION: ['adap', 'calam'],
      CATEGORY: ['keto'],
      HSN: ['calam', 'keto'],
      MIN_MAX: ['adap', 'calam'],
      UNMAPPED: ['adap', 'calam', 'keto'],
    });
    await expect(workspace.stock(actors.pharmacist, { gap: 'EVERYTHING' })).rejects.toThrow('Unknown data-quality gap');
    await expect(optimization.gaps(actors.reception)).rejects.toThrow('This action requires inventory:item:read');
  });

  it('splits slow stock into returnable and non-returnable groups by distributor under the default rules', async () => {
    const run = await optimization.run(actors.doctor);
    expect([run.rules, run.scanned, run.slow]).toEqual([{ nonMovingDays: 90, minimumBatchValue: 1500, returnWindowDays: 365 }, 7, 4]);
    expect(summary(run)).toEqual({
      returnable: [
        ['Shree Laxmi Vitality Pharma', 4500, null, ['Adapalene Gel 15g:20x75@18%', 'Clobetasol Cream 15g:30x100@12%']],
        ['Apex Medico Distributors', 1200, 'Below ₹1,500, not worth returning', ['Ketoconazole Shampoo 100ml:10x120@12%']],
      ],
      nonReturnable: [['Shree Laxmi Vitality Pharma', 750, ['Calamine Lotion 100ml:15x50']]],
    });
    expect(run.totals).toEqual({ returnable: 5700, nonReturnable: 750 });
  });

  it('lets the pharmacist, the doctor and the admin set the rules, keeps other settings for approvers, and refuses staff without inventory grants', async () => {
    const start = await optimization.rules(actors.pharmacist);
    expect(start).toEqual({ nonMovingDays: 90, minimumBatchValue: 1500, version: 0 });
    const byPharmacist = await optimization.saveRules(actors.pharmacist, { nonMovingDays: 60, version: 0 });
    expect(byPharmacist).toEqual({ nonMovingDays: 60, minimumBatchValue: 1500, version: 1 });
    expect(await optimization.saveRules(actors.doctor, { minimumBatchValue: 1000, version: 1 })).toEqual({ nonMovingDays: 60, minimumBatchValue: 1000, version: 2 });
    expect(await optimization.saveRules(actors.admin, { minimumBatchValue: '1500', version: 2 })).toEqual({ nonMovingDays: 60, minimumBatchValue: 1500, version: 3 });
    await expect(optimization.saveRules(actors.pharmacist, { nonMovingDays: 45, version: 1 })).rejects.toThrow('Settings changed. Reload before saving.');
    await expect(optimization.saveRules(actors.reception, { nonMovingDays: 45, version: 3 })).rejects.toThrow('This action requires inventory:transaction:create');
    await expect(optimization.saveRules(actors.admin, { nonMovingDays: 0, version: 3 })).rejects.toThrow('Non-moving days must be a whole number from 1 to 730');
    await expect(workflow.saveSettings(actors.pharmacist, { lookbackDays: 30, version: 3 })).rejects.toThrow('An inventory manager must configure automation and approvals');
    const settings = await workflow.saveSettings(actors.admin, { lookbackDays: 30, version: 3 });
    expect([settings.lookbackDays, settings.optimization, settings.version]).toEqual([30, { nonMovingDays: 60, minimumBatchValue: 1500 }, 4]);
  });

  it('flags the minoxidil sold 75 days ago once non-moving days are 60', async () => {
    expect(summary(await optimization.run(actors.pharmacist)).returnable[0]).toEqual([
      'Shree Laxmi Vitality Pharma', 6500, null,
      ['Adapalene Gel 15g:20x75@18%', 'Clobetasol Cream 15g:30x100@12%', 'Minoxidil 5% Solution:10x200@12%'],
    ]);
    await optimization.saveRules(actors.admin, { nonMovingDays: 90, version: 4 });
    expect(summary(await optimization.run(actors.pharmacist)).returnable[0][1]).toBe(4500);
  });

  it('creates one return draft for a distributor across two bills, pre-filled, and a second press is a no-op', async () => {
    const requestKey = randomUUID();
    const draft = await optimization.createReturnDraft(actors.pharmacist, { distributorGstin: SLV.toLowerCase(), requestKey });
    expect({
      reference: draft.reference, status: draft.status, supplierId: draft.supplierId, supplierGstin: draft.supplierGstin, purchaseInvoiceId: draft.purchaseInvoiceId,
      total: draft.totalAmount, reason: (draft.payload as any).reason,
    }).toEqual({
      reference: `RET-SO-${today.replaceAll('-', '')}-AABCS`, status: 'DRAFT', supplierId: 'slv', supplierGstin: SLV, purchaseInvoiceId: null, total: 5130,
      reason: `Slow-moving: no sale in 90 days (stock optimization ${today.slice(8)}/${today.slice(5, 7)}/${today.slice(0, 4)})`,
    });
    expect((draft.payload as any).lines.map((l: any) => [l.inventoryId, l.batchNumber, l.quantity, l.unitPrice, l.gstRate, l.taxable, l.tax, l.total, l.sourceLineId])).toEqual([
      ['adap', 'ADAP-1', 20, 75, 18, 1500, 270, 1770, lines['SLV/2026/02:adap']],
      ['clob', 'CLOB-1', 30, 100, 12, 3000, 360, 3360, lines['SLV/2026/01:clob']],
    ]);
    const again = await optimization.createReturnDraft(actors.pharmacist, { distributorGstin: SLV, requestKey });
    expect(again.id).toBe(draft.id);
    await expect(optimization.createReturnDraft(actors.doctor, { distributorGstin: SLV, requestKey: randomUUID() })).rejects.toThrow('Every batch is already on a return draft');
    await expect(optimization.createReturnDraft(actors.admin, { distributorGstin: APX, requestKey: randomUUID() })).rejects.toThrow('Below ₹1,500, not worth returning');
    expect(await db.inventoryWorkflowDocument.count({ where: { branchId, kind: 'SUPPLIER_RETURN' } })).toBe(1);
    const rerun = await optimization.run(actors.pharmacist);
    expect([rerun.returnable[0].blocker, rerun.returnable[0].openReturns.map((r) => r.reference)]).toEqual([
      'Every batch is already on a return draft', [draft.reference],
    ]);

    const page = await returns.list({ from: today, to: today, sortBy: 'srNo', sortDir: 'asc', page: 1, limit: 50 }, { branchId });
    expect(page.rows.map((row) => [row.returnRef, row.distributor.name, row.sourceBillNo, row.returnValue, row.state])).toEqual([
      [draft.reference, 'Shree Laxmi Vitality Pharma', 'SLV/2026/02, SLV/2026/01', 5130, 'DRAFT'],
    ]);

    const challan = await workflow.transition(actors.pharmacist, draft.id, { action: 'CHALLAN', version: draft.version });
    expect(challan.status).toBe('CHALLAN');
    const stock = await db.inventoryItem.findMany({ where: { id: { in: ['adap', 'clob'] } }, orderBy: { id: 'asc' }, select: { id: true, currentStock: true } });
    expect(stock).toEqual([{ id: 'adap', currentStock: 0 }, { id: 'clob', currentStock: 0 }]);
    const after = await optimization.run(actors.pharmacist);
    expect(summary(after).returnable).toEqual([['Apex Medico Distributors', 1200, 'Below ₹1,500, not worth returning', ['Ketoconazole Shampoo 100ml:10x120@12%']]]);
  });

  it('refuses a return line that names another distributor\'s purchase, and counts every return of a purchase line against it', async () => {
    const foreign = await workflow.saveDocument(actors.admin, {
      kind: 'SUPPLIER_RETURN', reference: 'RET-MISMATCH', requestKey: randomUUID(), supplierId: 'slv',
      payload: { returnReason: 'OTHER', lines: [{ inventoryId: 'keto', quantity: 1, unitPrice: 120, sourceLineId: lines['APX/2026/01:keto'] }] },
    });
    await expect(workflow.transition(actors.admin, foreign.id, { action: 'CHALLAN', version: foreign.version })).rejects.toThrow(
      'Return must match the original supplier and purchase batch',
    );
    await db.inventoryItem.update({ where: { id: 'clob' }, data: { currentStock: 20 } });
    const billLinked = await workflow.saveDocument(actors.admin, {
      kind: 'SUPPLIER_RETURN', reference: 'RET-OVER', requestKey: randomUUID(), supplierId: 'slv', purchaseInvoiceId: bills['SLV/2026/01'],
      payload: { returnReason: 'OTHER', lines: [{ inventoryId: 'clob', quantity: 11, unitPrice: 100, sourceLineId: lines['SLV/2026/01:clob'] }] },
    });
    await expect(workflow.transition(actors.admin, billLinked.id, { action: 'CHALLAN', version: billLinked.version })).rejects.toThrow(
      'Return exceeds the unreturned purchase quantity',
    );
    const fits = await workflow.saveDocument(actors.admin, {
      kind: 'SUPPLIER_RETURN', reference: 'RET-FITS', requestKey: randomUUID(), supplierId: 'slv', purchaseInvoiceId: bills['SLV/2026/01'],
      payload: { returnReason: 'OTHER', lines: [{ inventoryId: 'clob', quantity: 10, unitPrice: 100, sourceLineId: lines['SLV/2026/01:clob'] }] },
    });
    expect((await workflow.transition(actors.admin, fits.id, { action: 'CHALLAN', version: fits.version })).status).toBe('CHALLAN');
  });
});

databaseTests('Stock optimization: free goods, unmapped products and concurrent drafts on PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let db: PrismaClient;
  let optimization: InventoryOptimizationService;
  const branchId = 'clinic';
  const MED = '27AAACM4321C1Z2';
  const pharmacist = { id: 'kiran', branchId, role: 'PHARMACIST' };
  const now = Date.now();
  const ago = (days: number) => new Date(now - days * DAY);
  const lines: Record<string, string> = {};

  beforeAll(async () => {
    fixture = await localDatabase(process.env.PURCHASE_RETURNS_TEST_DATABASE_URL!);
    db = fixture.prisma;
    await db.branch.create({ data: { id: branchId, name: 'Skin Care Clinic', address: 'Synthetic' } });
    await db.user.create({
      data: { id: 'kiran', firstName: 'Kiran', lastName: 'Test', email: 'kiran@example.invalid', password: 'x', role: 'PHARMACIST', branchId, permissions: JSON.stringify(ROLE_PERMISSIONS.PHARMACIST) },
    });
    for (const [id, name, gstin] of [['slv', 'Shree Laxmi Vitality Pharma', SLV], ['apx', 'Apex Medico Distributors', APX], ['med', 'Medline Traders', MED]])
      await db.supplier.create({ data: { id, branchId, name, gstNumber: gstin } });
    const item = (id: string, name: string, stock: number, age: number, extra: Record<string, unknown> = {}) =>
      db.inventoryItem.create({
        data: {
          id, branchId, name, type: 'MEDICINE', costPrice: 18, sellingPrice: 30, unit: 'STRIPS', currentStock: stock, gstRate: 12, packSize: 10, packUnit: 'tablets',
          batchNumber: `${id.toUpperCase()}-1`, expiryDate: new Date('2027-09-30T00:00:00Z'), createdAt: ago(age), ...extra,
        },
      });
    const bill = async (key: string, gstin: string, name: string, age: number, inventoryItemId: string, quantity: number, free: number, rate: number) => {
      const invoice = await db.pharmacyPurchaseInvoice.create({
        data: {
          branchId, createdBy: 'kiran', distributorName: name, distributorGstin: gstin, distributorDlNo: 'synthetic', invoiceNumber: key, invoiceDate: ago(age),
          billType: 'CREDIT', doctorNameOrRegNo: 'Synthetic', status: 'STOCK_COMMITTED', stockCommittedAt: ago(age), grossAmount: 1, taxableAmount: 1, totalGst: 0, netPayable: 1,
        },
      });
      lines[key] = (
        await db.pharmacyPurchaseInvoiceItem.create({
          data: {
            purchaseInvoiceId: invoice.id, lineNumber: 1, productName: inventoryItemId, manufacturer: 'Synthetic', packSize: '10', packUnitType: 'STRIP',
            hsnCode: '3004', batchNumber: `${inventoryItemId.toUpperCase()}-1`, expiryMonth: 9, expiryYear: 2027, quantityPurchased: quantity, freeQuantity: free, mrp: 30,
            discountPercent: 0, purchaseRate: rate, taxableAmount: quantity * rate, cgstPercent: 6, sgstPercent: 6, igstPercent: 0, gstAmount: 0, lineTotal: 0, inventoryItemId,
          },
        })
      ).id;
    };
    await item('bonus', 'Tab. Bonus 10 mg', 110, 130);
    await bill('SLV/FREE/1', SLV, 'Shree Laxmi Vitality Pharma', 120, 'bonus', 100, 10, 20);
    await item('acnosis-a', 'Tab. Acnosis', 40, 200);
    await item('acnosis-b', 'Tab.  ACNOSIS ', 30, 120);
    await item('acnosis-15', 'Tab. Acnosis', 30, 200, { packSize: 15 });
    await bill('MED/1', MED, 'Medline Traders', 120, 'acnosis-b', 30, 0, 60);
    await bill('MED/2', MED, 'Medline Traders', 190, 'acnosis-15', 30, 0, 60);
    await db.stockTransaction.create({ data: { branchId, itemId: 'acnosis-a', userId: 'kiran', type: 'SALE', quantity: 1, quantityDelta: -1, unitPrice: 30, totalAmount: 30, createdAt: ago(1) } });
    await item('race', 'Tab. Race 5 mg', 100, 200);
    await bill('APX/RACE/1', APX, 'Apex Medico Distributors', 150, 'race', 100, 0, 20);
    optimization = new InventoryOptimizationService(db as any, new InventoryWorkflowService(db as any));
  }, 180000);

  afterAll(async () => {
    await fixture?.cleanup();
  });

  it('values 100 bought + 10 free at PTR 20 as 2000 and drafts the free units at no value: 2000 + 240 GST', async () => {
    const run = await optimization.run(pharmacist);
    const slv = run.returnable.find((g) => g.gstin === SLV)!;
    expect([slv.value, slv.blocker, slv.rows.map((r) => [r.name, r.quantity, r.freeQuantity, r.value])]).toEqual([2000, null, [['Tab. Bonus 10 mg', 110, 10, 2000]]]);
    const draft = await optimization.createReturnDraft(pharmacist, { distributorGstin: SLV, requestKey: randomUUID() });
    expect((draft.payload as any).lines.map((l: any) => [l.inventoryId, l.quantity, l.freeQuantity, l.unitPrice, l.taxable, l.tax, l.total, l.sourceLineId])).toEqual([
      ['bonus', 100, 10, 20, 2000, 240, 2240, lines['SLV/FREE/1']],
    ]);
    expect(draft.totalAmount).toBe(2240);
  });

  it('judges an unmapped batch on the sales of its sibling batches with the same name, unit and pack', async () => {
    const run = await optimization.run(pharmacist);
    expect(run.returnable.find((g) => g.gstin === MED)?.rows.map((r) => [r.inventoryId, r.quantity])).toEqual([['acnosis-15', 30]]);
  });

  it('creates one draft when two windows press Create return draft at once with different request keys', async () => {
    const pressed = await Promise.allSettled([
      optimization.createReturnDraft(pharmacist, { distributorGstin: APX, requestKey: randomUUID() }),
      optimization.createReturnDraft(pharmacist, { distributorGstin: APX, requestKey: randomUUID() }),
    ]);
    expect(pressed.map((p) => p.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(pressed.flatMap((p) => (p.status === 'rejected' ? [String(p.reason.message)] : []))).toEqual(['Every batch is already on a return draft']);
    expect(await db.inventoryWorkflowDocument.count({ where: { branchId, kind: 'SUPPLIER_RETURN', supplierId: 'apx' } })).toBe(1);
  });
});
