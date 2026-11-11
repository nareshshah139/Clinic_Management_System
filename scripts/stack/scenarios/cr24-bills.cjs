const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");
const { seed, api, tokenFor, browserLogin } = require("./cr31-seed.cjs");

const root = path.resolve(__dirname, "../../..");
const out = process.env.CR24_BILL_SHOTS || path.join(root, "output/stack/cr24-bills");
const ROLES = (process.env.ROLES || "pharmacist,doctor,admin").split(",");
const VIEWPORTS = { 1280: { width: 1280, height: 800 }, 390: { width: 390, height: 844 } };
const WIDTHS = (process.env.WIDTHS || "1280,390").split(",");
const CREAM = "Adapalene Gel 15g";
const GEL = "Clindamycin Gel 1%";
const TABLET = "Cetirizine 10mg Tab";
const STALE = "This draft was changed after you opened it. Reload it to see the latest version.";
const FINISHED = "This bill was already finished. It can no longer be edited.";
const PEOPLE = ["Meera Shah", "Kiran Bhatt", "Rohan Kulkarni", "Lata Iyer", "Farhan Qureshi", "Divya Nair", "Suresh Pillai", "Anjali Rao", "Vikram Sethi", "Pooja Menon", "Arjun Das", "Nisha Gupta"];
const clean = (text) => String(text ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "cr24-bills" });
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
    const U = stack.users;
    for (const name of [CREAM, GEL, TABLET]) {
      const batch = await db.inventoryItem.update({ where: { id: batches[name].id }, data: { currentStock: 500 } });
      await db.drug.create({
        data: { branchId, name, price: batch.sellingPrice, manufacturerName: "Lakshmi Pharma", packSizeLabel: "1 pack", inventoryItems: { connect: { id: batch.id } } },
      });
    }
    const stockOf = async (name) => (await db.inventoryItem.findUnique({ where: { id: batches[name].id } })).currentStock;
    const stocks = async () => ({ [CREAM]: await stockOf(CREAM), [GEL]: await stockOf(GEL), [TABLET]: await stockOf(TABLET) });
    const delta = (before, after) => Object.fromEntries(Object.keys(before).map((k) => [k, after[k] - before[k]]));
    let person = 0;
    const patient = () => {
      const name = PEOPLE[person % PEOPLE.length] + (person >= PEOPLE.length ? ` ${Math.floor(person / PEOPLE.length) + 1}` : "");
      const phone = `98${String(76500000 + person++).padStart(8, "0")}`;
      return db.patient.create({ data: { branchId, name, gender: "F", phone } });
    };
    const prescription = async (forPatient) => {
      const visit = await db.visit.create({ data: { patientId: forPatient.id, doctorId: U.doctor.id, complaints: "Acne on cheeks" } });
      return db.prescription.create({
        data: {
          visitId: visit.id, status: "ACTIVE",
          items: JSON.stringify([
            { drugName: CREAM, quantity: 1, frequency: "ONCE_DAILY", duration: 30, durationUnit: "DAYS", instructions: "Apply at night" },
            { drugName: GEL, quantity: 1, frequency: "TWICE_DAILY", duration: 14, durationUnit: "DAYS" },
          ]),
        },
      });
    };
    const tokens = {};
    const call = async (who, method, url, body) => api(stack, (tokens[who] ??= await tokenFor(stack, who)), method, url, body);

    browser = await chromium.launch();
    const sessions = new Map();
    const open = async (who, viewport, context) => {
      context ??= await browser.newContext({ viewport, ...(sessions.has(who) && { storageState: sessions.get(who) }) });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      const seen = { errors: [], refused: [], expected: false };
      page.on("pageerror", (e) => seen.errors.push(`pageerror ${e.message.slice(0, 2000)}`));
      page.on("console", (m) => m.type() === "error" && !(seen.expected && /status of 409/.test(m.text())) && seen.errors.push(m.text().slice(0, 2000)));
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
    const clickTo = async (page, target, url) => {
      for (let attempt = 0; ; attempt++) {
        await settle(page);
        await target.click();
        try {
          return await page.waitForURL(url, { timeout: attempt < 2 ? 60000 : 240000 });
        } catch (error) {
          if (attempt >= 2) throw error;
          console.log(`  retrying a click that did not navigate to ${url}`);
        }
      }
    };
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
    const offenders = (page) =>
      page.evaluate(() =>
        [...document.querySelectorAll("main *")]
          .filter((el) => el.getClientRects().length && el.getBoundingClientRect().right > window.innerWidth + 0.5)
          .slice(-6)
          .map((el) => `${el.tagName}.${String(el.className).slice(0, 80)} right=${Math.round(el.getBoundingClientRect().right)} text=${(el.innerText || "").slice(0, 40)}`),
      );
    const line = (page, name) => page.locator("[data-invoice-item]").filter({ has: page.getByRole("heading", { name, level: 4, exact: true }) });
    const lineHeadings = async (page) => (await page.locator("[data-invoice-item] h4").allInnerTexts()).map(clean);
    const quantities = async (page) => page.locator("[data-invoice-item]").evaluateAll((items) => items.map((item) => item.querySelector('input[id^="quantity-"]').value));
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
    const finish = async (page) => {
      await fillTax(page);
      await page.getByRole("button", { name: "Print Preview" }).click();
      await page.getByRole("button", { name: "Confirm Invoice" }).click();
      await page.getByRole("button", { name: "Invoice Confirmed" }).waitFor({ timeout: 120000 });
    };
    const closePreview = (page) => page.getByRole("button", { name: "Close", exact: true }).first().click();
    const saleRow = (page, name) => page.locator('[role="tabpanel"]:visible tbody tr').filter({ hasText: name });
    const sidebarLinks = async (page, narrow) => {
      const nav = page.getByRole("navigation", { name: "Main navigation" }).last();
      for (let attempt = 0; narrow; attempt++) {
        await settle(page);
        await page.getByRole("button", { name: "Open clinic navigation" }).click();
        const opened = await nav.getByRole("link", { name: /^Inventory/ }).waitFor({ timeout: 30000 }).then(() => true, () => false);
        if (opened || attempt >= 3) break;
      }
      await nav.getByRole("link", { name: /^Inventory/ }).waitFor({ timeout: 120000 });
      const links = (await nav.getByRole("link").allInnerTexts()).map(clean);
      if (narrow) await page.keyboard.press("Escape");
      return links;
    };
    const invoiceFor = (where) => db.pharmacyInvoice.findFirst({ where: { branchId, ...where }, include: { items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } });
    const salesCount = (invoiceNumber) => db.stockTransaction.count({ where: { reference: `INV-${invoiceNumber}` } });

    for (const who of ROLES) {
      for (const width of WIDTHS) {
        const tag = `${who}-${width}`;
        const narrow = width === "390";
        const { page, context, seen } = await open(who, VIEWPORTS[width]);
        const rxPatient = await patient();
        const rx = await prescription(rxPatient);

        await go(page, "/dashboard/pharmacy/sales");
        const links = await sidebarLinks(page, narrow);
        check(`${tag} sidebar has Sales and no Pharmacy Billing`, [links.includes("Sales"), links.some((l) => l.startsWith("Pharmacy Billing"))], [true, false]);
        await clickTo(page, page.locator("main header").getByRole("button", { name: /New sale/ }), "**/dashboard/pharmacy/sales/bill");
        const queueRow = page.locator("tbody tr").filter({ hasText: rxPatient.name });
        await queueRow.first().waitFor({ timeout: 120000 });
        check(`${tag} New sale opens a bill inside Sales with its Sales|Returns header`, [
          new URL(page.url()).pathname, clean(await page.locator("h1").first().innerText()),
          await page.getByRole("tab", { name: "Sales" }).getAttribute("aria-selected"), await page.getByRole("tab", { name: "Returns" }).count(),
        ], ["/dashboard/pharmacy/sales/bill", "Sales", "true", 1]);
        check(`${tag} new bill page: no page overflow`, await overflow(page), 0);
        await shot(page, `${tag}-01-new-bill-with-queue`);

        const before = await stocks();
        await queueRow.getByRole("button", { name: "Load" }).click();
        await page.getByRole("heading", { name: "Linked Prescription" }).waitFor({ timeout: 120000 });
        await line(page, GEL).waitFor({ timeout: 120000 });
        check(`${tag} Load fills the prescription's two medicines`, [await lineHeadings(page), await quantities(page)], [[CREAM, GEL], ["1", "1"]]);
        check(`${tag} loaded prescription bill: no page overflow`, await overflow(page), 0);
        if (await overflow(page)) console.log(`  wide elements: ${JSON.stringify(await offenders(page))}`);
        await shot(page, `${tag}-02-prescription-loaded`);
        await finish(page);
        await closePreview(page);
        const rxBill = await invoiceFor({ prescriptionId: rx.id });
        check(`${tag} the prescription bill is posted with its stock moved once`, [rxBill?.status, delta(before, await stocks()), await salesCount(rxBill?.invoiceNumber)], ["CONFIRMED", { [CREAM]: -1, [GEL]: -1, [TABLET]: 0 }, 2]);
        await queueRow.first().waitFor({ state: "detached", timeout: 60000 }).catch(() => {});
        const pending = await call(who, "GET", "/pharmacy/prescription-queue?status=pending&limit=100");
        check(`${tag} the prescription leaves Pending on screen and in the queue`, [await queueRow.count(), pending.data.some((e) => e.prescriptionId === rx.id)], [0, false]);
        await shot(page, `${tag}-03-prescription-finished`);

        await clickTo(page, page.getByRole("button", { name: "Back to Sales" }), /\/dashboard\/pharmacy\/sales$/);
        await saleRow(page, rxPatient.name).first().waitFor({ timeout: 120000 });
        check(`${tag} the finished prescription bill shows its number and its Cash payment in Sales, nothing due`, [
          clean(await saleRow(page, rxPatient.name).first().locator("td").first().innerText()), clean(await saleRow(page, rxPatient.name).first().locator("td").nth(-2).innerText()),
        ], [rxBill.invoiceNumber, "Cash"]);

        const draftPatient = await patient();
        await clickTo(page, page.locator("main header").getByRole("button", { name: /New sale/ }), "**/dashboard/pharmacy/sales/bill");
        check(`${tag} a new sale after finishing a bill starts clean`, await page.getByText("This checkout is confirmed").count(), 0);
        await pickPatient(page, draftPatient);
        await addDrug(page, TABLET);
        await addDrug(page, GEL);
        await line(page, TABLET).getByLabel("Quantity").fill("3");
        await line(page, TABLET).locator("input[type=number]").nth(2).fill("5");
        await page.getByLabel("Notes").fill("Collect after 6 pm");
        const beforeDraft = await stocks();
        await page.getByRole("button", { name: "Save draft" }).click();
        await page.getByText("All changes saved to the draft").waitFor({ timeout: 60000 });
        await page.waitForURL("**/sales/bill?draft=*", { timeout: 60000 });
        const draft = await invoiceFor({ patientId: draftPatient.id });
        check(`${tag} Save draft stores the bill without moving stock`, [draft?.status, draft?.items.map((i) => [i.quantity, i.discountPercent]), draft?.notes, delta(beforeDraft, await stocks())],
          ["DRAFT", [[3, 5], [1, 0]], "Collect after 6 pm", { [CREAM]: 0, [GEL]: 0, [TABLET]: 0 }]);
        check(`${tag} the saved draft stays open and has no bill number yet`, [
          new URL(page.url()).searchParams.get("draft"), draft.invoiceNumber.startsWith("DRAFT-"), await page.getByText("Gets its bill number when finished").count(), await page.getByText(draft.invoiceNumber).count(),
        ], [draft.id, true, 1, 0]);
        await shot(page, `${tag}-04-draft-saved`);

        await clickTo(page, page.getByRole("link", { name: "Back to Sales" }), /\/dashboard\/pharmacy\/sales$/);
        await saleRow(page, draftPatient.name).first().waitFor({ timeout: 120000 });
        const draftCell = clean(await saleRow(page, draftPatient.name).first().locator("td").first().innerText());
        check(`${tag} the draft is a Draft row in Sales`, draftCell, "Draft");
        await shot(page, `${tag}-05-sales-draft-row`);
        await clickTo(page, saleRow(page, draftPatient.name).first().getByRole("link", { name: /Open draft bill/ }), `**/sales/bill?draft=${draft.id}`);
        await line(page, GEL).waitFor({ timeout: 120000 });
        check(`${tag} reopening restores patient, every line, discount and notes`, [
          await page.getByLabel("Patient *").inputValue(), await lineHeadings(page), await quantities(page),
          await line(page, TABLET).locator("input[type=number]").nth(2).inputValue(), await page.getByLabel("Notes").inputValue(),
          await page.getByText("All changes saved to the draft").count(),
        ], [`${draftPatient.name} (${draftPatient.phone})`, [TABLET, GEL], ["3", "1"], "5", "Collect after 6 pm", 1]);
        check(`${tag} reopened draft: no page overflow`, await overflow(page), 0);
        await shot(page, `${tag}-06-draft-reopened`);
        await line(page, TABLET).getByLabel("Quantity").fill("4");
        check(`${tag} an edit marks the draft unsaved`, await page.getByText("Unsaved changes").count(), 1);
        const beforeFinish = await stocks();
        await finish(page);
        await closePreview(page);
        const finished = await invoiceFor({ id: draft.id });
        check(`${tag} finishing the draft posts that same bill and numbers it then, stock moved once`,
          [finished.status, /^PHI-\d{4}-\d{3,}$/.test(finished.invoiceNumber), finished.items.map((i) => i.quantity), delta(beforeFinish, await stocks()), await salesCount(finished.invoiceNumber), await db.pharmacyInvoice.count({ where: { patientId: draftPatient.id } })],
          ["CONFIRMED", true, [4, 1], { [CREAM]: 0, [GEL]: -1, [TABLET]: -4 }, 2, 1]);
        await shot(page, `${tag}-07-draft-finished`);
        await clickTo(page, page.getByRole("button", { name: "Back to Sales" }), /\/dashboard\/pharmacy\/sales$/);
        await saleRow(page, draftPatient.name).first().waitFor({ timeout: 120000 });
        check(`${tag} the Sales row now carries the bill number and its payment`, [
          clean(await saleRow(page, draftPatient.name).first().locator("td").first().innerText()), clean(await saleRow(page, draftPatient.name).first().locator("td").nth(-2).innerText()),
          (await db.pharmacyPayment.findMany({ where: { invoiceId: draft.id }, select: { amount: true, method: true } })).map((p) => [p.amount, p.method]),
        ], [finished.invoiceNumber, "Cash", [[finished.totalAmount, "CASH"]]]);
        await shot(page, `${tag}-08-sales-after-finish`);

        const discardPatient = await patient();
        await clickTo(page, page.locator("main header").getByRole("button", { name: /New sale/ }), "**/dashboard/pharmacy/sales/bill");
        await pickPatient(page, discardPatient);
        await addDrug(page, CREAM);
        await page.getByRole("button", { name: "Save draft" }).click();
        await page.waitForURL("**/sales/bill?draft=*", { timeout: 60000 });
        const doomed = await invoiceFor({ patientId: discardPatient.id });
        await page.getByRole("button", { name: "Discard draft" }).click();
        const dialog = page.getByRole("dialog", { name: "Discard this draft?" });
        await dialog.waitFor();
        check(`${tag} discard asks first and names the draft`, clean(await dialog.innerText()).includes(`The draft for ${discardPatient.name} will be removed from Sales.`), true);
        check(`${tag} discard dialog: no page overflow`, await overflow(page), 0);
        await shot(page, `${tag}-09-discard-confirm`);
        await dialog.getByRole("button", { name: "Discard draft" }).click();
        await page.waitForURL(/\/dashboard\/pharmacy\/sales$/, { timeout: 120000 });
        await page.locator('[role="tabpanel"]:visible tbody tr').first().waitFor({ timeout: 120000 });
        await settle(page);
        check(`${tag} the discarded draft is gone from the database and from Sales`, [await db.pharmacyInvoice.count({ where: { id: doomed.id } }), await saleRow(page, discardPatient.name).count()], [0, 0]);
        check(`${tag} Sales list: no page overflow`, await overflow(page), 0);

        const twoPatient = await patient();
        const shared = await call(who, "POST", "/pharmacy/invoices", {
          patientId: twoPatient.id, paymentMethod: "CASH", billingName: twoPatient.name, billingPhone: twoPatient.phone, notes: "",
          items: [{ itemType: "DRUG", drugId: (await db.drug.findFirst({ where: { branchId, name: CREAM } })).id, quantity: 1, unitPrice: 30, discountPercent: 0, taxPercent: 12 }],
        });
        const tabA = page;
        const tabB = await open(who, VIEWPORTS[width], context);
        await go(tabA, `/dashboard/pharmacy/sales/bill?draft=${shared.id}`);
        await go(tabB.page, `/dashboard/pharmacy/sales/bill?draft=${shared.id}`);
        await line(tabA, CREAM).waitFor({ timeout: 120000 });
        await line(tabB.page, CREAM).waitFor({ timeout: 120000 });
        await tabA.getByLabel("Notes").fill("From the front desk");
        await tabA.getByRole("button", { name: "Save draft" }).click();
        await tabA.getByText("All changes saved to the draft").waitFor({ timeout: 60000 });
        tabB.seen.expected = true;
        await line(tabB.page, CREAM).getByLabel("Quantity").fill("2");
        await tabB.page.getByRole("button", { name: "Save draft" }).click();
        const refusal = tabB.page.getByRole("alert").filter({ hasText: "Your changes on this screen were not saved." });
        await refusal.waitFor({ timeout: 60000 });
        await tabB.page.waitForTimeout(800);
        check(`${tag} a stale save in a second tab is refused in plain words, in view`, [
          clean(await refusal.innerText()).startsWith(STALE),
          await refusal.evaluate((el) => { const box = el.getBoundingClientRect(); return box.top >= 0 && box.bottom <= window.innerHeight; }),
        ], [true, true]);
        check(`${tag} the refused save changed nothing`, [(await invoiceFor({ id: shared.id })).items.map((i) => i.quantity), (await invoiceFor({ id: shared.id })).notes], [[1], "From the front desk"]);
        await shot(tabB.page, `${tag}-10-second-tab-refused`);
        await tabB.page.getByRole("button", { name: "Reload draft" }).click();
        await tabB.page.waitForFunction(() => document.querySelector("#notes")?.value === "From the front desk", null, { timeout: 60000 });
        check(`${tag} Reload draft shows the other tab's change`, await tabB.page.getByLabel("Notes").inputValue(), "From the front desk");
        await finish(tabA);
        await tabB.page.getByLabel("Notes").fill("Late edit");
        await tabB.page.getByRole("button", { name: "Save draft" }).click();
        await tabB.page.getByRole("alert").filter({ hasText: FINISHED }).waitFor({ timeout: 60000 });
        check(`${tag} saving a draft finished elsewhere is refused`, (await invoiceFor({ id: shared.id })).notes, "From the front desk");
        await tabB.page.getByRole("button", { name: "Reload draft" }).click();
        await tabB.page.getByText(/^This draft was finished as bill PHI-/).waitFor({ timeout: 60000 });
        await shot(tabB.page, `${tag}-11-second-tab-finished`);
        check(`${tag} second tab: no unexpected console error or refused call`, [tabB.seen.errors, tabB.seen.refused], [[], []]);
        await tabB.page.close();

        const oldPatient = await patient();
        const oldRx = await prescription(oldPatient);
        await go(page, `/dashboard/pharmacy?section=billing&patientId=${oldPatient.id}&prescriptionId=${oldRx.id}&doctorId=${U.doctor.id}`);
        await page.waitForURL("**/dashboard/pharmacy/sales/bill?**", { timeout: 120000 });
        await page.getByRole("heading", { name: "Linked Prescription" }).waitFor({ timeout: 120000 });
        await line(page, GEL).waitFor({ timeout: 120000 });
        const landed = new URL(page.url());
        check(`${tag} the old Pharmacy Billing link lands on a Sales bill with its prefill`, [
          landed.pathname, landed.searchParams.get("patientId"), landed.searchParams.get("prescriptionId"), landed.searchParams.get("section"),
          await page.getByLabel("Patient *").inputValue(), await lineHeadings(page), await page.getByText("This checkout is confirmed").count(),
        ], ["/dashboard/pharmacy/sales/bill", oldPatient.id, oldRx.id, null, `${oldPatient.name} (${oldPatient.phone})`, [CREAM, GEL], 0]);
        await shot(page, `${tag}-12-old-billing-link`);
        check(`${tag} no unexpected console error or refused call`, [seen.errors, seen.refused], [[], []]);
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    await stack.stop();
  }
  console.log(failed ? `CR24 BILLS FAIL ${failed}` : "CR24 BILLS PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("CR24 BILLS FAIL", e);
  process.exit(1);
});
