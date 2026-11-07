const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");
const { seed, api, tokenFor, browserLogin, addUser, ddmmyyyy } = require("./cr31-seed.cjs");

const root = path.resolve(__dirname, "../../..");
const out = path.join(root, "output/stack/cr31");
const COUNTS = "/dashboard/inventory?area=stock&view=COUNT";
const clean = (text) => String(text ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const rupees = (value) => {
  const cents = Math.round(Math.abs(value) * 100);
  const whole = String(Math.floor(cents / 100));
  const head = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `₹${head ? `${head},` : ""}${whole.slice(-3)}.${String(cents % 100).padStart(2, "0")}`;
};
const signed = (value) => (value < 0 ? `−${rupees(value)}` : value > 0 ? `+${rupees(value)}` : rupees(0));

const canon = (value) => JSON.stringify(value, (_key, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));

let sink = [];
const watch = (page) => {
  page.on("pageerror", (e) => sink.push({ type: "pageerror", text: e.message.slice(0, 300) }));
  page.on("console", (m) => m.type() === "error" && sink.push({ type: "console", text: m.text().slice(0, 300) }));
};

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "cr31" });
  let browser;
  const results = [];
  try {
    console.log(`BOOT base=${stack.base}`);
    const data = await seed(stack);
    const { today, batches } = data;
    const U = stack.users;
    console.log(`SEED today=${today} batches=${Object.keys(batches).length}`);
    const tokens = {};
    const as = async (who) => (tokens[who] ??= await tokenFor(stack, who));
    const call = async (who, method, url, body) => api(stack, await as(who), method, url, body);
    const attempt = async (who, method, url, body) => {
      try {
        return { status: 200, body: await call(who, method, url, body) };
      } catch (error) {
        return { status: error.status, body: error.data };
      }
    };
    const branchId = stack.branch.id;
    const countsOf = (assigneeId, where = {}) =>
      stack.db.inventoryWorkflowDocument.findMany({ where: { branchId, kind: "COUNT", AND: [{ payload: { path: ["assigneeId"], equals: assigneeId } }, where] }, orderBy: { createdAt: "asc" } });
    const lineNames = (doc) => doc.payload.lines.map((line) => line.name);
    const stockOf = async (name) => (await stack.db.inventoryItem.findUnique({ where: { id: batches[name].id } })).currentStock;
    const settingsRow = async () => (await stack.db.inventoryWorkflowSettings.findUnique({ where: { branchId } })).settings;
    const sell = async (name, quantity) => {
      const draft = await call("pharmacist", "POST", "/inventory/workspace/documents", {
        kind: "COUNTER_SALE", reference: `CS-${crypto.randomUUID().slice(0, 6)}`, requestKey: crypto.randomUUID(),
        payload: { date: today, orderType: "PICKUP", reason: "", lines: [{ inventoryId: batches[name].id, quantity, unitPrice: Number(batches[name].sellingPrice) }] },
      });
      return call("pharmacist", "POST", `/inventory/workspace/documents/${draft.id}/transition`, { action: "POST", version: draft.version });
    };
    const signViaApi = async (who, doc, counted, note = "") => {
      const fresh = await stack.db.inventoryWorkflowDocument.findUnique({ where: { id: doc.id } });
      return call(who, "POST", `/inventory/workspace/reconciliation/counts/${doc.id}/sign-off`, {
        version: fresh.version, requestKey: crypto.randomUUID(), note,
        lines: fresh.payload.lines.map((line) => ({ id: line.id, physicalStock: counted(line) })),
      });
    };

    browser = await chromium.launch();
    const sessions = new Map();
    async function open(role, size = { width: 1440, height: 900 }) {
      const context = await browser.newContext({ viewport: size, ...(sessions.has(role) && { storageState: sessions.get(role) }) });
      context.on("page", watch);
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      if (!sessions.has(role)) {
        await browserLogin(stack, page, role);
        sessions.set(role, await context.storageState());
      }
      return { page, context };
    }
    const goto = async (page, route = COUNTS) => {
      await page.goto(`${stack.base}${route}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.waitForFunction(
        () => !document.querySelector('[aria-busy="true"]') && !/Loading (stock counts|the count|inventory permissions|branch queues)/.test(document.body.innerText) && /Stock counts|What needs attention|Inventory|access/.test(document.body.innerText),
        null,
        { timeout: 240000 },
      );
      await page.waitForTimeout(300);
    };
    const armed = (page) => page.waitForTimeout(350);
    const headsOf = (page, label) =>
      page.locator(`table[aria-label="${label}"] thead th`).evaluateAll((ths) =>
        ths.map((th) => {
          const copy = th.cloneNode(true);
          copy.querySelectorAll(".sr-only").forEach((node) => node.remove());
          return copy.textContent.replace(/\u00ad/g, "").replace(/\s+/g, " ").trim();
        }),
      );
    const grid = async (page, label) => {
      await page.getByRole("table", { name: label }).waitFor({ timeout: 240000 });
      await page.waitForFunction(
        (name) => {
          const table = document.querySelector(`table[aria-label="${name}"]`);
          const busy = table?.closest("[aria-busy]");
          return table && busy?.getAttribute("aria-busy") === "false" && !table.querySelector('.animate-pulse');
        },
        label,
        { timeout: 240000 },
      );
      await page.waitForTimeout(200);
    };
    const toasts = (page) => page.locator("li[role='status'], [data-radix-collection-item]").allInnerTexts().then((all) => all.map(clean));
    const counted = (page) => page.getByRole("textbox", { name: /^Counted quantity of/ });
    const startCounting = async (page) => {
      await page.getByRole("button", { name: /^(Start|Continue) counting:/ }).first().click();
      await counted(page).first().waitFor();
      await page.waitForTimeout(300);
    };
    const tableFits = (page, selector) =>
      page.evaluate((sel) => {
        const el = [...document.querySelectorAll(sel)].find((node) => node.getClientRects().length);
        if (!el) return { found: false };
        const box = el.closest(".overflow-auto") || el.parentElement;
        return { found: true, scroll: box.scrollWidth, client: box.clientWidth, fits: box.scrollWidth <= box.clientWidth + 1 };
      }, selector);
    const moneyOnOneLine = (page) =>
      page.evaluate(() =>
        [...document.querySelectorAll("main span, main p, main td, main strong")]
          .filter((el) => el.getClientRects().length && el.children.length === 0 && /₹\d/.test(el.textContent || ""))
          .filter((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
            return tops.size > 1;
          })
          .map((el) => el.textContent.trim()),
      );
    const pageScroll = (page) => page.evaluate(() => ({ scroll: document.scrollingElement.scrollWidth, width: window.innerWidth }));

    async function scenario(id, name, run) {
      if (process.env.ONLY && !process.env.ONLY.split(",").includes(id)) return;
      sink = [];
      const t = { checks: [], notes: [], shots: [] };
      const started = Date.now();
      const ctx = {
        check(label, actual, expected) {
          const ok = canon(actual) === canon(expected);
          t.checks.push({ label, ok, actual: ok ? undefined : actual, expected: ok ? undefined : expected });
        },
        ok(label, cond, detail) {
          t.checks.push({ label, ok: Boolean(cond), actual: cond ? undefined : detail ?? false, expected: cond ? undefined : true });
        },
        note: (text) => t.notes.push(text),
        async shot(page, slug, full = false) {
          const file = path.join(out, `${slug}.png`);
          await page.screenshot({ path: file, fullPage: full });
          t.shots.push(path.relative(root, file));
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
          if (last) await ctx.shot(last.page, `${id}-error`);
        } catch {}
      }
      for (const o of ctx.opened) await o.context.close().catch(() => {});
      const failed = t.checks.filter((c) => !c.ok);
      const pageErrors = sink.filter((e) => e.type === "pageerror");
      const consoleErrors = sink.filter((e) => e.type === "console");
      const pass = !error && failed.length === 0 && pageErrors.length === 0;
      const detail = [
        error && `EXCEPTION: ${error.message.split("\n")[0]}`,
        ...failed.map((c) => `FAIL ${c.label}: expected ${JSON.stringify(c.expected)} actual ${JSON.stringify(c.actual)}`),
        ...pageErrors.map((e) => `PAGEERROR ${e.text}`),
        ...t.notes.map((n) => `note: ${n}`),
        `${t.checks.length - failed.length}/${t.checks.length} checks passed`,
      ].filter(Boolean).join("\n");
      results.push({ scenario: `${id} ${name}`, pass, detail, screenshots: t.shots, consoleErrors: consoleErrors.map((e) => e.text), seconds: Math.round((Date.now() - started) / 1000) });
      console.log(`${pass ? "PASS" : "FAIL"} ${id} ${name}\n${detail.split("\n").map((l) => `    ${l}`).join("\n")}`);      if (process.env.HALT && !pass) throw Error(`halted after ${id}`);
    }

    const ANIL = ["Adapalene Gel 15g", "Benzoyl Peroxide Gel 2.5%", "Cetirizine 10mg Tab", "Clobetasol Cream 15g"];
    const KAVYA = ["Azelaic Acid Cream 20%", "Calamine Lotion 100ml", "Clindamycin Gel 1%", "Doxycycline 100mg Cap"];
    const unitCost = (name) => Number(batches[name].costPrice);

    await scenario("01", "settings-migrated-from-the-daily-count-and-automation-cleaned", async (s) => {
      const { page } = s.track(await open("doctor"));
      await goto(page, "/dashboard/inventory?area=reorder&view=settings");
      await page.getByText("Stock count settings are in Stock › Stock counts › Settings.").waitFor({ timeout: 240000 });
      s.check("old daily-count controls are gone from automation settings", await page.getByText(/Daily stock count|Count policy|Batches per daily count|Approval threshold/).count(), 0);
      await goto(page, `${COUNTS}&tab=settings`);
      await page.getByText("Stock reconciliation is off").waitFor();
      s.check("items per day carries over from the old batches-per-daily-count", await page.getByLabel("Items per person per day").inputValue(), "6");
      s.check("cycle length defaults to 10 days", await page.getByLabel("Cycle length (days)").inputValue(), "10");
      s.check("people who can count", (await page.getByRole("group", { name: "People who count" }).locator("label").allInnerTexts()).map(clean), [
        "Anil Deshmukh · Pharmacist", "Asha Rao · Admin", "Kavya Joshi · Pharmacist", "Priya Menon · Doctor", "Rajesh Iyer · Owner",
      ]);
      await page.getByRole("switch", { name: /Stock reconciliation is/ }).click();
      await page.getByLabel("Items per person per day").fill("4");
      await page.getByLabel(/^Anil Deshmukh/).check();
      s.check("forecast updates as people are chosen", clean(await page.locator('form [role="status"]').first().innerText()), "At 4 per person per day with 1 person, a 10-day cycle covers all 20 batches in stock.");
      await page.getByLabel(/^Kavya Joshi/).check();
      s.check("starting a cycle is announced before saving", await page.getByText("Saving starts a new cycle today.").count(), 1);
      await page.getByRole("button", { name: "Save settings" }).click();
      await page.getByText("Current cycle").waitFor();
      s.ok("toast says a new cycle starts", (await toasts(page)).some((t) => t.includes("A new cycle starts today")), await toasts(page));
      const stored = await settingsRow();
      s.check("stored as cycle settings", stored.reconciliation, { enabled: true, cycleDays: 10, itemsPerPersonPerDay: 4, assigneeIds: [U.pharmacist.id, U.kavya.id], cycleStart: today });
      s.check("old count keys dropped from the stored settings", ["auditEnabled", "auditDailyCount", "auditAdjustmentMode", "approvalValue", "negativeCountNeedsApproval"].filter((k) => k in stored), []);
      s.check("current cycle progress", clean(await page.getByRole("region", { name: "Current cycle" }).innerText()).replace(/ · \d+ days? left/, ""), `Current cycle ${ddmmyyyy(today)} to ${ddmmyyyy(new Date(Date.parse(`${today}T00:00:00Z`) + 9 * 86400000).toISOString().slice(0, 10))} · day 1 of 10 0 of 20 batches counted (0%)`);
      await s.shot(page, "settings-1440");
    });

    await scenario("02", "round-robin-plan-and-idempotent-reruns", async (s) => {
      await call("pharmacist", "GET", "/inventory/workspace/reconciliation");
      await Promise.all([1, 2, 3, 4, 5].map((n) => call(n % 2 ? "kavya" : "doctor", "GET", n % 2 ? "/inventory/workspace/overview" : "/inventory/workspace/reconciliation")));
      const [anil, kavya] = [await countsOf(U.pharmacist.id), await countsOf(U.kavya.id)];
      s.check("one count each after six concurrent and repeated reads", [anil.length, kavya.length], [1, 1]);
      s.check("Anil gets alternate batches by name", lineNames(anil[0]), ANIL);
      s.check("Kavya gets the others", lineNames(kavya[0]), KAVYA);
      s.check("keyed by IST day", [anil[0].requestKey, kavya[0].requestKey], [`cycle:${today}:${today}:${U.pharmacist.id}`, `cycle:${today}:${today}:${U.kavya.id}`]);
      s.check("references name the day and the person", [anil[0].reference, kavya[0].reference], [`Stock count ${ddmmyyyy(today)} · Anil Deshmukh`, `Stock count ${ddmmyyyy(today)} · Kavya Joshi`]);
      s.check("empty batches are not dealt", [...lineNames(anil[0]), ...lineNames(kavya[0])].filter((n) => /Terbinafine|Tretinoin/.test(n)), []);
    });

    await scenario("03", "today-card-for-the-counter", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page, "/dashboard/inventory");
      const card = page.getByRole("button", { name: /Stock count due today/ });
      await card.waitFor({ timeout: 240000 });
      s.check("the number is the batches to count and the label does not repeat it", clean(await card.innerText()), "4 Stock count due today Open your count and sign off when every batch is counted.");
      s.check("no approval card for a pharmacist", await page.getByRole("button", { name: /Counts awaiting your approval/ }).count(), 0);
      s.check("no behind card when the cycle covers everything", await page.getByRole("button", { name: /Batches not counted this cycle/ }).count(), 0);
      await card.click();
      await counted(page).first().waitFor({ timeout: 240000 });
      s.check("the card opens the one count due straight away", await page.getByRole("heading", { name: `Stock count ${ddmmyyyy(today)} · Anil Deshmukh` }).count(), 1);
      await goto(page);
      s.check("My counts", clean(await page.getByRole("list", { name: "Counts assigned to you" }).innerText()), `Stock count ${ddmmyyyy(today)} · Anil Deshmukh Due today 4 items · 0 counted · 4 left Start counting`);
      await s.shot(page, "my-counts-1440");
    });

    await scenario("04", "pharmacist-counts-by-keyboard-and-signs-off", async (s) => {
      const { page } = s.track(await open("pharmacist", { width: 1280, height: 800 }));
      await goto(page);
      const start = page.getByRole("button", { name: /^Start counting:/ });
      await start.focus();
      await page.keyboard.press("Enter");
      await counted(page).first().waitFor();
      await page.waitForTimeout(400);
      s.check("focus lands on the first counted field", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.labels?.[0]?.textContent), "Counted quantity of Adapalene Gel 15g, batch B001");
      s.check("every counted field starts empty", await counted(page).evaluateAll((els) => els.map((el) => el.value)), ["", "", "", ""]);
      const system = { [ANIL[0]]: 12, [ANIL[1]]: 15, [ANIL[2]]: 40, [ANIL[3]]: 11 };
      await page.keyboard.type("12");
      await page.keyboard.press("Enter");
      await page.keyboard.type("13");
      const row = page.getByRole("listitem").filter({ hasText: ANIL[1] });
      s.check("difference shows at once", clean(await row.locator("span.text-destructive-text").first().innerText()), `−2 fewer than the system ${signed(-2 * unitCost(ANIL[1]))}`);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1200);
      await page.reload({ waitUntil: "domcontentloaded" });
      await counted(page).first().waitFor({ timeout: 240000 });
      await page.waitForTimeout(500);
      s.check("typed counts survive a reload (saved without a button)", await counted(page).evaluateAll((els) => els.map((el) => el.value)), ["12", "13", "", ""]);
      s.check("focus resumes at the first uncounted batch", await page.evaluate(() => document.activeElement?.id?.startsWith("count-")), true);
      await page.keyboard.type("40");
      await page.keyboard.press("Enter");
      await page.keyboard.type("11");
      await page.keyboard.press("Enter");
      s.check("Enter on the last field moves to Sign off", await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Sign off count");
      s.check("the button reads Sign off count with single spaces", await page.getByRole("button", { name: "Sign off count" }).innerText(), "Sign off count");
      s.check("progress says 1 differs", clean(await page.getByText(/of 4 counted/).innerText()), "4 of 4 counted · 1 differs");
      s.check("the footer splits short from extra", clean(await page.getByText(/^Short −/).innerText()), `Short −2 (${signed(-2 * unitCost(ANIL[1]))})`);
      const fits = await tableFits(page, '[aria-label="Batches to count"]');
      s.ok("every column visible at 1280", fits.fits, fits);
      s.check("money never wraps", await moneyOnOneLine(page), []);
      await s.shot(page, "count-sheet-1280");
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Sign off this count" });
      await dialog.waitFor();
      s.check("summary of what is signed", clean(await dialog.locator("p").first().innerText()), `4 items, 1 differs · Short −2 (${signed(-2 * unitCost(ANIL[1]))})`);
      await s.shot(page, "sign-off-1280");
      await armed(page);
      await page.keyboard.type("Two strips found torn and discarded");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      s.check("Tab reaches the submit button", await page.evaluate(() => document.activeElement?.textContent?.trim()), "Sign off and send for approval");
      await page.keyboard.press("Enter");
      await page.getByText(/^Signed by/).waitFor();
      const [doc] = await countsOf(U.pharmacist.id);
      s.check("awaiting approval with who and the note", [doc.status, doc.payload.signOff.by, doc.payload.signOff.note], ["AWAITING_APPROVAL", U.pharmacist.id, "Two strips found torn and discarded"]);
      s.check("stock unchanged before approval", await stockOf(ANIL[1]), 15);
      s.check("locked record replaces the sheet", await counted(page).count(), 0);
      s.ok("signed line names Anil", /Signed by Anil Deshmukh on \d{2}\/\d{2}\/\d{4}, \d{2}:\d{2} (am|pm)/.test(clean(await page.getByText(/^Signed by/).innerText())), await page.getByText(/^Signed by/).innerText());
      s.ok("toast confirms", (await toasts(page)).some((t) => t.includes("Count signed off and sent for approval.")), await toasts(page));
      Object.assign(s, { system });
    });

    await scenario("05", "second-counter-signs-with-a-surplus-and-a-shortage", async (s) => {
      const { page } = s.track(await open("kavya"));
      await goto(page);
      await startCounting(page);
      const values = { [KAVYA[0]]: "9", [KAVYA[1]]: "19", [KAVYA[2]]: "9", [KAVYA[3]]: "30" };
      for (const name of KAVYA) await page.getByRole("textbox", { name: new RegExp(`^Counted quantity of ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).fill(values[name]);
      await page.getByRole("button", { name: "Sign off count" }).click();
      const dialog = page.getByRole("dialog", { name: "Sign off this count" });
      await dialog.waitFor();
      s.check("both differing batches listed", (await dialog.getByRole("list", { name: "Batches that differ" }).getByRole("listitem").allInnerTexts()).map((t) => clean(t).split(" Batch")[0]), [KAVYA[0], KAVYA[1]]);
      await armed(page);
      await dialog.getByLabel("Why do these differ? (required)").fill("One Azelaic tube unrecorded; one Calamine bottle broken");
      await dialog.getByRole("button", { name: "Sign off and send for approval" }).click();
      await page.getByText(/^Signed by/).waitFor();
      const [doc] = await countsOf(U.kavya.id);
      s.check("awaiting approval", doc.status, "AWAITING_APPROVAL");
    });

    await scenario("06", "a-signed-count-is-locked", async (s) => {
      const [doc] = await countsOf(U.pharmacist.id);
      const edit = await attempt("pharmacist", "PATCH", `/inventory/workspace/reconciliation/counts/${doc.id}`, { version: doc.version, lines: [{ id: doc.payload.lines[0].id, physicalStock: 1 }] });
      s.check("saving counts after sign-off is refused", [edit.status, edit.body?.message], [409, "This count is already signed off. Reload to see the signed record."]);
      const again = await attempt("pharmacist", "POST", `/inventory/workspace/reconciliation/counts/${doc.id}/sign-off`, { version: doc.version, requestKey: crypto.randomUUID(), lines: [] });
      s.check("a second sign-off is refused", again.status, 409);
      const generic = await attempt("pharmacist", "PATCH", `/inventory/workspace/documents/${doc.id}`, { kind: "COUNT", version: doc.version, reference: doc.reference, requestKey: doc.requestKey, payload: doc.payload });
      s.check("the generic document save is refused", [generic.status, generic.body?.message], [400, "Enter counted quantities from Stock counts › My counts"]);
      const other = await attempt("kavya", "PATCH", `/inventory/workspace/reconciliation/counts/${doc.id}`, { version: doc.version, lines: [] });
      s.check("nobody else can edit it either", other.status, 409);
      const fresh = await stack.db.inventoryWorkflowDocument.findUnique({ where: { id: doc.id } });
      s.check("record unchanged", [fresh.version, fresh.payload.lines.map((l) => l.physicalStock)], [doc.version, [12, 13, 40, 11]]);
    });

    await scenario("07", "today-card-and-approvals-for-the-doctor", async (s) => {
      const { page } = s.track(await open("doctor"));
      await goto(page, "/dashboard/inventory");
      const card = page.getByRole("button", { name: /Counts awaiting your approval/ });
      await card.waitFor({ timeout: 240000 });
      s.check("card counts both signed counts", clean(await card.locator("span").first().innerText()), "2");
      s.check("the card splits short from extra in true signs", clean(await card.innerText()), `2 Counts awaiting your approval Short ${signed(-2 * unitCost(ANIL[1]) - unitCost(KAVYA[1]))} · Extra ${signed(unitCost(KAVYA[0]))}. Stock changes only when you approve.`);
      await card.click();
      await grid(page, "Counts awaiting approval");
      const rows = await page.locator('table[aria-label="Counts awaiting approval"] tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").trim())));
      s.check("columns", await headsOf(page, "Counts awaiting approval"), ["Date", "Counted by", "Signed at", "Items", "Differences", "Short ₹", "Net ₹", ""]);
      s.check("rows show the shortage apart from the net, and a Review button", rows.map((r) => [r[1], r[3], r[4], r[5], r[6], r[7]]).sort(), [
        ["Anil D.", "4", "1", signed(-2 * unitCost(ANIL[1])), signed(-2 * unitCost(ANIL[1])), "Review"],
        ["Kavya J.", "4", "2", signed(-unitCost(KAVYA[1])), signed(unitCost(KAVYA[0]) - unitCost(KAVYA[1])), "Review"],
      ].sort());
      s.ok("register dates read like 07 Nov", rows.every((r) => /^\d{2} [A-Z][a-z]{2}( · on demand)?$/.test(r[0].split(",")[0].trim())), rows.map((r) => r[0]));
      const fits = await tableFits(page, 'table[aria-label="Counts awaiting approval"]');
      s.ok("approvals fit 1440", fits.fits, fits);
      await s.shot(page, "approvals-1440");
    });

    await scenario("08", "doctor-approves-with-a-sale-made-after-the-count", async (s) => {
      const [doc] = await countsOf(U.kavya.id);
      await sell(KAVYA[1], 2);
      s.check("the sale moved stock after the count", await stockOf(KAVYA[1]), 18);
      const { page } = s.track(await open("doctor", { width: 1280, height: 800 }));
      await goto(page, `${COUNTS}&document=${doc.id}`);
      await page.getByText(/^Signed by Kavya Joshi/).waitFor();
      s.check("differing batches first", (await page.getByRole("list", { name: "Counted batches" }).getByRole("listitem").allInnerTexts()).map((t) => clean(t).split(" Batch")[0]), [KAVYA[0], KAVYA[1]]);
      s.check("the header splits short from extra", clean(await page.getByText(/^4 items, 2 differ/).innerText()), `4 items, 2 differ · Short −1 (${signed(-unitCost(KAVYA[1]))}) · Extra +1 (${signed(unitCost(KAVYA[0]))})`);
      const bar = await page.getByRole("button", { name: "Approve and adjust stock" }).boundingBox();
      s.ok("Approve sits in a bar at the bottom of the screen, not above the lines", bar && bar.y + bar.height <= 800 && bar.y > 650, bar);
      await s.shot(page, "approval-detail-1280");
      await page.getByRole("button", { name: "Approve and adjust stock" }).click();
      const dialog = page.getByRole("dialog", { name: "Approve and adjust stock" });
      await dialog.waitFor();
      const changes = (await dialog.getByRole("list", { name: "Stock changes" }).getByRole("listitem").allInnerTexts()).map(clean);
      s.check("each batch shows now, after and its value", changes, [
        `${KAVYA[0]} · B002 8 now → becomes 9 +1 more than the system ${signed(unitCost(KAVYA[0]))}`,
        `${KAVYA[1]} · B004 18 now → becomes 17 It was 20 when counted; stock has moved since. −1 fewer than the system ${signed(-unitCost(KAVYA[1]))}`,
      ]);
      s.check("the total stock value change is above the reason", clean(await dialog.getByText(/^Stock value changes by/).innerText()), `Stock value changes by ${signed(unitCost(KAVYA[0]) - unitCost(KAVYA[1]))}`);
      s.check("reason prefilled with who signed and when", await dialog.getByLabel("Reason (required)").inputValue(), `Physical count signed by Kavya Joshi on ${ddmmyyyy(today)}`);
      await s.shot(page, "approve-dialog-1280");
      await armed(page);
      await dialog.getByRole("button", { name: "Approve and adjust stock" }).click();
      await page.getByText(/^Approved by Priya Menon/).waitFor();
      s.check("stock = current + counted difference", [await stockOf(KAVYA[0]), await stockOf(KAVYA[1])], [9, 17]);
      const movements = await stack.db.stockTransaction.findMany({ where: { branchId, reason: { startsWith: "Stock count approved" } }, select: { itemId: true, quantityDelta: true, userId: true, reason: true }, orderBy: { itemId: "asc" } });
      s.check("movements carry the reason and approver", movements.map((m) => [m.quantityDelta, m.userId === U.doctor.id, m.reason]).sort(), [
        [-1, true, `Stock count approved: Physical count signed by Kavya Joshi on ${ddmmyyyy(today)}`],
        [1, true, `Stock count approved: Physical count signed by Kavya Joshi on ${ddmmyyyy(today)}`],
      ]);
      const audits = await stack.db.inventoryAudit.count({ where: { notes: { contains: doc.id } } });
      s.check("an audit row per counted batch", audits, 4);
    });

    let coveredBefore;
    await scenario("09", "doctor-rejects-and-the-batches-become-uncovered", async (s) => {
      const [doc] = await countsOf(U.pharmacist.id);
      coveredBefore = (await call("doctor", "GET", "/inventory/workspace/reconciliation")).forecast.covered;
      const { page } = s.track(await open("doctor"));
      await goto(page, `${COUNTS}&document=${doc.id}`);
      await page.getByRole("button", { name: "Reject" }).click();
      const dialog = page.getByRole("dialog", { name: "Reject this count" });
      await dialog.waitFor();
      s.check("reject reason starts empty", await dialog.getByLabel("Reason (required)").inputValue(), "");
      s.check("the dialog names what is rejected", clean(await dialog.locator("p").first().innerText()), `Rejecting 4 batches, short ${signed(-2 * unitCost(ANIL[1]))}. Stock does not change; these batches go back into the cycle to be counted again.`);
      await armed(page);
      await dialog.getByRole("button", { name: "Reject count" }).click();
      s.check("a reason is required", clean(await dialog.getByRole("alert").innerText()), "Say why this count is rejected, so the next count can fix it.");
      await dialog.getByLabel("Reason (required)").fill("Benzoyl is on two shelves; recount both");
      await dialog.getByRole("button", { name: "Reject count" }).click();
      await page.getByText(/^Rejected by Priya Menon/).waitFor();
      s.check("stock unchanged", await stockOf(ANIL[1]), 15);
      const after = (await call("doctor", "GET", "/inventory/workspace/reconciliation")).forecast.covered;
      s.check("its four batches are no longer covered this cycle", [coveredBefore, after], [8, 4]);
      s.ok("record explains the recount", (await page.getByText(/these batches will be counted again/).count()) === 1);
    });

    await scenario("10", "rejected-batches-are-dealt-again", async (s) => {
      const settings = await call("admin", "GET", "/inventory/workspace/reconciliation");
      await call("admin", "PATCH", "/inventory/workspace/settings", { version: settings.settingsVersion, reconciliation: { assigneeIds: [U.pharmacist.id, U.kavya.id, U.owner.id] } });
      await call("owner", "GET", "/inventory/workspace/reconciliation");
      const [mine] = await countsOf(U.owner.id);
      s.check("the next counter's list starts with the rejected batches", lineNames(mine), ANIL);
      s.check("no new list for those already planned today", [(await countsOf(U.pharmacist.id)).length, (await countsOf(U.kavya.id)).length], [1, 1]);
    });

    await scenario("11", "admin-approves-a-count-signed-by-the-owner", async (s) => {
      const [doc] = await countsOf(U.owner.id);
      await signViaApi("owner", doc, (line) => (line.name === ANIL[1] ? 14 : batches[line.name].currentStock), "Benzoyl recounted on both shelves: 14");
      const { page } = s.track(await open("admin"));
      await goto(page, `${COUNTS}&tab=approvals`);
      await grid(page, "Counts awaiting approval");
      await page.locator('table[aria-label="Counts awaiting approval"] tbody tr').filter({ hasText: "Rajesh I." }).click();
      await page.getByText(/^Signed by Rajesh Iyer/).waitFor();
      await page.getByRole("button", { name: "Approve and adjust stock" }).click();
      const dialog = page.getByRole("dialog", { name: "Approve and adjust stock" });
      await armed(page);
      await dialog.getByRole("button", { name: "Approve and adjust stock" }).click();
      await page.getByText(/^Approved by Asha Rao/).waitFor();
      s.check("stock adjusted by the admin", await stockOf(ANIL[1]), 14);
      const fresh = await stack.db.inventoryWorkflowDocument.findUnique({ where: { id: doc.id } });
      s.check("decision recorded", [fresh.status, fresh.approvedBy === U.admin.id, fresh.payload.decision.selfApproval], ["POSTED", true, false]);
    });

    await scenario("12", "separation-of-duties-and-the-sole-approver", async (s) => {
      const created = await call("doctor", "POST", "/inventory/workspace/counts", { itemIds: [batches["Fluconazole 150mg Tab"].id], requestKey: crypto.randomUUID() });
      await signViaApi("doctor", created, () => 13, "One strip missing");
      const { page } = s.track(await open("doctor"));
      await goto(page, `${COUNTS}&document=${created.id}`);
      await page.getByText(/^Signed by Priya Menon/).waitFor();
      s.check("the signer is told who decides", clean(await page.getByText(/You signed this count, so someone else decides it/).innerText()), "You signed this count, so someone else decides it. Ask Asha Rao or Rajesh Iyer.");
      s.check("no decision buttons for the signer", await page.getByRole("button", { name: "Approve and adjust stock" }).count(), 0);
      const forced = await attempt("doctor", "POST", `/inventory/workspace/reconciliation/counts/${created.id}/approve`, { version: created.version + 1, requestKey: crypto.randomUUID(), reason: "Fine", selfApproval: true });
      s.check("the server refuses too", [forced.status, forced.body?.code], [403, "COUNT_SEPARATION_OF_DUTIES"]);
      await stack.db.user.updateMany({ where: { id: { in: [U.admin.id, U.owner.id] } }, data: { isActive: false } });
      try {
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.getByText(/no other approver is active, so you decide it/).waitFor({ timeout: 240000 });
        await page.getByRole("button", { name: "Approve and adjust stock" }).click();
        const dialog = page.getByRole("dialog", { name: "Approve and adjust stock" });
        await armed(page);
        await dialog.getByRole("button", { name: "Approve and adjust stock" }).click();
        s.check("an explicit tick is required", clean(await dialog.getByRole("alert").innerText()), "Tick the box to confirm you are deciding your own count.");
        await dialog.getByRole("checkbox").check();
        await dialog.getByRole("button", { name: "Approve and adjust stock" }).click();
        await page.getByText(/^Approved by Priya Menon/).waitFor();
        s.ok("record says it was her own count", (await page.getByText(/their own count; no other approver was active/).count()) === 1);
        const events = await stack.db.inventoryWorkflowEvent.findMany({ where: { documentId: created.id, action: "APPROVE" } });
        s.check("the event logs the self-approval", events.map((e) => e.detail.selfApproval), [true]);
        s.check("stock adjusted", await stockOf("Fluconazole 150mg Tab"), 13);
      } finally {
        await stack.db.user.updateMany({ where: { id: { in: [U.admin.id, U.owner.id] } }, data: { isActive: true } });
      }
    });

    await scenario("13", "on-demand-count-with-no-difference-posts-at-once", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page);
      await page.getByRole("button", { name: "Count an item" }).click();
      const dialog = page.getByRole("dialog", { name: "Count an item or a shelf" });
      await dialog.getByLabel("Find a batch").fill("Minoxidil");
      await dialog.getByRole("checkbox").first().waitFor({ timeout: 60000 });
      await dialog.getByRole("checkbox").first().check();
      await armed(page);
      await dialog.getByRole("button", { name: "Count 1 batch" }).click();
      await counted(page).first().waitFor({ timeout: 240000 });
      await counted(page).first().fill("5");
      await page.getByRole("button", { name: "Sign off count" }).click();
      const sign = page.getByRole("dialog", { name: "Sign off this count" });
      await sign.waitFor();
      s.check("summary", clean(await sign.locator("p").first().innerText()), "1 item, all match the system.");
      await armed(page);
      await sign.getByRole("button", { name: "Sign off", exact: true }).click();
      await page.getByText("Every batch matched the system, so stock was confirmed without a change.").waitFor();
      const docs = await countsOf(U.pharmacist.id, { payload: { path: ["origin"], equals: "ON_DEMAND" } });
      s.check("posted immediately with no stock movement", [docs.at(-1).status, await stockOf("Minoxidil Solution 5%"), await stack.db.stockTransaction.count({ where: { itemId: batches["Minoxidil Solution 5%"].id } })], ["POSTED", 5, 0]);
      s.check("an audit row with zero variance", (await stack.db.inventoryAudit.findMany({ where: { itemId: batches["Minoxidil Solution 5%"].id } })).map((a) => [a.systemStock, a.physicalStock, a.variance]), [[5, 5, 0]]);
      s.ok("toast confirms", (await toasts(page)).some((t) => t.includes("Count signed off. Stock confirmed.")), await toasts(page));
      s.check("badge", clean(await page.locator('[data-slot="badge"]').first().innerText()), "Confirmed, no differences");
      s.check("no duplicate On-demand count line", await page.getByText("On-demand count", { exact: true }).count(), 0);
    });

    await scenario("14", "capacity-short-forecast-and-behind-card", async (s) => {
      const { page } = s.track(await open("admin"));
      await goto(page, `${COUNTS}&tab=settings`);
      await page.getByLabel("Cycle length (days)").fill("2");
      await page.getByLabel("Items per person per day").fill("1");
      for (const who of ["Kavya Joshi", "Rajesh Iyer"]) await page.getByLabel(new RegExp(`^${who}`)).uncheck();
      const inStock = await stack.db.inventoryItem.count({ where: { branchId, currentStock: { gt: 0 } } });
      const expected = `At 1 per person per day with 1 person, a 2-day cycle covers 2 of ${inStock} batches in stock. Raise items per day to ${Math.ceil(inStock / 2)} or add ${Math.ceil(inStock / 2) - 1} people.`;
      s.check("the forecast says plainly that the cycle falls short", clean(await page.locator('form [role="status"]').first().innerText()), expected);
      const covered = (await call("admin", "GET", "/inventory/workspace/reconciliation")).forecast.covered;
      s.check("a restart warns how many batches will be counted again", clean(await page.getByText(/^Saving starts a new cycle today/).innerText()), `Saving starts a new cycle today. The ${covered} batches counted in this cycle will be counted again. Counts not yet signed or approved stay with the people counting them.`);
      await s.shot(page, "settings-short-1440");
      await page.getByRole("button", { name: "Save settings" }).click();
      await page.getByText("Behind:").waitFor();
      await goto(page, "/dashboard/inventory");
      const card = page.getByRole("button", { name: /Batches not counted this cycle/ });
      await card.waitFor({ timeout: 240000 });
      s.ok("the card carries the forecast", clean(await card.innerText()).includes(expected), clean(await card.innerText()));
      const pharmacist = s.track(await open("pharmacist"));
      await goto(pharmacist.page, "/dashboard/inventory");
      s.check("a counter without settings access sees no behind card", await pharmacist.page.getByRole("button", { name: /Batches not counted this cycle/ }).count(), 0);
      const now = await call("admin", "GET", "/inventory/workspace/reconciliation");
      await call("admin", "PATCH", "/inventory/workspace/settings", { version: now.settingsVersion, reconciliation: { enabled: false, cycleDays: 10, itemsPerPersonPerDay: 4, assigneeIds: [U.pharmacist.id, U.kavya.id, U.owner.id] } });
    });

    await scenario("15", "double-submit-signs-and-approves-once", async (s) => {
      const created = await call("kavya", "POST", "/inventory/workspace/counts", { itemIds: [batches["Permethrin Cream 5%"].id], requestKey: crypto.randomUUID() });
      const { page } = s.track(await open("kavya"));
      await goto(page, `${COUNTS}&document=${created.id}`);
      await counted(page).first().waitFor({ timeout: 240000 });
      await counted(page).first().fill("3");
      await page.getByRole("button", { name: "Sign off count" }).click();
      const sign = page.getByRole("dialog", { name: "Sign off this count" });
      await sign.getByLabel("Why do these differ? (required)").fill("One tube expired and binned");
      await armed(page);
      await sign.getByRole("button", { name: "Sign off and send for approval" }).dblclick();
      await page.getByText(/^Signed by Kavya Joshi/).waitFor();
      s.check("one sign-off event", await stack.db.inventoryWorkflowEvent.count({ where: { documentId: created.id, action: "SIGN_OFF" } }), 1);
      const doc = await stack.db.inventoryWorkflowDocument.findUnique({ where: { id: created.id } });
      const replay = await attempt("kavya", "POST", `/inventory/workspace/reconciliation/counts/${created.id}/sign-off`, { version: 1, requestKey: doc.payload.signOff.requestKey, note: "One tube expired and binned", lines: doc.payload.lines.map((l) => ({ id: l.id, physicalStock: 3, note: "" })) });
      s.check("a replay with the same key returns the signed record", [replay.status, replay.body?.version], [200, doc.version]);
      const clash = await attempt("kavya", "POST", `/inventory/workspace/reconciliation/counts/${created.id}/sign-off`, { version: 1, requestKey: doc.payload.signOff.requestKey, note: "Different", lines: [] });
      s.check("the same key with other content gets 409", [clash.status, clash.body?.code], [409, "COUNT_REQUEST_KEY_REUSED"]);
      const doctor = s.track(await open("doctor"));
      await goto(doctor.page, `${COUNTS}&document=${created.id}`);
      await doctor.page.getByRole("button", { name: "Approve and adjust stock" }).click();
      const dialog = doctor.page.getByRole("dialog", { name: "Approve and adjust stock" });
      await armed(doctor.page);
      await dialog.getByRole("button", { name: "Approve and adjust stock" }).dblclick();
      await doctor.page.getByText(/^Approved by Priya Menon/).waitFor();
      s.check("one movement", await stack.db.stockTransaction.count({ where: { itemId: batches["Permethrin Cream 5%"].id } }), 1);
      s.check("stock adjusted once", await stockOf("Permethrin Cream 5%"), 3);
    });

    await scenario("16", "approval-refused-when-the-count-cannot-be-right", async (s) => {
      const created = await call("pharmacist", "POST", "/inventory/workspace/counts", { itemIds: [batches["Hydroquinone Cream 2%"].id], requestKey: crypto.randomUUID() });
      await signViaApi("pharmacist", created, () => 0, "None on the shelf");
      await sell("Hydroquinone Cream 2%", 1);
      const { page } = s.track(await open("doctor"));
      await goto(page, `${COUNTS}&document=${created.id}`);
      await page.getByRole("button", { name: "Approve and adjust stock" }).click();
      const dialog = page.getByRole("dialog", { name: "Approve and adjust stock" });
      await armed(page);
      await dialog.getByRole("button", { name: "Approve and adjust stock" }).click();
      await dialog.getByRole("alert").waitFor();
      s.check("plain message in the dialog", clean(await dialog.getByRole("alert").innerText()), "Hydroquinone Cream 2%: the count found 6 fewer than the system had, but only 5 strips are left now. The count cannot be right. Reject it and ask for a fresh count.");
      s.check("stock untouched", await stockOf("Hydroquinone Cream 2%"), 5);
      const fresh = await stack.db.inventoryWorkflowDocument.findUnique({ where: { id: created.id } });
      await call("doctor", "POST", `/inventory/workspace/reconciliation/counts/${created.id}/reject`, { version: fresh.version, requestKey: crypto.randomUUID(), reason: "The count cannot be right; count it again" });
    });

    await scenario("17", "history-lists-every-count-with-filters", async (s) => {
      const { page } = s.track(await open("doctor", { width: 1280, height: 800 }));
      await goto(page, `${COUNTS}&tab=history`);
      await grid(page, "Stock count history");
      const heads = await headsOf(page, "Stock count history");
      s.check("columns", heads, ["Date", "Counted by", "Signed at", "Items", "Differences", "Short ₹", "Net ₹", "Status", "Decided by"]);
      const fits = await tableFits(page, 'table[aria-label="Stock count history"]');
      s.ok("every column visible at 1280", fits.fits, fits);
      s.check("money never wraps", await moneyOnOneLine(page), []);
      const visibleRows = await page.locator('table[aria-label="Stock count history"] tbody tr').evaluateAll((trs) => trs.filter((tr) => tr.getBoundingClientRect().bottom <= window.innerHeight - 60).length);
      s.ok("at least 5 rows visible at 1280 x 800 above the footer", visibleRows >= 5, visibleRows);
      const states = await page.locator('table[aria-label="Stock count history"] tbody tr td:nth-child(8)').allInnerTexts();
      s.ok("states shown", ["Approved", "Rejected", "Confirmed"].every((label) => states.map(clean).includes(label)), states.map(clean));
      await s.shot(page, "history-1280");
      await page.getByLabel("Status").selectOption("REJECTED");
      await page.waitForTimeout(1200);
      const rejected = await page.locator('table[aria-label="Stock count history"] tbody tr').allInnerTexts();
      s.check("status filter", rejected.map((t) => clean(t).includes("Rejected")), [true, true]);
      await page.getByRole("button", { name: "Clear all" }).click();
      await page.getByLabel("Search").fill("Permethrin");
      await page.waitForTimeout(1500);
      s.check("search by item", (await page.locator('table[aria-label="Stock count history"] tbody tr').count()), 1);
      s.check("footer totals split approved from awaiting", clean(await page.locator('[role="status"][aria-live="polite"]').last().innerText()).split(" 1–")[0], `1 count · Approved ${signed(-1 * unitCost("Permethrin Cream 5%"))} · Awaiting ₹0.00`);
    });

    await scenario("18", "layout-1440", async (s) => {
      const { page } = s.track(await open("doctor", { width: 1440, height: 900 }));
      await goto(page, `${COUNTS}&tab=history`);
      await grid(page, "Stock count history");
      s.ok("history fits", (await tableFits(page, 'table[aria-label="Stock count history"]')).fits);
      s.ok("at least 6 rows visible at 1440 x 900", (await page.locator('table[aria-label="Stock count history"] tbody tr').evaluateAll((trs) => trs.filter((tr) => tr.getBoundingClientRect().bottom <= window.innerHeight).length)) >= 6);
      await s.shot(page, "history-1440");
      const created = await call("doctor", "POST", "/inventory/workspace/counts", { itemIds: data.names.slice(10, 16).map((n) => batches[n].id), requestKey: crypto.randomUUID() });
      await goto(page, `${COUNTS}&document=${created.id}`);
      await counted(page).first().waitFor({ timeout: 240000 });
      s.ok("count sheet fits", (await tableFits(page, '[aria-label="Batches to count"]')).fits);
      await counted(page).first().fill("1");
      s.check("money never wraps", await moneyOnOneLine(page), []);
      await s.shot(page, "count-sheet-1440");
    });

    await scenario("19", "layout-390-cards-without-sideways-scroll", async (s) => {
      const phone = { width: 390, height: 844 };
      const { page } = s.track(await open("doctor", phone));
      await goto(page, `${COUNTS}&tab=history`);
      await page.getByRole("list", { name: "Stock counts" }).waitFor();
      const scroll = await pageScroll(page);
      s.ok("history: no sideways page scroll", scroll.scroll <= scroll.width, scroll);
      s.check("history is a card list on a phone", await page.getByRole("table", { name: "Stock count history" }).isVisible(), false);
      s.check("money never wraps", await moneyOnOneLine(page), []);
      s.check("tab labels stay on one line", await page.getByRole("tab").evaluateAll((tabs) => tabs.filter((tab) => tab.getBoundingClientRect().height > 48).map((tab) => tab.textContent)), []);
      await page.getByRole("list", { name: "Stock counts" }).scrollIntoViewIfNeeded();
      await s.shot(page, "history-390");
      await goto(page, `${COUNTS}&tab=approvals`);
      await page.getByRole("list", { name: "Stock counts" }).or(page.getByText("Nothing waiting for approval.")).first().waitFor();
      await s.shot(page, "approvals-390");
      await goto(page, `${COUNTS}&tab=settings`);
      await page.getByRole("region", { name: "Current cycle" }).waitFor();
      const settingsScroll = await pageScroll(page);
      s.ok("settings: no sideways page scroll", settingsScroll.scroll <= settingsScroll.width, settingsScroll);
      await page.getByLabel("Cycle length (days)").scrollIntoViewIfNeeded();
      await s.shot(page, "settings-390");
      const created = await call("doctor", "POST", "/inventory/workspace/counts", { itemIds: data.names.slice(16, 20).map((n) => batches[n].id), requestKey: crypto.randomUUID() });
      await goto(page, `${COUNTS}&document=${created.id}`);
      await counted(page).first().waitFor({ timeout: 240000 });
      const sheet = await pageScroll(page);
      s.ok("count sheet: no sideways page scroll", sheet.scroll <= sheet.width, sheet);
      const box = await counted(page).nth(3).boundingBox();
      s.ok("every counted field is reachable on screen width", box && box.x >= 0 && box.x + box.width <= 390, box);
      await counted(page).nth(0).fill("17");
      s.check("money never wraps", await moneyOnOneLine(page), []);
      await page.getByRole("list", { name: "Batches to count" }).scrollIntoViewIfNeeded();
      await page.evaluate(() => document.querySelector('[aria-label="Batches to count"]').scrollIntoView({ block: "start" }));
      await s.shot(page, "count-sheet-390");
      for (const [i, n] of [[1, "9"], [2, "4"], [3, "18"]]) await counted(page).nth(i).fill(n);
      await page.getByRole("button", { name: "Sign off count" }).click();
      const dialog = page.getByRole("dialog", { name: "Sign off this count" });
      await dialog.waitFor();
      const dbox = await dialog.boundingBox();
      s.ok("sign-off sheet fits the phone", dbox && dbox.x >= 0 && dbox.x + dbox.width <= 390, dbox);
      await s.shot(page, "sign-off-390");
      await dialog.getByLabel(/Why do these differ|Note/).fill("Phone count");
      await armed(page);
      await dialog.getByRole("button", { name: /^Sign off/ }).click();
      await page.getByText(/^Signed by/).waitFor();
      await s.shot(page, "record-390");
      const admin = s.track(await open("admin", phone));
      await goto(admin.page, `${COUNTS}&document=${created.id}`);
      await admin.page.getByRole("button", { name: "Approve and adjust stock" }).waitFor();
      const record = await pageScroll(admin.page);
      s.ok("approval detail: no sideways page scroll", record.scroll <= record.width, record);
      s.check("money never wraps on the approval detail", await moneyOnOneLine(admin.page), []);
      await admin.page.getByRole("button", { name: "Approve and adjust stock" }).scrollIntoViewIfNeeded();
      await admin.page.evaluate(() => document.getElementById("count-record-title").scrollIntoView({ block: "start" }));
      await s.shot(admin.page, "approval-detail-390");
      await admin.page.getByRole("button", { name: "Approve and adjust stock" }).click();
      const decision = admin.page.getByRole("dialog", { name: "Approve and adjust stock" });
      await decision.waitFor();
      const decisionBox = await decision.boundingBox();
      s.ok("approval sheet fits the phone", decisionBox && decisionBox.x >= 0 && decisionBox.x + decisionBox.width <= 390, decisionBox);
      await s.shot(admin.page, "approve-dialog-390");
      await admin.page.keyboard.press("Escape");
      await goto(admin.page, `${COUNTS}`);
      await s.shot(admin.page, "my-counts-390");
    });

    await scenario("20", "reception-without-access", async (s) => {
      const { page } = s.track(await open("reception"));
      await page.goto(`${stack.base}${COUNTS}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.getByText(/You don’t have access to stock counts|do not have permission|access/i).first().waitFor({ timeout: 240000 });
      s.ok("reception sees the access message, not a broken page", (await page.getByText("Forbidden resource").count()) === 0);
      const summary = await attempt("reception", "GET", "/inventory/workspace/reconciliation");
      s.check("the summary is refused", summary.status, 403);
      const overview = await attempt("reception", "GET", "/inventory/workspace/overview");
      s.check("Today carries no count cards for reception", overview.status === 200 ? overview.body.reconciliation : "refused", overview.status === 200 ? null : "refused");
      await s.shot(page, "reception-1440");
    });

    await scenario("21", "pharmacy-roles-reach-stock-counts", async (s) => {
      for (const who of ["pharmacist", "doctor", "admin"]) {
        const summary = await attempt(who, "GET", "/inventory/workspace/reconciliation");
        s.check(`${who} reads stock counts`, summary.status, 200);
        s.check(`${who} capabilities`, summary.status === 200 ? [summary.body.canCount, summary.body.canApprove, summary.body.canConfigure] : null, who === "pharmacist" ? [true, false, false] : [true, true, true]);
        const history = await attempt(who, "GET", "/inventory/workspace/reconciliation/counts?view=history");
        s.check(`${who} reads history`, history.status, 200);
      }
      const { page } = s.track(await open("pharmacist"));
      await goto(page);
      s.check("a pharmacist sees My counts and History only", (await page.getByRole("tab").allInnerTexts()).map((t) => clean(t).replace(/\d+$/, "")), ["My counts", "History"]);
      const [doc] = await countsOf(U.kavya.id, { status: "POSTED" });
      const deny = await attempt("pharmacist", "POST", `/inventory/workspace/reconciliation/counts/${doc.id}/approve`, { version: doc.version, requestKey: crypto.randomUUID(), reason: "x" });
      s.check("a pharmacist cannot decide", deny.status, 403);
    });

    await scenario("22", "my-counts-and-settings-at-1280", async (s) => {
      const { page } = s.track(await open("owner", { width: 1280, height: 800 }));
      await goto(page);
      await s.shot(page, "my-counts-1280");
      await goto(page, `${COUNTS}&tab=approvals`);
      await grid(page, "Counts awaiting approval");
      s.ok("approvals fit 1280", (await tableFits(page, 'table[aria-label="Counts awaiting approval"]')).fits);
      await s.shot(page, "approvals-1280");
      await goto(page, `${COUNTS}&tab=settings`);
      await page.getByRole("region", { name: "Current cycle" }).waitFor();
      await s.shot(page, "settings-1280");
      const scroll = await pageScroll(page);
      s.ok("no sideways page scroll", scroll.scroll <= scroll.width, scroll);
    });

    const freshDoc = (id) => stack.db.inventoryWorkflowDocument.findUnique({ where: { id } });
    const onDemand = (who, names) => call(who, "POST", "/inventory/workspace/counts", { itemIds: names.map((n) => batches[n].id), requestKey: crypto.randomUUID() });
    const decide = async (who, id, decision, reason) => {
      const doc = await freshDoc(id);
      return call(who, "POST", `/inventory/workspace/reconciliation/counts/${id}/${decision}`, { version: doc.version, requestKey: crypto.randomUUID(), reason });
    };
    const twinOf = async (doc, assignee) => {
      const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = await freshDoc(doc.id);
      return stack.db.inventoryWorkflowDocument.create({
        data: {
          ...copy,
          requestKey: `left-by-the-old-code-${crypto.randomUUID()}`,
          reference: `Stock count ${ddmmyyyy(today)} · ${stack.users[assignee].firstName} ${stack.users[assignee].lastName}`,
          createdBy: stack.users[assignee].id,
          payload: {
            ...copy.payload,
            assigneeId: stack.users[assignee].id,
            lines: copy.payload.lines.map((line) => ({ ...line, id: `${line.id}-twin` })),
            ...(copy.payload.signOff ? { signOff: { ...copy.payload.signOff, by: stack.users[assignee].id, requestKey: crypto.randomUUID() } } : {}),
          },
        },
      });
    };
    const openPicker = async (page) => {
      await page.getByRole("button", { name: "Count an item" }).click();
      const dialog = page.getByRole("dialog", { name: "Count an item or a shelf" });
      await dialog.waitFor();
      await armed(page);
      return dialog;
    };
    const visibleText = (page, selector) => page.locator(selector).evaluateAll((els) => els.filter((el) => el.getClientRects().length).map((el) => el.innerText.replace(/\s+/g, " ").trim()));

    await scenario("23", "b1-a-batch-on-an-open-count-cannot-be-counted-again", async (s) => {
      const held = "Hydroquinone Cream 2%";
      const refused = await attempt("kavya", "POST", "/inventory/workspace/counts", { itemIds: [batches[held].id, batches["Calamine Lotion 100ml"].id], requestKey: crypto.randomUUID() });
      s.check("the server refuses and names the open count", [refused.status, refused.body?.code, refused.body?.message], [
        409, "COUNT_BATCH_OPEN", `${held}, batch B011, is already on Priya Menon's count of ${ddmmyyyy(today)}, not signed yet. Count it there, or ask Priya Menon to sign it off first.`,
      ]);
      const { page } = s.track(await open("kavya", { width: 1280, height: 800 }));
      await goto(page);
      const dialog = await openPicker(page);
      await dialog.getByLabel("Find a batch").fill("Hydroquinone");
      const box = dialog.getByRole("checkbox", { name: new RegExp(held.replace(/[%]/g, "\\$&")) });
      await box.waitFor({ timeout: 60000 });
      s.check("the picker greys it out and says whose count it is on", [await box.isDisabled(), clean(await dialog.getByText(/^On Priya Menon's count/).innerText())], [true, `On Priya Menon's count of ${ddmmyyyy(today)}, not signed yet`]);
      await s.shot(page, "picker-held-1280");
    });

    await scenario("24", "b1-two-counts-of-one-batch-adjust-stock-once", async (s) => {
      const name = "Adapalene Gel 15g";
      const before = await stockOf(name);
      const first = await onDemand("kavya", [name]);
      await signViaApi("kavya", first, () => before - 1, "One tube missing");
      const twin = await twinOf(first, "pharmacist");
      await decide("doctor", first.id, "approve", "Physical count signed by Kavya Joshi");
      s.check("the first approval adjusts stock", await stockOf(name), before - 1);
      const { page } = s.track(await open("doctor", { width: 1280, height: 800 }));
      await goto(page, `${COUNTS}&document=${twin.id}`);
      await page.getByRole("button", { name: "Approve and adjust stock" }).click();
      const dialog = page.getByRole("dialog", { name: "Approve and adjust stock" });
      await armed(page);
      await dialog.getByRole("button", { name: "Approve and adjust stock" }).click();
      await dialog.getByRole("alert").waitFor();
      s.check("the second approval is refused in plain words", clean(await dialog.getByRole("alert").innerText()), `${name}, batch B001, was counted again after this count and that count is already in the stock. Approving this one would apply the difference twice. Reject it instead.`);
      s.check("stock moved once", [await stockOf(name), (await freshDoc(twin.id)).status], [before - 1, "AWAITING_APPROVAL"]);
      await s.shot(page, "superseded-1280");
      await decide("doctor", twin.id, "reject", "Counted twice; the other count is in the stock");
    });

    await scenario("25", "m1-a-count-saved-before-capture-times-is-typed-again", async (s) => {
      const name = "Azelaic Acid Cream 20%";
      const created = await onDemand("pharmacist", [name]);
      const doc = await freshDoc(created.id);
      const stock = await stockOf(name);
      await stack.db.inventoryWorkflowDocument.update({ where: { id: doc.id }, data: { payload: { ...doc.payload, lines: doc.payload.lines.map((line) => ({ ...line, physicalStock: stock })) } } });
      const refused = await attempt("pharmacist", "POST", `/inventory/workspace/reconciliation/counts/${doc.id}/sign-off`, { version: doc.version, requestKey: crypto.randomUUID(), note: "", lines: doc.payload.lines.map((line) => ({ id: line.id, physicalStock: stock })) });
      s.check("sign-off asks for it to be typed again", [refused.status, refused.body?.code, refused.body?.message], [400, "COUNT_RETYPE", `Type these counts again before signing off: ${name}. The system quantity they were compared with is out of date.`]);
      const { page } = s.track(await open("pharmacist", { width: 1280, height: 800 }));
      await goto(page);
      const item = page.getByRole("list", { name: "Counts assigned to you" }).getByRole("listitem").filter({ hasText: "on demand" });
      s.ok("My counts shows it needs typing again", (await item.allInnerTexts()).map(clean).some((t) => t.includes("1 item · 0 counted · 1 to type again")), (await item.allInnerTexts()).map(clean));
      await goto(page, `${COUNTS}&document=${doc.id}`);
      await counted(page).first().waitFor({ timeout: 240000 });
      s.check("the field is empty and says what it was", [await counted(page).first().inputValue(), clean(await page.getByText(/^Type it again/).innerText())], ["", `Type it again (was ${stock})`]);
      await counted(page).first().fill(String(stock));
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: "Sign off count" }).click();
      const sign = page.getByRole("dialog", { name: "Sign off this count" });
      await armed(page);
      await sign.getByRole("button", { name: "Sign off", exact: true }).click();
      await page.getByText("Every batch matched the system, so stock was confirmed without a change.").waitFor();
      s.check("retyped and posted", (await freshDoc(doc.id)).status, "POSTED");
    });

    await scenario("26", "m1-only-an-unsigned-count-can-be-cancelled", async (s) => {
      const signed = await stack.db.inventoryWorkflowDocument.findFirst({ where: { branchId, kind: "COUNT", status: "AWAITING_APPROVAL", createdBy: U.doctor.id } });
      const cancelSigned = await attempt("admin", "POST", `/inventory/workspace/documents/${signed.id}/transition`, { action: "CANCEL", version: signed.version });
      s.check("a signed count cannot be cancelled", [cancelSigned.status, cancelSigned.body?.message], [400, "A signed count cannot be cancelled. A doctor or administrator rejects it from Stock counts › Approvals."]);
      const draft = await onDemand("pharmacist", ["Clindamycin Gel 1%"]);
      const byOther = await attempt("kavya", "POST", `/inventory/workspace/documents/${draft.id}/transition`, { action: "CANCEL", version: draft.version });
      s.check("someone else cannot cancel it", [byOther.status, byOther.body?.message], [403, "Only the person this count is assigned to, or a doctor or administrator, can cancel it."]);
      const own = await attempt("pharmacist", "POST", `/inventory/workspace/documents/${draft.id}/transition`, { action: "CANCEL", version: draft.version });
      s.check("the person counting can", [own.status, own.body?.status], [200, "CANCELLED"]);
    });

    await scenario("27", "m3-a-manager-does-not-decide-counts", async (s) => {
      await addUser(stack, "manager", { role: "MANAGER", firstName: "Ravi", lastName: "Kumar", permissions: ["inventory:item:read"] });
      const signed = await stack.db.inventoryWorkflowDocument.findFirst({ where: { branchId, kind: "COUNT", status: "AWAITING_APPROVAL", createdBy: U.doctor.id } });
      const refused = await attempt("manager", "POST", `/inventory/workspace/reconciliation/counts/${signed.id}/approve`, { version: signed.version, requestKey: crypto.randomUUID(), reason: "Fine" });
      s.check("a manager cannot approve a count", [refused.status, refused.body?.message], [403, "A doctor or an administrator decides stock count differences"]);
      const detail = await call("doctor", "GET", `/inventory/workspace/reconciliation/counts/${signed.id}`);
      s.check("the signer is pointed at doctors, owners and admins only", detail.approvers, ["Asha Rao", "Rajesh Iyer"]);
      const { page } = s.track(await open("doctor"));
      await goto(page, `${COUNTS}&document=${signed.id}`);
      s.check("the record names them", clean(await page.getByText(/You signed this count, so someone else decides it/).innerText()), "You signed this count, so someone else decides it. Ask Asha Rao or Rajesh Iyer.");
    });

    const SHELF = ["Benzoyl Peroxide Gel 2.5%", "Calamine Lotion 100ml", "Cetirizine 10mg Tab"];
    await scenario("28", "u3-count-a-whole-shelf", async (s) => {
      for (const n of [...SHELF, "Isotretinoin 10mg Cap"]) await stack.db.inventoryItem.update({ where: { id: batches[n].id }, data: { storageLocation: "Rack S-01" } });
      const { page } = s.track(await open("pharmacist", { width: 1280, height: 800 }));
      await goto(page);
      const dialog = await openPicker(page);
      await dialog.getByRole("radio", { name: "Shelf / location" }).click();
      await dialog.getByLabel("Shelf").selectOption("Rack S-01");
      await dialog.getByRole("checkbox", { name: /Select all/ }).waitFor({ timeout: 60000 });
      const boxes = await dialog.getByRole("list", { name: "Batches" }).getByRole("checkbox").evaluateAll((els) => els.map((el) => [el.closest("label").innerText.split("\n")[0], el.checked, el.disabled]));
      s.check("every in-stock batch on the shelf is listed and ticked, one on an open count is not", boxes, [
        [SHELF[0], true, false], [SHELF[1], true, false], [SHELF[2], true, false], ["Isotretinoin 10mg Cap", false, true],
      ]);
      s.check("select all names the shelf", [clean(await dialog.getByRole("checkbox", { name: /Select all/ }).locator("..").innerText()), await dialog.getByRole("checkbox", { name: /Select all/ }).isChecked()], ["Select all 3 on Rack S-01", true]);
      await s.shot(page, "shelf-picker-1280");
      await dialog.getByRole("button", { name: "Count 3 batches" }).click();
      await counted(page).first().waitFor({ timeout: 240000 });
      s.check("the sheet holds the shelf", await counted(page).evaluateAll((els) => els.map((el) => el.getAttribute("id") && el.closest('[role="listitem"]').querySelector(".font-semibold").textContent)), SHELF);
      s.ok("phone labels stay readable to screen readers on a desktop", (await page.getByRole("list", { name: "Batches to count" }).getByRole("listitem").first().innerText()).includes("System"));
      for (const [index, n] of SHELF.entries()) await counted(page).nth(index).fill(String(await stockOf(n)));
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: "Sign off count" }).click();
      const sign = page.getByRole("dialog", { name: "Sign off this count" });
      await armed(page);
      await sign.getByRole("button", { name: "Sign off", exact: true }).click();
      await page.getByText("Every batch matched the system, so stock was confirmed without a change.").waitFor();
    });

    await scenario("29", "u3-m3-search-finds-zero-stock-and-says-when-it-shows-fewer", async (s) => {
      for (let n = 1; n <= 24; n++)
        await stack.db.inventoryItem.create({
          data: { branchId, name: `Sunscreen Sample Tube ${String(n).padStart(2, "0")}`, type: "MEDICINE", costPrice: 5, sellingPrice: 10, unit: "TUBES", currentStock: 0, batchNumber: `S${n}`, expiryDate: new Date("2027-12-31T00:00:00Z"), stockStatus: "OUT_OF_STOCK", storageLocation: "Rack T-01", status: "ACTIVE" },
        });
      const { page } = s.track(await open("pharmacist", { width: 390, height: 844 }));
      await goto(page);
      const dialog = await openPicker(page);
      await dialog.getByLabel("Find a batch").fill("Sunscreen Sample");
      await dialog.getByText(/^Showing 20 of/).waitFor({ timeout: 60000 });
      s.check("no silent cap", clean(await dialog.getByText(/^Showing 20 of/).innerText()), "Showing 20 of 24. Type more of the name or batch to narrow it down.");
      s.ok("zero stock is listed", (await dialog.getByRole("list", { name: "Batches" }).innerText()).includes("0 in stock"));
      const fits = await dialog.boundingBox();
      s.ok("the picker fits the phone", fits && fits.x >= 0 && fits.x + fits.width <= 390, fits);
      await s.shot(page, "search-picker-390");
      await dialog.getByLabel("Find a batch").fill("Tretinoin");
      const box = dialog.getByRole("checkbox", { name: /Tretinoin Cream/ });
      await box.waitFor({ timeout: 60000 });
      await box.check();
      await dialog.getByRole("button", { name: "Count 1 batch" }).click();
      await counted(page).first().waitFor({ timeout: 240000 });
      await counted(page).first().fill("1");
      s.check("a found box shows as extra stock", clean(await page.getByText(/^Extra \+1/).innerText()), `Extra +1 (${signed(40)})`);
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: "Sign off count" }).click();
      const sign = page.getByRole("dialog", { name: "Sign off this count" });
      await sign.getByLabel("Why do these differ? (required)").fill("Found a box behind the counter");
      await armed(page);
      await sign.getByRole("button", { name: "Sign off and send for approval" }).click();
      await page.getByText(/^Signed by/).waitFor();
    });

    await scenario("30", "u6-u8-approvals-open-first-with-review-buttons", async (s) => {
      const { page } = s.track(await open("admin", { width: 1280, height: 800 }));
      await goto(page);
      s.check("an approver with nothing to count lands on Approvals", clean(await page.getByRole("tab", { selected: true }).innerText()).replace(/\d+$/, "").trim(), "Approvals");
      await grid(page, "Counts awaiting approval");
      const rows = await page.locator('table[aria-label="Counts awaiting approval"] tbody tr').count();
      s.check("each row has a Review button", await page.getByRole("button", { name: /^Review / }).count(), rows);
      s.ok("approvals fit 1280", (await tableFits(page, 'table[aria-label="Counts awaiting approval"]')).fits);
      await s.shot(page, "approvals-1280");
      const phone = s.track(await open("admin", { width: 390, height: 844 }));
      await goto(phone.page);
      await phone.page.getByRole("list", { name: "Stock counts" }).waitFor();
      const cards = phone.page.getByRole("list", { name: "Stock counts" }).getByRole("button");
      s.check("every phone card carries a chevron", await cards.evaluateAll((els) => els.every((el) => el.querySelector("svg.lucide-chevron-right"))), true);
      s.check("money never wraps", await moneyOnOneLine(phone.page), []);
      await s.shot(phone.page, "approvals-390");
    });

    await scenario("31", "u2-u7-approve-from-a-sticky-bar-with-values", async (s) => {
      const [short, extra] = ["Clindamycin Gel 1%", "Doxycycline 100mg Cap"];
      const [shortStock, extraStock] = [await stockOf(short), await stockOf(extra)];
      const created = await onDemand("kavya", [short, extra]);
      await signViaApi("kavya", created, (line) => (line.name === short ? shortStock - 1 : extraStock + 1), "Clindamycin tube split; one Doxycycline strip unrecorded");
      const split = `Short −1 (${signed(-unitCost(short))}) · Extra +1 (${signed(unitCost(extra))})`;
      const { page } = s.track(await open("admin", { width: 1280, height: 800 }));
      await goto(page, `${COUNTS}&document=${created.id}`);
      await page.getByText(/^Signed by Kavya Joshi/).waitFor();
      s.check("the header says what is short and what is extra", clean(await page.getByText(/^2 items, 2 differ/).innerText()), `2 items, 2 differ · ${split}`);
      const approve = page.getByRole("button", { name: "Approve and adjust stock" });
      const bar = await approve.boundingBox();
      s.ok("the decision bar is on screen at the bottom", bar && bar.y > 650 && bar.y + bar.height <= 800, bar);
      s.check("the bar repeats the split", clean(await approve.locator("xpath=ancestor::div[contains(@class,'sticky')][1]").innerText()).startsWith(split), true);
      await s.shot(page, "approval-detail-1280");
      await page.getByRole("button", { name: "Reject" }).click();
      const reject = page.getByRole("dialog", { name: "Reject this count" });
      s.check("reject names what it covers", clean(await reject.locator("p").first().innerText()), `Rejecting 2 batches, short ${signed(-unitCost(short))}, extra ${signed(unitCost(extra))}. Stock does not change; these batches go back into the cycle to be counted again.`);
      await s.shot(page, "reject-dialog-1280");
      await page.keyboard.press("Escape");
      await approve.click();
      const dialog = page.getByRole("dialog", { name: "Approve and adjust stock" });
      await dialog.waitFor();
      s.check("the description is plain", clean(await dialog.locator("p").first().innerText()), "Each difference is applied to today's stock, so sales made since the count are kept.");
      s.check("each batch carries its value", (await dialog.getByRole("list", { name: "Stock changes" }).getByRole("listitem").allInnerTexts()).map((t) => clean(t).split(" ").slice(-1)[0]), [signed(-unitCost(short)), signed(unitCost(extra))]);
      s.check("the total value change", clean(await dialog.getByText(/^Stock value changes by/).innerText()), `Stock value changes by ${signed(unitCost(extra) - unitCost(short))}`);
      await s.shot(page, "approve-dialog-1280");
      await page.keyboard.press("Escape");
      const phone = s.track(await open("admin", { width: 390, height: 844 }));
      await goto(phone.page, `${COUNTS}&document=${created.id}`);
      const phoneApprove = phone.page.getByRole("button", { name: "Approve and adjust stock" });
      await phoneApprove.waitFor();
      const phoneBar = await phoneApprove.boundingBox();
      s.ok("on a phone too the bar is on screen without scrolling", phoneBar && phoneBar.y + phoneBar.height <= 844 && phoneBar.y > 600, phoneBar);
      const scroll = await pageScroll(phone.page);
      s.ok("no sideways scroll", scroll.scroll <= scroll.width, scroll);
      await s.shot(phone.page, "approval-detail-390");
      await phoneApprove.click();
      const sheet = phone.page.getByRole("dialog", { name: "Approve and adjust stock" });
      await sheet.waitFor();
      const box = await sheet.boundingBox();
      s.ok("the approval sheet fits the phone", box && box.x >= 0 && box.x + box.width <= 390, box);
      await s.shot(phone.page, "approve-dialog-390");
      await armed(phone.page);
      await sheet.getByRole("button", { name: "Approve and adjust stock" }).click();
      await phone.page.getByText(/^Approved by Asha Rao/).waitFor();
      s.check("stock adjusted both ways", [await stockOf(short), await stockOf(extra)], [shortStock - 1, extraStock + 1]);
    });

    await scenario("32", "u5-u14-history-footer-and-own-count", async (s) => {
      const totals = (await call("doctor", "GET", "/inventory/workspace/reconciliation/counts?view=history")).totals;
      const { page } = s.track(await open("doctor", { width: 1280, height: 800 }));
      await goto(page, `${COUNTS}&tab=history`);
      await grid(page, "Stock count history");
      s.ok("rejected counts exist to leave out", totals.rejected >= 2, totals);
      s.check("footer splits approved from awaiting and leaves rejected out", clean(await page.locator('[role="status"][aria-live="polite"]').last().innerText()), `${totals.counts} counts · Approved ${signed(totals.approvedValue)} · Awaiting ${signed(totals.awaitingValue)} ${totals.rejected} rejected counts are not included.`);
      s.ok("history fits 1280", (await tableFits(page, 'table[aria-label="Stock count history"]')).fits);
      s.check("money never wraps", await moneyOnOneLine(page), []);
      await s.shot(page, "history-1280");
      await page.getByLabel("Search").fill("Fluconazole");
      await page.waitForTimeout(1500);
      const own = await page.locator('table[aria-label="Stock count history"] tbody tr').filter({ hasText: "Approved" }).locator("td").last().innerText();
      s.check("an approver's own count is marked", clean(own), "Own count");
      const phone = s.track(await open("doctor", { width: 390, height: 844 }));
      await goto(phone.page, `${COUNTS}&tab=history`);
      await phone.page.getByRole("list", { name: "Stock counts" }).waitFor();
      s.check("money never wraps on the cards", await moneyOnOneLine(phone.page), []);
      await s.shot(phone.page, "history-390");
    });

    await scenario("33", "u9-phone-tabs-are-whole", async (s) => {
      const { page } = s.track(await open("doctor", { width: 390, height: 844 }));
      await goto(page);
      const tabs = await page.getByRole("tab").evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { text: el.innerText.replace(/\s+/g, " ").trim(), whole: el.scrollWidth <= el.clientWidth + 1 && r.left >= 0 && r.right <= window.innerWidth }; }));
      s.check("four tabs, every label whole, badges beside them", tabs.map((t) => [t.text.replace(/ \d+$/, " n"), t.whole]), [["My counts n", true], ["Approvals n", true], ["History", true], ["Settings", true]]);
      await s.shot(page, "tabs-390");
    });

    await scenario("34", "u10-u11-phone-sheet-keeps-the-split-and-notes-on-demand", async (s) => {
      const names = ["Fluconazole 150mg Tab", "Calamine Lotion 100ml"];
      const created = await onDemand("pharmacist", names);
      const { page } = s.track(await open("pharmacist", { width: 390, height: 844 }));
      await goto(page, `${COUNTS}&document=${created.id}`);
      await counted(page).first().waitFor({ timeout: 240000 });
      s.check("notes stay behind + Note until a row differs", [await page.getByRole("button", { name: /^Note for/ }).count(), await page.getByRole("textbox", { name: /^Note for/ }).count()], [2, 0]);
      const stock = await stockOf(names[0]);
      await counted(page).first().fill(String(stock - 1));
      s.check("Saving… waits for the request", clean(await page.locator('[role="status"][aria-live="polite"]').first().innerText()), "Saved");
      s.check("a differing row opens its note", await page.getByRole("textbox", { name: `Note for ${names[0]}` }).count(), 1);
      const described = await counted(page).first().evaluate((el) => el.getAttribute("aria-describedby").split(" ").map((id) => document.getElementById(id)?.innerText.replace(/\s+/g, " ").trim()));
      s.check("the field describes its live difference", described, [`−1 fewer than the system ${signed(-unitCost(names[0]))}`]);
      s.check("the phone footer keeps the split", clean(await page.getByText(/^Short −1/).innerText()), `Short −1 (${signed(-unitCost(names[0]))})`);
      s.check("the footer says 1 differs", clean(await page.getByText(/of 2 counted/).innerText()), "1 of 2 counted · 1 differs");
      await page.getByRole("button", { name: `Note for ${names[1]}` }).click();
      s.check("+ Note opens a note on a matching row", await page.getByRole("textbox", { name: `Note for ${names[1]}` }).count(), 1);
      await page.evaluate(() => document.querySelector('[aria-label="Batches to count"]').scrollIntoView({ block: "start" }));
      await s.shot(page, "count-sheet-390");
      const scroll = await pageScroll(page);
      s.ok("no sideways scroll", scroll.scroll <= scroll.width, scroll);
    });

    await scenario("35", "u12-today-opens-the-one-due-count-and-next-count-follows", async (s) => {
      for (const [n, name] of ["Sunscreen SPF 50 Gel", "Sunscreen SPF 30 Lotion"].entries())
        await stack.db.inventoryItem.create({
          data: { branchId, name, type: "MEDICINE", costPrice: 120, sellingPrice: 250, unit: "TUBES", currentStock: 6 + n, batchNumber: `U${n + 1}`, expiryDate: new Date("2027-12-31T00:00:00Z"), stockStatus: "IN_STOCK", storageLocation: "Rack U-01", status: "ACTIVE" },
        });
      const now = await call("admin", "GET", "/inventory/workspace/reconciliation");
      await call("admin", "PATCH", "/inventory/workspace/settings", { version: now.settingsVersion, reconciliation: { enabled: true, cycleDays: 10, itemsPerPersonPerDay: 2, assigneeIds: [U.admin.id] } });
      const { page } = s.track(await open("admin", { width: 1280, height: 800 }));
      await goto(page, "/dashboard/inventory");
      const card = page.getByRole("button", { name: /Stock count due today/ });
      await card.waitFor({ timeout: 240000 });
      s.check("the detail line is on screen, not only in a tooltip", clean(await card.innerText()), "2 Stock count due today Open your count and sign off when every batch is counted.");
      await card.click();
      await counted(page).first().waitFor({ timeout: 240000 });
      s.check("the card opens the count itself", await page.getByRole("heading", { name: `Stock count ${ddmmyyyy(today)} · Asha Rao` }).count(), 1);
      const next = await onDemand("admin", ["Clobetasol Cream 15g"]);
      for (const [index, line] of (await counted(page).evaluateAll((els) => els.map((el) => el.id))).entries()) {
        const name = await page.locator(`#${line}`).evaluate((el) => el.closest('[role="listitem"]').querySelector(".font-semibold").textContent);
        await counted(page).nth(index).fill(String((await stack.db.inventoryItem.findFirst({ where: { branchId, name } })).currentStock));
      }
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: "Sign off count" }).click();
      const sign = page.getByRole("dialog", { name: "Sign off this count" });
      await armed(page);
      await sign.getByRole("button", { name: "Sign off", exact: true }).click();
      await page.getByText("Every batch matched the system, so stock was confirmed without a change.").waitFor();
      const go = page.getByRole("button", { name: /^Next count/ });
      s.check("the locked record offers the next count", await go.count(), 1);
      await s.shot(page, "next-count-1280");
      await go.click();
      await counted(page).first().waitFor({ timeout: 240000 });
      s.check("Next count opens it", new URL(page.url()).searchParams.get("document"), next.id);
    });

    await scenario("36", "u13-stock-counts-hidden-without-access", async (s) => {
      const { page } = s.track(await open("reception"));
      await page.goto(`${stack.base}/dashboard/inventory?area=stock&view=list`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.getByRole("navigation", { name: "stock tasks" }).or(page.getByText(/access|permission/i).first()).first().waitFor({ timeout: 240000 });
      s.check("no Stock counts task in the menu", await page.getByRole("navigation", { name: "stock tasks" }).getByRole("button", { name: "Stock counts" }).count(), 0);
      s.check("no Stock counts option in the phone task list", await page.locator('select[aria-label="Inventory task"] option', { hasText: "Stock counts" }).count(), 0);
      await page.goto(`${stack.base}${COUNTS}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.getByText("You don’t have access to stock counts.").waitFor({ timeout: 240000 });
      s.ok("a direct link still explains", true);
    });

    await scenario("37", "u15-a-restart-warns-how-many-batches-are-counted-again", async (s) => {
      const summary = await call("admin", "GET", "/inventory/workspace/reconciliation");
      const { page } = s.track(await open("admin", { width: 1280, height: 800 }));
      await goto(page, `${COUNTS}&tab=settings`);
      await page.getByText("Current cycle").waitFor();
      s.check("the per-person hint", clean(await page.getByText(/^Each person counts at most/).innerText()), "Each person counts at most this many a day.");
      await page.getByLabel("Items per person per day").fill("3");
      s.check("changing items per day keeps the cycle", await page.getByText(/^Saving starts a new cycle/).count(), 0);
      await page.getByLabel("Cycle length (days)").fill("14");
      s.ok("something was counted this cycle", summary.forecast.covered > 0, summary.forecast);
      const warning = page.getByText(/^Saving starts a new cycle today/);
      s.check("the warning gives the number", clean(await warning.innerText()), `Saving starts a new cycle today. The ${summary.forecast.covered} batches counted in this cycle will be counted again. Counts not yet signed or approved stay with the people counting them.`);
      s.ok("in warning colours", (await warning.getAttribute("class")).includes("warning"));
      await warning.scrollIntoViewIfNeeded();
      await s.shot(page, "settings-restart-1280");
      await page.getByRole("button", { name: "Undo changes" }).click();
      const after = await call("admin", "GET", "/inventory/workspace/reconciliation");
      await call("admin", "PATCH", "/inventory/workspace/settings", { version: after.settingsVersion, reconciliation: { itemsPerPersonPerDay: 3 } });
      const kept = await call("admin", "GET", "/inventory/workspace/reconciliation");
      s.check("a save that keeps the cycle length keeps the cycle and its coverage", [kept.cycle.start, kept.forecast.covered], [summary.cycle.start, summary.forecast.covered]);
      await call("admin", "PATCH", "/inventory/workspace/settings", { version: kept.settingsVersion, reconciliation: { enabled: false } });
    });

    const end = await call("admin", "GET", "/inventory/workspace/reconciliation");
    console.log(`END forecast ${JSON.stringify(end.forecast)}`);
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
  console.error("CR31 HARNESS ERROR", e);
  process.exit(2);
});
