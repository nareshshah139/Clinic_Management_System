const path = require("node:path");
const W = "/home/user/wt/visit-header";
const { chromium } = require("/opt/node-tools/node_modules/playwright");
const { bootStack } = require(W + "/scripts/stack/boot.cjs");
const { seed } = require(W + "/scripts/ux/journeys/seed.cjs");
const out = __dirname;
const log = (...a) => console.log(...a);
(async () => {
  const stack = await bootStack({ label: "ux-review-vh" });
  const browser = await chromium.launch();
  try {
    const seeded = await seed(stack);
    const info = { base: stack.base, users: stack.users };
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
    const page = await ctx.newPage();
    await page.goto(`${info.base}/login`, { waitUntil: "domcontentloaded" });
    const u = info.users.doctor;
    const st = await page.evaluate(async ({ identifier, password }) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) })).status, { identifier: u.email, password: u.password });
    log("login", st);
    await page.goto(`${info.base}/dashboard`, { waitUntil: "domcontentloaded" });
    const next = page.getByRole("list", { name: "Today's appointments" }).getByRole("listitem").filter({ hasText: "Vikram Patil" });
    const link = next.getByRole("link", { name: "Start visit" });
    await link.waitFor();
    const href = await link.getAttribute("href");
    log("href", href);
    await link.click();
    await page.getByText("Chief Complaints").first().waitFor();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: out + "/a-desktop.png" });
    log("header text:", (await page.locator("div.sticky").first().innerText().catch(() => "none")).replace(/\n/g, " | "));
    // tele-video
    await page.selectOption("#visit-consultation-type", "TELE_VIDEO");
    await page.waitForTimeout(300);
    await page.screenshot({ path: out + "/b-tele.png" });
    const cb = page.getByLabel("Patient consented to tele-video consultation");
    log("consent visible", await cb.isVisible(), "box", JSON.stringify(await cb.boundingBox()));
    await page.locator("textarea").first().fill("Itchy patches");
    for (const name of ["Save Draft", "Complete visit"]) {
      const b = page.getByRole("button", { name }).first();
      log(name, "disabled:", await b.isDisabled().catch(() => "n/a"));
    }
    await page.getByRole("button", { name: "Save Draft" }).first().click({ force: true }).catch(e => log("click err", e.message.slice(0,80)));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: out + "/c-tele-save.png" });
    log("body has consent required msg:", await page.getByText(/consent/i).allInnerTexts().then(a => a.slice(0,5)));
    await cb.check();
    await page.selectOption("#visit-consultation-type", "IN_PERSON");
    // diagnosis suggestions
    const diag = page.getByRole("textbox", { name: "Diagnosis" });
    await diag.click(); await diag.pressSequentially("Pso", { delay: 50 });
    await page.waitForTimeout(1200);
    const opts = page.locator(".diag-autocomplete div.cursor-pointer");
    log("diag options count", await opts.count());
    if (await opts.count()) {
      const t = await opts.first().innerText();
      await opts.first().click();
      log("clicked", t, "-> value", await diag.inputValue());
    }
    await page.screenshot({ path: out + "/d-diag.png" });
    // scroll & sticky
    await page.mouse.move(700, 500);
    await page.mouse.wheel(0, 1200); await page.waitForTimeout(500);
    await page.screenshot({ path: out + "/e-scrolled.png" });
    const hdr = page.locator("div.md\\:sticky").first();
    log("sticky header box after scroll", JSON.stringify(await hdr.boundingBox()));
    // Help menu / tour
    await hdr.getByRole("button", { name: "Help" }).click();
    await page.getByRole("menuitem", { name: "Visit tour" }).click();
    await page.waitForTimeout(2000);
    log("intro tooltip visible:", await page.locator(".introjs-tooltip").count());
    await page.screenshot({ path: out + "/f-tour.png" });
    await page.keyboard.press("Escape");
    // Back with appointment, in-app
    await page.goto(`${info.base}/dashboard`, { waitUntil: "domcontentloaded" });
    // new tab direct link
    const tab = await ctx.newPage();
    await tab.goto(`${info.base}${href}`, { waitUntil: "domcontentloaded" });
    await tab.getByText("Chief Complaints").first().waitFor();
    log("newtab history length", await tab.evaluate(() => history.length));
    const before = tab.url();
    await tab.getByRole("button", { name: "Back" }).click();
    await tab.waitForTimeout(2000);
    log("newtab Back: before", before, "after", tab.url(), "form still shown:", await tab.getByText("Chief Complaints").first().isVisible().catch(()=>false));
    await tab.screenshot({ path: out + "/g-newtab-back.png" });
    // phone
    const ph = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ph.addCookies(await ctx.cookies());
    const p2 = await ph.newPage();
    await p2.goto(`${info.base}${href}`, { waitUntil: "domcontentloaded" });
    await p2.getByText("Chief Complaints").first().waitFor();
    await p2.waitForTimeout(1000);
    await p2.mouse.wheel(0, 1500); await p2.waitForTimeout(500);
    await p2.screenshot({ path: out + "/h-phone-scrolled.png" });
    log("phone: Vikram visible in viewport:", await p2.getByText("Vikram Patil").first().isVisible(), await p2.getByText("Vikram Patil").first().evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
  } catch (e) { console.log("ERR", e); }
  finally { await browser.close(); await stack.stop(); }
})();
