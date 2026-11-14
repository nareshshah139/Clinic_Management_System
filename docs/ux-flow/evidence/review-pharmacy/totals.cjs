// Throwaway reviewer script: boots a fresh stack, sells to a walk-in, and checks every total it should reach.
const path = require("node:path");
const fs = require("node:fs");
const W = "/home/user/wt/pharmacy";
const { chromium } = require(require.resolve("playwright", { paths: [W, W + "/frontend", "/home/user/Clinic_Management_System"] }));
const { bootStack } = require(W + "/scripts/stack/boot.cjs");
const { seed } = require(W + "/scripts/ux/journeys/seed.cjs");
const OUT = __dirname + "/out";
fs.mkdirSync(OUT, { recursive: true });

const REPORTS = ["daily-collection", "purchase-register", "purchase-bills", "sales-register", "sales-bills", "day-wise-summary", "gstr-1", "gstr-3b", "gstr-2a", "gstr-2b", "hsn-wise", "composition", "item-margin", "expiring-stock", "doctor-wise-sales"];

function leaves(obj, prefix = "", out = {}) {
  if (typeof obj === "number") out[prefix] = obj;
  else if (Array.isArray(obj)) obj.forEach((v, i) => leaves(v, `${prefix}[${i}]`, out));
  else if (obj && typeof obj === "object") for (const [k, v] of Object.entries(obj)) leaves(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

(async () => {
  const stack = await bootStack({ label: "review-pharmacy-totals" });
  const browser = await chromium.launch();
  const log = [];
  const say = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); log.push(s); console.log(s); };
  try {
    const seeded = await seed(stack);
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`${page.url()} :: ${e.message}`));
    await stack.login(page, "pharmacist");
    const api = (method, url, body) =>
      page.evaluate(async ({ method, url, body }) => {
        const r = await fetch("/api" + url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
        let j = null; try { j = await r.json(); } catch {}
        return { status: r.status, body: j };
      }, { method, url, body });
    const today = seeded.today;
    const snap = async () => {
      const s = {};
      for (const id of REPORTS) {
        const r = await api("GET", `/pharmacy/reports/${id}?from=${today}&to=${today}`);
        s[id] = r;
      }
      s.register = await api("GET", `/pharmacy/sales-register?register=sales&from=${today}&to=${today}&page=1&limit=100`);
      s.dashboard = await api("GET", `/pharmacy/dashboard`);
      s.dashSales = await api("GET", `/pharmacy/dashboard/sales`);
      s.recent = await api("GET", `/pharmacy/dashboard/recent-invoices`);
      s.list = await api("GET", `/pharmacy/invoices?limit=100`);
      return s;
    };
    const before = await snap();
    for (const [k, v] of Object.entries(before)) if (v.status !== 200) say("BEFORE non-200", k, v.status, JSON.stringify(v.body).slice(0, 200));

    const drugs = [];
    for (const q of ["Cetirizine", "Sunscreen"]) { const r = await api("GET", `/drugs/autocomplete?q=${q}&limit=5`); drugs.push(r.body[0]); }
    drugs.forEach((d) => { d.price = d.price; });
    say("drugs", drugs.map((d) => ({ id: d.id, name: d.name, gstRate: d.gstRate, price: d.price })));
    const items = drugs.map((d, i) => ({ drugId: d.id, quantity: i ? 1 : 3, unitPrice: 100, discountPercent: 0, taxPercent: Number(d.gstRate ?? 12) }));
    const sold = await api("POST", "/pharmacy/invoices/checkout", { requestKey: "review-walkin-1", patientId: "", billingName: "Walkin Reviewer", billingPhone: "9000099999", paymentMethod: "CASH", items });
    say("checkout", sold.status, sold.body?.status, sold.body?.paymentStatus, sold.body?.totalAmount, sold.body?.patientId, sold.body?.invoiceNumber);
    const id = sold.body.id;
    const total = Number(sold.body.totalAmount);
    const after = await snap();
    for (const [k, v] of Object.entries(after)) {
      if (v.status !== 200) { say("AFTER non-200", k, v.status, JSON.stringify(v.body).slice(0, 300)); continue; }
      const a = leaves(before[k].body), b = leaves(v.body);
      const changed = Object.keys(b).filter((p) => a[p] !== b[p] && Math.abs((b[p] ?? 0) - (a[p] ?? 0)) > 0.001);
      const hit = changed.filter((p) => Math.abs(b[p] - (a[p] ?? 0) - total) < 0.011);
      const named = JSON.stringify(v.body).includes("Walkin Reviewer");
      say(`[${k}] mentionsWalkIn=${named} changedNumbers=${changed.length} changedByExactlyTotal(${total})=${hit.length}`, hit.slice(0, 6));
    }
    const print = await api("GET", `/pharmacy/invoices/${id}/print-data?format=A5&copyType=ORIGINAL`);
    say("print", print.status, print.body?.patient);
    const search = await api("GET", `/pharmacy/invoices?search=Walkin&limit=10`);
    say("search", search.status, search.body?.data?.map((b) => b.id === id));
    const one = await api("GET", `/pharmacy/invoices/${id}`);
    const rev = await api("PATCH", `/pharmacy/invoices/${id}/discount`, { expectedVersion: one.body.mutationVersion, billDiscount: { kind: "AMOUNT", value: 10 }, lines: [], reason: "Review check" });
    say("discount", rev.status, rev.body?.totalAmount, rev.body?.patientId, rev.status >= 300 ? JSON.stringify(rev.body).slice(0, 300) : "");
    const ref = await api("POST", `/pharmacy/invoices/${id}/refunds`, { requestKey: "review-refund-1", amount: 10, method: "CASH" });
    say("refund", ref.status, ref.body?.status, ref.body?.amount, ref.status >= 300 ? JSON.stringify(ref.body).slice(0, 300) : "");
    const dc = await api("GET", `/pharmacy/reports/daily-collection?from=${today}`);
    say("daily-collection after refund mentions", JSON.stringify(dc.body).includes("Walkin Reviewer"));

    for (const [name, url, text] of [
      ["finished", `/dashboard/pharmacy/sales/bill?bill=${id}&next=sale`, "Walkin Reviewer"],
      ["invoices", `/dashboard/pharmacy/invoices`, "Walkin Reviewer"],
      ["sales", `/dashboard/pharmacy/sales`, "Walkin Reviewer"],
      ["daily", `/dashboard/pharmacy/reports?report=daily-collection`, "Walkin Reviewer"],
      ["salesbills", `/dashboard/pharmacy/reports?report=sales-bills`, "Walkin Reviewer"],
      ["desk", `/dashboard/pharmacy?section=desk`, null],
      ["counter", `/dashboard/pharmacy?section=counter`, null],
    ]) {
      await page.goto(stack.base + url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(6000);
      const body = await page.locator("body").innerText();
      say(`page ${name}: shows walk-in=${text ? body.includes(text) : "n/a"} crashed=${/Application error|Something went wrong|Unhandled/.test(body)}`);
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    }
    // Reception on the counter: where does Daily close land?
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const rp = await ctx.newPage();
    await stack.login(rp, "reception");
    await rp.goto(stack.base + "/dashboard/pharmacy?section=counter", { waitUntil: "domcontentloaded" });
    await rp.waitForTimeout(6000);
    const dcBtn = rp.getByRole("button", { name: "Daily close" });
    say("reception sees Daily close:", await dcBtn.count());
    if (await dcBtn.count()) {
      await dcBtn.first().click();
      await rp.waitForTimeout(6000);
      say("reception Daily close url:", rp.url(), "text:", (await rp.locator("main").innerText().catch(() => "")).slice(0, 300).replace(/\s+/g, " "));
      await rp.screenshot({ path: `${OUT}/reception-daily-close.png` });
    }
    say("page errors", errors);
  } catch (e) {
    say("ERROR", e.stack || e.message);
  } finally {
    await browser.close().catch(() => {});
    await stack.stop();
    fs.writeFileSync(OUT + "/log.txt", log.join("\n"));
  }
})();
