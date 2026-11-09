"use strict";
// CR-28 Terms of Trade: the saved terms appear on the purchase invoice screen next to what the invoice says.
const T = require("./tot-common.cjs");
const MEDICO = "Medico Wholesale";
const ZENITH = "Zenith Pharma Distributors";
const SUPPLIER_LABEL = { [MEDICO]: "Medico Wholesale — 36ABCDE1234F1Z5", [ZENITH]: "Zenith Pharma Distributors — 36PQRSX5678L1Z3" };
const AGREED_DOLO = "12.5% · Buy 10 Get 1 · min 18 mo expiry · PTR ₹22.40 · MRP less 20%";

const model = {
  id: "cr28-tot-invoice",
  title: "CR-28 Terms of Trade: agreed terms on purchase invoice entry",
  initial: "InvoiceBlank",
  maxSteps: 8,
  states: {
    InvoiceBlank: { label: "Invoice entry, no supplier" },
    ZenithChosen: { label: "Supplier without terms: no panel" },
    ZenithTyped: { label: "Supplier without terms, product typed: no hint", terminal: true },
    MedicoChosen: { label: "Supplier with terms: panel lists both products" },
    HintExact: { label: "Line product matches: hint beside invoice values" },
    HintCase: { label: "Differently cased free-typed name still matches" },
    NoMatch: { label: "Unmatched product: panel but no hint" },
    Compare: { label: "Hint tracks what the invoice line says" },
    HintUpdated: { label: "Terms changed by doctor: new values shown" },
    HintGone: { label: "Term deleted by doctor: no hint, panel without it" },
  },
  transitions: [
    { from: "InvoiceBlank", event: "pickZenith", to: "ZenithChosen" },
    { from: "InvoiceBlank", event: "pickMedico", to: "MedicoChosen" },
    { from: "ZenithChosen", event: "typeDolo", to: "ZenithTyped" },
    { from: "MedicoChosen", event: "pickZenith", to: "ZenithChosen" },
    { from: "MedicoChosen", event: "typeDolo", to: "HintExact" },
    { from: "MedicoChosen", event: "typeCased", to: "HintCase" },
    { from: "MedicoChosen", event: "typeOther", to: "NoMatch" },
    { from: "HintExact", event: "fillInvoiceLine", to: "Compare" },
    { from: "HintExact", event: "doctorChangesTerm", to: "HintUpdated" },
    { from: "HintExact", event: "doctorDeletesTerm", to: "HintGone" },
  ],
};

