#!/usr/bin/env node
// Counts the words a user has to read on each dashboard route (labels, headings, helper prose),
// leaving out data (table bodies, form values, numbers, dates, money), and lists controls whose
// accessible name is empty. Runs against a verify-clinic instance.
//
//   node scripts/ux/text-budget.cjs --seed                  seed demo patients/appointments once
//   node scripts/ux/text-budget.cjs --out before.json        measure
//   node scripts/ux/text-budget.cjs --out after.json --compare before.json
const fs = require("node:fs");
const { chromium } = require("playwright");
const L = require("../../.claude/skills/verify-clinic/scripts/lib.cjs");

const ROUTES = [
  ["login", "/login", null], ["dashboard", "/dashboard", "owner"], ["appointments", "/dashboard/appointments", "owner"],
  ["patients", "/dashboard/patients", "owner"], ["visits", "/dashboard/visits", "doctor"], ["billing", "/dashboard/billing", "owner"],
  ["fees", "/dashboard/fees", "owner"], ["procedures", "/dashboard/procedures", "owner"], ["rooms", "/dashboard/rooms", "owner"],
  ["users", "/dashboard/users", "owner"], ["reports", "/dashboard/reports", "owner"], ["inventory", "/dashboard/inventory", "pharmacist"],
  ["inventory-updates", "/dashboard/inventory-updates", "pharmacist"], ["stock-predictions", "/dashboard/stock-predictions", "pharmacist"],
  ["pharmacy", "/dashboard/pharmacy", "pharmacist"], ["pharmacy-drugs", "/dashboard/pharmacy/drugs", "pharmacist"],
  ["pharmacy-invoices", "/dashboard/pharmacy/invoices", "pharmacist"], ["pharmacy-sales", "/dashboard/pharmacy/sales", "pharmacist"],
  ["pharmacy-bill", "/dashboard/pharmacy/sales/bill", "pharmacist"], ["pharmacy-reports", "/dashboard/pharmacy/reports", "pharmacist"],
  ["reset-password", "/reset-password", null],
];

function readChrome() {
  const root = document.querySelector("main") || document.body;
  const skip = (el) => el.closest("tbody, [role=row], input, textarea, select, option, script, style, [aria-hidden=true], .sr-only, [data-text-budget=data]");
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none") return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const words = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || skip(el) || !visible(el)) continue;
    for (const w of n.textContent.split(/\s+/)) if (w && /\p{L}/u.test(w)) words.push(w);
  }
  return words;
}

async function seed(browser, state) {
  const { page } = await L.openPage(browser, state, "owner");
  const out = await page.evaluate(async (doctorId) => {
    const people = [["Rahul Kumar", "MALE", 34, "9848010411"], ["Lakshmi Iyer", "FEMALE", 63, "9848010274"], ["Meera Nair", "FEMALE", 28, "9848010333"], ["Arjun Reddy", "MALE", 45, "9848010555"], ["Fatima Shaikh", "FEMALE", 39, "9848010666"]];
    const tomorrow = new Date(Date.now() + 5.5 * 3600e3 + 86400e3).toISOString().slice(0, 10);
    const slots = ["10:00-10:30", "10:30-11:00", "11:00-11:30", "11:30-12:00", "12:00-12:30"];
    const codes = [];
    for (let i = 0; i < people.length; i++) {
      const [name, gender, age, phone] = people[i];
      const p = await (await fetch("/api/patients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, gender, age, phone }) })).json();
      const a = await fetch("/api/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId: p.id, doctorId, date: tomorrow, slot: slots[i] }) });
      codes.push(a.status);
    }
    return codes;
  }, state.users.doctor.id);
  console.log("seeded appointments", out.join(","));
}

(async () => {
  const state = L.loadState();
  const browser = await chromium.launch();
  if (L.flag("seed")) await seed(browser, state);
  const report = {};
  for (const [name, url, who] of ROUTES) {
    const opts = { viewport: { width: 1440, height: 900 } };
    const { page, context } = who ? await L.openPage(browser, state, who, opts) : await (async () => { const c = await browser.newContext(opts); return { context: c, page: await c.newPage() }; })();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    await page.goto(state.base + url, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(800);
    const words = await page.evaluate(readChrome);
    const tree = await page.locator("main, body").first().ariaSnapshot();
    const unnamed = tree.split("\n").filter((l) => /^\s*- (button|link|textbox|combobox|checkbox|switch|tab)\s*(\[[^\]]*\])?:?\s*$/.test(l)).map((l) => l.trim());
    report[name] = { words: words.length, unnamed, errors, sample: words.join(" ").slice(0, 400) };
    await context.close();
  }
  await browser.close();

  const total = Object.values(report).reduce((s, r) => s + r.words, 0);
  const unnamed = Object.values(report).reduce((s, r) => s + r.unnamed.length, 0);
  const errors = Object.values(report).reduce((s, r) => s + r.errors.length, 0);
  const out = L.arg("out");
  if (out) fs.writeFileSync(out, JSON.stringify({ total, unnamed, errors, routes: report }, null, 1));

  const base = L.arg("compare") && JSON.parse(fs.readFileSync(L.arg("compare"), "utf8"));
  const rows = Object.entries(report).map(([k, r]) => {
    const b = base?.routes[k];
    return `${k.padEnd(18)} ${String(r.words).padStart(5)}${b ? `  was ${String(b.words).padStart(5)}  ${(((r.words - b.words) / Math.max(b.words, 1)) * 100).toFixed(0).padStart(4)}%` : ""}  unnamed ${r.unnamed.length}${b ? ` (was ${b.unnamed.length})` : ""}${r.errors.length ? `  ERRORS ${r.errors.length}` : ""}`;
  });
  console.log(rows.join("\n"));
  console.log(`TOTAL words ${total}${base ? ` was ${base.total} (${(((total - base.total) / base.total) * 100).toFixed(1)}%)` : ""}  unnamed ${unnamed}${base ? ` was ${base.unnamed}` : ""}  page errors ${errors}`);
  if (base && (unnamed > base.unnamed || errors > base.errors)) process.exitCode = 1;
})();
