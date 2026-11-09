"use strict";

const path = require("node:path");
const { chromium } = require("playwright");
const fx = require("./visits-fixtures.cjs");

const baseUrl = process.env.BASE_URL || "http://localhost:3201";
const apiUrl = process.env.API_URL || "http://localhost:4201";
const shotDir = process.env.SHOT_DIR || ".";
const out = [];
const note = (k, v) => out.push([k, v]);

async function layout(page) {
  return page.evaluate(() => {
    const m = document.querySelector("main");
    const bar = document.querySelector('[data-testid="visit-identity"]');
    const r = bar && bar.getBoundingClientRect();
    return {
      docOverflowX: document.documentElement.scrollWidth - window.innerWidth,
      mainOverflowX: m.scrollWidth - m.clientWidth,
      bar: r && { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height) },
      barText: bar && bar.textContent.replace(/\s+/g, " ").trim(),
    };
  });
}

async function visible(locator) {
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return { visible: false };
  const vp = locator.page().viewportSize();
  return { visible: true, inViewport: box.x >= 0 && box.x + box.width <= vp.width, w: Math.round(box.width), h: Math.round(box.height), x: Math.round(box.x) };
}

(async () => {
  const shared = {};
  await fx.createFixtures({ baseUrl, apiUrl, shared });
  const browser = await chromium.launch();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await phone.newPage();
  const ctx = { page, context: phone, baseUrl };
  await fx.loginBrowser(ctx, "praneeta@clinic.test");
  await page.goto(`${baseUrl}/dashboard/visits?patientId=${shared.patients.appt.id}&appointmentId=${shared.appointment.id}&autoStart=true`, { timeout: 120000 });
  await fx.identityBar(page).waitFor({ timeout: 60000 });
  await page.waitForFunction(() => /OPD/.test(document.querySelector('[data-testid="visit-identity"]').textContent), null, { timeout: 30000 });
  await page.screenshot({ path: path.join(shotDir, "phone-01-visit-top.png") });
  note("phone visit top", await layout(page));
  const closeBtn = page.getByText("Patient Context", { exact: true }).locator("xpath=..").getByRole("button");
  note("phone context close button", await visible(closeBtn));
  await closeBtn.click();
  note("phone show-context button", await visible(page.getByRole("button", { name: "Show Patient Context" })));
  await page.screenshot({ path: path.join(shotDir, "phone-02-collapsed.png") });
  await page.getByRole("tab", { name: /Prescription/ }).click();
  await page.locator("#section-treatment-heading").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);
  note("phone rx scrolled", await layout(page));
  note("phone bar in viewport (rx)", await fx.barInViewport(page));
  await page.screenshot({ path: path.join(shotDir, "phone-03-rx-scrolled.png") });
  const oe = page.getByRole("button", { name: "On Examination", exact: true });
  await oe.scrollIntoViewIfNeeded();
  note("phone On Examination heading", await visible(oe));
  await page.screenshot({ path: path.join(shotDir, "phone-04-oe-collapsed.png") });
  await oe.click();
  await page.waitForTimeout(300);
  note("phone On Examination open layout", await layout(page));
  await page.screenshot({ path: path.join(shotDir, "phone-05-oe-open.png") });
  await page.locator("#section-on-examination-content").getByPlaceholder("Detailed physical examination findings...").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shotDir, "phone-06-oe-open-detail.png") });
  await phone.close();

  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dpage = await desk.newPage();
  const dctx = { page: dpage, context: desk, baseUrl };
  await fx.loginBrowser(dctx, "praneeta@clinic.test");
  await dpage.goto(`${baseUrl}/dashboard/visits?patientId=${shared.patients.other.id}&doctorId=${shared.doctors.praneeta.id}&autoStart=true`, { timeout: 120000 });
  await dpage.getByRole("tab", { name: /Prescription/ }).click({ timeout: 120000 });
  await dpage.getByRole("button", { name: "On Examination", exact: true }).waitFor();
  const examFields = await dpage.evaluate(() =>
    [...document.querySelectorAll("textarea, input")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => {
        const label = el.closest("div")?.querySelector("label")?.textContent || "";
        return `${label}|${el.getAttribute("placeholder") || ""}`;
      })
      .filter((s) => /exam/i.test(s)),
  );
  note("visible fields mentioning 'exam' with On Examination collapsed (CR-05 question)", examFields);
  const oeBtn = dpage.getByRole("button", { name: "On Examination", exact: true });
  await oeBtn.click();
  const marker = `PRINTCHECK-${shared.tag}`;
  await dpage.locator("#section-on-examination-content").getByPlaceholder("Detailed physical examination findings...").fill(marker);
  await dpage.locator("#section-on-examination-content").getByPlaceholder("mild/moderate/severe").fill("severe");
  await dpage.getByRole("button", { name: "Print Preview" }).click();
  await dpage.getByRole("dialog").waitFor({ timeout: 30000 });
  await dpage.waitForTimeout(1500);
  const dialogText = (await dpage.getByRole("dialog").textContent()) || "";
  note("print preview contains detailed examination text", dialogText.includes(marker));
  note("print preview contains acne severity", /severe/i.test(dialogText));
  await dpage.screenshot({ path: path.join(shotDir, "desk-print-preview.png") });
  await dpage.keyboard.press("Escape");

  await dpage.goto(`${baseUrl}/dashboard/visits?patientId=cmzzzzzzzzzzzzzzzzzzzzzzz&doctorId=${shared.doctors.praneeta.id}&autoStart=true`, { timeout: 120000 });
  await fx.identityBar(dpage).waitFor({ timeout: 60000 }).catch(() => {});
  await dpage.waitForTimeout(2000);
  note("unknown patient id header", ((await fx.identityBar(dpage).textContent().catch(() => "")) || "").trim());
  await dpage.screenshot({ path: path.join(shotDir, "desk-missing-patient.png") });
  await desk.close();
  await browser.close();
  for (const [k, v] of out) console.log(`${k}: ${JSON.stringify(v)}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
