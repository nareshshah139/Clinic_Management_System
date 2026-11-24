import { exposeTestTrigramOperator } from '../../../shared/testing/local-database';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import * as path from 'path';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';
import { PrismaService } from '../../../shared/database/prisma.service';

// Opt-in real PostgreSQL tests. Only the OCR read is replaced with synthetic extraction.
const databaseTests = process.env.PURCHASE_AUTOMATION_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Purchase OCR learning with real PostgreSQL', () => {
  const GSTIN = '36AAACL1234F1Z5';
  const DAY = 24 * 60 * 60 * 1000;
  const schema = `ocr_automation_test_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let prisma: PrismaClient;
  let schemaCreated = false;
  let service: PharmacyPurchaseInvoiceService;
  let branchId: string;
  let userId: string;
  let read: any;

  const ocrBill = (invoiceNumber: string, line: Record<string, unknown> = {}, header: Record<string, unknown> = {}) => ({
    distributorName: 'Learning Supplier', distributorGstin: GSTIN, distributorDlNo: 'DL-LEARN', invoiceNumber, ...header,
    invoiceDate: '2026-01-01', billType: 'CASH', doctorNameOrRegNo: 'Synthetic Clinic', source: 'OCR',
    grossAmount: 300, taxableAmount: 300, totalCgst: 18, totalSgst: 18, totalIgst: 0, totalGst: 36, netPayable: 336, ocrFlags: [],
    items: [{
      productName: 'DOLO-650 TAB', manufacturer: 'MICRO LABS', packSize: '15', packUnitType: 'Strip', hsnCode: '3004',
      batchNumber: `B-${invoiceNumber}`, expiryMonth: 12, expiryYear: 2099, quantityPurchased: 10, freeQuantity: 0,
      mrp: 33, purchaseRate: 30, discountPercent: 0, taxableAmount: 300, cgstPercent: 6, sgstPercent: 6, igstPercent: 0,
      gstAmount: 36, lineTotal: 336, ocrConfidence: 0.99, ocrFlags: [], ...line,
    }],
  });

  const importBill = async (invoiceNumber: string, line: Record<string, unknown> = {}, header: Record<string, unknown> = {}): Promise<any> => {
    read = ocrBill(invoiceNumber, line, header);
    const buffer = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="60"><text x="10" y="30">Bill ${invoiceNumber}</text></svg>`)).png().toBuffer();
    const upload = { buffer, size: buffer.length, originalname: `${invoiceNumber}.png`, mimetype: 'image/png' } as Express.Multer.File;
    return service.importFromDocument(upload, branchId, userId, '2026-01-02', [], true);
  };

  const reviewAndCommit = async (invoiceId: string, product: { name: string; manufacturerName: string; packSizeLabel: string }) => {
    const saved = await service.findOne(invoiceId, branchId);
    await service.updateDraft(invoiceId, {
      ...ocrBill(saved.invoiceNumber, {}, { distributorName: saved.distributorName, distributorGstin: saved.distributorGstin }),
      goodsReceivedDate: '2026-01-02', expectedUpdatedAt: saved.updatedAt.toISOString(),
      items: saved.items.map((item: any) => ({ ...item, productName: product.name, manufacturer: product.manufacturerName,
        packSize: product.packSizeLabel, ocrFlags: [] })),
    } as any, branchId, userId);
    await service.markReviewed(invoiceId, {}, branchId, userId);
    return service.commitStock(invoiceId, branchId, userId);
  };

  const examplesOf = (invoiceId: string) => prisma.pharmacyPurchaseLearningExample.findMany({
    where: { invoiceId }, orderBy: { field: 'asc' },
    select: { field: true, rawKey: true, rawValue: true, finalValue: true, drugId: true, provenance: true, origin: true, appliedLessonKey: true },
  });
  const backdate = (invoiceId: string, days: number) => prisma.pharmacyPurchaseLearningExample.updateMany({
    where: { invoiceId }, data: { committedAt: new Date(Date.now() - days * DAY) },
  });

  beforeAll(async () => {
    const url = new URL(process.env.PURCHASE_AUTOMATION_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Database tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public');
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', path.resolve('prisma/schema.prisma')], {
      env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe',
    });
    prisma = new PrismaClient({ datasourceUrl: url.toString() });
    await exposeTestTrigramOperator(prisma);
    // Exercise the additive deployment migration, rather than relying only on db push.
    await prisma.$executeRawUnsafe('DROP TABLE "pharmacy_purchase_learning_examples"');
    await prisma.$executeRawUnsafe('ALTER TABLE "pharmacy_purchase_invoice_documents" DROP COLUMN "ocrRead"');
    await prisma.$executeRawUnsafe('ALTER TABLE "pharmacy_purchase_invoice_items" DROP COLUMN "ocrLineKey"');
    const migration = readFileSync(path.resolve('prisma/migrations/20261124100000_purchase_ocr_learning/migration.sql'), 'utf8');
    for (const statement of migration.split(';').filter(sql => sql.replace(/--.*$/gm, '').trim())) await prisma.$executeRawUnsafe(statement);

    branchId = (await prisma.branch.create({ data: { name: 'Synthetic Learning Branch', address: 'Synthetic' } })).id;
    userId = (await prisma.user.create({ data: {
      firstName: 'Synthetic', lastName: 'Reviewer', email: 'ocr-learning@example.invalid', password: 'no-login-test-only',
      role: 'PHARMACIST', branchId,
    } })).id;
    await prisma.supplier.create({ data: { branchId, name: 'Learning Supplier', gstNumber: GSTIN } });
    service = new PharmacyPurchaseInvoiceService(prisma as PrismaService);
    jest.spyOn(service, 'extractDocumentDraft').mockImplementation(async () => ({
      draft: structuredClone(read), extraction: { provider: 'synthetic-database-test', promptVersion: 'synthetic-v1' },
    } as any));
  }, 60000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (schemaCreated) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('learns a supplier spelling from reviewed bills until it posts stock unattended, and unlearns on an override', async () => {
    const dolo = await prisma.drug.create({ data: { branchId, name: 'Dolo 650mg Tablet', manufacturerName: 'Micro Labs', packSizeLabel: '15',
      price: 33, composition1: 'Paracetamol', category: 'Analgesic', dosageForm: 'Tablet', strength: '650mg' } });
    const dolopar = await prisma.drug.create({ data: { branchId, name: 'Dolopar 650 Tablet', manufacturerName: 'Micro Labs', packSizeLabel: '15',
      price: 33, composition1: 'Paracetamol', category: 'Analgesic', dosageForm: 'Tablet', strength: '650mg' } });
    const lessonKey = `product:${GSTIN}:dolo 650 tablet|15`;

    const bill1 = await importBill('LEARN-1');
    expect(bill1.automation.status).toBe('SAVED_FOR_REVIEW');
    expect(bill1.learning).toEqual({ applied: [], suggestions: [] });
    expect(bill1.invoice.items[0]).toMatchObject({ productName: 'DOLO-650 TAB', ocrLineKey: expect.stringMatching(new RegExp(`^${bill1.sourceDocument.id}:[a-f0-9]{12}:0$`)) });
    const storedRead: any = (await prisma.pharmacyPurchaseInvoiceDocument.findUniqueOrThrow({ where: { id: bill1.sourceDocument.id } })).ocrRead;
    expect(storedRead).toMatchObject({ version: 1, promptVersion: 'synthetic-v1', header: { distributorGstin: GSTIN },
      items: [{ key: bill1.invoice.items[0].ocrLineKey, productName: 'DOLO-650 TAB', packSize: '15' }], applied: [] });
    await reviewAndCommit(bill1.invoice.id, dolo);
    expect(await examplesOf(bill1.invoice.id)).toEqual([
      { field: 'distributorName', rawKey: 'LEARNINGSUPPLIER', rawValue: 'Learning Supplier', finalValue: 'Learning Supplier', drugId: null, provenance: 'OCR_KEPT', origin: 'HUMAN_REVIEW', appliedLessonKey: null },
      { field: 'manufacturer', rawKey: 'micro labs|dolo 650 tablet|15', rawValue: 'MICRO LABS', finalValue: 'Micro Labs', drugId: null, provenance: 'OCR_KEPT', origin: 'HUMAN_REVIEW', appliedLessonKey: null },
      { field: 'product', rawKey: 'dolo 650 tablet|15', rawValue: 'DOLO-650 TAB', finalValue: 'Dolo 650mg Tablet', drugId: dolo.id, provenance: 'HUMAN_CORRECTED', origin: 'HUMAN_REVIEW', appliedLessonKey: null },
    ]);
    await backdate(bill1.invoice.id, 30);

    const bill2 = await importBill('LEARN-2');
    expect(bill2.invoice.items[0].productName).toBe('DOLO-650 TAB');
    expect(bill2.learning.applied).toEqual([]);
    expect(bill2.learning.suggestions).toEqual([{ slot: bill2.invoice.items[0].ocrLineKey, field: 'product', from: 'DOLO-650 TAB',
      to: 'Dolo 650mg Tablet', drugId: dolo.id, tier: 'SUGGEST', lessonKey, support: 1 }]);
    await reviewAndCommit(bill2.invoice.id, dolo);
    await backdate(bill2.invoice.id, 15);

    const matches = await service.suggestMasterMatches([read.items[0]], branchId, GSTIN);
    expect(matches.matches[0].candidates[0]).toMatchObject({ drug: { id: dolo.id }, reasons: expect.arrayContaining(['chosen 2× for this supplier']) });

    for (const [index, invoiceNumber] of ['LEARN-3', 'LEARN-4', 'LEARN-5'].entries()) {
      const bill = await importBill(invoiceNumber);
      expect(bill.automation.status).toBe('SAVED_FOR_REVIEW');
      expect(bill.invoice.items[0]).toMatchObject({ productName: 'Dolo 650mg Tablet', manufacturer: 'Micro Labs', packSize: '15',
        ocrFlags: ['learned_product_needs_confirmation'] });
      expect(bill.draft.items[0].learnedCorrections).toEqual([{ field: 'product', from: 'DOLO-650 TAB', to: 'Dolo 650mg Tablet', support: 2 + index, tier: 'APPLY' }]);
      expect(bill.automation.issues).toContain('Line 1: learned_product_needs_confirmation');
      await reviewAndCommit(bill.invoice.id, dolo);
      expect((await examplesOf(bill.invoice.id)).map(row => [row.field, row.provenance, row.appliedLessonKey])).toEqual([
        ['distributorName', 'OCR_KEPT', null], ['product', 'LESSON_KEPT', lessonKey],
      ]);
    }
    expect((await service.learningLessons(branchId)).lessons.map(lesson => [lesson.key, lesson.tier, lesson.independent, lesson.total, lesson.invoices]))
      .toEqual([[lessonKey, 'TRUSTED', 2, 5, 2]]);

    const humanCalls = () => ['updateDraft', 'markReviewed', 'commitStock', 'confirmMasterRecord']
      .map(method => (service as any)[method].mock?.calls.length ?? 0);
    for (const method of ['updateDraft', 'markReviewed', 'commitStock', 'confirmMasterRecord']) jest.spyOn(service as any, method);
    const trusted = await importBill('LEARN-6');
    expect(humanCalls()).toEqual([0, 0, 0, 0]);
    expect(trusted.automation).toEqual({ status: 'STOCK_COMMITTED', issues: [] });
    expect(trusted.learning.applied).toEqual([{ slot: trusted.invoice.items[0].ocrLineKey, field: 'product', from: 'DOLO-650 TAB',
      to: 'Dolo 650mg Tablet', drugId: dolo.id, tier: 'TRUSTED', lessonKey, support: 5 }]);
    expect((await prisma.inventoryItem.findFirstOrThrow({ where: { batchNumber: 'B-LEARN-6' } })).currentStock).toBe(10);
    expect((await examplesOf(trusted.invoice.id)).find(row => row.field === 'product')).toMatchObject({ provenance: 'LESSON_KEPT', origin: 'AUTOMATIC' });
    const automaticAudit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: trusted.invoice.id, action: 'AUTOMATIC_REVIEWED' } });
    expect(JSON.parse(automaticAudit.newValues!).trustedLessons).toEqual([{ slot: trusted.invoice.items[0].ocrLineKey, field: 'product',
      from: 'DOLO-650 TAB', to: 'Dolo 650mg Tablet', lessonKey, support: 5 }]);

    // Below the automatic confidence gate the trusted lesson still pre-fills, and the reviewer picks another product.
    const overridden = await importBill('LEARN-7', { ocrConfidence: 0.95 });
    expect(overridden.automation.status).toBe('SAVED_FOR_REVIEW');
    expect(overridden.invoice.items[0]).toMatchObject({ productName: 'Dolo 650mg Tablet', ocrFlags: [] });
    await reviewAndCommit(overridden.invoice.id, dolopar);
    expect((await examplesOf(overridden.invoice.id)).find(row => row.field === 'product')).toMatchObject({
      provenance: 'LESSON_OVERRIDDEN', drugId: dolopar.id, appliedLessonKey: lessonKey });

    const afterOverride = await importBill('LEARN-8');
    expect(afterOverride.automation.status).toBe('SAVED_FOR_REVIEW');
    expect(afterOverride.learning).toEqual({ applied: [], suggestions: [] });
    expect(afterOverride.invoice.items[0]).toMatchObject({ productName: 'DOLO-650 TAB', ocrFlags: [] });
    expect(await prisma.inventoryItem.count({ where: { batchNumber: 'B-LEARN-8' } })).toBe(0);

    const metrics = await service.learningMetrics(branchId, {});
    expect(metrics.totals).toEqual({ lines: 7, reviewedLines: 6, reviewerTouches: 3, touchesPer100Lines: 42.9, rawCorrectionRate: 43.8,
      invoices: 7, automaticInvoices: 1, autoCommitRate: 14.3, lessonsKept: 4, lessonsOverridden: 1, overrideRate: 20 });
    expect(metrics.activeLessons).toEqual({ SUGGEST: 0, APPLY: 0, TRUSTED: 0 });
  }, 60000);

  it('forgets a lesson on request so the next bill is read as printed again', async () => {
    const other = { distributorName: 'Other Supplier', distributorGstin: '36AAACO1234F1Z5' };
    const line = { productName: 'CROCIN ADV 500', manufacturer: 'GSK', packSize: '20' };
    const crocin = await prisma.drug.create({ data: { branchId, name: 'Crocin Advance 500mg Tablet', manufacturerName: 'GSK', packSizeLabel: '20',
      price: 40, composition1: 'Paracetamol', category: 'Analgesic', dosageForm: 'Tablet', strength: '500mg' } });
    for (const invoiceNumber of ['FORGET-1', 'FORGET-2']) await reviewAndCommit((await importBill(invoiceNumber, line, other)).invoice.id, crocin);
    const lessonKey = `product:${other.distributorGstin}:crocin adv 500|20`;
    const learned = await importBill('FORGET-3', line, other);
    expect(learned.invoice.items[0]).toMatchObject({ productName: 'Crocin Advance 500mg Tablet', ocrFlags: ['learned_product_needs_confirmation'] });

    expect(await service.forgetLearningLesson(branchId, lessonKey, userId)).toEqual({ lessonKey, revokedExamples: 2 });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: lessonKey, action: 'LESSON_FORGOTTEN' } });
    expect(JSON.parse(audit.newValues!)).toEqual({ branchId, lessonKey, revokedExamples: 2 });
    expect((await service.learningLessons(branchId)).lessons.map(lesson => lesson.key)).not.toContain(lessonKey);

    const forgotten = await importBill('FORGET-4', line, other);
    expect(forgotten.learning).toEqual({ applied: [], suggestions: [] });
    expect(forgotten.invoice.items[0]).toMatchObject({ productName: 'CROCIN ADV 500', ocrFlags: [] });
    await expect(service.forgetLearningLesson(branchId, lessonKey, userId)).rejects.toThrow('already forgotten');
  }, 60000);
});
