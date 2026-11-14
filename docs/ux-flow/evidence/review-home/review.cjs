// Throwaway review script for ux/home. Boots its own stack, always stops it.
const fs = require("node:fs");
const path = require("node:path");
const WT = "/home/user/wt/home";
const { chromium } = require(require.resolve("playwright", { paths: [WT] }));
const { bootStack } = require(path.join(WT, "scripts/stack/boot.cjs"));
const { seed } = require(path.join(WT, "scripts/ux/journeys/seed.cjs"));
const OUT = __dirname;
const SHOTS = path.join(OUT, "shots");
const results = {};
const log = (k, v) => { results[k] = v; console.log(`== ${k}:`, typeof v === "string" ? v : JSON.stringify(v, null, 1).slice(0, 3000)); fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2)); };

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 60; i++) {
    const loading = await page.locator('[role="status"]:has-text("Loading")').count().catch(() => 0);
    if (!loading) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
}

async function session(browser, stack, who, viewport = { width: 1366, height: 850 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const bad = [];
  const consoleErrors = [];
  page.on("response", (r) => { if ([401, 403, 500].includes(r.status()) || r.status() >= 500) bad.push(`${r.status()} ${r.request().method()} ${r.url().replace(stack.base, "")}`); });
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  const user = stack.users[who];
  await page.goto(`${stack.base}/login`, { waitUntil: "domcontentloaded", timeout: 90000 });
  const signIn = () => page.evaluate(async ({ identifier, password }) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) })).status, { identifier: user.email, password: user.password });
  let st = await signIn();
  for (let i = 0; st === 429 && i < 15; i++) { await page.waitForTimeout(10000); st = await signIn(); }
  if (st !== 201) throw Error(`login ${who} ${st}`);
  const api = (p, opts = {}) => page.evaluate(async ({ p, opts }) => {
    const r = await fetch(`/api${p}`, { method: opts.method || "GET", headers: { "Content-Type": "application/json" }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let body; try { body = await r.json(); } catch { body = null; }
    return { status: r.status, body };
  }, { p, opts });
  return { ctx, page, bad, consoleErrors, api };
}

async function mainText(page) {
  return page.locator("main").innerText().catch(() => page.locator("body").innerText());
}

async function bell(page) {
  await page.getByRole("button", { name: "Notifications" }).click();
  await page.waitForTimeout(800);
  const items = await page.locator('[role="menuitem"]').allInnerTexts();
  await page.keyboard.press("Escape");
  return items.map((t) => t.replace(/\n/g, " | "));
}

(async () => {
  const stack = await bootStack({ label: "review-home" });
  const browser = await chromium.launch();
  try {
    const seeded = await seed(stack);
    log("today", seeded.today);
    const db = stack.db;
    // extra roles
    const owner = await db.user.findUnique({ where: { id: stack.users.owner.id } });
    const { ROLE_PERMISSIONS } = (() => { require(require.resolve("ts-node", { paths: [path.join(WT, "backend"), WT] })).register({ transpileOnly: true, project: path.join(WT, "backend/tsconfig.json") }); return require(path.join(WT, "backend/src/shared/access/role-permissions.ts")); })();
    for (const role of ["ADMIN", "MANAGER", "NURSE", "ACCOUNTANT", "LAB_TECH"]) {
      const key = role.toLowerCase();
      const u = await db.user.create({ data: { branchId: stack.branch.id, email: `${key}@stack.example.invalid`, firstName: `Test${role[0]}${role.slice(1).toLowerCase().replace("_", "")}`, lastName: "User", role, password: owner.password, permissions: JSON.stringify(ROLE_PERMISSIONS[role]) } });
      stack.users[key] = { id: u.id, email: u.email, password: stack.users.owner.password, role, firstName: u.firstName };
    }
    // second doctor with an appointment today, to check doctor list filtering and desk naming
    const doc2 = await db.user.create({ data: { branchId: stack.branch.id, email: "doc2@stack.example.invalid", firstName: "Kunal", lastName: "Rao", role: "DOCTOR", password: owner.password, permissions: "[]" } });
    await db.appointment.create({ data: { branchId: stack.branch.id, doctorId: doc2.id, patientId: seeded.patients[9].id, date: new Date(seeded.today), slot: "13:00-13:15", status: "CONFIRMED", visitType: "OPD", tokenNumber: 1 } });

    // ---------- 1. Every role's landing page ----------
    const roles = ["reception", "doctor", "pharmacist", "owner", "admin", "manager", "nurse", "accountant", "lab_tech"];
    for (const who of roles) {
      const s = await session(browser, stack, who);
      try {
        await s.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90000 });
        await settle(s.page);
        await s.page.screenshot({ path: path.join(SHOTS, `${who}-desktop.png`), fullPage: true });
        const text = await mainText(s.page);
        let bellItems = [];
        try { bellItems = await bell(s.page); } catch (e) { bellItems = [`bell error ${e.message}`]; }
        const headerHasGear = await s.page.getByRole("button", { name: "Open settings" }).count();
        const navLinks = await s.page.locator('[data-tour="sidebar"] a, nav a').allInnerTexts().catch(() => []);
        await s.page.setViewportSize({ width: 390, height: 844 });
        await s.page.reload({ waitUntil: "domcontentloaded" });
        await settle(s.page);
        await s.page.screenshot({ path: path.join(SHOTS, `${who}-phone.png`), fullPage: true });
        const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        log(`landing:${who}`, { text, bad: s.bad, consoleErrors: s.consoleErrors, bell: bellItems, gear: headerHasGear, nav: [...new Set(navLinks.map((t) => t.trim()).filter(Boolean))], phoneOverflowPx: overflow });
      } catch (e) {
        log(`landing:${who}:error`, String(e.stack || e));
      } finally { await s.ctx.close(); }
    }

    // ---------- 2. Money and stock: before ----------
    const own = await session(browser, stack, "owner");
    const figures = async () => {
      const alerts = await own.api("/reports/alerts");
      const dc = await own.api(`/pharmacy/reports/daily-collection?from=${seeded.today}`);
      const low = await own.api("/inventory/workspace/stock?stock=LOW&limit=100");
      const exp = await own.api("/inventory/workspace/stock?expiryMonths=3&limit=100");
      const overview = await own.api("/inventory/workspace/overview");
      const outstanding = await own.api("/billing/invoices/outstanding?limit=100");
      await own.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await settle(own.page);
      const landing = await mainText(own.page);
      const bellItems = await bell(own.page);
      return {
        alertsCounts: alerts.body?.counts, billsDueBalance: alerts.body?.billsDueBalance,
        billsDue: (alerts.body?.billsDue || []).map((b) => `${b.patient?.name} ${b.balance} ${b.status} ${b.billDate}`),
        alertsLow: (alerts.body?.lowStockAlerts || []).map((i) => `${i.itemName}:${i.currentStock}`),
        alertsExp: (alerts.body?.expiryAlerts || []).map((i) => `${i.itemName}:${i.daysUntilExpiry}`),
        dcWhole: dc.body?.wholeDay, dcStatus: dc.status,
        invLowTotal: low.body?.total, invLowNames: (low.body?.rows || []).map((r) => r.name), invExpTotal: exp.body?.total,
        overviewLow: overview.body?.lowStock, overviewExp: overview.body?.expiring,
        outstanding: (outstanding.body?.data || outstanding.body?.invoices || outstanding.body || []).map?.((i) => `${i.patient?.name} bal=${i.balance} status=${i.status}`),
        landing, bellItems,
      };
    };
    log("money:before", await figures());
    await own.page.goto(`${stack.base}/dashboard/pharmacy/reports?report=daily-collection`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await settle(own.page);
    await own.page.screenshot({ path: path.join(SHOTS, "owner-daily-collection-before.png"), fullPage: true });
    log("dc-page:before", (await mainText(own.page)).slice(0, 1500));

    // ---------- 3. Create a clinic bill with a part payment (reception) and a pharmacy sale (pharmacist) ----------
    const rec = await session(browser, stack, "reception");
    const inv = await rec.api("/billing/invoices", { method: "POST", body: { patientId: seeded.patients[7].id, appointmentId: seeded.appointments.today[7].id, items: [{ name: "Dermatology Consultation", description: "Dermatology Consultation", quantity: 1, unitPrice: 700, gstRate: 0, discount: 0 }] } });
    log("create-clinic-bill", { status: inv.status, id: inv.body?.id, total: inv.body?.total, statusField: inv.body?.status, err: inv.status >= 300 ? inv.body : undefined });
    const pay = await rec.api("/billing/payments", { method: "POST", body: { invoiceId: inv.body?.id, amount: 300, method: "UPI" } });
    log("part-payment", { status: pay.status, err: pay.status >= 300 ? pay.body : undefined });
    const row = await db.newInvoice.findUnique({ where: { id: inv.body?.id }, select: { status: true, balance: true, received: true } }).catch(() => null);
    log("clinic-bill-row-after-payment", row);

    const ph = await session(browser, stack, "pharmacist");
    const sun = await db.inventoryItem.findFirst({ where: { name: { startsWith: "Sunscreen" } }, select: { id: true, name: true, currentStock: true, minStockLevel: true, sellingPrice: true, mrp: true, drugId: true } }).catch(async () => db.inventoryItem.findFirst({ where: { name: { startsWith: "Sunscreen" } } }));
    log("sunscreen-before", sun);
    const qty = Math.max(1, (sun.currentStock - sun.minStockLevel) + 1);
    const sale = await ph.api("/pharmacy/invoices/checkout", { method: "POST", body: { requestKey: `review-${Date.now()}`, patientId: seeded.patients[2].id, paymentMethod: "CASH", billingName: seeded.patients[2].name, billingPhone: seeded.patients[2].phone, items: [{ inventoryItemId: sun.id, drugId: sun.drugId || undefined, quantity: qty, unitPrice: 520 }] } });
    log("pharmacy-sale", { status: sale.status, qty, total: sale.body?.totalAmount ?? sale.body?.invoice?.totalAmount, err: sale.status >= 300 ? sale.body : undefined });
    log("sunscreen-after", await db.inventoryItem.findMany({ where: { name: { startsWith: "Sunscreen" } }, select: { currentStock: true, minStockLevel: true, heldStock: true } }));

    log("money:after", await figures());
    await own.page.goto(`${stack.base}/dashboard/pharmacy/reports?report=daily-collection`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await settle(own.page);
    await own.page.screenshot({ path: path.join(SHOTS, "owner-daily-collection-after.png"), fullPage: true });
    log("dc-page:after", (await mainText(own.page)).slice(0, 1500));
    await own.page.goto(`${stack.base}/dashboard/inventory?area=stock&view=list&stock=LOW`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await settle(own.page);
    await own.page.screenshot({ path: path.join(SHOTS, "owner-inventory-low.png"), fullPage: false });
    log("inventory-low-page", (await mainText(own.page)).slice(0, 1500));

    // reception & pharmacist landing after
    await rec.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await settle(rec.page);
    log("reception:after", { text: await mainText(rec.page), bell: await bell(rec.page) });
    await ph.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await settle(ph.page);
    log("pharmacist:after", { text: await mainText(ph.page), bell: await bell(ph.page) });

    // ---------- 4. Links ----------
    const follow = async (s, locator, name) => {
      await s.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await settle(s.page);
      try {
        await locator(s.page).first().click({ timeout: 15000 });
        await s.page.waitForTimeout(1500);
        await settle(s.page);
        const url = s.page.url().replace(stack.base, "");
        const file = `link-${name.replace(/[^a-z0-9]+/gi, "_")}.png`;
        await s.page.screenshot({ path: path.join(SHOTS, file) });
        const t = (await mainText(s.page)).slice(0, 400).replace(/\n+/g, " | ");
        return { url, file, text: t };
      } catch (e) { return { error: e.message.split("\n")[0] }; }
    };
    const links = {};
    links.ownerCollection = await follow(own, (p) => p.getByRole("link", { name: "Today's collection" }), "owner-collection");
    links.ownerBillRowEarlier = await follow(own, (p) => p.getByRole("list", { name: "Bills due" }).getByRole("link", { name: /Aditya/ }), "owner-bill-aditya");
    links.ownerApprovals = await follow(own, (p) => p.getByRole("link", { name: "Waiting for approval" }), "owner-approvals");
    links.ownerLow = await follow(own, (p) => p.getByRole("link", { name: /^Low stock/ }), "owner-low");
    links.ownerExp = await follow(own, (p) => p.getByRole("link", { name: /^Expiring in 3 months/ }), "owner-exp");
    links.ownerViewAll = await follow(own, (p) => p.getByRole("button", { name: "View All Appointments" }), "owner-viewall");
    links.recBook = await follow(rec, (p) => p.getByRole("link", { name: "Book appointment" }), "rec-book");
    links.recNew = await follow(rec, (p) => p.getByRole("link", { name: "New patient" }), "rec-new");
    links.recBillRowEarlier = await follow(rec, (p) => p.getByRole("list", { name: "Bills to collect" }).getByRole("link", { name: /Aditya/ }), "rec-bill-aditya");
    links.recViewAll = await follow(rec, (p) => p.getByRole("button", { name: "View All Appointments" }), "rec-viewall");
    links.phBill = await follow(ph, (p) => p.getByRole("link", { name: "Bill", exact: true }), "ph-bill");
    links.phNewSale = await follow(ph, (p) => p.getByRole("link", { name: "New sale" }), "ph-newsale");
    links.phLow = await follow(ph, (p) => p.getByRole("link", { name: /^Low stock/ }), "ph-low");
    links.phExp = await follow(ph, (p) => p.getByRole("link", { name: /^Expiring/ }), "ph-exp");
    // reception bill chip on dashboard
    await rec.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await settle(rec.page);
    const chips = await rec.page.locator('ul[aria-label="Today\'s appointments"] button').allInnerTexts();
    links.recChips = chips;
    // bell rows (reception, owner, pharmacist): click first item of each
    const bellClick = async (s, name, idx = 0) => {
      await s.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await settle(s.page);
      await s.page.getByRole("button", { name: "Notifications" }).click();
      await s.page.waitForTimeout(600);
      const items = s.page.locator('[role="menuitem"]');
      const n = await items.count();
      if (idx >= n) return { none: true, n };
      const label = (await items.nth(idx).innerText()).replace(/\n/g, " | ");
      await items.nth(idx).click();
      await s.page.waitForTimeout(2000);
      await settle(s.page);
      return { label, url: s.page.url().replace(stack.base, ""), text: (await mainText(s.page)).slice(0, 200).replace(/\n+/g, " | ") };
    };
    links.bell = {};
    for (let i = 0; i < 8; i++) links.bell[`owner${i}`] = await bellClick(own, "owner", i);
    for (let i = 0; i < 8; i++) links.bell[`reception${i}`] = await bellClick(rec, "reception", i);
    links.bell.pharmacist0 = await bellClick(ph, "ph", 0);
    // header search
    await rec.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await settle(rec.page);
    await rec.page.getByPlaceholder("Find a patient").fill("Meera");
    await rec.page.waitForTimeout(2500);
    links.searchResults = (await rec.page.locator(".absolute.top-full").innerText().catch(() => "")).replace(/\n+/g, " | ");
    await rec.page.locator(".absolute.top-full .cursor-pointer").first().click().catch(() => {});
    await rec.page.waitForTimeout(2000); await settle(rec.page);
    links.searchPatient = { url: rec.page.url().replace(stack.base, ""), text: (await mainText(rec.page)).slice(0, 200).replace(/\n+/g, " | ") };
    await rec.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded" });
    await settle(rec.page);
    await rec.page.getByPlaceholder("Find a patient").fill("Priya");
    await rec.page.waitForTimeout(2500);
    links.searchDoctorName = (await rec.page.locator(".absolute.top-full").innerText().catch(() => "")).replace(/\n+/g, " | ");
    // pharmacist search (appointments endpoint)
    ph.bad.length = 0; ph.consoleErrors.length = 0;
    await ph.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded" });
    await settle(ph.page);
    await ph.page.getByPlaceholder("Find a patient").fill("Meera");
    await ph.page.waitForTimeout(3000);
    links.pharmacistSearch = { results: (await ph.page.locator(".absolute.top-full").innerText().catch(() => "")).replace(/\n+/g, " | "), bad: [...ph.bad], console: [...ph.consoleErrors] };
    log("links", links);

    // ---------- 5. Doctor Start visit ----------
    const doc = await session(browser, stack, "doctor");
    await doc.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await settle(doc.page);
    const docText = await mainText(doc.page);
    const rowsBefore = await doc.page.locator('ul[aria-label="Today\'s appointments"] li').allInnerTexts();
    const hrefs = await doc.page.locator('ul[aria-label="Today\'s appointments"] li a').evaluateAll((as) => as.map((a) => `${a.textContent}: ${a.getAttribute("href")}`));
    const target = seeded.appointments.today[3]; // 11:30 CONFIRMED, no visit
    const countVisits = () => db.visit.count({ where: { appointmentId: target.id } });
    const v0 = await countVisits();
    const startLink = doc.page.locator('ul[aria-label="Today\'s appointments"] li').filter({ hasText: target.patient }).getByRole("link");
    const startLabel = await startLink.innerText();
    const startHref = await startLink.getAttribute("href");
    await startLink.click();
    await doc.page.waitForTimeout(3000); await settle(doc.page);
    await doc.page.waitForTimeout(5000);
    await doc.page.screenshot({ path: path.join(SHOTS, "doctor-start-visit.png") });
    const v1 = await countVisits();
    const afterStartUrl = doc.page.url().replace(stack.base, "");
    // second time via the same href (as a double click / back button would)
    const doc2s = await session(browser, stack, "doctor");
    await doc2s.page.goto(`${stack.base}${startHref}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await settle(doc2s.page); await doc2s.page.waitForTimeout(5000);
    await doc2s.page.screenshot({ path: path.join(SHOTS, "doctor-start-visit-again.png") });
    const v2 = await countVisits();
    await doc.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded" });
    await settle(doc.page);
    const labelAfter = await doc.page.locator('ul[aria-label="Today\'s appointments"] li').filter({ hasText: target.patient }).getByRole("link").innerText().catch((e) => e.message);
    const visitsAll = await db.visit.findMany({ where: { appointmentId: target.id }, select: { id: true, status: true, createdAt: true } });
    log("doctor-start", { docTextHead: docText.slice(0, 1200), rowsBefore, hrefs, startLabel, startHref, v0, v1, v2, afterStartUrl, labelAfter, visitsAll, bad: doc.bad, consoleErrors: doc.consoleErrors.slice(0, 15), bad2: doc2s.bad, console2: doc2s.consoleErrors.slice(0, 15), kunalShown: docText.includes(seeded.patients[9].name) });
    await doc2s.ctx.close();
    // doctor bell rows
    links.bellDoctor = await bellClick(doc, "doctor", 0);
    log("bellDoctor", links.bellDoctor);

    // ---------- 6. Empty day ----------
    await db.$executeRawUnsafe(`UPDATE "${stack.schema}"."appointments" SET date = date + interval '30 days' WHERE date >= '${seeded.today}'::date AND date < '${seeded.today}'::date + interval '1 day'`);
    await db.$executeRawUnsafe(`UPDATE "${stack.schema}"."new_invoices" SET balance = 0`);
    await db.$executeRawUnsafe(`UPDATE "${stack.schema}"."prescriptions" SET status = 'COMPLETED'`).catch((e) => console.log("rx update", e.message));
    for (const who of ["reception", "doctor", "owner", "pharmacist"]) {
      const s = await session(browser, stack, who);
      try {
        await s.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90000 });
        await settle(s.page);
        await s.page.screenshot({ path: path.join(SHOTS, `${who}-empty-desktop.png`), fullPage: true });
        await s.page.setViewportSize({ width: 390, height: 844 });
        await settle(s.page);
        await s.page.screenshot({ path: path.join(SHOTS, `${who}-empty-phone.png`), fullPage: true });
        log(`empty:${who}`, { text: await mainText(s.page), bad: s.bad, consoleErrors: s.consoleErrors });
      } finally { await s.ctx.close(); }
    }
  } catch (e) {
    console.error("FATAL", e);
    log("fatal", String(e.stack || e));
  } finally {
    await browser.close().catch(() => {});
    await stack.stop();
  }
})();
