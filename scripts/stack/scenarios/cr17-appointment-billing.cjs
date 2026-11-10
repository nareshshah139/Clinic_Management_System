// CR-17 on the real stack (NestJS + Next.js + PostgreSQL + Chromium): billing and bill type on the
// appointment day calendar, and Daily Collection in the main menu with the clinic and pharmacy blocks.
// Usage: STACK_DATABASE_URL=postgresql://user@127.0.0.1:5432/db node scripts/stack/scenarios/cr17-appointment-billing.cjs
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");

const root = path.resolve(__dirname, "../../..");
const out = process.env.SHOTS_DIR || path.join(root, "output/stack/cr17");
const clean = (text) => String(text ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const clinicToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
const results = [];
// The header asks every role for system alerts; RECEPTION and NURSE are refused. That predates CR-17
// and is tracked on its own, so it is noted here rather than failed.
const KNOWN_REFUSAL = "/api/reports/alerts";

async function seed(stack, today) {
  const db = stack.db;
  const branchId = stack.branch.id;
  const doctorId = stack.users.doctor.id;
  const patient = (id, name, gender, dob) => db.patient.create({ data: { id, name, gender, dob: new Date(dob), phone: "9000000000", branchId } });
  await patient("cr17-meera", "Meera Shah", "F", "1992-03-04");
  await patient("cr17-ravi", "Ravi Kumar", "M", "1985-07-19");
  await patient("cr17-lakshmi", "Lakshmi Devi", "F", "1978-11-02");
  await patient("cr17-suresh", "Suresh Babu", "M", "1969-01-25");
  await patient("cr17-priya", "Priya Nair", "F", "1996-09-30");
  const appointment = (id, patientId, slot, status, extra = {}) =>
    db.appointment.create({ data: { id, branchId, doctorId, patientId, date: new Date(today), slot, status, ...extra } });
  await appointment("cr17-a-meera", "cr17-meera", "09:00-09:15", "CONFIRMED", { tokenNumber: 1 });
  await appointment("cr17-a-ravi", "cr17-ravi", "09:30-09:45", "CONFIRMED", { tokenNumber: 2 });
  await appointment("cr17-a-lakshmi", "cr17-lakshmi", "10:00-10:30", "COMPLETED", { tokenNumber: 3, visitType: "PROCEDURE", notes: "Chemical peel" });
  await appointment("cr17-a-suresh", "cr17-suresh", "10:30-10:45", "SCHEDULED");
  await appointment("cr17-a-priya", "cr17-priya", "11:00-11:15", "IN_PROGRESS", { tokenNumber: 4 });
  const earlier = new Date("2026-10-01T05:00:00Z");
  for (const patientId of ["cr17-ravi", "cr17-suresh", "cr17-priya"])
    await db.visit.create({ data: { patientId, doctorId, complaints: "[]", status: "COMPLETED", createdAt: earlier } });
  await db.visit.create({ data: { id: "cr17-v-lakshmi", patientId: "cr17-lakshmi", doctorId, appointmentId: "cr17-a-lakshmi", complaints: "[]", status: "COMPLETED", completedAt: new Date() } });
  await db.visit.create({ data: { id: "cr17-v-priya", patientId: "cr17-priya", doctorId, appointmentId: "cr17-a-priya", complaints: "[]" } });
  await db.pharmacyInvoice.create({
    data: {
      invoiceNumber: "PHI-2026-1701", patientId: "cr17-meera", branchId, subtotal: 224, totalAmount: 224, paymentMethod: "CASH", paymentStatus: "COMPLETED",
      paidAmount: 224, billingName: "Meera Shah", billingPhone: "9000000000", status: "CONFIRMED", invoiceDate: new Date(), createdAt: new Date(),
      payments: { create: [{ method: "CASH", amount: 224, status: "COMPLETED", paymentDate: new Date() }] },
    },
  });
}

async function call(page, method, url, body) {
  const result = await page.evaluate(
    async ({ method, url, body }) => {
      const response = await fetch(`/api${url}`, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    { method, url, body },
  );
  if (result.status >= 300) throw Error(`${method} ${url} -> ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "cr17" });
  let browser;
  try {
    console.log(`BOOT base=${stack.base}`);
    const today = clinicToday();
    await seed(stack, today);
    const owner = await stack.db.user.findUnique({ where: { id: stack.users.owner.id } });
    for (const [key, role, firstName, lastName, permissions] of [
      ["admin", "ADMIN", "Meera", "Kulkarni", ["*"]],
      ["nurse", "NURSE", "Kavya", "Rao", ["appointments:read", "appointments:create", "appointments:update", "rooms:read"]],
    ]) {
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@stack.example.invalid`;
      const user = await stack.db.user.create({ data: { branchId: stack.branch.id, email, firstName, lastName, role, password: owner.password, permissions: JSON.stringify(permissions) } });
      stack.users[key] = { id: user.id, email, password: stack.users.owner.password, role, firstName, lastName };
    }

    browser = await chromium.launch();
    const setup = await (await browser.newContext()).newPage();
    await stack.login(setup, "owner");
    const bill = async (patientId, appointmentId, name, amount, paid, method, extra = {}) => {
      const invoice = await call(setup, "POST", "/billing/invoices", {
        patientId, ...(appointmentId ? { appointmentId } : {}), ...extra,
        items: [{ name, description: name, quantity: 1, unitPrice: amount, gstRate: 0, discount: 0 }],
      });
      if (paid) await call(setup, "POST", "/billing/payments", { invoiceId: invoice.id, amount: paid, method });
      return invoice;
    };
    const meeraBill = await bill("cr17-meera", "cr17-a-meera", "First consultation", 500, 500, "CASH");
    const raviBill = await bill("cr17-ravi", "cr17-a-ravi", "Review consultation", 500, 300, "UPI");
    await bill("cr17-priya", "cr17-a-priya", "Review consultation", 500, 500, "CARD");
    const priyaVisitBill = await bill("cr17-priya", null, "Laser session", 1200, 1000, "CASH", { visitId: "cr17-v-priya" });
    const stored = await stack.db.newInvoice.findMany({ where: { id: { in: [meeraBill.id, priyaVisitBill.id] } }, select: { id: true, appointmentId: true, visitId: true } });
    console.log(`SEED today=${today} invoices linked=${JSON.stringify(stored.map((s) => [s.appointmentId, s.visitId]))}`);
    await stack.db.newInvoice.update({ where: { id: priyaVisitBill.id }, data: { appointmentId: null } });
    await setup.context().close();

    const sink = [];
    async function open(who, viewport) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      page.on("pageerror", (e) => sink.push(`${who} pageerror ${e.message.slice(0, 200)}`));
      page.on("console", (m) => m.type() === "error" && !(m.location()?.url ?? "").includes(KNOWN_REFUSAL) && sink.push(`${who} console ${m.text().slice(0, 200)}`));
      const refused = [];
      page.on("response", (r) => {
        if (!r.url().includes("/api/") || ![401, 403].includes(r.status())) return;
        const where = new URL(r.url()).pathname;
        if (where === KNOWN_REFUSAL) console.log(`    NOTE ${who} ${r.status()} ${where} (header alerts, predates CR-17)`);
        else refused.push(`${r.status()} ${where}`);
      });
      await stack.login(page, who);
      return { page, context, refused };
    }

    async function scenario(name, run) {
      const started = Date.now();
      const checks = [];
      const shots = [];
      const errorsBefore = sink.length;
      const s = {
        check(label, actual, expected) {
          const ok = JSON.stringify(actual) === JSON.stringify(expected);
          checks.push({ label, ok, detail: ok ? "" : `expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}` });
        },
        ok(label, cond, detail) {
          checks.push({ label, ok: Boolean(cond), detail: cond ? "" : JSON.stringify(detail ?? false) });
        },
        async shot(page, slug) {
          const file = path.join(out, `cr17-${slug}.png`);
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
        if (last) await s.shot(last.page, `${name.replace(/\W+/g, "-")}-error`).catch(() => {});
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
      await page.getByRole("region", { name: "Scheduled" }).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
    };
    const block = (page, patient) => page.locator("[data-appointment-block]", { has: page.locator("[data-patient-name]", { hasText: patient }) });
    const chipOf = (page, patient) => block(page, patient).locator("[data-appointment-billing]");
    const rows = (page) =>
      page.locator("[data-appointment-block]").evaluateAll((blocks) =>
        blocks.map((b) => {
          const chip = b.querySelector("[data-appointment-billing]");
          const type = b.querySelector("[data-bill-type]");
          const shown = (el) => el.checkVisibility() ? el.innerText.replace(/\s+/g, " ").trim() : "";
          return {
            name: b.querySelector("[data-patient-name]").innerText.trim(),
            type: type ? shown(type) : null,
            chip: chip ? shown(chip) : null,
            label: chip?.getAttribute("aria-label") ?? null,
            attention: chip?.getAttribute("data-attention") === "true",
          };
        }).sort((a, b) => a.name.localeCompare(b.name)),
      );
    const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const menuLinks = async (page, phone) => {
      if (phone) {
        const sheet = page.getByRole("dialog").getByRole("navigation", { name: "Main navigation" });
        for (let attempt = 0; attempt < 10 && !(await sheet.isVisible()); attempt++) {
          await page.getByRole("button", { name: "Open clinic navigation" }).click();
          await sheet.waitFor({ timeout: 3000 }).catch(() => {});
        }
        await sheet.waitFor();
      }
      const nav = phone ? page.getByRole("dialog").getByRole("navigation", { name: "Main navigation" }) : page.getByRole("navigation", { name: "Main navigation" });
      await nav.getByRole("link").first().waitFor();
      return (await nav.getByRole("link").allInnerTexts()).map(clean);
    };

    const START = {
      "Lakshmi Devi": { type: "Procedure", chip: "Not billed", label: "Procedure bill: not billed yet, visit finished", attention: true },
      "Meera Shah": { type: "First consultation", chip: "₹500 · Paid", label: "First consultation bill: ₹500, paid", attention: false },
      "Priya Nair": { type: "Review", chip: "₹1,700 · Due ₹200 · 2 bills", label: "Review bill: ₹1,700 in 2 bills, ₹200 due", attention: true },
      "Ravi Kumar": { type: "Review", chip: "₹500 · Due ₹200", label: "Review bill: ₹500, ₹200 due", attention: true },
      "Suresh Babu": { type: "Review", chip: "Not billed", label: "Review bill: not billed yet", attention: false },
    };
    const expectRows = (actual, expected) => Object.entries(expected).map(([name, want]) => [name, actual.find((r) => r.name === name) ?? null, want]);

    await scenario("reception 1280: each row shows amount, state and bill type; unpaid rows are marked", async (s) => {
      const o = await open("reception", DESKTOP);
      s.opened.push(o);
      await calendar(o.page);
      for (const [name, row, want] of expectRows(await rows(o.page), START)) s.check(`${name} row`, row && { type: row.type, chip: row.chip, label: row.label, attention: row.attention }, want);
      s.check("the row's FOLLOW-UP flag is gone", await o.page.getByText("FOLLOW-UP").count(), 0);
      s.ok("no refused calls", o.refused.length === 0, o.refused);
      await s.shot(o.page, "reception-calendar-1280");
    });

    await scenario("reception 1280: paying the due bill flips Due to Paid, after a reload too", async (s) => {
      const o = await open("reception", DESKTOP);
      s.opened.push(o);
      await calendar(o.page);
      await chipOf(o.page, "Ravi Kumar").click();
      const dialog = o.page.getByRole("dialog", { name: "Bill for Ravi Kumar" });
      await dialog.getByText("Review consultation").waitFor();
      s.check("the bill shows what is due", clean(await dialog.getByRole("region", { name: /^Bill INV-/ }).innerText()).includes("Total ₹500 Received ₹300 Due ₹200"), true);
      s.check("the amount starts at what is due", await dialog.getByRole("textbox", { name: "Amount received" }).inputValue(), "200");
      await dialog.getByRole("textbox", { name: "Amount received" }).fill("250");
      s.check("more than due is refused before saving", await dialog.getByRole("button", { name: "Record payment" }).isDisabled(), true);
      await dialog.getByRole("textbox", { name: "Amount received" }).fill("200");
      await dialog.getByRole("radio", { name: "UPI" }).click();
      await s.shot(o.page, "reception-pay-dialog-1280");
      await dialog.getByRole("button", { name: "Record ₹200 payment" }).click();
      await dialog.getByText("Paid", { exact: true }).waitFor();
      await o.page.keyboard.press("Escape");
      await chipOf(o.page, "Ravi Kumar").filter({ hasText: "₹500 · Paid" }).waitFor();
      await o.page.reload({ waitUntil: "domcontentloaded" });
      await calendar(o.page);
      const ravi = (await rows(o.page)).find((r) => r.name === "Ravi Kumar");
      s.check("after reload", [ravi.chip, ravi.attention], ["₹500 · Paid", false]);
      const invoice = await stack.db.newInvoice.findUnique({ where: { id: raviBill.id }, include: { payments: { orderBy: { createdAt: "asc" } } } });
      s.check("the database holds both payments and nothing due", [invoice.received, invoice.balance, invoice.payments.map((p) => [p.mode, p.amount])], [500, 0, [["UPI", 300], ["UPI", 200]]]);
      s.check("no Daily Collection in reception's menu", (await menuLinks(o.page, false)).includes("Daily Collection"), false);
      await s.shot(o.page, "reception-calendar-after-payment-1280");
    });

    await scenario("reception 390: short chips, no sideways scroll, two bills open from the row", async (s) => {
      const o = await open("reception", PHONE);
      s.opened.push(o);
      await calendar(o.page);
      const all = await rows(o.page);
      s.check("short chips on a phone", Object.fromEntries(all.map((r) => [r.name, r.chip])), {
        "Lakshmi Devi": "Not billed", "Meera Shah": "Paid", "Priya Nair": "Due ₹200", "Ravi Kumar": "Paid", "Suresh Babu": "",
      });
      s.check("the bill type still reaches the reader", all.find((r) => r.name === "Priya Nair").label, "Review bill: ₹1,700 in 2 bills, ₹200 due");
      s.ok("no sideways scroll", await noSideways(o.page));
      await s.shot(o.page, "reception-calendar-390");
      await chipOf(o.page, "Priya Nair").click();
      const dialog = o.page.getByRole("dialog", { name: "Bill for Priya Nair" });
      await dialog.getByTestId("bill-summary").waitFor();
      s.check("both bills, summed", clean(await dialog.getByTestId("bill-summary").innerText()), "2 bills · ₹1,700 · Due ₹200");
      s.check("the bill linked only through the visit is there", await dialog.getByText("Laser session").count(), 1);
      const box = await dialog.boundingBox();
      s.ok("the bill fits the phone", box && box.x >= 0 && box.x + box.width <= 390, box);
      await s.shot(o.page, "reception-two-bills-390");
      s.check("no Daily Collection in reception's phone menu", (await menuLinks(o.page, true)).includes("Daily Collection"), false);
    });

    await scenario("doctor 1280: creates the procedure bill from the row with payment; Daily Collection opens from the menu", async (s) => {
      const o = await open("doctor", DESKTOP);
      s.opened.push(o);
      await calendar(o.page);
      await chipOf(o.page, "Lakshmi Devi").click();
      const dialog = o.page.getByRole("dialog", { name: "Bill for Lakshmi Devi" });
      await dialog.getByRole("heading", { name: "Create bill" }).waitFor();
      s.check("the line starts from the bill type", await dialog.getByRole("textbox", { name: "Bill line" }).inputValue(), "Procedure: Chemical peel");
      await dialog.getByRole("textbox", { name: "Fee" }).fill("2500");
      s.check("paid now follows the fee", await dialog.getByRole("textbox", { name: "Paid now" }).inputValue(), "2500");
      await s.shot(o.page, "doctor-create-bill-1280");
      await dialog.getByRole("button", { name: "Create bill and record ₹2,500" }).click();
      await dialog.getByText("Procedure: Chemical peel").waitFor();
      await o.page.keyboard.press("Escape");
      await o.page.reload({ waitUntil: "domcontentloaded" });
      await calendar(o.page);
      const lakshmi = (await rows(o.page)).find((r) => r.name === "Lakshmi Devi");
      s.check("after reload", [lakshmi.type, lakshmi.chip, lakshmi.attention], ["Procedure", "₹2,500 · Paid", false]);
      const created = await stack.db.newInvoice.findFirst({ where: { patientId: "cr17-lakshmi" }, include: { items: true, payments: true } });
      s.check("stored with its appointment, visit, line and payment", [created.appointmentId, created.visitId, created.items.map((i) => [i.name, i.total, i.gstRate]), created.payments.map((p) => [p.mode, p.amount])],
        ["cr17-a-lakshmi", "cr17-v-lakshmi", [["Procedure: Chemical peel", 2500, 0]], [["CASH", 2500]]]);
      await s.shot(o.page, "doctor-calendar-1280");
      const links = await menuLinks(o.page, false);
      s.check("Daily Collection sits under Dashboard", links.slice(0, 2), ["Dashboard", "Daily Collection"]);
      await o.page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Daily Collection" }).click();
      await o.page.getByRole("heading", { name: "Whole day", level: 2 }).waitFor({ timeout: 120000 });
      s.check("the address", new URL(o.page.url()).searchParams.get("report"), "daily-collection");
      s.check("Daily Collection is the current page", await o.page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Daily Collection" }).getAttribute("aria-current"), "page");
      s.ok("no refused calls", o.refused.length === 0, o.refused);
    });

    const WHOLE = [["Cash", "4,000.00", "224.00", "4,224.00"], ["UPI", "500.00", "0.00", "500.00"], ["Card", "500.00", "0.00", "500.00"]];
    const tableRows = (page, name) =>
      page.getByRole("table", { name, exact: true }).evaluate((t) => [...t.tBodies[0].rows].map((r) => [...r.cells].map((c) => c.innerText.trim())));

    await scenario("admin 1280: Daily Collection shows the clinic and pharmacy blocks with literal totals", async (s) => {
      const o = await open("admin", DESKTOP);
      s.opened.push(o);
      await o.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded" });
      await o.page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Daily Collection" }).click();
      await o.page.getByRole("heading", { name: "Whole day", level: 2 }).waitFor({ timeout: 120000 });
      await o.page.getByRole("table", { name: "Whole day by payment mode", exact: true }).waitFor();
      s.check("whole day by mode", await tableRows(o.page, "Whole day by payment mode"), WHOLE);
      s.ok("whole day total", clean(await o.page.getByRole("region", { name: "Whole day" }).innerText()).includes("Whole day ₹5,224.00 Clinic ₹5,000.00 Pharmacy ₹224.00"), clean(await o.page.getByRole("region", { name: "Whole day" }).innerText()).slice(0, 200));
      s.check("clinic by mode", await tableRows(o.page, "Clinic: consultations and procedures by payment mode"), [["Cash", "4,000.00", "0.00", "4,000.00"], ["UPI", "500.00", "0.00", "500.00"], ["Card", "500.00", "0.00", "500.00"]]);
      const clinic = clean(await o.page.getByRole("region", { name: "Clinic: consultations and procedures" }).innerText());
      s.ok("clinic tiles", clinic.includes("Clinic received ₹5,000.00") && clinic.includes("Clinic billed today ₹5,200.00") && clinic.includes("Clinic still due ₹200.00"), clinic.slice(0, 300));
      const bills = await tableRows(o.page, "Clinic bills");
      s.check("five clinic bills today", bills.length, 5);
      s.check("pharmacy reconciliation is the pharmacy's cash only", (await tableRows(o.page, "Pharmacy reconciliation by payment mode"))[0].slice(0, 6), ["Cash", "224.00", "0.00", "0.00", "0.00", "224.00"]);
      s.check("pharmacy count status says pharmacy", clean(await o.page.getByTestId("collection-status").innerText()).startsWith("Pharmacy not counted yet."), true);
      const order = await o.page.getByRole("heading", { level: 2 }).allInnerTexts();
      s.check("blocks in order", order.filter((t) => ["Whole day", "Clinic: consultations and procedures", "Pharmacy"].includes(t)), ["Whole day", "Clinic: consultations and procedures", "Pharmacy"]);
      await s.shot(o.page, "admin-daily-collection-1280");
      await o.page.getByRole("heading", { name: "Pharmacy", level: 2 }).scrollIntoViewIfNeeded();
      await s.shot(o.page, "admin-daily-collection-pharmacy-1280");
      s.ok("no refused calls", o.refused.length === 0, o.refused);
    });

    await scenario("admin 390: calendar rows and the details dialog carry the bill", async (s) => {
      const o = await open("admin", PHONE);
      s.opened.push(o);
      await calendar(o.page);
      s.ok("no sideways scroll", await noSideways(o.page));
      await block(o.page, "Suresh Babu").getByRole("button", { name: /^Suresh Babu, / }).click();
      const dialog = o.page.getByRole("dialog", { name: "Appointment Details" });
      await dialog.waitFor();
      const text = clean(await dialog.innerText());
      s.ok("details name the bill type and the bill", text.includes("Bill type: Review") && text.includes("Bill: Not billed"), text);
      await s.shot(o.page, "admin-details-390");
      await dialog.getByRole("button", { name: "Create bill" }).click();
      await o.page.getByRole("dialog", { name: "Bill for Suresh Babu" }).getByRole("heading", { name: "Create bill" }).waitFor();
      await s.shot(o.page, "admin-create-bill-390");
      const box = await o.page.getByRole("dialog", { name: "Bill for Suresh Babu" }).boundingBox();
      s.ok("the bill fits the phone", box && box.x >= 0 && box.x + box.width <= 390, box);
    });

    await scenario("doctor 390: Daily Collection from the phone menu, no sideways scroll", async (s) => {
      const o = await open("doctor", PHONE);
      s.opened.push(o);
      await o.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded" });
      const links = await menuLinks(o.page, true);
      s.ok("Daily Collection in the phone menu", links.includes("Daily Collection"), links);
      await o.page.getByRole("dialog").getByRole("link", { name: "Daily Collection" }).click();
      await o.page.getByRole("heading", { name: "Whole day", level: 2 }).waitFor({ timeout: 120000 });
      await o.page.getByRole("table", { name: "Whole day by payment mode", exact: true }).waitFor();
      s.check("whole day by mode", await tableRows(o.page, "Whole day by payment mode"), WHOLE);
      s.ok("no sideways scroll", await noSideways(o.page));
      await s.shot(o.page, "doctor-daily-collection-390");
    });

    await scenario("pharmacist 1280: Daily Collection without clinic money; nurse: bill types only, no menu item", async (s) => {
      const p = await open("pharmacist", DESKTOP);
      s.opened.push(p);
      await p.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded" });
      await p.page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Daily Collection" }).click();
      await p.page.getByTestId("collection-status").waitFor({ timeout: 120000 });
      s.check("no clinic block for the pharmacist", [await p.page.getByRole("heading", { name: "Whole day", level: 2 }).count(), await p.page.getByRole("table", { name: "Clinic bills" }).count()], [0, 0]);
      s.ok("the pharmacist sees the pharmacy's expected money", clean(await p.page.locator("main").innerText()).includes("Pharmacy expected in hand ₹224.00"), clean(await p.page.locator("main").innerText()).slice(0, 400));
      s.ok("no refused calls", p.refused.length === 0, p.refused);
      await s.shot(p.page, "pharmacist-daily-collection-1280");

      const n = await open("nurse", DESKTOP);
      s.opened.push(n);
      await calendar(n.page);
      const all = await rows(n.page);
      s.check("bill types for the nurse", Object.fromEntries(all.map((r) => [r.name, r.type])), { "Lakshmi Devi": "Procedure", "Meera Shah": "First consultation", "Priya Nair": "Review", "Ravi Kumar": "Review", "Suresh Babu": "Review" });
      s.check("no bill amounts for the nurse", all.filter((r) => r.chip !== null).length, 0);
      s.check("no Daily Collection in the nurse's menu", (await menuLinks(n.page, false)).includes("Daily Collection"), false);
      s.ok("no refused calls", n.refused.length === 0, n.refused);
      await s.shot(n.page, "nurse-calendar-1280");
    });
  } finally {
    fs.writeFileSync(path.join(out, "cr17-results.json"), JSON.stringify(results, null, 2));
    console.log("\nSUMMARY");
    for (const r of results) console.log(`  ${r.pass ? "ok  " : "FAILED"}  ${r.name}  ${r.seconds}s`);
    await browser?.close().catch(() => {});
    await stack.stop();
    process.exitCode = results.length && results.every((r) => r.pass) ? 0 : 1;
  }
})().catch((e) => {
  console.error("CR17 HARNESS ERROR", e);
  process.exit(2);
});
