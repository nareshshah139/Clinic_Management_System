const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");
const { seed, api, tokenFor, browserLogin, ddmmyyyy } = require("./cr31-seed.cjs");

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
      s.check("forecast updates as people are chosen", clean(await page.locator('form [role="status"]').innerText()), "At 4 per person per day with 1 person, a 10-day cycle covers all 20 batches in stock.");
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
      const card = page.getByRole("button", { name: /Stock count due today · 4 items/ });
      await card.waitFor({ timeout: 240000 });
      s.check("no approval card for a pharmacist", await page.getByRole("button", { name: /Counts awaiting your approval/ }).count(), 0);
      s.check("no behind card when the cycle covers everything", await page.getByRole("button", { name: /Reconciliation behind/ }).count(), 0);
      await card.click();
      await page.getByRole("list", { name: "Counts assigned to you" }).waitFor();
      s.check("opens My counts", clean(await page.getByRole("list", { name: "Counts assigned to you" }).innerText()), `Stock count ${ddmmyyyy(today)} · Anil Deshmukh Due today 4 items · 0 counted · 4 left Start counting`);
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
      s.check("Enter on the last field moves to Sign off", await page.evaluate(() => document.activeElement?.textContent?.trim()), "Sign off count");
      s.check("progress", clean(await page.getByText(/of 4 counted/).innerText()), "4 of 4 counted · 1 differ");
      const fits = await tableFits(page, '[aria-label="Batches to count"]');
      s.ok("every column visible at 1280", fits.fits, fits);
      s.check("money never wraps", await moneyOnOneLine(page), []);
      await s.shot(page, "count-sheet-1280");
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Sign off this count" });
      await dialog.waitFor();
      s.check("summary of what is signed", clean(await dialog.locator("p").first().innerText()), `4 items, 1 differ: net −2 units, ${signed(-2 * unitCost(ANIL[1]))}.`);
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
      const net = -2 * unitCost(ANIL[1]) + 1 * unitCost(KAVYA[0]) - 1 * unitCost(KAVYA[1]);
      const card = page.getByRole("button", { name: new RegExp(`Counts awaiting your approval · ${net < 0 ? "-" : ""}${rupees(net).replace(/[.]/g, "\\.")}`) });
      await card.waitFor({ timeout: 240000 });
      s.check("card counts both signed counts", clean(await card.locator("span").first().innerText()), "2");
      await card.click();
      await grid(page, "Counts awaiting approval");
      const rows = await page.locator('table[aria-label="Counts awaiting approval"] tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").trim())));
      s.check("columns", await headsOf(page, "Counts awaiting approval"), ["Date", "Counted by", "Signed at", "Items", "Differences", "Net variance"]);
      s.check("rows show who counted and the net", rows.map((r) => [r[1], r[3], r[4], r[5]]).sort(), [
        ["Anil D.", "4", "1", `−2 units · ${signed(-2 * unitCost(ANIL[1]))}`],
        ["Kavya J.", "4", "2", `0 units · ${signed(unitCost(KAVYA[0]) - unitCost(KAVYA[1]))}`],
      ].sort());
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
      await s.shot(page, "approval-detail-1280");
      await page.getByRole("button", { name: "Approve and adjust stock" }).click();
      const dialog = page.getByRole("dialog", { name: "Approve and adjust stock" });
      await dialog.waitFor();
      const changes = (await dialog.getByRole("list", { name: "Stock changes" }).getByRole("listitem").allInnerTexts()).map(clean);
      s.check("each batch shows now and after", changes, [
        `${KAVYA[0]} · B002 8 now → becomes 9 (+1)`,
        `${KAVYA[1]} · B004 18 now → becomes 17 (−1) It was 20 when counted; stock has moved since.`,
      ]);
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
      const dialog = page.getByRole("dialog", { name: "Count an item now" });
      await dialog.getByLabel("Item or batch").fill("Minoxidil");
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
      s.check("badge", clean(await page.locator('[data-slot="badge"]').first().innerText()), "Posted (no differences)");
    });

    await scenario("14", "capacity-short-forecast-and-behind-card", async (s) => {
      const { page } = s.track(await open("admin"));
      await goto(page, `${COUNTS}&tab=settings`);
      await page.getByLabel("Cycle length (days)").fill("2");
      await page.getByLabel("Items per person per day").fill("1");
      for (const who of ["Kavya Joshi", "Rajesh Iyer"]) await page.getByLabel(new RegExp(`^${who}`)).uncheck();
      const inStock = await stack.db.inventoryItem.count({ where: { branchId, currentStock: { gt: 0 } } });
      const expected = `At 1 per person per day with 1 person, a 2-day cycle covers 2 of ${inStock} batches in stock. Raise items per day to ${Math.ceil(inStock / 2)} or add ${Math.ceil(inStock / 2) - 1} people.`;
      s.check("the forecast says plainly that the cycle falls short", clean(await page.locator('form [role="status"]').innerText()), expected);
      await s.shot(page, "settings-short-1440");
      await page.getByRole("button", { name: "Save settings" }).click();
      await page.getByText("Behind:").waitFor();
      await goto(page, "/dashboard/inventory");
      const card = page.getByRole("button", { name: /Reconciliation behind: \d+ batches not counted this cycle/ });
      await card.waitFor({ timeout: 240000 });
      s.ok("the card carries the forecast", clean(await card.innerText()).includes(expected), clean(await card.innerText()));
      const pharmacist = s.track(await open("pharmacist"));
      await goto(pharmacist.page, "/dashboard/inventory");
      s.check("a counter without settings access sees no behind card", await pharmacist.page.getByRole("button", { name: /Reconciliation behind/ }).count(), 0);
      const now = await call("admin", "GET", "/inventory/workspace/reconciliation");
      await call("admin", "PATCH", "/inventory/workspace/settings", { version: now.settingsVersion, reconciliation: { cycleDays: 10, itemsPerPersonPerDay: 4, assigneeIds: [U.pharmacist.id, U.kavya.id, U.owner.id] } });
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
    });

    await scenario("17", "history-lists-every-count-with-filters", async (s) => {
      const { page } = s.track(await open("doctor", { width: 1280, height: 800 }));
      await goto(page, `${COUNTS}&tab=history`);
      await grid(page, "Stock count history");
      const heads = await headsOf(page, "Stock count history");
      s.check("columns", heads, ["Date", "Assigned to", "Signed by", "Signed at", "Items", "Differences", "Net variance", "Status", "Decided by"]);
      const fits = await tableFits(page, 'table[aria-label="Stock count history"]');
      s.ok("every column visible at 1280", fits.fits, fits);
      s.check("money never wraps", await moneyOnOneLine(page), []);
      const visibleRows = await page.locator('table[aria-label="Stock count history"] tbody tr').evaluateAll((trs) => trs.filter((tr) => tr.getBoundingClientRect().bottom <= window.innerHeight - 60).length);
      s.ok("at least 5 rows visible at 1280 x 800 above the footer", visibleRows >= 5, visibleRows);
      const states = await page.locator('table[aria-label="Stock count history"] tbody tr td:nth-child(8)').allInnerTexts();
      s.ok("states shown", ["Approved", "Rejected", "No differences", "Awaiting approval"].every((label) => states.map(clean).includes(label)), states.map(clean));
      await s.shot(page, "history-1280");
      await page.getByLabel("Status").selectOption("REJECTED");
      await page.waitForTimeout(1200);
      const rejected = await page.locator('table[aria-label="Stock count history"] tbody tr').allInnerTexts();
      s.check("status filter", rejected.map((t) => clean(t).includes("Rejected")), [true]);
      await page.getByRole("button", { name: "Clear all" }).click();
      await page.getByLabel("Search").fill("Permethrin");
      await page.waitForTimeout(1500);
      s.check("search by item", (await page.locator('table[aria-label="Stock count history"] tbody tr').count()), 1);
      s.check("footer totals", clean(await page.locator('[role="status"][aria-live="polite"]').last().innerText()).split(" 1–")[0], `1 count · 1 difference · Net ${signed(-1 * unitCost("Permethrin Cream 5%")).replace("−", "-")}`);
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
      await page.getByText("Current cycle").waitFor();
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
      await page.getByText("Current cycle").waitFor();
      await s.shot(page, "settings-1280");
      const scroll = await pageScroll(page);
      s.ok("no sideways page scroll", scroll.scroll <= scroll.width, scroll);
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
