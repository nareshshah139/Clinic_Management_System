// Follow-ups to CR-17 on the real stack (NestJS + Next.js + PostgreSQL + Chromium): net banking and
// cheque payments taken in the bill dialog, counted by mode in Daily Collection and the reports, and
// the Reports page's default range showing today's take in clinic days.
// Usage: STACK_DATABASE_URL=postgresql://user@127.0.0.1:5432/db node scripts/stack/scenarios/fu-billing.cjs
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");

const root = path.resolve(__dirname, "../../..");
const out = process.env.SHOTS_DIR || path.join(root, "output/stack/fu-billing");
const clean = (text) => String(text ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const clinicDay = (at) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(at);
const shiftDay = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const istInstant = (day, time) => new Date(`${day}T${time}:00+05:30`);
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
const MODES = "use one of CASH, CARD, UPI, BNPL, NET_BANKING, CHEQUE";
const results = [];
// The header asks every role for system alerts; RECEPTION is refused. That predates these follow-ups.
const KNOWN_REFUSALS = { "/api/reports/alerts": ["reception"] };

async function call(page, method, url, body) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const response = await fetch(`/api${url}`, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    { method, url, body },
  );
}
async function ok(page, method, url, body) {
  const result = await call(page, method, url, body);
  if (result.status >= 300) throw Error(`${method} ${url} -> ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "fu-billing" });
  let browser;
  try {
    console.log(`BOOT base=${stack.base}`);
    const today = clinicDay(new Date());
    const db = stack.db;
    const branchId = stack.branch.id;
    const doctorId = stack.users.doctor.id;
    const owner = await db.user.findUnique({ where: { id: stack.users.owner.id } });
    const adminUser = await db.user.create({
      data: { branchId, email: "meera.kulkarni@stack.example.invalid", firstName: "Meera", lastName: "Kulkarni", role: "ADMIN", password: owner.password, permissions: JSON.stringify(["*"]) },
    });
    stack.users.admin = { id: adminUser.id, email: adminUser.email, password: stack.users.owner.password, role: "ADMIN", firstName: "Meera", lastName: "Kulkarni" };

    const people = [
      ["fu-anjali", "Anjali Mehta", "F", "09:00-09:15"],
      ["fu-deepa", "Deepa Iyer", "F", "09:30-09:45"],
      ["fu-kiran", "Kiran Rao", "M", "10:00-10:15"],
      ["fu-farhan", "Farhan Ali", "M", "10:30-10:45"],
      ["fu-sanjay", "Sanjay Gupta", "M", "11:00-11:15"],
    ];
    for (const [id, name, gender, slot] of people) {
      await db.patient.create({ data: { id, name, gender, phone: "9000000000", branchId } });
      await db.appointment.create({ data: { id: `${id}-a`, branchId, doctorId, patientId: id, date: new Date(today), slot, status: "CONFIRMED" } });
    }

    browser = await chromium.launch();
    const setup = await (await browser.newContext()).newPage();
    await stack.login(setup, "owner");
    const bill = (patientId, name, amount) =>
      ok(setup, "POST", "/billing/invoices", { patientId, appointmentId: `${patientId}-a`, items: [{ name, description: name, quantity: 1, unitPrice: amount, gstRate: 0, discount: 0 }] });
    const anjali = await bill("fu-anjali", "Review consultation", 800);
    const deepa = await bill("fu-deepa", "Review consultation", 500);
    const farhan = await bill("fu-farhan", "Dressing", 700);
    const sanjay = await bill("fu-sanjay", "First consultation", 600);
    const early = await ok(setup, "POST", "/billing/payments", { invoiceId: sanjay.id, amount: 600, method: "CASH" });
    await db.newInvoice.update({ where: { id: sanjay.id }, data: { createdAt: istInstant(today, "00:05") } });
    await db.newPayment.update({ where: { id: early.id }, data: { createdAt: istInstant(today, "00:10") } });
    await db.patient.create({ data: { id: "fu-neha", name: "Neha Joshi", gender: "F", phone: "9000000000", branchId } });
    const neha = await ok(setup, "POST", "/billing/invoices", { patientId: "fu-neha", items: [{ name: "Laser session", description: "Laser session", quantity: 1, unitPrice: 400, gstRate: 0, discount: 0 }] });
    const late = await ok(setup, "POST", "/billing/payments", { invoiceId: neha.id, amount: 400, method: "UPI" });
    await db.newInvoice.update({ where: { id: neha.id }, data: { createdAt: istInstant(shiftDay(today, 1), "00:00") } });
    await db.newPayment.update({ where: { id: late.id }, data: { createdAt: istInstant(shiftDay(today, 1), "00:00") } });
    await setup.context().close();
    console.log(`SEED today=${today} cash 600 at 00:10 IST today, UPI 400 at 00:00 IST tomorrow`);

    const sink = [];
    const sessions = new Map();
    for (const who of ["reception", "admin", "doctor"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      for (let attempt = 1; ; attempt++) {
        try {
          await stack.login(page, who);
          break;
        } catch (error) {
          if (attempt === 5 || !String(error.message).includes("429")) throw error;
          await new Promise((resolve) => setTimeout(resolve, 20000));
        }
      }
      sessions.set(who, await context.storageState());
      await context.close();
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }

    async function open(who, viewport) {
      const context = await browser.newContext({ viewport, storageState: sessions.get(who) });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      const known = (url) => Object.entries(KNOWN_REFUSALS).some(([where, roles]) => roles.includes(who) && url.includes(where));
      page.on("pageerror", (e) => sink.push(`${who} pageerror ${e.message.slice(0, 200)}`));
      page.on("console", (m) => m.type() === "error" && !known(m.location()?.url ?? "") && sink.push(`${who} console ${m.text().slice(0, 200)}`));
      const refused = [];
      page.on("response", (r) => {
        if (!r.url().includes("/api/") || ![401, 403].includes(r.status())) return;
        const where = new URL(r.url()).pathname;
        if (!known(where)) refused.push(`${r.status()} ${where}`);
      });
      return { page, context, refused };
    }

    async function scenario(name, run) {
      const started = Date.now();
      const checks = [];
      const shots = [];
      const errorsBefore = sink.length;
      const s = {
        check(label, actual, expected) {
          const pass = JSON.stringify(actual) === JSON.stringify(expected);
          checks.push({ label, ok: pass, detail: pass ? "" : `expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}` });
        },
        ok(label, cond, detail) {
          checks.push({ label, ok: Boolean(cond), detail: cond ? "" : JSON.stringify(detail ?? false) });
        },
        async shot(page, slug) {
          const file = path.join(out, `fu-billing-${slug}.png`);
          await page.waitForTimeout(500);
          await page.screenshot({ path: file, fullPage: false });
          shots.push(file);
        },
        opened: [],
      };
      let error = null;
      try {
        await run(s);
      } catch (e) {
        error = e;
        const last = s.opened.at(-1);
        if (last) await s.shot(last.page, `${name.replace(/\W+/g, "-").slice(0, 60)}-error`).catch(() => {});
      }
      for (const o of s.opened) await o.context.close().catch(() => {});
      const failed = checks.filter((c) => !c.ok);
      const errors = sink.slice(errorsBefore);
      const pass = !error && failed.length === 0 && errors.length === 0;
      results.push({ name, pass, checks: checks.length, failed, error: error && String(error.message), errors, shots, seconds: Math.round((Date.now() - started) / 1000) });
      console.log(`${pass ? "PASS" : "FAIL"} ${name} (${checks.length - failed.length}/${checks.length})`);
      for (const c of failed) console.log(`    FAIL ${c.label}: ${c.detail}`);
      if (error) console.log(`    EXCEPTION ${String(error.message).split("\n")[0]}`);
      for (const e of errors) console.log(`    ERROR ${e}`);
      for (const f of shots) console.log(`    SHOT ${f}`);
    }

    const calendar = async (page) => {
      await page.goto(`${stack.base}/dashboard/appointments`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.locator("[data-appointment-block]").first().waitFor({ timeout: 240000 });
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]') && document.querySelectorAll("[data-appointment-block]").length >= 5, null, { timeout: 120000 });
      await page.waitForTimeout(300);
    };
    const block = (page, patient) => page.locator("[data-appointment-block]", { has: page.locator("[data-patient-name]", { hasText: patient }) });
    const chipOf = (page, patient) => block(page, patient).locator("[data-appointment-billing]");
    const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const stored = async (invoiceId) => {
      const invoice = await db.newInvoice.findUnique({ where: { id: invoiceId }, include: { payments: { orderBy: { createdAt: "asc" } } } });
      return [invoice.received, invoice.balance, invoice.payments.map((p) => [p.mode, p.amount, p.reconStatus, p.reference])];
    };
    const billDialog = async (o, patient) => {
      await calendar(o.page);
      await chipOf(o.page, patient).click();
      const dialog = o.page.getByRole("dialog", { name: `Bill for ${patient}` });
      await dialog.waitFor();
      return dialog;
    };
    const modeNames = (dialog) => dialog.getByRole("radiogroup", { name: "Payment mode" }).getByRole("radio").allInnerTexts();

    await scenario("reception 1280: takes ₹800 by net banking with its UTR; stored COMPLETED and listed by name after a reload", async (s) => {
      const o = await open("reception", DESKTOP);
      s.opened.push(o);
      const dialog = await billDialog(o, "Anjali Mehta");
      await dialog.getByRole("textbox", { name: "Amount received" }).waitFor();
      s.check("the desk's five modes, in order", (await modeNames(dialog)).map(clean), ["Cash", "UPI", "Card", "Net banking / NEFT", "Cheque"]);
      s.check("cash asks for no reference", await dialog.getByRole("textbox", { name: /reference|number/i }).count(), 0);
      await dialog.getByRole("radio", { name: "Net banking / NEFT" }).click();
      await dialog.getByRole("textbox", { name: "Bank reference / UTR (optional)" }).fill("UTR 4521 8890");
      await s.shot(o.page, "reception-net-banking-1280");
      await dialog.getByRole("button", { name: "Record ₹800 payment" }).click();
      await dialog.getByRole("region", { name: `Bill ${anjali.invoiceNo}` }).getByText("Paid", { exact: true }).waitFor();
      s.check("the database holds a completed net banking payment with its UTR", await stored(anjali.id), [800, 0, [["NET_BANKING", 800, "COMPLETED", "UTR 4521 8890"]]]);
      await o.page.keyboard.press("Escape");
      await o.page.reload({ waitUntil: "domcontentloaded" });
      const again = await billDialog(o, "Anjali Mehta");
      const listed = again.getByRole("list", { name: `Payments on ${anjali.invoiceNo}` });
      await listed.waitFor();
      s.ok("listed by name with its UTR after a reload", clean(await listed.innerText()).startsWith("₹800 Net banking / NEFT · UTR 4521 8890 ·"), clean(await listed.innerText()));
      await s.shot(o.page, "reception-net-banking-listed-1280");
      s.ok("no refused calls", o.refused.length === 0, o.refused);
    });

    await scenario("reception 390: takes a ₹500 cheque with its number; the modes wrap and the bill fits the phone", async (s) => {
      const o = await open("reception", PHONE);
      s.opened.push(o);
      const dialog = await billDialog(o, "Deepa Iyer");
      await dialog.getByRole("textbox", { name: "Amount received" }).waitFor();
      await dialog.getByRole("radio", { name: "Cheque" }).click();
      await dialog.getByRole("textbox", { name: "Cheque number (optional)" }).fill("004512");
      await dialog.getByRole("button", { name: "Record ₹500 payment" }).scrollIntoViewIfNeeded();
      const box = await dialog.boundingBox();
      s.ok("the bill fits the phone", box && box.x >= 0 && box.x + box.width <= 390, box);
      const radios = await dialog.getByRole("radiogroup", { name: "Payment mode" }).getByRole("radio").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
      s.ok("every mode button stays inside the phone", radios.every((right) => right <= 390), radios);
      s.ok("no sideways scroll", await noSideways(o.page));
      await s.shot(o.page, "reception-cheque-390");
      await dialog.getByRole("button", { name: "Record ₹500 payment" }).click();
      await dialog.getByRole("region", { name: `Bill ${deepa.invoiceNo}` }).getByText("Paid", { exact: true }).waitFor();
      s.check("the database holds a completed cheque with its number", await stored(deepa.id), [500, 0, [["CHEQUE", 500, "COMPLETED", "004512"]]]);
      s.ok("listed as a cheque", clean(await dialog.getByRole("list", { name: `Payments on ${deepa.invoiceNo}` }).innerText()).startsWith("₹500 Cheque · 004512 ·"));
      await s.shot(o.page, "reception-cheque-paid-390");
      s.ok("no refused calls", o.refused.length === 0, o.refused);
    });

    await scenario("admin 1280: creates a bill and takes ₹1,200 by cheque in one step", async (s) => {
      const o = await open("admin", DESKTOP);
      s.opened.push(o);
      const dialog = await billDialog(o, "Kiran Rao");
      await dialog.getByRole("heading", { name: "Create bill" }).waitFor();
      await dialog.getByRole("textbox", { name: "Fee" }).fill("1200");
      await dialog.getByRole("radio", { name: "Cheque" }).click();
      await dialog.getByRole("textbox", { name: "Cheque number (optional)" }).fill("000981");
      await s.shot(o.page, "admin-create-bill-cheque-1280");
      await dialog.getByRole("button", { name: "Create bill and record ₹1,200" }).click();
      await dialog.getByRole("region", { name: /^Bill INV-/ }).getByText("Paid", { exact: true }).waitFor();
      const created = await db.newInvoice.findFirst({ where: { patientId: "fu-kiran" }, include: { payments: true } });
      s.check("stored with its appointment and a completed cheque", [created.appointmentId, created.total, created.balance, created.payments.map((p) => [p.mode, p.amount, p.reconStatus, p.reference])],
        ["fu-kiran-a", 1200, 0, [["CHEQUE", 1200, "COMPLETED", "000981"]]]);
      s.ok("no refused calls", o.refused.length === 0, o.refused);
    });

    await scenario("admin 390: takes ₹700 by net banking with no reference", async (s) => {
      const o = await open("admin", PHONE);
      s.opened.push(o);
      const dialog = await billDialog(o, "Farhan Ali");
      await dialog.getByRole("textbox", { name: "Amount received" }).waitFor();
      await dialog.getByRole("radio", { name: "Net banking / NEFT" }).click();
      s.check("the reference starts empty", await dialog.getByRole("textbox", { name: "Bank reference / UTR (optional)" }).inputValue(), "");
      await s.shot(o.page, "admin-net-banking-390");
      await dialog.getByRole("button", { name: "Record ₹700 payment" }).click();
      await dialog.getByRole("region", { name: `Bill ${farhan.invoiceNo}` }).getByText("Paid", { exact: true }).waitFor();
      s.check("stored without a reference", await stored(farhan.id), [700, 0, [["NET_BANKING", 700, "COMPLETED", null]]]);
      s.ok("no sideways scroll", await noSideways(o.page));
      s.ok("no refused calls", o.refused.length === 0, o.refused);
    });

    await scenario("admin API: an unknown mode is a 400 naming the modes; a cheque refund goes back as a cheque", async (s) => {
      const o = await open("admin", DESKTOP);
      s.opened.push(o);
      await o.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded" });
      const before = sink.length;
      await db.patient.create({ data: { id: "fu-omkar", name: "Omkar Desai", gender: "M", phone: "9000000000", branchId } });
      const extra = await ok(o.page, "POST", "/billing/invoices", { patientId: "fu-omkar", items: [{ name: "Dressing", description: "Dressing", quantity: 1, unitPrice: 300, gstRate: 0, discount: 0 }] });
      const refusals = [];
      for (const method of ["NETBANKING", "NEFT", "WALLET"]) {
        const r = await call(o.page, "POST", "/billing/payments", { invoiceId: extra.id, amount: 300, method });
        refusals.push([r.status, r.body?.message]);
      }
      s.check("400 with the modes the database stores", refusals, [
        [400, [`method "NETBANKING" is not a payment mode; ${MODES}`]],
        [400, [`method "NEFT" is not a payment mode; ${MODES}`]],
        [400, [`method "WALLET" is not a payment mode; ${MODES}`]],
      ]);
      s.check("nothing stored on the bill", await stored(extra.id), [0, 300, []]);
      const filter = await call(o.page, "GET", "/reports/revenue?paymentMode=CHECK");
      s.check("a report filter on an unknown mode is a 400 too", [filter.status, filter.body?.message], [400, [`paymentMode "CHECK" is not a payment mode; ${MODES}`]]);
      const cheque = await db.newPayment.findFirst({ where: { invoiceId: deepa.id } });
      await ok(o.page, "POST", "/billing/refunds", { paymentId: cheque.id, amount: 100, notes: "Cheque short by ₹100" });
      s.check("the refund is a cheque entry", await stored(deepa.id), [400, 100, [["CHEQUE", 500, "COMPLETED", "004512"], ["CHEQUE", -100, "COMPLETED", "REFUND: Cheque short by ₹100"]]]);
      sink.splice(before).forEach((e) => (/status of 400/.test(e) ? console.log(`    NOTE deliberate ${e}`) : sink.push(e)));
    });

    const tableRows = (page, name) =>
      page.getByRole("table", { name, exact: true }).evaluate((t) => [...t.tBodies[0].rows].map((r) => [...r.cells].map((c) => c.innerText.trim())));
    const CLINIC_MODES = [
      ["Cash", "600.00", "0.00", "600.00"],
      ["UPI", "0.00", "0.00", "0.00"],
      ["Card", "0.00", "0.00", "0.00"],
      ["Net banking / NEFT", "1,500.00", "0.00", "1,500.00"],
      ["Cheque", "1,700.00", "100.00", "1,600.00"],
    ];
    const dailyCollection = async (page, phone) => {
      await page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded" });
      if (phone) {
        const sheet = page.getByRole("dialog").getByRole("navigation", { name: "Main navigation" });
        for (let attempt = 0; attempt < 10 && !(await sheet.isVisible()); attempt++) {
          await page.getByRole("button", { name: "Open clinic navigation" }).click();
          await sheet.waitFor({ timeout: 3000 }).catch(() => {});
        }
        await sheet.getByRole("link", { name: "Daily Collection" }).click();
      } else await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Daily Collection" }).click();
      await page.getByRole("table", { name: "Clinic: consultations and procedures by payment mode", exact: true }).waitFor({ timeout: 120000 });
    };

    await scenario("admin 1280: Daily Collection counts net banking and cheque on their own lines, refund included", async (s) => {
      const o = await open("admin", DESKTOP);
      s.opened.push(o);
      await dailyCollection(o.page, false);
      s.check("clinic by mode", await tableRows(o.page, "Clinic: consultations and procedures by payment mode"), CLINIC_MODES);
      const whole = await tableRows(o.page, "Whole day by payment mode");
      s.check("whole day by mode", whole.map((r) => [r[0], r[1], r[3]]), [["Cash", "600.00", "600.00"], ["UPI", "0.00", "0.00"], ["Card", "0.00", "0.00"], ["Net banking / NEFT", "1,500.00", "1,500.00"], ["Cheque", "1,600.00", "1,600.00"]]);
      const bills = await tableRows(o.page, "Clinic bills");
      const paidBy = Object.fromEntries(bills.map((r) => [r[3], r[6]]));
      s.check("each bill says how it was paid", [paidBy["Anjali Mehta"], paidBy["Deepa Iyer"], paidBy["Kiran Rao"], paidBy["Farhan Ali"], paidBy["Sanjay Gupta"]],
        ["Net banking / NEFT", "Cheque, Refund · Cheque", "Cheque", "Net banking / NEFT", "Cash"]);
      s.check("the 00:00 IST payment tomorrow is not today's", bills.some((r) => r[3] === "Neha Joshi"), false);
      await s.shot(o.page, "admin-daily-collection-modes-1280");
      const api = await ok(o.page, "GET", `/pharmacy/reports/daily-collection?from=${today}`);
      s.check("Daily Collection's clinic net", api.clinic.net, 3700);
      s.ok("no refused calls", o.refused.length === 0, o.refused);
    });

    await scenario("doctor 390: Daily Collection on a phone shows the same lines without sideways scroll", async (s) => {
      const o = await open("doctor", PHONE);
      s.opened.push(o);
      await dailyCollection(o.page, true);
      s.check("clinic by mode", await tableRows(o.page, "Clinic: consultations and procedures by payment mode"), CLINIC_MODES);
      await o.page.getByRole("table", { name: "Clinic: consultations and procedures by payment mode", exact: true }).scrollIntoViewIfNeeded();
      s.ok("no sideways scroll", await noSideways(o.page));
      await s.shot(o.page, "doctor-daily-collection-modes-390");
    });

    const reportsPage = async (page) => {
      await page.goto(`${stack.base}/dashboard/reports`, { waitUntil: "domcontentloaded" });
      const total = page.getByText("Total Revenue", { exact: true }).first().locator("xpath=../..");
      await total.waitFor({ timeout: 120000 });
      await page.getByText("Payment Mode Breakdown").waitFor({ timeout: 60000 });
      const dates = page.locator('input[type="date"]');
      return { total, from: await dates.nth(0).inputValue(), to: await dates.nth(1).inputValue() };
    };
    const breakdown = (page) =>
      page.getByText("Payment Mode Breakdown").locator("xpath=ancestor::div[contains(@class,'rounded')][1]").innerText();

    await scenario("admin 1280: the Reports page's default range shows today's ₹3,700, equal to Daily Collection", async (s) => {
      const o = await open("admin", DESKTOP);
      s.opened.push(o);
      const r = await reportsPage(o.page);
      s.check("default range is the 30 clinic days to today", [r.from, r.to], [shiftDay(today, -30), today]);
      s.check("Total Revenue", clean(await r.total.innerText()), "Total Revenue ₹3,700.00");
      const modes = clean(await breakdown(o.page));
      s.ok("modes by name with their amounts", ["Cash", "₹600.00", "Net banking / NEFT", "₹1,500.00", "Cheque", "₹1,600.00"].every((t) => modes.includes(t)) && !/NET_BANKING|CHEQUE/.test(modes), modes);
      const [revenue, payments, summary, collection] = await Promise.all([
        ok(o.page, "GET", `/reports/revenue?startDate=${today}&endDate=${today}&includePaymentBreakdown=true`),
        ok(o.page, "GET", `/reports/payments?startDate=${today}&endDate=${today}`),
        ok(o.page, "GET", `/billing/payments/summary?startDate=${today}&endDate=${today}`),
        ok(o.page, "GET", `/pharmacy/reports/daily-collection?from=${today}`),
      ]);
      s.check("revenue, payments, payment summary and Daily Collection agree for today", [revenue.totalRevenue, payments.totalAmount, summary.totalAmount, collection.clinic.net], [3700, 3700, 3700, 3700]);
      const tomorrow = await ok(o.page, "GET", `/reports/revenue?startDate=${shiftDay(today, 1)}&endDate=${shiftDay(today, 1)}`);
      s.check("the 00:00 IST payment counts tomorrow", tomorrow.totalRevenue, 400);
      await r.total.scrollIntoViewIfNeeded();
      await s.shot(o.page, "admin-reports-default-range-1280");
      await o.page.getByText("Payment Mode Breakdown").scrollIntoViewIfNeeded();
      await s.shot(o.page, "admin-reports-modes-1280");
      s.ok("no refused calls", o.refused.length === 0, o.refused);
    });

    await scenario("admin 390: the Reports page on a phone shows the same total and fits", async (s) => {
      const o = await open("admin", PHONE);
      s.opened.push(o);
      const r = await reportsPage(o.page);
      s.check("Total Revenue", clean(await r.total.innerText()), "Total Revenue ₹3,700.00");
      await o.page.reload({ waitUntil: "domcontentloaded" });
      const again = await reportsPage(o.page);
      s.check("after a reload", [again.to, clean(await again.total.innerText())], [today, "Total Revenue ₹3,700.00"]);
      await again.total.scrollIntoViewIfNeeded();
      s.ok("no sideways scroll", await noSideways(o.page));
      await s.shot(o.page, "admin-reports-390");
      s.ok("no refused calls", o.refused.length === 0, o.refused);
    });
  } finally {
    fs.writeFileSync(path.join(out, "fu-billing-results.json"), JSON.stringify(results, null, 2));
    console.log("\nSUMMARY");
    for (const r of results) console.log(`  ${r.pass ? "ok  " : "FAILED"}  ${r.name}  ${r.seconds}s`);
    await browser?.close().catch(() => {});
    await stack.stop();
    process.exitCode = results.length && results.every((r) => r.pass) ? 0 : 1;
  }
})().catch((e) => {
  console.error("FU-BILLING HARNESS ERROR", e);
  process.exit(2);
});
