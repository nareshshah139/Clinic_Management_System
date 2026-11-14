const path = require("node:path");
const fs = require("node:fs");
const WT = "/home/user/wt/appointments";
const { chromium } = require(require.resolve("playwright", { paths: [WT] }));
const { bootStack } = require(path.join(WT, "scripts/stack/boot.cjs"));
const { seed } = require(path.join(WT, "scripts/ux/journeys/seed.cjs"));
const OUT = path.join(__dirname, "shots");
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[probe]", ...a);

async function login(page, base, user) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  let status;
  for (let i = 0; i < 8; i++) {
    status = await page.evaluate(async ({ identifier, password }) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) })).status, { identifier: user.email, password: user.password });
    if (status !== 429) break;
    await page.waitForTimeout(10000);
  }
  log("login", user.role, status);
}

async function step(name, fn) {
  try { await fn(); } catch (e) { log(`STEP ${name} ERROR`, e.message.split("\n")[0]); }
}

(async () => {
  const stack = await bootStack({ label: "ux-review-appt-probe" });
  const browser = await chromium.launch();
  try {
    const seeded = await seed(stack);
    const base = stack.base;
    const tomorrow = seeded.tomorrow;
    log("tomorrow", tomorrow, "today", seeded.today);
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 }, timezoneId: "Asia/Kolkata", locale: "en-IN" });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    await login(page, base, stack.users.reception);
    const box = () => page.getByPlaceholder("Name or phone");
    const value = () => box().inputValue();

    // A: auto-select on a prefix, then keep typing (slow typist)
    await step("A", async () => {
      await page.goto(`${base}/dashboard/appointments?date=${tomorrow}`, { waitUntil: "domcontentloaded" });
      await page.locator('[data-calendar="CONFIRMED"]').getByText("Kavita Naik").first().waitFor();
      log("A date input", await page.getByLabel("Date").inputValue());
      const firstRow = await page.locator("[data-appointment-block]").first().boundingBox();
      log("A first appointment row y", firstRow && Math.round(firstRow.y));
      await box().click();
      await box().pressSequentially("Kav", { delay: 120 });
      await page.waitForTimeout(1500);
      log("A after 'Kav' + pause:", JSON.stringify(await value()));
      await box().pressSequentially("ita", { delay: 120 });
      await page.waitForTimeout(2000);
      log("A after continuing 'ita':", JSON.stringify(await value()));
      const dlg = page.getByRole("dialog");
      log("A dialog open:", await dlg.count(), (await dlg.count()) ? JSON.stringify((await dlg.first().innerText()).slice(0, 200)) : "");
      log("A no-match note:", await page.getByText("No matching patients found.").count());
      await page.screenshot({ path: path.join(OUT, "A-continue-typing.png") });
    });

    // A2: phone prefix
    await step("A2", async () => {
      await page.goto(`${base}/dashboard/appointments?date=${tomorrow}`, { waitUntil: "domcontentloaded" });
      await page.locator('[data-calendar="CONFIRMED"]').getByText("Kavita Naik").first().waitFor();
      await box().click();
      await box().pressSequentially("98220111", { delay: 60 });
      await page.waitForTimeout(1500);
      log("A2 after '98220111':", JSON.stringify(await value()), "list rows", await page.locator(".max-h-40 > div").count());
      await box().pressSequentially("1", { delay: 60 });
      await page.waitForTimeout(1500);
      log("A2 after '982201111':", JSON.stringify(await value()), "list rows", await page.locator(".max-h-40 > div").count());
      await page.screenshot({ path: path.join(OUT, "A2-phone.png") });
    });

    // B: stale timer overrides an explicit pick from the list (slow network)
    await step("B", async () => {
      await page.goto(`${base}/dashboard/appointments?date=${tomorrow}`, { waitUntil: "domcontentloaded" });
      await page.locator('[data-calendar="CONFIRMED"]').getByText("Kavita Naik").first().waitFor();
      await box().click();
      await box().pressSequentially("Ka", { delay: 30 });
      await page.locator(".max-h-40 > div").first().waitFor();
      log("B list for 'Ka':", JSON.stringify(await page.locator(".max-h-40 > div").allInnerTexts()));
      await page.route("**/patients?**", async (route) => { await new Promise((r) => setTimeout(r, 1200)); await route.continue(); });
      await box().pressSequentially("v", { delay: 0 });
      await page.locator(".max-h-40 > div", { hasText: "Prakash Kale" }).click();
      log("B right after clicking Prakash:", JSON.stringify(await value()));
      await page.waitForTimeout(2500);
      log("B 2.5s later:", JSON.stringify(await value()));
      await page.unroute("**/patients?**");
    });

    // C: item 9, lower half of the 10:00-10:30 tile (Kavita 10:00-10:15) at the default grid
    await step("C", async () => {
      await page.goto(`${base}/dashboard/appointments?date=${tomorrow}`, { waitUntil: "domcontentloaded" });
      await page.locator('[data-calendar="CONFIRMED"]').getByText("Kavita Naik").first().waitFor();
      await box().click();
      await box().pressSequentially("Imran", { delay: 30 });
      await page.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.value.startsWith("Imran Sheikh")));
      const block = await page.locator('[data-calendar="CONFIRMED"] [data-appointment-block]').first().boundingBox();
      log("C Kavita block", JSON.stringify(block));
      await page.mouse.click(block.x + block.width / 2, block.y + block.height * 1.5);
      const dlg = page.getByRole("dialog");
      await dlg.waitFor({ timeout: 5000 }).catch(() => {});
      log("C dialog after clicking the free lower half:", (await dlg.count()) ? JSON.stringify((await dlg.first().innerText()).slice(0, 160)) : "none");
      await page.screenshot({ path: path.join(OUT, "C-gap.png") });
      if (await dlg.count()) await page.keyboard.press("Escape");
    });

    // D: same-day warning ignores status: cancel Kavita's 10:00 tomorrow, then select her
    await step("D", async () => {
      const appt = seeded.appointments.tomorrow.find((a) => a.patient === "Kavita Naik");
      await stack.db.appointment.update({ where: { id: appt.id }, data: { status: "CANCELLED" } });
      await page.goto(`${base}/dashboard/appointments?date=${tomorrow}`, { waitUntil: "domcontentloaded" });
      await page.locator('[data-calendar="SCHEDULED"]').getByText("Imran Sheikh").first().waitFor();
      await box().click();
      await box().pressSequentially("Kavita", { delay: 30 });
      await page.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.value.startsWith("Kavita Naik")));
      await page.waitForTimeout(800);
      log("D Kavita row visible on calendar:", await page.locator("[data-appointment-block]", { hasText: "Kavita" }).count());
      log("D status notes:", JSON.stringify(await page.getByRole("status").allInnerTexts()));
      await page.screenshot({ path: path.join(OUT, "D-cancelled-warning.png") });
      await stack.db.appointment.update({ where: { id: appt.id }, data: { status: "CONFIRMED" } });
    });

    // E: row Confirm as reception on today's scheduled row
    await step("E", async () => {
      await page.goto(`${base}/dashboard/appointments?date=${seeded.today}`, { waitUntil: "domcontentloaded" });
      await page.locator('[data-calendar="SCHEDULED"]').getByText("Aditya Bhosale").first().waitFor();
      log("E primary buttons:", JSON.stringify(await page.locator("[data-appointment-primary]").evaluateAll((els) => els.map((e) => [e.textContent, getComputedStyle(e).display]))));
      await page.screenshot({ path: path.join(OUT, "E-today-reception.png") });
      const btn = page.locator("[data-appointment-block]", { hasText: "Aditya" }).locator("[data-appointment-primary]");
      await btn.click();
      await page.waitForTimeout(2000);
      log("E dialog after Confirm:", await page.getByRole("dialog").count());
      log("E Aditya now in Confirmed:", await page.locator('[data-calendar="CONFIRMED"] [data-appointment-block]', { hasText: "Aditya" }).count());
      // keyboard: tab order lands on Confirm; Enter
      const pooja = page.locator("[data-appointment-block]", { hasText: "Pooja" });
      await pooja.locator("button").first().focus();
      await page.keyboard.press("Tab");
      log("E focus after Tab from Pooja row:", await page.evaluate(() => document.activeElement?.textContent));
    });

    // F: invalid ?date= values
    for (const d of ["2026-02-30", "2026-13-45", "garbage"]) {
      await step(`F ${d}`, async () => {
        await page.goto(`${base}/dashboard/appointments?date=${d}`, { waitUntil: "domcontentloaded" });
        await page.getByText("Doctor Calendar").waitFor();
        await page.waitForTimeout(2500);
        log(`F ${d} date input=`, JSON.stringify(await page.getByLabel("Date").inputValue()), "schedule error:", await page.getByText("Failed to load schedule").count(), "regions:", await page.locator("[data-calendar]").count());
      });
    }
    await page.screenshot({ path: path.join(OUT, "F-garbage.png") });

    // G: phone width as doctor, today: is Start visit reachable from the row?
    await step("G", async () => {
      const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Kolkata", locale: "en-IN" });
      const p2 = await ctx2.newPage();
      p2.setDefaultTimeout(30000);
      await login(p2, base, stack.users.doctor);
      await p2.goto(`${base}/dashboard/appointments?date=${seeded.today}`, { waitUntil: "domcontentloaded" });
      await p2.locator('[data-calendar="CONFIRMED"]').getByText("Vikram").first().waitFor();
      log("G phone primary visible:", JSON.stringify(await p2.locator("[data-appointment-primary]").evaluateAll((els) => els.map((e) => [e.textContent, getComputedStyle(e).display, Math.round(e.closest("[data-appointment-block]").getBoundingClientRect().width)]))));
      await p2.screenshot({ path: path.join(OUT, "G-phone-doctor.png"), fullPage: false });
      await p2.setViewportSize({ width: 1366, height: 850 });
      await p2.waitForTimeout(800);
      log("G desktop name truncation:", JSON.stringify(await p2.locator("[data-patient-name]").evaluateAll((els) => els.map((e) => [e.textContent, e.scrollWidth > e.clientWidth]))));
      await ctx2.close();
    });
  } finally {
    await browser.close().catch(() => {});
    await stack.stop();
    log("stack stopped");
  }
})().catch((e) => { console.error(e); process.exit(1); });
