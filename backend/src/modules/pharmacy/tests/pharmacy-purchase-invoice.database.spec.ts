import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import * as path from 'path';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { ServiceUnavailableException } from '@nestjs/common';
import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';
import { PrismaService } from '../../../shared/database/prisma.service';

// Opt-in real PostgreSQL tests. Only OCR is replaced with synthetic extraction.
// Creates and removes its OWN random schema; never uses application credentials.
const databaseTests = process.env.PURCHASE_AUTOMATION_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Automatic purchase intake with real PostgreSQL', () => {
  let admin: PrismaClient;
  let prisma: PrismaClient;
  let service: PharmacyPurchaseInvoiceService;
  let branchId: string;
  let userId: string;
  let draft: any;
  let schemaCreated = false;
  const schema = `ocr_automation_test_${randomUUID().replaceAll('-', '')}`;
  let upload: Express.Multer.File;

  beforeAll(async () => {
    const url = new URL(process.env.PURCHASE_AUTOMATION_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Database tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', path.resolve('prisma/schema.prisma')], {
      env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe',
    });
    prisma = new PrismaClient({ datasourceUrl: url.toString() });
    // Exercise the additive deployment migration, rather than relying only on db push.
    await prisma.$executeRawUnsafe('DROP TABLE "pharmacy_purchase_invoice_documents"');
    const migration = readFileSync(path.resolve('prisma/migrations/20260912_add_purchase_invoice_documents/migration.sql'), 'utf8');
    for (const statement of migration.split(';').filter((sql) => sql.trim())) await prisma.$executeRawUnsafe(statement);
    branchId = (await prisma.branch.create({ data: { name: 'Synthetic OCR Test', address: 'Synthetic' } })).id;
    userId = (await prisma.user.create({ data: {
      firstName: 'Synthetic', lastName: 'Operator', email: 'ocr-test@example.invalid', password: 'no-login-test-only',
      role: 'PHARMACIST', branchId,
    } })).id;
    await prisma.supplier.create({ data: { branchId, name:'Synthetic Supplier', gstNumber:'36ABCDE1234F1Z5' } });
    await prisma.drug.create({ data: {
      branchId, name: 'Synthetic Cream', manufacturerName: 'Synthetic Pharma', packSizeLabel: '20g', price: 150,
      composition1: 'Synthetic', category: 'Topical', dosageForm: 'Cream', strength: '1%',
    } });
    service = new PharmacyPurchaseInvoiceService(prisma as PrismaService);
    jest.spyOn(service, 'extractDocumentDraft').mockImplementation(async () => ({ draft, extraction: { provider: 'synthetic-database-test' } } as any));
  }, 60000);

  beforeEach(async () => {
    draft = {
      distributorName: 'Synthetic Supplier', distributorGstin: '36ABCDE1234F1Z5', distributorDlNo: 'SYNTHETIC',
      invoiceNumber: randomUUID(), invoiceDate: '2026-01-01', goodsReceivedDate: '2026-01-02',
      billType: 'CASH', doctorNameOrRegNo: 'Synthetic Clinic', source: 'OCR',
      grossAmount: 1000, taxableAmount: 1000, totalCgst: 60, totalSgst: 60, totalIgst: 0, totalGst: 120, netPayable: 1120,
      items: [{
        productName: 'Synthetic Cream', manufacturer: 'Synthetic Pharma', packSize: '20g', packUnitType: 'Tube',
        hsnCode: '3004', batchNumber: randomUUID(), expiryMonth: 12, expiryYear: 2099,
        quantityPurchased: 10, freeQuantity: 2, mrp: 150, purchaseRate: 100, discountPercent: 0,
        taxableAmount: 1000, cgstPercent: 6, sgstPercent: 6, igstPercent: 0, gstAmount: 120, lineTotal: 1120, ocrConfidence: 0.99,
      }],
    };
    const buffer = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="60"><text x="10" y="30">Synthetic ${draft.invoiceNumber}</text></svg>`)).png().toBuffer();
    upload = { buffer, size: buffer.length, originalname: 'synthetic-original.png', mimetype: 'image/png' } as Express.Multer.File;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (schemaCreated) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('saves, reviews and commits 20 legacy invoice rows with no manufacturer and retains the original', async () => {
    const sourceDocument = await service.archiveOriginal(upload, branchId, userId);
    draft.sourceDocumentId = sourceDocument.id;
    draft.items = Array.from({ length: 20 }, (_, index) => ({ ...draft.items[0],
      manufacturer: undefined, batchNumber: `OPTIONAL-${randomUUID()}`, serialNumber: index + 1,
    }));
    for (const field of ['grossAmount', 'taxableAmount', 'totalCgst', 'totalSgst', 'totalGst', 'netPayable']) draft[field] *= 20;
    const saved = await service.createDraft(draft, branchId, userId);
    expect(saved.items).toHaveLength(20);
    expect(saved.items.every(item => item.manufacturer === '')).toBe(true);
    expect(await prisma.stockTransaction.count({ where: { branchId } })).toBe(0);

    // Simulate existing drafts from the previous required-manufacturer policy.
    await prisma.pharmacyPurchaseInvoiceItem.updateMany({ where: { purchaseInvoiceId: saved.id },
      data: { ocrFlags: JSON.stringify(['missing_manufacturer']) } });
    await prisma.pharmacyPurchaseInvoice.update({ where: { id: saved.id }, data: {
      status: 'OCR_REVIEW_REQUIRED', unresolvedOcrFlags: 20,
      reconciliationIssues: JSON.stringify(draft.items.flatMap((_: any, index: number) => [
        `AUTO: Line ${index + 1}: manufacturer is required before review`, `AUTO: Line ${index + 1}: missing_manufacturer`,
      ])),
    } });
    const reopened = await service.findOne(saved.id, branchId);
    expect(reopened).toMatchObject({ status: 'DRAFT', unresolvedOcrFlags: 0, reconciliationIssues: [] });
    await service.markReviewed(saved.id, {}, branchId);
    expect(await prisma.stockTransaction.count({ where: { branchId } })).toBe(0);
    const committed = await service.commitStock(saved.id, branchId, userId);
    expect(committed.status).toBe('STOCK_COMMITTED');
    expect(await prisma.stockTransaction.count({ where: { reference: committed.stockCommitReference } })).toBe(20);
    const stock = await prisma.inventoryItem.findMany({ where: { batchNumber: { in: draft.items.map((item: any) => item.batchNumber) } } });
    expect(stock).toHaveLength(20);
    expect(stock.every(item => item.currentStock === 12)).toBe(true);
    const original = await service.getOriginalDocument(sourceDocument.id, branchId);
    expect(original.purchaseInvoiceId).toBe(saved.id);
    expect(Buffer.from(original.data)).toEqual(upload.buffer);
    await service.commitStock(saved.id, branchId, userId);
    expect(await prisma.stockTransaction.count({ where: { reference: committed.stockCommitReference } })).toBe(20);
  });

  it('automatically commits a manufacturer-free product and rejects ambiguous or conflicting product identities', async () => {
    const name = `Manufacturer optional ${randomUUID()}`;
    const product = await service.confirmMasterRecord({ action: 'CREATE_NEW' as any,
      item: { ...draft.items[0], productName: name, manufacturer: undefined },
    }, branchId);
    expect(product.drug.manufacturerName).toBe('');
    draft.items[0].productName = name;
    delete draft.items[0].manufacturer;
    const result = await service.importFromDocument(upload, branchId, userId, '2026-01-02');
    expect(result.automation.status).toBe('STOCK_COMMITTED');

    const second = await prisma.drug.create({ data: { branchId, name, manufacturerName: 'Another Pharma',
      packSizeLabel: '20g', price: 150, composition1: 'Synthetic', category: 'Topical', dosageForm: 'Cream', strength: '1%',
    } });
    draft.invoiceNumber = randomUUID();
    draft.items[0].batchNumber = randomUUID();
    const ambiguous = await service.createDraft(draft, branchId, userId);
    const rejected = await service.processInvoice(ambiguous.id, branchId, userId);
    expect(rejected.automation.status).toBe('SAVED_FOR_REVIEW');
    expect(rejected.automation.issues.join(' ')).toContain('multiple active product master records');
    expect(await prisma.inventoryItem.count({ where: { batchNumber: draft.items[0].batchNumber } })).toBe(0);

    // An explicitly supplied manufacturer must still match, never be ignored.
    draft.invoiceNumber = randomUUID();
    draft.items[0].manufacturer = 'Conflicting Pharma';
    const conflicting = await service.createDraft(draft, branchId, userId);
    expect((await service.processInvoice(conflicting.id, branchId, userId)).automation.status).toBe('SAVED_FOR_REVIEW');
    expect(await prisma.inventoryItem.count({ where: { batchNumber: draft.items[0].batchNumber } })).toBe(0);
    await prisma.drug.delete({ where: { id: second.id } });
  });

  it('persists invoice details and stock once, including duplicate uploads and concurrent retries', async () => {
    const result = await service.importFromDocument(upload, branchId, userId, '2026-01-02');
    expect(result.automation.status).toBe('STOCK_COMMITTED');
    expect(result.invoice.documents).toHaveLength(1);
    const original = await service.getOriginalDocument(result.invoice.documents[0].id, branchId);
    expect(Buffer.from(original.data)).toEqual(upload.buffer);
    expect(original.purchaseInvoiceId).toBe(result.invoice.id);
    expect(JSON.stringify(result.invoice.documents)).not.toContain('data');
    const saved = await prisma.pharmacyPurchaseInvoice.findUniqueOrThrow({ where: { id: result.invoice.id }, include: { items: true } });
    expect(saved.items[0]).toMatchObject({ quantityPurchased: 10, freeQuantity: 2, batchNumber: draft.items[0].batchNumber });
    const ocrCalls = jest.mocked(service.extractDocumentDraft).mock.calls.length;
    expect((await service.importFromDocument(upload, branchId, userId, '2026-01-02')).automation.status).toBe('DUPLICATE');
    expect(jest.mocked(service.extractDocumentDraft).mock.calls.length).toBe(ocrCalls);
    expect(await prisma.pharmacyPurchaseInvoiceDocument.count({ where: { purchaseInvoiceId: saved.id } })).toBe(1);
    await Promise.all([1, 2, 3].map(() => service.processInvoice(saved.id, branchId, userId)));
    expect(await prisma.stockTransaction.count({ where: { reference: result.invoice.stockCommitReference } })).toBe(1);
    expect((await prisma.inventoryItem.findFirstOrThrow({ where: { batchNumber: draft.items[0].batchNumber } })).currentStock).toBe(12);
  });

  it('serializes different invoices for the same batch without losing or duplicating received stock', async () => {
    const first = await service.createDraft(draft, branchId, userId);
    const second = await service.createDraft({ ...draft, invoiceNumber: randomUUID() }, branchId, userId);
    const outcomes = await Promise.all([first, second].map((invoice) => service.processInvoice(invoice.id, branchId, userId)));
    expect(outcomes.map((result) => result.automation.status)).toEqual(['STOCK_COMMITTED', 'STOCK_COMMITTED']);
    const batches = await prisma.inventoryItem.findMany({ where: { batchNumber: draft.items[0].batchNumber } });
    expect(batches).toHaveLength(1);
    expect(batches[0].currentStock).toBe(24);
  });

  it('rolls back review and inventory writes if the stock transaction fails', async () => {
    const result = await service.importFromDocument(upload, branchId, 'missing-synthetic-user', '2026-01-02');
    expect(result.automation.status).toBe('SAVED_FOR_REVIEW');
    const saved = await prisma.pharmacyPurchaseInvoice.findUniqueOrThrow({ where: { id: result.invoice.id } });
    expect(saved.status).toBe('DRAFT');
    expect(saved.stockCommittedAt).toBeNull();
    expect(await prisma.inventoryItem.count({ where: { batchNumber: draft.items[0].batchNumber } })).toBe(0);
  });

  it('retains exact PDF bytes after OCR failure, then links the upload on a corrected manual save', async () => {
    const buffer = Buffer.from('%PDF-1.7\n% synthetic original with all pages preserved\n%%EOF\n');
    const pdf = { buffer, size: buffer.length, mimetype: 'application/pdf', originalname: 'supplier-original.pdf' } as Express.Multer.File;
    jest.mocked(service.extractDocumentDraft).mockRejectedValueOnce(new ServiceUnavailableException('Synthetic OCR failure'));
    let error: any;
    try { await service.importFromDocument(pdf, branchId, userId); } catch (caught) { error = caught; }
    expect(error.getStatus()).toBe(503);
    const source = error.getResponse().sourceDocument;
    expect(source.fileName).toBe('supplier-original.pdf');
    expect(source.data).toBeUndefined();
    expect((await service.listUnlinkedDocuments(branchId)).map((document) => document.id)).toContain(source.id);
    expect(Buffer.from((await service.getOriginalDocument(source.id, branchId)).data)).toEqual(buffer);
    await expect(service.getOriginalDocument(source.id, 'another-branch')).rejects.toThrow('Original invoice document not found');
    const invoice = await service.createDraft({ ...draft, sourceDocumentId: source.id }, branchId, userId);
    expect(invoice.documents[0].id).toBe(source.id);
    expect((await service.listUnlinkedDocuments(branchId)).map((document) => document.id)).not.toContain(source.id);
  });

  it('rolls back invoice writes if the requested original belongs to another invoice or branch', async () => {
    const original = await service.archiveOriginal(upload, branchId, userId);
    const first = await service.createDraft({ ...draft, sourceDocumentId: original.id }, branchId, userId);
    const invoiceNumber = randomUUID();
    await expect(service.createDraft({ ...draft, invoiceNumber, sourceDocumentId: original.id }, branchId, userId)).rejects.toThrow('already linked');
    expect(await prisma.pharmacyPurchaseInvoice.count({ where: { invoiceNumber } })).toBe(0);
    const otherBranch = await prisma.branch.create({ data: { name: 'Synthetic other branch', address: 'Synthetic' } });
    await expect(service.createDraft({ ...draft, sourceDocumentId: original.id }, otherBranch.id, userId)).rejects.toThrow('unavailable');
    expect(await prisma.pharmacyPurchaseInvoice.count({ where: { branchId: otherBranch.id } })).toBe(0);
    expect((await service.getOriginalDocument(original.id, branchId)).purchaseInvoiceId).toBe(first.id);
  });

  it('keeps a second distinct scan of a duplicate invoice without replacing the first or adding stock twice', async () => {
    const first = await service.importFromDocument(upload, branchId, userId, '2026-01-02');
    const alternate = Buffer.concat([upload.buffer, Buffer.from('synthetic second scan')]);
    const duplicate = await service.importFromDocument({ ...upload, buffer: alternate, size: alternate.length }, branchId, userId, '2026-01-02');
    expect(duplicate.automation.status).toBe('DUPLICATE');
    expect(duplicate.invoice.documents).toHaveLength(2);
    expect(Buffer.from((await service.getOriginalDocument(first.sourceDocument.id, branchId)).data)).toEqual(upload.buffer);
    expect(await prisma.stockTransaction.count({ where: { reference: first.invoice.stockCommitReference } })).toBe(1);
  });

  it('rejects disguised executable content before archiving or invoking OCR', async () => {
    const buffer = Buffer.from('<html><script>alert(1)</script></html>');
    const count = await prisma.pharmacyPurchaseInvoiceDocument.count();
    const calls = jest.mocked(service.extractDocumentDraft).mock.calls.length;
    await expect(service.importFromDocument({ buffer, size: buffer.length, mimetype: 'image/jpeg', originalname: 'fake.jpg' } as Express.Multer.File, branchId, userId)).rejects.toThrow('valid photo or PDF');
    expect(await prisma.pharmacyPurchaseInvoiceDocument.count()).toBe(count);
    expect(jest.mocked(service.extractDocumentDraft).mock.calls.length).toBe(calls);
  });

  it('stores exceptions without stock and never processes another branch invoice', async () => {
    draft.items[0].ocrConfidence = 0.97;
    const result = await service.importFromDocument(upload, branchId, userId, '2026-01-02');
    expect(result.automation.status).toBe('SAVED_FOR_REVIEW');
    const saved = await prisma.pharmacyPurchaseInvoice.findUniqueOrThrow({ where: { id: result.invoice.id } });
    expect(saved.reconciliationIssues).toContain('98%');
    expect(await prisma.inventoryItem.count({ where: { batchNumber: draft.items[0].batchNumber } })).toBe(0);
    await expect(service.processInvoice(saved.id, 'another-branch', userId)).rejects.toThrow('Purchase invoice not found');
  });
});
