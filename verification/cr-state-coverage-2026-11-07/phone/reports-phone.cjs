"use strict";
// Phone-width (390x844) UX pass over both reports. Not part of the state models.
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");
const F = require("../models/reports-fixture.cjs");
const BASE = process.env.BASE_URL || "http://localhost:3204", API = process.env.API_URL || "http://localhost:4204";
const SHOTS = process.env.SHOT_DIR || "/tmp";
(async () => {
  const dir = path.join(SHOTS, "phone"); fs.mkdirSync(dir, { recursive: true });
  const tok = await F.login(API, "admin@clinic.test");
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await c.addCookies([{ name: "auth_token", value: tok, url: BASE }]);
  const page = await c.newPage();
  for (const [view, ready] of [["daywise", "#day-wise-start"], ["margin", "#margin-start"]]) {
    await page.goto(`${BASE}/dashboard/inventory?area=purchases&view=${view}`);
    await page.locator(ready).waitFor({ timeout: 90000 });
    await page.getByRole("table").first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const over = [...document.querySelectorAll("button,input,select,a")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1); }).map((e) => (e.getAttribute("aria-label") || e.id || e.innerText || e.tagName).slice(0, 30));
      const small = [...document.querySelectorAll("button,input,select")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 32 || r.width < 32) && !e.closest("table"); }).map((e) => `${(e.getAttribute("aria-label") || e.id || e.innerText || e.tagName).slice(0, 24)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
      const tbl = document.querySelector("table"); let sc = tbl.parentElement; while (sc && sc.scrollWidth <= sc.clientWidth) sc = sc.parentElement;
      return { vw, pageScrollW: document.documentElement.scrollWidth, controlsOutsideViewport: over, smallTargets: small, tableScrollContainer: sc ? { client: sc.clientWidth, scroll: sc.scrollWidth } : null };
    });
    console.log(view, JSON.stringify(m));
    await page.screenshot({ path: path.join(dir, `${view}-top.png`) });
    await page.getByRole("table").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(dir, `${view}-table.png`) });
    const tip = page.getByRole("button", { name: /^How .* is calculated$/ }).first();
    await tip.tap(); await page.waitForTimeout(500);
    const t = page.getByRole("tooltip").first();
    if (await t.count()) { const bb = await t.boundingBox(); console.log(view, "tooltip box", JSON.stringify(bb)); }
    await page.screenshot({ path: path.join(dir, `${view}-tooltip.png`) });
  }
  await b.close();
})();
