// Synthetic documents only. No customer data, network calls, or database access.
const PDFDocument = require('pdfkit');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
const items = Array.from({ length: 20 }, (_, index) => {
  const serialNumber = index + 1;
  const quantityPurchased = (index % 7) + 2;
  const purchaseRate = money(71.25 + index * 3.17);
  const taxableAmount = money(quantityPurchased * purchaseRate);
  const gstPercent = [5, 12, 18][index % 3];
  const halfGst = money(taxableAmount * gstPercent / 200);
  return {
    serialNumber, productName: `Sample Dermal Cream ${String(index % 16 + 1).padStart(2, '0')}`,
    manufacturer: 'Sample Laboratories', packSize: '50GM', packUnitType: 'Tube', hsnCode: '33049990',
    batchNumber: ['AT-240426', 'SGD0089', 'B51221608WA', 'B43140712HT'][index % 4] + `-${String(serialNumber).padStart(2, '0')}`,
    expiryMonth: (index % 12) + 1, expiryYear: 2028 + (index % 2), quantityPurchased,
    freeQuantity: index % 4 === 0 ? 3 : 0, mrp: money(140 + index * 4.55), oldMrp: money(130 + index * 4.25),
    purchaseRate, discountPercent: 0, specialDiscountPercent: 0, taxableAmount,
    cgstPercent: gstPercent / 2, sgstPercent: gstPercent / 2, igstPercent: 0,
    gstAmount: money(halfGst * 2), lineTotal: money(taxableAmount + halfGst * 2),
  };
});
const sum = (rows, field) => money(rows.reduce((total, row) => total + row[field], 0));
const expectedHeader = {
  distributorName: 'Sample Medical Supplies', distributorGstin: '36ABCDE1234F1Z5',
  distributorDlNo: '20B-TS/HYD/2023-102511', invoiceDate: '2026-09-13', billType: 'CASH',
  taxableAmount: sum(items, 'taxableAmount'), totalCgst: money(sum(items, 'gstAmount') / 2),
  totalSgst: money(sum(items, 'gstAmount') / 2), totalGst: sum(items, 'gstAmount'),
  netPayable: sum(items, 'lineTotal'),
};

