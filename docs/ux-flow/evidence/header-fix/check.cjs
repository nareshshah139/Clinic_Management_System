const path = require("node:path");
const { chromium } = require("playwright");
const root = "/home/user/Clinic_Management_System";
const { bootStack } = require(path.join(root, "scripts/stack/boot.cjs"));
const { seed } = require(path.join(root, "scripts/ux/journeys/seed.cjs"));
const out = __dirname;
(async () => {
  const stack = await bootStack({ label: "ux-header-fix" });
  const browser = await chromium.launch();
  try {
    const seeded = await seed(stack);
    const appt = seeded.appointments.today[3];
    const url = `${stack.base}/dashboard/visits?patientId=${appt.patientId}&appointmentId=${appt.id}&autoStart=true`;
    for (const [name, viewport] of [["desktop", { width: 1366, height: 850 }], ["phone", { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport, timezoneId: "Asia/Kolkata" });
      const page = await context.newPage();
      await stack.login(page, "doctor");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.getByText("Chief Complaints").first().waitFor({ timeout: 120000 });
      await page.waitForTimeout(1500);
      const nameBox = async () => page.evaluate(() => {
        const hits = [...document.querySelectorAll("*")].filter((el) => el.children.length === 0 && /Vikram Patil/.test(el.textContent || "")).map((el) => el.getBoundingClientRect()).filter((b) => b.width && b.height);
        return hits.map((b) => Math.round(b.top));
      });
      console.log(name, "name tops on arrival", JSON.stringify(await nameBox()));
      await page.screenshot({ path: path.join(out, `${name}-arrival.png`) });
      await page.evaluate(() => { const els = [document.scrollingElement, ...document.querySelectorAll("main, [class*=overflow-y-auto], [class*=overflow-auto]")]; for (const el of els) if (el && el.scrollHeight > el.clientHeight) el.scrollTop = 900; });
      await page.waitForTimeout(600);
      console.log(name, "name tops after scrolling 900", JSON.stringify(await nameBox()));
      await page.screenshot({ path: path.join(out, `${name}-scrolled.png`) });
      if (name === "desktop") {
        await page.evaluate(() => { const els = [document.scrollingElement, ...document.querySelectorAll("main, [class*=overflow-y-auto], [class*=overflow-auto]")]; for (const el of els) if (el) el.scrollTop = 0; });
        await page.getByRole("button", { name: "Help" }).click();
        await page.getByRole("menuitem", { name: "Visit tour" }).click();
        await page.waitForTimeout(2000);
        console.log("tour tooltip visible:", await page.locator(".introjs-tooltip").first().isVisible().catch(() => false));
        await page.screenshot({ path: path.join(out, "desktop-tour.png") });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.getByText("Chief Complaints").first().waitFor({ timeout: 120000 });
        await page.getByRole("link", { name: "Back" }).click();
        await page.waitForURL(/\/dashboard$/, { timeout: 60000 });
        console.log("Back from a fresh tab lands on:", new URL(page.url()).pathname);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await stack.stop();
  }
})();
