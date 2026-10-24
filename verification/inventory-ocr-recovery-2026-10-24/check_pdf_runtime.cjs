// Runs against the built backend with the real PDF decoder; never calls an OCR provider.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const req = createRequire(path.join(root, 'backend/package.json'));
const PDFDocument = req('pdfkit');
const { PharmacyPurchaseInvoiceService } = req('./dist/modules/pharmacy/pharmacy-purchase-invoice.service.js');
async function make(pages) {
  const doc = new PDFDocument({ autoFirstPage: false }), chunks = [];
  const complete = new Promise((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
  });
  for (let i=0; i<pages; i++) doc.addPage().text(`Synthetic invoice page ${i+1}`);
  doc.end(); const buffer = await complete;
  return { buffer, size: buffer.length, mimetype: 'application/pdf', originalname: `${pages}-pages.pdf` };
}
(async () => {
  process.env.PHARMACY_PURCHASE_OCR_MAX_PAGES = '5';
  const service = new PharmacyPurchaseInvoiceService({});
  const two = await service.buildOcrImageDataUrls(await make(2));
  assert.equal(two.pageCount, 2); assert.equal(two.imageDataUrls.length, 2);
  const six = await make(6);
  await assert.rejects(() => service.buildOcrImageDataUrls(six), error =>
    error.getResponse?.().code === 'PURCHASE_OCR_PAGE_LIMIT' && error.getResponse().pageCount === 6);
  const result = { status: 'PASS', decoder: 'real pdf-to-img', supportedPages: 2, includedPages: two.imageDataUrls.length,
    rejectedPages: 6, limit: 5, externalOcrCalls: 0 };
  fs.writeFileSync(path.join(__dirname, 'pdf-runtime-results.json'), JSON.stringify(result, null, 2)+'\n');
  console.log(JSON.stringify(result));
})().catch(error => { console.error(error); process.exitCode = 1; });
