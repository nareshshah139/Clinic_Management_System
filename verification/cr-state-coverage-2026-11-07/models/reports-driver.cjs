"use strict";
// Helpers shared by the CR-33c / CR-33d drivers.
const fs = require("node:fs");
const F = require("./reports-fixture.cjs");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const displayDate = (iso) => `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const num = (text) => Number(String(text).replace(/[₹,\s]/g, "").replace(/^\((.*)\)$/, "$1"));
const near = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;
const inr = (v) => "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const [head, ...body] = rows;
  return { head, rows: body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))) };
}

async function useRole(ctx, who) {
  await ctx.context.clearCookies();
  await ctx.context.addCookies([{ name: "auth_token", value: ctx.shared.tokens[who], url: ctx.baseUrl }]);
  ctx.vars.who = who;
}

function trackRequests(ctx) {
  ctx.vars.requests = [];
  ctx.page.on("request", (r) => { if (r.url().includes("/pharmacy/compliance/")) ctx.vars.requests.push(r.url()); });
}

const purchasesUrl = (ctx) => `${ctx.baseUrl}/dashboard/inventory?area=purchases`;

async function openPurchasesHome(ctx, who = "admin") {
  await useRole(ctx, who);
  await ctx.page.goto(purchasesUrl(ctx));
  await ctx.page.locator("select").filter({ hasText: "More tasks" }).first().waitFor({ timeout: 90000 });
}

async function openFromMenu(ctx, label) {
  await ctx.page.locator("select").filter({ hasText: "More tasks" }).first().selectOption({ label });
}

// Run `trigger`, wait for the report response and for the loading skeleton to go away
async function andSettle(ctx, urlPart, trigger) {
  const [resp] = await Promise.all([ctx.page.waitForResponse((r) => r.url().includes(urlPart) && r.request().method() === "GET", { timeout: 60000 }), trigger()]);
  await ctx.page.getByText(/^Loading /).waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
  return resp;
}

// Hold the next report response until `release()` is called (to observe the Loading state)
async function holdResponses(ctx, urlPart) {
  let release; const gate = new Promise((r) => (release = r));
  await ctx.page.route(`**/${urlPart}*`, async (route) => { await gate; await route.continue(); });
  return () => { release(); };
}

async function scrollTable(page, tableName, left) {
  await page.getByRole("table", { name: tableName }).evaluate((el, x) => { let p = el.parentElement; while (p && p.scrollWidth <= p.clientWidth) p = p.parentElement; if (p) p.scrollLeft = x; }, left);
  await page.waitForTimeout(250);
}

async function readCsvDownload(page, click) {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), click()]);
  const path = await download.path();
  return { name: download.suggestedFilename(), ...parseCsv(fs.readFileSync(path, "utf8")) };
}

module.exports = { F, displayDate, num, near, inr, parseCsv, useRole, trackRequests, purchasesUrl, openPurchasesHome, openFromMenu, andSettle, holdResponses, scrollTable, readCsvDownload };
