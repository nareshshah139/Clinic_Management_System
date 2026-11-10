// Change-request audit, pharmacy and inventory screens:
// CR-09, CR-10, CR-11, CR-12, CR-13, CR-14, CR-15, CR-17, CR-28, CR-29, CR-34 and the parked CR-30 / CR-32.
// Real backend, real frontend, real browser. Run: STACK_DATABASE_URL=postgresql://... node scripts/stack/scenarios/cr-audit-pharmacy.cjs
const { start, sleep, purchaseLine, buyAndSell } = require("./cr-audit-lib.cjs");

(async () => {
  const a = await start("cr-audit-pharmacy");
  const { stack, check, shot } = a;
  const tag = String(Date.now()).slice(-5);
  const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
  const admin = await a.tokenFor("admin");
  const pharmacist = await a.tokenFor("pharmacist");
  const doctor = await a.tokenFor("doctor");
  const mainText = async (page) => (await page.locator("main").first().innerText()).replace(/\s+/g, " ");
  const only = (process.env.CR_AUDIT_ONLY || "").split(",").filter(Boolean);
  const section = async (cr, run) => {
    if (only.length && !only.includes(cr)) return;
    try {
      await run();
    } catch (error) {
      check(cr, "run", "The audit step for this change request ran to the end", false, String(error.message || error).split("\n")[0].slice(0, 300));
    }
  };

  // ----- data made through the application's own API, so stock movements are real -----
  const serum = `Anaboom Pro Hair Growth Serum ${tag}`;
  const patient = await a.api(admin, "POST", "/patients", { name: `ANVITHA ${tag}`, phone: `97${tag}001`, gender: "F", age: 29 });
  const { item } = await buyAndSell(a, {
    name: serum, manufacturer: "Sun Pharmaceutical Industries Ltd", category: "Hair", form: "Serum", strength: "5%", packSize: "60", packUnit: "ml", hsn: "33059011", batch: "WWD0064",
    qty: 10, mrp: 1450, rate: 983.05, gst: 18, distributor: "Vasu Vaccines And Speciality Drugs", gstin: "36AAICV6140M1ZW", billNo: `SB-26-${tag}`, sell: [2], patient,
  });
  // one item stored the way the clinic's inventory holds names today (code, pack, capitals)
  const rawName = `13 74 | Flutas 150Mg(Pc) ${tag}`;
  await stack.db.inventoryItem.create({ data: { branchId: stack.branch.id, name: rawName, type: "MEDICINE", costPrice: 60, sellingPrice: 110, unit: "STRIPS", currentStock: 12, gstRate: 12, stockStatus: "IN_STOCK", status: "ACTIVE" } });

  const { page } = await a.session("owner");

  // ---------- left menu: CR-12, CR-17, CR-25 ----------
  await section("CR-12", async () => {
    await a.go(page, "/dashboard/inventory");
    const nav = page.locator('nav[aria-label="Main navigation"]');
    const entries = (await nav.locator("a").allTextContents()).map((t) => t.trim()).filter(Boolean);
    check("CR-12", "1", "One \"Inventory\" menu item; \"Inventory Updates\" removed", entries.filter((e) => e === "Inventory").length === 1 && !entries.includes("Inventory Updates"), `menu: ${entries.join(", ")}`);
    check("CR-12", "5", "\"Reorder targets\" is no longer a separate menu item", !entries.some((e) => /Reorder|Stock Predictions/i.test(e)));
    check("CR-17", "3", "\"Daily Collection\" tab in the main left-hand menu", entries.some((e) => /Daily Collection/i.test(e)), `menu: ${entries.join(", ")}`);
    check("CR-25", "1", "\"Sales\" is a main tab in the left menu", entries.includes("Sales"));
    await shot(page, "menu-inventory-home");
    await a.go(page, "/dashboard/inventory-updates");
    await sleep(800);
    check("CR-12", "1b", "The old Inventory Updates address opens the approval queue inside Inventory", /area=stock/.test(page.url()) && /view=approvals/.test(page.url()), page.url().replace(stack.base, ""));
  });

  // ---------- CR-13: taglines, font sizes, text-size setting ----------
  await section("CR-13", async () => {
    await a.go(page, "/dashboard/inventory");
    const home = await mainText(page);
    const named = ["Receive, review and manage pharmacy stock.", "Every action opens the matching records.", "Available quantity is at or below this batch's saved minimum.", "Drug prices and stock edits with doctor approval.", "Source pack size unspecified / Uncategorized"];
    const still = named.filter((t) => home.includes(t));
    check("CR-13", "1", "The grey taglines named in the request are removed from Inventory", still.length === 0, still.length ? `still shown: ${still.join(" | ")}` : "");
    await a.go(page, "/dashboard/pharmacy/sales");
    await page.locator('table[aria-label="Sales"] tbody tr').first().waitFor();
    const sizes = await page.evaluate(() => {
      const px = (el) => (el ? Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10 : null);
      const table = document.querySelector('table[aria-label="Sales"]');
      const cells = [...table.querySelectorAll("tbody tr:first-child td")].map(px);
      const all = [...document.querySelectorAll("main *")].filter((el) => el.children.length === 0 && (el.textContent || "").trim().length > 2 && el.getClientRects().length).map(px);
      return { body: px(document.body), tableCells: cells, heading: px(document.querySelector("main h1, main h2")), smallest: Math.min(...all), under16: all.filter((v) => v < 16).length, total: all.length, patient: px(table.querySelector("tbody tr:first-child td:nth-child(5)")) };
    });
    check("CR-13", "3a", "Body and table text at least 16 px", sizes.body >= 16 && sizes.tableCells.every((v) => v >= 16), `body ${sizes.body}px; Sales table cells ${[...new Set(sizes.tableCells)].join("/")}px`);
    check("CR-13", "3b", "Headings and patient names 18-20 px", sizes.heading >= 18 && sizes.patient >= 18, `page heading ${sizes.heading}px; patient name in the Sales table ${sizes.patient}px`);
    check("CR-13", "3c", "No text below 16 px on the Sales screen", sizes.under16 === 0, `${sizes.under16} of ${sizes.total} text elements are under 16px; smallest ${sizes.smallest}px`);
    await page.locator("header button").last().click().catch(() => {});
    const settingsButton = page.locator("header").getByRole("button").filter({ has: page.locator("svg.lucide-settings") });
    if (await settingsButton.count()) await settingsButton.first().click();
    await sleep(600);
    const whole = await page.locator("body").innerText();
    check("CR-13", "4", "Per-user Text size setting (Normal / Large / Extra large)", /Text size/i.test(whole) && /Extra large/i.test(whole), "no \"Text size\" control found in the header menus");
    await shot(page, "cr13-2-header-settings-open");
    await page.keyboard.press("Escape");
    await a.go(page, "/dashboard/inventory");
    await shot(page, "cr13-1-inventory-taglines");
  });

  // ---------- CR-29: stock optimisation ----------
  await section("CR-29", async () => {
    await a.go(page, "/dashboard/inventory");
    const home = await mainText(page);
    check("CR-29", "1", "Data-quality strip across the top of Inventory (missing location / category / HSN / min-max / unmapped)", /Missing Location|Missing Category|Missing HSN|Missing Min|Unmapped/i.test(home), "no strip on the Inventory screen");
    const tasks = [];
    for (const area of ["stock", "purchases", "reorder"]) {
      await a.go(page, `/dashboard/inventory?area=${area}`);
      tasks.push(...(await page.locator("main").first().locator("button, option, a").allTextContents()).map((t) => t.trim()).filter(Boolean));
    }
    const found = tasks.filter((t) => /optimi[sz]/i.test(t) || /slow.?moving|non.?moving/i.test(t));
    check("CR-29", "2", "\"Run optimization\" action that sorts slow-moving stock into returnable / non-returnable", found.length > 0, found.length ? found.join(", ") : "no Stock Optimization task in Stock, Purchases or Reorder");
    check("CR-29", "4", "Settable rules: non-moving days and minimum batch value", tasks.some((t) => /non.?moving days|minimum batch value/i.test(t)), "no such settings");
    await a.go(page, "/dashboard/inventory?area=stock&view=list");
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await sleep(600);
    const options = await page.locator("select").evaluateAll((selects) => {
      const pick = selects.find((s) => [...s.options].some((o) => /missing/i.test(o.textContent)) && s.options.length < 12 && s.options.length > 2);
      return pick ? [...pick.options].map((o) => o.textContent.trim()) : [];
    });
    check("CR-29", "1-partial", "What exists instead: a \"Missing information\" filter with counts, inside the Stock list's Filters panel", options.length > 0, options.join(" · "));
    const select = page.locator("select").filter({ has: page.locator("option", { hasText: /missing/i }) }).first();
    if (await select.count()) await select.scrollIntoViewIfNeeded();
    await shot(page, "cr29-2-missing-information-filter");
    await a.go(page, "/dashboard/inventory");
    await shot(page, "cr29-1-inventory-top-no-strip");
  });

  // ---------- CR-34: item page, batches and ledger ----------
  await section("CR-34", async () => {
    await a.go(page, `/dashboard/inventory?area=stock&view=list&item=${item.id}`);
    await page.getByRole("heading", { name: serum }).waitFor();
    const text = await mainText(page);
    const header = { "Manufacturer": /Sun Pharmaceutical/, "Item name": new RegExp(serum), "Pack description": /60\s?ml/i, "Current stock": /Current stock 8/, "Std. MRP": /Std\. MRP ₹1,450/, "GST %": /GST % 18%/, "HSN code": /HSN 33059011/, "GTIN (barcode)": /GTIN/, "Item category": /Category/, "Schedule": /Schedule/, "Location": /Location/, "Min qty": /Min qty/, "Max qty": /Max qty/, "Edit item button": /Edit item/, "Set stock alert button": /Set stock alert/ };
    const missing = Object.entries(header).filter(([, re]) => !re.test(text)).map(([k]) => k);
    check("CR-34", "header", "Item header shows manufacturer, name, pack, current stock, MRP, GST, HSN, GTIN, category, schedule, location, min/max qty, edit and stock-alert buttons", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : "");
    check("CR-34", "header-photo", "Product photo (click to zoom) in the header", (await page.locator("main img").count()) > 0, "no image on the item page");
    check("CR-34", "header-cess", "CESS shown in the header", /CESS/i.test(text));
    check("CR-34", "header-discount", "Min / Default / Max discount % and margin slab", /Min\.? Disc|Default Disc|Max\.? Disc/i.test(text), /Margin %/.test(text) ? "only a single \"Margin %\" figure" : "");
    const tabs = (await page.locator('[id^="item-tab-"]:not(#item-tab-panel)').allTextContents()).map((t) => t.trim());
    const wanted = ["Batches", "Purchases", "Purchase returns", "Sales", "Sales returns", "Ledger", "Blocked stock"];
    check("CR-34", "tabs", "Tabs: Batches · Purchases · Purchase Returns · Sales · Sales Returns · Ledger · Blocked Stock", wanted.every((w) => tabs.includes(w)), tabs.join(" · "));
    const panel = page.locator("#item-tab-panel");
    const batchHeaders = (await panel.locator("th").allTextContents()).map((t) => t.trim()).filter(Boolean);
    const batchWanted = [/Batch/i, /Qty/i, /Exp/i, /MRP/i, /PTR/i, /Disc/i, /Landing/i, /Margin/i, /Total by MRP/i, /Total by PTR/i, /GST/i];
    check("CR-34", "batches", "Batches tab columns: batch, qty, expiry, MRP, PTR, discount %, landing price, margin %, total by MRP, total by PTR, GST %", batchWanted.every((re) => batchHeaders.some((h) => re.test(h))), batchHeaders.join(" · "));
    check("CR-34", "batches-hide-zero", "\"Hide zero quantity\" tick box", (await page.getByLabel("Hide zero quantity").count()) === 1);
    check("CR-34", "batches-print", "Print label / QR for a batch", (await page.getByRole("button", { name: /Print label/i }).count()) > 0);
    await shot(page, "cr34-1-item-header-and-batches", { fullPage: true });
    await a.go(page, `/dashboard/inventory?area=stock&view=list&item=${item.id}&itemTab=ledger`);
    await page.locator("[data-ledger-row]").first().waitFor();
    const ledgerHeaders = (await panel.locator("th").allTextContents()).map((t) => t.trim()).filter(Boolean);
    const rows = await panel.locator("[data-ledger-row]").evaluateAll((trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim())));
    const ledgerWanted = [/Bill No/i, /Entry date/i, /Type|Transaction/i, /Batch/i, /^In/i, /^Out/i, /clos/i, /Customer|Distributor/i];
    check("CR-34", "ledger-columns", "Ledger columns: bill no., entry date, type, batch, in, out, closing balance, customer / distributor", ledgerWanted.every((re) => ledgerHeaders.some((h) => re.test(h))), ledgerHeaders.join(" · "));
    const flat = rows.map((r) => r.join(" | "));
    const hasPurchase = flat.some((r) => /Purchase/.test(r) && /Vasu Vaccines/.test(r));
    const hasSale = flat.some((r) => /Sale/.test(r) && r.includes(patient.name));
    check("CR-34", "ledger-rows", "Ledger lists the purchase (10 in) and the sale (2 out) of this item with who it was bought from / sold to", hasPurchase && hasSale, flat.join("  ||  ").slice(0, 400));
    const closingIndex = ledgerHeaders.findIndex((h) => /Item closing/i.test(h));
    const closings = rows.map((r) => Number(String(r[closingIndex]).replace(/[^\d.-]/g, "")));
    check("CR-34", "ledger-balance", "Running closing balance ends at the current stock (8)", closings.includes(8) && closings.includes(10) && !/Ledger does not match/.test(await mainText(page)), `closing balances: ${closings.join(", ")}`);
    check("CR-34", "ledger-filters", "Date-range filter, transaction-type filter and Download on the ledger", (await panel.locator('input[type="date"]').count()) >= 2 && (await panel.locator("select").count()) >= 1 && (await panel.getByRole("button", { name: /Download/i }).count()) === 1);
    await panel.scrollIntoViewIfNeeded();
    await shot(page, "cr34-2-item-ledger", { fullPage: true });
  });

  // ---------- CR-10: movement log, export, merge ----------
  await section("CR-10", async () => {
    await a.go(page, "/dashboard/inventory?area=stock&view=ledger");
    const ledger = page.locator('section[aria-label="Stock ledger"]');
    await ledger.waitFor();
    await sleep(1200);
    const text = (await ledger.innerText()).replace(/\s+/g, " ");
    check("CR-10", "5", "Every stock movement is logged with date, user and reason (purchase and billing shown)", /Purchase/i.test(text) && /Sale/i.test(text) && text.includes("Anil Deshmukh"), text.slice(0, 260));
    await shot(page, "cr10-1-stock-ledger");
    await a.go(page, "/dashboard/inventory?area=stock&view=list");
    check("CR-10", "3a", "Stock list can be exported (Excel/CSV) for a physical stock take", (await page.getByRole("button", { name: "Export all matching stock" }).count()) === 1);
    const stockText = await mainText(page);
    check("CR-10", "3b", "A filled stock-take file can be imported to reset counts", /Import (stock take|counts|counted)/i.test(stockText), "only \"Opening stock import\" exists; counts are entered on screen (Stock counts)");
    check("CR-10", "4", "Duplicate items can be merged", /Merge/i.test(stockText), "no Merge action on the stock list");
  });

  // ---------- CR-11: medicine name format ----------
  await section("CR-11", async () => {
    await a.go(page, "/dashboard/inventory?area=stock&view=list");
    await page.getByRole("button", { name: "Add batch" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const labels = (await dialog.locator("label").allTextContents()).map((t) => t.trim()).filter(Boolean);
    check("CR-11", "1", "New-item form stores form, brand name, strength, pack size and item code as separate fields", ["Form", "Strength"].every((w) => labels.some((l) => new RegExp(`\\b${w}\\b`, "i").test(l))), `fields: ${labels.join(" · ")}`);
    check("CR-11", "4", "\"Combination product\" tick box on the new-item form", labels.some((l) => /Combination/i.test(l)));
    await shot(page, "cr11-1-new-item-form");
    await page.keyboard.press("Escape");
    const { page: rx } = await a.session("doctor");
    await a.go(rx, `/dashboard/visits?patientId=${patient.id}&doctorId=${stack.users.doctor.id}&autoStart=true`);
    await rx.getByRole("tab", { name: /Prescription/ }).first().click();
    const treatment = rx.locator("#section-treatment-content");
    await treatment.getByRole("button", { name: "Add Row", exact: true }).click();
    await treatment.getByPlaceholder("Search medicine name...").first().pressSequentially("Flutas", { delay: 60 });
    await rx.getByText(rawName).first().waitFor({ timeout: 20000 });
    const offered = (await rx.locator("body").innerText()).split("\n").filter((l) => /Flutas/i.test(l)).map((l) => l.trim());
    check("CR-11", "5", "Rx picker shows the standard name (\"Tab. Flutas 150 mg\"), without code or pack size", offered.some((l) => /^Tab\. Flutas 150 mg/.test(l)) && !offered.some((l) => l.includes("13 74")), `picker offers: ${[...new Set(offered)].join(" / ")}`);
    await treatment.scrollIntoViewIfNeeded();
    await shot(rx, "cr11-2-rx-picker-raw-name");
    // pick it and print: codes and pack sizes must not print
    await rx.getByText(rawName).first().click();
    await sleep(500);
    // second medicine: the stocked serum, then a free-text one the pharmacy does not hold
    await treatment.getByRole("button", { name: "Add Row", exact: true }).click();
    await treatment.locator("tbody tr").nth(1).getByPlaceholder("Search medicine name...").pressSequentially("Anaboom", { delay: 60 });
    await rx.getByText(serum).first().click({ timeout: 20000 });
    await treatment.getByRole("button", { name: "Add Row", exact: true }).click();
    await treatment.locator("tbody tr").nth(2).getByPlaceholder("Search medicine name...").fill("Bilashine 20");
    await rx.keyboard.press("Escape");
    for (let i = 0; i < 3; i++) await treatment.locator("tbody tr").nth(i).locator('input[type="number"]').fill("10");
    await rx.locator("#section-chief-complaints-content textarea").first().fill("Hair fall for 2 months");
    await rx.getByRole("button", { name: "Print Preview", exact: true }).click();
    await rx.waitForSelector("#pagedjs-container .pagedjs_page", { timeout: 90000 });
    await sleep(1500);
    const printed = await rx.evaluate(() => document.querySelector("#pagedjs-container").textContent);
    check("CR-11", "2", "Codes and pack sizes never print on the prescription", !printed.includes("13 74") && !/150Mg\(Pc\)/.test(printed), printed.includes("13 74") ? `prints "${rawName}"` : "");
    await shot(rx.locator("#pagedjs-container .pagedjs_page").first(), "cr11-3-print-shows-raw-name");
    await rx.getByRole("button", { name: "Close", exact: true }).first().click().catch(() => {});
    await rx.keyboard.press("Escape");
    await sleep(500);
    await rx.getByRole("button", { name: "Create Prescription", exact: true }).click();
    await rx.getByRole("button", { name: "Stay Here" }).click({ timeout: 30000 });
  });

  // ---------- CR-09 + CR-10: pending prescription, stock column, Load ----------
  await section("CR-09", async () => {
    const { page: desk } = await a.session("pharmacist");
    await a.go(desk, "/dashboard/pharmacy/sales/bill");
    const row = desk.locator("tr, li, [role='row']").filter({ hasText: patient.name }).first();
    await row.waitFor({ timeout: 60000 });
    const rowText = (await row.innerText()).replace(/\s+/g, " ");
    check("CR-10", "6", "Stock column shows each prescribed item's status with quantity (In stock / Low / Out / Not linked)", /In stock/i.test(rowText) && /Not linked|No match/i.test(rowText), rowText.slice(0, 300));
    check("CR-10", "7", "Refresh button re-checks stock and matching", (await desk.getByRole("button", { name: "Refresh prescription queue" }).count()) === 1 && (await desk.getByRole("button", { name: new RegExp(`Refresh stock for ${patient.name}`) }).count()) === 1);
    check("CR-10", "2", "Free-text items can be linked to an inventory item by the pharmacist (\"Link item\")", /Link item/.test(rowText) && /Change link/.test(rowText), (rowText.match(/Link item|Change link/g) || []).join(", "));
    await row.scrollIntoViewIfNeeded();
    await shot(desk, "cr10-2-pending-queue-stock-column");
    await row.getByRole("button", { name: "Load", exact: true }).click();
    const bill = desk.locator('[aria-label="Prescription bill"]');
    await bill.waitFor({ timeout: 60000 });
    await sleep(2500);
    const billText = (await bill.innerText()).replace(/\s+/g, " ");
    const values = await bill.locator("input").evaluateAll((inputs) => inputs.map((i) => i.value).join(" | "));
    const all = `${billText} ${values}`;
    check("CR-09", "1", "Load opens the bill with the prescribed items and quantities", all.includes(serum) && all.includes("Bilashine 20") && all.includes(patient.name), `bill for ${patient.name}`);
    check("CR-09", "2", "Unmatched / out-of-stock items are loaded but flagged for the pharmacist", /No match|Out of stock|Not linked|link inventory/i.test(billText), (billText.match(/No match|Out of stock|Insufficient stock|link inventory before billing/gi) || []).join(", "));
    check("CR-10", "1", "The stocked medicine arrives linked to its inventory item (by ID)", /In stock|Low stock/i.test(billText) || !new RegExp(`${serum}[^|]{0,80}No match`).test(billText));
    await bill.scrollIntoViewIfNeeded();
    await shot(desk, "cr09-1-prescription-loaded-into-bill", { fullPage: true });
  });

  // ---------- CR-12: price / stock edit with reason, doctor approval, Today ----------
  await section("CR-12", async () => {
    const { page: staff } = await a.session("pharmacist");
    await a.go(staff, `/dashboard/inventory?area=stock&view=list&item=${item.id}`);
    await staff.getByRole("button", { name: "Edit stock", exact: true }).click();
    const dialog = staff.getByRole("dialog");
    await dialog.waitFor();
    await dialog.locator('input[type="number"]').first().fill("7");
    await dialog.locator("textarea, input[type='text']").last().fill("Shelf count on 10 Nov: one bottle damaged");
    await shot(staff, "cr12-1-edit-stock-with-reason");
    await dialog.getByRole("button", { name: /Submit for approval/ }).click();
    await sleep(1500);
    const held = (await stack.db.inventoryItem.findUnique({ where: { id: item.id } })).currentStock;
    check("CR-12", "2", "Stock edit (with reason) is made from the Inventory Stock tab and waits for approval", held === 8, `stock still ${held} after the pharmacist's edit`);
    await a.go(page, "/dashboard/inventory");
    const todayText = await mainText(page);
    check("CR-12", "3a", "Pending edits show in Today → What needs attention", /1 Price\/stock edits awaiting approval \(1\)/.test(todayText), (todayText.match(/\d+ Price\/stock edits awaiting approval \(\d+\)/) || [""])[0]);
    await shot(page, "cr12-2-today-pending-edit");
    const { page: approver } = await a.session("doctor");
    await a.go(approver, "/dashboard/inventory?area=stock&view=approvals");
    const approve = approver.getByRole("button", { name: "Approve", exact: true });
    await approve.first().waitFor({ timeout: 60000 });
    await shot(approver, "cr12-3-doctor-approval-queue");
    await approve.first().click();
    let after = held;
    for (let i = 0; i < 20 && after === held; i++) {
      await sleep(1000);
      const confirm = approver.getByRole("dialog").getByRole("button", { name: /Approve|Confirm/ });
      if (i === 1 && (await confirm.count())) await confirm.first().click();
      after = (await stack.db.inventoryItem.findUnique({ where: { id: item.id } })).currentStock;
    }
    await shot(approver, "cr12-5-after-doctor-approves");
    check("CR-12", "3b", "Stock changes only when a doctor approves the edit", after === 7, `stock ${held} -> ${after} after the doctor approved`);
    await a.go(page, "/dashboard/inventory?area=stock&view=list");
    const names = await mainText(page);
    check("CR-12", "4", "Stock tab lists the clinic's own items, not the full drug catalogue", names.includes(serum) || /Adapalene Gel 15g/.test(names), `${await stack.db.inventoryItem.count()} clinic stock rows in this database`);
    await shot(page, "cr12-4-stock-tab-clinic-items");
    await a.go(page, "/dashboard/inventory?area=stock&view=COUNT");
    check("CR-12", "6", "Physical counts (stock take) live under Stock → Stock counts", /My counts|Count an item/.test(await mainText(page)));
  });

  // ---------- CR-14 + CR-15: purchase-invoice product matching (the real matching service) ----------
  await section("CR-14", async () => {
    const master = (body) => a.api(admin, "POST", "/drugs", body).catch(() => null);
    await master({ name: "Zitcare Forte Capsule", price: 310, manufacturerName: "SLV Pharma", packSizeLabel: "15 capsules", category: "Supplement", composition1: "Multivitamin", dosageForm: "Capsule", strength: "1 cap" });
    await master({ name: "Abzorb 1% Cream", price: 429, manufacturerName: "Sun Pharma", packSizeLabel: "50 ml", category: "Antifungal", composition1: "Clotrimazole", dosageForm: "Cream", strength: "1%" });
    const lineFor = (productName, manufacturer, packSize, mrp) => ({ ...purchaseLine(productName, manufacturer, packSize, "Strip", "3004", "B1", 5, mrp, mrp * 0.7, 12) });
    const result = await a.api(pharmacist, "POST", "/pharmacy/purchase-invoices/master-matches", {
      items: [lineFor("ZITCARE FORT CAPSULE, 15's", "SLV Pharma", "15's", 310), lineFor("ZITCARE FORT CAPSULE", "SLV Pharma", "15 capsules", 310), lineFor("Moisturex Hydra Gel Cream, 50 ml", "Sun Pharma", "50 ml", 429)],
    });
    const [asInvoiced, cleaned, moisturex] = result.matches;
    const top = (m) => (m.candidates && m.candidates[0] ? m.candidates[0].name || m.candidates[0].drug?.name : "none");
    check("CR-14", "check", "Invoice line \"ZITCARE FORT CAPSULE, 15's\" (as SLV Pharma prints it) finds the saved \"Zitcare Forte Capsule\" as the top match", String(top(asInvoiced)).includes("Zitcare Forte"), `top candidate: ${top(asInvoiced)}; label: ${asInvoiced.matchLabel}; action: ${asInvoiced.recommendedAction}`);
    check("CR-14", "2", "Small spelling differences tolerated: \"ZITCARE FORT CAPSULE\" with the pack typed as \"15 capsules\" finds Zitcare Forte", String(top(cleaned)).includes("Zitcare Forte"), `top candidate: ${top(cleaned)}; label: ${cleaned.matchLabel}`);
    check("CR-14", "4", "No \"create new\" recommendation when a same-brand item exists", asInvoiced.recommendedAction !== "CREATE_NEW", `recommended action for the invoice line: ${asInvoiced.recommendedAction}`);
    check("CR-15", "1", "Manufacturer / MRP / pack alone never qualifies: Abzorb is not suggested for Moisturex", (moisturex.candidates || []).length === 0, `candidates: ${(moisturex.candidates || []).length}`);
    check("CR-15", "2", "No real match → \"Not in inventory\" with create new item as the action", moisturex.matchLabel === "Not in inventory" && moisturex.recommendedAction === "CREATE_NEW", `label: ${moisturex.matchLabel}; action: ${moisturex.recommendedAction}`);
    check("CR-15", "4", "Plain labels instead of scores", ["Same product", "Possible match", "Not in inventory"].includes(asInvoiced.matchLabel) || ["Same product", "Possible match", "Not in inventory"].includes(cleaned.matchLabel), `labels returned: ${[asInvoiced.matchLabel, cleaned.matchLabel, moisturex.matchLabel].join(", ")}`);
    const abzorb = await stack.db.drug.findFirst({ where: { name: "Abzorb 1% Cream" } });
    let refusal = "";
    try {
      await a.api(pharmacist, "POST", "/pharmacy/purchase-invoices/master-confirmations", { action: "MATCH_EXISTING", drugId: abzorb.id, item: lineFor("Moisturex Hydra Gel Cream, 50 ml", "Sun Pharma", "50 ml", 429) });
    } catch (error) {
      refusal = `${error.status} ${JSON.stringify(error.data).slice(0, 200)}`;
    }
    check("CR-15", "3", "Confirming Moisturex against Abzorb is refused with a mismatch warning unless acknowledged", /409/.test(refusal) && /MISMATCH|differ/i.test(refusal), refusal || "the confirmation was accepted");
  });

  // ---------- CR-28: Terms of Trade, who can edit ----------
  await section("CR-28", async () => {
    const { page: staff } = await a.session("pharmacist");
    await a.go(staff, "/dashboard/inventory?area=purchases&view=terms");
    await staff.getByRole("note").waitFor({ timeout: 60000 });
    const note = await staff.getByRole("note").innerText();
    check("CR-28", "5a", "Staff see Terms of Trade read-only", /Read-only/.test(note) && (await staff.getByRole("button", { name: "Add terms" }).count()) === 0, note);
    await shot(staff, "cr28-1-terms-read-only-for-pharmacist");
    let denied = "";
    try {
      await a.api(pharmacist, "PUT", "/pharmacy/trade-terms", { supplierId: "x", terms: [] });
    } catch (error) {
      denied = String(error.status);
    }
    check("CR-28", "5b", "The server refuses a staff member's attempt to save terms", denied === "403", `PUT /pharmacy/trade-terms as pharmacist -> ${denied}`);
    const { page: editor } = await a.session("doctor");
    await a.go(editor, "/dashboard/inventory?area=purchases&view=terms");
    await editor.getByRole("button", { name: "Add terms" }).waitFor({ timeout: 60000 });
    check("CR-28", "5c", "Doctors can add and edit terms", (await editor.getByRole("note").count()) === 0);
    await editor.getByRole("button", { name: "Add terms" }).click();
    await sleep(800);
    const steps = (await editor.locator("main").first().innerText()).replace(/\s+/g, " ");
    check("CR-28", "3", "Entry flow in steps: Distributor → Items → Scheme, distributor searchable by name or GSTIN", /Distributor/.test(steps) && /Items/.test(steps) && /Scheme/.test(steps) && /Name or GSTIN/i.test(steps + (await editor.locator("input").evaluateAll((i) => i.map((x) => x.placeholder + " " + (x.getAttribute("aria-label") || "")).join(" ")))));
    await shot(editor, "cr28-2-add-terms-steps-for-doctor");
    const purchasesText = steps + (await editor.locator("main").first().locator("option").allTextContents()).join(" ");
    check("CR-28", "phase2-1", "Phase 2: a setting to turn on automatic purchase checking against saved terms", /automatic (purchase )?checking|auto.?check/i.test(purchasesText), "no such setting");
  });

  // ---------- parked items that exist anyway ----------
  await section("CR-30", async () => {
    let outcome = "";
    try {
      const created = await a.api(pharmacist, "POST", "/inventory/items", { name: `Staff Requested Lotion ${tag}`, type: "MEDICINE", costPrice: 100, sellingPrice: 150, unit: "BOTTLES" });
      outcome = created.status || "created directly";
    } catch (error) {
      outcome = String(error.message).slice(0, 120);
    }
    check("CR-30", "parked", "PARKED item, built anyway: a staff member's new item becomes a request for doctor approval", outcome === "PENDING_APPROVAL", `POST /inventory/items as pharmacist -> ${outcome}`);
    await a.go(page, "/dashboard/inventory?area=stock&view=approvals");
    const newItems = page.getByRole("tab", { name: /New items/ });
    if (await newItems.count()) await newItems.first().click();
    else await page.getByRole("button", { name: /New items/ }).first().click();
    await sleep(1000);
    check("CR-30", "parked-ui", "The doctor's approval queue lists the requested item with Approve / Reject", (await mainText(page)).includes(`Staff Requested Lotion ${tag}`));
    await shot(page, "cr30-new-item-approval-queue");
    await a.go(page, "/dashboard/inventory?area=reorder&view=TARGET_REVIEW");
    const reorder = await mainText(page);
    check("CR-32", "parked", "PARKED item, partly built: min/max proposals worked out from sales history (rule-based, not AI)", /Generate target proposal/i.test(reorder), "\"Generate target proposal\" under Reorder");
    await shot(page, "cr32-reorder-target-proposals");
  });

  // ---------- CR-17: appointments calendar ----------
  await section("CR-17", async () => {
    const tomorrow = new Date(Date.now() + 19800000 + 86400000).toISOString().slice(0, 10);
    let appointment = null;
    let reason = "";
    for (const slot of ["10:00-10:30", "11:00-11:30", "16:00-16:30", "17:00-17:30"]) {
      try {
        appointment = await a.api(admin, "POST", "/appointments", { patientId: patient.id, doctorId: stack.users.doctor.id, date: tomorrow, slot, visitType: "OPD" });
        break;
      } catch (error) {
        reason = String(error.message).slice(0, 160);
      }
    }
    await a.go(page, "/dashboard/appointments");
    const dateInput = page.locator('input[type="date"]').first();
    for (let i = 0; i < 5 && (await dateInput.inputValue()) !== tomorrow; i++) {
      await sleep(1500);
      await dateInput.fill(tomorrow);
    }
    await sleep(2500);
    const blocks = page.locator("[data-appointment-block]");
    if (await blocks.count()) await blocks.first().scrollIntoViewIfNeeded();
    const count = await blocks.count();
    const rowText = count ? (await blocks.first().innerText()).replace(/\s+/g, " ") : "";
    check("CR-17", "1", "Each appointment row shows its billing information", count > 0 && /₹|Paid|Unpaid|Billed|Due/i.test(rowText), count ? `row shows: ${rowText}` : `no appointment row on screen (${appointment ? "appointment created" : reason})`);
    check("CR-17", "2", "Each row shows the bill type (first consultation / review / procedure bill)", count > 0 && /consultation bill|review bill|procedure bill|first consultation/i.test(rowText), count ? "row carries only the visit type and a FOLLOW-UP flag" : "");
    await shot(page, "cr17-1-appointments-day-calendar");
    await a.go(page, "/dashboard/pharmacy/reports?report=daily-collection");
    await sleep(1500);
    check("CR-17", "3-partial", "What exists instead: a Daily collection report under Pharmacy Report (pharmacy takings only)", /Daily collection/i.test(await mainText(page)));
    await shot(page, "cr17-2-daily-collection-report-in-pharmacy-report");
  });

  await a.finish("cr-audit-pharmacy");
})().catch((error) => {
  console.error("CRASH", error);
  process.exit(1);
});
