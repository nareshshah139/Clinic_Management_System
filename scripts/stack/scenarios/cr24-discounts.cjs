const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");
const { seed, api, tokenFor, browserLogin } = require("./cr31-seed.cjs");

const root = path.resolve(__dirname, "../../..");
const out = process.env.CR24_DISCOUNT_SHOTS || path.join(root, "output/stack/cr24-discounts");
const ROLES = (process.env.ROLES || "pharmacist,doctor,admin").split(",");
const VIEWPORTS = { 1280: { width: 1280, height: 800 }, 390: { width: 390, height: 844 } };
const WIDTHS = (process.env.WIDTHS || "1280,390").split(",");
const GEL = "Clindamycin Gel 1%";
const TABLET = "Cetirizine 10mg Tab";
const CREAM = "Adapalene Gel 15g";
const STALE = "This bill was changed after you opened it. Reload it to see the latest amounts.";
const PEOPLE = ["Asha Kulkarni", "Bhavna Joshi", "Chetan Rane", "Deepa Menon", "Eshan Patil", "Fatima Shaikh", "Gopal Iyer", "Hema Nair"];
const clean = (text) => String(text ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const rupees = (value) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const paise = (value) => Math.round(Number((value * 100).toFixed(6)));
const sequenceOf = (number) => Number(/^PHI-\d{4}-(\d+)$/.exec(number)?.[1] ?? NaN);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "cr24-discounts" });
  let browser;
  let failed = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : ` :: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`}`);
  };
  try {
    console.log(`BOOT base=${stack.base}`);
    const { batches } = await seed(stack);
    const branchId = stack.branch.id;
    const db = stack.db;
    const drugs = {};
    for (const name of [CREAM, GEL, TABLET]) {
      const batch = await db.inventoryItem.update({ where: { id: batches[name].id }, data: { currentStock: 500 } });
      drugs[name] = await db.drug.create({
        data: { branchId, name, price: batch.sellingPrice, manufacturerName: "Lakshmi Pharma", packSizeLabel: "1 pack", inventoryItems: { connect: { id: batch.id } } },
      });
    }
    let person = 0;
    const patient = () => {
      const name = PEOPLE[person % PEOPLE.length] + (person >= PEOPLE.length ? ` ${Math.floor(person / PEOPLE.length) + 1}` : "");
      const phone = `97${String(66500000 + person++).padStart(8, "0")}`;
      return db.patient.create({ data: { branchId, name, gender: "F", phone } });
    };
    const tokens = {};
    const call = async (who, method, url, body) => api(stack, (tokens[who] ??= await tokenFor(stack, who)), method, url, body);
    const invoice = (id) => db.pharmacyInvoice.findUnique({ where: { id }, include: { items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] }, payments: { orderBy: { createdAt: "asc" } } } });
    const stockTotal = async () => (await db.inventoryItem.findMany({ where: { id: { in: Object.values(batches).map((b) => b.id) } } })).reduce((n, i) => n + i.currentStock, 0);

    browser = await chromium.launch();
    const sessions = new Map();
    const open = async (who, viewport, context) => {
      if (!context) {
        context = await browser.newContext({ viewport, ...(sessions.has(who) && { storageState: sessions.get(who) }) });
        await context.addInitScript(() => {
          window.print = () => {};
        });
      }
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      const seen = { errors: [], refused: [], expected: false };
      page.on("pageerror", (e) => seen.errors.push(`pageerror ${e.message.slice(0, 200)}`));
      page.on("console", (m) => m.type() === "error" && !(seen.expected && /status of 409/.test(m.text())) && seen.errors.push(m.text().slice(0, 200)));
      page.on("response", (r) => r.url().includes("/api/") && [401, 403].includes(r.status()) && seen.refused.push(`${r.status()} ${new URL(r.url()).pathname}`));
      if (!sessions.has(who)) {
        await browserLogin(stack, page, who);
        sessions.set(who, await context.storageState());
      }
      return { page, context, seen };
    };
    const go = async (page, route) => {
      await page.goto(`${stack.base}${route}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.locator("main").first().waitFor({ state: "attached", timeout: 240000 });
    };
    const settle = (page) => page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    const overflow = (page) =>
      page.evaluate(() => {
        const main = document.querySelector("main");
        return Math.max(document.scrollingElement.scrollWidth - window.innerWidth, main ? main.scrollWidth - main.clientWidth : 0);
      });
    const shot = async (page, name) => {
      const viewport = page.viewportSize();
      const height = await page.evaluate(() => Math.max(document.querySelector("main")?.scrollHeight ?? 0, document.documentElement.scrollHeight) + 80);
      await page.setViewportSize({ width: viewport.width, height: Math.min(Math.max(height, viewport.height), 12000) });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
      await page.setViewportSize(viewport);
    };
    const line = (page, name) => page.locator("[data-invoice-item]").filter({ has: page.getByRole("heading", { name, level: 4, exact: true }) });
    const fillTax = async (page) => {
      for (const input of await page.locator('input[id^="gst-"]').all()) if (!(await input.inputValue())) await input.fill("12");
    };
    const pickPatient = async (page, who) => {
      await page.getByLabel("Patient *").fill(who.name);
      await page.locator("div.cursor-pointer").filter({ hasText: who.name }).first().dispatchEvent("mousedown");
      await page.waitForFunction((name) => document.querySelector("#billingName")?.value === name, who.name, { timeout: 30000 });
    };
    const addDrug = async (page, name) => {
      await page.getByLabel("Search Drugs").fill(name.split(" ")[0]);
      const result = page.locator('[role="button"]').filter({ has: page.getByRole("heading", { name, level: 4 }) }).first();
      await result.getByRole("button", { name: "Add" }).click();
      await line(page, name).waitFor({ timeout: 30000 });
    };
    const summaryValue = async (page, label) => clean(await page.locator("div.flex.justify-between").filter({ has: page.locator(`span:text-is("${label}")`) }).first().locator("span").last().innerText());
    const setBillDiscount = async (scope, kind, value) => {
      await scope.getByRole("button", { name: kind === "PERCENT" ? "Percent" : "Rupees" }).click();
      await scope.getByLabel("Bill discount", { exact: true }).fill(String(value));
    };
    const newBill = async (page) => {
      await go(page, "/dashboard/pharmacy/sales/bill");
      await page.getByLabel("Patient *").waitFor({ timeout: 120000 });
      await settle(page);
    };
    const saleRow = (page, name) => page.locator('[role="tabpanel"]:visible tbody tr').filter({ hasText: name });
    const toSales = async (page, name) => {
      await go(page, "/dashboard/pharmacy/sales");
      await saleRow(page, name).first().waitFor({ timeout: 120000 });
      return saleRow(page, name).first();
    };

    for (const who of ROLES) {
      for (const width of WIDTHS) {
        const tag = `${who}-${width}`;
        const { page, context, seen } = await open(who, VIEWPORTS[width]);

        const firstPatient = await patient();
        await newBill(page);
        await pickPatient(page, firstPatient);
        await addDrug(page, TABLET);
        await addDrug(page, GEL);
        await line(page, TABLET).getByLabel("Quantity").fill("3");
        await fillTax(page);
        await setBillDiscount(page, "PERCENT", 10);
        const prices = [drugs[TABLET].price, drugs[GEL].price];
        const net = paise(3 * prices[0]) + paise(prices[1]);
        const billDiscount = Math.round(net / 10) / 100;
        check(`${tag} the bill discount shows before tax in the summary`, await summaryValue(page, "Bill discount (10%):"), `-₹${billDiscount.toFixed(2)}`);
        const screenTotal = await summaryValue(page, "Total:");
        check(`${tag} new bill with a bill discount: no page overflow`, await overflow(page), 0);
        await shot(page, `${tag}-01-new-bill-discount`);
        await page.getByRole("button", { name: "Print Preview" }).click();
        const preview = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Confirm Invoice" }) });
        await preview.waitFor();
        const previewHtml = await preview.locator("iframe").first().evaluate((el) => el.srcdoc);
        check(`${tag} the print preview shows the bill discount and no bill number before printing`, [
          previewHtml.includes(`Bill discount (10%):</strong> -₹${billDiscount.toFixed(2)}`), previewHtml.includes("Given when the bill is printed"),
        ], [true, true]);
        await shot(page, `${tag}-02-print-preview-discount`);
        await preview.getByRole("button", { name: "Confirm Invoice" }).click();
        await page.getByRole("button", { name: "Invoice Confirmed" }).waitFor({ timeout: 120000 });
        const sold = await db.pharmacyInvoice.findFirst({ where: { patientId: firstPatient.id }, include: { items: true, payments: true } });
        check(`${tag} the finished bill stores the discount the screen showed`, [
          sold.billDiscountKind, sold.billDiscountValue, sold.billDiscountAmount, `₹${sold.totalAmount.toFixed(2)}`, sold.payments.map((p) => [p.amount, p.status]),
        ], ["PERCENT", 10, billDiscount, screenTotal, [[sold.totalAmount, "COMPLETED"]]]);
        const finishedPreview = await page.getByRole("dialog").locator("iframe").first().evaluate((el) => el.srcdoc);
        check(`${tag} the printed bill carries its number and the bill discount`, [finishedPreview.includes(sold.invoiceNumber), finishedPreview.includes("Bill discount (10%)")], [true, true]);
        await shot(page, `${tag}-03-printed-with-discount`);
        await page.getByRole("button", { name: "Close", exact: true }).first().click();

        const draftPatient = await patient();
        await newBill(page);
        await pickPatient(page, draftPatient);
        await addDrug(page, CREAM);
        await fillTax(page);
        await setBillDiscount(page, "AMOUNT", 5);
        await page.getByRole("button", { name: "Save draft" }).click();
        await page.getByText("All changes saved to the draft").waitFor({ timeout: 60000 });
        await page.waitForURL("**/sales/bill?draft=*", { timeout: 60000 });
        const draft = await db.pharmacyInvoice.findFirst({ where: { patientId: draftPatient.id } });
        check(`${tag} the draft keeps its bill discount and has no bill number`, [draft.billDiscountKind, draft.billDiscountValue, draft.invoiceNumber.startsWith("DRAFT-")], ["AMOUNT", 5, true]);
        const doomedPatient = await patient();
        const doomed = await call(who, "POST", "/pharmacy/invoices", {
          patientId: doomedPatient.id, paymentMethod: "CASH", billingName: doomedPatient.name, billingPhone: doomedPatient.phone,
          items: [{ itemType: "DRUG", drugId: drugs[CREAM].id, quantity: 1, unitPrice: drugs[CREAM].price, discountPercent: 0, taxPercent: 12 }],
        });
        await call(who, "DELETE", `/pharmacy/invoices/${doomed.id}?version=${doomed.mutationVersion}`);
        const draftRow = await toSales(page, draftPatient.name);
        check(`${tag} the draft row says Draft and shows no number`, clean(await draftRow.locator("td").first().innerText()), "Draft");
        await draftRow.getByRole("link", { name: /Open draft bill/ }).click();
        await page.waitForURL(`**/sales/bill?draft=${draft.id}`, { timeout: 120000 });
        await line(page, CREAM).waitFor({ timeout: 120000 });
        check(`${tag} reopening the draft restores its bill discount`, [
          await page.getByLabel("Bill discount", { exact: true }).inputValue(), await page.getByRole("button", { name: "Rupees" }).getAttribute("aria-pressed"),
          await summaryValue(page, "Bill discount:"), await page.getByText("Gets its bill number when finished").count(),
        ], ["5", "true", "-₹5.00", 1]);
        await shot(page, `${tag}-04-draft-discount-restored`);
        await page.getByRole("button", { name: "Print Preview" }).click();
        await page.getByRole("button", { name: "Confirm Invoice" }).click();
        await page.getByRole("button", { name: "Invoice Confirmed" }).waitFor({ timeout: 120000 });
        await page.getByRole("button", { name: "Close", exact: true }).first().click();
        const walkInPatient = await patient();
        const walkIn = await call(who, "POST", "/pharmacy/invoices/checkout", {
          requestKey: `walk-in-${tag}`, patientId: walkInPatient.id, paymentMethod: "UPI", billingName: walkInPatient.name, billingPhone: walkInPatient.phone,
          items: [{ itemType: "DRUG", drugId: drugs[TABLET].id, quantity: 1, unitPrice: drugs[TABLET].price, discountPercent: 0, taxPercent: 12 }],
        });
        const finishedDraft = await invoice(draft.id);
        const numbers = [sold.invoiceNumber, finishedDraft.invoiceNumber, walkIn.invoiceNumber];
        console.log(`  ${tag} numbers ${numbers.join(", ")}`);
        check(`${tag} finished bills are numbered consecutively after a discarded draft`, numbers.map(sequenceOf).map((n) => n - sequenceOf(sold.invoiceNumber)), [0, 1, 2]);

        const salesRow = await toSales(page, firstPatient.name);
        check(`${tag} Sales list with the bill discount: no page overflow`, await overflow(page), 0);
        await salesRow.getByRole("button", { name: `Edit discount on ${sold.invoiceNumber}` }).click();
        await page.waitForURL(`**/sales/bill?bill=${sold.id}&edit=discount`, { timeout: 120000 });
        const dialog = page.getByRole("dialog", { name: `Edit discount on ${sold.invoiceNumber}` });
        await dialog.waitFor({ timeout: 120000 });
        const stockBefore = await stockTotal();
        await setBillDiscount(dialog, "PERCENT", 20);
        await dialog.getByLabel("Reason *").fill("Loyalty discount agreed by the doctor");
        const expectedRefund = clean(await dialog.getByText("Refund due after saving").locator("xpath=following-sibling::*").innerText());
        check(`${tag} edit discount dialog: no page overflow`, await overflow(page), 0);
        await shot(page, `${tag}-05-edit-discount`);
        await dialog.getByRole("button", { name: "Save discount" }).click();
        await dialog.waitFor({ state: "detached", timeout: 60000 });
        const revised = await invoice(sold.id);
        const refund = Math.round((sold.totalAmount - revised.totalAmount) * 100) / 100;
        check(`${tag} the revised bill keeps its number, items and stock and shows the refund due`, [
          revised.invoiceNumber, revised.items.map((i) => i.quantity), revised.billDiscountValue, await stockTotal() - stockBefore, expectedRefund,
          await page.getByRole("button", { name: `Record refund ${rupees(refund)}` }).count(),
        ], [sold.invoiceNumber, sold.items.map((i) => i.quantity), 20, 0, rupees(refund), 1]);
        check(`${tag} the revision names who, why and the old and new totals`, [
          await page.getByText("Loyalty discount agreed by the doctor").count(), await page.getByText(`${rupees(sold.totalAmount)} → ${rupees(revised.totalAmount)}`).count(),
          await db.auditLog.count({ where: { entityId: sold.id, action: "PHARMACY_BILL_DISCOUNT_REVISED" } }),
        ], [1, 1, 1]);
        await shot(page, `${tag}-06-refund-due`);
        await page.getByRole("button", { name: `Record refund ${rupees(refund)}` }).click();
        const refundDialog = page.getByRole("dialog", { name: `Record refund of ${rupees(refund)}` });
        await refundDialog.waitFor();
        await refundDialog.getByRole("button", { name: `Record refund ${rupees(refund)}` }).click();
        await refundDialog.waitFor({ state: "detached", timeout: 60000 });
        await page.getByText("Paid", { exact: true }).first().waitFor({ timeout: 60000 });
        const refunded = await invoice(sold.id);
        check(`${tag} the refund is one REFUNDED ledger entry and the bill is settled`, [
          refunded.payments.map((p) => [p.amount, p.status]), refunded.balanceAmount, refunded.paymentStatus,
        ], [[[sold.totalAmount, "COMPLETED"], [-refund, "REFUNDED"]], 0, "COMPLETED"]);
        const revisedRow = await toSales(page, firstPatient.name);
        check(`${tag} Sales shows the revised amount and the refund`, [
          clean(await revisedRow.locator("td").first().innerText()), clean(await revisedRow.locator("td").nth(-3).innerText()), clean(await revisedRow.locator("td").nth(-2).innerText()),
        ], [`${sold.invoiceNumber} Revised`, rupees(revised.totalAmount), `Refunded ${rupees(refund)} Cash`]);
        await shot(page, `${tag}-07-sales-revised-refunded`);

        await go(page, `/dashboard/pharmacy/sales/bill?bill=${sold.id}`);
        await page.getByRole("button", { name: "Print", exact: true }).click();
        const frame = await (await page.waitForSelector("iframe[data-print-frame]", { state: "attached", timeout: 30000 })).contentFrame();
        await frame.waitForFunction(() => document.body && document.body.innerText.includes("Grand Total"), null, { timeout: 30000 });
        const printed = clean(await frame.evaluate(() => document.body.innerText));
        check(`${tag} the printed bill shows Revised and the revised amounts`, [
          printed.includes("Revised:"), printed.includes("Bill discount (20%)"), printed.includes(`Grand Total: ${rupees(revised.totalAmount)}`), printed.includes(sold.invoiceNumber),
        ], [true, true, true, true]);
        check(`${tag} finished bill view: no page overflow`, await overflow(page), 0);
        await shot(page, `${tag}-08-bill-view`);

        const tabB = await open(who, VIEWPORTS[width], context);
        await go(tabB.page, `/dashboard/pharmacy/sales/bill?bill=${walkIn.id}`);
        await go(page, `/dashboard/pharmacy/sales/bill?bill=${walkIn.id}`);
        for (const tab of [page, tabB.page]) await tab.getByRole("button", { name: "Edit discount" }).click();
        const dialogA = page.getByRole("dialog");
        await setBillDiscount(dialogA, "AMOUNT", 1);
        await dialogA.getByLabel("Reason *").fill("Rounded off");
        await dialogA.getByRole("button", { name: "Save discount" }).click();
        await dialogA.waitFor({ state: "detached", timeout: 60000 });
        tabB.seen.expected = true;
        const dialogB = tabB.page.getByRole("dialog");
        await setBillDiscount(dialogB, "AMOUNT", 2);
        await dialogB.getByLabel("Reason *").fill("Second tab");
        await dialogB.getByRole("button", { name: "Save discount" }).click();
        const stale = dialogB.getByRole("alert");
        await stale.waitFor({ timeout: 60000 });
        check(`${tag} a stale discount edit in a second tab is refused in plain words`, [
          clean(await stale.innerText()).includes(STALE), (await invoice(walkIn.id)).billDiscountValue, (await db.pharmacyInvoiceRevision.count({ where: { invoiceId: walkIn.id } })),
        ], [true, 1, 1]);
        await shot(tabB.page, `${tag}-09-second-tab-refused`);
        await dialogB.getByRole("button", { name: "Reload bill" }).click();
        await tabB.page.getByText("Rounded off").waitFor({ timeout: 60000 });
        check(`${tag} Reload bill shows the other tab's change`, await tabB.page.getByRole("dialog").count(), 0);
        check(`${tag} second tab: no unexpected console error or refused call`, [tabB.seen.errors, tabB.seen.refused], [[], []]);
        await tabB.page.close();

        const reference = `SR-DISC-${tag}`;
        await db.inventoryWorkflowDocument.create({
          data: { branchId, kind: "SALES_RETURN", status: "POSTED", reference, salesInvoiceId: finishedDraft.id, payload: { lines: [] }, requestKey: `return-${tag}`, createdBy: stack.users[who].id },
        });
        await go(page, `/dashboard/pharmacy/sales/bill?bill=${finishedDraft.id}&edit=discount`);
        const returned = page.getByRole("dialog");
        await returned.waitFor({ timeout: 120000 });
        await setBillDiscount(returned, "AMOUNT", 2);
        await returned.getByLabel("Reason *").fill("After the return");
        seen.expected = true;
        await returned.getByRole("button", { name: "Save discount" }).click();
        const refusal = returned.getByRole("alert");
        await refusal.waitFor({ timeout: 60000 });
        check(`${tag} a discount edit on a returned bill is refused with the reason`, [
          clean(await refusal.innerText()).includes(`This bill has a sales return (${reference}), so its discount can no longer be changed.`), (await invoice(finishedDraft.id)).billDiscountValue,
        ], [true, 5]);
        check(`${tag} returned-bill refusal: no page overflow`, await overflow(page), 0);
        await shot(page, `${tag}-10-returned-refused`);
        seen.expected = false;
        check(`${tag} no unexpected console error or refused call`, [seen.errors, seen.refused], [[], []]);
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    await stack.stop();
  }
  console.log(failed ? `CR24 DISCOUNTS FAIL ${failed}` : "CR24 DISCOUNTS PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("CR24 DISCOUNTS FAIL", e);
  process.exit(1);
});
