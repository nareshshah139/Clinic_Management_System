// Review probe: items 1 (GST/MRP on match), 4 (expiry field), 5 (blank bill + API commit of incomplete draft).
const path = require("node:path");
const fs = require("node:fs");
const WT = "/home/user/wt/purchase";
const { chromium } = require(require.resolve("playwright", { paths: [WT] }));
const { bootStack } = require(path.join(WT, "scripts/stack/boot.cjs"));
const { seed } = require(path.join(WT, "scripts/ux/journeys/seed.cjs"));
const OUT = __dirname + "/shots";
fs.mkdirSync(OUT, { recursive: true });
const ITEM = "Tretinoin Cream 0.025% 20g";
const log = (...a) => console.log(...a);

async function login(page, base, user) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(async ({ e, p }) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: e, password: p }) })).status, { e: user.email, p: user.password });
    if (s === 201) return;
    await page.waitForTimeout(10000);
  }
  throw Error("login failed");
}
const api = (page, method, url, body) => page.evaluate(async ({ method, url, body }) => {
  const r = await fetch(`/api${url}`, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
}, { method, url, body });

async function openManual(page, base) {
  await page.goto(`${base}/dashboard/inventory?area=purchases&view=intake`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Enter bill by hand" }).waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: "Enter bill by hand" }).click();
  await page.locator("#saved-purchase-supplier").waitFor({ timeout: 60000 });
}

(async () => {
  const stack = await bootStack({ label: "review-purchase-probe" });
  const browser = await chromium.launch();
  try {
    await seed(stack);
    // Catalogue disagrees with the bill: GST 18 on the stocked item, price 200 on the drug.
    const drug = await stack.db.drug.findFirst({ where: { name: ITEM } });
    await stack.db.drug.update({ where: { id: drug.id }, data: { price: 200 } });
    await stack.db.inventoryItem.updateMany({ where: { drugs: { some: { id: drug.id } } }, data: { gstRate: 18 } });
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
    const page = await ctx.newPage();
    await login(page, stack.base, stack.users.pharmacist);
    const line = (k) => page.locator(`[id$="-${k}"]`).first();

    // ---------- Item 5 (UI): blank bill ----------
    await openManual(page, stack.base);
    const commitBtn = page.getByRole("button", { name: "Confirm reviewed values & add stock" });
    log("ITEM5 blank: commit disabled =", await commitBtn.isDisabled(), "guidance present =", await page.locator("#purchase-posting-guidance").count(),
      "aria-describedby target exists =", await page.locator("#purchase-posting-guidance").count() > 0);
    await page.screenshot({ path: `${OUT}/blank.png`, fullPage: true });
    // Type only GSTIN, batch, qty (no name/invoice/product): are checks still hidden?
    await page.locator("#distributor-gstin").fill("27AAACA5678B1ZQ");
    await line("batch").fill("X1");
    log("ITEM5 typed GSTIN+batch only: guidance count =", await page.locator("#purchase-posting-guidance").count(), "checks nav =", await page.getByRole("navigation", { name: "Invoice checks" }).count(), "commit disabled =", await commitBtn.isDisabled());

    // ---------- Item 4: expiry field ----------
    const exp = line("expiry-month");
    log("ITEM4 default expiry shown:", await exp.inputValue());
    for (const v of ["10/28", "1/2028", "13/2028", "2028-10", "01/2020", "Oct 2028", "", "10/2028"]) {
      await exp.fill(v);
      await page.waitForTimeout(300);
      log(`ITEM4 "${v}" -> shown="${await exp.inputValue()}" aria-invalid=${await exp.getAttribute("aria-invalid")} class-red=${/border-red/.test(await exp.getAttribute("class") || "")} commitDisabled=${await commitBtn.isDisabled()}`);
    }
    // typed character by character
    await exp.fill("");
    await exp.pressSequentially("10/2028", { delay: 40 });
    log("ITEM4 pressSequentially 10/2028 ->", await exp.inputValue());

    // ---------- Item 1: bill GST 12% (6+6), MRP 165, catalogue GST 18, price 200 ----------
    await openManual(page, stack.base);
    let draftBody = null;
    page.on("request", (r) => { if (/purchase-invoices\/drafts$/.test(r.url()) && r.method() === "POST") draftBody = r.postData(); });
    await page.locator("#saved-purchase-supplier").selectOption({ label: "Apex Medico Agencies — 27AAACA5678B1ZQ" });
    await page.locator("#invoice-number").fill("REV/1");
    await line("product").fill(ITEM);
    await line("mrp").fill("165");
    await line("cgst").fill("6");
    await line("sgst").fill("6");
    log("ITEM1 before match: cgst/sgst/mrp =", await line("cgst").inputValue(), await line("sgst").inputValue(), await line("mrp").inputValue());
    const match = page.getByRole("button", { name: "Confirm Match" });
    await match.waitFor({ timeout: 60000 });
    await match.click();
    await page.getByText(`Matched ${ITEM}`).first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(500);
    log("ITEM1 after match: cgst/sgst/mrp/unit/pack =", await line("cgst").inputValue(), await line("sgst").inputValue(), await line("mrp").inputValue(), await line("unit").inputValue(), await line("pack-size").inputValue());
    const told = await page.getByText(/GST/).allInnerTexts();
    log("ITEM1 any text mentioning GST change:", told.filter((t) => /18|9%|catalog|saved item/i.test(t)).slice(0, 5));
    await page.screenshot({ path: `${OUT}/after-match.png`, fullPage: true });
    await line("batch").fill("TR2611");
    await line("expiry-month").fill("10/2028");
    await line("qty").fill("20");
    await line("rate").fill("92");
    await commitBtn.waitFor();
    for (let i = 0; i < 60 && (await commitBtn.isDisabled()); i++) await page.waitForTimeout(1000);
    log("ITEM1 posting guidance before commit:", await page.locator("#purchase-posting-guidance").innerText().catch(() => "-"));
    await page.screenshot({ path: `${OUT}/ready.png`, fullPage: true });
    await commitBtn.click();
    await page.getByText(/Stock added for REV\/1/).first().waitFor({ timeout: 90000 });
    await page.screenshot({ path: `${OUT}/added.png`, fullPage: true });
    const list = await api(page, "GET", "/pharmacy/purchase-invoices?limit=50");
    const inv = list.body.data.find((b) => b.invoiceNumber === "REV/1");
    const saved = (await api(page, "GET", `/pharmacy/purchase-invoices/${inv.id}`)).body;
    const it = saved.items[0];
    log("ITEM1 committed line:", JSON.stringify({ status: saved.status, cgst: it.cgstPercent, sgst: it.sgstPercent, igst: it.igstPercent, mrp: it.mrp, taxable: it.taxableAmount, gstAmt: it.gstAmount ?? it.taxAmount, unit: it.packUnitType, pack: it.packSize, hsn: it.hsnCode }));
    log("ITEM1 invoice totals:", JSON.stringify(Object.fromEntries(Object.entries(saved).filter(([k]) => /total|gst|tax|amount/i.test(k)))));
    const batches = await stack.db.inventoryItem.findMany({ where: { drugs: { some: { id: drug.id } } }, select: { batchNumber: true, gstRate: true, mrp: true, unit: true, packSize: true, packUnit: true, currentStock: true } });
    log("ITEM1 batches:", JSON.stringify(batches));
    if (draftBody) fs.writeFileSync(__dirname + "/draft-body.json", draftBody);

    // ---------- Item 5 (API): incomplete draft, then review and commit directly ----------
    const body = JSON.parse(draftBody || "null");
    if (body) {
      body.invoiceNumber = "REV/2";
      if (body.idempotencyKey) body.idempotencyKey = undefined;
      if (body.requestId) body.requestId = undefined;
      body.items = body.items.map((x) => ({ ...x, packUnitType: "", hsnCode: "", batchNumber: "TR2612" }));
      const created = await api(page, "POST", "/pharmacy/purchase-invoices/drafts", body);
      log("ITEM5 API create incomplete draft:", created.status, JSON.stringify(created.body)?.slice(0, 300));
      const id = created.body?.id || created.body?.invoice?.id;
      if (id) {
        const rev = await api(page, "PATCH", `/pharmacy/purchase-invoices/${id}/review`, { goodsReceivedDate: new Date().toISOString().slice(0, 10) });
        log("ITEM5 API review incomplete:", rev.status, JSON.stringify(rev.body)?.slice(0, 300));
        const com = await api(page, "POST", `/pharmacy/purchase-invoices/${id}/commit-stock`, {});
        log("ITEM5 API commit incomplete:", com.status, JSON.stringify(com.body)?.slice(0, 300));
      }
    }
  } catch (e) {
    console.error("PROBE ERROR", e);
  } finally {
    await browser.close().catch(() => {});
    await stack.stop();
  }
})();
