import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import { PrismaService } from '../../../shared/database/prisma.service';
import { localDatabase } from '../../../shared/testing/local-database';
import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';

const databaseTests = process.env.FORMAL_REPLAY_TEST_DATABASE_URL ? describe : describe.skip;

/**
 * Replays TLC's shortest path to a broken rule in
 * verification/state-machines/purchase-import (results/code.md).
 */
databaseTests('Purchase import formal replay', () => {
  let database: Awaited<ReturnType<typeof localDatabase>>;
  let prisma: PrismaClient;
  let service: PharmacyPurchaseInvoiceService;
  let branchId: string;
  let pharmacistId: string;
  let managerId: string;

  const draftFor = (invoiceNumber: string) => ({
    distributorName: 'Synthetic Supplier', distributorGstin: '36ABCDE1234F1Z5', distributorDlNo: 'SYNTHETIC',
    invoiceNumber, invoiceDate: '2026-01-01', goodsReceivedDate: '2026-01-02',
    billType: 'CASH', doctorNameOrRegNo: 'Synthetic Clinic', source: 'OCR',
    grossAmount: 1000, taxableAmount: 1000, totalCgst: 60, totalSgst: 60, totalIgst: 0, totalGst: 120, netPayable: 1120,
    items: [{
      productName: 'Synthetic Cream', manufacturer: 'Synthetic Pharma', packSize: '20g', packUnitType: 'Tube',
      hsnCode: '3004', batchNumber: randomUUID(), expiryMonth: 12, expiryYear: 2099,
      quantityPurchased: 10, freeQuantity: 2, mrp: 150, purchaseRate: 100, discountPercent: 0,
      taxableAmount: 1000, cgstPercent: 6, sgstPercent: 6, igstPercent: 0, gstAmount: 120, lineTotal: 1120, ocrConfidence: 0.99,
    }],
  });
  const uploadOf = async (label: string) => {
    const buffer = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="60"><text x="10" y="30">${label}</text></svg>`)).png().toBuffer();
    return { buffer, size: buffer.length, originalname: `${label}.png`, mimetype: 'image/png' } as Express.Multer.File;
  };

  beforeAll(async () => {
    database = await localDatabase(process.env.FORMAL_REPLAY_TEST_DATABASE_URL!);
    prisma = database.prisma;
    await prisma.$executeRawUnsafe('DROP TABLE "pharmacy_purchase_import_attempts"');
    const attemptMigration = readFileSync(path.resolve('prisma/migrations/20261024120000_purchase_import_recovery/migration.sql'), 'utf8');
    for (const sql of attemptMigration.split(';').filter(statement => statement.trim())) await prisma.$executeRawUnsafe(sql);
    const recoveryMigration = readFileSync(path.resolve('prisma/migrations/20261024150000_unlinked_purchase_recovery/migration.sql'), 'utf8');
    for (const sql of recoveryMigration.split('-- statement-breakpoint').filter(statement => statement.trim())) await prisma.$executeRawUnsafe(sql);
    branchId = (await prisma.branch.create({ data: { name: 'Synthetic import replay', address: 'Synthetic' } })).id;
    const user = (role: 'PHARMACIST' | 'ADMIN') => prisma.user.create({ data: {
      firstName: 'Synthetic', lastName: role, email: `${randomUUID()}@example.invalid`, password: 'no-login-test-only', role, branchId,
    } });
    pharmacistId = (await user('PHARMACIST')).id;
    managerId = (await user('ADMIN')).id;
    await prisma.supplier.create({ data: { branchId, name: 'Synthetic Supplier', gstNumber: '36ABCDE1234F1Z5' } });
    await prisma.drug.create({ data: {
      branchId, name: 'Synthetic Cream', manufacturerName: 'Synthetic Pharma', packSizeLabel: '20g', price: 150,
      composition1: 'Synthetic', category: 'Topical', dosageForm: 'Cream', strength: '1%',
    } });
    service = new PharmacyPurchaseInvoiceService(prisma as PrismaService);
  }, 120000);

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => { await database?.cleanup(); });

  /**
   * Steps 1 to 4 of the trace: the upload registers, OCR reads the bill, the worker saves
   * the draft, then a manager recovers the attempt while another bill's original is open.
   */
  async function recoverAfterSave() {
    const otherOriginal = await service.archiveOriginal(await uploadOf(`other-${randomUUID()}`), branchId, managerId);
    const otherBill = await service.createDraft({ ...draftFor(randomUUID()), sourceDocumentId: otherOriginal.id } as any, branchId, managerId, true);

    const draft = draftFor(randomUUID());
    jest.spyOn(service, 'extractDocumentDraft').mockResolvedValue({ draft, extraction: { provider: 'synthetic-ocr' } } as any);
    let savedBillId!: string;
    let saved!: () => void;
    let release!: () => void;
    const reachedStock = new Promise<void>(resolve => { saved = resolve; });
    const stockGate = new Promise<void>(resolve => { release = resolve; });
    const processInvoice = service.processInvoice.bind(service);
    jest.spyOn(service, 'processInvoice').mockImplementation(async (id, branch, userId) => {
      savedBillId = id;
      saved();
      await stockGate;
      return processInvoice(id, branch, userId);
    });

    const attemptId = randomUUID();
    const importing = service.importWithRecovery([await uploadOf(`bill-${draft.invoiceNumber}`)], attemptId, branchId, pharmacistId, '2026-01-02', true);
    await reachedStock;
    let recovered: Awaited<ReturnType<PharmacyPurchaseInvoiceService['recoverDelegatedImport']>>;
    try {
      recovered = await service.recoverDelegatedImport({ branchId, userId: managerId }, {
        attemptId, reason: 'Pharmacist went home before the import finished', sourceDocumentIds: [otherOriginal.id],
      });
    } finally {
      release();
    }
    const imported = await importing;
    const attempt = await prisma.pharmacyPurchaseImportAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    const bill = await prisma.pharmacyPurchaseInvoice.findUniqueOrThrow({ where: { id: savedBillId } });
    return { recovered, imported, attempt, bill, savedBillId, otherBillId: otherBill.id };
  }

  it('SavedStaysSaved: recovering a saved import keeps its saved bill', async () => {
    const { recovered, imported, attempt, bill, savedBillId, otherBillId } = await recoverAfterSave();
    expect(recovered).toMatchObject({ outcome: 'DRAFT_SAVED', invoiceId: savedBillId });
    expect(attempt).toMatchObject({ status: 'INVOICE_SAVED', purchaseInvoiceId: savedBillId });
    expect(imported.automation.status).toBe('STOCK_COMMITTED');
    expect(bill.status).toBe('STOCK_COMMITTED');
    await service.markReviewed(otherBillId, {}, branchId);
    await service.commitStock(otherBillId, branchId, managerId);
    expect(await prisma.pharmacyPurchaseInvoice.findUniqueOrThrow({ where: { id: otherBillId } })).toMatchObject({ status: 'STOCK_COMMITTED' });
  });
});
