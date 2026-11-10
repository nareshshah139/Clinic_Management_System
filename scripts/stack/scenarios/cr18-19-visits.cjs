const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");

const root = path.resolve(__dirname, "../../..");
const out = path.join(root, "output/stack/cr18-19-visits");
const shotsDir = process.env.SHOTS_DIR || out;

const FUCIBET_NOTE = "1 pea size amount- whole face";
const LONG_NOTE = "Apply a thin layer on the affected skin twice daily after cleansing and keep out of direct sunlight, reapply after swimming";
const OLD_HISTORY = { pastHistory: "Eczema as a child", personalHistory: "Night shifts", triggers: "Heat and stress", priorTreatments: "Clobetasol cream" };
const SIZES = [{ width: 1280, height: 900 }, { width: 390, height: 844 }];
const WIDE = { width: 1920, height: 1000 };
const ROLES = ["doctor", "admin", "owner"];

let sink = [];
const watch = (page) => {
  page.on("pageerror", (e) => sink.push({ type: "pageerror", text: e.message.slice(0, 300) }));
  page.on("console", (m) => m.type() === "error" && sink.push({ type: "console", text: m.text().slice(0, 300) }));
};

async function api(page, method, url, body) {
  const result = await page.evaluate(
    async ({ method, url, body }) => {
      const response = await fetch(`/api${url}`, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    { method, url, body },
  );
  assert(result.status < 300, `${method} ${url} -> ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

const asArray = (value) => (typeof value === "string" ? JSON.parse(value) : value ?? []);
const asObject = (value) => (typeof value === "string" ? JSON.parse(value) : value ?? {});

(async () => {
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(shotsDir, { recursive: true });
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "cr18-19" });
  let browser;
  const results = [];
  try {
    console.log(`BOOT base=${stack.base}`);
    const owner = await stack.db.user.findUnique({ where: { id: stack.users.owner.id } });
    const admin = await stack.db.user.create({
      data: {
        branchId: stack.branch.id, email: "meera.kulkarni@stack.example.invalid", firstName: "Meera", lastName: "Kulkarni", role: "ADMIN",
        password: owner.password, permissions: JSON.stringify(["*"]),
      },
    });
    stack.users.admin = { id: admin.id, email: admin.email, password: stack.users.owner.password, role: "ADMIN", firstName: "Meera", lastName: "Kulkarni" };
    await stack.db.user.update({ where: { id: owner.id }, data: { permissions: JSON.stringify(["*"]) } });
    const patient = await stack.db.patient.create({
      data: { branchId: stack.branch.id, name: "Asha Verma", gender: "FEMALE", phone: "9000000018", age: 34, patientCode: "A1819" },
    });

    browser = await chromium.launch();
    const sessions = new Map();
    async function open(role, size) {
      const context = await browser.newContext({ viewport: size, ...(sessions.has(role) && { storageState: sessions.get(role) }) });
      context.on("page", watch);
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      if (!sessions.has(role)) {
        await stack.login(page, role);
        sessions.set(role, await context.storageState());
      }
      await page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 240000 });
      return { page, context };
    }

    const doctorId = stack.users.doctor.id;
    async function makeVisit(page, history = {}, examination) {
      const created = await api(page, "POST", "/visits", {
        patientId: patient.id, doctorId, complaints: [{ complaint: "Acne on the face" }],
        ...(Object.keys(history).length && { history }), ...(examination && { examination }),
      });
      return created.id;
    }
    async function openVisit(page, visitId) {
      await page.goto(`${stack.base}/dashboard/visits?visitId=${visitId}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.getByRole("tab", { name: "Prescription" }).waitFor({ timeout: 240000 });
    }
    async function openPrescription(page, visitId) {
      await openVisit(page, visitId);
      await page.getByRole("tab", { name: "Prescription" }).click();
      await page.getByRole("button", { name: "Add Row" }).first().waitFor();
    }
    const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const widest = (page) => page.evaluate(() => [...document.querySelectorAll("body *")].map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 60), right: Math.round(el.getBoundingClientRect().right) })).sort((a, b) => b.right - a.right).slice(0, 3));
    const AUTOSAVE_QUIET_MS = 9500;

    async function scenario(id, name, run) {
      if (process.env.ONLY && !process.env.ONLY.split(",").includes(id)) return;
      sink = [];
      const t = { checks: [], notes: [], shots: [] };
      const started = Date.now();
      const ctx = {
        check(label, actual, expected) {
          const ok = JSON.stringify(actual) === JSON.stringify(expected);
          t.checks.push({ label, ok, actual: ok ? undefined : actual, expected: ok ? undefined : expected });
        },
        ok(label, cond, detail) {
          t.checks.push({ label, ok: Boolean(cond), actual: cond ? undefined : detail ?? false, expected: cond ? undefined : true });
        },
        note: (text) => t.notes.push(text),
        async shot(page, slug, full = false) {
          const file = path.join(shotsDir, `cr18-19-${slug}.png`);
          await page.screenshot({ path: file, fullPage: full });
          t.shots.push(file);
        },
        opened: [],
        track(o) {
          this.opened.push(o);
          return o;
        },
      };
      let error = null;
      try {
        await run(ctx);
      } catch (e) {
        error = e;
        try {
          const last = ctx.opened.at(-1);
          if (last) await ctx.shot(last.page, `${id}-error`, true);
        } catch {}
      }
      for (const o of ctx.opened) await o.context.close().catch(() => {});
      const failed = t.checks.filter((c) => !c.ok);
      const pageErrors = sink.filter((e) => e.type === "pageerror");
      const consoleErrors = sink.filter((e) => e.type === "console");
      const pass = !error && failed.length === 0 && pageErrors.length === 0;
      const detail = [
        error && `EXCEPTION: ${error.message.split("\n").slice(0, 6).join(" | ")}`,
        ...failed.map((c) => `FAIL ${c.label}: expected ${JSON.stringify(c.expected)} actual ${JSON.stringify(c.actual)}`),
        ...pageErrors.map((e) => `PAGEERROR ${e.text}`),
        ...consoleErrors.map((e) => `console: ${e.text}`),
        ...t.notes.map((n) => `note: ${n}`),
        `${t.checks.length - failed.length}/${t.checks.length} checks passed`,
      ].filter(Boolean).join("\n");
      results.push({ scenario: `${id} ${name}`, pass, detail, screenshots: t.shots, consoleErrors: consoleErrors.map((e) => e.text), seconds: Math.round((Date.now() - started) / 1000) });
      console.log(`${pass ? "PASS" : "FAIL"} ${id} ${name}\n${detail.split("\n").map((l) => `    ${l}`).join("\n")}`);
    }

    const medicineInputs = (page) => page.getByPlaceholder("Search medicine name...");
    const rxTable = (page) => page.locator("table").filter({ has: page.getByRole("columnheader", { name: "Duration" }) }).first();
    const names = (page) => medicineInputs(page).evaluateAll((els) => els.map((el) => el.value));
    const filled = async (page) => (await names(page)).filter(Boolean);
    const rowNamed = async (page, name) => rxTable(page).locator("tbody tr").nth((await names(page)).indexOf(name));
    async function typeMedicine(page, index, name) {
      const input = medicineInputs(page).nth(index);
      await input.click();
      await input.fill(name);
      await page.keyboard.press("Escape");
    }
    async function expandCards(scope) {
      const closed = scope.getByRole("button", { name: "Show details" });
      while (await closed.count()) await closed.first().click();
    }
    async function setInstructions(page, name, text) {
      const field = (await rowNamed(page, name)).getByPlaceholder("e.g., Avoid alcohol");
      await field.fill(text);
      await page.keyboard.press("Tab");
      await page.waitForTimeout(300);
    }
    async function saveRx(page) {
      const saved = page.waitForResponse((r) => /\/api\/prescriptions(\/|$)/.test(r.url()) && ["POST", "PATCH"].includes(r.request().method()) && r.status() < 300, { timeout: 120000 });
      await page.getByRole("button", { name: /^(Create|Update) Prescription$/ }).click();
      await saved;
      const prompt = page.getByRole("dialog", { name: "Go to Pharmacy?" });
      if (await prompt.isVisible().catch(() => false)) await page.keyboard.press("Escape");
    }
    async function saveDraft(page, visitId) {
      const saved = page.waitForResponse((r) => r.url().endsWith(`/api/visits/${visitId}`) && r.request().method() === "PATCH" && r.status() < 300, { timeout: 120000 });
      await page.getByRole("button", { name: "Save Draft" }).first().click();
      await saved;
    }
    const savedNames = async (page, visitId) => {
      const visit = await api(page, "GET", `/visits/${visitId}`);
      return asArray(visit.prescription?.items).map((item) => item.drugName);
    };

    // ---------------------------------------------------------------- CR-18
    for (const role of ROLES) {
      for (const size of SIZES) {
        await scenario(`18-${role}-${size.width}`, `patient-history-without-triggers-and-prior-treatments-as-${role}-at-${size.width}`, async (s) => {
          const { page } = s.track(await open(role, size));
          const visitId = await makeVisit(page);
          await openPrescription(page, visitId);
          const heading = page.locator("#section-histories-heading");
          await heading.waitFor();
          await heading.scrollIntoViewIfNeeded();
          const body = page.locator("div.opacity-100").filter({ has: page.getByRole("textbox", { name: "Past history" }) }).first();
          const labels = (await body.locator("label").allInnerTexts()).map((t) => t.trim());
          s.ok("Triggers is gone from the form", !labels.includes("Triggers") && (await page.getByText("Triggers", { exact: true }).count()) === 0, labels);
          s.ok("Prior Treatments is gone from the form", !labels.includes("Prior Treatments") && (await page.getByText("Prior Treatments", { exact: true }).count()) === 0, labels);
          s.check("their placeholders are gone", [await page.getByPlaceholder("Heat, stress, cosmetics...").count(), await page.getByPlaceholder("Topicals/systemics tried").count()], [0, 0]);
          s.check("Personal history is the last Patient History field", await body.getByRole("textbox").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") || el.getAttribute("placeholder"))), [
            "Past history", "Medication history", "Menstrual history", "Others", "Diet, sleep, habits, occupation, cosmetics/products used",
          ]);
          const pageOverflow = await overflowX(page);
          s.ok(`${size.width}: no sideways page scroll`, pageOverflow <= 0, { pageOverflow, widest: pageOverflow > 0 ? await widest(page) : null });
          await s.shot(page, `${role}-${size.width}-patient-history`);
          await page.getByRole("textbox", { name: "Past history" }).fill("Seasonal eczema");
          await page.locator("#personal-history").fill("Works nights; fragrance-free products");
          await saveDraft(page, visitId);
          const stored = asObject((await api(page, "GET", `/visits/${visitId}`)).history);
          s.check("saving writes the visible history fields and invents no triggers or prior treatments", [stored.pastHistory, stored.personalHistory, "triggers" in stored, "priorTreatments" in stored], ["Seasonal eczema", "Works nights; fragrance-free products", false, false]);
        });
      }
    }

    await scenario("18-old-visit", "an old visit keeps its stored triggers and prior treatments in the history card and survives a save", async (s) => {
      const { page } = s.track(await open("doctor", SIZES[0]));
      const oldId = await makeVisit(page, OLD_HISTORY, { dermatology: { triggers: "Sun exposure", priorTreatments: "Hydroquinone" } });
      await openVisit(page, oldId);
      await page.getByRole("tab", { name: "History" }).click();
      const history = page.locator('[role="tabpanel"]:visible');
      await history.getByRole("button", { name: "Show details" }).first().waitFor({ timeout: 120000 });
      await expandCards(history);
      await history.getByText("Heat and stress").first().waitFor({ timeout: 120000 });
      const cardText = await history.innerText();
      s.ok("the history card shows the stored triggers", cardText.includes("Heat and stress"), cardText.slice(0, 400));
      s.ok("the history card shows the stored prior treatments", cardText.includes("Clobetasol cream"), cardText.slice(0, 400));
      await s.shot(page, "doctor-1280-old-visit-history-card");

      await page.getByRole("tab", { name: "Prescription" }).click();
      await page.getByRole("button", { name: "Add Row" }).first().waitFor();
      s.check("the form offers none of the stored values for editing", await page.locator("input, textarea").evaluateAll((els) => els.filter((el) => ["Heat and stress", "Clobetasol cream", "Sun exposure", "Hydroquinone"].includes(el.value)).length), 0);
      await page.getByRole("textbox", { name: "Past history" }).fill("Eczema as a child, asthma");
      await saveDraft(page, oldId);
      let visit = await api(page, "GET", `/visits/${oldId}`);
      let stored = asObject(visit.history);
      s.check("after a visit save the history keeps both retired values and takes the edit", [stored.pastHistory, stored.triggers, stored.priorTreatments, stored.personalHistory], ["Eczema as a child, asthma", "Heat and stress", "Clobetasol cream", "Night shifts"]);
      if ((await names(page)).length === 0) await page.getByRole("button", { name: "Add Row" }).first().click();
      await typeMedicine(page, 0, "Emollient");
      await (await rowNamed(page, "Emollient")).getByLabel("Duration for Emollient").fill("10");
      await page.waitForTimeout(AUTOSAVE_QUIET_MS);
      await saveRx(page);
      visit = await api(page, "GET", `/visits/${oldId}`);
      stored = asObject(visit.history);
      s.check("after a prescription save the history still keeps both retired values", [stored.pastHistory, stored.triggers, stored.priorTreatments], ["Eczema as a child, asthma", "Heat and stress", "Clobetasol cream"]);
      s.check("the examination keeps its stored triggers and prior treatments", [asObject(visit.exam).dermatology?.triggers, asObject(visit.exam).dermatology?.priorTreatments], ["Sun exposure", "Hydroquinone"]);
      await page.getByRole("tab", { name: "History" }).click();
      const after = page.locator('[role="tabpanel"]:visible');
      await after.getByRole("button", { name: "Show details" }).first().waitFor({ timeout: 120000 });
      await expandCards(after);
      await after.getByText("Heat and stress").first().waitFor({ timeout: 120000 });
      s.ok("the history card still shows them after the saves", (await after.innerText()).includes("Clobetasol cream"));
    });

    // ---------------------------------------------------------------- CR-19
    for (const role of ROLES) {
      for (const size of role === "doctor" ? [...SIZES, WIDE] : SIZES) {
        await scenario(`19-${role}-${size.width}`, `rx-table-insert-between-save-reload-print-as-${role}-at-${size.width}`, async (s) => {
          const { page } = s.track(await open(role, size));
          const visitId = await makeVisit(page);
          await openPrescription(page, visitId);
          const table = rxTable(page);
          const startOverflow = await overflowX(page);
          s.ok("the page has no sideways scroll before any edit", startOverflow <= 0, { startOverflow, widest: startOverflow > 0 ? await widest(page) : null });

          if ((await names(page)).length === 0) await page.getByRole("button", { name: "Add Row" }).first().click();
          await typeMedicine(page, 0, "Fucibet cream");
          await setInstructions(page, "Fucibet cream", FUCIBET_NOTE);
          await (await rowNamed(page, "Fucibet cream")).getByLabel("Duration for Fucibet cream").fill("30");
          await typeMedicine(page, 1, "Cetaphil cleanser");
          await setInstructions(page, "Cetaphil cleanser", LONG_NOTE);
          await (await rowNamed(page, "Cetaphil cleanser")).getByLabel("Duration for Cetaphil cleanser").fill("15");
          await typeMedicine(page, 2, "Sunscreen SPF 50");
          await (await rowNamed(page, "Sunscreen SPF 50")).getByLabel("Duration for Sunscreen SPF 50").fill("60");
          s.check("three medicines in typing order", await filled(page), ["Fucibet cream", "Cetaphil cleanser", "Sunscreen SPF 50"]);

          s.check("each row's add control has a name that says which medicine it follows", (await page.getByRole("button", { name: /^Add a medicine below / }).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))).slice(0, 3), [
            "Add a medicine below Fucibet cream", "Add a medicine below Cetaphil cleanser", "Add a medicine below Sunscreen SPF 50",
          ]);
          const insert = page.getByRole("button", { name: "Add a medicine below Fucibet cream" });
          await insert.focus();
          await page.keyboard.press("Enter");
          s.check("keyboard Enter on the control inserts a blank row directly under Fucibet", (await names(page)).slice(0, 4), ["Fucibet cream", "", "Cetaphil cleanser", "Sunscreen SPF 50"]);
          await page.waitForFunction(() => document.activeElement?.getAttribute("placeholder") === "Search medicine name..." && document.activeElement.value === "" && Boolean(document.activeElement.closest("tr")?.previousElementSibling?.querySelector("input[placeholder='Search medicine name...']")?.value === "Fucibet cream"));
          s.ok("focus lands in the new row's medicine field", true);
          await page.keyboard.type("Tretinoin gel");
          await page.keyboard.press("Escape");
          await (await rowNamed(page, "Tretinoin gel")).getByLabel("Duration for Tretinoin gel").fill("45");
          await setInstructions(page, "Tretinoin gel", "At night");
          s.check("literal row order [A, new, B, C]", await filled(page), ["Fucibet cream", "Tretinoin gel", "Cetaphil cleanser", "Sunscreen SPF 50"]);
          const fucibet = await rowNamed(page, "Fucibet cream");
          s.check("Fucibet kept its duration and note when the row went in below it", [await fucibet.getByLabel("Duration for Fucibet cream").inputValue(), await fucibet.getByPlaceholder("e.g., Avoid alcohol").inputValue()], ["30", FUCIBET_NOTE]);

          const cetaphil = (await rowNamed(page, "Cetaphil cleanser")).getByPlaceholder("Search medicine name...");
          await cetaphil.click();
          await page.keyboard.press("Enter");
          s.check("Enter in a medicine field adds a row under that medicine", (await names(page)).slice(0, 5), ["Fucibet cream", "Tretinoin gel", "Cetaphil cleanser", "", "Sunscreen SPF 50"]);
          await page.keyboard.press("Escape");
          await page.getByRole("button", { name: "Add Row" }).first().click();
          const afterFooter = await names(page);
          s.ok("the footer Add Row still appends at the end", afterFooter.at(-1) === "" && afterFooter.indexOf("Sunscreen SPF 50") < afterFooter.length - 1, afterFooter);

          const geometry = await table.evaluate((el) => {
            const wrapper = el.parentElement;
            const width = (selector) => Math.round(el.querySelector(selector).getBoundingClientRect().width);
            const longField = [...el.querySelectorAll("textarea")].find((t) => t.value.startsWith("Apply a thin layer"));
            const shortField = [...el.querySelectorAll("textarea")].find((t) => t.value.startsWith("1 pea size"));
            return {
              layout: getComputedStyle(el).display, container: wrapper.clientWidth, hiddenBySideScroll: wrapper.scrollWidth - wrapper.clientWidth,
              durationCell: width('td[data-label="Duration"]'), instructionsCell: width('td[data-label="Instructions"]'),
              longFieldWidth: Math.round(longField.getBoundingClientRect().width), longFieldHeight: Math.round(longField.getBoundingClientRect().height),
              longClipped: longField.scrollHeight > longField.clientHeight + 1, shortClipped: shortField.scrollHeight > shortField.clientHeight + 1,
              shortValue: shortField.value, longValue: longField.value,
              offenders: [...wrapper.querySelectorAll("*")].map((n) => ({ tag: n.tagName, cls: String(n.className).slice(0, 50), over: Math.round(n.getBoundingClientRect().right - wrapper.getBoundingClientRect().right) })).filter((n) => n.over > 1).sort((a, b) => b.over - a.over).slice(0, 4),
            };
          });
          s.note(`geometry ${JSON.stringify(geometry)}`);
          s.check(`${size.width}: layout follows the container (table only when it is at least 1024px wide)`, geometry.layout, geometry.container >= 1024 ? "table" : "block");
          s.ok("Duration cell is compact (at most 170px; it used to be about 208px)", geometry.durationCell <= 170, geometry);
          s.ok("Instructions get the width: well over the old 190px minimum", geometry.instructionsCell >= 200 && geometry.longFieldWidth >= 190, geometry);
          s.ok("in the table layout Instructions is clearly wider than Duration", geometry.layout !== "table" || geometry.instructionsCell >= geometry.durationCell + 100, geometry);
          s.ok("nothing is hidden behind a sideways scroll", geometry.hiddenBySideScroll <= 1, geometry);
          s.check("the long instruction is not clipped", [geometry.longClipped, geometry.shortClipped], [false, false]);
          s.check("the full text is in the field", [geometry.shortValue, geometry.longValue], [FUCIBET_NOTE, LONG_NOTE]);
          s.check(`${size.width}: the page itself has no sideways scroll`, (await overflowX(page)) <= 0, true);
          await (await rowNamed(page, "Cetaphil cleanser")).scrollIntoViewIfNeeded();
          await s.shot(page, `${role}-${size.width}-rx-table`);

          await page.waitForTimeout(AUTOSAVE_QUIET_MS);
          await saveRx(page);
          s.check("saved prescription items are in screen order", await savedNames(page, visitId), ["Fucibet cream", "Tretinoin gel", "Cetaphil cleanser", "Sunscreen SPF 50"]);
          const saved = asArray((await api(page, "GET", `/visits/${visitId}`)).prescription.items);
          s.check("saved durations and instructions travel with their medicines", saved.map((i) => [i.drugName, i.duration, i.instructions ?? null]), [
            ["Fucibet cream", 30, FUCIBET_NOTE], ["Tretinoin gel", 45, "At night"], ["Cetaphil cleanser", 15, LONG_NOTE], ["Sunscreen SPF 50", 60, null],
          ]);

          await page.reload({ waitUntil: "domcontentloaded" });
          await page.getByRole("tab", { name: "Prescription" }).click();
          await page.getByRole("button", { name: "Add Row" }).first().waitFor();
          s.check("after reload the order is the same", await filled(page), ["Fucibet cream", "Tretinoin gel", "Cetaphil cleanser", "Sunscreen SPF 50"]);
          s.check("and the long instruction is still whole", await page.locator("textarea").evaluateAll((els, text) => els.filter((el) => el.value === text).length, LONG_NOTE), 1);

          await page.getByRole("button", { name: "Print Preview" }).click();
          const printed = page.locator("#pagedjs-container .rx-row");
          await printed.first().waitFor({ timeout: 120000 });
          await page.waitForTimeout(1200);
          const rows = await page.locator("#pagedjs-container .rx-row").evaluateAll((els) => els.map((el) => [...el.children].map((c) => c.textContent.trim())));
          s.check("print preview lists the medicines in screen order", rows.map((r) => r[0]), ["Fucibet cream", "Tretinoin gel", "Cetaphil cleanser", "Sunscreen SPF 50"]);
          s.check("print preview shows both long instructions in full", [rows[0][4], rows[2][4]], [FUCIBET_NOTE, LONG_NOTE]);
          s.check("print preview shows each duration with its medicine", rows.map((r) => r[3]), ["30 days", "45 days", "15 days", "60 days"]);
          const widths = await page.locator("#pagedjs-container .rx-row").first().evaluate((el) => [...el.children].map((c) => Math.round(c.getBoundingClientRect().width)));
          s.ok("print: Duration is narrower than Instructions", widths[3] < widths[4], widths);
          const clippedInPrint = await page.locator("#pagedjs-container .rx-row").evaluateAll((els) => els.some((el) => [...el.children].some((c) => c.scrollWidth > c.clientWidth + 1)));
          s.check("print: no cell is cut off", clippedInPrint, false);
          await page.locator("#pagedjs-container").scrollIntoViewIfNeeded();
          await s.shot(page, `${role}-${size.width}-rx-print-preview`);
        });
      }
    }

    await scenario("19-template", "template editor: insert between, wrapping instructions, order saved", async (s) => {
      for (const size of SIZES) {
        const { page } = s.track(await open("doctor", size));
        const visitId = await makeVisit(page);
        await openPrescription(page, visitId);
        await page.getByRole("button", { name: "New template" }).click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        const inputs = dialog.getByPlaceholder("Medicine name");
        await inputs.first().fill("Alpha");
        await dialog.getByRole("button", { name: "Add Row", exact: true }).click();
        await inputs.nth(1).fill("Gamma");
        await dialog.getByRole("button", { name: "Add a medicine below Alpha" }).click();
        await inputs.nth(1).fill("Beta");
        await dialog.getByPlaceholder("e.g., Avoid alcohol").nth(1).fill(LONG_NOTE);
        s.check(`${size.width}: template rows [A, new, B]`, await inputs.evaluateAll((els) => els.map((el) => el.value)), ["Alpha", "Beta", "Gamma"]);
        const geometry = await dialog.locator("table").evaluate((el) => {
          const wrapper = el.parentElement;
          const field = [...el.querySelectorAll("textarea")].find((t) => t.value.startsWith("Apply a thin layer"));
          return {
            layout: getComputedStyle(el).display, container: wrapper.clientWidth, hiddenBySideScroll: wrapper.scrollWidth - wrapper.clientWidth,
            durationCell: Math.round(el.querySelector('td[data-label="Duration"]').getBoundingClientRect().width),
            instructionsCell: Math.round(el.querySelector('td[data-label="Instructions"]').getBoundingClientRect().width), clipped: field.scrollHeight > field.clientHeight + 1,
          };
        });
        s.note(`template geometry ${size.width} ${JSON.stringify(geometry)}`);
        s.ok(`${size.width}: template Duration compact, Instructions wide, unclipped, nothing behind a sideways scroll`, geometry.durationCell <= 170 && geometry.instructionsCell > geometry.durationCell && !geometry.clipped && geometry.hiddenBySideScroll <= 1, geometry);
        s.check(`${size.width}: the page has no sideways scroll with the dialog open`, (await overflowX(page)) <= 0, true);
        await s.shot(page, `doctor-${size.width}-template-editor`);
        if (size.width === 1280) {
          await dialog.getByPlaceholder("e.g., Acne follow-up (Derm)").fill(`Ordered ${Date.now()}`);
          const created = page.waitForResponse((r) => /\/api\/prescriptions\/templates$/.test(r.url()) && r.request().method() === "POST", { timeout: 60000 });
          await dialog.getByRole("button", { name: "Create Template" }).click();
          const response = await created;
          s.ok("the template saved", response.status() < 300, response.status());
          const list = await api(page, "GET", "/prescriptions/templates");
          const items = (Array.isArray(list) ? list : list.templates ?? list.data ?? []).find((tpl) => /^Ordered /.test(tpl.name))?.items;
          s.check("the saved template keeps the medicine order", asArray(items).map((i) => i.drugName), ["Alpha", "Beta", "Gamma"]);
        }
      }
    });

    console.log("END");
  } finally {
    const resultsFile = path.join(out, process.env.ONLY ? `results-${process.env.ONLY.replace(/,/g, "_")}.json` : "results.json");
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    console.log("\nSUMMARY");
    for (const x of results) console.log(`${x.pass ? "PASS" : "FAIL"}  ${x.scenario}  console-errors=${x.consoleErrors.length}`);
    await browser?.close().catch(() => {});
    await stack.stop();
    process.exitCode = results.length && results.every((x) => x.pass) ? 0 : 1;
  }
})().catch((e) => {
  console.error("CR18-19 HARNESS ERROR", e);
  process.exit(2);
});
