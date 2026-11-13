"use strict";
// Phone-width (390x844) UX pass over the CR-30 screens. Not a state model: screenshots + layout facts.
// Env: BASE_URL, API_URL, DB_URL, SHOT_DIR. Reuses the token cache written by the lifecycle model's setup.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3203";
const API = process.env.API_URL || "http://localhost:4203";
const OUT = path.join(process.env.SHOT_DIR || os.tmpdir(), "cr30-phone");
const cache = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "cr30-itemreq-tokens.json"), "utf8"));
const token = (e) => cache[e].token;

async function layout(page, label) {
  const facts = await page.evaluate(() => {
    const vw = window.innerWidth;
    const over = [...document.querySelectorAll("button, input, textarea, select, h2, h3, dd, [role=dialog]")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.right > vw + 1 || r.left < -1))
      .map(({ el, r }) => `${el.tagName}:${(el.innerText || el.getAttribute("aria-label") || el.id || "").trim().slice(0, 40)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
    return { docWidth: document.scrollingElement.scrollWidth, vw, over: over.slice(0, 12) };
  });
  await page.screenshot({ path: path.join(OUT, `${label}.png`), fullPage: false });
  console.log(JSON.stringify({ screen: label, horizontalScroll: facts.docWidth > facts.vw, ...facts }));
}

async function inViewport(page, locator, label) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const ok = !!box && box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844;
  console.log(JSON.stringify({ control: label, reachable: ok, box }));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const name = `CR30 Phone ${Date.now().toString(36)}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const as = async (email) => {
    await ctx.clearCookies();
    await ctx.addCookies([{ name: "auth_token", value: token(email), domain: new URL(BASE).hostname, path: "/", httpOnly: true }]);
  };

  // Staff: stock list, add form, confirmation, my requests
  await as("reception@clinic.test");
  await page.goto(`${BASE}/dashboard/inventory?area=stock&view=list`);
  await page.getByRole("button", { name: "Add item" }).waitFor({ timeout: 60_000 });
  await layout(page, "01-staff-stock-list");
  await inViewport(page, page.getByRole("button", { name: "Add item" }), "Add item");
  await page.getByRole("button", { name: "Add item" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.locator("#name").fill(name);
  await dlg.locator("#costPrice").fill("20");
  await dlg.locator("#sellingPrice").fill("25");
  await dlg.locator("#manufacturer").fill("A Very Long Manufacturer Name Private Limited");
  await layout(page, "02-staff-add-form");
  await inViewport(page, dlg.getByRole("button", { name: "Add Item" }), "Add Item (submit)");
  await dlg.getByRole("button", { name: "Add Item" }).click();
  await dlg.getByRole("heading", { name: "Sent to doctor for approval" }).waitFor();
  await layout(page, "03-staff-confirmation");
  await inViewport(page, dlg.getByRole("button", { name: "Close" }).first(), "Close confirmation");
  await dlg.getByRole("button", { name: "Close" }).first().click();
  await page.getByLabel("Inventory task", { exact: true }).selectOption("approvals");
  await page.getByRole("heading", { name: "My item requests" }).waitFor();
  await page.getByText(/Loading requests/).waitFor({ state: "detached" }).catch(() => {});
  await layout(page, "04-staff-my-requests");

  // Doctor: task select label, New items tab, card, reject dialog
  await as("praneeta@clinic.test");
  await page.goto(`${BASE}/dashboard/inventory?area=stock&view=list`);
  await page.getByRole("button", { name: "Add item" }).waitFor({ timeout: 60_000 });
  const opt = await page.getByLabel("Inventory task", { exact: true }).locator('option[value="approvals"]').textContent();
  console.log(JSON.stringify({ phoneTaskOption: opt }));
  await layout(page, "05-doctor-stock-list");
  await page.getByLabel("Inventory task", { exact: true }).selectOption("approvals");
  await page.getByRole("tab", { name: /New items/ }).click();
  await page.getByRole("heading", { name: "New item requests" }).waitFor();
  await page.getByText(/Loading requests/).waitFor({ state: "detached" }).catch(() => {});
  await layout(page, "06-doctor-new-items");
  const card = page.locator("li").filter({ has: page.locator(`h3:text-is(${JSON.stringify(name)})`) });
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, "07-doctor-card.png") });
  await inViewport(page, card.getByRole("button", { name: "Approve" }), "card Approve");
  await inViewport(page, card.getByRole("button", { name: "Reject" }), "card Reject");
  await card.getByRole("button", { name: "Reject" }).click();
  await page.getByRole("dialog").locator("textarea").fill("Phone check cleanup");
  await layout(page, "08-doctor-reject-dialog");
  await inViewport(page, page.getByRole("dialog").getByRole("button", { name: "Reject" }), "dialog Reject");
  await page.getByRole("dialog").getByRole("button", { name: "Reject" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, "09-doctor-rejected-card.png") });
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
