"use strict";
// CR-28 Terms of Trade: the doctor's three-step entry, re-save, edit, delete and persistence.
const T = require("./tot-common.cjs");
const MEDICO = "Medico Wholesale";
const DOLO = T.DOLO;
const AUG = T.AUG;

const model = {
  id: "cr28-tot-entry",
  title: "CR-28 Terms of Trade: doctor entry, edit, delete, persistence",
  initial: "List",
  maxSteps: 16,
  states: {
    List: { label: "Distributor list" },
    ListByName: { label: "Search by name" },
    ListByGstin: { label: "Search by GSTIN" },
    ListNone: { label: "Search, no results" },
    DetailEmpty: { label: "Distributor selected, no terms" },
    W1: { label: "Step 1 Distributor, none chosen" },
    W1Chosen: { label: "Step 1, distributor chosen" },
    W2: { label: "Step 2 Items, none" },
    W2Picked: { label: "Step 2, one product" },
    W2Two: { label: "Step 2, two products" },
    W3: { label: "Step 3 Scheme, empty" },
    W3BadDiscount: { label: "Step 3, discount over 100" },
    W3BuyOnly: { label: "Step 3, scheme buy without free" },
    W3Ready: { label: "Step 3, valid" },
    Review: { label: "Review" },
    Saved: { label: "Saved, rows by NAME on DATE" },
    EditForm: { label: "Edit one product" },
    DeleteConfirm: { label: "Delete asks to confirm" },
    Deleted: { label: "Row deleted", terminal: true },
    ListPersisted: { label: "List after reload with recent shortlist" },
    Cancelled: { label: "Wizard cancelled, nothing saved", terminal: true },
    R2: { label: "Re-save: step 2 for saved distributor" },
    R2Picked: { label: "Re-save: Dolo picked again" },
    R3: { label: "Re-save: step 3" },
    R3Ready: { label: "Re-save: step 3 valid" },
    RReview: { label: "Re-save: review" },
    SavedResaved: { label: "Re-saved: still one row per product", terminal: true },
  },
  transitions: [
    { from: "List", event: "searchName", to: "ListByName" },
    { from: "List", event: "searchGstin", to: "ListByGstin" },
    { from: "List", event: "searchNothing", to: "ListNone" },
    { from: "ListByName", event: "openFound", to: "DetailEmpty" },
    { from: "List", event: "openDistributor", to: "DetailEmpty" },
    { from: "DetailEmpty", event: "allDistributors", to: "List" },
    { from: "DetailEmpty", event: "addTerms", to: "W2" },
    { from: "List", event: "addTerms", to: "W1" },
    { from: "W1", event: "chooseDistributor", to: "W1Chosen" },
    { from: "W1", event: "cancel", to: "Cancelled" },
    { from: "W1Chosen", event: "next", to: "W2" },
    { from: "W2", event: "back", to: "W1Chosen" },
    { from: "W2", event: "addProduct", to: "W2Picked" },
    { from: "W2Picked", event: "addSecondProduct", to: "W2Two" },
    { from: "W2Two", event: "removeSecond", to: "W2Picked" },
    { from: "W2Two", event: "next", to: "W3" },
    { from: "W3", event: "back", to: "W2Two" },
    { from: "W3", event: "fillBadDiscount", to: "W3BadDiscount" },
    { from: "W3", event: "fillBuyOnly", to: "W3BuyOnly" },
    { from: "W3BadDiscount", event: "fillValid", to: "W3Ready" },
    { from: "W3BuyOnly", event: "fillValid", to: "W3Ready" },
    { from: "W3Ready", event: "next", to: "Review" },
    { from: "Review", event: "back", to: "W3Ready" },
    { from: "Review", event: "cancel", to: "Cancelled" },
    { from: "Review", event: "save", to: "Saved" },
    { from: "Saved", event: "edit", to: "EditForm" },
    { from: "EditForm", event: "saveEdit", to: "Saved" },
    { from: "Saved", event: "delete", to: "DeleteConfirm" },
    { from: "DeleteConfirm", event: "confirmDelete", to: "Deleted" },
    { from: "Saved", event: "reload", to: "ListPersisted" },
    { from: "ListPersisted", event: "openDistributor", to: "Saved" },
    { from: "ListPersisted", event: "openRecent", to: "Saved" },
    { from: "Saved", event: "addTerms", to: "R2" },
    { from: "R2", event: "addProduct", to: "R2Picked" },
    { from: "R2Picked", event: "next", to: "R3" },
    { from: "R3", event: "fillValid", to: "R3Ready" },
    { from: "R3Ready", event: "next", to: "RReview" },
    { from: "RReview", event: "save", to: "SavedResaved" },
  ],
};