async function openInvoice(ctx) {
  await ctx.context.clearCookies();
  await T.uiLogin(ctx, "pharmacist");
  await ctx.page.goto(`${ctx.baseUrl}/dashboard/inventory?area=purchases&view=intake`, { timeout: 120000 });
  await ctx.page.getByRole("link", { name: "Type instead" }).click({ timeout: 90000 });
  await ctx.page.locator("#saved-purchase-supplier").waitFor();
  await ctx.page.locator('#saved-purchase-supplier option', { hasText: "Medico Wholesale" }).waitFor({ state: "attached", timeout: 30000 });
}
const pick = async ({ page }, name) => { await page.selectOption("#saved-purchase-supplier", { label: SUPPLIER_LABEL[name] }); };
const product = (page) => page.locator('input[id$="-product"]').first();
const typeProduct = async ({ page }, text) => { await product(page).fill(text); };
const panel = (page) => page.getByRole("region", { name: "Agreed terms" });
const hint = (page) => page.getByTestId("agreed-term-hint");
const settle = (page) => page.waitForTimeout(900); // lookup is debounced 400ms
async function reselectMedicoAndType(ctx, text) {
  await openInvoice(ctx);
  await pick(ctx, MEDICO);
  await typeProduct(ctx, text);
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
    await openInvoice(ctx);
  },
  actions: {
    pickZenith: async (ctx) => { await pick(ctx, ZENITH); },
    pickMedico: async (ctx) => { await pick(ctx, MEDICO); },
    typeDolo: async (ctx) => { await typeProduct(ctx, "Dolo 650 Tablet"); },
    typeCased: async (ctx) => { await typeProduct(ctx, "dolo 650   TABLET"); },
    typeOther: async (ctx) => { await typeProduct(ctx, "Paracetamol 500"); },
    fillInvoiceLine: async ({ page }) => {
      await page.locator('input[id$="-discount"]').first().fill("10");
      await page.locator('input[id$="-qty"]').first().fill("20");
      await page.locator('input[id$="-free-qty"]').first().fill("2");
      await page.locator('input[id$="-expiry-month"]').first().fill("06");
      await page.locator('input[id$="-expiry-year"]').first().fill("2027");
      await page.locator('input[id$="-rate"]').first().fill("20");
    },
    doctorChangesTerm: async (ctx) => {
      const r = await T.api(ctx.apiUrl, ctx.shared.doctorToken, "PUT", "/pharmacy/trade-terms", { supplierId: ctx.shared.medico, items: [{ ...T.DOLO, discountPercent: 15 }] });
      if (r.status !== 200) throw Error(`doctor update failed ${r.status}`);
      await reselectMedicoAndType(ctx, "Dolo 650 Tablet"); // next session
    },
    doctorDeletesTerm: async (ctx) => {
      const id = T.sql(`select id from pharmacy_trade_terms where "productName"='${T.DOLO.productName}'`);
      const r = await T.api(ctx.apiUrl, ctx.shared.doctorToken, "DELETE", `/pharmacy/trade-terms/${id}`);
      if (r.status >= 300) throw Error(`doctor delete failed ${r.status}`);
      await reselectMedicoAndType(ctx, "Dolo 650 Tablet");
    },
  },
  checks: {
    InvoiceBlank: async ({ page }, check) => {
      await settle(page);
      check((await panel(page).count()) === 0, "no agreed-terms panel before a supplier is chosen");
      check((await hint(page).count()) === 0, "no hint");
      check((await product(page).count()) === 1, "an empty invoice line exists");
    },
    ZenithChosen: async ({ page }, check) => {
      await settle(page);
      check((await page.locator("#saved-purchase-supplier").inputValue()) !== "", "supplier selected");
      check((await panel(page).count()) === 0, "no panel for a distributor without terms");
      check((await hint(page).count()) === 0, "no hint");
    },
    ZenithTyped: async ({ page }, check) => {
      await settle(page);
      check((await product(page).inputValue()) === "Dolo 650 Tablet", "product typed");
      check((await panel(page).count()) === 0 && (await hint(page).count()) === 0, "terms of another distributor do not leak into this invoice");
    },
    MedicoChosen: async ({ page }, check) => {
      await panel(page).waitFor();
      const txt = await panel(page).innerText();
      check(txt.includes("Agreed terms with Medico Wholesale"), "panel names the distributor");
      check(txt.includes(`Dolo 650 Tablet: ${AGREED_DOLO}`), "panel shows Dolo discount, scheme, expiry, PTR");
      check(txt.includes("Augmentin 625: 8% · min 12 mo expiry"), "panel shows second product");
      check(txt.includes("by Praneeta Jain on " + T.today()), "panel shows who entered and when");
      check((await hint(page).count()) === 0, "no hint while the line product is empty");
    },
    HintExact: async ({ page }, check) => hintChecks(page, check, AGREED_DOLO, "Invoice: 0% · 1 paid + 0 free"),
    HintCase: async ({ page }, check) => hintChecks(page, check, AGREED_DOLO, "Invoice: 0% · 1 paid + 0 free"),
    NoMatch: async ({ page }, check) => {
      await settle(page);
      check(await panel(page).isVisible(), "panel still lists the distributor's terms");
      check((await hint(page).count()) === 0, "no hint for an unmatched product");
    },
    Compare: async ({ page }, check) => hintChecks(page, check, AGREED_DOLO, "Invoice: 10% · 20 paid + 2 free · exp 06/2027 · rate ₹20.00"),
    HintUpdated: async ({ page }, check) => {
      await hint(page).first().waitFor();
      const txt = await hint(page).first().innerText();
      check(txt.includes("Agreed: 15% · Buy 10 Get 1"), `hint shows new 15% discount, got: ${txt}`);
      check((await panel(page).innerText()).includes("Dolo 650 Tablet: 15% · Buy 10 Get 1"), "panel shows 15%");
      check(!(await panel(page).innerText()).includes("12.5%"), "old 12.5% gone");
    },
    HintGone: async ({ page }, check) => {
      await panel(page).waitFor();
      await settle(page);
      check((await hint(page).count()) === 0, "no hint after the term was deleted");
      const txt = await panel(page).innerText();
      check(!txt.includes("Dolo 650 Tablet") && txt.includes("Augmentin 625"), "panel keeps only the remaining term");
    },
  },
};

async function hintChecks(page, check, agreed, invoice) {
  await hint(page).first().waitFor();
  const h = hint(page).first();
  const txt = await h.innerText();
  check((await hint(page).count()) === 1, "one hint for the one line");
  check(txt.includes(`Agreed: ${agreed}`), `hint shows agreed terms, got: ${txt}`);
  check(txt.includes(invoice), `hint shows what the invoice says (${invoice}), got: ${txt}`);
  check(await h.isVisible(), "hint visible");
  check(await panel(page).isVisible(), "panel visible too");
}

module.exports = { model, driver };
