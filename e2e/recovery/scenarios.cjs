const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
async function visible(page, text) {
  await page.waitForFunction(
    (t) => document.body.innerText.includes(t),
    { timeout: 30000 },
    text,
  );
}
async function click(page, text) {
  await page.waitForFunction(
    (t) =>
      Array.from(document.querySelectorAll("button")).some(
        (b) => b.textContent.trim() === t && !b.disabled,
      ),
    { timeout: 30000 },
    text,
  );
  const handle = await page.evaluateHandle(
    (t) =>
      Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === t && !b.disabled,
      ),
    text,
  );
  const button = handle.asElement();
  assert(button, `Missing enabled action ${text}`);
  await button.scrollIntoView();
  await button.click();
  await handle.dispose();
}
async function fill(page, selector, value) {
  await page.waitForSelector(selector);
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(selector, String(value));
}
async function until(read, predicate) {
  for (let i = 0; i < 100; i++) {
    const v = await read();
    if (predicate(v)) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Persisted state did not converge");
}
const item = (f, name, stock, batch = "E2E") =>
  f.db.inventoryItem.create({
    data: {
      branchId: f.branch.id,
      name,
      batchNumber: batch,
      currentStock: stock,
      costPrice: 1,
      sellingPrice: 2,
      mrp: 2,
      type: "MEDICINE",
      unit: "PIECES",
      status: "ACTIVE",
    },
  });
const current = (f, id) => f.db.inventoryItem.findUnique({ where: { id } });
const movementCount = (f, id) =>
  f.db.stockTransaction.count({ where: { itemId: id } });
async function navigate(f, url) {
  await f.page.goto(f.base + url, { waitUntil: "networkidle0" });
}
/**
 * @cc [owner:nareshshah139,label:testing] production-recovery-evidence
 * Recovery screenshots MUST follow real browser actions and literal PostgreSQL assertions. Stock API reports MUST identify their evidence category.
 */
exports.partner = async (f, s) => {
  const a = await item(f, "Recovery partner medicine", 5, "PARTNER-A");
  const b = await item(f, "Recovery partner medicine", 5, "PARTNER-B");
  await f.db.inventoryItem.update({
    where: { id: b.id },
    data: { heldStock: 1 },
  });
  const partner = await f.db.partnerOrganization.create({
    data: { branchId: f.branch.id, name: "Recovery partner" },
  });
  const created = await f.call("POST", "/pharmacy/partner-sales", {
    partnerOrganizationId: partner.id,
    date: new Date().toISOString().slice(0, 10),
    items: [
      {
        medicineName: a.name,
        batchNumber: a.batchNumber,
        quantitySold: 7,
        mrp: 2,
        discountGiven: 0,
        paymentMode: "CASH",
      },
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const sale = await f.db.partnerDailySale.findFirstOrThrow({
    where: { partnerOrganizationId: partner.id },
    include: { items: true },
  });
  await navigate(f, "/dashboard/pharmacy");
  await click(f.page, "Commit");
  const partial = await until(
    () =>
      f.db.partnerDailySale.findUnique({
        where: { id: sale.id },
        include: { items: true },
      }),
    (x) => x.items[0].committedQuantity === 5,
  );
  f.check(
    s,
    "Initial real commit leaves two outstanding",
    {
      sold: partial.items[0].quantitySold,
      committed: partial.items[0].committedQuantity,
      stock: (await current(f, a.id)).currentStock,
      movements: await movementCount(f, a.id),
    },
    { sold: 7, committed: 5, stock: 0, movements: 1 },
  );
  await visible(f.page, "Retry outstanding");
  await click(f.page, "Resolve outstanding");
  await f.capture(s, "partial");
  await click(f.page, "Search batches");
  await f.page.waitForSelector(
    `select[id="partner-batch-${sale.items[0].id}"]`,
  );
  await f.page.select(`select[id="partner-batch-${sale.items[0].id}"]`, b.id);
  await fill(
    f.page,
    `[id="partner-reason-${sale.items[0].id}"]`,
    "Confirmed actual batch for remaining two units",
  );
  await click(f.page, "Save match");
  const matched = await until(
    () =>
      f.db.partnerDailySaleItem.findUnique({ where: { id: sale.items[0].id } }),
    (x) => x.recoveryInventoryItemId === b.id,
  );
  f.check(
    s,
    "Matching preserves sold snapshot and stock",
    {
      sold: matched.quantitySold,
      batch: matched.batchNumber,
      stock: (await current(f, b.id)).currentStock,
    },
    { sold: 7, batch: "PARTNER-A", stock: 5 },
  );
  const matchAudit = await f.db.auditLog.findFirstOrThrow({
    where: { entityId: sale.items[0].id, action: "PARTNER_SALE_LINE_MATCHED" },
  });
  const matchValues = JSON.parse(matchAudit.newValues);
  f.check(
    s,
    "Explicit match retains actor and reason",
    {
      actor: matchAudit.userId,
      batch: matchValues.recoveryInventoryItemId,
      reason: matchValues.reason,
    },
    {
      actor: f.user.id,
      batch: b.id,
      reason: "Confirmed actual batch for remaining two units",
    },
  );
  await f.capture(s, "matched");
  const staleBefore = await f.call(
    "POST",
    `/pharmacy/partner-sales/${sale.id}/commit-stock`,
    { expectedVersion: partial.version },
  );
  assert.equal(staleBefore.status, 409);
  f.check(
    s,
    "Stale revision before completion preserves remaining stock",
    (await current(f, b.id)).currentStock,
    5,
  );
  await click(f.page, "Retry outstanding");
  await until(
    () => current(f, b.id),
    (x) => x.currentStock === 3,
  );
  const done = await f.db.partnerDailySale.findUnique({
    where: { id: sale.id },
    include: { items: true },
  });
  f.check(
    s,
    "Only outstanding units deducted",
    {
      committed: done.items[0].committedQuantity,
      stock: (await current(f, b.id)).currentStock,
      held: (await current(f, b.id)).heldStock,
      movements: await movementCount(f, b.id),
    },
    { committed: 7, stock: 3, held: 1, movements: 1 },
  );
  const stale = await f.call(
    "POST",
    `/pharmacy/partner-sales/${sale.id}/commit-stock`,
    { expectedVersion: partial.version },
  );
  assert.equal(stale.status, 201);
  f.check(
    s,
    "Completed-sale replay cannot deduct stock",
    (await current(f, b.id)).currentStock,
    3,
  );
  await visible(f.page, "Committed");
  await f.capture(s, "recovered");
};
exports.supplier = async (f, s) => {
  const gstin = "36ABCDE1234F1Z5";
  const invoice = (invoiceNumber) =>
    f.db.pharmacyPurchaseInvoice.create({
      data: {
        branchId: f.branch.id,
        distributorName: "Recovery Supplier",
        distributorGstin: gstin,
        distributorDlNo: "Synthetic",
        invoiceNumber,
        invoiceDate: new Date("2026-10-01"),
        billType: "CREDIT",
        doctorNameOrRegNo: "Synthetic",
        status: "STOCK_COMMITTED",
        stockCommittedAt: new Date("2026-10-01"),
        grossAmount: 100,
        taxableAmount: 100,
        totalGst: 0,
        netPayable: 100,
      },
    });
  const a = await invoice("RECOVERY-A"),
    b = await invoice("RECOVERY-B");
  const key = f.randomUUID();
  const paid = await f.call("POST", "/pharmacy/purchase-ledger/payments", {
    requestKey: key,
    distributorGstin: gstin,
    distributorName: "Recovery Supplier",
    paymentDate: "2026-10-01",
    mode: "NEFT",
    amount: 100,
    allocations: [{ purchaseInvoiceId: a.id, amount: 100 }],
  });
  assert.equal(paid.status, 201, JSON.stringify(paid.body));
  const payment = await f.db.pharmacyPurchasePayment.findFirstOrThrow({
    where: { requestKey: key },
  });
  const balances = async () => {
    const r = await f.call(
      "GET",
      `/pharmacy/purchase-ledger/distributors/${gstin}`,
    );
    assert.equal(r.status, 200);
    return r.body.invoices
      .sort((x, y) => x.invoiceNumber.localeCompare(y.invoiceNumber))
      .map((x) => x.outstanding);
  };
  f.check(s, "Original payment balances", await balances(), [0, 100]);
  await navigate(
    f,
    `/dashboard/inventory?area=purchases&view=ledger&gstin=${gstin}`,
  );
  await click(f.page, "Reallocate payment");
  await fill(f.page, `[id="payment-allocation-${a.id}"]`, "0");
  await fill(f.page, `[id="payment-allocation-${b.id}"]`, "100");
  await fill(
    f.page,
    "#payment-correction-reason",
    "Payment belongs to invoice B",
  );
  await f.capture(s, "reallocation");
  await click(f.page, "Confirm reallocation");
  await visible(f.page, "Payment reallocated");
  const replacement = await f.db.pharmacyPurchasePayment.findFirstOrThrow({
    where: { replacesPaymentId: payment.id },
  });
  f.check(
    s,
    "Reallocation preserves amount and original allocation",
    {
      balances: await balances(),
      amount: replacement.amount,
      replacements: await f.db.pharmacyPurchasePayment.count({
        where: { replacesPaymentId: payment.id },
      }),
      originalAllocations: await f.db.pharmacyPurchasePaymentAllocation.count({
        where: { paymentId: payment.id },
      }),
      audits: await f.db.auditLog.count({
        where: { entityId: payment.id, action: "SUPPLIER_PAYMENT_REALLOCATED" },
      }),
    },
    {
      balances: [100, 0],
      amount: 100,
      replacements: 1,
      originalAllocations: 1,
      audits: 1,
    },
  );
  const immutableOriginal = await f.db.pharmacyPurchasePayment.findUnique({
    where: { id: payment.id },
    include: { allocations: true },
  });
  const replacementDetails = await f.db.pharmacyPurchasePayment.findUnique({
    where: { id: replacement.id },
    include: { allocations: true },
  });
  f.check(
    s,
    "Exact original and replacement allocations",
    {
      originalReversed: Boolean(immutableOriginal.reversedAt),
      originalAllocations: immutableOriginal.allocations.map((x) => ({
        invoice: x.purchaseInvoiceId,
        amount: x.amount,
      })),
      replaces: replacementDetails.replacesPaymentId,
      replacementAllocations: replacementDetails.allocations.map((x) => ({
        invoice: x.purchaseInvoiceId,
        amount: x.amount,
      })),
    },
    {
      originalReversed: true,
      originalAllocations: [{ invoice: a.id, amount: 100 }],
      replaces: payment.id,
      replacementAllocations: [{ invoice: b.id, amount: 100 }],
    },
  );
  await f.capture(s, "reallocated");
  await click(f.page, "Reverse payment");
  await fill(
    f.page,
    "#payment-correction-reason",
    "Incorrect payment recorded",
  );
  const fault = f.drop(
    `/pharmacy/purchase-ledger/payments/${replacement.id}/reverse`,
    (p) => p.reason === "Incorrect payment recorded",
    async () => {
      assert(
        (
          await f.db.pharmacyPurchasePayment.findUnique({
            where: { id: replacement.id },
          })
        ).reversedAt,
      );
    },
  );
  await click(f.page, "Confirm reversal");
  await fault.done;
  await visible(f.page, "Reference:");
  await f.capture(s, "reversal-unconfirmed");
  await click(f.page, "Confirm reversal");
  await visible(f.page, "Payment reversed");
  const replay = await f.call("POST", fault.path, fault.payload, {
    "Idempotency-Key": f.randomUUID(),
  });
  assert.equal(replay.status, 201);
  f.check(
    s,
    "Lost-response reversal is applied once",
    {
      balances: await balances(),
      allocations: await f.db.pharmacyPurchasePaymentAllocation.count({
        where: { paymentId: replacement.id },
      }),
      audits: await f.db.auditLog.count({
        where: {
          entityId: replacement.id,
          action: "SUPPLIER_PAYMENT_REVERSED",
        },
      }),
    },
    { balances: [100, 100], allocations: 1, audits: 1 },
  );
  f.check(
    s,
    "Reversal retains both immutable allocation records",
    await f.db.pharmacyPurchasePaymentAllocation.findMany({
      where: { paymentId: { in: [payment.id, replacement.id] } },
      select: { paymentId: true, purchaseInvoiceId: true, amount: true },
      orderBy: { paymentId: "asc" },
    }),
    [
      { paymentId: payment.id, purchaseInvoiceId: a.id, amount: 100 },
      { paymentId: replacement.id, purchaseInvoiceId: b.id, amount: 100 },
    ].sort((a, b) => a.paymentId.localeCompare(b.paymentId)),
  );
  await f.capture(s, "reversed");
};
exports.opening = async (f, s) => {
  const XLSX = f.req("xlsx");
  const workbook = (rows, name) => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Stock");
    const data = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
    const file = path.join(f.output, name);
    fs.writeFileSync(file, data);
    return { file, data };
  };
  const upload = async (file) => {
    await f.page.waitForSelector("input[type=file]");
    await (await f.page.$("input[type=file]")).uploadFile(file);
    await click(f.page, "Preview import");
    await click(f.page, "Confirm opening import");
  };
  const book = workbook(
    [
      ["Drug name", "Current stock", "Batch number"],
      ["Opening successful row", 10, "OPEN-A"],
      ["Opening retry row", 20, "OPEN-B"],
    ],
    "opening.xlsx",
  );
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION recovery_fail_success() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."sourceRow"=3 AND NEW.status='SUCCEEDED' THEN RAISE EXCEPTION 'Synthetic durable row marker failure'; END IF; RETURN NEW; END $$`,
  );
  await f.db.$executeRawUnsafe(
    "CREATE TRIGGER recovery_fail_success BEFORE UPDATE ON inventory_migration_rows FOR EACH ROW EXECUTE FUNCTION recovery_fail_success()",
  );
  await navigate(f, "/dashboard/inventory?area=stock&view=opening");
  await upload(book.file);
  await visible(f.page, "Retry failed rows");
  const migration = await f.db.inventoryMigration.findFirstOrThrow({
    where: { branchId: f.branch.id, fileName: "opening.xlsx" },
  });
  const otherBranch = await f.db.branch.create({
    data: { name: "Isolated other branch", address: "Synthetic" },
  });
  const otherImport = await f.db.inventoryMigration.create({
    data: {
      branchId: otherBranch.id,
      createdBy: f.user.id,
      fileName: "other.xlsx",
      sha256: "other-branch",
      data: book.data,
      rowTrackingVersion: 0,
      result: {},
    },
  });
  const foreign = await f.call("GET", `/inventory/imports/${otherImport.id}`);
  f.check(
    s,
    "Authenticated branch cannot read another import",
    foreign.status,
    404,
  );
  const rows = () =>
    f.db.inventoryMigrationRow.findMany({
      where: { importId: migration.id },
      orderBy: { sourceRow: "asc" },
    });
  const successfulItem = await f.db.inventoryItem.findFirstOrThrow({
    where: { name: "Opening successful row" },
  });
  const successfulReceipts = await movementCount(f, successfulItem.id);
  const initial = await rows();
  f.check(
    s,
    "Durable failure rolls back only failed row",
    {
      statuses: initial.map((r) => r.status),
      retryable: initial[1].retryable,
      successfulStock: (
        await f.db.inventoryItem.findFirst({
          where: { name: "Opening successful row" },
        })
      ).currentStock,
      failedDrugs: await f.db.drug.count({
        where: { name: "Opening retry row" },
      }),
      failedItems: await f.db.inventoryItem.count({
        where: { name: "Opening retry row" },
      }),
    },
    {
      statuses: ["SUCCEEDED", "FAILED"],
      retryable: true,
      successfulStock: 10,
      failedDrugs: 0,
      failedItems: 0,
    },
  );
  await f.capture(s, "failed-row");
  await f.db.$executeRawUnsafe(
    "DROP TRIGGER recovery_fail_success ON inventory_migration_rows",
  );
  await f.db.$executeRawUnsafe("DROP FUNCTION recovery_fail_success()");
  const before = await f.db.stockTransaction.count();
  const fault = f.drop(
    `/inventory/imports/${migration.id}/retry-failed-rows`,
    () => true,
    async () => assert((await rows()).every((r) => r.status === "SUCCEEDED")),
  );
  await click(f.page, "Retry failed rows");
  await fault.done;
  await visible(f.page, "Check import outcome");
  await visible(f.page, "Reference:");
  await f.capture(s, "retry-unconfirmed");
  await click(f.page, "Check import outcome");
  await until(rows, (x) => x.every((r) => r.status === "SUCCEEDED"));
  const recovered = await f.call("GET", `/inventory/imports/${migration.id}`);
  f.check(
    s,
    "Outcome lookup acknowledges exactly one retry effect",
    {
      created: recovered.body.created,
      retryableRows: recovered.body.retryableRows,
      stock: (
        await f.db.inventoryItem.findFirst({
          where: { name: "Opening retry row" },
        })
      ).currentStock,
      newMovements: (await f.db.stockTransaction.count()) - before,
    },
    { created: 2, retryableRows: 0, stock: 20, newMovements: 1 },
  );
  const repeat = await f.call(
    "POST",
    `/inventory/imports/${migration.id}/retry-failed-rows`,
    undefined,
    { "Idempotency-Key": f.randomUUID() },
  );
  assert.equal(repeat.status, 201);
  const successfulAfter = await f.db.inventoryItem.findFirstOrThrow({
    where: { name: "Opening successful row" },
  });
  f.check(
    s,
    "Successful row and completed retry preserve original effects",
    {
      id: successfulAfter.id,
      stock: successfulAfter.currentStock,
      receipts: await movementCount(f, successfulAfter.id),
      newMovements: (await f.db.stockTransaction.count()) - before,
    },
    {
      id: successfulItem.id,
      stock: 10,
      receipts: successfulReceipts,
      newMovements: 1,
    },
  );
  await f.capture(s, "recovered");
  const legacy = workbook(
    [
      ["Drug name", "Current stock"],
      ["Legacy uncertain row", 30],
    ],
    "legacy-opening.xlsx",
  );
  const legacyImport = await f.db.inventoryMigration.create({
    data: {
      branchId: f.branch.id,
      createdBy: f.user.id,
      fileName: "legacy-opening.xlsx",
      sha256: createHash("sha256").update(legacy.data).digest("hex"),
      data: legacy.data,
      rowTrackingVersion: 0,
      result: {},
    },
  });
  await navigate(f, "/dashboard/inventory?area=stock&view=opening");
  await upload(legacy.file);
  await visible(f.page, "Reconcile this import");
  const retry = await f.call(
    "POST",
    `/inventory/imports/${legacyImport.id}/retry-failed-rows`,
  );
  assert.equal(retry.status, 201);
  f.check(
    s,
    "Ambiguous legacy rows remain unapplied",
    {
      reconciliationRequired: retry.body.reconciliationRequired,
      items: await f.db.inventoryItem.count({
        where: { name: "Legacy uncertain row" },
      }),
    },
    { reconciliationRequired: 1, items: 0 },
  );
  await f.capture(s, "legacy-reconciliation");
};
/**
 * @cc [owner:nareshshah139,label:testing] stock-location-recovery-evidence
 * Direct and bulk location checks MUST compare authenticated HTTP receipts with persisted locations, defaults, balances, and replay identity; changed-location retries MUST conflict without stock effects.
 */
exports.stock = async (f, s) => {
  const stock = await item(f, "API recovery stock", 100);
  const quantity = async () => (await current(f, stock.id)).currentStock;
  const report = async (title) => {
    const escape = (value) =>
      String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    const summary = (actual) => {
      if (typeof actual === "number") return `Verified quantity: ${actual}`;
      if (Array.isArray(actual))
        return `${actual.length} exact records matched`;
      if (actual && typeof actual === "object") {
        const facts = Object.entries(actual).flatMap(([key, value]) => {
          const label = key.replace(/([a-z])([A-Z])/g, "$1 $2");
          if (typeof value === "number" || typeof value === "boolean")
            return [`${label}: ${value}`];
          if (key === "status") return [`status: ${value}`];
          if (Array.isArray(value))
            return [`${label}: ${value.length} verified records`];
          return [];
        });
        if (facts.length) return facts.join(" · ");
      }
      return "Exact expected and actual values matched";
    };
    const cards = s.assertions
      .map(
        (assertion) => `
      <section class="result">
        <span class="pass">PASS</span>
        <h2>${escape(assertion.label)}</h2>
        <p class="facts">${escape(summary(assertion.actual))}</p>
        <details><summary>Expected / actual details</summary>
          <pre>${escape(JSON.stringify({ expected: assertion.expected, actual: assertion.actual }, null, 2))}</pre>
        </details>
      </section>`,
      )
      .join("");
    await f.page.setContent(`<!doctype html>
      <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        *{box-sizing:border-box}body{font:16px/1.5 system-ui;margin:0;padding:32px;background:#f1f5f9;color:#0f172a}
        article{max-width:920px;margin:auto}.eyebrow{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#475569}
        h1{font-size:32px;line-height:1.15;margin:10px 0 14px}header p{margin:8px 0;color:#475569}.scope{max-width:720px}
        .results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:24px}
        .result{border:1px solid #cbd5e1;border-radius:12px;background:#fff;padding:18px}
        .pass{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.04em;padding:3px 8px;border-radius:6px;background:#dcfce7;color:#166534}
        h2{font-size:17px;line-height:1.35;margin:10px 0}.facts{font-size:15px;font-weight:600;margin:8px 0 14px}
        details{border-top:1px solid #e2e8f0;padding-top:10px}summary{cursor:pointer;color:#475569;font-size:13px}
        pre{font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:12px 0 0}
        @media(max-width:600px){body{padding:20px 16px}h1{font-size:27px}.results{grid-template-columns:1fr;gap:12px}.result{padding:16px}}
      </style></head><body><article>
        <header><div class="eyebrow">API acceptance evidence</div>
          <h1>Stock recovery · ${escape(title)}</h1>
          <p>HTTP → production controller → PostgreSQL</p>
          <p class="scope">${s.assertions.length} verified assertions. The shelf component is not mounted in production navigation.</p>
        </header><div class="results">${cards}</div>
      </article></body></html>`);
  };
  const post = (route, payload) =>
    f.call("POST", route, payload, { "Idempotency-Key": f.randomUUID() });
  const direct = {
    operationId: f.randomUUID(),
    itemId: stock.id,
    adjustmentQuantity: 2,
    reason: "Recovery physical count",
  };
  const fault = f.drop(
    "/inventory/adjustments",
    (p) => p.operationId === direct.operationId,
    async () => assert.equal(await quantity(), 102),
  );
  const lost = await post("/inventory/adjustments", direct);
  await fault.done;
  assert.equal(lost.status, 0);
  const firstReceipt = await f.db.stockTransaction.findFirstOrThrow({
    where: { operationId: direct.operationId, itemId: stock.id },
  });
  const directAgain = await post("/inventory/adjustments", direct);
  assert.equal(directAgain.status, 201);
  f.check(
    s,
    "Direct replay returns original receipt",
    directAgain.body.id,
    firstReceipt.id,
  );
  const changedDirect = await post("/inventory/adjustments", {
    ...direct,
    adjustmentQuantity: 3,
  });
  assert.equal(changedDirect.status, 409);

  f.check(
    s,
    "Lost direct response replays one receipt",
    { stock: await quantity(), movements: await movementCount(f, stock.id) },
    { stock: 102, movements: 1 },
  );
  const operationId = f.randomUUID();
  const rows = [
    {
      rowId: "small-sale",
      itemId: stock.id,
      type: "SALE",
      quantity: 2,
      unitPrice: 2,
    },
    {
      rowId: "large-sale",
      itemId: stock.id,
      type: "SALE",
      quantity: 1000,
      unitPrice: 2,
    },
  ];
  const bulk = await post("/inventory/transactions/bulk", {
    operationId,
    transactions: rows,
  });
  assert.equal(bulk.status, 201, JSON.stringify(bulk.body));
  f.check(
    s,
    "Partial bulk commits only available row",
    {
      stock: await quantity(),
      success: bulk.body.successful,
      failed: bulk.body.failed,
      movements: await movementCount(f, stock.id),
    },
    { stock: 100, success: 1, failed: 1, movements: 2 },
  );
  await report("partial result");
  await f.capture(s, "partial");
  await navigate(f, "/dashboard/inventory?area=stock&view=opening");
  const replenish = await post("/inventory/transactions", {
    operationId: f.randomUUID(),
    itemId: stock.id,
    type: "PURCHASE",
    quantity: 2000,
    unitPrice: 1,
  });
  assert.equal(replenish.status, 201);
  f.check(s, "Replenishment", await quantity(), 2100);
  const subset = await post("/inventory/transactions/bulk", {
    operationId,
    transactions: [rows[1]],
  });
  assert.equal(subset.status, 201);
  f.check(s, "Failed-row subset retry", await quantity(), 1100);
  const reorder = await post("/inventory/transactions/bulk", {
    operationId,
    transactions: [rows[1], rows[0]],
  });
  assert.equal(reorder.status, 201);
  f.check(
    s,
    "Reordered full replay returns existing receipts",
    { stock: await quantity(), movements: await movementCount(f, stock.id) },
    { stock: 1100, movements: 4 },
  );
  const changed = await post("/inventory/transactions/bulk", {
    operationId,
    transactions: [{ ...rows[1], quantity: 1 }],
  });
  assert.equal(changed.status, 409);
  const duplicates = await post("/inventory/transactions/bulk", {
    operationId: f.randomUUID(),
    transactions: [rows[0], rows[0]],
  });
  assert.equal(duplicates.status, 400);
  const outcome = await f.call("GET", `/inventory/operations/${operationId}`);
  assert.equal(outcome.status, 200);
  const expectedReceipts = [
    {
      rowId: "small-sale",
      id: bulk.body.results[0].data.id,
      status: "COMPLETED",
    },
    {
      rowId: "large-sale",
      id: subset.body.results[0].data.id,
      status: "COMPLETED",
    },
  ].sort((a, b) => a.rowId.localeCompare(b.rowId));
  f.check(
    s,
    "Reordered replay returns exact original row receipts",
    reorder.body.results
      .map((x) => ({ rowId: x.rowId, id: x.data.id, status: x.status }))
      .sort((a, b) => a.rowId.localeCompare(b.rowId)),
    expectedReceipts,
  );
  f.check(
    s,
    "Operation lookup returns complete exact row receipts",
    {
      status: outcome.body.status,
      rows: outcome.body.rows
        .map((x) => ({ rowId: x.rowId, id: x.data.id, status: x.status }))
        .sort((a, b) => a.rowId.localeCompare(b.rowId)),
    },
    { status: "COMPLETED", rows: expectedReceipts },
  );

  f.check(
    s,
    "Conflicts and duplicate row IDs leave stock unchanged",
    { stock: await quantity(), movements: await movementCount(f, stock.id) },
    { stock: 1100, movements: 4 },
  );
  const locationStock = await item(f, "Location recovery stock", 50);
  await f.db.inventoryItem.update({
    where: { id: locationStock.id },
    data: { storageLocation: "Default shelf" },
  });
  const movement = {
    operationId: f.randomUUID(),
    itemId: locationStock.id,
    type: "SALE",
    quantity: 5,
    unitPrice: 2,
    location: "Dispensing counter",
  };
  const directMovement = await post("/inventory/transactions", movement);
  assert.equal(directMovement.status, 201);
  const savedDirect = await f.db.stockTransaction.findUniqueOrThrow({
    where: { id: directMovement.body.id },
  });
  f.check(
    s,
    "Direct movement retains explicit location",
    {
      responseLocation: directMovement.body.location,
      savedLocation: savedDirect.location,
      stock: (await current(f, locationStock.id)).currentStock,
      movements: await movementCount(f, locationStock.id),
    },
    {
      responseLocation: "Dispensing counter",
      savedLocation: "Dispensing counter",
      stock: 45,
      movements: 1,
    },
  );

  const directReplay = await post("/inventory/transactions", movement);
  const changedLocation = await post("/inventory/transactions", {
    ...movement,
    location: "Other counter",
  });
  const retainedDirect = await f.db.stockTransaction.findUniqueOrThrow({
    where: { id: savedDirect.id },
  });
  f.check(
    s,
    "Direct location replay retains receipt and rejects a changed location",
    {
      replayStatus: directReplay.status,
      receipt: directReplay.body.id,
      responseLocation: directReplay.body.location,
      savedLocation: retainedDirect.location,
      changedStatus: changedLocation.status,
      stock: (await current(f, locationStock.id)).currentStock,
      movements: await movementCount(f, locationStock.id),
    },
    {
      replayStatus: 201,
      receipt: savedDirect.id,
      responseLocation: "Dispensing counter",
      savedLocation: "Dispensing counter",
      changedStatus: 409,
      stock: 45,
      movements: 1,
    },
  );

  const defaultMovement = await post("/inventory/transactions", {
    operationId: f.randomUUID(),
    itemId: locationStock.id,
    type: "PURCHASE",
    quantity: 1,
    unitPrice: 2,
  });
  assert.equal(defaultMovement.status, 201);
  const savedDefault = await f.db.stockTransaction.findUniqueOrThrow({
    where: { id: defaultMovement.body.id },
  });
  f.check(
    s,
    "Direct omitted location uses batch storage location",
    {
      responseLocation: defaultMovement.body.location,
      savedLocation: savedDefault.location,
      stock: (await current(f, locationStock.id)).currentStock,
    },
    {
      responseLocation: "Default shelf",
      savedLocation: "Default shelf",
      stock: 46,
    },
  );

  const locationOperationId = f.randomUUID();
  const locationRows = [
    {
      rowId: "explicit-location",
      itemId: locationStock.id,
      type: "SALE",
      quantity: 3,
      unitPrice: 2,
      location: "Dispatch counter",
    },
    {
      rowId: "default-location",
      itemId: locationStock.id,
      type: "SALE",
      quantity: 4,
      unitPrice: 2,
    },
  ];
  const locationBulk = await post("/inventory/transactions/bulk", {
    operationId: locationOperationId,
    transactions: locationRows,
  });
  assert.equal(locationBulk.status, 201);
  assert.equal(locationBulk.body.failed, 0);
  const savedLocations = await f.db.stockTransaction.findMany({
    where: { operationId: locationOperationId },
    orderBy: { operationRowId: "asc" },
  });
  f.check(
    s,
    "Bulk movements retain explicit and default locations",
    {
      responseLocations: locationBulk.body.results.map(
        (row) => row.data.location,
      ),
      savedLocations: savedLocations.map((row) => row.location),
      stock: (await current(f, locationStock.id)).currentStock,
      movements: await movementCount(f, locationStock.id),
    },
    {
      responseLocations: ["Dispatch counter", "Default shelf"],
      savedLocations: ["Default shelf", "Dispatch counter"],
      stock: 39,
      movements: 4,
    },
  );

  const bulkLocationReplay = await post("/inventory/transactions/bulk", {
    operationId: locationOperationId,
    transactions: [locationRows[1], locationRows[0]],
  });
  const changedBulkLocation = await post("/inventory/transactions/bulk", {
    operationId: locationOperationId,
    transactions: [{ ...locationRows[0], location: "Other counter" }],
  });
  assert.equal(bulkLocationReplay.status, 201);
  const retainedLocations = await f.db.stockTransaction.findMany({
    where: { operationId: locationOperationId },
    orderBy: { operationRowId: "asc" },
  });
  f.check(
    s,
    "Bulk location replay retains receipts and rejects a changed location",
    {
      receipts: bulkLocationReplay.body.results.map((row) => ({
        id: row.data.id,
        location: row.data.location,
      })),
      savedReceipts: retainedLocations.map((row) => ({
        id: row.id,
        location: row.location,
      })),
      changedStatus: changedBulkLocation.status,
      stock: (await current(f, locationStock.id)).currentStock,
      movements: await movementCount(f, locationStock.id),
    },
    {
      receipts: [
        { id: locationBulk.body.results[1].data.id, location: "Default shelf" },
        {
          id: locationBulk.body.results[0].data.id,
          location: "Dispatch counter",
        },
      ],
      savedReceipts: [
        { id: locationBulk.body.results[1].data.id, location: "Default shelf" },
        {
          id: locationBulk.body.results[0].data.id,
          location: "Dispatch counter",
        },
      ],
      changedStatus: 409,
      stock: 39,
      movements: 4,
    },
  );
  await report("recovered result");
  await f.capture(s, "recovered");
};