const FIELD = {
  discountPercent: "Discount %", schemeBuy: "Scheme: buy", schemeFree: "Scheme: get free",
  minExpiryMonths: "Min expiry (months)", marginPercent: "Margin %", ptr: "PTR (₹)", ptrRule: "PTR rule", note: "Note",
};
const rupee = (n) => `₹${n.toFixed(2)}`;
const pct = (n) => `${Number(n.toFixed(2))}%`;

const driver = {
  async setup({ apiUrl, shared }) {
    await T.setupSuppliers({ apiUrl, shared });
    shared.medico = shared.suppliers[MEDICO];
  },
  async reset(ctx) {
    T.clearTerms();
    ctx.vars = { picks: [], expect: {}, snapshot: T.snapshot() };
    await T.uiLogin(ctx, "doctor");
    await ctx.page.goto(`${ctx.baseUrl}/dashboard/inventory?area=purchases&view=terms`, { timeout: 120000 });
    await ctx.page.locator("#trade-terms-distributor-search").waitFor({ timeout: 90000 });
    await ctx.page.getByRole("list", { name: "Distributors", exact: true }).waitFor();
  },
  actions: {
    searchName: async ({ page }) => { await page.locator("#trade-terms-distributor-search").fill("zenith"); },
    searchGstin: async ({ page }) => { await page.locator("#trade-terms-distributor-search").fill("29AAACA"); },
    searchNothing: async ({ page }) => { await page.locator("#trade-terms-distributor-search").fill("nonexistent-xyz"); },
    openFound: async ({ page }) => { await page.getByRole("list", { name: "Distributors", exact: true }).getByRole("button", { name: /Zenith/ }).click(); },
    openDistributor: async ({ page }, t) => {
      await page.getByRole("list", { name: "Distributors", exact: true }).getByRole("button", { name: new RegExp(MEDICO) }).click();
    },
    openRecent: async ({ page }) => { await page.getByRole("list", { name: "Recent distributors" }).getByRole("button", { name: MEDICO }).click(); },
    allDistributors: async (ctx) => {
      const { page } = ctx;
      await ctx.page.getByRole("button", { name: "All distributors" }).click();
      const box = page.locator("#trade-terms-distributor-search");
      await box.waitFor();
      // The app keeps the earlier search text in the box; the user clears it to see every distributor.
      ctx.vars.retainedSearch = await box.inputValue();
      if (ctx.vars.retainedSearch) await box.fill("");
    },
    addTerms: async (ctx, t) => {
      await ctx.page.getByRole("button", { name: "Add terms" }).click();
      if (t.from === "Saved") { ctx.vars.resave = true; ctx.vars.picks = []; ctx.vars.snapshot = T.snapshot(); }
    },
    chooseDistributor: async ({ page }) => { await page.getByRole("list", { name: "Distributors", exact: true }).getByRole("button", { name: new RegExp(MEDICO) }).click(); },
    cancel: async ({ page }) => { await page.getByRole("button", { name: "Cancel", exact: true }).click(); },
    next: async ({ page }) => { await page.getByRole("button", { name: "Next", exact: true }).click(); },
    back: async ({ page }) => { await page.getByRole("button", { name: "Back", exact: true }).click(); },
    addProduct: async (ctx) => {
      await addTyped(ctx.page, DOLO.productName);
      ctx.vars.picks = [DOLO.productName];
    },
    addSecondProduct: async (ctx) => { await addTyped(ctx.page, AUG.productName); ctx.vars.picks = [DOLO.productName, AUG.productName]; },
    removeSecond: async (ctx) => { await ctx.page.getByRole("button", { name: `Remove ${AUG.productName}` }).click(); ctx.vars.picks = [DOLO.productName]; },
    fillBadDiscount: async ({ page }) => { await fill(page, DOLO.productName, "discountPercent", "150"); },
    fillBuyOnly: async ({ page }) => { await fill(page, DOLO.productName, "schemeBuy", "10"); },
    fillValid: async (ctx) => {
      const resaving = !!ctx.vars.resave;
      const dolo = resaving ? { ...DOLO, discountPercent: 15 } : DOLO;
      for (const name of ctx.vars.picks) {
        const v = name === DOLO.productName ? dolo : AUG;
        for (const f of Object.keys(FIELD)) await fill(ctx.page, name, f, v[f] == null ? "" : String(v[f]));
        ctx.vars.pending = { ...(ctx.vars.pending || {}), [name]: v };
      }
    },
    save: async (ctx) => {
      await ctx.page.getByRole("button", { name: "Save terms" }).click();
      Object.assign(ctx.vars.expect, ctx.vars.pending);
    },
    edit: async ({ page }) => { await page.getByRole("button", { name: `Edit terms for ${DOLO.productName}` }).click(); },
    saveEdit: async (ctx) => {
      await fill(ctx.page, DOLO.productName, "note", "edited by doctor");
      await ctx.page.getByRole("button", { name: "Save terms" }).click();
      ctx.vars.expect[DOLO.productName] = { ...ctx.vars.expect[DOLO.productName], note: "edited by doctor" };
    },
    delete: async ({ page }) => { await page.getByRole("button", { name: `Delete terms for ${DOLO.productName}` }).click(); },
    confirmDelete: async (ctx) => {
      await ctx.page.getByRole("button", { name: "Confirm delete" }).click();
      delete ctx.vars.expect[DOLO.productName];
    },
    reload: async ({ page }) => {
      await page.reload();
      await page.locator("#trade-terms-distributor-search").waitFor({ timeout: 60000 });
    },
  },
  checks: {
    List: async (ctx, check) => {
      const { page } = ctx;
      await page.getByRole("list", { name: "Distributors", exact: true }).waitFor();
      check((await page.getByRole("heading", { name: "Terms of Trade" }).count()) === 1, "Terms of Trade heading");
      await page.waitForFunction(() => document.querySelectorAll('ul[aria-label="Distributors"] li').length === 3, null, { timeout: 5000 }).catch(() => {});
      const names = await page.getByRole("list", { name: "Distributors", exact: true }).locator("li").count();
      check(names === 3, `3 distributors listed, got ${names}`);
      check(await page.getByText("36ABCDE1234F1Z5").isVisible(), "GSTIN shown on card");
      check((await page.getByRole("note").count()) === 0, "no read-only note for a doctor");
      check(await page.getByRole("button", { name: "Add terms" }).isVisible(), "Add terms visible for doctor");
      check((await page.getByRole("heading", { name: "Recent distributors" }).count()) === 0, "no recent shortlist before anything is saved");
      check(T.countTerms() === 0, "no terms in DB");
    },
    ListByName: async ({ page }, check) => {
      await page.getByRole("list", { name: "Distributors", exact: true }).locator("li").first().waitFor();
      await page.waitForFunction(() => document.querySelectorAll('ul[aria-label="Distributors"] li').length === 1);
      check(await page.getByRole("list", { name: "Distributors", exact: true }).getByText("Zenith Pharma Distributors").isVisible(), "Zenith shown");
      check((await page.getByText("Medico Wholesale").count()) === 0, "Medico filtered out");
    },
    ListByGstin: async ({ page }, check) => {
      await page.waitForFunction(() => document.querySelectorAll('ul[aria-label="Distributors"] li').length === 1);
      check(await page.getByRole("list", { name: "Distributors", exact: true }).getByText("Apex Drug House").isVisible(), "Apex found by GSTIN prefix");
      check((await page.getByText("Zenith Pharma Distributors").count()) === 0, "others filtered out");
    },
    ListNone: async ({ page }, check) => {
      await page.getByText("No distributor matches").waitFor();
      check((await page.getByRole("list", { name: "Distributors", exact: true }).count()) === 0, "no result list");
    },
    DetailEmpty: async ({ page }, check) => {
      await page.getByText("No terms recorded for this distributor yet.").waitFor();
      check(await page.getByRole("heading", { name: /^(Medico Wholesale|Zenith Pharma Distributors)$/ }).isVisible(), "distributor heading");
      check(await page.getByRole("button", { name: "All distributors" }).isVisible(), "back to list control");
      check(T.countTerms() === 0, "nothing in DB");
    },
    W1: async ({ page }, check) => {
      await page.getByRole("region", { name: "Add terms" }).waitFor();
      check((await page.getByRole("listitem").filter({ hasText: /^1\. Distributor$/ }).getAttribute("aria-current")) === "step", "step 1 current");
      check(await page.getByRole("listitem").filter({ hasText: /^2\. Items$/ }).isVisible() && await page.getByRole("listitem").filter({ hasText: /^3\. Scheme$/ }).isVisible(), "steps Items and Scheme shown");
      check(await page.getByRole("button", { name: "Next", exact: true }).isDisabled(), "Next disabled until a distributor is chosen");
      check((await page.getByRole("button", { name: "Back", exact: true }).count()) === 0, "no Back on first step");
      check(await page.getByRole("heading", { name: "Recent distributors" }).count() === 0, "no recent yet");
    },
    W1Chosen: async ({ page }, check) => {
      await page.getByText(/Distributor:\s*Medico Wholesale/).waitFor();
      check(await page.getByRole("button", { name: "Next", exact: true }).isEnabled(), "Next enabled once chosen");
      check(await page.getByText("(36ABCDE1234F1Z5)").isVisible(), "GSTIN shown beside chosen distributor");
    },
    W2: async ({ page }, check) => {
      await page.locator("#trade-terms-product-search").waitFor();
      check((await page.getByRole("listitem").filter({ hasText: /^2\. Items$/ }).getAttribute("aria-current")) === "step", "step 2 current");
      check(await page.getByRole("button", { name: "Next", exact: true }).isDisabled(), "Next disabled without products");
      check(await page.getByText("Selected products (0)").isVisible(), "0 selected");
      check(await page.getByRole("button", { name: "Back", exact: true }).isVisible(), "Back available");
    },
    W2Picked: async ({ page }, check) => {
      await page.getByText("Selected products (1)").waitFor();
      check(await page.getByRole("list", { name: "Selected products" }).getByText(DOLO.productName).isVisible(), "Dolo in selection");
      check(await page.getByRole("button", { name: "Next", exact: true }).isEnabled(), "Next enabled");
    },
    W2Two: async ({ page }, check) => {
      await page.getByText("Selected products (2)").waitFor();
      check(await page.getByRole("list", { name: "Selected products" }).getByText(AUG.productName).isVisible(), "Augmentin in selection");
      check(await page.getByRole("button", { name: "Next", exact: true }).isEnabled(), "Next enabled");
    },
    W3: async ({ page }, check) => {
      await page.getByRole("group", { name: `Terms for ${DOLO.productName}` }).waitFor();
      check((await page.getByRole("listitem").filter({ hasText: /^3\. Scheme$/ }).getAttribute("aria-current")) === "step", "step 3 current");
      check((await page.getByRole("group", { name: /^Terms for / }).count()) === 2, "one fieldset per product");
      check(await page.getByText("Enter at least one term.").first().isVisible(), "empty terms explained");
      check(await page.getByRole("button", { name: "Next", exact: true }).isDisabled(), "Next disabled when empty");
    },
    W3BadDiscount: async ({ page }, check) => {
      await page.getByText("Check discount %.").waitFor();
      check(await page.getByRole("button", { name: "Next", exact: true }).isDisabled(), "Next disabled for discount 150");
    },
    W3BuyOnly: async ({ page }, check) => {
      await page.getByText("Enter both scheme quantities, or neither.").waitFor();
      check(await page.getByRole("button", { name: "Next", exact: true }).isDisabled(), "Next disabled for buy without free");
    },
    W3Ready: async ({ page }, check) => {
      await page.waitForFunction(() => ![...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Next")?.disabled);
      check(await page.getByRole("button", { name: "Next", exact: true }).isEnabled(), "Next enabled when every product has valid terms");
      check((await page.getByText("Check discount %.").count()) === 0, "no validation message left");
    },
    Review: async (ctx, check) => {
      const { page } = ctx;
      const list = page.getByRole("list", { name: "Terms to save" });
      await list.waitFor();
      const dolo = list.getByRole("listitem").filter({ hasText: DOLO.productName });
      check((await dolo.innerText()).includes("12.5% · Buy 10 Get 1 · min 18 mo expiry · PTR ₹22.40 · MRP less 20%"), "review summarises discount, scheme, expiry, PTR");
      check((await dolo.innerText()).includes("margin 18%") && (await dolo.innerText()).includes("agreed with rep Ravi"), "margin and note in review");
      check(await list.getByRole("listitem").filter({ hasText: AUG.productName }).getByText("8% · min 12 mo expiry").isVisible(), "second product summarised");
      check(await page.getByRole("button", { name: "Save terms" }).isEnabled(), "Save enabled");
      check(T.snapshot() === ctx.vars.snapshot, "nothing saved before Save");
    },
    Saved: async (ctx, check) => {
      const { page } = ctx;
      await page.getByRole("table", { name: "Agreed terms" }).waitFor();
      const names = Object.keys(ctx.vars.expect).sort();
      await page.waitForFunction((n) => document.querySelectorAll('table[aria-label="Agreed terms"] tbody tr').length === n, names.length);
      const db = T.dbTerms(ctx.shared.medico);
      check(JSON.stringify(db.map((r) => r.productName)) === JSON.stringify(names), `DB has exactly ${names.join(", ")}, got ${db.map((r) => r.productName)}`);
      for (const name of names) {
        const e = ctx.vars.expect[name];
        const d = db.find((r) => r.productName === name);
        for (const k of Object.keys(FIELD)) check((d[k] ?? null) === (e[k] ?? null), `DB ${name}.${k} = ${e[k]} got ${d[k]}`);
        const row = page.getByRole("table", { name: "Agreed terms" }).getByRole("row").filter({ hasText: name });
        const txt = await row.innerText();
        if (e.discountPercent != null) check(txt.includes(pct(e.discountPercent)), `${name} row shows discount ${pct(e.discountPercent)}`);
        if (e.schemeBuy != null) check(txt.includes(`Buy ${e.schemeBuy} Get ${e.schemeFree}`), `${name} row shows scheme`);
        if (e.minExpiryMonths != null) check(txt.includes(`${e.minExpiryMonths} months`), `${name} row shows min expiry`);
        if (e.ptr != null) check(txt.includes(rupee(e.ptr)) && txt.includes(e.ptrRule), `${name} row shows PTR and rule`);
        if (e.note) check(txt.includes(e.note), `${name} row shows note`);
        check(txt.includes(`by Praneeta Jain on ${T.today()}`), `${name} row shows who and when`);
        check(await row.getByRole("button", { name: `Edit terms for ${name}` }).isVisible(), "doctor sees Edit");
      }
      check(await page.getByRole("heading", { name: MEDICO }).isVisible(), "distributor heading");
      check((await page.getByRole("region", { name: /Add terms|Edit terms/ }).count()) === 0, "wizard closed");
    },
    EditForm: async (ctx, check) => {
      const { page } = ctx;
      await page.getByRole("region", { name: "Edit terms" }).waitFor();
      check(await page.getByRole("heading", { name: `Edit terms for ${DOLO.productName}` }).isVisible(), "edit heading");
      check((await page.getByRole("list", { name: "Steps" }).count()) === 0, "edit skips the three steps");
      const e = ctx.vars.expect[DOLO.productName];
      check((await page.getByLabel("Discount %", { exact: true }).inputValue()) === String(e.discountPercent), "discount prefilled");
      check((await page.getByLabel("Note", { exact: true }).inputValue()) === e.note, "note prefilled");
      check(await page.getByRole("button", { name: "Save terms" }).isEnabled(), "Save enabled");
    },
    DeleteConfirm: async (ctx, check) => {
      await ctx.page.getByRole("button", { name: "Confirm delete" }).waitFor();
      check(T.dbTerms(ctx.shared.medico).length === Object.keys(ctx.vars.expect).length, "nothing deleted until confirmed");
      check((await ctx.page.getByRole("button", { name: "Confirm delete" }).count()) === 1, "single confirm button");
    },
    Deleted: async (ctx, check) => {
      const { page } = ctx;
      await page.waitForFunction((n) => !document.body.innerText.includes(n), DOLO.productName);
      const db = T.dbTerms(ctx.shared.medico);
      check(!db.some((r) => r.productName === DOLO.productName), "Dolo row gone from DB");
      check(db.length === Object.keys(ctx.vars.expect).length, "other rows untouched");
      check((await page.getByText("Confirm delete").count()) === 0, "confirm control gone");
    },
    ListPersisted: async (ctx, check) => {
      const { page } = ctx;
      await page.getByRole("list", { name: "Recent distributors" }).waitFor();
      const n = Object.keys(ctx.vars.expect).length;
      check(await page.getByRole("list", { name: "Recent distributors" }).getByRole("button", { name: MEDICO }).isVisible(), "Medico in recent shortlist");
      check(await page.getByRole("list", { name: "Distributors", exact: true }).getByText(`${n} products with terms`).isVisible(), `Medico card says ${n} products with terms after reload`);
    },
    Cancelled: async (ctx, check) => {
      const { page } = ctx;
      check((await page.getByRole("region", { name: /Add terms|Edit terms/ }).count()) === 0, "wizard closed");
      check(await page.getByRole("button", { name: "Add terms" }).isVisible(), "back to Terms of Trade page");
      check(T.snapshot() === ctx.vars.snapshot, "DB unchanged after Cancel");
    },
    R2: async ({ page }, check) => {
      await page.locator("#trade-terms-product-search").waitFor();
      check(await page.getByText(/Distributor:\s*Medico Wholesale/).isVisible(), "distributor carried into wizard");
      check(await page.getByRole("button", { name: "Next", exact: true }).isDisabled(), "Next disabled without products");
    },
    R2Picked: async ({ page }, check) => {
      await page.getByText("Selected products (1)").waitFor();
      check(await page.getByRole("button", { name: "Next", exact: true }).isEnabled(), "Next enabled");
    },
    R3: async ({ page }, check) => {
      await page.getByRole("group", { name: `Terms for ${DOLO.productName}` }).waitFor();
      check(await page.getByRole("button", { name: "Next", exact: true }).isDisabled(), "Next disabled with empty terms");
    },
    R3Ready: async ({ page }, check) => {
      await page.waitForFunction(() => ![...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Next")?.disabled);
      check(await page.getByRole("button", { name: "Next", exact: true }).isEnabled(), "Next enabled");
    },
    RReview: async (ctx, check) => {
      const list = ctx.page.getByRole("list", { name: "Terms to save" });
      await list.waitFor();
      check((await list.innerText()).includes("15% · Buy 10 Get 1"), "review shows new discount 15%");
      check(await ctx.page.getByText("Saving a product that already has terms replaces them.").isVisible(), "replacement warning shown");
      check(T.snapshot() === ctx.vars.snapshot, "not saved yet");
    },
    SavedResaved: async (ctx, check) => {
      const { page } = ctx;
      await page.getByRole("table", { name: "Agreed terms" }).waitFor();
      const db = T.dbTerms(ctx.shared.medico);
      check(db.filter((r) => r.productName === DOLO.productName).length === 1, "still exactly one Dolo row");
      check(db.length === Object.keys(ctx.vars.expect).length, `row count unchanged (${Object.keys(ctx.vars.expect).length}), got ${db.length}`);
      check(db.find((r) => r.productName === DOLO.productName).discountPercent === 15, "Dolo discount updated to 15 in DB");
      check((await page.getByRole("table", { name: "Agreed terms" }).getByRole("row").filter({ hasText: DOLO.productName }).count()) === 1, "one Dolo row in UI");
    },
  },
};

async function addTyped(page, name) {
  await page.locator("#trade-terms-product-search").fill(name);
  await page.getByRole("button", { name: `Add “${name}” as typed` }).click();
  await page.getByRole("list", { name: "Selected products" }).getByText(name, { exact: true }).waitFor();
}
async function fill(page, product, field, value) {
  await page.getByRole("group", { name: `Terms for ${product}` }).getByLabel(FIELD[field], { exact: true }).fill(value);
}

module.exports = { model, driver };
