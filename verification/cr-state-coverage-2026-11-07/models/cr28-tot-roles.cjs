"use strict";
// CR-28 Terms of Trade: readers (RECEPTION, PHARMACIST) see the doctors' terms read-only; API writes as a reader are refused.
const T = require("./tot-common.cjs");
const MEDICO = "Medico Wholesale";
const DOLO = T.DOLO;

const model = {
  id: "cr28-tot-roles",
  title: "CR-28 Terms of Trade: reader vs editor views and API authorization",
  initial: "DoctorList",
  maxSteps: 10,
  states: {
    DoctorList: { label: "Doctor: distributor list with Add terms" },
    DoctorDetail: { label: "Doctor: terms with Edit/Delete" },
    AdminList: { label: "Admin: list with Add terms" },
    ReceptionList: { label: "Reception: list, read-only note" },
    ReceptionDetail: { label: "Reception: terms, no controls" },
    PharmacistList: { label: "Pharmacist: list, read-only note" },
    PharmacistDetail: { label: "Pharmacist: terms, no controls" },
    ReceptionWriteDenied: { label: "Reception API write: 403, DB unchanged" },
    PharmacistWriteDenied: { label: "Pharmacist API write: 403, DB unchanged" },
    NoTokenDenied: { label: "No token: 401, DB unchanged", terminal: true },
  },
  transitions: [
    { from: "DoctorList", event: "openDistributor", to: "DoctorDetail" },
    { from: "DoctorList", event: "asAdmin", to: "AdminList" },
    { from: "DoctorList", event: "asReception", to: "ReceptionList" },
    { from: "DoctorList", event: "asPharmacist", to: "PharmacistList" },
    { from: "DoctorDetail", event: "asReception", to: "ReceptionList" },
    { from: "ReceptionList", event: "openDistributor", to: "ReceptionDetail" },
    { from: "PharmacistList", event: "openDistributor", to: "PharmacistDetail" },
    { from: "ReceptionDetail", event: "apiWrite", to: "ReceptionWriteDenied" },
    { from: "PharmacistDetail", event: "apiWrite", to: "PharmacistWriteDenied" },
    { from: "ReceptionDetail", event: "asDoctor", to: "DoctorList" },
    { from: "ReceptionWriteDenied", event: "apiWriteNoToken", to: "NoTokenDenied" },
  ],
};

const roleOf = (state) => (state.startsWith("Doctor") ? "doctor" : state.startsWith("Admin") ? "admin" : state.startsWith("Reception") ? "reception" : "pharmacist");

async function gotoTerms(ctx, role) {
  await ctx.context.clearCookies();
  await T.uiLogin(ctx, role);
  await ctx.page.goto(`${ctx.baseUrl}/dashboard/inventory?area=purchases&view=terms`, { timeout: 120000 });
  await ctx.page.locator("#trade-terms-distributor-search").waitFor({ timeout: 90000 });
  await ctx.page.getByRole("list", { name: "Distributors", exact: true }).waitFor();
}

async function writeAttempt(ctx, token) {
  const api = ctx.apiUrl;
  const body = { supplierId: ctx.shared.medico, items: [{ productName: "Hacked Product", discountPercent: 99 }, { ...DOLO, discountPercent: 1 }] };
  const put = await T.api(api, token, "PUT", "/pharmacy/trade-terms", body);
  const id = T.sql(`select id from pharmacy_trade_terms where "productName"='${DOLO.productName}'`);
  const del = await T.api(api, token, "DELETE", `/pharmacy/trade-terms/${id}`);
  const lookup = await T.api(api, token, "POST", "/pharmacy/trade-terms/lookup", { gstin: "36ABCDE1234F1Z5", products: [{ productName: DOLO.productName }] });
  return { put: put.status, del: del.status, lookup: lookup.status, lookupMatch: lookup.json?.matches?.[0] };
}

