// Counts the words a person sees on each working screen, so "less text" is a number.
// Usage: STACK_DATABASE_URL=... node scripts/ux/measure-words.cjs <label> [--root <checkout to boot>]
// --root lets the same screens be measured on an older checkout; the seed always comes from this one.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const here = path.resolve(__dirname, "../..");
const args = process.argv.slice(2);
const label = args[0];
const root = args.includes("--root") ? path.resolve(args[args.indexOf("--root") + 1]) : here;
if (!label) throw Error("Usage: measure-words.cjs <label> [--root <checkout>]");
const { bootStack } = require(path.join(root, "scripts/stack/boot.cjs"));
const { seed } = require("./journeys/seed.cjs");

const SCREENS = [
  ["sign-in", null, () => "/login"],
  ["reception landing", "reception", () => "/dashboard"],
  ["appointments", "reception", () => "/dashboard/appointments"],
  ["patients list", "reception", () => "/dashboard/patients"],
  ["patient page", "doctor", (s) => `/dashboard/patients/${s.patients[1].id}`],
  ["doctor landing", "doctor", () => "/dashboard"],
  ["visit form", "doctor", (s) => `/dashboard/visits?patientId=${s.appointments.today[2].patientId}&appointmentId=${s.inProgress.appointmentId}&visitId=${s.inProgress.visitId}`],
  ["pharmacist landing", "pharmacist", () => "/dashboard"],
  ["pharmacy counter", "pharmacist", () => "/dashboard/pharmacy?section=counter"],
  ["new pharmacy bill", "pharmacist", () => "/dashboard/pharmacy/sales/bill"],
  ["inventory", "pharmacist", () => "/dashboard/inventory"],
  ["owner landing", "owner", () => "/dashboard"],
];

async function signIn(page, stack, who) {
  await page.goto(`${stack.base}/login`, { waitUntil: "domcontentloaded" });
  if (!who) return;
  const user = stack.users[who];
  for (let i = 0; i < 9; i++) {
    const status = await page.evaluate(
      async ({ identifier, password }) =>
        (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) })).status,
      { identifier: user.email, password: user.password },
    );
    if (status === 201) return;
    if (status !== 429) throw Error(`login ${who} returned ${status}`);
    await page.waitForTimeout(10000);
  }
  throw Error(`login ${who} stayed rate limited`);
}

(async () => {
  const stack = await bootStack({ label: `ux-words-${label}` });
  const browser = await chromium.launch();
  const rows = [];
  try {
    const seeded = await seed(stack);
    for (const [name, who, route] of SCREENS) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 850 }, timezoneId: "Asia/Kolkata", locale: "en-IN" });
      const page = await context.newPage();
      await signIn(page, stack, who);
      if (who) await page.goto(`${stack.base}${route(seeded)}`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const text = await page.evaluate(() => (document.querySelector("main") || document.body).innerText);
      const words = text.split(/\s+/).filter(Boolean).length;
      const firstScreen = await page.evaluate(() => {
        const seen = [];
        const walker = document.createTreeWalker(document.querySelector("main") || document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const box = node.parentElement?.getBoundingClientRect();
          if (box && box.width && box.height && box.top < window.innerHeight && box.bottom > 0 && node.textContent.trim()) seen.push(node.textContent.trim());
        }
        return seen.join(" ").split(/\s+/).filter(Boolean).length;
      });
      rows.push({ screen: name, persona: who || "none", words, firstScreen });
      console.log(`${name.padEnd(20)} words=${String(words).padStart(5)} first-screen=${String(firstScreen).padStart(4)}`);
      await context.close();
    }
  } finally {
    await browser.close();
    await stack.stop();
  }
  const out = path.join(here, "docs/ux-flow/scorecards", `words-${label}.json`);
  fs.writeFileSync(out, JSON.stringify(rows, null, 2) + "\n");
})();
