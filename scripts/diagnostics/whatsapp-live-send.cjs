// Links a real WhatsApp Cloud API number in Clinic profile and sends a test prescription to a real phone.
// The access token is never in this script: the network proxy injects it into requests to graph.facebook.com.
// Usage: STACK_DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/db WA_PHONE_NUMBER_ID=<id> WA_TO="+91 ..." node scripts/diagnostics/whatsapp-live-send.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");
const bcrypt = require("bcryptjs");
const { bootStack } = require("../stack/boot.cjs");

const root = path.resolve(__dirname, "../..");
const out = process.env.WHATSAPP_PROOF_DIR || path.join(root, "verification/whatsapp-linker-2026-11-14/live");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";
const PHONE_ID = process.env.WA_PHONE_NUMBER_ID;
const TO = process.env.WA_TO;
const PROXY_KEYS = ["HTTPS_PROXY", "https_proxy", "NO_PROXY", "no_proxy", "NODE_EXTRA_CA_CERTS"];

(async () => {
  assert.ok(PHONE_ID && TO, "WA_PHONE_NUMBER_ID and WA_TO are required");
  fs.mkdirSync(out, { recursive: true });
  const proxyEnv = Object.fromEntries(PROXY_KEYS.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
  const stack = await bootStack({
    databaseUrl: process.env.STACK_DATABASE_URL,
    label: "whatsapp-live-send",
    backendEnv: { ...proxyEnv, NODE_USE_ENV_PROXY: "1" },
  });
  let browser;
  try {
    const db = stack.db;
    await db.branch.update({ where: { id: stack.branch.id }, data: { phone: "+91 20 2555 0101" } });
    const admin = await db.user.create({
      data: { branchId: stack.branch.id, email: "clinic.admin@stack.example.invalid", firstName: "Meera", lastName: "Kulkarni", role: "ADMIN", password: await bcrypt.hash(stack.users.owner.password, 4), permissions: "[]" },
    });
    stack.users.admin = { id: admin.id, email: admin.email, password: stack.users.owner.password, role: "ADMIN" };

    browser = await puppeteer.launch({ headless: true, executablePath: CHROME, args: ["--no-first-run", "--no-sandbox"], protocolTimeout: 120000 });
    const page = await browser.newPage();
    page.setDefaultTimeout(90000);
    await page.setViewport({ width: 1280, height: 1500, deviceScaleFactor: 2 });
    await stack.login(page, "admin");
    const shot = (name) => page.screenshot({ path: path.join(out, name), fullPage: true });
    const text = (selector) => page.$eval(selector, (el) => el.textContent.trim());

    await page.goto(`${stack.base}/dashboard/clinic`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForSelector('form[aria-label="Link WhatsApp"]', { timeout: 180000 });
    await page.locator("::-p-aria(Phone number ID)").fill(PHONE_ID);
    await page.locator("::-p-aria(Access token)").fill("proxy-injected");
    await page.locator("::-p-aria([name='Link WhatsApp'][role='button'])").click();
    await page.waitForSelector('[data-testid="whatsapp-verified-name"], [role="alert"]');
    const linkedName = await page.$('[data-testid="whatsapp-verified-name"]');
    if (!linkedName) {
      await shot("01-link-refused.png");
      throw Error(`Linking refused: ${await page.$eval('[role="alert"]', (el) => el.textContent.trim())}`);
    }
    console.log("LINKED", await text('[data-testid="whatsapp-verified-name"]'));
    await shot("01-linked-live-number.png");

    await page.locator("::-p-aria(WhatsApp number)").fill(TO);
    await page.locator("::-p-aria([name='Send test prescription'][role='button'])").click();
    await page.waitForSelector('[data-testid="test-send-result"]');
    const result = await text('[data-testid="test-send-result"]');
    const role = await page.$eval('[data-testid="test-send-result"]', (el) => el.getAttribute("role"));
    await shot("02-test-prescription-result.png");
    const rows = await db.whatsAppMessage.findMany({ where: { branchId: stack.branch.id }, orderBy: { createdAt: "asc" } });
    fs.writeFileSync(path.join(out, "result.json"), JSON.stringify({ role, result, messages: rows }, null, 2));
    console.log(role === "status" ? "ACCEPTED" : "REFUSED", result);
    assert.equal(role, "status", `send refused: ${result}`);
  } finally {
    await browser?.close();
    await stack.stop();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
