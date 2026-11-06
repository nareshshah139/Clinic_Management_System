const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { bootStack } = require("./boot.cjs");

const shots = path.resolve(__dirname, "../../output/stack/smoke");

async function visit(stack, page, who, route, file) {
  const user = stack.users[who];
  await stack.login(page, who);
  const errors = [];
  const onError = (e) => errors.push(e.message);
  page.on("pageerror", onError);
  await page.goto(`${stack.base}${route}`, { waitUntil: "domcontentloaded" });
  await page.getByText(user.firstName, { exact: false }).first().waitFor({ timeout: 90000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  page.off("pageerror", onError);
  assert.equal(page.url().includes("/login"), false, `${who} redirected to login on ${route}`);
  await page.screenshot({ path: path.join(shots, file), fullPage: true });
  const overlay = await page.locator("nextjs-portal").locator("[data-nextjs-dialog]").count();
  assert.equal(overlay, 0, `Next error overlay on ${route}`);
  assert.deepEqual(errors, [], `page errors on ${route}`);
  console.log(`PASS ${who} ${route} -> ${file}`);
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const started = Date.now();
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "smoke" });
  console.log(`BOOT ${((Date.now() - started) / 1000).toFixed(1)}s base=${stack.base} api=${stack.api}`);
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await visit(stack, page, "pharmacist", "/dashboard/inventory", "pharmacist-inventory.png");
    await visit(stack, page, "pharmacist", "/dashboard/pharmacy", "pharmacist-pharmacy.png");
    const doctorPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await visit(stack, doctorPage, "doctor", "/dashboard/pharmacy", "doctor-pharmacy.png");
    console.log("SMOKE PASS");
  } finally {
    await browser.close();
    await stack.stop();
  }
})().catch((e) => {
  console.error("SMOKE FAIL", e);
  process.exit(1);
});
