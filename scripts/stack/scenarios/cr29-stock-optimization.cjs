const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");
const { tokenFor, api } = require("./cr27-seed.cjs");
const { seed, DISTRIBUTORS } = require("./cr29-seed.cjs");

const root = path.resolve(__dirname, "../../..");
const out = process.env.SHOTS_DIR || path.join(root, "output/stack/cr29");
const STOCK = "/dashboard/inventory?area=stock&view=list";
const TODAY = "/dashboard/inventory";
const OPTIMIZE = "/dashboard/inventory?area=stock&view=optimize";
const RETURNS = "/dashboard/inventory?area=purchases&view=register&tab=returns";
const GAP_LABELS = ["Missing location", "Missing category", "Missing HSN code", "Missing min/max", "Unmapped"];

const clean = (text) => String(text ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const rupees = (value) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let sink = [];
const watch = (page) => {
  page.on("pageerror", (e) => sink.push({ type: "pageerror", text: e.message.slice(0, 300) }));
  page.on("console", (m) => m.type() === "error" && sink.push({ type: "console", text: m.text().slice(0, 300) }));
};

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "cr29" });
  let browser;
  const results = [];
  try {
    console.log(`BOOT base=${stack.base}`);
    const owner = await stack.db.user.findUnique({ where: { id: stack.users.owner.id } });
    const admin = await stack.db.user.create({
      data: { branchId: stack.branch.id, email: "meera.kulkarni@stack.example.invalid", firstName: "Meera", lastName: "Kulkarni", role: "ADMIN", password: owner.password, permissions: "[]" },
    });
    stack.users.admin = { id: admin.id, email: admin.email, password: stack.users.owner.password, role: "ADMIN" };
    const data = await seed(stack);
    const { today, batches } = data;
    const stamp = today.replaceAll("-", "");
    console.log(`SEED today=${today} batches=${Object.keys(batches).length}`);
    const tokens = {};
    const as = async (who) => (tokens[who] ??= await tokenFor(stack, who));
    for (const who of ["pharmacist", "doctor", "admin", "reception"]) await as(who);
    await new Promise((resolve) => setTimeout(resolve, 61000));
    const call = async (who, method, url, body) => api(stack, await as(who), method, url, body);
    const refused = async (who, method, url, body) => {
      try {
        await call(who, method, url, body);
        return "allowed";
      } catch (e) {
        if (!e.status) throw e;
        return e.status;
      }
    };
    const supplierReturns = () =>
      stack.db.inventoryWorkflowDocument.findMany({ where: { branchId: stack.branch.id, kind: "SUPPLIER_RETURN" }, orderBy: { createdAt: "asc" } });

    browser = await chromium.launch();
    const sessions = new Map();
    async function open(role, size = { width: 1280, height: 900 }) {
      const context = await browser.newContext({ viewport: size, ...(sessions.has(role) && { storageState: sessions.get(role) }) });
      context.on("page", watch);
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      if (!sessions.has(role)) {
        await stack.login(page, role);
        sessions.set(role, await context.storageState());
      }
      return { page, context };
    }
    const strip = (page) => page.getByRole("region", { name: "Data quality" });
    const stripCounts = async (page) => {
      await page.waitForFunction(() => {
        const cells = [...document.querySelectorAll('[data-testid^="gap-"]')];
        return cells.length === 5 && cells.every((c) => /^\d+$/.test(c.textContent.trim()));
      }, null, { timeout: 120000 });
      return strip(page).locator("li button").evaluateAll((buttons) =>
        buttons.map((b) => ({
          label: b.querySelector(".truncate").textContent,
          count: Number(b.querySelector('[data-testid^="gap-"]').textContent),
          tone: b.className.includes("bg-red-50") ? "red" : b.className.includes("bg-amber-50") ? "amber" : "calm",
          pressed: b.getAttribute("aria-pressed"),
        })),
      );
    };
    const goto = async (page, route) => {
      await page.goto(`${stack.base}${route}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.getByRole("heading", { name: "Inventory", level: 1 }).waitFor({ timeout: 240000 });
    };
    const stockRows = async (page) => {
      await page.waitForFunction(() => /^\d+ matching batches/.test(document.querySelector("main p[role=status]")?.textContent || "") || [...document.querySelectorAll("p[role=status]")].some((p) => /^\d+ matching batches/.test(p.textContent)), null, { timeout: 120000 });
      const status = await page.locator("p[role=status]").filter({ hasText: /matching batches/ }).first().innerText();
      const labels = await page.locator("tbody input[type=checkbox]").evaluateAll((boxes) => boxes.map((b) => b.getAttribute("aria-label").replace(/^Select /, "")));
      return { status: clean(status), labels };
    };
    const stockLoad = (page, gap) =>
      page.waitForResponse((r) => {
        if (!r.url().includes("/inventory/workspace/stock?")) return false;
        const g = new URL(r.url()).searchParams.get("gap");
        return gap ? g === gap : !g;
      }, { timeout: 120000 }).then(() => page.waitForTimeout(300));
    const docOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const runResult = async (page) => {
      await page.getByText(/^Checked \d+ batch/).waitFor({ timeout: 120000 });
      await page.waitForFunction(() => document.querySelector("[aria-busy]")?.getAttribute("aria-busy") !== "true");
      return page.evaluate(() => {
        const norm = (v) => v.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
        const groups = (label) =>
          [...document.querySelectorAll(`section[aria-label$=" ${label}"]`)].filter((s) => s.getClientRects().length).map((s) => {
            const table = s.querySelector("table");
            const rows = table && table.getClientRects().length
              ? [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => norm(td.textContent)))
              : [...s.querySelectorAll("ul li")].map((li) => [norm(li.textContent)]);
            return {
              name: s.querySelector("h4").textContent,
              summary: norm(s.querySelector("header p").textContent),
              flag: norm(s.querySelector("header > p, header .rounded-md.border-amber-300")?.textContent || ""),
              buttons: [...s.querySelectorAll("header button")].map((b) => norm(b.textContent)),
              rows,
            };
          });
        return {
          status: norm(document.querySelector("p[role=status][aria-live=polite]").textContent),
          returnable: groups("returnable"),
          nonReturnable: groups("non-returnable"),
        };
      });
    };

    async function scenario(id, name, run) {
      if (process.env.ONLY && !process.env.ONLY.split(",").includes(id)) return;
      sink = [];
      const t = { checks: [], shots: [] };
      const started = Date.now();
      const ctx = {
        check(label, actual, expected) {
          const ok = JSON.stringify(actual) === JSON.stringify(expected);
          t.checks.push({ label, ok, actual: ok ? undefined : actual, expected: ok ? undefined : expected });
        },
        ok(label, cond, detail) {
          t.checks.push({ label, ok: Boolean(cond), actual: cond ? undefined : detail ?? false, expected: cond ? undefined : true });
        },
        async shot(page, slug, full = false) {
          const file = path.join(out, `cr29-${slug}.png`);
          const size = page.viewportSize();
          if (full) {
            const tall = await page.evaluate(() => Math.max(...[...document.querySelectorAll("*")].map((el) => el.scrollHeight)));
            await page.setViewportSize({ width: size.width, height: Math.min(6000, Math.max(size.height, tall + 80)) });
            await page.waitForTimeout(400);
          }
          await page.screenshot({ path: file });
          if (full) await page.setViewportSize(size);
          t.shots.push(file);
        },
        allowConsole: null,
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
      const consoleErrors = sink.filter((e) => e.type === "console" && !(ctx.allowConsole && ctx.allowConsole.test(e.text)));
      const pass = !error && failed.length === 0 && pageErrors.length === 0 && consoleErrors.length === 0;
      const detail = [
        error && `EXCEPTION: ${error.message.split("\n")[0]}`,
        ...failed.map((c) => `FAIL ${c.label}: expected ${JSON.stringify(c.expected)} actual ${JSON.stringify(c.actual)}`),
        ...pageErrors.map((e) => `PAGEERROR ${e.text}`),
        ...consoleErrors.map((e) => `CONSOLE ${e.text}`),
        `${t.checks.length - failed.length}/${t.checks.length} checks passed`,
      ].filter(Boolean).join("\n");
      results.push({ scenario: `${id} ${name}`, pass, detail, screenshots: t.shots, seconds: Math.round((Date.now() - started) / 1000) });
      console.log(`${pass ? "PASS" : "FAIL"} ${id} ${name}\n${detail.split("\n").map((l) => `    ${l}`).join("\n")}`);
    }

    const EXPECTED_STRIP = [
      { label: "Missing location", count: 2, tone: "amber" },
      { label: "Missing category", count: 1, tone: "amber" },
      { label: "Missing HSN code", count: 2, tone: "red" },
      { label: "Missing min/max", count: 2, tone: "amber" },
      { label: "Unmapped", count: 3, tone: "red" },
    ];
    const EXPECTED_LISTS = {
      LOCATION: ["Adapalene Gel 0.1% 15g ADG2405", "Calamine Lotion 100ml CAL2309"],
      CATEGORY: ["Ketoconazole Shampoo 2% 100ml KTS2402"],
      HSN: ["Calamine Lotion 100ml CAL2309", "Ketoconazole Shampoo 2% 100ml KTS2402"],
      MIN_MAX: ["Adapalene Gel 0.1% 15g ADG2405", "Calamine Lotion 100ml CAL2309"],
      UNMAPPED: ["Adapalene Gel 0.1% 15g ADG2405", "Calamine Lotion 100ml CAL2309", "Ketoconazole Shampoo 2% 100ml KTS2402"],
    };

    await scenario("01", "pharmacist-1280-inventory-opens-with-the-strip-and-each-count-lists-exactly-its-batches", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page, TODAY);
      const counts = await stripCounts(page);
      s.check("Inventory (Today) opens with five live counts, red for HSN and unmapped, amber for the rest", counts.map(({ label, count, tone }) => ({ label, count, tone })), EXPECTED_STRIP);
      s.check("API counts match the strip", await call("pharmacist", "GET", "/inventory/workspace/stock/gaps"), { LOCATION: 2, CATEGORY: 1, HSN: 2, MIN_MAX: 2, UNMAPPED: 3 });
      await s.shot(page, "01-today-strip-1280");
      for (const [gap, label] of [["LOCATION", "Missing location"], ["CATEGORY", "Missing category"], ["HSN", "Missing HSN code"], ["MIN_MAX", "Missing min/max"], ["UNMAPPED", "Unmapped"]]) {
        const loaded = stockLoad(page, gap);
        await strip(page).getByRole("button", { name: new RegExp(`^${label.replace("/", "\\/")}:`) }).click();
        await page.waitForURL((url) => url.searchParams.get("gap") === gap && url.searchParams.get("view") === "list");
        await loaded;
        const rows = await stockRows(page);
        s.check(`${label} opens the stock list with exactly its batches`, [rows.status, rows.labels], [`${EXPECTED_LISTS[gap].length} matching batches`, EXPECTED_LISTS[gap]]);
        const pressed = (await stripCounts(page)).filter((c) => c.pressed === "true").map((c) => c.label);
        s.check(`${label} chip shows as pressed`, pressed, [label]);
        if (gap === "HSN") {
          s.ok("active filter reads Missing HSN code ×", await page.getByRole("button", { name: "Missing HSN code ×" }).isVisible());
          await s.shot(page, "01-stock-missing-hsn-1280");
        }
      }
      const reloading = stockLoad(page, "UNMAPPED");
      await page.reload({ waitUntil: "domcontentloaded" });
      await reloading;
      const reloaded = await stockRows(page);
      s.check("deep link survives a reload (gap=UNMAPPED)", [new URL(page.url()).searchParams.get("gap"), reloaded.labels], ["UNMAPPED", EXPECTED_LISTS.UNMAPPED]);
      const all = stockLoad(page, null);
      await strip(page).getByRole("button", { name: /^Unmapped:/ }).click();
      await page.waitForURL((url) => !url.searchParams.get("gap"));
      await all;
      s.check("pressing the active chip again shows all stock", (await stockRows(page)).status, "10 matching batches");
    });

    await scenario("02", "doctor-390-strip-fits-a-phone-and-opens-the-filtered-list", async (s) => {
      const { page } = s.track(await open("doctor", { width: 390, height: 844 }));
      await goto(page, TODAY);
      s.check("same counts for the doctor", (await stripCounts(page)).map((c) => c.count), [2, 1, 2, 2, 3]);
      s.ok("no sideways page scroll at 390", (await docOverflow(page)) <= 0, await docOverflow(page));
      const boxes = await strip(page).locator("li button").evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.height >= 40; }));
      s.check("every chip inside the screen and at least 40px tall", boxes, [true, true, true, true, true]);
      await s.shot(page, "02-today-strip-390");
      const loaded = stockLoad(page, "MIN_MAX");
      await strip(page).getByRole("button", { name: /^Missing min\/max:/ }).click();
      await page.waitForURL((url) => url.searchParams.get("gap") === "MIN_MAX");
      await loaded;
      s.check("Missing min/max lists its two batches on a phone", (await stockRows(page)).labels, EXPECTED_LISTS.MIN_MAX);
      s.ok("no sideways page scroll on the filtered list", (await docOverflow(page)) <= 0, await docOverflow(page));
      await s.shot(page, "02-stock-missing-minmax-390");
    });

    await scenario("03", "admin-1280-fixing-a-field-drops-the-live-count-to-a-calm-zero", async (s) => {
      const detail = await call("admin", "GET", `/inventory/workspace/stock/${batches.keto.id}`);
      await call("admin", "PATCH", `/inventory/workspace/stock/${batches.keto.id}`, { category: "Shampoo", updatedAt: detail.item.updatedAt, reason: "Category from the carton" });
      const { page } = s.track(await open("admin"));
      await goto(page, STOCK);
      const counts = await stripCounts(page);
      s.check("Missing category is 0 and calm, still shown", counts[1], { label: "Missing category", count: 0, tone: "calm", pressed: "false" });
      const loaded = stockLoad(page, "CATEGORY");
      await strip(page).getByRole("button", { name: /^Missing category:/ }).click();
      await loaded;
      s.check("the zero chip opens an empty list", (await stockRows(page)).status, "0 matching batches");
      await s.shot(page, "03-zero-category-1280");
    });

    await scenario("04", "pharmacist-1280-run-optimization-splits-returnable-and-non-returnable-by-distributor", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page, OPTIMIZE);
      s.check("the strip also tops Stock optimization", (await stripCounts(page)).map((c) => c.count), [2, 0, 2, 2, 3]);
      await page.getByRole("button", { name: "Run optimization" }).click();
      await page.waitForURL((url) => url.searchParams.get("run") === "1");
      const r = await runResult(page);
      s.ok("summary line", /^Checked 9 batches on the shelf on .+: 6 batches not sold for 90 days\. Returnable ₹9,500\.00 · non-returnable ₹750\.00, at PTR excluding GST\.$/.test(r.status), r.status);
      s.check("returnable groups by distributor, largest first, values at PTR ex GST", r.returnable.map((g) => [g.name, g.summary]), [
        [DISTRIBUTORS.SLV.name, `GSTIN ${DISTRIBUTORS.SLV.gstin} · 2 batches · ₹4,500.00 at PTR, excluding GST`],
        [DISTRIBUTORS.NVJ.name, `GSTIN ${DISTRIBUTORS.NVJ.gstin} · 1 batch · ₹2,000.00 at PTR, excluding GST`],
        [DISTRIBUTORS.MDX.name, `GSTIN ${DISTRIBUTORS.MDX.gstin} · 1 batch · ₹1,800.00 at PTR, excluding GST`],
        [DISTRIBUTORS.APX.name, `GSTIN ${DISTRIBUTORS.APX.gstin} · 1 batch · ₹1,200.00 at PTR, excluding GST`],
      ]);
      const api = await call("pharmacist", "POST", "/inventory/workspace/optimization/run");
      const slvRows = r.returnable[0].rows.map((cells) => cells.slice(0, 6));
      s.check("SLV rows sorted by shelf life with batch, qty, PTR, GST and value", slvRows, [
        [`Adapalene Gel 0.1% 15gBatch ADG2405 · exp ${api.returnable[0].rows[0].expiryDate.split("-").reverse().join("/")}`, `2 months (${api.returnable[0].rows[0].shelfLifeDays} days)`, "20", "₹75.00", "18%", "₹1,500.00"],
        [`Clobetasol Cream 0.05% 15gBatch CLB2311 · exp ${api.returnable[0].rows[1].expiryDate.split("-").reverse().join("/")}`, `4 months (${api.returnable[0].rows[1].shelfLifeDays} days)`, "30", "₹100.00", "12%", "₹3,000.00"],
      ]);
      s.ok("shelf life days are the seeded 82 and 141 (one more after midnight IST)", [82, 83].includes(api.returnable[0].rows[0].shelfLifeDays) && [141, 142].includes(api.returnable[0].rows[1].shelfLifeDays), api.returnable[0].rows.map((x) => x.shelfLifeDays));
      s.ok("SLV rows name their bills", r.returnable[0].rows[0][6].startsWith("Bill SLV/2026/112") && r.returnable[0].rows[1][6].startsWith("Bill SLV/2026/087"), r.returnable[0].rows.map((x) => x[6]));
      s.check("Apex below ₹1,500 is flagged and offers no draft", [r.returnable[3].flag, r.returnable[3].buttons], ["Below ₹1,500, not worth returning", []]);
      s.check("the other three offer Create return draft", r.returnable.slice(0, 3).map((g) => g.buttons), [["Create return draft"], ["Create return draft"], ["Create return draft"]]);
      s.check("non-returnable: calamine bought 400 days ago, view only with shelf life", r.nonReturnable.map((g) => [g.name, g.summary, g.buttons, g.rows.map((x) => [x[1], x[2], x[3], x[5]])]), [
        [DISTRIBUTORS.SLV.name, `GSTIN ${DISTRIBUTORS.SLV.gstin} · 1 batch · ₹750.00 at PTR, excluding GST`, [], [[`${api.nonReturnable[0].rows[0].shelfLifeDays} days`, "15", "₹50.00", "₹750.00"]]],
      ]);
      s.ok("minoxidil (sold 75 days ago), the fresh sunscreen and tretinoin (sibling sold 10 days ago) are not flagged",
        !JSON.stringify(r).includes("Minoxidil") && !JSON.stringify(r).includes("Sunscreen") && !JSON.stringify(r).includes("Tretinoin"));
      await s.shot(page, "04-run-results-1280", true);
      await page.reload({ waitUntil: "domcontentloaded" });
      const again = await runResult(page);
      s.check("reload keeps the results (run=1 re-runs)", again.returnable.map((g) => g.name), r.returnable.map((g) => g.name));
    });

    await scenario("05", "pharmacist-1280-create-return-draft-twice-gives-one-draft-in-purchase-returns", async (s) => {
      const { page } = s.track(await open("pharmacist"));
      await goto(page, `${OPTIMIZE}&run=1`);
      await runResult(page);
      const group = page.getByRole("region", { name: `${DISTRIBUTORS.SLV.name} returnable` });
      const button = group.getByRole("button", { name: "Create return draft" });
      await button.dblclick();
      await page.getByText(/^Return draft RET-SO-/).waitFor();
      const docs = await supplierReturns();
      s.check("a double press made one supplier return", docs.length, 1);
      const doc = docs[0];
      s.check("draft header", [doc.reference, doc.status, doc.supplierGstin, doc.purchaseInvoiceId, Number(doc.totalAmount)], [`RET-SO-${stamp}-AABCS`, "DRAFT", DISTRIBUTORS.SLV.gstin, null, 5130]);
      s.check("draft lines carry batch, PTR, GST and the purchase line", doc.payload.lines.map((l) => [l.name, l.batchNumber, l.quantity, l.unitPrice, l.gstRate, l.taxable, l.tax, l.total, l.sourceLineId]), [
        ["Adapalene Gel 0.1% 15g", "ADG2405", 20, 75, 18, 1500, 270, 1770, data.bills["SLV/2026/112"].items.adap.id],
        ["Clobetasol Cream 0.05% 15g", "CLB2311", 30, 100, 12, 3000, 360, 3360, data.bills["SLV/2026/087"].items.clob.id],
      ]);
      const r = await runResult(page);
      s.check("the group now opens its draft instead of offering another", r.returnable[0].buttons, [`Open RET-SO-${stamp}-AABCS (Draft)`]);
      await s.shot(page, "05-draft-created-1280");
      await page.getByRole("button", { name: "See it in Purchase bills › Returns" }).click();
      await page.waitForURL((url) => url.searchParams.get("tab") === "returns");
      const row = page.locator("tbody tr").filter({ hasText: `RET-SO-${stamp}-AABCS` });
      await row.first().waitFor({ timeout: 120000 });
      const text = clean(await row.first().innerText());
      const billTitle = await row.first().locator('[title="SLV/2026/112, SLV/2026/087"]').count();
      s.ok("Purchase › Returns lists the draft with both bills (first shown, all in the title), the distributor and ₹5,130.00", text.includes("SLV/2026/112 +1") && billTitle === 1 && text.includes("₹5,130.00") && /Draft/i.test(text), { text, billTitle });
      const fits = await page.evaluate(() => { const t = document.querySelector("table"); const box = t.closest(".overflow-x-auto") || t.parentElement; return box.scrollWidth - box.clientWidth; });
      s.ok("the returns table fits 1280 without sideways scroll", fits <= 1, fits);
      await s.shot(page, "05-purchase-returns-1280");
      const reg = await call("pharmacist", "GET", `/pharmacy/purchase-returns-register?${new URLSearchParams({ from: today, to: today, sortBy: "entryAt", sortDir: "desc", page: "1", limit: "50" })}`);
      s.check("register API row", reg.rows.map((x) => [x.returnRef, x.distributor.name, x.sourceBillNo, x.returnValue, x.state]), [[`RET-SO-${stamp}-AABCS`, DISTRIBUTORS.SLV.name, "SLV/2026/112, SLV/2026/087", 5130, "DRAFT"]]);
      await goto(page, `/dashboard/inventory?area=purchases&view=SUPPLIER_RETURN&document=${doc.id}`);
      await page.getByRole("heading", { name: `RET-SO-${stamp}-AABCS` }).waitFor({ timeout: 120000 });
      await page.waitForTimeout(800);
      const values = await page.locator("main.inventory-surface input").evaluateAll((inputs) => inputs.map((i) => i.value));
      const body = clean(await page.locator("main.inventory-surface").innerText());
      s.ok("the draft document shows the batches pre-filled", body.includes("ADG2405") && body.includes("CLB2311") && [75, 100, 18, 12].every((n) => values.some((v) => v !== "" && Number(v) === n)), { values });
      await s.shot(page, "05-draft-document-1280", true);
    });

    await scenario("06", "doctor-390-runs-and-drafts-navjeevan-on-a-phone", async (s) => {
      const { page } = s.track(await open("doctor", { width: 390, height: 844 }));
      await goto(page, OPTIMIZE);
      await page.getByRole("button", { name: "Run optimization" }).click();
      const r = await runResult(page);
      s.check("phone cards per batch for Navjeevan", r.returnable[1].rows.length, 1);
      s.ok("no sideways page scroll at 390", (await docOverflow(page)) <= 0, await docOverflow(page));
      await s.shot(page, "06-results-390", true);
      await s.shot(page, "06-results-390-top");
      await page.getByRole("region", { name: `${DISTRIBUTORS.NVJ.name} returnable` }).getByRole("button", { name: "Create return draft" }).click();
      await page.getByText(/^Return draft RET-SO-/).waitFor();
      const nvj = (await supplierReturns()).find((d) => d.supplierGstin === DISTRIBUTORS.NVJ.gstin);
      s.check("one-bill draft links its bill", [nvj.purchaseInvoiceId, Number(nvj.totalAmount), nvj.payload.lines.map((l) => [l.batchNumber, l.quantity, l.unitPrice, l.gstRate])], [data.bills["NVJ/2026/019"].id, 2240, [["MUP2404", 25, 80, 12]]]);
      s.ok("still no sideways scroll after drafting", (await docOverflow(page)) <= 0, await docOverflow(page));
      await page.getByText(/^Return draft RET-SO-/).scrollIntoViewIfNeeded();
      await s.shot(page, "06-draft-created-390");
    });

    await scenario("07", "admin-1280-90-to-60-days-changes-what-is-flagged-and-persists", async (s) => {
      const { page } = s.track(await open("admin"));
      await goto(page, `${OPTIMIZE}&run=1`);
      const before = await runResult(page);
      s.check("at 90 days SLV holds adapalene and clobetasol", before.returnable[0].rows.map((x) => x[0].split("Batch")[0]), ["Adapalene Gel 0.1% 15g", "Clobetasol Cream 0.05% 15g"]);
      const days = page.getByLabel("Non-moving days");
      await days.fill("60");
      await page.getByRole("button", { name: "Save rules" }).click();
      await page.getByText("Saved: 60 non-moving days, minimum ₹1,500.00.").waitFor();
      await page.waitForFunction(() => /not sold for 60 days/.test(document.querySelector("p[role=status][aria-live=polite]")?.textContent || ""), null, { timeout: 120000 });
      const after = await runResult(page);
      s.check("at 60 days minoxidil (sold 75 days ago) joins SLV", [after.returnable[0].summary, after.returnable[0].rows.map((x) => x[0].split("Batch")[0])], [
        `GSTIN ${DISTRIBUTORS.SLV.gstin} · 3 batches · ₹6,500.00 at PTR, excluding GST`, ["Adapalene Gel 0.1% 15g", "Clobetasol Cream 0.05% 15g", "Minoxidil 5% Solution 60ml"],
      ]);
      s.check("SLV offers its open draft and the remaining batch", after.returnable[0].buttons, [`Open RET-SO-${stamp}-AABCS (Draft)`, "Draft the remaining batches"]);
      await s.shot(page, "07-sixty-days-1280", true);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("#non-moving-days")?.value === "60", null, { timeout: 120000 });
      s.check("rules persist across reload", await call("pharmacist", "GET", "/inventory/workspace/optimization/rules"), { nonMovingDays: 60, minimumBatchValue: 1500, version: 1 });
      await runResult(page);
      await page.getByRole("region", { name: `${DISTRIBUTORS.MDX.name} returnable` }).getByRole("button", { name: "Create return draft" }).click();
      await page.getByText(/^Return draft RET-SO-/).waitFor();
      const mdx = (await supplierReturns()).find((d) => d.supplierGstin === DISTRIBUTORS.MDX.gstin);
      s.check("admin drafts Medilink", [Number(mdx.totalAmount), mdx.payload.lines.map((l) => [l.batchNumber, l.quantity, l.unitPrice, l.gstRate])], [2016, [["HQC2403", 12, 150, 12]]]);
    });

    await scenario("08", "admin-390-rules-and-results-fit-a-phone", async (s) => {
      const { page } = s.track(await open("admin", { width: 390, height: 844 }));
      await goto(page, `${OPTIMIZE}&run=1`);
      await runResult(page);
      s.ok("no sideways page scroll at 390", (await docOverflow(page)) <= 0, await docOverflow(page));
      const fits = await page.locator("form[aria-label='Optimization rules'] input, form[aria-label='Optimization rules'] button").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }));
      s.ok("rule fields and Save inside the screen", fits.every(Boolean), fits);
      await s.shot(page, "08-rules-390");
      await page.getByRole("region", { name: `${DISTRIBUTORS.APX.name} returnable` }).scrollIntoViewIfNeeded();
      await s.shot(page, "08-below-minimum-390");
    });

    await scenario("09", "posting-the-optimization-draft-moves-stock-and-the-next-run-drops-it", async (s) => {
      const doc = (await supplierReturns()).find((d) => d.supplierGstin === DISTRIBUTORS.SLV.gstin);
      const challan = await call("pharmacist", "POST", `/inventory/workspace/documents/${doc.id}/transition`, { action: "CHALLAN", version: doc.version });
      s.check("the multi-bill draft becomes a challan through the existing flow", challan.status, "CHALLAN");
      const stock = await stack.db.inventoryItem.findMany({ where: { id: { in: [batches.adap.id, batches.clob.id] } }, select: { batchNumber: true, currentStock: true }, orderBy: { batchNumber: "asc" } });
      s.check("stock left the shelf", stock, [{ batchNumber: "ADG2405", currentStock: 0 }, { batchNumber: "CLB2311", currentStock: 0 }]);
      const { page } = s.track(await open("pharmacist"));
      await goto(page, `${OPTIMIZE}&run=1`);
      const r = await runResult(page);
      s.check("SLV now holds only the minoxidil, ready to draft", [r.returnable.find((g) => g.name === DISTRIBUTORS.SLV.name).rows.map((x) => x[0].split("Batch")[0]), r.returnable.find((g) => g.name === DISTRIBUTORS.SLV.name).buttons], [["Minoxidil 5% Solution 60ml"], ["Create return draft"]]);
      await goto(page, RETURNS);
      const row = page.locator("tbody tr").filter({ hasText: `RET-SO-${stamp}-AABCS` });
      await row.first().waitFor({ timeout: 120000 });
      s.ok("the register shows the challan awaiting its credit note", /Awaited|Awaiting/i.test(clean(await row.first().innerText())), clean(await row.first().innerText()));
      await s.shot(page, "09-challan-in-returns-1280");
    });

    await scenario("10", "refusals-and-rules-access-by-role", async (s) => {
      s.check("reception (no inventory grants) cannot read counts, run, or set rules", [
        await refused("reception", "GET", "/inventory/workspace/stock/gaps"),
        await refused("reception", "POST", "/inventory/workspace/optimization/run"),
        await refused("reception", "PATCH", "/inventory/workspace/optimization/rules", { nonMovingDays: 30, version: 1 }),
        await refused("reception", "POST", "/inventory/workspace/optimization/return-drafts", { distributorGstin: DISTRIBUTORS.SLV.gstin, requestKey: crypto.randomUUID() }),
      ], [403, 403, 403, 403]);
      const v1 = await call("pharmacist", "PATCH", "/inventory/workspace/optimization/rules", { nonMovingDays: 90, version: 1 });
      const v2 = await call("doctor", "PATCH", "/inventory/workspace/optimization/rules", { minimumBatchValue: 1500, version: v1.version });
      s.check("pharmacist and doctor can set the rules", [v1, v2], [{ nonMovingDays: 90, minimumBatchValue: 1500, version: 2 }, { nonMovingDays: 90, minimumBatchValue: 1500, version: 3 }]);
      s.check("a stale version is refused", await refused("admin", "PATCH", "/inventory/workspace/optimization/rules", { nonMovingDays: 30, version: 1 }), 409);
      s.check("other inventory settings still need an approver", await refused("pharmacist", "PATCH", "/inventory/workspace/settings", { lookbackDays: 30, version: 3 }), 403);
      s.check("Apex below the minimum is refused a draft", await refused("pharmacist", "POST", "/inventory/workspace/optimization/return-drafts", { distributorGstin: DISTRIBUTORS.APX.gstin, requestKey: crypto.randomUUID() }), 400);
      s.allowConsole = /status of 403 \(Forbidden\)/;
      const { page } = s.track(await open("reception"));
      await page.goto(`${stack.base}${TODAY}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.waitForTimeout(4000);
      s.check("reception sees no data-quality strip", await strip(page).count(), 0);
    });

    await scenario("11", "free-goods-go-back-at-no-value-unmapped-siblings-share-sales-and-two-presses-make-one-draft", async (s) => {
      const db = stack.db;
      const branchId = stack.branch.id;
      const BON = { name: "Bonus Pharma", gstin: "27AAGCB7788F1Z9" };
      const DAY = 86400000;
      const ago = (days) => new Date(Date.now() - days * DAY);
      const supplier = await db.supplier.create({ data: { branchId, name: BON.name, gstNumber: BON.gstin } });
      const strip = (id, name, batchNumber, stock, age) =>
        db.inventoryItem.create({
          data: {
            id, branchId, name, type: "MEDICINE", costPrice: 18, sellingPrice: 30, mrp: 30, unit: "STRIPS", packSize: 10, packUnit: "tablets", currentStock: stock, gstRate: 12,
            batchNumber, expiryDate: new Date("2027-09-30T00:00:00Z"), stockStatus: "IN_STOCK", storageLocation: "Rack C1", category: "Tablet", hsnCode: "30049099",
            minStockLevel: 2, maxStockLevel: 200, createdAt: ago(age),
          },
        });
      await strip("cr29-bonus", "Tab. Bonus 10 mg", "BON2401", 110, 130);
      await strip("cr29-acn-a", "Tab. Acnosis", "ACN2401", 40, 200);
      await strip("cr29-acn-b", "Tab.  ACNOSIS", "ACN2407", 30, 120);
      const bill = async (no, age, itemId, quantity, free, rate) => {
        const invoice = await db.pharmacyPurchaseInvoice.create({
          data: {
            branchId, createdBy: stack.users.pharmacist.id, supplierId: supplier.id, distributorName: BON.name, distributorGstin: BON.gstin, distributorDlNo: "MH-PUN-BON",
            invoiceNumber: no, invoiceDate: ago(age), billType: "CREDIT", doctorNameOrRegNo: "Dr. Praneeta Jain", source: "MANUAL", status: "STOCK_COMMITTED",
            grossAmount: 1, taxableAmount: 1, totalGst: 0, netPayable: 1, stockCommittedAt: ago(age), createdAt: ago(age),
          },
        });
        await db.pharmacyPurchaseInvoiceItem.create({
          data: {
            purchaseInvoiceId: invoice.id, lineNumber: 1, productName: itemId, manufacturer: "Synthetic Labs", packSize: "10", packUnitType: "STRIP", hsnCode: "30049099",
            batchNumber: itemId, expiryMonth: 9, expiryYear: 2027, quantityPurchased: quantity, freeQuantity: free, mrp: 30, discountPercent: 0, purchaseRate: rate,
            taxableAmount: quantity * rate, cgstPercent: 6, sgstPercent: 6, igstPercent: 0, gstAmount: quantity * rate * 0.12, lineTotal: quantity * rate * 1.12, inventoryItemId: itemId,
          },
        });
      };
      await bill("BON/2026/015", 120, "cr29-bonus", 100, 10, 20);
      await bill("BON/2026/016", 120, "cr29-acn-b", 30, 0, 60);
      await db.stockTransaction.create({
        data: { branchId, itemId: "cr29-acn-a", userId: stack.users.pharmacist.id, type: "SALE", quantity: 1, quantityDelta: -1, unitPrice: 30, totalAmount: 30, reference: "SEED-SALE-acn-a", createdAt: ago(1) },
      });

      const { page } = s.track(await open("pharmacist"));
      await goto(page, `${OPTIMIZE}&run=1`);
      const r = await runResult(page);
      const bonus = r.returnable.find((g) => g.name === BON.name);
      s.check("Bonus Pharma: 110 strips of which 10 free, valued 100 x Rs 20 = Rs 2,000", bonus && [bonus.summary, bonus.rows.map((x) => [x[0].split("Batch")[0], x[2], x[3], x[5]])], [
        `GSTIN ${BON.gstin} · 1 batch · ₹2,000.00 at PTR, excluding GST`, [["Tab. Bonus 10 mg", "110incl. 10 free, no value", "₹20.00", "₹2,000.00"]],
      ]);
      s.ok("the later Acnosis batch is not flagged: its sibling batch sold yesterday", !JSON.stringify(r).includes("ACN2407"), JSON.stringify(r).match(/[^"]*ACN2407[^"]*/)?.[0]);
      await page.getByRole("region", { name: `${BON.name} returnable` }).scrollIntoViewIfNeeded();
      await s.shot(page, "11-free-goods-row-1280");

      const presses = await Promise.allSettled([1, 2].map(() => call("pharmacist", "POST", "/inventory/workspace/optimization/return-drafts", { distributorGstin: BON.gstin, requestKey: crypto.randomUUID() })));
      s.check("two presses with different keys at the same moment: one draft, one refusal", presses.map((p) => p.status).sort(), ["fulfilled", "rejected"]);
      const drafts = (await supplierReturns()).filter((d) => d.supplierGstin === BON.gstin);
      s.check("one Bonus Pharma return draft in the database", drafts.length, 1);
      s.check("the draft claims 2,000 + 240 GST = 2,240, free units at no value", [Number(drafts[0].totalAmount), drafts[0].payload.lines.map((l) => [l.batchNumber, l.quantity, l.freeQuantity, l.unitPrice, l.taxable, l.tax, l.total])], [
        2240, [["BON2401", 100, 10, 20, 2000, 240, 2240]],
      ]);
      await page.reload({ waitUntil: "domcontentloaded" });
      const after = await runResult(page);
      s.check("after reload the group opens its draft", after.returnable.find((g) => g.name === BON.name)?.buttons, [`Open ${drafts[0].reference} (Draft)`]);

      const phone = s.track(await open("doctor", { width: 390, height: 844 }));
      await goto(phone.page, `${OPTIMIZE}&run=1`);
      const p = await runResult(phone.page);
      s.ok("phone card shows paid units, PTR and the free units", (p.returnable.find((g) => g.name === BON.name)?.rows[0][0] || "").includes("Qty × PTR100 × ₹20.00 + 10 free"), p.returnable.find((g) => g.name === BON.name)?.rows[0][0]);
      s.ok("no sideways page scroll at 390", (await docOverflow(phone.page)) <= 0, await docOverflow(phone.page));
      await phone.page.getByRole("region", { name: `${BON.name} returnable` }).scrollIntoViewIfNeeded();
      await s.shot(phone.page, "11-free-goods-card-390");
    });
  } finally {
    fs.writeFileSync(path.join(out, "cr29-results.json"), JSON.stringify(results, null, 2));
    console.log("\nSUMMARY");
    for (const x of results) console.log(`${x.pass ? "PASS" : "FAIL"}  ${x.scenario}`);
    await browser?.close().catch(() => {});
    await stack.stop();
    process.exitCode = results.length && results.every((x) => x.pass) ? 0 : 1;
  }
})().catch((e) => {
  console.error("CR29 HARNESS ERROR", e);
  process.exit(2);
});
