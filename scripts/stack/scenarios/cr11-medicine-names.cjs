const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");
const { seed, api, tokenFor, browserLogin } = require("./cr11-seed.cjs");

const root = path.resolve(__dirname, "../../..");
const out = process.env.SHOTS_DIR || path.join(root, "output/stack/cr11-medicine-names");
const VIEWPORTS = { 1280: { width: 1280, height: 800 }, 390: { width: 390, height: 844 } };
const clean = (text) => String(text ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const STRENGTH_REFUSAL = "Enter the strength, for example 150 mg, or tick Combination product.";
const FORM_REFUSAL = "Choose the form: tablet, capsule, syrup, cream and so on.";

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "cr11-medicine-names" });
  let browser;
  let failed = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : ` :: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`}`);
  };
  try {
    console.log(`BOOT base=${stack.base}`);
    const { items, patients, visits, oldPrescription } = await seed(stack);
    const db = stack.db;
    const branchId = stack.branch.id;
    const tokens = {};
    const call = async (who, method, url, body) => api(stack, (tokens[who] ??= await tokenFor(stack, who)), method, url, body);
    const refusal = (who, method, url, body) => call(who, method, url, body).then(() => null, (error) => [error.status, error.data?.message]);
    const nameOf = async (key) => (await db.inventoryItem.findUnique({ where: { id: items[key].id } })).name;

    {
      const work = fs.mkdtempSync(path.join(os.tmpdir(), "cr11-backfill-"));
      const url = new URL(process.env.STACK_DATABASE_URL);
      url.searchParams.set("schema", stack.schema);
      const run = (...args) => JSON.parse(execFileSync(process.execPath, [require.resolve("ts-node/dist/bin.js", { paths: [path.join(root, "backend")] }), "--transpile-only", "scripts/standardize_medicine_names.ts", ...args], {
        cwd: path.join(root, "backend"),
        env: { ...process.env, DATABASE_URL: url.toString(), NODE_PATH: path.join(root, "backend/node_modules"), TS_NODE_PROJECT: path.join(root, "backend/tsconfig.json") },
        encoding: "utf8",
      }).trim().split("\n").pop());
      const planned = run("plan", branchId, stack.users.owner.id, path.join(work, "review"));
      check("backfill dry run: 8 items to rename, 2 it cannot read, 1 missing a strength", [planned.items, planned.changes, planned.couldNotRead, planned.missingStrength, planned.alreadyStandard], [10, 8, 2, 1, 0]);
      const csv = (file) => fs.readFileSync(path.join(work, "review", file), "utf8").trim().split("\n").slice(1).map((line) => line.split('","').map((cell) => cell.replace(/^"|"$/g, "")));
      check("backfill lists the names it could not read", csv("could-not-read.csv").map((row) => [row[1], row[2], row[3]]).sort(), [["CONSUMABLE", "Cotton roll", "form"], ["MEDICINE", "Augmentin 500mg 125mg Tab", "strength"]]);
      check("backfill lists the medicine missing a strength", csv("missing-strength.csv").map((row) => [row[1], row[2]]), [["Tab. Acnosis", "199 | Acnosis Tab (loose tablets)"]]);
      const rehearsed = run("rehearse", path.join(work, "review/plan.json"));
      check("rehearsal reports 8 changes and leaves the names as recorded", [rehearsed.updated, rehearsed.rolledBack, await nameOf("flutas")], [8, true, "13 74 | Flutas 150Mg(Pc)"]);
      const stockBefore = (await db.inventoryItem.findMany({ where: { branchId }, orderBy: { id: "asc" } })).map((i) => [i.id, i.currentStock, i.costPrice, i.packSize]);
      const applied = run("apply", path.join(work, "review/plan.json"));
      const again = run("apply", path.join(work, "review/plan.json"));
      check("apply renames 8 with 8 audit entries; applying again changes nothing", [applied.updated, applied.auditEntries, again.updated, again.alreadyApplied, again.auditEntries], [8, 8, 0, 8, 8]);
      const names = {};
      for (const key of Object.keys(items)) names[key] = await nameOf(key);
      check("existing items carry the clinic's standard names", names, {
        flutas: "Tab. Flutas 150 mg", zimba: "Zimba cream", bact: "1-Bact ointment", cwin: "Cwin lotion", sotret: "Cap. Sotret 10 mg",
        antoxid: "Cap. Antoxid-HC", acnosis: "Tab. Acnosis", teczine: "Syp. Teczine 2.5mg/5ml", augmentin: "Augmentin 500mg 125mg Tab", cotton: "Cotton roll",
      });
      const flutas = await db.inventoryItem.findUnique({ where: { id: items.flutas.id } });
      check("Flutas keeps its code and pack size apart and its stock unchanged", [flutas.form, flutas.brandName, flutas.strength, flutas.itemCode, flutas.packSize, flutas.isCombination], ["TABLET", "Flutas", "150 mg", "13 74", 10, false]);
      check("backfill moved no stock, cost or pack size", (await db.inventoryItem.findMany({ where: { branchId }, orderBy: { id: "asc" } })).map((i) => [i.id, i.currentStock, i.costPrice, i.packSize]), stockBefore);
      fs.rmSync(work, { recursive: true, force: true });
    }

    check("API refuses a tablet without a strength", await refusal("pharmacist", "POST", "/inventory/items", { name: "Telma", brandName: "Telma", form: "TABLET", type: "MEDICINE", unit: "STRIPS", costPrice: 10, sellingPrice: 20 }), [400, STRENGTH_REFUSAL]);
    check("API refuses a medicine without a form", await refusal("admin", "POST", "/inventory/items", { name: "Telma 40", type: "MEDICINE", unit: "STRIPS", costPrice: 10, sellingPrice: 20 }), [400, FORM_REFUSAL]);

    browser = await chromium.launch();
    const sessions = new Map();
    const open = async (who, width) => {
      const context = await browser.newContext({ viewport: VIEWPORTS[width], ...(sessions.has(who) && { storageState: sessions.get(who) }) });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      const seen = { errors: [], refused: [], posts: [] };
      page.on("pageerror", (e) => seen.errors.push(`pageerror ${e.message.slice(0, 200)}`));
      page.on("console", (m) => m.type() === "error" && !/status of 400/.test(m.text()) && seen.errors.push(m.text().slice(0, 200)));
      page.on("response", (r) => r.url().includes("/api/") && [401, 403, 429].includes(r.status()) && seen.refused.push(`${r.status()} ${new URL(r.url()).pathname}`));
      page.on("request", (r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/inventory/items" && seen.posts.push(r.postDataJSON()));
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
      await page.setViewportSize({ width: viewport.width, height: Math.min(Math.max(height, viewport.height), 9000) });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(out, `cr11-${name}.png`), fullPage: true });
      await page.setViewportSize(viewport);
    };
    const stockRows = (page) => page.locator("table").filter({ has: page.getByRole("columnheader", { name: "Product / batch" }) }).locator("tbody tr");
    const productCells = async (page) => (await stockRows(page).locator("td:nth-child(2)").allInnerTexts()).map((text) => clean(text));
    const productNames = async (page) => (await stockRows(page).locator("td:nth-child(2) button").allInnerTexts()).map(clean);
    const stockList = async (page, query) => {
      await go(page, `/dashboard/inventory?area=stock&view=list&${new URLSearchParams(query)}`);
      await page.getByText(/\d+ matching batches/).first().waitFor({ timeout: 240000 });
      await settle(page);
    };

    for (const who of ["pharmacist", "admin"])
      for (const width of ["1280", "390"]) {
        const tag = `${who}-${width}`;
        const { page, context, seen } = await open(who, width);
        await stockList(page, { search: "flutas" });
        check(`${tag} stock list shows the standard name and what it was recorded as`, (await productCells(page))[0]?.startsWith("Tab. Flutas 150 mg Recorded as 13 74 | Flutas 150Mg(Pc)"), true);
        await shot(page, `${tag}-01-stock-standard-name`);
        await stockList(page, { search: "13 74 | Flutas 150Mg(Pc)" });
        check(`${tag} searching the recorded name still finds the item`, await productNames(page), ["Tab. Flutas 150 mg"]);
        await stockList(page, { missing: "Strength missing" });
        check(`${tag} Missing information: Strength missing lists exactly Tab. Acnosis`, await productNames(page), ["Tab. Acnosis"]);
        check(`${tag} the missing-strength row says so`, (await productCells(page))[0]?.includes("Strength missing"), true);
        await page.getByRole("button", { name: "Filters" }).click();
        check(`${tag} the filter offers Strength missing with its count`, (await page.getByLabel("Missing information").locator("option").allInnerTexts()).includes("Strength missing (1)"), true);
        if (width === "390") check(`${tag} stock list: no sideways page scroll`, await overflow(page), 0);
        await shot(page, `${tag}-02-missing-strength-list`);
        check(`${tag} stock pages: no console error or refused call`, [seen.errors, seen.refused], [[], []]);
        await context.close();
      }

    const addDialog = async (page) => {
      await stockList(page, {});
      await page.getByRole("button", { name: "Add batch" }).click();
      await page.getByRole("heading", { name: "Add Inventory Item" }).waitFor();
      await page.getByLabel("Cost Price (₹) *").fill("12");
      await page.getByLabel("Selling Price (₹) *").fill("20");
    };
    const naming = async (page, { form, name, strength, combination }) => {
      await page.locator("#medicine-form").selectOption(form);
      await page.locator("#medicine-name").fill(name);
      if (strength !== undefined) await page.locator("#medicine-strength").fill(strength);
      if (combination) await page.getByLabel("Combination product").check();
    };
    const preview = async (page) => clean(await page.getByTestId("medicine-name-preview").innerText());
    const submit = (page) => page.getByRole("button", { name: "Add Item" }).click();

    {
      const { page, context, seen } = await open("pharmacist", "1280");
      await addDialog(page);
      await naming(page, { form: "TABLET", name: "Telma" });
      check("pharmacist-1280 preview shows the tablet name and flags the missing strength", [await preview(page), await page.getByRole("dialog").getByText("Strength missing").count()], ["Tab. Telma", 1]);
      await submit(page);
      check("pharmacist-1280 a tablet without a strength is refused on the form", [clean(await page.getByRole("alert").first().innerText()), seen.posts.length], [STRENGTH_REFUSAL, 0]);
      await shot(page, "pharmacist-1280-03-tablet-without-strength-refused");
      await page.locator("#medicine-strength").fill("40");
      await page.getByLabel("Item code").fill("77 01");
      check("pharmacist-1280 preview builds Tab. Telma 40 mg", await preview(page), "Tab. Telma 40 mg");
      await shot(page, "pharmacist-1280-04-tablet-preview");
      await submit(page);
      await page.getByText("Sent to doctor for approval").first().waitFor();
      const request = await db.inventoryItemRequest.findFirst({ where: { branchId, itemName: "Tab. Telma 40 mg" } });
      check("pharmacist-1280 the request carries the standard name and separate fields", request && [request.payload.form, request.payload.brandName, request.payload.strength, request.payload.itemCode], ["TABLET", "Telma", "40 mg", "77 01"]);
      check("pharmacist-1280 add item: no console error or refused call", [seen.errors, seen.refused], [[], []]);
      await context.close();
    }
    {
      const { page, context, seen } = await open("pharmacist", "390");
      await addDialog(page);
      await naming(page, { form: "CREAM", name: "Fucibet" });
      check("pharmacist-390 a cream needs no strength", await preview(page), "Fucibet cream");
      await shot(page, "pharmacist-390-05-cream-preview");
      await submit(page);
      await page.getByText("Sent to doctor for approval").first().waitFor();
      await page.getByRole("button", { name: "Close" }).first().click();
      await addDialog(page);
      await naming(page, { form: "TABLET", name: "Zincovit", combination: true });
      check("pharmacist-390 a combination tablet prints no strength", [await preview(page), await page.locator("#medicine-strength").isDisabled()], ["Tab. Zincovit", true]);
      await shot(page, "pharmacist-390-06-combination-preview");
      await submit(page);
      await page.getByText("Sent to doctor for approval").first().waitFor();
      const requests = (await db.inventoryItemRequest.findMany({ where: { branchId }, orderBy: { createdAt: "asc" } })).map((r) => [r.itemName, r.payload.isCombination ?? null]);
      check("pharmacist-390 cream and combination requests are queued with their standard names", requests, [["Tab. Telma 40 mg", false], ["Fucibet cream", false], ["Tab. Zincovit", true]]);
      check("pharmacist-390 add item dialog: no console error or refused call", [seen.errors, seen.refused], [[], []]);
      await context.close();
    }
    for (const request of await db.inventoryItemRequest.findMany({ where: { branchId } }))
      await call("doctor", "POST", `/inventory/item-requests/${request.id}/approve`, {});
    check("doctor approval creates the requested items under their standard names",
      (await db.inventoryItem.findMany({ where: { branchId, name: { in: ["Tab. Telma 40 mg", "Fucibet cream", "Tab. Zincovit"] } }, orderBy: { name: "asc" } })).map((i) => [i.name, i.form, i.strength, i.isCombination]),
      [["Fucibet cream", "CREAM", null, false], ["Tab. Telma 40 mg", "TABLET", "40 mg", false], ["Tab. Zincovit", "TABLET", null, true]]);

    {
      const { page, context, seen } = await open("admin", "1280");
      await addDialog(page);
      await naming(page, { form: "SYRUP", name: "Ambrodil" });
      await submit(page);
      check("admin-1280 a syrup without a strength is refused", clean(await page.getByRole("alert").first().innerText()), STRENGTH_REFUSAL);
      await page.locator("#medicine-strength").fill("15 MG / 5 ML");
      check("admin-1280 the syrup strength is shown as the clinic writes it", await preview(page), "Syp. Ambrodil 15mg/5ml");
      await submit(page);
      await page.getByRole("heading", { name: "Add Inventory Item" }).waitFor({ state: "detached" });
      const syrup = await db.inventoryItem.findFirst({ where: { branchId, brandName: "Ambrodil" } });
      check("admin-1280 the syrup is created directly with its fields", syrup && [syrup.name, syrup.form, syrup.strength], ["Syp. Ambrodil 15mg/5ml", "SYRUP", "15mg/5ml"]);
      check("admin-1280 add item: no console error or refused call", [seen.errors, seen.refused], [[], []]);
      await context.close();
    }
    {
      const { page, context, seen } = await open("admin", "390");
      await addDialog(page);
      await naming(page, { form: "SOLUTION", name: "Protar-K scalp" });
      check("admin-390 the solution follows the cream pattern", await preview(page), "Protar-K scalp solution");
      if ((await overflow(page)) > 0) check("admin-390 add dialog: no sideways page scroll", await overflow(page), 0);
      await shot(page, "admin-390-07-solution-preview");
      await submit(page);
      await page.getByRole("heading", { name: "Add Inventory Item" }).waitFor({ state: "detached" });
      check("admin-390 the solution is created", (await db.inventoryItem.findFirst({ where: { branchId, brandName: "Protar-K scalp" } }))?.name, "Protar-K scalp solution");
      check("admin-390 add item: no console error or refused call", [seen.errors, seen.refused], [[], []]);
      await context.close();
    }

    {
      const { page, context, seen } = await open("admin", "1280");
      await go(page, `/dashboard/inventory?area=stock&view=list&item=${items.augmentin.id}`);
      await page.getByRole("button", { name: "Edit item" }).click();
      await page.locator("#medicine-form").selectOption("TABLET");
      await page.locator("#medicine-name").fill("Augmentin");
      await page.getByLabel("Combination product").check();
      await page.getByLabel("Why are you changing it?").fill("Two ingredients; checked the strip");
      const changes = clean(await page.getByRole("region", { name: "Check your changes" }).innerText());
      check("admin-1280 the edit shows the printed name before saving", [changes.includes("Printed name"), changes.includes("Augmentin 500mg 125mg Tab"), changes.includes("Tab. Augmentin")], [true, true, true]);
      await shot(page, "admin-1280-08-edit-unread-item");
      await page.getByRole("button", { name: "Save corrected details" }).click();
      await page.getByText("Corrected details saved. Stock quantity unchanged.").waitFor();
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Tab. Augmentin", level: 2 }).waitFor({ timeout: 120000 });
      check("admin-1280 after reload the item page shows the standard name and what it was recorded as", clean(await page.getByText("Recorded as Augmentin 500mg 125mg Tab").first().innerText()), "Recorded as Augmentin 500mg 125mg Tab");
      const augmentin = await db.inventoryItem.findUnique({ where: { id: items.augmentin.id } });
      check("admin-1280 the edit saved the fields, the alias and an audit", [augmentin.name, augmentin.form, augmentin.isCombination, JSON.parse(augmentin.metadata).nameNormalization.aliases, await db.auditLog.count({ where: { entityId: augmentin.id, action: "INVENTORY_METADATA_UPDATED" } })],
        ["Tab. Augmentin", "TABLET", true, ["Augmentin 500mg 125mg Tab"], 1]);
      await shot(page, "admin-1280-09-item-page-recorded-as");

      await go(page, `/dashboard/inventory?area=stock&view=list&item=${items.flutas.id}`);
      await page.getByRole("button", { name: "Edit item" }).click();
      await page.locator("#medicine-strength").fill("");
      await page.getByLabel("Why are you changing it?").fill("Trying to clear it");
      await page.getByRole("button", { name: "Save corrected details" }).click();
      check("admin-1280 clearing a saved strength is refused", [clean(await page.getByRole("alert").first().innerText()), await nameOf("flutas")], [STRENGTH_REFUSAL, "Tab. Flutas 150 mg"]);
      await shot(page, "admin-1280-10-clear-strength-refused");
      const page2 = await call("admin", "GET", `/inventory/workspace/stock?${new URLSearchParams({ missing: "Strength missing", limit: "100" })}`);
      check("Strength missing still lists exactly Tab. Acnosis (Augmentin is a combination, Telma has 40 mg)", page2.rows.map((r) => r.name), ["Tab. Acnosis"]);
      check("admin item page: no console error or refused call", [seen.errors, seen.refused], [[], []]);
      await context.close();
    }

    const pickerRow = (page, index) => page.getByPlaceholder("Search medicine name...").nth(index);
    const pick = async (page, index, query, expected) => {
      const input = pickerRow(page, index);
      await input.click();
      await input.fill(query);
      const result = page.locator("div[title]").filter({ has: page.getByRole("button", { name: "Select" }) }).filter({ hasText: expected }).first();
      await result.waitFor({ timeout: 60000 });
      const text = clean(await result.innerText());
      await result.getByRole("button", { name: "Select" }).click();
      await page.waitForFunction(([i, value]) => document.querySelectorAll('input[placeholder="Search medicine name..."]')[i]?.value === value, [index, expected], { timeout: 30000 });
      return text;
    };
    const openPrescription = async (page, visit, patient) => {
      await page.goto(`${stack.base}/dashboard/visits?visitId=${visit.id}&patientId=${patient.id}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.getByTestId("visit-identity").first().waitFor({ timeout: 240000 });
      await page.getByRole("tab", { name: "Prescription" }).first().click();
      const ready = await pickerRow(page, 0).waitFor({ timeout: 60000 }).then(() => true, () => false);
      if (!ready) {
        await shot(page, `visit-before-add-row-${page.viewportSize().width}`);
        await page.getByRole("button", { name: "Add Row" }).first().click();
        await pickerRow(page, 0).waitFor({ timeout: 60000 });
      }
    };
    const previewText = async (page) => {
      await page.getByRole("button", { name: "Print Preview" }).click();
      const dialog = page.getByRole("dialog").last();
      await dialog.waitFor();
      await page.waitForTimeout(2500);
      return clean(await dialog.innerText());
    };

    {
      const { page, context, seen } = await open("doctor", "1280");
      await openPrescription(page, visits.newVisit, patients.meera);
      const flutas = await pick(page, 0, "flutas", "Tab. Flutas 150 mg");
      const acnosis = await pick(page, 1, "acnosis", "Tab. Acnosis");
      const antoxid = await pick(page, 2, "antoxid", "Cap. Antoxid-HC");
      check("doctor-1280 picker rows show standard names; only Acnosis says strength missing", [flutas.startsWith("Tab. Flutas 150 mg"), flutas.includes("Strength missing"), acnosis.includes("Strength missing"), antoxid.startsWith("Cap. Antoxid-HC")], [true, false, true, true]);
      await pickerRow(page, 3).fill("13 74 | Flutas 150Mg(Pc)");
      await page.locator("div[title]").filter({ hasText: "Tab. Flutas 150 mg" }).first().waitFor();
      check("doctor-1280 typing the recorded name offers the standard name", clean(await page.locator("div[title]").filter({ hasText: "Tab. Flutas 150 mg" }).first().innerText()).startsWith("Tab. Flutas 150 mg"), true);
      await shot(page, "doctor-1280-11-picker-recorded-name");
      await pickerRow(page, 3).fill("");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Create Prescription" }).click();
      const saved = await (async () => {
        for (let i = 0; i < 60; i++) {
          const rx = await db.prescription.findFirst({ where: { visitId: visits.newVisit.id } });
          if (rx) return rx;
          await new Promise((r) => setTimeout(r, 1000));
        }
        return null;
      })();
      const lines = saved ? JSON.parse(saved.items).map((it) => [it.drugName, it.inventoryItemId]) : null;
      check("doctor-1280 the prescription saves the standard names with their inventory items", lines, [["Tab. Flutas 150 mg", items.flutas.id], ["Tab. Acnosis", items.acnosis.id], ["Cap. Antoxid-HC", items.antoxid.id]]);
      const text = await previewText(page);
      check("doctor-1280 print preview reads Tab. Flutas 150 mg with no code or pack size", [text.includes("Tab. Flutas 150 mg"), text.includes("Cap. Antoxid-HC"), text.includes("13 74 |"), text.includes("30S"), text.includes("(loose")], [true, true, false, false, false]);
      await shot(page, "doctor-1280-12-print-preview-new");
      check("doctor-1280 prescribing: no refused call", seen.refused, []);
      console.log(`NOTE doctor-1280 visit console errors: ${JSON.stringify(seen.errors)}`);

      const stock = await call("pharmacist", "GET", `/pharmacy/prescription-queue/${saved.id}/stock-check`);
      check("the dispensing stock check matches each prescribed line to its inventory item", stock.items.map((l) => [l.drugName, l.inventoryItemId, l.stockStatus]),
        [["Tab. Flutas 150 mg", items.flutas.id, "IN_STOCK"], ["Tab. Acnosis", items.acnosis.id, "IN_STOCK"], ["Cap. Antoxid-HC", items.antoxid.id, "IN_STOCK"]]);
      await context.close();
    }
    {
      const { page, context, seen } = await open("doctor", "390");
      await openPrescription(page, visits.phoneVisit, patients.pooja);
      const text = await pick(page, 0, "acnosis", "Tab. Acnosis");
      check("doctor-390 the picker shows the standard name and the quiet hint at phone width", [text.startsWith("Tab. Acnosis"), text.includes("Strength missing")], [true, true]);
      await pickerRow(page, 1).click();
      await pickerRow(page, 1).fill("zimba");
      await page.locator("div[title]").filter({ hasText: "Zimba cream" }).first().waitFor();
      await shot(page, "doctor-390-13-picker-phone");
      console.log(`NOTE doctor-390 visit page overflow ${await overflow(page)} console errors ${JSON.stringify(seen.errors)}`);
      check("doctor-390 prescribing: no refused call", seen.refused, []);
      await context.close();
    }
    {
      const { page, context, seen } = await open("doctor", "1280");
      await openPrescription(page, visits.oldVisit, patients.kiran);
      const loaded = await page.waitForFunction(() => [...document.querySelectorAll('input[placeholder="Search medicine name..."]')].some((el) => el.value.startsWith("13 74")), null, { timeout: 60000 }).then(() => true, () => false);
      check("doctor-1280 the old prescription opens with its saved names unchanged", loaded, true);
      const text = await previewText(page);
      check("doctor-1280 reprint of the old prescription drops codes and pack sizes but keeps the strength", [text.includes("Flutas 150Mg"), text.includes("Antoxid-Hc Capsules"), text.includes("13 74"), text.includes("30S"), text.includes("(loose capsules)")], [true, true, false, false, false]);
      await shot(page, "doctor-1280-14-print-preview-old");
      check("the old prescription is unchanged in the database", JSON.parse((await db.prescription.findUnique({ where: { id: oldPrescription.id } })).items).map((it) => it.drugName), ["13 74 | Flutas 150Mg(Pc)", "1 Antoxid-Hc Capsules 30S (loose capsules)"]);
      const pdf = await call("doctor", "POST", `/prescriptions/${oldPrescription.id}/pdf`, {});
      const pdfText = execFileSync("pdftotext", ["-", "-"], { input: Buffer.from(String(pdf.fileUrl).split(",")[1], "base64") }).toString();
      check("the old prescription PDF prints cleaned names", pdfText.split("\n").filter((line) => /^\d\. /.test(line)).map((line) => line.split(" — ")[0]), ["1. Flutas 150Mg 1 TABLET", "2. Antoxid-Hc Capsules 1 CAPSULE"]);
      console.log(`NOTE doctor-1280 old visit console errors: ${JSON.stringify(seen.errors)}`);
      await context.close();
    }

    const oldStock = await call("pharmacist", "GET", `/pharmacy/prescription-queue/${oldPrescription.id}/stock-check`);
    check("the old prescription's recorded names still match their inventory items", oldStock.items.map((l) => [l.drugName, l.inventoryItemId]), [["13 74 | Flutas 150Mg(Pc)", items.flutas.id], ["1 Antoxid-Hc Capsules 30S (loose capsules)", items.antoxid.id]]);

    for (const width of ["1280", "390"]) {
      const { page, context, seen } = await open("pharmacist", width);
      await go(page, "/dashboard/pharmacy/sales/bill");
      const row = page.locator("tbody tr").filter({ hasText: "Meera Shah" }).first();
      await row.waitFor({ timeout: 240000 });
      await row.getByRole("button", { name: "Load" }).click();
      await page.getByRole("heading", { name: "Linked Prescription" }).waitFor({ timeout: 120000 });
      await page.locator("[data-invoice-item]").nth(2).waitFor({ timeout: 120000 });
      const lines = await page.locator("[data-invoice-item]").count();
      const unmatched = await page.locator("[data-invoice-item]").getByText("No match", { exact: true }).count();
      check(`pharmacist-${width} the pharmacy bill loads all three prescribed items matched to stock`, [lines, unmatched], [3, 0]);
      await shot(page, `pharmacist-${width}-15-bill-from-prescription`);
      check(`pharmacist-${width} bill: no refused call`, seen.refused, []);
      console.log(`NOTE pharmacist-${width} bill console errors: ${JSON.stringify(seen.errors)}`);
      await context.close();
    }
  } finally {
    await browser?.close();
    await stack.stop();
  }
  console.log(failed ? `CR11 FAIL ${failed}` : "CR11 PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("CR11 FAIL", e);
  process.exit(1);
});