const driver = {
  async setup({ apiUrl, shared }) {
    await T.setupSuppliers({ apiUrl, shared });
    shared.medico = shared.suppliers[MEDICO];
  },
  async reset(ctx) {
    T.clearTerms();
    const seeded = await T.seedTerms(ctx.apiUrl, ctx.shared.doctorToken, ctx.shared.medico);
    if (seeded.status >= 300) throw Error(`seed failed ${seeded.status}`);
    ctx.vars = { snapshot: T.snapshot() };
    await gotoTerms(ctx, "doctor");
  },
  actions: {
    openDistributor: async ({ page }) => { await page.getByRole("list", { name: "Distributors", exact: true }).getByRole("button", { name: new RegExp(MEDICO) }).click(); },
    asAdmin: async (ctx) => gotoTerms(ctx, "admin"),
    asReception: async (ctx) => gotoTerms(ctx, "reception"),
    asPharmacist: async (ctx) => gotoTerms(ctx, "pharmacist"),
    asDoctor: async (ctx) => gotoTerms(ctx, "doctor"),
    apiWrite: async (ctx, t) => {
      ctx.vars.attempt = await writeAttempt(ctx, ctx.shared.tokens[t.from.startsWith("Reception") ? "reception" : "pharmacist"]);
    },
    apiWriteNoToken: async (ctx) => {
      const r = await fetch(`${ctx.apiUrl}/pharmacy/trade-terms`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ supplierId: ctx.shared.medico, items: [{ productName: "Anon", discountPercent: 5 }] }) });
      ctx.vars.anonStatus = r.status;
    },
  },
  checks: {
    DoctorList: async ({ page }, check) => editorList(page, check),
    AdminList: async ({ page }, check) => editorList(page, check),
    DoctorDetail: async ({ page }, check) => {
      await page.getByRole("table", { name: "Agreed terms" }).waitFor();
      check(await page.getByRole("button", { name: `Edit terms for ${DOLO.productName}` }).isVisible(), "Edit visible");
      check(await page.getByRole("button", { name: `Delete terms for ${DOLO.productName}` }).isVisible(), "Delete visible");
      check(await page.getByRole("button", { name: "Add terms" }).isVisible(), "Add terms visible");
    },
    ReceptionList: async ({ page }, check) => readerList(page, check),
    PharmacistList: async ({ page }, check) => readerList(page, check),
    ReceptionDetail: async (ctx, check) => readerDetail(ctx, check, "Reception"),
    PharmacistDetail: async (ctx, check) => readerDetail(ctx, check, "Pharmacist"),
    ReceptionWriteDenied: async (ctx, check) => denied(ctx, check),
    PharmacistWriteDenied: async (ctx, check) => denied(ctx, check),
    NoTokenDenied: async (ctx, check) => {
      check(ctx.vars.anonStatus === 401, `unauthenticated PUT is 401, got ${ctx.vars.anonStatus}`);
      check(T.snapshot() === ctx.vars.snapshot, "DB unchanged");
      check(T.countTerms(`"productName"='Anon'`) === 0, "no Anon row");
    },
  },
};

async function editorList(page, check) {
  check(await page.getByRole("button", { name: "Add terms" }).isVisible(), "Add terms visible to editor");
  check((await page.getByRole("note").count()) === 0, "no read-only note for editor");
  check((await page.getByText("Read-only. Only doctors can change terms.").count()) === 0, "no read-only text");
}
async function readerList(page, check) {
  await page.getByRole("note").waitFor();
  check((await page.getByRole("note").innerText()) === "Read-only. Only doctors can change terms.", "read-only note text");
  check((await page.getByRole("button", { name: "Add terms" }).count()) === 0, "no Add terms button for reader");
  check(await page.getByRole("list", { name: "Distributors", exact: true }).getByText("2 products with terms").isVisible(), "reader sees the doctor's saved terms count");
}
async function readerDetail(ctx, check, who) {
  const { page } = ctx;
  const table = page.getByRole("table", { name: "Agreed terms" });
  await table.waitFor();
  const dolo = table.getByRole("row").filter({ hasText: DOLO.productName });
  const txt = await dolo.innerText();
  check(txt.includes("12.5%") && txt.includes("Buy 10 Get 1") && txt.includes("18 months") && txt.includes("₹22.40") && txt.includes("MRP less 20%"), `${who} sees discount, scheme, expiry, PTR and rule`);
  check(txt.includes("agreed with rep Ravi") && txt.includes("18%"), `${who} sees note and margin`);
  check(txt.includes(`by Praneeta Jain on ${T.today()}`), `${who} sees who entered and when`);
  check((await table.getByRole("row").count()) === 3, "header plus two rows");
  check((await page.getByRole("button", { name: /^(Edit|Delete|Add terms|Confirm delete)/ }).count()) === 0, "no Edit, Delete or Add controls");
  check((await page.getByRole("note").innerText()) === "Read-only. Only doctors can change terms.", "read-only note");
}
async function denied(ctx, check) {
  const a = ctx.vars.attempt;
  check(a.put === 403, `PUT as reader is 403, got ${a.put}`);
  check(a.del === 403, `DELETE as reader is 403, got ${a.del}`);
  check(a.lookup === 200 && !!a.lookupMatch, `reader may still look terms up (200 with a match), got ${a.lookup}`);
  check(T.snapshot() === ctx.vars.snapshot, "DB unchanged");
  check(T.countTerms(`"productName"='Hacked Product'`) === 0, "no injected row");
  const d = T.dbTerms(ctx.shared.medico).find((r) => r.productName === DOLO.productName);
  check(d.discountPercent === 12.5, "Dolo discount still 12.5");
}

module.exports = { model, driver };
