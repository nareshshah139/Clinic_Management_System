"use strict";
// Shared fixture helpers for the Terms of Trade (CR-28) verification models.
const { execFileSync } = require("node:child_process");
const PASSWORD = "password123";
const DB = process.env.VERIFY_DB || "postgresql://postgres@127.0.0.1:5433/verify_tot";
const SUPPLIERS = [
  { name: "Medico Wholesale", gstNumber: "36ABCDE1234F1Z5" },
  { name: "Zenith Pharma Distributors", gstNumber: "36PQRSX5678L1Z3" },
  { name: "Apex Drug House", gstNumber: "29AAACA1111A1Z8" },
];
const sql = (q) => execFileSync("psql", [DB, "-At", "-c", q], { encoding: "utf8" }).trim();

// /auth/login is throttled to 5/min per IP, so tokens are cached (valid 1 day) between runs.
const CACHE = process.env.TOT_TOKEN_CACHE || "/tmp/tot-verify-tokens.json";
const fs = require("node:fs");
async function apiLogin(apiUrl, email) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch {}
  if (cache[apiUrl + email]) return cache[apiUrl + email];
  const token = await apiLoginFresh(apiUrl, email);
  cache[apiUrl + email] = token;
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  return token;
}
async function apiLoginFresh(apiUrl, email) {
  const r = await fetch(`${apiUrl}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier: email, password: PASSWORD }) });
  const j = await r.json();
  if (!j.access_token) throw Error(`api login failed for ${email}: ${JSON.stringify(j)}`);
  return j.access_token;
}
async function api(apiUrl, token, method, path, body) {
  const r = await fetch(`${apiUrl}${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
async function setupSuppliers({ apiUrl, shared }) {
  shared.adminToken = await apiLogin(apiUrl, "admin@clinic.test");
  shared.suppliers = {};
  const existing = await api(apiUrl, shared.adminToken, "GET", "/pharmacy/purchase-invoices/suppliers");
  const list = Array.isArray(existing.json) ? existing.json : existing.json?.suppliers || [];
  for (const s of SUPPLIERS) {
    let found = list.find((x) => x.gstNumber === s.gstNumber);
    if (!found) {
      const r = await api(apiUrl, shared.adminToken, "POST", "/pharmacy/purchase-invoices/suppliers", { ...s, verified: true });
      if (r.status >= 300) throw Error(`supplier create failed ${r.status} ${JSON.stringify(r.json)}`);
      found = r.json.supplier || r.json;
    }
    shared.suppliers[s.name] = found.id;
  }
  shared.doctorToken = await apiLogin(apiUrl, "praneeta@clinic.test");
  shared.receptionToken = await apiLogin(apiUrl, "reception@clinic.test");
  shared.pharmacistToken = await apiLogin(apiUrl, "pharmacist@clinic.test");
  shared.tokens = { admin: shared.adminToken, doctor: shared.doctorToken, reception: shared.receptionToken, pharmacist: shared.pharmacistToken };
}
const clearTerms = () => sql("delete from pharmacy_trade_terms");
const countTerms = (where = "true") => Number(sql(`select count(*) from pharmacy_trade_terms where ${where}`));
// The backend throttles /auth/login to 5 per minute per IP, so tokens are obtained once in setup
// and installed as the httpOnly auth_token cookie that the real login route would set.
async function uiLogin(ctx, role) {
  const token = ctx.shared.tokens[role];
  if (!token) throw Error(`no token for ${role}`);
  await ctx.context.addCookies([{ name: "auth_token", value: token, url: ctx.baseUrl, httpOnly: true, sameSite: "Lax" }]);
}
const today = () => new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const dbTerms = (supplierId) => JSON.parse(sql(`select coalesce(json_agg(t order by t."productName"),'[]') from (select "productName","discountPercent","schemeBuy","schemeFree","minExpiryMonths","marginPercent",ptr,"ptrRule",note,"createdById","updatedById",(select "firstName"||' '||"lastName" from users u where u.id="createdById") as "createdByName" from pharmacy_trade_terms where "supplierId"='${supplierId}') t`));
const snapshot = () => sql(`select coalesce(md5(string_agg(concat_ws('~',id,"productName","discountPercent","schemeBuy","schemeFree","minExpiryMonths","marginPercent",ptr,"ptrRule",note,"updatedAt"),'|' order by id)),'empty') from pharmacy_trade_terms`);
const DOLO = { productName: "Dolo 650 Tablet", discountPercent: 12.5, schemeBuy: 10, schemeFree: 1, minExpiryMonths: 18, marginPercent: 18, ptr: 22.4, ptrRule: "MRP less 20%", note: "agreed with rep Ravi" };
const AUG = { productName: "Augmentin 625", discountPercent: 8, schemeBuy: null, schemeFree: null, minExpiryMonths: 12, marginPercent: null, ptr: null, ptrRule: null, note: null };
const seedTerms = (apiUrl, token, supplierId) => api(apiUrl, token, "PUT", "/pharmacy/trade-terms", { supplierId, items: [DOLO, AUG] });
module.exports = { today, dbTerms, snapshot, DOLO, AUG, seedTerms, PASSWORD, SUPPLIERS, sql, api, apiLogin, setupSuppliers, clearTerms, countTerms, uiLogin };
