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
  await patient("cr17-venkata", "Venkata Subramanian", "M", "1975-05-12");
  const appointment = (id, patientId, slot, status, extra = {}) =>
    db.appointment.create({ data: { id, branchId, doctorId, patientId, date: new Date(today), slot, status, ...extra } });
  await appointment("cr17-a-meera", "cr17-meera", "09:00-09:15", "CONFIRMED", { tokenNumber: 1 });
  await appointment("cr17-a-ravi", "cr17-ravi", "09:30-09:45", "CONFIRMED", { tokenNumber: 2 });
  await appointment("cr17-a-lakshmi", "cr17-lakshmi", "10:00-10:30", "COMPLETED", { tokenNumber: 3, visitType: "PROCEDURE", notes: "Chemical peel" });
  await appointment("cr17-a-suresh", "cr17-suresh", "10:30-10:45", "SCHEDULED");
  await appointment("cr17-a-priya", "cr17-priya", "11:00-11:15", "IN_PROGRESS", { tokenNumber: 4 });
  await appointment("cr17-a-venkata", "cr17-venkata", "11:30-11:45", "CONFIRMED", { tokenNumber: 5 });
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
    await bill("cr17-venkata", "cr17-a-venkata", "First consultation", 1700, 0, "CASH");
    const priyaVisitBill = await bill("cr17-priya", null, "Laser session", 1200, 1000, "CASH", { visitId: "cr17-v-priya" });
    const stored = await stack.db.newInvoice.findMany({ where: { id: { in: [meeraBill.id, priyaVisitBill.id] } }, select: { id: true, appointmentId: true, visitId: true } });
    console.log(`SEED today=${today} invoices linked=${JSON.stringify(stored.map((s) => [s.appointmentId, s.visitId]))}`);
    await stack.db.newInvoice.update({ where: { id: priyaVisitBill.id }, data: { appointmentId: null } });
    await setup.context().close();

    const sink = [];
    const sessions = new Map();
    async function open(who, viewport) {
      const context = await browser.newContext({ viewport, ...(sessions.has(who) && { storageState: sessions.get(who) }) });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      page.on("pageerror", (e) => sink.push(`${who} pageerror ${e.message.slice(0, 200)}`));
      page.on("console", (m) => m.type() === "error" && sink.push(`${who} console ${m.text().slice(0, 200)}`));
      const refused = [];
      page.on("response", (r) => {
        if (r.url().includes("/api/") && [401, 403].includes(r.status())) refused.push(`${r.status()} ${new URL(r.url()).pathname}`);
      });
      if (!sessions.has(who)) {
        await stack.login(page, who);
        sessions.set(who, await context.storageState());
      }
      return { page, context, refused };
    }

    // Sign-in allows five attempts a minute, so every role signs in once, spaced out, before the scenarios.
    for (const who of ["reception", "doctor", "admin", "pharmacist", "nurse"]) {
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
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]') && document.querySelectorAll("[data-appointment-block]").length >= 6, null, { timeout: 120000 });
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
      "Meera Shah": { type: "First", chip: "₹500 · Paid", label: "First consultation bill: ₹500, paid", attention: false },
      "Priya Nair": { type: "Review", chip: "₹200 due", label: "Review bill: ₹1,700 in 2 bills, ₹200 due", attention: true },
      "Ravi Kumar": { type: "Review", chip: "₹200 due", label: "Review bill: ₹500, ₹200 due", attention: true },
      "Suresh Babu": { type: "Review", chip: "Not billed", label: "Review bill: not billed yet", attention: false },
      "Venkata Subramanian": { type: "First", chip: "₹1,700 due", label: "First consultation bill: ₹1,700, ₹1,700 due", attention: true },
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
      s.check("phone chips: ₹ with a tick when paid, with ! when money is to be collected", Object.fromEntries(all.map((r) => [r.name, r.chip])), {
        "Lakshmi Devi": "₹!", "Meera Shah": "₹✓", "Priya Nair": "₹!", "Ravi Kumar": "₹✓", "Suresh Babu": "", "Venkata Subramanian": "₹!",
      });
      const names = await o.page.locator("[data-patient-name]").evaluateAll((n) => n.map((el) => el.getBoundingClientRect().width));
      s.ok("every patient name keeps some room on a phone", names.every((w) => w >= 24), names);
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
      await o.page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      s.check("no Daily Collection in reception's phone menu", (await menuLinks(o.page, true)).includes("Daily Collection"), false);
    });

    const SLOT_OF = {
      "Meera Shah": "09:00-09:15", "Ravi Kumar": "09:30-09:45", "Lakshmi Devi": "10:00-10:30",
      "Suresh Babu": "10:30-10:45", "Priya Nair": "11:00-11:15", "Venkata Subramanian": "11:30-11:45",
    };
    const STATUS_OF = { "Meera Shah": "Confirmed", "Ravi Kumar": "Confirmed", "Lakshmi Devi": "Completed", "Suresh Babu": "Scheduled", "Priya Nair": "In progress", "Venkata Subramanian": "Confirmed" };
    const geometry = (page) =>
      page.locator("[data-appointment-block]").evaluateAll((blocks) => {
        const probe = document.createElement("canvas").getContext("2d");
        const shown = (el) => (el && el.checkVisibility() ? el.innerText.replace(/\s+/g, " ").trim() : "");
        return blocks.map((b) => {
          const name = b.querySelector("[data-patient-name]");
          const button = name.closest("button");
          const chip = b.querySelector("[data-appointment-billing]");
          const status = b.querySelector("[data-appointment-status]");
          const type = b.querySelector("[data-bill-type]");
          const style = getComputedStyle(name);
          probe.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const text = name.innerText.trim();
          const block = b.getBoundingClientRect();
          const chipBox = chip?.checkVisibility() ? chip.getBoundingClientRect() : null;
          const [from, to] = b.querySelector("[data-appointment-time]").textContent.split("-").map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
          const parts = [...button.querySelectorAll("span"), chip].filter((el) => el?.checkVisibility()).map((el) => el.getBoundingClientRect());
          const dot = status?.querySelector("[aria-hidden]");
          return {
            name: text,
            time: shown(b.querySelector("[data-appointment-time]")),
            nameWidth: Math.round(name.clientWidth),
            sixteen: Math.ceil(probe.measureText(text.slice(0, 16)).width),
            truncated: name.scrollWidth > name.clientWidth,
            width: Math.round(block.width),
            buttonWidth: Math.round(button.clientWidth),
            height: Math.round(block.height * 10) / 10,
            minutes: to - from,
            oneLine: parts.every((r) => r.top >= block.top - 0.5 && r.bottom <= block.bottom + 0.5),
            overhang: Math.round(Math.max(...parts.map((r) => Math.max(r.bottom - block.bottom, block.top - r.top))) * 10) / 10,
            clipped: parts.some((r) => r.right > block.right + 0.5),
            chipInside: chipBox ? chipBox.left >= block.left && chipBox.right <= block.right + 1 : null,
            chipText: shown(chip),
            type: shown(type),
            statusText: shown(status),
            statusDot: dot?.checkVisibility() ? status.getAttribute("title") : "",
            label: button.getAttribute("aria-label"),
          };
        });
      });
    const DESK_CHIPS = { "Meera Shah": "₹500 · Paid", "Ravi Kumar": "₹500 · Paid", "Lakshmi Devi": "Not billed", "Suresh Babu": "Not billed", "Priya Nair": "₹200 due", "Venkata Subramanian": "₹1,700 due" };
    const fitsRow = (s, tag, g, { chips, types, words }) => {
      const slot = SLOT_OF[g.name];
      s.check(`${tag} ${g.name}: the row's own time range`, g.time, slot);
      s.ok(`${tag} ${g.name}: at least 16 characters of the name (${g.nameWidth}px of ${g.sixteen}px)`, g.nameWidth >= g.sixteen - 1, g);
      if (g.name.length <= 16) s.ok(`${tag} ${g.name}: a short name is not cut`, !g.truncated, g);
      s.ok(`${tag} ${g.name}: one line with nothing pushed out of the row`, g.oneLine && !g.clipped, g);
      s.check(`${tag} ${g.name}: 20px for each 15 minutes, as the time gutter`, g.height, (g.minutes / 15) * 20);
      s.check(`${tag} ${g.name}: bill type`, g.type, types[g.name]);
      if (words) s.check(`${tag} ${g.name}: status in words`, [g.statusText, g.statusDot], [STATUS_OF[g.name], ""]);
      else s.check(`${tag} ${g.name}: status as a coloured dot named in its tooltip`, [g.statusText, g.statusDot], ["", STATUS_OF[g.name]]);
      s.ok(`${tag} ${g.name}: full name, time and status in the accessible label`, g.label.includes(g.name) && g.label.includes(slot) && g.label.includes(STATUS_OF[g.name]), g.label);
      if (chips) s.ok(`${tag} ${g.name}: the bill chip sits inside the row`, g.chipInside, g);
      s.check(`${tag} ${g.name}: bill chip`, g.chipText, chips ? chips[g.name] : "");
    };
    const SHORT_TYPES = { "Meera Shah": "First", "Ravi Kumar": "Review", "Lakshmi Devi": "Procedure", "Suresh Babu": "Review", "Priya Nair": "Review", "Venkata Subramanian": "First" };

    for (const [who, viewport, tag, chips, words] of [
      ["reception", DESKTOP, "1280", DESK_CHIPS, false],
      ["reception", { width: 1440, height: 900 }, "1440", DESK_CHIPS, true],
      ["doctor", DESKTOP, "1280", DESK_CHIPS, false],
      ["nurse", DESKTOP, "1280", null, true],
    ]) {
      await scenario(`${who} ${tag}: every row keeps its time, a readable name, type, status${chips ? " and bill chip" : ""}`, async (s) => {
        const o = await open(who, viewport);
        s.opened.push(o);
        await calendar(o.page);
        const all = await geometry(o.page);
        console.log(`    GEOMETRY ${who} ${tag} ${JSON.stringify(all.map((g) => [g.name, g.width, g.buttonWidth, g.nameWidth, g.height, g.chipText, g.type, g.statusText]))}`);
        s.check("every seeded appointment is a row", all.map((g) => g.name).sort(), Object.keys(SLOT_OF).sort());
        for (const g of all) fitsRow(s, `${who} ${tag}`, g, { chips, types: SHORT_TYPES, words });
        s.ok("no sideways scroll", await noSideways(o.page));
        s.ok("no refused calls", o.refused.length === 0, o.refused);
        await s.shot(o.page, `${who}-rows-${tag}`);
      });
    }

    await scenario("reception 390: rows keep the name, the status and the bill chip inside the column", async (s) => {
      const o = await open("reception", PHONE);
      s.opened.push(o);
      await calendar(o.page);
      for (const g of await geometry(o.page)) {
        s.ok(`${g.name}: name keeps room (${g.nameWidth}px)`, g.nameWidth >= 24, g);
        s.ok(`${g.name}: one line, nothing pushed out of the row`, g.oneLine && !g.clipped, g);
        s.check(`${g.name}: phone chip inside the row`, [g.chipText, g.chipInside], g.chipText ? [g.chipText, true] : ["", null]);
        s.ok(`${g.name}: time and status in the accessible label`, g.label.includes(SLOT_OF[g.name]) && g.label.includes(STATUS_OF[g.name]), g.label);
      }
      s.ok("no sideways scroll", await noSideways(o.page));
      s.ok("no refused calls", o.refused.length === 0, o.refused);
      await s.shot(o.page, "reception-rows-390");
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
      s.ok("whole day total", clean(await o.page.getByRole("region", { name: "Whole day", exact: true }).innerText()).includes("Whole day ₹5,224.00 Clinic ₹5,000.00 Pharmacy ₹224.00"), clean(await o.page.getByRole("region", { name: "Whole day", exact: true }).innerText()).slice(0, 200));
      s.check("clinic by mode", await tableRows(o.page, "Clinic: consultations and procedures by payment mode"), [["Cash", "4,000.00", "0.00", "4,000.00"], ["UPI", "500.00", "0.00", "500.00"], ["Card", "500.00", "0.00", "500.00"]]);
      const clinic = clean(await o.page.getByRole("region", { name: "Clinic: consultations and procedures", exact: true }).innerText());
      s.ok("clinic tiles", clinic.includes("Clinic received ₹5,000.00") && clinic.includes("Clinic billed today ₹6,900.00") && clinic.includes("Clinic still due ₹1,900.00"), clinic.slice(0, 300));
      const bills = await tableRows(o.page, "Clinic bills");
      s.check("six clinic bills today, the unpaid ₹1,700 first consultation among them", bills.length, 6);
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
      await p.page.goto(`${stack.base}/dashboard/inventory`, { waitUntil: "domcontentloaded" });
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
      s.check("bill types for the nurse", Object.fromEntries(all.map((r) => [r.name, r.type])), { "Lakshmi Devi": "Procedure", "Meera Shah": "First", "Priya Nair": "Review", "Ravi Kumar": "Review", "Suresh Babu": "Review", "Venkata Subramanian": "First" });
      s.check("no bill amounts for the nurse", all.filter((r) => r.chip !== null).length, 0);
      s.check("no Daily Collection in the nurse's menu", (await menuLinks(n.page, false)).includes("Daily Collection"), false);
      s.ok("no refused calls", n.refused.length === 0, n.refused);
      await s.shot(n.page, "nurse-calendar-1280");
    });

    // Review fix: a desk payment is money in hand (COMPLETED), the server caps it at what is due, and
    // the dialog shows the server's refusal when another desk took the money first.
    const attempt = (page, method, url, body) =>
      page.evaluate(async ({ method, url, body }) => {
        const response = await fetch(`/api${url}`, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
        return { status: response.status, body: await response.json().catch(() => null) };
      }, { method, url, body });
    const otherDesk = async () => {
      const o = await open("admin", DESKTOP);
      await o.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded" });
      return o;
    };
    const deliberate = (from, label) => {
      const refusals = sink.splice(from).filter((e) => {
        const expected = /status of 400/.test(e);
        if (expected) console.log(`    NOTE deliberate ${label}: ${e}`);
        return !expected;
      });
      sink.push(...refusals);
    };
    const withoutReference = (text) => clean(text).replace(/\(Reference: [0-9a-f-]{36}\)/, "(Reference)");
    const paymentsOf = async (invoiceId) => {
      const invoice = await stack.db.newInvoice.findUnique({ where: { id: invoiceId }, include: { payments: { orderBy: { createdAt: "asc" } } } });
      return [invoice.received, invoice.balance, invoice.payments.map((p) => [p.mode, p.amount, p.reconStatus])];
    };

    await scenario("reception 1280: a payment another desk already took is refused in the server's words, then shows Paid", async (s) => {
      const desk = await otherDesk();
      s.opened.push(desk);
      const suresh = await call(desk.page, "POST", "/billing/invoices", {
        patientId: "cr17-suresh", appointmentId: "cr17-a-suresh",
        items: [{ name: "Review consultation", description: "Review consultation", quantity: 1, unitPrice: 600, gstRate: 0, discount: 0 }],
      });
      const o = await open("reception", DESKTOP);
      s.opened.push(o);
      await calendar(o.page);
      await chipOf(o.page, "Suresh Babu").click();
      const dialog = o.page.getByRole("dialog", { name: "Bill for Suresh Babu" });
      await dialog.getByText("Review consultation").waitFor();
      s.check("the amount starts at what is due", await dialog.getByRole("textbox", { name: "Amount received" }).inputValue(), "600");
      await call(desk.page, "POST", "/billing/payments", { invoiceId: suresh.id, amount: 600, method: "CASH" });
      const before = sink.length;
      await dialog.getByRole("button", { name: "Record ₹600 payment" }).click();
      const alert = dialog.getByRole("alert");
      await alert.waitFor();
      s.check("the server's refusal, word for word, with its support reference", withoutReference(await alert.innerText()), `Bill ${suresh.invoiceNo} is already paid in full, so ₹600 cannot be recorded. (Reference) Nothing was saved.`);
      await dialog.getByRole("region", { name: `Bill ${suresh.invoiceNo}` }).getByText("Paid", { exact: true }).waitFor();
      s.check("the bill reloads to what is stored", clean(await dialog.getByRole("region", { name: `Bill ${suresh.invoiceNo}` }).innerText()).includes("Total ₹600 Received ₹600 Due ₹0"), true);
      s.check("nothing is left to record", await dialog.getByRole("button", { name: /^Record/ }).count(), 0);
      deliberate(before, "refused payment");
      await s.shot(o.page, "reception-refused-payment-1280");
      s.check("one completed payment in the database", await paymentsOf(suresh.id), [600, 0, [["CASH", 600, "COMPLETED"]]]);
      const extra = await attempt(desk.page, "POST", "/billing/payments", { invoiceId: suresh.id, amount: 1, method: "CASH" });
      s.check("the API refuses a rupee more", [extra.status, extra.body?.message], [400, `Bill ${suresh.invoiceNo} is already paid in full, so ₹1 cannot be recorded.`]);
      deliberate(before, "API overpay");
      await o.page.keyboard.press("Escape");
      await chipOf(o.page, "Suresh Babu").filter({ hasText: "₹600 · Paid" }).waitFor();
      s.ok("no refused calls", o.refused.length === 0, o.refused);
    });

    await scenario("reception 390: a part paid elsewhere is refused with what is still due, and paying that settles the bill", async (s) => {
      const desk = await otherDesk();
      s.opened.push(desk);
      const dressing = await call(desk.page, "POST", "/billing/invoices", {
        patientId: "cr17-meera", appointmentId: "cr17-a-meera",
        items: [{ name: "Dressing", description: "Dressing", quantity: 1, unitPrice: 400, gstRate: 0, discount: 0 }],
      });
      const o = await open("reception", PHONE);
      s.opened.push(o);
      await calendar(o.page);
      await chipOf(o.page, "Meera Shah").click();
      const dialog = o.page.getByRole("dialog", { name: "Bill for Meera Shah" });
      await dialog.getByText("Dressing").waitFor();
      const amount = dialog.getByRole("textbox", { name: "Amount received" });
      s.check("the amount starts at the new bill's due", await amount.inputValue(), "400");
      await call(desk.page, "POST", "/billing/payments", { invoiceId: dressing.id, amount: 300, method: "UPI" });
      const before = sink.length;
      await dialog.getByRole("button", { name: "Record ₹400 payment" }).click();
      await dialog.getByRole("alert").waitFor();
      s.check("the server names what is still due", withoutReference(await dialog.getByRole("alert").innerText()), `Only ₹100 is due on bill ${dressing.invoiceNo}, so ₹400 cannot be recorded. (Reference) Nothing was saved.`);
      await dialog.getByRole("button", { name: "Record ₹100 payment" }).waitFor();
      s.check("the amount moves to what is still due", await amount.inputValue(), "100");
      deliberate(before, "refused overpay");
      await dialog.getByRole("alert").scrollIntoViewIfNeeded();
      const box = await dialog.boundingBox();
      s.ok("the bill fits the phone", box && box.x >= 0 && box.x + box.width <= 390, box);
      s.ok("no sideways scroll", await noSideways(o.page));
      await s.shot(o.page, "reception-refused-overpay-390");
      await dialog.getByRole("button", { name: "Record ₹100 payment" }).click();
      await dialog.getByRole("region", { name: `Bill ${dressing.invoiceNo}` }).getByText("Paid", { exact: true }).waitFor();
      s.check("the refusal clears once a payment goes through", await dialog.getByRole("alert").count(), 0);
      s.check("both payments completed in the database", await paymentsOf(dressing.id), [400, 0, [["UPI", 300, "COMPLETED"], ["CASH", 100, "COMPLETED"]]]);
      await s.shot(o.page, "reception-settled-after-refusal-390");
      s.ok("no refused calls", o.refused.length === 0, o.refused);
    });

    await scenario("admin 1280: the revenue report counts the desk payments that Daily Collection shows", async (s) => {
      const o = await open("admin", DESKTOP);
      s.opened.push(o);
      await o.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded" });
      const revenue = await call(o.page, "GET", `/reports/revenue?startDate=${today}&endDate=${today}&includePaymentBreakdown=true`);
      const collection = await call(o.page, "GET", `/pharmacy/reports/daily-collection?from=${today}`);
      const summary = await call(o.page, "GET", "/billing/payments/summary");
      s.check("revenue report, Daily Collection's clinic block and the payment summary agree", [revenue.totalRevenue, collection.clinic.net, summary.totalAmount], [6000, 6000, 6000]);
      const byMode = (lines) => lines.filter(([, amount]) => amount).sort(([a], [b]) => a.localeCompare(b));
      s.check("by mode", byMode(revenue.paymentBreakdown.map((m) => [m.mode, m.amount])), [["CARD", 500], ["CASH", 4700], ["UPI", 800]]);
      s.check("Daily Collection by mode", byMode(collection.clinic.modes.map((m) => [m.mode, m.net])), [["CARD", 500], ["CASH", 4700], ["UPI", 800]]);
      s.check("no clinic payment is left pending", await stack.db.newPayment.count({ where: { reconStatus: { not: "COMPLETED" } } }), 0);
      await o.page.goto(`${stack.base}/dashboard/reports`, { waitUntil: "domcontentloaded" });
      const dates = o.page.locator('input[type="date"]');
      await dates.nth(1).waitFor({ timeout: 120000 });
      const revenueCard = () => o.page.getByText("Total Revenue", { exact: true }).first().locator("xpath=../..");
      const monthAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
      s.check("the Reports page opens on the 30 clinic days up to today", [await dates.nth(0).inputValue(), await dates.nth(1).inputValue()], [monthAgo, today]);
      await revenueCard().filter({ hasText: "6,000" }).waitFor({ timeout: 60000 });
      s.check("the Reports page shows the same ₹6,000 with its default range", clean(await revenueCard().innerText()), "Total Revenue ₹6,000.00");
      await revenueCard().scrollIntoViewIfNeeded();
      await s.shot(o.page, "admin-revenue-report-1280");
      s.ok("no refused calls", o.refused.length === 0, o.refused);
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
