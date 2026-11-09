export function gstFixturePrisma() {
  return {
    pharmacyPurchaseInvoice: {
      findMany: async () => [
        {
          id: 'purchase-1', invoiceNumber: 'SUP/88', invoiceDate: new Date('2026-11-03T00:00:00.000Z'), status: 'STOCK_COMMITTED',
          distributorName: 'Apex Pharma', distributorGstin: '29ABCDE1234F1Z5', taxableAmount: 1250, totalGst: 99, netPayable: 1349,
          items: [
            { id: 'pl-1', lineNumber: 1, productName: 'Adapalene Gel', batchNumber: 'AD1', packUnitType: 'Tube', packSize: '15 g', quantityPurchased: 10, freeQuantity: 1, mrp: 120, purchaseRate: 90, discountPercent: 0, schemeAmount: 0, taxableAmount: 900, cgstPercent: 6, sgstPercent: 6, igstPercent: 0, gstAmount: 108, lineTotal: 1008 },
            { id: 'pl-2', lineNumber: 2, productName: 'Zinc Tabs', batchNumber: 'ZN1', packUnitType: 'Strip', packSize: '10 tabs', quantityPurchased: 5, freeQuantity: 0, mrp: 80, purchaseRate: 70, discountPercent: 0, schemeAmount: 0, taxableAmount: 350.35, cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 0, gstAmount: 17.52, lineTotal: 367.87 },
          ],
        },
        {
          id: 'purchase-2', invoiceNumber: 'KA-771', invoiceDate: new Date('2026-11-04T00:00:00.000Z'), status: 'STOCK_COMMITTED',
          distributorName: 'Interstate Distributors', distributorGstin: '27ZZZZZ9999Z1Z1', taxableAmount: 500, totalGst: 90, netPayable: 590,
          items: [
            { id: 'pl-3', lineNumber: 1, productName: 'Sunscreen SPF 50', batchNumber: 'SS1', packUnitType: 'Bottle', packSize: '50 ml', quantityPurchased: 2, freeQuantity: 0, mrp: 590, purchaseRate: 250, discountPercent: 0, schemeAmount: 0, taxableAmount: 500, cgstPercent: 0, sgstPercent: 0, igstPercent: 18, gstAmount: 90, lineTotal: 590 },
          ],
        },
      ],
    },
    pharmacyInvoice: {
      findMany: async () => [
        {
          id: 'sale-1', invoiceNumber: 'PHI-2026-536', invoiceDate: new Date('2026-11-05T04:30:00.000Z'), status: 'CONFIRMED', totalAmount: 425.6, taxAmount: 45.6,
          items: [
            { id: 'sl-1', quantity: 2, unitPrice: 110, taxPercent: 12, taxAmount: 26.4, totalAmount: 246.4 },
            { id: 'sl-2', quantity: 1, unitPrice: 160, taxPercent: 12, taxAmount: 19.2, totalAmount: 179.2 },
          ],
        },
        {
          id: 'sale-2', invoiceNumber: 'PHI-2026-537', invoiceDate: new Date('2026-11-05T10:00:00.000Z'), status: 'DISPENSED', totalAmount: 696.15, taxAmount: 106.15,
          items: [
            { id: 'sl-3', quantity: 1, unitPrice: 560, taxPercent: 18, taxAmount: 100.8, totalAmount: 660.8 },
            { id: 'sl-4', quantity: 1, unitPrice: 30, taxPercent: 5, taxAmount: 1.5, totalAmount: 31.5 },
            { id: 'sl-5', quantity: 1, unitPrice: 3.65, taxPercent: 0, taxAmount: 0, totalAmount: 3.65 },
          ],
        },
      ],
    },
    inventoryWorkflowDocument: {
      findMany: async () => [
        { id: 'wf-1', kind: 'COUNTER_SALE', status: 'POSTED', reference: 'CS-11', supplierGstin: null, payload: { date: '2026-11-06', lines: [{ name: 'Calamine', batchNumber: 'CL1', unit: 'BOTTLES', quantity: 2, unitPrice: 85, discountPercent: 0, schemeAmount: 0, gstRate: 12, taxable: 170, tax: 20.4, total: 190.4 }] } },
        { id: 'wf-2', kind: 'SALES_RETURN', status: 'POSTED', reference: 'SR-2', supplierGstin: null, payload: { date: '2026-11-06', lines: [{ name: 'Adapalene', batchNumber: 'AD1', unit: 'TUBES', quantity: 1, unitPrice: 110, discountPercent: 0, schemeAmount: 0, gstRate: 12, taxable: 110, tax: 13.2, total: 123.2 }] } },
        { id: 'wf-3', kind: 'SUPPLIER_RETURN', status: 'POSTED', reference: 'RET-9', supplierGstin: '29ABCDE1234F1Z5', payload: { date: '2026-11-07', lines: [{ name: 'Zinc Tabs', batchNumber: 'ZN1', unit: 'STRIPS', quantity: 1, unitPrice: 70, discountPercent: 0, schemeAmount: 0, gstRate: 5, taxable: 70, tax: 3.5, total: 73.5 }] } },
        { id: 'wf-4', kind: 'COUNTER_SALE', status: 'POSTED', reference: 'CS-OUT', supplierGstin: null, payload: { date: '2026-12-02', lines: [{ name: 'Outside range', batchNumber: 'X', unit: 'STRIPS', quantity: 1, unitPrice: 10, discountPercent: 0, schemeAmount: 0, gstRate: 12, taxable: 10, tax: 1.2, total: 11.2 }] } },
      ],
    },
  };
}
