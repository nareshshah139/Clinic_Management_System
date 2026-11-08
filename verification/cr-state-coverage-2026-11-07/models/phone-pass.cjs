"use strict";
// Phone-width (390x844) UX pass over Terms of Trade and the invoice panel. Not part of the model.
const { chromium } = require("/opt/node-tools/node_modules/playwright");
const T = require("./tot-common.cjs");
const OUT = process.env.SHOT_DIR + "/phone/";
require("node:fs").mkdirSync(OUT, { recursive: true });
(async () => {
  const shared = {}; const api = "http://localhost:4202", base = "http://localhost:3202";
  await T.setupSuppliers({ apiUrl: api, shared });
  T.clearTerms(); await T.seedTerms(api, shared.doctorToken, shared.suppliers["Medico Wholesale"]);
  const b = await chromium.launch();
  const overflow = (p) => p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  for (const role of ["doctor", "reception"]) {
    const c = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage();
    await c.addCookies([{ name: "auth_token", value: shared.tokens[role], url: base, httpOnly: true }]);
    await p.goto(`${base}/dashboard/inventory?area=purchases&view=terms`, { timeout: 120000 });
    await p.locator("#trade-terms-distributor-search").waitFor({ timeout: 90000 });
    await p.waitForTimeout(800); await p.screenshot({ path: OUT + `${role}-list.png` });
    console.log(role, "list", JSON.stringify(await overflow(p)));
    await p.getByRole("list", { name: "Distributors", exact: true }).getByRole("button", { name: /Medico/ }).click();
    await p.getByRole("table", { name: "Agreed terms" }).waitFor();
    await p.screenshot({ path: OUT + `${role}-detail.png`, fullPage: true });
    console.log(role, "detail page", JSON.stringify(await overflow(p)));
    const tbl = p.getByRole("table", { name: "Agreed terms" }); const bb = await tbl.boundingBox();
    console.log(role, "table box", JSON.stringify(bb), "edit button visible in viewport:", role === "doctor" ? await p.getByRole("button", { name: /Edit terms for Dolo/ }).evaluate((e) => { const r = e.getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0; }) : "n/a");
    if (role === "doctor") {
      await p.getByRole("button", { name: "Add terms" }).click();
      await p.getByRole("button", { name: "Next", exact: true }).waitFor();
      await p.screenshot({ path: OUT + "doctor-wizard-step2.png", fullPage: true });
      console.log("wizard", JSON.stringify(await overflow(p)));
      await p.locator("#trade-terms-product-search").fill("Dolo 650 Tablet");
      await p.getByRole("button", { name: /as typed/ }).click();
      await p.getByRole("button", { name: "Next", exact: true }).click();
      await p.screenshot({ path: OUT + "doctor-wizard-step3.png", fullPage: true });
      console.log("wizard step3", JSON.stringify(await overflow(p)));
    }
    await c.close();
  }
  const c = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage();
  await c.addCookies([{ name: "auth_token", value: shared.tokens.pharmacist, url: base, httpOnly: true }]);
  await p.goto(`${base}/dashboard/inventory?area=purchases&view=intake`, { timeout: 120000 });
  await p.getByRole("link", { name: "Type instead" }).click({ timeout: 90000 });
  await p.locator('#saved-purchase-supplier option', { hasText: "Medico" }).waitFor({ state: "attached" });
  await p.selectOption("#saved-purchase-supplier", { label: "Medico Wholesale — 36ABCDE1234F1Z5" });
  await p.locator('input[id$="-product"]').first().fill("dolo 650 tablet");
  await p.getByTestId("agreed-term-hint").waitFor();
  await p.getByRole("region", { name: "Agreed terms" }).scrollIntoViewIfNeeded(); await p.screenshot({ path: OUT + "invoice-panel.png" });
  await p.getByTestId("agreed-term-hint").scrollIntoViewIfNeeded(); await p.screenshot({ path: OUT + "invoice-hint.png" });
  console.log("invoice", JSON.stringify(await overflow(p)));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
