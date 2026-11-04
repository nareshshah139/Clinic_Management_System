// Synthetic local data only. No clinic database or external OCR calls.
const http = require("node:http");
const fixturePort=Number(process.env.INVENTORY_FIXTURE_PORT||4036);
if(!Number.isInteger(fixturePort)||fixturePort<1||fixturePort>65535)throw new Error('Invalid synthetic fixture port');
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
const baseInvoice = structuredClone(invoice);
const states = new Map();
/** @cc [owner:nareshshah139] isolated-synthetic-invoice-state
 * Each named audit scenario MUST receive its own synthetic invoice state; no clinic database or credentials may be used.
 */
function scenario(key) {
 const invoice=structuredClone(baseInvoice), product={id:'product-1', name:'Moisture Cream',manufacturerName:'Sample maker', packSizeLabel:'50 g',price:200,productKind:'COSMETIC',type:'consumable',category:'Skin care',requiresPrescription:false};
 const config={};
 if(key==='corrections'||key==='multi') {invoice.items[0].ocrFlags=['uncertain_batch','uncertain_expiry','uncertain_quantity_purchased'];invoice.items[0].batchNumber='B-1O2';invoice.items[0].expiryMonth=18;invoice.items[0].quantityPurchased=100;invoice.ocrFlags=['uncertain_total'];invoice.netPayable=14160;invoice.unresolvedOcrFlags=4;}
 if(key==='multi') invoice.items.push({...invoice.items[0],id:'line-2',lineNumber:2,productName:'Second Cream'});
 if(key==='bulk') {invoice.items.push({...invoice.items[0],id:'line-2',lineNumber:2,productName:'Second Cream'},{...invoice.items[0],id:'line-3',lineNumber:3,productName:'Third Cream'});invoice.grossAmount=3600;invoice.taxableAmount=3600;invoice.totalGst=648;invoice.netPayable=4248;}
 if(key==='missing') {invoice.distributorGstin='';invoice.items[0].batchNumber='';invoice.items[0].expiryYear=null;invoice.items[0].ocrFlags=['missing_batch','missing_expiry'];}
 if(key==='catalog') {delete product.category;product.productKind='MEDICINE';product.type='allopathy';config.incomplete=true;}
 if(key==='ambiguous') config.ambiguous=true;
 if(key==='newproduct') config.missingProduct=true;
 if(key==='reviewed') {invoice.status='REVIEWED';invoice.items[0].ocrFlags=[];invoice.unresolvedOcrFlags=0;}
 if(key==='receipt') invoice.workflowReceiptId='receipt-1';
 if(key==='unknown') config.unknownCommit=true;
 if(key==='stale') config.stale=true;
 if(key==='supplier') invoice.distributorGstin='36ABCDE1234F1Z6';
 if(key==='review-only') config.reviewOnly=true;
 return {invoice,product,config,writes:[]};
}
const writes = [];
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${fixturePort}`),
      p = url.pathname;
    const caseKey=String(req.headers['x-audit-case']||'default');
    if(!states.has(caseKey)) states.set(caseKey,scenario(caseKey.split('~')[0]));
    const state=states.get(caseKey); let invoice=state.invoice; const config=state.config;
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
    if (req.method !== 'GET' && !p.startsWith('/audit/')) {const entry={path:p,method:req.method,payload,caseKey};writes.push(entry);state.writes.push(entry);}
    if(p==='/audit/config'){Object.assign(config,payload);if(payload.invoicePatch)Object.assign(invoice,payload.invoicePatch);body=config;}
    else if(p==='/audit/state') body=state;
    else if(p.endsWith('/actions')) body={invoice,metadata:{location:'Shelf A2',futureSaleDiscountPercent:0},permissions:{edit:true,export:true},allowedActions:[],related:[],events:[]};
    else if(p==='/pharmacy/purchase-invoices/suppliers' && req.method==='GET') body=[{id:'supplier-1',name:'Sample Distributors',gstNumber:'36ABCDE1234F1Z5',updatedAt:'2026-11-01T00:00:00Z'}];
    else if(p==='/pharmacy/purchase-invoices/suppliers' && req.method==='POST') body={id:'supplier-new',name:payload.name,gstNumber:payload.gstNumber,updatedAt:new Date().toISOString()};
    else if(p.includes('/suppliers/supplier-1/gstin')) body={id:'supplier-1',name:'Sample Distributors',gstNumber:payload.gstNumber,updatedAt:new Date().toISOString()};
    else if(p==='/inventory/workspace/documents') body={rows:[{id:'receipt-1',reference:'REC-001',supplierGstin:'36ABCDE1234F1Z5',status:'POSTED'}]};
    else if(p.endsWith('/reopen-review')) {invoice.status='DRAFT';invoice.updatedAt=new Date().toISOString();body=invoice;}
    else if(p.includes('/master-records/')) {Object.assign(state.product,payload);config.incomplete=false;if(config.failAfterMasterSave)config.matchesUnavailable=true;body=state.product;}
    else if(p.endsWith('/master-confirmations')) {config.ambiguous=false;config.missingProduct=false;Object.assign(state.product,payload.catalog||{});body={action:payload.action,drug:state.product,linePatch:{...payload.item,productName:state.product.name,masterDrugId:state.product.id},message:'Saved product selected.'};}
    else if(p.endsWith('/master-products')) body=[state.product];
    else if(p==='/pharmacy/purchase-invoices/bill-1' && config.readbackUnavailable){status=503;body={message:'Synthetic readback unavailable'};}
    else if(p.startsWith('/pharmacy/purchase-invoices/drafts') && config.stale){status=409;body={code:'PURCHASE_STALE_REVISION',message:'This invoice changed or is no longer an editable draft. Compare with the saved version before continuing.'};}
    else if(p.endsWith('/master-matches') && config.matchesUnavailable){status=503;body={message:'Synthetic catalogue lookup unavailable'};}
    else if(p.endsWith('/commit-stock') && config.unknownCommit){if(config.commitBeforeFailure){invoice.status='STOCK_COMMITTED';invoice.stockCommittedAt=new Date().toISOString();invoice.stockCommitReference='LOCAL-UNKNOWN';}config.readbackUnavailable=true;status=503;body={message:'Synthetic connection lost after stock request'};}
    else
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
        commit: !config.reviewOnly,
        automate: !config.reviewOnly,
        catalogDetails: true,
        editProduct: true,
        saveSupplier: true, editSupplier: true, reopenReview: true,
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
        stockCommittedAt: null,
        stockCommitReference: null,
        unresolvedOcrFlags: 0,
      };
      body = invoice;
    } else if (p.endsWith("/review")) {
      invoice.status = "REVIEWED";
      body = invoice;
    } else if (p.endsWith("/commit-stock")) {
      invoice.status = "STOCK_COMMITTED";
      invoice.stockCommitReference = "LOCAL-ONLY";
      invoice.stockCommittedAt = new Date().toISOString();
      body = invoice;
    } else if (p.endsWith("/master-matches")) body = {
      matches: payload.items.map((item, lineIndex) => ({
        lineIndex, ocr: item, candidates: config.ambiguous ? [{drug:state.product,score:0.85,confidence:'MEDIUM',reasons:['Similar product name']},{drug:{...state.product,id:'product-2',name:'Moisture Plus Cream'},score:0.82,confidence:'MEDIUM',reasons:['Similar product name']}] : [], recommendedAction: 'REVIEW_MATCHES', matchLabel: config.ambiguous ? 'Possible match' : config.missingProduct ? 'Not in inventory' : 'Same product',
        catalogueResolution: config.ambiguous ? {state:'ambiguous'} : config.missingProduct ? {state:'missing'} : config.incomplete ? {state:'incomplete',product:state.product,missingFields:['composition1','category','dosageForm','strength']} : {state:'ready',product:{...state.product,name:item.productName}},
      })),
    };
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
    state.invoice=invoice;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  })
  .listen(fixturePort, "127.0.0.1", () =>
    console.log(`Synthetic inventory API listening on 127.0.0.1:${fixturePort}`),
  );
