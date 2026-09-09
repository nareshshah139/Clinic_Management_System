import { RequestContextService } from '../../../shared/context/request-context.service';
import sharp from 'sharp';
import { PrismaService } from '../../../shared/database/prisma.service';
import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';

// Opt in explicitly: this invokes the configured, OAuth-authenticated Codex model.
// No mocked fetch, model, database, or service. This extraction stage needs no DB.
const live = process.env.RUN_CODEX_LIVE_TESTS === '1' ? describe : describe.skip;
live('Purchase invoice real Codex OAuth extraction', () => {
  it('reads invoice pixels and returns the actual quantities, batch and totals', async () => {
    const prisma = new PrismaService(new RequestContextService());
    const service = new PharmacyPurchaseInvoiceService(prisma);
    const lines = [
      'SYNTHETIC TEST PURCHASE INVOICE',
      'Distributor: Sample Medical Supplies',
      'Invoice No: LIVE-7392     Invoice Date: 2026-09-05     Bill Type: CASH',
      'Product: Sample Cream     Manufacturer: Example Pharma',
      'Pack: 1 tube of 20g     HSN: 3004',
      'Batch: B7392     Expiry: 12/2028',
      'Quantity purchased: 10     Free quantity: 2',
      'Purchase rate per tube: 100.00     MRP per tube: 150.00',
      'Taxable amount: 1000.00',
      'CGST 6%: 60.00     SGST 6%: 60.00     Total GST: 120.00',
      'Net payable: 1120.00',
    ];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="850"><rect width="100%" height="100%" fill="white"/>${lines.map((line, i) => `<text x="40" y="${65 + i * 65}" font-family="Arial" font-size="28" fill="black">${line}</text>`).join('')}</svg>`;
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    try {
      const result = await service.extractDocumentDraft({
        buffer, size: buffer.length, originalname: 'synthetic-invoice.png', mimetype: 'image/png',
      } as Express.Multer.File, 'live-test-no-database');
      expect(result.extraction.provider).toBe('codex-oauth');
      expect(result.extraction.model).toBe(process.env.PHARMACY_PURCHASE_OCR_CODEX_MODEL || 'gpt-6-astra');
      expect(result.extraction.reasoningEffort).toBe('medium');
      expect(result.draft.invoiceNumber).toBe('LIVE-7392');
      expect(result.draft.netPayable).toBe(1120);
      expect(result.draft.items).toHaveLength(1);
      expect(result.draft.items[0]).toMatchObject({
        productName: 'Sample Cream', batchNumber: 'B7392',
        quantityPurchased: 10, freeQuantity: 2, purchaseRate: 100,
        expiryMonth: 12, expiryYear: 2028,
      });
    } finally {
      await prisma.$disconnect();
    }
  }, 180000);
});
