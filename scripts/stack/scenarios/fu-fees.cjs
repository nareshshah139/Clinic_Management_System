// The fee list on the real stack (NestJS + Next.js + PostgreSQL + Chromium): an admin keeps one fee per
// bill type, and Create bill on the appointments calendar starts from it.
// Usage: STACK_DATABASE_URL=postgresql://user@127.0.0.1:5432/db node scripts/stack/scenarios/fu-fees.cjs
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");

const root = path.resolve(__dirname, "../../..");
const out = process.env.SHOTS_DIR || path.join(root, "output/stack/fu-fees");
const clean = (text) => String(text ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const clinicToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
const results = [];
// Refusals that predate the fee list and are tracked on their own: the header asks every role for system
// alerts (RECEPTION and NURSE are refused), and the calendar's room filter asks for rooms (NURSE is refused).
const KNOWN_REFUSALS = { "/api/reports/alerts": { roles: ["reception", "nurse"], console: null }, "/api/appointments/rooms": { roles: ["nurse"], console: "Failed to fetch rooms" } };
const known = (who, where) => KNOWN_REFUSALS[where]?.roles.includes(who);

async function seed(stack, today) {
  const db = stack.db;
  const branchId = stack.branch.id;
  const doctorId = stack.users.doctor.id;
  for (const [id, name, gender, dob] of [
    ["fee-meera", "Meera Shah", "F", "1992-03-04"],
    ["fee-ravi", "Ravi Kumar", "M", "1985-07-19"],
    ["fee-lakshmi", "Lakshmi Devi", "F", "1978-11-02"],
    ["fee-suresh", "Suresh Babu", "M", "1969-01-25"],
  ])
    await db.patient.create({ data: { id, name, gender, dob: new Date(dob), phone: "9000000000", branchId } });
  const appointment = (id, patientId, slot, extra = {}) =>
    db.appointment.create({ data: { id, branchId, doctorId, patientId, date: new Date(today), slot, status: "CONFIRMED", ...extra } });
  await appointment("fee-a-meera", "fee-meera", "09:00-09:15", { tokenNumber: 1 });
  await appointment("fee-a-ravi", "fee-ravi", "09:30-09:45", { tokenNumber: 2 });
  await appointment("fee-a-lakshmi", "fee-lakshmi", "10:00-10:30", { tokenNumber: 3, visitType: "PROCEDURE", notes: "Chemical peel" });
  await appointment("fee-a-suresh", "fee-suresh", "10:30-10:45", { tokenNumber: 4 });
  for (const patientId of ["fee-ravi", "fee-suresh"])
    await db.visit.create({ data: { patientId, doctorId, complaints: "[]", status: "COMPLETED", createdAt: new Date("2026-10-01T05:00:00Z") } });
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "fu-fees" });
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
    const sink = [];
    const sessions = new Map();
    async function open(who, viewport) {
      const context = await browser.newContext({ viewport, ...(sessions.has(who) && { storageState: sessions.get(who) }) });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      page.on("pageerror", (e) => sink.push(`${who} pageerror ${e.message.slice(0, 200)}`));
      const knownConsole = (m) =>
        Object.entries(KNOWN_REFUSALS).some(([where, k]) => k.roles.includes(who) && ((m.location()?.url ?? "").includes(where) || (k.console && m.text().startsWith(k.console))));
      page.on("console", (m) => m.type() === "error" && !knownConsole(m) && sink.push(`${who} console ${m.text().slice(0, 200)}`));
      const refused = [];
      page.on("response", (r) => {
        if (!r.url().includes("/api/") || ![401, 403, 409].includes(r.status())) return;
        const where = new URL(r.url()).pathname;
        if (known(who, where)) console.log(`    NOTE ${who} ${r.status()} ${where} (predates the fee list)`);
        else refused.push(`${r.request().method()} ${r.status()} ${where}`);
      });
      return { page, context, refused };
    }

    // Sign-in allows five attempts a minute, so every role signs in once, spaced out, before the scenarios.
    for (const who of ["admin", "reception", "owner", "doctor", "pharmacist", "nurse"]) {
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
          const file = path.join(out, `fu-fees-${slug}.png`);
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
      if (error) console.log(`    EXCEPTION ${String(error.message).split("\n").slice(0, 3).join(" | ")}`);
      for (const e of errors) console.log(`    ERROR ${e}`);
      for (const f of shots) console.log(`    SHOT ${f}`);
    }

    const attempt = (page, method, url, body) =>
      page.evaluate(async ({ method, url, body }) => {
        const response = await fetch(`/api${url}`, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
        return { status: response.status, body: await response.json().catch(() => null) };
      }, { method, url, body });
    const deliberate = (from, label, status) => {
      const kept = sink.splice(from).filter((e) => {
        const expected = new RegExp(`status of ${status}`).test(e);
        if (expected) console.log(`    NOTE deliberate ${label}: ${e}`);
        return !expected;
      });
      sink.push(...kept);
    };
    const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const menuLinks = async (page, phone) => {
      if (phone) {
        const sheet = page.getByRole("dialog").getByRole("navigation", { name: "Main navigation" });
        for (let tries = 0; tries < 10 && !(await sheet.isVisible()); tries++) {
          await page.getByRole("button", { name: "Open clinic navigation" }).click();
          await sheet.waitFor({ timeout: 3000 }).catch(() => {});
        }
        await sheet.waitFor();
      }
      const nav = phone ? page.getByRole("dialog").getByRole("navigation", { name: "Main navigation" }) : page.getByRole("navigation", { name: "Main navigation" });
      await nav.getByRole("link").first().waitFor();
      return (await nav.getByRole("link").allInnerTexts()).map(clean);
    };
    const feeList = async (page) => {
      await page.getByRole("form", { name: "Procedure" }).waitFor({ timeout: 240000 });
      return page.getByRole("region", { name: "Fees by bill type" }).getByRole("form").evaluateAll((forms) =>
        forms.map((f) => [f.querySelector("h2").innerText.trim(), f.querySelector("input").value, f.querySelector('[data-testid="fee-status"]').innerText.trim()]),
      );
    };
    const row = (page, label) => page.getByRole("form", { name: label });
    const stored = async () =>
      (await stack.db.clinicFee.findMany({ orderBy: { billType: "asc" } })).map((f) => [f.billType, f.amount, f.version, f.updatedById === stack.users.admin.id ? "admin" : f.updatedById === stack.users.owner.id ? "owner" : f.updatedById]);
    const calendar = async (page, count = 4) => {
      await page.goto(`${stack.base}/dashboard/appointments`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.locator("[data-appointment-block]").first().waitFor({ timeout: 240000 });
      await page.waitForFunction((n) => !document.querySelector('[aria-busy="true"]') && document.querySelectorAll("[data-appointment-block]").length >= n, count, { timeout: 120000 });
      await page.waitForTimeout(300);
    };
    const chipOf = (page, patient) => page.locator("[data-appointment-block]", { has: page.locator("[data-patient-name]", { hasText: patient }) }).locator("[data-appointment-billing]");
    const openBill = async (page, patient, phone = false) => {
      if (phone) {
        await page.locator("[data-appointment-block]", { has: page.locator("[data-patient-name]", { hasText: patient }) }).getByRole("button", { name: new RegExp(`^(Token \\d+, )?${patient}, `) }).click();
        await page.getByRole("dialog", { name: "Appointment Details" }).getByRole("button", { name: "Create bill" }).click();
      } else await chipOf(page, patient).click();
      const dialog = page.getByRole("dialog", { name: `Bill for ${patient}` });
      await dialog.getByRole("heading", { name: "Create bill" }).waitFor();
      return dialog;
    };
    // A success toast is the top layer, so the first Escape dismisses the toast and the next one the dialog.
    const closeBill = async (page, dialog) => {
      for (let tries = 0; tries < 4 && (await dialog.isVisible()); tries++) {
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden", timeout: 3000 }).catch(() => {});
      }
      await dialog.waitFor({ state: "hidden" });
    };
    const feeSource = async (dialog) => clean(await dialog.getByTestId("fee-source").innerText());
    const invoiceOf = (appointmentId) => stack.db.newInvoice.findFirst({ where: { appointmentId }, include: { items: true, payments: true } });
    const invoiceShape = (invoice) => invoice && [invoice.total, invoice.received, invoice.balance, invoice.items.map((i) => [i.name, i.unitPrice, i.total, i.gstRate]), invoice.payments.map((p) => [p.mode, p.amount])];

    await scenario("admin 1280: Fee list from the Admin menu; sets First consultation ₹1,280 and Review ₹390; a reload keeps both", async (s) => {
      const o = await open("admin", DESKTOP);
      s.opened.push(o);
      await o.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 240000 });
      const links = await menuLinks(o.page, false);
      s.ok("Fee list sits in the Admin menu after Users", links.indexOf("Fee list") === links.indexOf("Users") + 1, links);
      await o.page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Fee list" }).click();
      s.check("a new branch starts with no fees", await feeList(o.page), [
        ["First consultation", "", "No fee set yet"], ["Review", "", "No fee set yet"], ["Procedure", "", "No fee set yet"],
      ]);
      s.check("Fee list is the current page", await o.page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Fee list" }).getAttribute("aria-current"), "page");
      await s.shot(o.page, "admin-fee-list-empty-1280");
      await row(o.page, "First consultation").getByRole("textbox").fill("1,280");
      await row(o.page, "First consultation").getByRole("textbox").press("Enter");
      await row(o.page, "First consultation").getByTestId("fee-status").filter({ hasText: "₹1,280 · changed" }).waitFor();
      await row(o.page, "Review").getByRole("textbox").fill("390");
      s.check("Save waits for a change, then saves", [await row(o.page, "Procedure").getByRole("button", { name: "Save" }).isDisabled(), await row(o.page, "Review").getByRole("button", { name: "Save" }).isDisabled()], [true, false]);
      await row(o.page, "Review").getByRole("button", { name: "Save" }).click();
      await row(o.page, "Review").getByTestId("fee-status").filter({ hasText: "₹390 · changed" }).waitFor();
      await row(o.page, "Procedure").getByRole("textbox").fill("0");
      s.check("a zero fee is refused before saving", [clean(await row(o.page, "Procedure").innerText()).includes("Enter an amount above 0 and up to ₹10,00,000, for example 500."), await row(o.page, "Procedure").getByRole("button", { name: "Save" }).isDisabled()], [true, true]);
      await s.shot(o.page, "admin-fee-list-saved-1280");
      await o.page.reload({ waitUntil: "domcontentloaded" });
      const after = await feeList(o.page);
      s.check("after reload, amounts", after.map(([label, value]) => [label, value]), [["First consultation", "1280"], ["Review", "390"], ["Procedure", ""]]);
      s.ok("after reload, who changed each fee", /^₹1,280 · changed .+ by Meera Kulkarni$/.test(after[0][2]) && /^₹390 · changed .+ by Meera Kulkarni$/.test(after[1][2]) && after[2][2] === "No fee set yet", after);
      s.check("the database holds both fees, saved once each", await stored(), [["FIRST_CONSULTATION", 1280, 1, "admin"], ["REVIEW", 390, 1, "admin"]]);
      s.ok("no refused calls", o.refused.length === 0, o.refused);
    });

    await scenario("reception 1280: Create bill starts from the fee for each bill type; the edited amount is what is billed; no fee says so", async (s) => {
      const o = await open("reception", DESKTOP);
      s.opened.push(o);
      await calendar(o.page);
      let dialog = await openBill(o.page, "Meera Shah");
      s.check("first consultation: fee, paid now, source", [await dialog.getByRole("textbox", { name: "Fee" }).inputValue(), await dialog.getByRole("textbox", { name: "Paid now" }).inputValue(), await feeSource(dialog)],
        ["1280", "1280", "From fee list: First consultation ₹1,280"]);
      await s.shot(o.page, "reception-prefilled-first-consultation-1280");
      await dialog.getByRole("button", { name: "Create bill and record ₹1,280" }).click();
      await dialog.getByRole("region", { name: /^Bill INV-/ }).waitFor();
      s.check("stored as the list's fee, paid in cash", invoiceShape(await invoiceOf("fee-a-meera")), [1280, 1280, 0, [["First consultation", 1280, 1280, 0]], [["CASH", 1280]]]);
      await closeBill(o.page, dialog);

      dialog = await openBill(o.page, "Ravi Kumar");
      s.check("review: fee and source", [await dialog.getByRole("textbox", { name: "Fee" }).inputValue(), await feeSource(dialog)], ["390", "From fee list: Review ₹390"]);
      await dialog.getByRole("textbox", { name: "Fee" }).fill("450");
      s.check("an edited fee names the list's fee and offers it back", await feeSource(dialog), "Fee list: Review ₹390, changed for this bill. Use ₹390");
      await dialog.getByRole("textbox", { name: "Paid now" }).fill("0");
      await s.shot(o.page, "reception-edited-review-fee-1280");
      await dialog.getByRole("button", { name: "Create bill", exact: true }).click();
      await dialog.getByRole("region", { name: /^Bill INV-/ }).waitFor();
      s.check("stored with the edited amount, nothing paid", invoiceShape(await invoiceOf("fee-a-ravi")), [450, 0, 450, [["Review consultation", 450, 450, 0]], []]);
      await closeBill(o.page, dialog);

      dialog = await openBill(o.page, "Lakshmi Devi");
      s.check("procedure without a fee: empty, said in words, no link for the desk", [await dialog.getByRole("textbox", { name: "Fee" }).inputValue(), await feeSource(dialog), await dialog.getByRole("link", { name: "Set fees" }).count(), await dialog.getByRole("button", { name: "Create bill" }).isDisabled()],
        ["", "No fee set for Procedure.", 0, true]);
      await s.shot(o.page, "reception-no-fee-procedure-1280");
      await o.page.keyboard.press("Escape");
      await o.page.reload({ waitUntil: "domcontentloaded" });
      await calendar(o.page);
      s.check("the calendar rows after a reload", [clean(await chipOf(o.page, "Meera Shah").innerText()), clean(await chipOf(o.page, "Ravi Kumar").innerText())], ["₹1,280 · Paid", "₹450 · Due ₹450"]);
      s.check("no Fee list in reception's menu", (await menuLinks(o.page, false)).includes("Fee list"), false);
      s.ok("no refused calls", o.refused.length === 0, o.refused);
    });

    await scenario("reception 390: the pre-filled fee and its source fit a phone", async (s) => {
      const o = await open("reception", PHONE);
      s.opened.push(o);
      await calendar(o.page);
      s.ok("no sideways scroll on the calendar", await noSideways(o.page));
      const dialog = await openBill(o.page, "Suresh Babu", true);
      s.check("review fee on the phone", [await dialog.getByRole("textbox", { name: "Fee" }).inputValue(), await feeSource(dialog)], ["390", "From fee list: Review ₹390"]);
      await dialog.getByTestId("fee-source").scrollIntoViewIfNeeded();
      const box = await dialog.boundingBox();
      s.ok("the bill fits the phone", box && box.x >= 0 && box.x + box.width <= 390, box);
      s.ok("no sideways scroll", await noSideways(o.page));
      await s.shot(o.page, "reception-prefilled-review-390");
      await closeBill(o.page, dialog);
      s.check("no Fee list in reception's phone menu", (await menuLinks(o.page, true)).includes("Fee list"), false);
      s.ok("no refused calls", o.refused.length === 0, o.refused);
    });

    await scenario("admin 1280: a procedure without a fee links to the Fee list; the new fee fills the next bill; old bills keep their amount", async (s) => {
      const o = await open("admin", DESKTOP);
      s.opened.push(o);
      await calendar(o.page);
      const dialog = await openBill(o.page, "Lakshmi Devi");
      s.check("an admin is offered the fee list", await feeSource(dialog), "No fee set for Procedure. Set fees");
      await s.shot(o.page, "admin-no-fee-set-fees-link-1280");
      await dialog.getByRole("link", { name: "Set fees" }).click();
      await feeList(o.page);
      s.check("the link opens the Fee list", new URL(o.page.url()).pathname, "/dashboard/fees");
      await row(o.page, "Procedure").getByRole("textbox").fill("2500");
      await row(o.page, "Procedure").getByRole("button", { name: "Save" }).click();
      await row(o.page, "Procedure").getByTestId("fee-status").filter({ hasText: "₹2,500 · changed" }).waitFor();
      await row(o.page, "First consultation").getByRole("textbox").fill("1500");
      await row(o.page, "First consultation").getByRole("button", { name: "Save" }).click();
      await row(o.page, "First consultation").getByTestId("fee-status").filter({ hasText: "₹1,500 · changed" }).waitFor();
      await calendar(o.page);
      const again = await openBill(o.page, "Lakshmi Devi");
      s.check("the procedure bill now starts from ₹2,500", [await again.getByRole("textbox", { name: "Fee" }).inputValue(), await feeSource(again), await again.getByRole("textbox", { name: "Bill line" }).inputValue()], ["2500", "From fee list: Procedure ₹2,500", "Procedure: Chemical peel"]);
      await o.page.keyboard.press("Escape");
      s.check("Meera's bill keeps ₹1,280 after the fee moved to ₹1,500", invoiceShape(await invoiceOf("fee-a-meera")), [1280, 1280, 0, [["First consultation", 1280, 1280, 0]], [["CASH", 1280]]]);
      s.check("and her row still says so", clean(await chipOf(o.page, "Meera Shah").innerText()), "₹1,280 · Paid");
      s.check("the database", await stored(), [["FIRST_CONSULTATION", 1500, 2, "admin"], ["REVIEW", 390, 1, "admin"], ["PROCEDURE", 2500, 1, "admin"]]);
      s.ok("no refused calls", o.refused.length === 0, o.refused);
    });

    await scenario("admin 390: the Fee list on a phone, from the phone menu, without sideways scroll", async (s) => {
      const o = await open("admin", PHONE);
      s.opened.push(o);
      await o.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 240000 });
      s.ok("Fee list in the phone menu", (await menuLinks(o.page, true)).includes("Fee list"));
      await o.page.getByRole("dialog").getByRole("link", { name: "Fee list" }).click();
      const list = await feeList(o.page);
      s.check("amounts on the phone", list.map(([label, value]) => [label, value]), [["First consultation", "1500"], ["Review", "390"], ["Procedure", "2500"]]);
      s.ok("no sideways scroll", await noSideways(o.page));
      const boxes = await o.page.getByRole("region", { name: "Fees by bill type" }).getByRole("button", { name: "Save" }).evaluateAll((b) => b.map((el) => el.getBoundingClientRect().right));
      s.ok("every Save button is on screen", boxes.length === 3 && boxes.every((r) => r <= 390), boxes);
      await s.shot(o.page, "admin-fee-list-390");
      await row(o.page, "Review").getByRole("textbox").fill("");
      s.check("an emptied box clears the fee", await row(o.page, "Review").getByRole("button", { name: "Clear fee" }).count(), 1);
      await row(o.page, "Review").getByRole("textbox").fill("390");
      s.ok("no refused calls", o.refused.length === 0, o.refused);
    });

    await scenario("refusals: reception, nurse, pharmacist and doctor get 403 from the fee list API and no menu entry; the page says only an admin can change it", async (s) => {
      for (const who of ["reception", "nurse", "pharmacist", "doctor"]) {
        const o = await open(who, DESKTOP);
        s.opened.push(o);
        await o.page.goto(`${stack.base}/dashboard/fees`, { waitUntil: "domcontentloaded", timeout: 240000 });
        await o.page.getByText("Only an admin can change the fee list.").waitFor({ timeout: 240000 });
        s.check(`${who}: the page asks the server nothing and shows no fees`, [o.refused, await o.page.getByRole("form").count()], [[], 0]);
        if (who === "reception") await s.shot(o.page, "reception-fee-list-refused-1280");
        s.check(`${who}: no Fee list in the menu`, (await menuLinks(o.page, false)).includes("Fee list"), false);
        const before = sink.length;
        const read = await attempt(o.page, "GET", "/billing/fees");
        const write = await attempt(o.page, "PUT", "/billing/fees/REVIEW", { amount: 1, version: 1 });
        s.check(`${who}: 403 on reading and on saving`, [read.status, write.status], [403, 403]);
        deliberate(before, `${who} refused`, 403);
        o.refused.length = 0;
      }
      s.check("nothing changed", await stored(), [["FIRST_CONSULTATION", 1500, 2, "admin"], ["REVIEW", 390, 1, "admin"], ["PROCEDURE", 2500, 1, "admin"]]);
    });

    await scenario("admin 1280: when the owner changed a fee first, the admin is told who and what, keeps the typed amount, and saves it on purpose", async (s) => {
      const o = await open("admin", DESKTOP);
      s.opened.push(o);
      await o.page.goto(`${stack.base}/dashboard/fees`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await feeList(o.page);
      const desk = await open("owner", DESKTOP);
      s.opened.push(desk);
      await desk.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded" });
      const ownerSave = await attempt(desk.page, "PUT", "/billing/fees/REVIEW", { amount: 450, version: 1 });
      s.check("the owner's save", [ownerSave.status, ownerSave.body?.amount, ownerSave.body?.version, ownerSave.body?.updatedBy], [200, 450, 2, "Rajesh Iyer"]);
      await row(o.page, "Review").getByRole("textbox").fill("400");
      const before = sink.length;
      await row(o.page, "Review").getByRole("button", { name: "Save" }).click();
      const alert = row(o.page, "Review").getByRole("alert");
      await alert.waitFor();
      s.check("told who changed it and to what", clean(await alert.innerText()), "Rajesh Iyer set the Review fee to ₹450 while you were editing. Check it and save again. Your ₹400 is still in the box.");
      s.ok("the row now shows the owner's fee", /^₹450 · changed .+ by Rajesh Iyer$/.test(clean(await row(o.page, "Review").getByTestId("fee-status").innerText())));
      s.check("the typed amount stays", await row(o.page, "Review").getByRole("textbox").inputValue(), "400");
      s.check("nothing of the admin's was saved", await stored(), [["FIRST_CONSULTATION", 1500, 2, "admin"], ["REVIEW", 450, 2, "owner"], ["PROCEDURE", 2500, 1, "admin"]]);
      deliberate(before, "stale save", 409);
      s.check("the one refusal is the stale save", o.refused, ["PUT 409 /api/billing/fees/REVIEW"]);
      o.refused.length = 0;
      await s.shot(o.page, "admin-fee-conflict-1280");
      await row(o.page, "Review").getByRole("button", { name: "Save" }).click();
      await row(o.page, "Review").getByTestId("fee-status").filter({ hasText: "₹400 · changed" }).waitFor();
      s.check("the alert clears once saved", await row(o.page, "Review").getByRole("alert").count(), 0);
      s.check("saved over the owner's version", await stored(), [["FIRST_CONSULTATION", 1500, 2, "admin"], ["REVIEW", 400, 3, "admin"], ["PROCEDURE", 2500, 1, "admin"]]);
      s.ok("no other refused calls", o.refused.length === 0, o.refused);
    });
  } finally {
    fs.writeFileSync(path.join(out, "fu-fees-results.json"), JSON.stringify(results, null, 2));
    console.log("\nSUMMARY");
    for (const r of results) console.log(`  ${r.pass ? "ok  " : "FAILED"}  ${r.name}  ${r.seconds}s`);
    await browser?.close().catch(() => {});
    await stack.stop();
    process.exitCode = results.length && results.every((r) => r.pass) ? 0 : 1;
  }
})().catch((e) => {
  console.error("FU-FEES HARNESS ERROR", e);
  process.exit(2);
});
