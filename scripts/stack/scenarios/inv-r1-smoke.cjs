const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");
const { seed, SAMPLE_BILL } = require("./inv-r1-seed.cjs");

const out = path.resolve(__dirname, "../../../output/stack/inv-r1");

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "inv-r1" });
  let browser;
  try {
    console.log(`BOOT base=${stack.base}`);
    await seed(stack);
    const branchId = stack.branch.id;
    assert.equal(await stack.db.drugInventoryChangeRequest.count({ where: { status: "PENDING" } }), 1, "one pending price/stock edit");
    assert.equal(await stack.db.inventoryItemRequest.count({ where: { status: "PENDING" } }), 1, "one pending new-item request");
    assert.equal((await stack.db.supplier.findFirst({ where: { name: "Apex Medico Distributors" } })).drugLicenseNo, "MH-PUN-20B-445566");
    assert.equal(await stack.db.inventoryItem.count({ where: { branchId, unit: "STRIPS", name: "Doxycycline 100mg Capsule" } }), 1);
    console.log(`SEED ok, sample bill total ${SAMPLE_BILL.total}`);
    browser = await chromium.launch();
    for (const who of ["owner", "pharmacist"]) {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      page.setDefaultTimeout(90000);
      await stack.login(page, who);
      await page.goto(`${stack.base}/dashboard/inventory`, { waitUntil: "domcontentloaded" });
      await page.getByText(/awaiting approval/i).first().waitFor();
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await page.screenshot({ path: path.join(out, `${who}-today.png`), fullPage: true });
      await page.goto(`${stack.base}/dashboard/inventory?area=stock&view=list`, { waitUntil: "domcontentloaded" });
      await page.getByText("Doxycycline 100mg Capsule").first().waitFor();
      await page.screenshot({ path: path.join(out, `${who}-stock.png`), fullPage: true });
      console.log(`PASS ${who}`);
    }
    console.log("SMOKE PASS");
  } finally {
    if (browser) await browser.close();
    await stack.stop();
  }
})().catch((e) => {
  console.error("SMOKE FAIL", e);
  process.exit(1);
});
