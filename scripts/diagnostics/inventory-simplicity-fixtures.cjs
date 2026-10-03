// Synthetic local data only. No clinic database or external OCR calls.
const http = require("node:http");
const user = {
  id: "test-owner",
  firstName: "Test",
  lastName: "Owner",
  role: "OWNER",
  branchId: "local-test",
  isActive: true,
};
const row = {
  id: "batch-1",
  name: "Moisture Cream",
  productName: "Moisture Cream",
  type: "MEDICINE",
  batchNumber: "B-102",
  expiryDate: "2028-08-31T23:59:59.999Z",
  unit: "TUBES",
  currentStock: 12,
  heldStock: 2,
  available: 10,
  sellingPrice: 180,
  costPrice: 120,
  mrp: 200,
  packLabel: "50 g",
  packSize: 50,
  packUnit: "G",
  storageLocation: "Shelf A2",
  status: "ACTIVE",
  updatedAt: "2026-10-01T00:00:00.000Z",
  metadata: {},
  issues: [],
  drugs: [],
  baseQuantity: 600,
  baseFactor: 50,
  priceBasis: "Per tube",
  margin: 40,
};
const line = {
  id: "line-1",
  lineNumber: 1,
  productName: "Moisture Cream",
  manufacturer: "Sample maker",
  packSize: "50 g",
  packUnitType: "Tube",
  hsnCode: "3304",
  batchNumber: "B-102",
  expiryMonth: 8,
  expiryYear: 2028,
  quantityPurchased: 10,
  freeQuantity: 2,
  mrp: 200,
  purchaseRate: 120,
  cgstPercent: 9,
  sgstPercent: 9,
  igstPercent: 0,
  taxableAmount: 1200,
  gstAmount: 216,
  lineTotal: 1416,
  ocrFlags: ["uncertain_batch"],
  ocrConfidence: 0.95,
};
let invoice = {
  id: "bill-1",
  updatedAt: "2026-10-01T00:00:00.000Z",
  distributorName: "Sample Distributors",
  distributorGstin: "36ABCDE1234F1Z5",
  distributorDlNo: "DL-TEST-42",
  invoiceNumber: "TEST-001",
  invoiceDate: "2026-10-01",
  goodsReceivedDate: "2026-10-01",
  billType: "CASH",
  status: "OCR_REVIEW_REQUIRED",
  grossAmount: 1200,
  taxableAmount: 1200,
  totalGst: 216,
  netPayable: 1416,
  unresolvedOcrFlags: 1,
  reconciliationIssues: [],
  items: [line],
  documents: [],
};
const writes = [];
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:4026"),
      p = url.pathname;
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let payload;
    try {
      payload = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : {};
    } catch {
      payload = {};
    }
    let body = [];
    let status = 200;
    if (req.method !== "GET") writes.push({ path: p, method: req.method });
    if (p === "/auth/me" || p.startsWith("/users/")) body = user;
    else if (p === "/inventory/workspace/capabilities")
      body = {
        itemWrite: true,
        itemCreate: true,
        kinds: {
          COUNT: { read: true, write: true },
          CORRECTION: { read: true, write: true },
        },
      };
    else if (p === "/inventory/workspace/stock")
      body = {
        rows: [
          row,
          {
            ...row,
            id: "batch-2",
            batchNumber: "B-OLD",
            currentStock: 0,
            heldStock: 0,
            available: 0,
          },
        ],
        total: 2,
        page: 1,
        totalPages: 1,
        facets: {},
        quality: {},
      };
    else if (p === "/inventory/workspace/stock/batch-1") {
      if (req.method === "PATCH") {
        Object.assign(row, payload, { updatedAt: new Date().toISOString() });
        body = row;
      } else
        body = {
          item: row,
          batches: [row],
          movements: [],
          purchases: [invoice],
          history: [],
          holds: [],
          identityBasis: "Same product and pack",
          openingBalance: 12,
        };
    } else if (p === "/pharmacy/purchase-invoices/capabilities")
      body = {
        read: true,
        create: true,
        review: true,
        commit: true,
        automate: true,
        catalogDetails: true,
        editProduct: true,
        saveSupplier: true,
        sourceHighlights: false,
      };
    else if (p === "/pharmacy/purchase-invoices")
      body = { data: [invoice], pagination: { total: 1, page: 1, pages: 1 } };
    else if (p === "/pharmacy/purchase-invoices/bill-1") body = invoice;
    else if (p.includes("/ocr/extract"))
      body = {
        draft: invoice,
        sourceDocument: {
          id: "original",
          fileName: "test-bill.svg",
          mimeType: "image/svg+xml",
          sizeBytes: 900,
        },
        extraction: { includedPageCount: 1, pageCount: 1, flags: [] },
      };
    else if (p.startsWith("/pharmacy/purchase-invoices/drafts")) {
      invoice = {
        ...invoice,
        ...payload,
        id: "bill-1",
        status: "DRAFT",
        unresolvedOcrFlags: 0,
      };
      body = invoice;
    } else if (p.endsWith("/review")) {
      invoice.status = "REVIEWED";
      body = invoice;
    } else if (p.endsWith("/commit-stock")) {
      invoice.status = "STOCK_COMMITTED";
      invoice.stockCommitReference = "LOCAL-ONLY";
      body = invoice;
    } else if (p.endsWith("/master-matches")) body = { matches: [] };
    else if (p.includes("/actions"))
      body = { permissions: {}, related: [], events: [] };
    else if (p === "/drugs/inventory-change-requests")
      body = { data: [], summary: { submitted: 1 } };
    else if (p === "/inventory/workspace/overview")
      body = {
        lowStock: 1,
        expiring: 0,
        unlinked: 0,
        purchases: [{ status: "OCR_REVIEW_REQUIRED", _count: 1 }],
        pendingEdits: 0,
        asOf: new Date().toISOString(),
      };
    else if (p === "/test-writes") body = writes;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  })
  .listen(4026, "127.0.0.1", () =>
    console.log("Synthetic inventory API listening on 127.0.0.1:4026"),
  );
