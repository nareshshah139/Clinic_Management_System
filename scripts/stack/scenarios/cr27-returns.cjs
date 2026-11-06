const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");
const { seed, tokenFor, api, addDays, DISTRIBUTORS } = require("./cr27-seed.cjs");

const root = path.resolve(__dirname, "../../..");
const out = path.join(root, "output/stack/cr27");
const RETURNS = "/dashboard/inventory?area=purchases&view=register&tab=returns";
const PURCHASES = "/dashboard/inventory?area=purchases&view=register";

const fmt = (rupees) => {
  const cents = Math.round(rupees * 100);
  const whole = String(Math.floor(Math.abs(cents) / 100));
  const head = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `₹${head ? `${head},` : ""}${whole.slice(-3)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;
};
const ddmmyyyy = (day) => `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
const clean = (text) => String(text ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const vis = (page) => page.locator('[role="tabpanel"]:visible');

let sink = [];
const watch = (page) => {
  page.on("pageerror", (e) => sink.push({ type: "pageerror", text: e.message.slice(0, 300) }));
  page.on("console", (m) => m.type() === "error" && sink.push({ type: "console", text: m.text().slice(0, 300) }));
};

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "cr27" });
  let browser;
  const results = [];
  try {
    console.log(`BOOT base=${stack.base}`);
    const admin = await stack.db.user.create({
      data: {
        branchId: stack.branch.id, email: "meera.kulkarni@stack.example.invalid", firstName: "Meera", lastName: "Kulkarni", role: "ADMIN",
        password: (await stack.db.user.findUnique({ where: { id: stack.users.owner.id } })).password, permissions: JSON.stringify([]),
      },
    });
    stack.users.admin = { id: admin.id, email: admin.email, password: stack.users.owner.password, role: "ADMIN" };
    const reception = await stack.db.user.findUnique({ where: { id: stack.users.reception.id } });
    const reader = await stack.db.user.create({
      data: {
        branchId: stack.branch.id, email: "kiran.more@stack.example.invalid", firstName: "Kiran", lastName: "More", role: "RECEPTION", password: reception.password,
        permissions: JSON.stringify([...JSON.parse(reception.permissions), "pharmacy:purchase-invoice:read", "pharmacy:purchase-ledger:read"]),
      },
    });
    stack.users.reader = { id: reader.id, email: reader.email, password: stack.users.reception.password, role: "RECEPTION" };

    const data = await seed(stack);
    const { today, returns, bills } = data;
    const FY = { from: today >= `${today.slice(0, 4)}-04-01` ? `${today.slice(0, 4)}-04-01` : `${Number(today.slice(0, 4)) - 1}-04-01` };
    FY.to = `${Number(FY.from.slice(0, 4)) + 1}-03-31`;
    console.log(`SEED today=${today} returns=${Object.keys(returns).length} values=${JSON.stringify(Object.fromEntries(Object.values(returns).map((r) => [r.key, r.value])))}`);
    const tokens = {};
    const as = async (who) => (tokens[who] ??= await tokenFor(stack, who));
    const call = async (who, method, url, body) => api(stack, await as(who), method, url, body);
    const register = (query = {}) =>
      call("pharmacist", "GET", `/pharmacy/purchase-returns-register?${new URLSearchParams({ from: FY.from, to: FY.to, sortBy: "entryAt", sortDir: "desc", page: "1", limit: "50", ...query })}`);
    const raiseExtra = async (key, quantity, who = "pharmacist") => {
      const source = bills["SLV/2026/41"];
      const draft = await call(who, "POST", "/inventory/workspace/documents", {
        kind: "SUPPLIER_RETURN", reference: key, requestKey: crypto.randomUUID(), supplierId: data.suppliers.SLV.id, purchaseInvoiceId: source.id,
        payload: { date: addDays(today, -1), returnReason: "NEAR_EXPIRY", reason: "", lines: [{ inventoryId: data.batches["slv-b"].id, quantity, unitPrice: 100, sourceLineId: source.items[1].id }] },
      });
      return call(who, "POST", `/inventory/workspace/documents/${draft.id}/transition`, { action: "CHALLAN", version: draft.version });
    };

    browser = await chromium.launch();
    const sessions = new Map();
    async function open(role, size = { width: 1440, height: 900 }) {
      const context = await browser.newContext({
        viewport: size, acceptDownloads: true, ...(process.env.STACK_LOCALE && { locale: process.env.STACK_LOCALE }), ...(sessions.has(role) && { storageState: sessions.get(role) }),
      });
      context.on("page", watch);
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      if (!sessions.has(role)) {
        await stack.login(page, role);
        sessions.set(role, await context.storageState());
      }
      return { page, context };
    }

    async function settle(page) {
      await page.waitForTimeout(400);
      await page.waitForFunction(
        () => {
          const panel = [...document.querySelectorAll('[role="tabpanel"]')].find((p) => !p.hidden && p.getClientRects().length);
          if (!panel) return false;
          const busy = panel.querySelector("[aria-busy]");
          const status = panel.querySelector('[role="status"][aria-live="polite"]');
          return busy?.getAttribute("aria-busy") === "false" && (/₹/.test(status?.innerText || "") || Boolean(panel.querySelector('[role="alert"]')) || /access/.test(panel.innerText));
        },
        null,
        { timeout: 120000 },
      );
      await page.waitForTimeout(150);
    }
    const goto = async (page, route = RETURNS) => {
      await page.goto(`${stack.base}${route}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await vis(page).locator("table").first().waitFor({ timeout: 240000 });
      await settle(page);
    };
    const readRows = (page) =>
      vis(page).locator('table[aria-label="Purchase returns"] tbody tr').evaluateAll((trs) =>
        trs.map((tr) => {
          const tds = [...tr.querySelectorAll("td")];
          const norm = (v) => v.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
          if (tds.length < 8) return { empty: norm(tr.innerText) };
          const visible = (el) => {
            const c = el.cloneNode(true);
            c.querySelectorAll(".sr-only").forEach((n) => n.remove());
            return norm(c.textContent);
          };
          const badge = tds[7].querySelector('[data-slot="badge"]');
          const [lead, line] = tds[1].querySelector(".flex-col").children;
          const [refEl, billEl] = line.children;
          return {
            srNo: Number(norm(tds[0].innerText)),
            cn: visible(lead),
            ref: visible(refEl),
            bill: billEl ? visible(billEl).replace(/^· /, "") : null,
            refLine: visible(line),
            cnDate: norm(tds[3].innerText),
            distributor: norm(tds[5].innerText.split("\n")[0]),
            detail: norm(tds[5].innerText.split("\n").slice(1).join(" ")),
            amount: norm(tds[6].innerText.split("\n")[0]),
            badge: badge ? visible(badge) : null,
            status: visible(tds[7]),
            actions: [...tr.querySelectorAll("button[aria-label]")].map((b) => b.getAttribute("aria-label")),
          };
        }),
      );
    const footer = async (page) => {
      const lines = (await vis(page).locator('[role="status"][aria-live="polite"]').first().innerText()).split("\n").map(clean).filter(Boolean);
      return { summary: lines[0], note: lines[1] ?? null };
    };
    const rowOf = (page, ref) => vis(page).locator("tbody tr").filter({ has: page.getByRole("button", { name: new RegExp(`^Open (draft )?(return|credit) ${ref}$`, "i") }) });
    const typeNote = async (dialog, number, day = today) => {
      await dialog.getByLabel("Credit note no.").fill(number);
      await dialog.getByLabel("Credit note date").fill(ddmmyyyy(day));
      await dialog.getByRole("button", { name: "Same as return value" }).click();
    };
    const armed = (page) => page.waitForTimeout(350);
    const toastText = (page) => page.locator("[data-radix-collection-item], li[role='status']").allInnerTexts().then((all) => all.map(clean));

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
      console.log(`${pass ? "PASS" : "FAIL"} ${id} ${name}\n${detail.split("\n").map((l) => `    ${l}`).join("\n")}`);
    }

    const r = (key) => returns[key];

    await scenario("01", "returns-tab-columns-states-footer", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      const hidden = [];
      page.on("request", (q) => /purchase-returns-register/.test(q.url()) && hidden.push(q.url()));
      await goto(page, PURCHASES);
      s.check("Purchase tab first: the hidden Returns panel makes no request", hidden, []);
      await page.getByRole("tab", { name: "Returns" }).click();
      await page.waitForFunction(() => location.search.includes("tab=returns"));
      await settle(page);
      s.check("tabs side by side", await page.getByRole("tablist", { name: "Purchase registers" }).getByRole("tab").allInnerTexts(), ["Purchase", "Returns"]);
      const heads = await vis(page).locator("thead th").evaluateAll((ths) => ths.map((th) => { const c = th.cloneNode(true); c.querySelectorAll(".sr-only").forEach((n) => n.remove()); return c.textContent.replace(/\s+/g, " ").trim(); }));
      s.check("columns mirror the purchase list", heads, ["Sr No", "Credit Note No.", "Entry Date", "Credit Note Date", "Entry By", "Distributor", "Amount", "Status"]);
      const rows = await readRows(page);
      const byRef = Object.fromEntries(rows.map((row) => [row.ref, row]));
      s.check("rows in this financial year (the March return is out of range)", rows.map((row) => row.ref).sort(), ["RET-APX-01", "RET-NVJ-01", "RET-SLV-01", "RET-SLV-02", "RET-SLV-03", "RET-SLV-04", "RET-SLV-05", "RET-SLV-06", "RET-SLV-07"]);
      s.check("states", ["RET-SLV-01", "RET-SLV-02", "RET-SLV-03", "RET-SLV-04", "RET-SLV-05", "RET-SLV-06", "RET-SLV-07"].map((ref) => byRef[ref]?.badge), [
        `Credit note awaited · 23d`, `Credit note awaited · 12d`, "Received", "Adjusted", "Fully used", "Draft", "Cancelled",
      ]);
      s.check("left on received and adjusted credits", [byRef["RET-SLV-03"].status, byRef["RET-SLV-04"].status], ["Received₹336.00 leftSet off", "Adjusted₹124.00 leftSet off"]);
      s.check("awaited amount shows our return value", [byRef["RET-SLV-01"].amount, byRef["RET-SLV-02"].amount], [fmt(r("RET-SLV-01").value), fmt(r("RET-SLV-02").value)]);
      s.check("source bill sits under the return, the reason chip under the distributor", [byRef["RET-SLV-02"].ref, byRef["RET-SLV-02"].bill, byRef["RET-SLV-02"].detail], ["RET-SLV-02", "SLV/2026/41", "Breakage"]);
      s.check("a draft offers Open draft, a cancelled return strikes only its amount", [
        byRef["RET-SLV-06"].cn,
        await rowOf(page, "RET-SLV-07").locator("td").nth(7).locator('[data-slot="badge"]').evaluate((el) => getComputedStyle(el).textDecorationLine),
        await rowOf(page, "RET-SLV-07").locator("td").nth(6).locator(".line-through").count(),
      ], ["Open draft", "none", 1]);
      const f = await footer(page);
      const held = 336 + 124 + 224 + 3360 + 2240 + 1250;
      s.check("footer", f.summary, `Credit held (all dates) ${fmt(held)} · Awaited ${fmt(r("RET-SLV-01").value + r("RET-SLV-02").value)} (2 returns)`);
      s.check("footer note sits behind an info tooltip, one line high", f.note, "1 draft and 1 cancelled not included. Credit held and Awaited cover all dates; Awaited counts our return value until the note arrives.");
      await vis(page).getByRole("button", { name: "About these totals" }).hover();
      s.check("tooltip explains the totals", clean(await page.getByRole("tooltip").innerText()), "1 draft and 1 cancelled not included. Credit held and Awaited cover all dates; Awaited counts our return value until the note arrives.");
      s.check("Record credit note offered on awaited rows only", rows.filter((row) => row.actions.some((a) => /^Record credit note/.test(a))).map((row) => row.ref).sort(), ["RET-SLV-01", "RET-SLV-02"]);
      await s.shot(page, "01-returns-1440");
    });

    await scenario("02", "new-return-from-returns-tab", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page);
      await page.getByRole("button", { name: "New return" }).click();
      await page.getByLabel("Reason for return").waitFor();
      s.ok("New return opens the supplier return form", /view=SUPPLIER_RETURN/.test(page.url()), page.url());
      s.check("reason choices", await page.getByLabel("Reason for return").locator("option").allInnerTexts(), ["Expired", "Near expiry", "Breakage", "Wrong item supplied", "Excess supply", "Other"]);
      s.ok("free text is labelled as an optional note", await page.getByLabel("Note (optional)").isVisible());
      await s.shot(page, "02-new-return-form");
      const doc = await raiseExtra("RET-SLV-08", 2);
      const before = await stack.db.inventoryItem.findUnique({ where: { id: data.batches["slv-b"].id } });
      const movement = await stack.db.stockTransaction.findFirst({ where: { reference: "WF-RET-SLV-08" }, orderBy: { createdAt: "desc" } });
      s.check("a return on challan logs its stock movement with reason and user", [movement?.type, movement?.quantity, movement?.reason, movement?.userId], ["RETURN", 2, "Near expiry", stack.users.pharmacist.id]);
      s.note(`slv-b stock after the challan: ${before.currentStock}`);
      await goto(page);
      s.check("the new return waits for its credit note", (await readRows(page)).find((row) => row.ref === "RET-SLV-08")?.badge, "Credit note awaited · 1d");
      returns["RET-SLV-08"] = { id: doc.id, key: "RET-SLV-08", value: Number(doc.totalAmount), version: doc.version };
    });

    await scenario("03", "record-credit-note-from-register-then-set-off-now", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page);
      const stockBefore = (await stack.db.inventoryItem.findUnique({ where: { id: data.batches["slv-b"].id } })).currentStock;
      await rowOf(page, "RET-SLV-02").getByRole("button", { name: /^Record credit note/ }).click();
      const dialog = page.getByRole("dialog", { name: `Record credit note from ${DISTRIBUTORS.SLV.name}` });
      s.check("date and amount start empty, to be typed from the note", [await dialog.getByLabel("Credit note date").inputValue(), await dialog.getByLabel("Amount (₹)").inputValue()], ["", ""]);
      s.check("the return value is one tap away", clean(await dialog.locator("p").filter({ hasText: "Same as return value" }).innerText()), `Return value ${fmt(r("RET-SLV-02").value)} Same as return value`);
      s.ok("number field has focus", await dialog.getByLabel("Credit note no.").evaluate((el) => el === document.activeElement));
      await dialog.getByLabel("Credit note no.").fill("slv-cn-310");
      await dialog.getByLabel("Credit note date").fill(ddmmyyyy(addDays(today, -1)));
      await dialog.getByLabel("Amount (₹)").fill("400");
      s.check("less than the return value is explained, not blocked", clean(await dialog.locator("p").filter({ hasText: "less than your return value" }).innerText()), `${fmt(r("RET-SLV-02").value - 400)} less than your return value. Fine if the distributor’s note says so.`);
      await s.shot(page, "03-record-dialog-1440");
      await armed(page);
      await dialog.getByRole("button", { name: "Record credit note" }).click();
      await dialog.waitFor({ state: "detached" });
      await settle(page);
      const row = (await readRows(page)).find((x) => x.ref === "RET-SLV-02");
      s.check("row is received with the note's number, date and amount", [row.cn, row.badge, row.amount], ["SLV-CN-310", "Received", "₹400.00"]);
      s.ok("focus moves to the row's Set off", await page.evaluate(() => document.activeElement?.getAttribute("aria-label")).then((label) => /^Set off credit note SLV-CN-310/.test(label ?? "")));
      s.check("recording the note moves no stock", (await stack.db.inventoryItem.findUnique({ where: { id: data.batches["slv-b"].id } })).currentStock, stockBefore);
      const toast = page.getByRole("button", { name: "Set off ₹400.00 now" });
      s.ok("toast offers Set off now", await toast.isVisible());
      await toast.click();
      const setOff = page.getByRole("dialog", { name: `Set off credit from ${DISTRIBUTORS.SLV.name}` });
      await setOff.getByRole("table").waitFor();
      s.check("set-off names the credit note", clean(await setOff.locator("[id]").filter({ hasText: "available from" }).first().innerText()), "₹400.00 available from credit note SLV-CN-310. Filled from the oldest due date.");
      s.check("set-off columns", await setOff.locator("thead th").allInnerTexts(), ["Bill", "Due date", "To pay", "Set off ₹"]);
      const dues = await setOff.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => { const d = tr.querySelectorAll("td")[0].querySelector("span"); return [d.textContent, d.classList.contains("text-destructive-text")]; }));
      s.ok("overdue due dates are red, the rest are not", dues.length > 0 && dues.every(([text, red]) => red === /overdue/.test(text)) && dues.some(([, red]) => red), dues);
      await s.shot(page, "03-set-off-dialog-1440");
      await page.keyboard.press("Escape");
      await setOff.waitFor({ state: "detached" });
      returns["RET-SLV-02"].cn = { number: "SLV-CN-310", amount: 400 };
    });

    await scenario("04", "duplicate-number-refused-and-focused", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page);
      await rowOf(page, "RET-SLV-01").getByRole("button", { name: /^Record credit note/ }).click();
      const dialog = page.getByRole("dialog");
      await typeNote(dialog, "SLV-CN-301");
      await armed(page);
      await dialog.getByRole("button", { name: "Record credit note" }).click();
      await dialog.getByRole("alert").waitFor();
      s.check("message names the return already holding the number", clean(await dialog.getByRole("alert").innerText()), "Credit note SLV-CN-301 is already recorded for this distributor on return RET-SLV-03. Check the number on the distributor's credit note.");
      s.check("number field marked and focused", [await dialog.getByLabel("Credit note no.").getAttribute("aria-invalid"), await dialog.getByLabel("Credit note no.").evaluate((el) => el === document.activeElement)], ["true", true]);
      s.check("still awaited", (await register()).rows.find((x) => x.returnRef === "RET-SLV-01").state, "AWAITED");
      await page.keyboard.press("Escape");
    });

    await scenario("05", "record-credit-note-on-the-return-document", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page);
      await page.getByRole("button", { name: "Open Return RET-SLV-01" }).click();
      await page.waitForFunction(() => location.search.includes("document="), null, { timeout: 120000 });
      const record = page.getByRole("button", { name: "Record credit note", exact: true });
      await record.waitFor({ timeout: 120000 });
      await record.click();
      const dialog = page.getByRole("dialog", { name: `Record credit note from ${DISTRIBUTORS.SLV.name}` });
      await dialog.getByLabel("Credit note no.").fill("SLV-CN-320");
      await dialog.getByLabel("Credit note date").fill(ddmmyyyy(addDays(today, -30)));
      await armed(page);
      await dialog.getByRole("button", { name: "Record credit note" }).click();
      s.check("a note dated before the return is refused on the date field", clean(await dialog.getByRole("alert").innerText()), `The credit note date cannot be before the return date, ${ddmmyyyy(addDays(today, -23))}.`);
      await dialog.getByLabel("Credit note date").fill(ddmmyyyy(today));
      await dialog.getByRole("button", { name: "Same as return value" }).click();
      await dialog.getByRole("button", { name: "Record credit note" }).click();
      await dialog.waitFor({ state: "detached" });
      await page.getByText("Credit note SLV-CN-320 recorded").waitFor();
      s.ok("the document says what to do next", await page.getByText(`Credit note SLV-CN-320 recorded: ${fmt(r("RET-SLV-01").value)}. Set it off against the distributor’s bills now, or later from Purchase bills › Returns.`).isVisible());
      s.check("the return is posted", (await register()).rows.find((x) => x.returnRef === "RET-SLV-01").state, "RECEIVED");
      s.check("the posted return's date reads dd/mm/yyyy", await page.getByLabel("Date", { exact: true }).inputValue(), ddmmyyyy(addDays(today, -23)));
      await s.shot(page, "05-document-recorded");
      await page.getByRole("button", { name: `Set off ${fmt(r("RET-SLV-01").value)} now` }).click();
      const setOff = page.getByRole("dialog", { name: `Set off credit from ${DISTRIBUTORS.SLV.name}` });
      await setOff.getByRole("table").waitFor();
      await armed(page);
      await setOff.getByRole("button", { name: /^Set off ₹/ }).click();
      await setOff.waitFor({ state: "detached" });
      const notice = page.getByRole("status").filter({ hasText: /^Set off / });
      await notice.waitFor();
      s.ok("the notice says which bill took the credit", /^Set off ₹[\d,.]+ against bill SLV\/2026\/\d+\./.test(clean(await notice.innerText())), clean(await notice.innerText()));
      s.check("the credit is used", (await register()).rows.find((x) => x.returnRef === "RET-SLV-01").state, "USED");
      await s.shot(page, "05-document-set-off");
      await notice.getByRole("button", { name: "Undo" }).click();
      await page.getByText("Set-off undone. The credit is back with the distributor.").waitFor();
      s.check("Undo from the document gives the credit back", (await register()).rows.find((x) => x.returnRef === "RET-SLV-01").state, "RECEIVED");
    });

    await scenario("06", "reversed-return-frees-its-number", async (s) => {
      const doc = await call("pharmacist", "GET", `/inventory/workspace/documents/${r("RET-SLV-03").id}`);
      await call("doctor", "POST", `/inventory/workspace/documents/${doc.id}/transition`, { action: "REVERSE", version: doc.version, reason: "Distributor cancelled this note" });
      const { page } = s.track(await open("pharmacist"));
      await goto(page);
      await rowOf(page, "RET-SLV-08").getByRole("button", { name: /^Record credit note/ }).click();
      const dialog = page.getByRole("dialog");
      await typeNote(dialog, "SLV-CN-301");
      await armed(page);
      await dialog.getByRole("button", { name: "Record credit note" }).click();
      await dialog.waitFor({ state: "detached" });
      await settle(page);
      const rows = await readRows(page);
      s.check("the reversed return shows cancelled and the number is reused", [rows.find((x) => x.ref === "RET-SLV-03").badge, rows.find((x) => x.ref === "RET-SLV-08").cn], ["Cancelled", "SLV-CN-301"]);
    });

    await scenario("07", "correct-a-credit-note", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page);
      await page.getByRole("button", { name: "Correct credit note SLV-CN-310" }).click();
      const dialog = page.getByRole("dialog", { name: "Correct credit note SLV-CN-310" });
      await dialog.getByLabel("Credit note no.").fill("SLV-CN-311");
      await dialog.getByLabel("Amount (₹)").fill("410");
      await armed(page);
      await dialog.getByRole("button", { name: "Save correction" }).click();
      s.check("a reason is required", clean(await dialog.getByRole("alert").innerText()), "Say why the credit note is being corrected, for the record.");
      await dialog.getByLabel("Why correct it?").fill("Misread the amount");
      await dialog.getByRole("button", { name: "Save correction" }).click();
      await dialog.waitFor({ state: "detached" });
      await settle(page);
      const row = (await readRows(page)).find((x) => x.ref === "RET-SLV-02");
      s.check("corrected number and amount", [row.cn, row.amount], ["SLV-CN-311", "₹410.00"]);
      const event = await stack.db.inventoryWorkflowEvent.findFirst({ where: { documentId: r("RET-SLV-02").id, action: "CREDIT_NOTE_CORRECTED" } });
      s.check("correction on record with before and after", [event?.detail.reason, event?.detail.before.number, event?.detail.after.number, event?.detail.after.amount], ["Misread the amount", "SLV-CN-310", "SLV-CN-311", 410]);
      await page.getByRole("button", { name: "Correct credit note SLV-CN-302" }).click();
      const locked = page.getByRole("dialog", { name: "Correct credit note SLV-CN-302" });
      s.check("amount is fixed once part is set off", [await locked.getByLabel("Amount (₹)").getAttribute("readonly"), clean(await locked.locator("p").filter({ hasText: "already set off" }).innerText())], ["", "₹100.00 of this credit is already set off against bills, so its amount stays ₹224.00."]);
      await s.shot(page, "07-correct-dialog");
      await page.keyboard.press("Escape");
    });

    await scenario("08", "set-off-capped-at-what-the-bill-has-left", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page);
      await page.getByRole("button", { name: "Set off credit note APX-CN-12 against bills" }).click();
      const dialog = page.getByRole("dialog", { name: `Set off credit from ${DISTRIBUTORS.APX.name}` });
      const input = dialog.getByLabel(/Set off against bill APX\/2026\/12/);
      await input.waitFor();
      s.check("pre-filled with the bill's whole balance, not the larger credit", await input.inputValue(), "3000");
      s.check("credit left after this", clean(await dialog.getByRole("status").innerText()), "₹360.00 credit left after this");
      await input.fill("3100");
      await armed(page);
      await dialog.getByRole("button", { name: "Set off ₹3,100.00" }).click();
      s.check("more than the bill owes is refused", clean(await dialog.getByRole("alert").innerText()), "Bill APX/2026/12 has only ₹3,000.00 left to pay.");
      const refused = await call("pharmacist", "POST", "/inventory/workspace/credits/set-off", {
        requestKey: crypto.randomUUID(), creditId: (await register()).rows.find((x) => x.returnRef === "RET-APX-01").credit.id, allocations: [{ purchaseInvoiceId: bills["APX/2026/12"].id, amount: 3100 }],
      }).catch((e) => e.status);
      s.check("the server refuses it too", refused, 409);
      await page.keyboard.press("Escape");
    });

    await scenario("09", "mark-paid-offers-set-off-first-when-credit-covers-the-bill", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page, `${PURCHASES}&gstin=${DISTRIBUTORS.APX.gstin}`);
      await page.getByRole("button", { name: "Mark bill APX/2026/12 paid" }).click();
      const pay = page.getByRole("dialog", { name: "Settle bill APX/2026/12 · ₹3,000.00" });
      s.check("credit covers the bill", clean(await pay.locator("p").filter({ hasText: "covers this bill" }).innerText()), `₹3,360.00 credit from ${DISTRIBUTORS.APX.name} covers this bill. Set it off, or record a payment below.`);
      s.ok("Set off is the first choice and has focus", await pay.getByRole("button", { name: "Set off ₹3,000.00 credit" }).evaluate((el) => el === document.activeElement));
      await s.shot(page, "09-mark-paid-covers");
      await armed(page);
      await page.keyboard.press("Enter");
      await pay.waitFor({ state: "detached" });
      s.check("no second dialog", await page.getByRole("dialog").count(), 0);
      await settle(page);
      const cell = vis(page).locator("tbody tr").filter({ hasText: "APX/2026/12" });
      await cell.getByRole("button", { name: "Undo credit set-off for bill APX/2026/12" }).waitFor();
      s.ok("bill shows Paid with an inline Undo", /Paid/.test(await cell.innerText()), await cell.innerText());
      s.ok("toast says where Undo is and offers it", (await toastText(page)).some((t) => t.includes("Undo is in the Payment column for 30 seconds.")), await toastText(page));
      await s.shot(page, "09-mark-paid-set-off-done");
      await cell.getByRole("button", { name: "Undo credit set-off for bill APX/2026/12" }).click();
      await page.getByText("Set-off undone").first().waitFor();
      await settle(page);
      s.ok("Undo restores the bill", /Due/.test(await cell.innerText()), await cell.innerText());
      const ledger = await call("pharmacist", "GET", "/pharmacy/purchase-ledger/distributors");
      const apx = ledger.distributors.find((d) => d.distributorGstin === DISTRIBUTORS.APX.gstin);
      s.check("ledger agrees after undo", [apx.outstanding, apx.creditHeld], [3000, 3360]);
    });

    await scenario("10", "set-off-across-bills-and-undo-from-returns", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page);
      await page.getByRole("button", { name: "Set off credit note NVJ-CN-1 against bills" }).click();
      const dialog = page.getByRole("dialog", { name: `Set off credit from ${DISTRIBUTORS.NVJ.name}` });
      await dialog.getByRole("table").waitFor();
      const box = await dialog.boundingBox();
      const submit = dialog.getByRole("button", { name: /^Set off ₹/ });
      const sbox = await submit.boundingBox();
      s.ok("12 open bills: the dialog fits the window and its submit is on screen", box.y >= 0 && box.y + box.height <= 900 && sbox.y + sbox.height <= 900, { box, sbox });
      const label = await submit.innerText();
      await s.shot(page, "10-set-off-12-bills");
      await armed(page);
      await submit.click();
      await dialog.waitFor({ state: "detached" });
      await settle(page);
      const row = (await readRows(page)).find((x) => x.ref === "RET-NVJ-01");
      s.check("credit fully used", row.badge, "Fully used");
      s.note(`set off ${label}`);
      s.ok("the row offers Undo too", (await rowOf(page, "RET-NVJ-01").getByRole("button", { name: /^Undo set-off/ }).count()) === 1);
      s.ok("toast says Undo is in the Status column", (await toastText(page)).some((t) => t.includes("Undo is in the Status column for 30 seconds.")), await toastText(page));
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await page.getByText("Set-off undone").first().waitFor();
      await settle(page);
      const back = (await readRows(page)).find((x) => x.ref === "RET-NVJ-01");
      s.check("Undo gives the credit back", [back.badge, back.status], ["Received", "Received₹2,240.00 leftSet off"]);
    });

    await scenario("11", "position-strip-and-footer-agree-with-payments-and-dues", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page, `${PURCHASES}&gstin=${DISTRIBUTORS.SLV.gstin}`);
      const strip = page.getByRole("region", { name: `${DISTRIBUTORS.SLV.name} position across all bills` });
      await strip.waitFor();
      const ledger = await call("pharmacist", "GET", "/pharmacy/purchase-ledger/distributors");
      const slv = ledger.distributors.find((d) => d.distributorGstin === DISTRIBUTORS.SLV.gstin);
      const values = await strip.locator("dd").allInnerTexts();
      s.check("strip Due, Credit held and Net match Payments & dues", values.map(clean), [fmt(slv.outstanding), fmt(slv.creditHeld), fmt(Math.abs(slv.netPayable))]);
      const summary = clean(await vis(page).locator('[role="status"][aria-live="polite"]').first().innerText());
      s.ok("footer names its scope: outstanding in these bills, which equals the strip's Due (the older bill is paid)", /Outstanding in these \d+ bills /.test(summary) && summary.endsWith(fmt(slv.outstanding)), summary);
      s.check("strip offers Set off all", await strip.getByRole("button").allInnerTexts(), [`Set off all ${fmt(Math.min(slv.creditHeld, slv.outstanding))}`]);
      await page.getByRole("searchbox").fill("NVJ/2026/0");
      await settle(page);
      await page.waitForTimeout(800);
      s.note("search narrowing checked on the NVJ register below");
      await goto(page, `${PURCHASES}&field=billNo&q=NVJ%2F2026%2F0`);
      s.ok("strip shows when a search narrows to one distributor", await page.getByRole("region", { name: `${DISTRIBUTORS.NVJ.name} position across all bills` }).isVisible());
      await s.shot(page, "11-position-strip-1440");
    });

    await scenario("12", "credit-only-distributor-in-payments-and-dues", async (s) => {
      const ledger = await call("pharmacist", "GET", "/pharmacy/purchase-ledger/distributors");
      const skp = ledger.distributors.find((d) => d.distributorGstin === DISTRIBUTORS.SKP.gstin);
      s.check("listed with its credit and no bills", [skp?.distributorName, skp?.invoiceCount, skp?.creditHeld, skp?.netPayable], [DISTRIBUTORS.SKP.name, 0, 1250, -1250]);
      const { page } = s.track(await open("pharmacist"));
      await page.goto(`${stack.base}/dashboard/inventory?area=purchases&view=ledger`, { waitUntil: "domcontentloaded" });
      const row = page.getByRole("row").filter({ hasText: DISTRIBUTORS.SKP.name });
      await row.first().waitFor({ timeout: 120000 });
      s.ok("row says the credit is in the clinic's favour", /1,250\.00 in your favour/.test(clean(await row.first().innerText())), clean(await row.first().innerText()));
      await row.first().click();
      await page.waitForTimeout(1500);
      s.check("its ledger opens without an error", await page.getByRole("alert").filter({ hasText: /not found/i }).count(), 0);
      await s.shot(page, "12-credit-only-distributor");
    });

    await scenario("13", "excel-export-of-the-credit-note-register", async (s) => {
      const XLSX = createRequire(path.join(root, "backend/package.json"))("xlsx");
      const { page } = s.track(await open("pharmacist"));
      await goto(page, `${RETURNS}&gstin=${DISTRIBUTORS.SLV.gstin}&state=RECEIVED`);
      await page.getByRole("button", { name: "More", exact: true }).click();
      const [download] = await Promise.all([page.waitForEvent("download").catch(() => null), page.waitForEvent("popup").then((p) => p.waitForEvent("download")).catch(() => null), page.getByRole("menuitem", { name: "Export to Excel" }).click()]).then((all) => [all[0] || all[1]]);
      const file = path.join(out, "13-export.xlsx");
      if (download) await download.saveAs(file);
      else {
        const res = await page.request.get(`${stack.base}/api/pharmacy/purchase-returns-register?format=xlsx&from=${FY.from}&to=${FY.to}&state=RECEIVED&distributorGstin=${DISTRIBUTORS.SLV.gstin}&sortBy=entryAt&sortDir=desc&page=1&limit=50`);
        fs.writeFileSync(file, await res.body());
        s.note("export opened in a new tab; fetched the same URL to read the file");
      }
      const sheet = XLSX.utils.sheet_to_json(XLSX.readFile(file).Sheets["Purchase returns"]);
      const expected = (await register({ distributorGstin: DISTRIBUTORS.SLV.gstin, state: "RECEIVED" })).rows;
      s.check("one row per filtered credit note", sheet.map((x) => [x["Credit Note No."], x["Status"], x["Credit Note Amount"]]), expected.map((x) => [x.creditNote.number, "Received", x.creditNote.amount]));
    });

    await scenario("14", "tab-switch-keeps-distributor-and-period", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      const from = addDays(today, -30);
      await goto(page, `${PURCHASES}&gstin=${DISTRIBUTORS.SLV.gstin}&from=${from}&to=${today}`);
      await page.getByRole("tab", { name: "Returns" }).click();
      await page.waitForFunction(() => location.search.includes("tab=returns"));
      await settle(page);
      const url = new URL(page.url());
      s.check("distributor and period carried", [url.searchParams.get("gstin"), url.searchParams.get("from"), url.searchParams.get("to")], [DISTRIBUTORS.SLV.gstin, from, today]);
      const rows = await readRows(page);
      s.ok("only that distributor's returns", rows.length > 0 && rows.every((x) => x.distributor === DISTRIBUTORS.SLV.name), rows.map((x) => x.distributor));
      s.ok("date chip shows the carried period", /Change dates/.test(await page.getByRole("button", { name: /^Change dates/ }).getAttribute("aria-label")));
      await page.getByRole("tab", { name: "Purchase" }).click();
      await page.waitForFunction(() => !location.search.includes("tab=returns"));
      await settle(page);
      s.check("and back again", new URL(page.url()).searchParams.get("gstin"), DISTRIBUTORS.SLV.gstin);
    });

    await scenario("15", "today-card-counts-awaited-credit-notes", async (s) => {
      await raiseExtra("RET-SLV-11", 1);
      const awaited = (await call("pharmacist", "GET", `/pharmacy/purchase-returns-register?from=2000-01-01&to=2000-12-31&sortBy=srNo&sortDir=asc&page=1&limit=1`)).totals.awaited.count;
      const { page } = s.track(await open("pharmacist"));
      await page.goto(`${stack.base}/dashboard/inventory?area=today`, { waitUntil: "domcontentloaded" });
      const card = page.getByRole("button", { name: /Credit notes awaited/ });
      await card.waitFor({ timeout: 120000 });
      s.check("count matches the register's awaited total", clean(await card.innerText()).split(" ")[0], String(awaited));
      s.check("card says what to do", await card.getAttribute("title"), "Record the distributor’s credit note when it arrives.");
      await card.click();
      await page.waitForFunction(() => location.search.includes("tab=returns"));
      await settle(page);
      const rows = await readRows(page);
      s.check("opens Returns filtered to awaited", [new URL(page.url()).searchParams.get("state"), rows.length === awaited, rows.every((x) => /^Credit note awaited/.test(x.badge ?? ""))], ["AWAITED", true, true]);
    });

    await scenario("16", "density-1280-and-1440", async (s) => {
      await raiseExtra("RET-SLV-12", 1);
      for (const [w, h] of [[1280, 800], [1440, 900]]) {
        const { page } = s.track(await open("pharmacist", { width: w, height: h }));
        await goto(page);
        const m = await page.evaluate(() => {
          const panel = [...document.querySelectorAll('[role="tabpanel"]')].find((p) => !p.hidden && p.getClientRects().length);
          const rows = [...panel.querySelectorAll("tbody tr")];
          const head = panel.querySelector("thead").getBoundingClientRect().bottom;
          const foot = panel.querySelector('[role="status"][aria-live="polite"]').parentElement.getBoundingClientRect().top;
          const fully = rows.filter((tr) => { const b = tr.getBoundingClientRect(); return b.top >= head - 1 && b.bottom <= Math.min(foot, window.innerHeight) + 1; }).length;
          const chips = [...panel.querySelectorAll("tbody td:nth-child(6) [data-slot=badge]")].map((c) => c.scrollWidth <= c.clientWidth + 1 || c.scrollWidth - c.clientWidth);
          const widths = [...panel.querySelectorAll("thead th")].map((th) => Math.round(th.getBoundingClientRect().width));
          const bills = rows.map((tr) => tr.querySelector("td:nth-child(2) .flex-col > span:last-child")).filter(Boolean).map((el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= el.closest("td").getBoundingClientRect().right + 1);
          const names = rows.map((tr) => tr.querySelector("td:nth-child(6) [title]")).filter(Boolean).map((el) => ({ full: el.title.split(" · GSTIN")[0] === el.textContent, cut: el.scrollWidth > el.clientWidth + 1 }));
          const scroller = panel.querySelector("table").parentElement;
          return {
            fully, head: Math.round(head), foot: Math.round(foot), rowHeights: rows.slice(0, 6).map((tr) => Math.round(tr.getBoundingClientRect().height)), chips, widths, bills, names,
            overflow: scroller.scrollWidth - scroller.clientWidth, docOverflow: document.documentElement.scrollWidth - window.innerWidth,
          };
        });
        s.ok(`${w}: at least 5 rows fully visible, with an awaited return at the top`, m.fully >= 5 && (await readRows(page))[0].badge?.startsWith("Credit note awaited"), m);
        s.ok(`${w}: reason chips are not cut`, m.chips.every((c) => c === true), m.chips);
        s.ok(`${w}: return and source bill numbers are never cut`, m.bills.length > 5 && m.bills.every(Boolean), m.bills);
        s.ok(`${w}: distributor names carry their full name on hover`, m.names.every((n) => n.full), m.names);
        if (w === 1280) s.ok("1280: the long distributor name is what truncates", m.names.some((n) => n.cut), m.names);
        s.check(`${w}: table fits without sideways scroll`, [m.overflow <= 1, m.docOverflow <= 0], [true, true]);
        s.note(`${w}: ${JSON.stringify(m)}`);
        await s.shot(page, `16-returns-${w}`);
        await rowOf(page, "RET-SLV-04").getByRole("button", { name: /^Set off/ }).click();
        await page.getByRole("dialog").getByRole("table").waitFor();
        await s.shot(page, `16-set-off-dialog-${w}`);
        await page.keyboard.press("Escape");
        const awaitedRow = (await readRows(page)).find((x) => x.actions.some((a) => /^Record credit note/.test(a)));
        if (awaitedRow) {
          await rowOf(page, awaitedRow.ref).getByRole("button", { name: /^Record credit note/ }).click();
          await s.shot(page, `16-record-dialog-${w}`);
          await page.keyboard.press("Escape");
        }
      }
    });

    await scenario("17", "phone-390", async (s) => {
      const { page } = s.track(await open("pharmacist", { width: 390, height: 844 }));
      await page.goto(`${stack.base}${RETURNS}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      const list = vis(page).getByRole("list", { name: "Purchase returns" });
      await list.waitFor({ timeout: 240000 });
      await settle(page);
      s.check("a card list, not a table", await vis(page).locator('table[aria-label="Purchase returns"]').count(), 0);
      const m = await page.evaluate(() => {
        const panel = [...document.querySelectorAll('[role="tabpanel"]')].find((p) => !p.hidden && p.getClientRects().length);
        const cards = [...panel.querySelectorAll('ul[aria-label="Purchase returns"] > li')];
        const inside = (el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; };
        const more = [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("More") && b.getClientRects().length);
        const status = panel.querySelector('[role="status"][aria-live="polite"]');
        const shown = (el) => { const c = el.cloneNode(true); c.querySelectorAll(".sr-only").forEach((n) => n.remove()); return c.textContent.replace(/\s+/g, " ").trim(); };
        const lines = cards.slice(0, 6).map((li) => [...li.firstElementChild.children].map(shown));
        const money = [...panel.querySelectorAll("li .whitespace-nowrap.font-semibold")].map((el) => el.getClientRects().length === 1);
        return {
          docOverflow: document.documentElement.scrollWidth - window.innerWidth,
          more: more && inside(more),
          everythingInside: cards.every((li) => [...li.querySelectorAll("button, [data-slot=badge]")].every(inside)),
          lineCounts: cards.map((li) => li.firstElementChild.children.length),
          lines,
          money: money.every(Boolean),
          footer: status && status.scrollWidth <= status.clientWidth + 1,
        };
      });
      s.check("no page overflow, More and every card control inside the screen, three lines a card, money on one line, footer not cut", [m.docOverflow <= 0, m.more, m.everythingInside, m.lineCounts.every((n) => n === 3), m.money, m.footer], [true, true, true, true, true, true]);
      s.note(`first cards: ${JSON.stringify(m.lines.slice(0, 3))}`);
      const awaitedCard = m.lines.find((l) => /^Record credit note/.test(l[1]));
      s.ok("an awaited card: distributor and amount, Record credit note with the return and bill, then the badge", awaitedCard && /₹/.test(awaitedCard[0]) && /RET-SLV-\d+ ?· SLV\/2026\/\d+/.test(awaitedCard[1]) && /^Credit note awaited/.test(awaitedCard[2]), m.lines);
      await s.shot(page, "17-returns-390");
      await list.getByRole("button", { name: /^Set off credit note/ }).first().click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("table").waitFor();
      const sheet = await dialog.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const heads = [...el.querySelectorAll("thead th")].filter((th) => th.getClientRects().length);
        const inputs = [...el.querySelectorAll("tbody input")].map((i) => i.getBoundingClientRect().right);
        return {
          heads: heads.map((th) => th.textContent),
          clipped: heads.filter((th) => th.scrollWidth > th.clientWidth + 1 || th.getBoundingClientRect().right > box.right).map((th) => th.textContent),
          gutter: Math.round(box.right - Math.max(...inputs)),
          dueUnderBill: [...el.querySelectorAll("tbody th")].every((th) => /Due /.test(th.innerText)),
          box: { x: box.x, w: box.width },
        };
      });
      s.check("390 sheet: no Due date column, due date under the bill, nothing clipped, a gutter after the inputs", [sheet.heads, sheet.dueUnderBill, sheet.clipped, sheet.gutter >= 12], [["Bill", "To pay", "Set off ₹"], true, [], true]);
      const submit = await dialog.getByRole("button", { name: /^Set off ₹/ }).boundingBox();
      s.ok("390: set-off sheet fits and its submit is on screen", sheet.box.x >= 0 && sheet.box.x + sheet.box.w <= 391 && submit.y + submit.height <= 844, sheet);
      await s.shot(page, "17-set-off-390");
      await page.keyboard.press("Escape");
      const doc = await raiseExtra("RET-SLV-09", 1);
      returns["RET-SLV-09"] = { id: doc.id, key: "RET-SLV-09", value: Number(doc.totalAmount) };
      await page.reload({ waitUntil: "domcontentloaded" });
      await list.waitFor();
      await settle(page);
      await list.getByRole("button", { name: "Record credit note for return RET-SLV-09" }).click();
      const record = page.getByRole("dialog");
      await record.getByLabel("Credit note no.").waitFor();
      const rbox = await record.boundingBox();
      s.ok("390: record sheet fits", rbox.x >= 0 && rbox.x + rbox.width <= 391 && rbox.y + rbox.height <= 845, rbox);
      await s.shot(page, "17-record-390");
      await page.keyboard.press("Escape");
      await goto(page, `${PURCHASES}&gstin=${DISTRIBUTORS.SLV.gstin}`);
      const strip = page.getByRole("region", { name: `${DISTRIBUTORS.SLV.name} position across all bills` });
      await strip.waitFor();
      const st = await strip.evaluate((el) => ({
        lines: new Set([...el.querySelectorAll("dt")].map((d) => Math.round(d.getBoundingClientRect().top))).size,
        money: [...el.querySelectorAll("dd")].every((d) => d.getClientRects().length === 1 && d.getBoundingClientRect().height < 30),
        button: (() => { const b = el.querySelector("button"); return b ? Math.round(el.getBoundingClientRect().width - b.getBoundingClientRect().width) : null; })(),
      }));
      s.check("390: strip stacks Due, Credit held and Net, money on one line, Set off all full width", [st.lines, st.money, st.button !== null && st.button <= 26], [3, true, true]);
      const foot = await vis(page).locator('[role="status"][aria-live="polite"]').first().evaluate((el) => ({ text: el.firstElementChild.innerText.replace(/\s+/g, " ").trim(), cut: el.firstElementChild.scrollHeight > el.firstElementChild.clientHeight + 1 }));
      s.ok("390: purchase footer wraps in full, no ellipsis", !foot.cut && /Outstanding in these \d+ bills ₹[\d,]+\.\d\d$/.test(foot.text), foot);
      await s.shot(page, "17-strip-390");
      await vis(page).getByRole("button", { name: /^Mark bill .* paid$/ }).first().click();
      await page.getByRole("dialog").waitFor();
      await s.shot(page, "17-mark-paid-390");
      await page.keyboard.press("Escape");
    });

    await scenario("18", "keyboard-only-record-and-set-off", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page);
      const button = rowOf(page, "RET-SLV-09").getByRole("button", { name: /^Record credit note/ });
      await button.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await page.keyboard.type("SLV-CN-330");
      await page.keyboard.press("Tab");
      await page.keyboard.type(ddmmyyyy(today));
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      s.check("Same as return value fills the amount and returns focus to it", await page.evaluate(() => [document.activeElement?.getAttribute("inputmode"), document.activeElement?.value]), ["decimal", String(r("RET-SLV-09").value)]);
      await page.waitForTimeout(350);
      await page.keyboard.press("Enter");
      await dialog.waitFor({ state: "detached" });
      await settle(page);
      const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
      s.check("after recording, focus is on that row's Set off", focused, "Set off credit note SLV-CN-330 against bills");
      await page.keyboard.press("Enter");
      const setOff = page.getByRole("dialog");
      await setOff.getByRole("table").waitFor();
      await page.waitForTimeout(350);
      await page.keyboard.press("Enter");
      await setOff.waitFor({ state: "detached" });
      await settle(page);
      s.check("set off by keyboard alone", (await readRows(page)).find((x) => x.ref === "RET-SLV-09").badge, "Fully used");
      await page.keyboard.press("Escape");
    });

    await scenario("19", "double-click-records-once", async (s) => {
      const doc = await raiseExtra("RET-SLV-10", 1);
      const { page } = s.track(await open("pharmacist"));
      await goto(page);
      await rowOf(page, "RET-SLV-10").getByRole("button", { name: /^Record credit note/ }).click();
      const dialog = page.getByRole("dialog");
      await typeNote(dialog, "SLV-CN-340");
      await armed(page);
      await dialog.getByRole("button", { name: "Record credit note" }).dblclick();
      await dialog.waitFor({ state: "detached" });
      await settle(page);
      const events = await stack.db.inventoryWorkflowEvent.count({ where: { documentId: doc.id, action: "CREDIT_NOTE" } });
      const credits = await stack.db.inventorySupplierCredit.count({ where: { documentId: doc.id } });
      s.check("one credit note event and one credit", [events, credits], [1, 1]);
      await rowOf(page, "RET-SLV-10").getByRole("button", { name: /^Set off/ }).click();
      const setOff = page.getByRole("dialog");
      await setOff.getByRole("table").waitFor();
      await armed(page);
      await setOff.getByRole("button", { name: /^Set off ₹/ }).dblclick();
      await setOff.waitFor({ state: "detached" });
      const credit = await stack.db.inventorySupplierCredit.findUnique({ where: { documentId: doc.id } });
      const sets = await stack.db.inventoryCreditAllocation.count({ where: { creditId: credit.id } });
      s.check("one set-off", sets, 1);
    });

    await scenario("20", "reception-sees-no-write-controls", async (s) => {
      const { page } = s.track(await open("reader"));
      await goto(page);
      const rows = await readRows(page);
      s.ok("reads the register", rows.length > 5, rows.length);
      s.check("no Record, Set off or Correct", await vis(page).locator('tbody button[aria-label^="Record credit note"], tbody button[aria-label^="Set off"], tbody button[aria-label^="Correct credit note"]').count(), 0);
      const plain = s.track(await open("reception"));
      await plain.page.goto(`${stack.base}${RETURNS}`, { waitUntil: "domcontentloaded" });
      await plain.page.getByText("You don’t have access to purchase returns.").waitFor({ timeout: 120000 });
      s.ok("reception without purchase permission gets the access message", true);
    });

    await scenario("21", "doctor-and-admin-record-and-set-off", async (s) => {
      for (const who of ["doctor", "admin"]) {
        const key = `RET-${who.toUpperCase()}`;
        await raiseExtra(key, 1, who);
        const { page } = s.track(await open(who));
        await goto(page);
        await rowOf(page, key).getByRole("button", { name: /^Record credit note/ }).click();
        const dialog = page.getByRole("dialog");
        await typeNote(dialog, `CN-${who.toUpperCase()}`);
        await armed(page);
        await dialog.getByRole("button", { name: "Record credit note" }).click();
        await dialog.waitFor({ state: "detached" });
        await settle(page);
        await rowOf(page, key).getByRole("button", { name: /^Set off/ }).click();
        const setOff = page.getByRole("dialog");
        await setOff.getByRole("table").waitFor();
        await armed(page);
        await setOff.getByRole("button", { name: /^Set off ₹/ }).click();
        await setOff.waitFor({ state: "detached" });
        await settle(page);
        s.check(`${who}: recorded and set off`, (await readRows(page)).find((x) => x.ref === key).badge, "Fully used");
        await goto(page, PURCHASES);
        s.ok(`${who}: Mark paid offered`, (await vis(page).locator('button[aria-label^="Mark bill"]').count()) > 0);
      }
    });

    await scenario("22", "hidden-panels-stay-quiet", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page);
      const calls = { returns: 0, purchases: 0 };
      page.on("request", (q) => {
        if (/purchase-returns-register/.test(q.url())) calls.returns++;
        else if (/purchase-register\?/.test(q.url())) calls.purchases++;
      });
      await page.getByRole("tab", { name: "Purchase" }).click();
      await page.waitForFunction(() => !location.search.includes("tab=returns"));
      await settle(page);
      const before = calls.returns;
      await vis(page).getByRole("searchbox").fill("SLV");
      await page.waitForTimeout(1200);
      await settle(page);
      s.check("typing on Purchase sends no Returns request", calls.returns - before, 0);
      s.ok("Purchase did fetch", calls.purchases > 0, calls);
    });

    await scenario("23", "returns-strip-sets-off-all-of-a-distributors-credit", async (s) => {
      const { page } = s.track(await open("pharmacist", { width: 1280, height: 800 }));
      await goto(page, `${RETURNS}&gstin=${DISTRIBUTORS.APX.gstin}`);
      const strip = page.getByRole("region", { name: `${DISTRIBUTORS.APX.name} position across all bills` });
      await strip.waitFor();
      const before = (await call("pharmacist", "GET", "/pharmacy/purchase-ledger/distributors")).distributors.find((d) => d.distributorGstin === DISTRIBUTORS.APX.gstin);
      const button = strip.getByRole("button", { name: /^Set off all / });
      s.check("strip on Returns offers Set off all", await button.innerText(), `Set off all ${fmt(Math.min(before.creditHeld, before.outstanding))}`);
      await s.shot(page, "23-returns-strip-1280");
      await button.click();
      const dialog = page.getByRole("dialog", { name: `Set off credit from ${DISTRIBUTORS.APX.name}` });
      await dialog.getByRole("table").waitFor();
      await armed(page);
      await dialog.getByRole("button", { name: /^Set off ₹/ }).click();
      await dialog.waitFor({ state: "detached" });
      await settle(page);
      const after = (await call("pharmacist", "GET", "/pharmacy/purchase-ledger/distributors")).distributors.find((d) => d.distributorGstin === DISTRIBUTORS.APX.gstin);
      s.check("the distributor's due and credit both fall by the set-off", [before.outstanding - after.outstanding, before.creditHeld - after.creditHeld], [Math.min(before.creditHeld, before.outstanding), Math.min(before.creditHeld, before.outstanding)]);
      s.check("strip updates without a reload", clean(await strip.locator("dd").first().innerText()), fmt(after.outstanding));
      s.ok("the credit's row offers Undo", (await rowOf(page, "RET-APX-01").getByRole("button", { name: /^Undo set-off/ }).count()) === 1);
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await page.getByText("Set-off undone").first().waitFor();
      await settle(page);
      const undone = (await call("pharmacist", "GET", "/pharmacy/purchase-ledger/distributors")).distributors.find((d) => d.distributorGstin === DISTRIBUTORS.APX.gstin);
      s.check("Undo from the toast restores the position", [undone.outstanding, undone.creditHeld], [before.outstanding, before.creditHeld]);
    });

    await scenario("24", "awaited-empty-state-drafts-and-a-stale-entry-kept", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page, `${RETURNS}&gstin=${DISTRIBUTORS.NVJ.gstin}&state=AWAITED`);
      s.ok("no awaited notes for this distributor says so", await vis(page).getByText("No credit notes awaited").isVisible());
      await goto(page);
      await rowOf(page, "RET-SLV-06").getByRole("button", { name: "Open draft return RET-SLV-06" }).click();
      await page.waitForFunction(() => location.search.includes("document="), null, { timeout: 120000 });
      await page.getByRole("heading", { name: "RET-SLV-06" }).waitFor({ timeout: 120000 });
      s.check("Open draft opens that draft", new URL(page.url()).searchParams.get("document"), r("RET-SLV-06").id);
      const doc = await raiseExtra("RET-SLV-13", 1);
      await goto(page);
      await rowOf(page, "RET-SLV-13").getByRole("button", { name: /^Record credit note/ }).click();
      const dialog = page.getByRole("dialog");
      await typeNote(dialog, "slv-cn-399");
      const fresh = await call("pharmacist", "GET", `/inventory/workspace/documents/${doc.id}`);
      await call("pharmacist", "POST", `/inventory/workspace/documents/${doc.id}/transition`, { action: "CANCEL", version: fresh.version });
      await armed(page);
      await dialog.getByRole("button", { name: "Record credit note" }).click();
      await dialog.waitFor({ state: "detached" });
      const toast = page.locator("li").filter({ hasText: "This return changed" });
      await toast.waitFor();
      const said = clean(await toast.innerText());
      s.ok("the conflict toast keeps what was typed", said.includes(`The list now shows its latest status. Your entry was not saved: credit note SLV-CN-399, ${ddmmyyyy(today)}, ${fmt(Number(doc.totalAmount))}.`), said);
      await settle(page);
      s.check("and the row now reads Cancelled", (await readRows(page)).find((x) => x.ref === "RET-SLV-13")?.badge, "Cancelled");
    });

    await scenario("25", "dates-read-dd-mm-yyyy-in-an-en-US-browser", async (s) => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "en-US", timezoneId: "America/New_York", storageState: sessions.get("pharmacist") });
      context.on("page", watch);
      const page = await context.newPage();
      s.track({ page, context });
      s.check("the browser really is en-US", await page.evaluate(() => new Date(Date.UTC(2026, 9, 15, 12)).toLocaleDateString()), "10/15/2026");
      await page.goto(`${stack.base}${RETURNS}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await vis(page).locator("table").first().waitFor({ timeout: 240000 });
      await settle(page);
      const posted = r("RET-APX-01");
      await page.getByRole("button", { name: "Open Return RET-APX-01" }).click();
      await page.waitForFunction(() => location.search.includes("document="), null, { timeout: 120000 });
      const date = page.getByLabel("Date", { exact: true });
      await date.waitFor();
      const shown = await date.inputValue();
      s.ok("the posted return document shows its date as dd/mm/yyyy", /^\d{2}\/\d{2}\/\d{4}$/.test(shown) && shown === ddmmyyyy((await call("pharmacist", "GET", `/inventory/workspace/documents/${posted.id}`)).payload.date), shown);
      await s.shot(page, "25-document-en-US");
      await page.goto(`${stack.base}${RETURNS}`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const rows = await readRows(page);
      s.ok("register dates read as day then month", rows.every((x) => x.cnDate === "—" || /^\d{2} [A-Z][a-z]{2}( \d{4})?$/.test(x.cnDate)), rows.map((x) => x.cnDate));
      await rowOf(page, "RET-SLV-04").getByRole("button", { name: /^Set off/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("table").waitFor();
      const dues = await dialog.locator("tbody td:nth-child(2)").evaluateAll((tds) => tds.map((td) => { const c = td.cloneNode(true); c.querySelectorAll(".sr-only").forEach((n) => n.remove()); return c.textContent; }));
      s.ok("set-off due dates read as day then month", dues.every((d) => /^(\d{2} [A-Z][a-z]{2}( \d{4})?|—)$/.test(clean(d))), dues);
      await page.keyboard.press("Escape");
    });

    const awaitedAfter = (await register()).totals;
    console.log(`END totals ${JSON.stringify(awaitedAfter)}`);
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
  console.error("CR27 HARNESS ERROR", e);
  process.exit(2);
});
