const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");
const { seed, api, tokenFor, browserLogin } = require("./cr11-seed.cjs");

const root = path.resolve(__dirname, "../../..");
const out = process.env.SHOTS_DIR || path.join(root, "output/stack/cr11-medicine-names");
const VIEWPORTS = { 1280: { width: 1280, height: 800 }, 1440: { width: 1440, height: 900 }, 390: { width: 390, height: 844 } };
const clean = (text) => String(text ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const STRENGTH_REFUSAL = "Enter the strength, for example 150 mg, or tick Combination product.";
const FORM_REFUSAL = "Choose the form: tablet, capsule, syrup, cream and so on.";
const UNIT_REFUSAL = "Add the unit to the strength, for example 50 mg, 50 mcg, 1 g, 60000 IU or 1%.";
const MISSING_STRENGTH = ["Cap. Omega 3", "Cap. Uprise D3 60000", "Tab. Acnosis", "Tab. Thyronorm 50"];

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
      check("backfill dry run: 12 medicines to rename, 1 it cannot read, 4 missing a strength, 2 needing a unit, 2 not medicines", [planned.items, planned.changes, planned.couldNotRead, planned.missingStrength, planned.needsUnit, planned.notMedicine, planned.alreadyStandard], [15, 12, 1, 4, 2, 2, 0]);
      const csv = (file) => fs.readFileSync(path.join(work, "review", file), "utf8").trim().split("\n").slice(1).map((line) => line.split('","').map((cell) => cell.replace(/^"|"$/g, "")));
      check("backfill lists the names it could not read", csv("could-not-read.csv").map((row) => [row[1], row[2], row[3]]).sort(), [["MEDICINE", "Augmentin 500mg 125mg Tab", "strength"]]);
      check("backfill lists the medicines missing a strength", csv("missing-strength.csv").map((row) => row[1]).sort(), MISSING_STRENGTH);
      check("needs-unit.csv lists the names with a number but no unit", csv("needs-unit.csv").map((row) => [row[1], row[2]]).sort(), [["Cap. Uprise D3 60000", "Uprise D3 60000 Cap"], ["Tab. Thyronorm 50", "Thyronorm 50 Tab"]]);
      const renames = Object.fromEntries(csv("changes.csv").map((row) => [row[1], [row[2], row[4], row[5]]]));
      check("changes.csv shows the reviewer's names with their strength and its source", [renames["Thyronorm 50 Tab"], renames["Cap. Omega 3"], renames["Uprise D3 60000 Cap"], renames["Sucralfate 1g Tab"], renames["Ultrasound Gel 250ml"]], [
        ["Tab. Thyronorm 50", "", "none: number without a unit (needs-unit.csv)"],
        ["Cap. Omega 3", "", "none in recorded name"],
        ["Cap. Uprise D3 60000", "", "none: number without a unit (needs-unit.csv)"],
        ["Tab. Sucralfate 1 g", "1 g", "unit stated in recorded name"],
        undefined,
      ]);
      check("changes.csv: no new name gains mg its recorded name did not state", Object.entries(renames).filter(([recorded, [next]]) => /\bmg\b/i.test(next) && !/mg/i.test(recorded)), []);
      fs.rmSync(path.join(work, "review/changes.csv"));
      const rehearsal = execFileSync(process.execPath, [require.resolve("ts-node/dist/bin.js", { paths: [path.join(root, "backend")] }), "--transpile-only", "scripts/standardize_medicine_names.ts", "rehearse", path.join(work, "review/plan.json")], {
        cwd: path.join(root, "backend"),
        env: { ...process.env, DATABASE_URL: url.toString(), NODE_PATH: path.join(root, "backend/node_modules"), TS_NODE_PROJECT: path.join(root, "backend/tsconfig.json") },
        encoding: "utf8",
      }).trim().split("\n");
      const rehearsed = JSON.parse(rehearsal.pop());
      console.log(`NOTE rehearse printed:\n${rehearsal.join("\n")}`);
      check("rehearse prints the renames, rewrites changes.csv and reports 12 changes with the names left as recorded", [rehearsal.length, rehearsal.includes("Thyronorm 50 Tab  ->  Tab. Thyronorm 50  [none: number without a unit (needs-unit.csv)]"), csv("changes.csv").length, rehearsed.updated, rehearsed.rolledBack, await nameOf("flutas")], [12, true, 12, 12, true, "13 74 | Flutas 150Mg(Pc)"]);
      const stockBefore = (await db.inventoryItem.findMany({ where: { branchId }, orderBy: { id: "asc" } })).map((i) => [i.id, i.currentStock, i.costPrice, i.packSize]);
      const applied = run("apply", path.join(work, "review/plan.json"));
      const again = run("apply", path.join(work, "review/plan.json"));
      check("apply renames 12 with 12 audit entries; applying again changes nothing", [applied.updated, applied.auditEntries, again.updated, again.alreadyApplied, again.auditEntries], [12, 12, 0, 12, 12]);
      const names = {};
      for (const key of Object.keys(items)) names[key] = await nameOf(key);
      check("existing items carry the clinic's standard names", names, {
        flutas: "Tab. Flutas 150 mg", zimba: "Zimba cream", bact: "1-Bact ointment", cwin: "Cwin lotion", sotret: "Cap. Sotret 10 mg",
        antoxid: "Cap. Antoxid-HC", acnosis: "Tab. Acnosis", teczine: "Syp. Teczine 2.5mg/5ml", augmentin: "Augmentin 500mg 125mg Tab", cotton: "Cotton roll",
        thyronorm: "Tab. Thyronorm 50", omega: "Cap. Omega 3", uprise: "Cap. Uprise D3 60000", sucralfate: "Tab. Sucralfate 1 g", gel: "Ultrasound Gel 250ml",
      });
      const readBack = async (key) => {
        const item = await db.inventoryItem.findUnique({ where: { id: items[key].id } });
        return [item.name, item.form, item.brandName, item.strength];
      };
      check("read back from the database: Thyronorm keeps 50 in its name with no unit and no strength", await readBack("thyronorm"), ["Tab. Thyronorm 50", "TABLET", "Thyronorm 50", null]);
      check("read back: Omega 3 and Uprise D3 60000 carry no strength; Sucralfate keeps 1 g", [await readBack("omega"), await readBack("uprise"), await readBack("sucralfate")], [
        ["Cap. Omega 3", "CAPSULE", "Omega 3", null], ["Cap. Uprise D3 60000", "CAPSULE", "Uprise D3 60000", null], ["Tab. Sucralfate 1 g", "TABLET", "Sucralfate", "1 g"],
      ]);
      check("read back: the equipment gel is left alone", await readBack("gel"), ["Ultrasound Gel 250ml", null, null, null]);
      check("read back: no item in the branch prints Thyronorm with mg", await db.inventoryItem.count({ where: { branchId, name: { contains: "Thyronorm" }, OR: [{ name: { contains: "mg" } }, { strength: { contains: "mg" } }] } }), 0);
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
        seen.errors.length = 0;
        seen.refused.length = 0;
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
        check(`${tag} Missing information: Strength missing lists the four medicines without a strength`, (await productNames(page)).sort(), MISSING_STRENGTH);
        check(`${tag} the missing-strength row says so`, (await productCells(page))[0]?.includes("Strength missing"), true);
        await page.getByRole("button", { name: "Filters" }).click();
        check(`${tag} the filter offers Strength missing with its count`, (await page.getByLabel("Missing information").locator("option").allInnerTexts()).includes("Strength missing (4)"), true);
        if (width === "390") check(`${tag} stock list: no sideways page scroll`, await overflow(page), 0);
        await shot(page, `${tag}-02-missing-strength-list`);
        check(`${tag} stock pages: no console error or refused call`, [seen.errors, seen.refused], [[], []]);
        await context.close();
      }

    const stockLayout = (page) =>
      page.evaluate(() => {
        const table = [...document.querySelectorAll("main table")].find((t) => [...t.querySelectorAll("th")].some((th) => th.textContent.trim() === "Product / batch"));
        const lines = (node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
        };
        const column = (name) => [...table.querySelectorAll("thead th")].findIndex((th) => th.textContent.trim() === name);
        return [...table.querySelectorAll("tbody tr")].map((row) => {
          const cells = row.querySelectorAll("td");
          const product = cells[column("Product / batch")];
          return {
            name: product.querySelector("button").textContent.trim(),
            height: Math.round(row.getBoundingClientRect().height),
            recordedLines: [...product.querySelectorAll("p")].filter((p) => p.textContent.startsWith("Recorded as")).map(lines),
            strengthMissing: [...product.querySelectorAll("p")].some((p) => p.textContent === "Strength missing"),
            locationLines: lines(cells[column("Location")]),
            stateLines: lines(cells[column("Batch state")].querySelector("[data-review-state] > span")),
            buttons: [...cells[column("Edit")].querySelectorAll("button")].map((b) => {
              const lineHeight = parseFloat(getComputedStyle(b).lineHeight);
              return { text: b.textContent.trim(), lines: lines(b), fits: b.scrollWidth <= b.clientWidth, belowTwoLines: b.getBoundingClientRect().height < 2 * lineHeight };
            }),
          };
        });
      });
    for (const who of ["pharmacist", "doctor", "admin"])
      for (const width of who === "pharmacist" ? ["1280", "1440", "390"] : ["1280", "390"]) {
        const tag = `${who}-${width}`;
        const { page, context, seen } = await open(who, width);
        await stockList(page, { missing: "Strength missing" });
        const rows = await stockLayout(page);
        console.log(`NOTE ${tag} stock row heights ${JSON.stringify(rows.map((r) => [r.name, r.height, r.recordedLines]))}`);
        check(`${tag} stock list: the four missing-strength batches, each still saying Strength missing`, rows.map((r) => [r.name, r.strengthMissing]).sort(), MISSING_STRENGTH.map((name) => [name, true]));
        check(`${tag} stock list: Uprise, Acnosis and Thyronorm still say what they were recorded as`, rows.filter((r) => r.recordedLines.length).map((r) => r.name).sort(), ["Cap. Uprise D3 60000", "Tab. Acnosis", "Tab. Thyronorm 50"]);
        check(`${tag} stock list: Edit price and Edit stock read on one line each in every row`,
          rows.flatMap((r) => r.buttons.map((b) => [b.text, b.lines, b.fits, b.belowTwoLines])),
          rows.flatMap(() => [["Edit price", 1, true, true], ["Edit stock", 1, true, true]]));
        check(`${tag} stock list: Location stays on one line`, rows.map((r) => r.locationLines), rows.map(() => 1));
        check(`${tag} stock list: no sideways page scroll`, await overflow(page), 0);
        if (width !== "390") {
          check(`${tag} stock list: every column, Edit included, fits without scrolling the table`, await page.evaluate(() => {
            const table = [...document.querySelectorAll("main table")].find((t) => [...t.querySelectorAll("th")].some((th) => th.textContent.trim() === "Product / batch"));
            return table.parentElement.scrollWidth - table.parentElement.clientWidth;
          }), 0);
          check(`${tag} stock list: the batch state reads on at most two lines`, rows.map((r) => [r.name, r.stateLines <= 2]), rows.map((r) => [r.name, true]));
          const oneLine = rows.filter((r) => r.recordedLines.every((n) => n === 1));
          check(`${tag} stock list: a row whose Recorded as fits on one line is at most 112px tall`, oneLine.map((r) => [r.name, r.height <= 112]), oneLine.map((r) => [r.name, true]));
          check(`${tag} stock list: a row whose Recorded as wraps is at most 140px tall`, rows.map((r) => [r.name, r.height <= 140]), rows.map((r) => [r.name, true]));
        }
        if (width === "1440") check(`${tag} stock list: the product column takes the spare width, so every Recorded as line fits on one line`, rows.filter((r) => r.recordedLines.length).map((r) => [r.name, r.recordedLines]), [["Cap. Uprise D3 60000", [1]], ["Tab. Acnosis", [1]], ["Tab. Thyronorm 50", [1]]]);
        const summary = await page.evaluate(() => {
          const table = [...document.querySelectorAll("main table")].find((t) => t.caption?.textContent.includes("Value of matching batches"));
          const lines = (node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
          };
          return {
            heights: [...table.querySelectorAll("tr")].map((r) => Math.round(r.getBoundingClientRect().height)),
            headerLines: [...table.querySelectorAll("thead th")].map(lines),
            mostLinesInARow: [...table.querySelectorAll("tbody tr")].map((r) => [r.querySelector("th").textContent.trim(), Math.max(...[...r.children].map(lines))]),
          };
        });
        console.log(`NOTE ${tag} value summary row heights ${JSON.stringify(summary.heights)}`);
        check(`${tag} value summary: each heading reads on one line and a row holds at most its amount and one note`,
          [summary.headerLines, summary.mostLinesInARow],
          [[1, 1, 1, 1, 1], [["current", 2], ["expired", 1]]]);
        await shot(page, `${tag}-02b-stock-row-actions`);
        const uprise = stockRows(page).filter({ hasText: "Cap. Uprise D3 60000" });
        for (const [action, current] of [["Edit price", "Current selling price: ₹76.00"], ["Edit stock", "Current stock on shelf: 5 STRIPS"]]) {
          await uprise.getByRole("button", { name: action }).click();
          const dialog = page.getByRole("dialog");
          await dialog.waitFor();
          check(`${tag} ${action} opens its editor for that batch`,
            [clean(await dialog.getByRole("heading").first().innerText()), clean(await dialog.innerText()).includes("Cap. Uprise D3 60000"), clean(await dialog.innerText()).includes(current)],
            [action, true, true]);
          if (width === "1280" && who !== "admin") await shot(page, `${tag}-02c-${action.toLowerCase().replace(" ", "-")}-dialog`);
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "detached" });
        }
        check(`${tag} stock row actions: no console error or refused call`, [seen.errors, seen.refused], [[], []]);
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
      const units = page.getByRole("group", { name: "Unit of 40" });
      check("pharmacist-1280 a bare 40 prints with no unit and offers the units", [await preview(page), await page.getByRole("dialog").getByText("Unit missing: 40 could be mg or mcg").count(), clean(await units.innerText())], ["Tab. Telma 40", 1, "Which unit? mg mcg g IU %"]);
      await shot(page, "pharmacist-1280-04a-bare-number-unit-buttons");
      await submit(page);
      check("pharmacist-1280 a bare number is refused on the form", [clean(await page.getByRole("alert").first().innerText()), seen.posts.length], [UNIT_REFUSAL, 0]);
      await units.getByRole("button", { name: "mg", exact: true }).click();
      check("pharmacist-1280 pressing mg builds Tab. Telma 40 mg", [await preview(page), await page.locator("#medicine-strength").inputValue()], ["Tab. Telma 40 mg", "40 mg"]);
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
      await naming(page, { form: "TABLET", name: "Eltroxin", strength: "25" });
      check("admin-390 a bare 25 prints without a unit", await preview(page), "Tab. Eltroxin 25");
      check("admin-390 unit buttons fit the phone width", await overflow(page), 0);
      await shot(page, "admin-390-06a-unit-buttons-phone");
      await page.getByRole("group", { name: "Unit of 25" }).getByRole("button", { name: "mcg" }).click();
      check("admin-390 pressing mcg builds Tab. Eltroxin 25 mcg", await preview(page), "Tab. Eltroxin 25 mcg");
      await shot(page, "admin-390-06b-mcg-chosen");
      await submit(page);
      await page.getByRole("heading", { name: "Add Inventory Item" }).waitFor({ state: "detached" });
      const eltroxin = await db.inventoryItem.findFirst({ where: { branchId, brandName: "Eltroxin" } });
      check("admin-390 Eltroxin is saved as 25 mcg", eltroxin && [eltroxin.name, eltroxin.strength], ["Tab. Eltroxin 25 mcg", "25 mcg"]);
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
      check("Strength missing still lists the four (Augmentin is a combination, Telma has 40 mg)", page2.rows.map((r) => r.name).sort(), MISSING_STRENGTH);
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
      await result.locator(".font-medium").first().dispatchEvent("click");
      await page.waitForFunction(([i, value]) => document.querySelectorAll('input[placeholder="Search medicine name..."]')[i]?.value === value, [index, expected], { timeout: 30000 });
      await page.getByLabel(`Duration for ${expected}`).fill("14");
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
      const dialog = page.getByRole("dialog").filter({ hasText: "Download PDF" }).last();
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
      const response = page.waitForResponse((r) => /^\/api\/prescriptions(\/[^/]+)?$/.test(new URL(r.url()).pathname) && ["POST", "PATCH", "PUT"].includes(r.request().method()), { timeout: 120000 }).catch(() => null);
      await page.getByRole("button", { name: "Create Prescription" }).click();
      const answered = await response;
      console.log(`NOTE create prescription answered ${answered ? `${answered.status()} ${(await answered.text()).slice(0, 300)}` : "nothing"}`);
      const stay = page.getByRole("button", { name: "Stay Here" });
      if (await stay.waitFor({ timeout: 30000 }).then(() => true, () => false)) {
        await shot(page, "doctor-1280-12a-saved-go-to-pharmacy");
        await stay.click();
      }
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