async function invoicePdf(invoiceNumber, pageNumbers, rowsPerPage) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, autoFirstPage: false });
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const totalPages = Math.ceil(items.length / rowsPerPage);
  const columns = [
    ['No.', 21], ['Product / Pack', 158], ['Qty', 25], ['Dis Qty', 34], ['HSN', 46],
    ['Exp.', 38], ['Batch', 86], ['OLD MRP', 44], ['MRP', 42], ['Trade rate', 47],
    ['GST %', 35], ['Taxable', 48], ['CGST', 43], ['SGST', 43],
  ];
  const text = (value, x, y, width, size = 7) => doc.font('Helvetica').fontSize(size).fillColor('black')
    .text(String(value), x, y, { width, lineBreak: false });
  for (const pageNumber of pageNumbers) {
    doc.addPage();
    text('SYNTHETIC TEST INVOICE - NO COMMERCIAL VALUE', 20, 17, 780, 9);
    text(expectedHeader.distributorName, 20, 36, 420, 17);
    text('Supplier: 12 Example Road, Hyderabad 500001', 20, 61, 420, 9);
    text(`Supplier GSTIN: ${expectedHeader.distributorGstin}`, 20, 76, 420, 9);
    text(`DL No.: ${expectedHeader.distributorDlNo}`, 20, 91, 420, 9);
    text(`Invoice No.: ${invoiceNumber}`, 490, 36, 325, 11);
    text('Invoice date: 13/09/2026     Bill type: CASH', 490, 56, 325, 10);
    text('Buyer: Sample Pharmacy    GSTIN: 36PQRST5678L1Z2', 490, 76, 325, 9);
    text('Manufacturer for all rows: Sample Laboratories', 490, 91, 325, 9);
    text('Pack: 50GM, stock unit: Tube. Dis Qty = free quantity. Discount: 0%.', 20, 109, 780, 8);
    const rows = items.slice((pageNumber - 1) * rowsPerPage, pageNumber * rowsPerPage);
    let x = 20;
    columns.forEach(([label, width]) => { text(label, x + 2, 137, width - 4, 6.8); x += width; });
    const rowHeight = rowsPerPage === 20 ? 17 : 23;
    const tableBottom = 151 + rows.length * rowHeight;
    let boundary = 20;
    for (const [, width] of columns) {
      doc.moveTo(boundary, 132).lineTo(boundary, tableBottom).lineWidth(0.3).stroke(); boundary += width;
    }
    doc.moveTo(boundary, 132).lineTo(boundary, tableBottom).stroke();
    doc.moveTo(20, 132).lineTo(boundary, 132).stroke();
    for (let index = 0; index <= rows.length; index++) doc.moveTo(20, 151 + index * rowHeight).lineTo(boundary, 151 + index * rowHeight).stroke();
    rows.forEach((row, index) => {
      const values = [row.serialNumber, row.productName, row.quantityPurchased, row.freeQuantity,
        row.hsnCode, `${String(row.expiryMonth).padStart(2, '0')}/${String(row.expiryYear).slice(-2)}`,
        row.batchNumber, row.oldMrp.toFixed(2), row.mrp.toFixed(2), row.purchaseRate.toFixed(2),
        row.cgstPercent * 2, row.taxableAmount.toFixed(2), (row.gstAmount / 2).toFixed(2), (row.gstAmount / 2).toFixed(2)];
      let columnX = 20;
      values.forEach((value, col) => { text(value, columnX + 2, 155 + index * rowHeight, columns[col][1] - 4, 6.8); columnX += columns[col][1]; });
    });
    const footerY = tableBottom + 13;
    if (pageNumber < totalPages) {
      text(`Carried forward taxable amount: ${sum(rows, 'taxableAmount').toFixed(2)}. Continued on next page.`, 20, footerY, 790, 10);
    } else {
      text(`Invoice totals: Taxable ${expectedHeader.taxableAmount.toFixed(2)}    CGST ${expectedHeader.totalCgst.toFixed(2)}    SGST ${expectedHeader.totalSgst.toFixed(2)}    GST ${expectedHeader.totalGst.toFixed(2)}`, 20, footerY, 790, 10);
      text(`Rounding: 0.00    Net payable: ${expectedHeader.netPayable.toFixed(2)}    Total batch rows: 20    Distinct products: 16`, 20, footerY + 17, 790, 10);
    }
    text(`Page ${pageNumber} of ${totalPages}`, 700, 568, 100, 10);
  }
  doc.end();
  return done;
}

async function generateFixtures(directory) {
  await fs.mkdir(directory, { recursive: true });
  const { pdf } = await import('pdf-to-img');
  const densePdf = await invoicePdf('SYN-20-IMAGE', [1], 20);
  await fs.writeFile(path.join(directory, 'dense-20.pdf'), densePdf);
  const rendered = await pdf(densePdf, { scale: 3 });
  const firstPage = await rendered.getPage(1);
  // A sideways photo exercises the same orientation issue as the supplied bills.
  const imageBuffer = await sharp(firstPage).rotate(90).jpeg({ quality: 90 }).toBuffer();
  const definitions = [
    { name: 'dense-20-sideways.jpg', buffer: imageBuffer, mimetype: 'image/jpeg', complete: true,
      expected: { ...expectedHeader, invoiceNumber: 'SYN-20-IMAGE', items } },
    { name: 'two-page-20.pdf', buffer: await invoicePdf('SYN-20-PDF', [1, 2], 10), mimetype: 'application/pdf', complete: true,
      expected: { ...expectedHeader, invoiceNumber: 'SYN-20-PDF', items } },
    { name: 'missing-page-20.pdf', buffer: await invoicePdf('SYN-20-PDF', [2], 10), mimetype: 'application/pdf', complete: false,
      expected: { ...expectedHeader, invoiceNumber: 'SYN-20-PDF', items: items.slice(10) } },
  ];
  const manifest = [];
  for (const { name, buffer, ...fixture } of definitions) {
    const filePath = path.join(directory, name);
    await fs.writeFile(filePath, buffer);
    manifest.push({ ...fixture, path: filePath });
  }
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

module.exports = { generateFixtures };
if (require.main === module) generateFixtures(path.resolve(process.argv[2] || '/tmp/purchase-ocr-20'))
  .then(fixtures => console.log(`Generated ${fixtures.length} synthetic OCR cases`))
  .catch(error => { console.error(error); process.exitCode = 1; });
