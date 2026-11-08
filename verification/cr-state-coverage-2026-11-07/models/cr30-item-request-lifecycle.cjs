"use strict";

// CR-30: a new item enters inventory only after a doctor approves it.
// Lifecycle of one item request across staff, doctor and second-doctor sessions.
// Env: DB_URL (Postgres the API uses), BASE_URL, API_URL.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const DB_URL = process.env.DB_URL || process.env.DATABASE_URL;
const BRANCH = "branch-seed-1";
const PASSWORD = "password123";
const ACCOUNTS = {
  staff: "reception@clinic.test",
  pharmacist: "pharmacist@clinic.test",
  doctor: "praneeta@clinic.test",
  doctor2: "shravya@clinic.test",
  admin: "admin@clinic.test",
};
const TOKEN_CACHE = path.join(os.tmpdir(), "cr30-itemreq-tokens.json");
const ADD_SUCCESS = "Sent to doctor for approval. The item will appear in inventory once approved.";

// ---------- DB (the CR is about what exists in inventory, so we measure it) ----------
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
function sql(q) {
  return execFileSync("psql", [DB_URL, "-At", "-F", "|", "-c", q], { encoding: "utf8" }).trim();
}
const itemCount = (name) => Number(sql(`select count(*) from inventory_items where name = ${lit(name)}`));
const requestRows = (name) =>
  sql(`select r.id, r.status, coalesce(r."reviewNote",''), coalesce(u.email,''), coalesce(q.email,''), coalesce(r."inventoryItemId",'')
       from inventory_item_requests r join users q on q.id = r."requestedById" left join users u on u.id = r."reviewedById"
       where r."itemName" = ${lit(name)}`)
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [id, status, note, reviewer, requester, itemId] = l.split("|");
      return { id, status, note, reviewer, requester, itemId };
    });
const pendingCount = () =>
  Number(sql(`select count(*) from inventory_item_requests where "branchId" = ${lit(BRANCH)} and status = 'PENDING'`));

// ---------- auth ----------
async function login(apiUrl, email) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${apiUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: email, password: PASSWORD }),
    });
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 61_000));
      continue;
    }
    const j = await r.json();
    if (!j.access_token) throw Error(`login ${email}: ${r.status}`);
    return { token: j.access_token, name: `${j.user.firstName} ${j.user.lastName}`.trim(), id: j.user.id };
  }
  throw Error(`login ${email}: rate limited`);
}

async function sessions(apiUrl) {
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(TOKEN_CACHE, "utf8"));
  } catch {}
  const out = {};
  for (const [role, email] of Object.entries(ACCOUNTS)) {
    const hit = cache[email];
    if (hit && hit.apiUrl === apiUrl && Date.now() - hit.at < 12 * 3600_000) out[role] = hit;
    else out[role] = cache[email] = { ...(await login(apiUrl, email)), apiUrl, at: Date.now() };
  }
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify(cache));
  return out;
}

async function api(ctx, role, method, p, body) {
  const r = await fetch(`${ctx.apiUrl}${p}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${ctx.shared.sessions[role].token}` },
    body: body && JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function becomeIn(context, baseUrl, session) {
  await context.clearCookies();
  const { hostname } = new URL(baseUrl);
  await context.addCookies([{ name: "auth_token", value: session.token, domain: hostname, path: "/", httpOnly: true }]);
}

// ---------- UI helpers ----------
const stockUrl = (ctx) => `${ctx.baseUrl}/dashboard/inventory?area=stock&view=list`;
const approvalsUrl = (ctx) => `${ctx.baseUrl}/dashboard/inventory?area=stock&view=approvals`;

async function until(fn, timeout = 10_000) {
  const end = Date.now() + timeout;
  let v;
  for (;;) {
    v = await fn().catch(() => undefined);
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function as(ctx, role) {
  ctx.vars.role = role;
  await becomeIn(ctx.context, ctx.baseUrl, ctx.shared.sessions[role]);
}

async function searchStock(ctx, name) {
  const { page } = ctx;
  // Start from the unfiltered list so a repeated search for the same text still refetches.
  if (page.url() !== stockUrl(ctx)) await page.goto(stockUrl(ctx));
  const input = page.getByPlaceholder("Type a product name or scan a barcode");
  await input.waitFor({ timeout: 60_000 });
  await input.fill(name);
  const done = page.waitForResponse(
    (r) => r.url().includes("/inventory/workspace/stock?") && r.url().includes("search=") && r.ok(),
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await done;
  await page.getByText(/matching batch|No batches match/).first().waitFor({ timeout: 15_000 });
}
const stockRow = (ctx, name) => ctx.page.locator("tbody").getByRole("button", { name, exact: true });

async function openStock(ctx) {
  await ctx.page.goto(stockUrl(ctx));
  await ctx.page.getByRole("button", { name: "Add batch" }).waitFor({ timeout: 60_000 });
}

async function openApprovals(ctx) {
  const { page } = ctx;
  if (!page.url().includes("area=stock")) await openStock(ctx);
  await page.getByRole("navigation", { name: "stock tasks" }).getByRole("button", { name: /^Approve corrections/ }).click();
  if (ctx.vars.role === "doctor") await page.getByRole("tab", { name: /New items/ }).click();
  await page.getByRole("heading", { name: /item requests$/ }).waitFor({ timeout: 30_000 });
  await page.getByText(/Loading requests/).waitFor({ state: "detached", timeout: 30_000 }).catch(() => {});
}

// CSS, not getByRole: while a review dialog is open the list behind it is aria-hidden.
const card = (ctx, name) => ctx.page.locator("li").filter({ has: ctx.page.locator(`h3:text-is(${JSON.stringify(name)})`) });
const sidebarBadge = (page) => page.locator('a[href="/dashboard/inventory"] span[aria-label$="waiting for approval"]');

async function fillAddForm(page, fields) {
  const dialog = page.getByRole("dialog");
  for (const [id, value] of Object.entries(fields)) await dialog.locator(`#${id}`).fill(String(value));
}

function fullDetails(ctx) {
  return {
    name: ctx.vars.name,
    genericName: "Nebulexamol",
    manufacturer: "CR30 Pharma Ltd",
    costPrice: "42.5",
    sellingPrice: "55",
    mrp: "60",
    packSize: "10",
    sku: ctx.vars.sku,
    hsnCode: "3004",
    gstRate: "12",
    batchNumber: "B-CR30",
  };
}

async function checkBadge(ctx, check, { expectPending } = {}) {
  const page = ctx.page;
  const db = pendingCount();
  if (expectPending != null) check(db === expectPending, `DB pending count is ${expectPending} (got ${db})`);
  if (db === 0) {
    const gone = await until(async () => (await sidebarBadge(page).count()) === 0);
    check(gone, "sidebar Inventory badge absent when nothing is pending");
    return;
  }
  const shown = await until(async () => {
    const t = (await sidebarBadge(page).textContent())?.trim();
    return t === String(db) ? t : undefined;
  });
  check(shown === String(db), `sidebar Inventory badge shows ${db} (DB pending count)`);
}

async function staffDoesNotSeeBadge(ctx, check) {
  await ctx.page.locator('a[href="/dashboard/inventory"]').first().waitFor();
  await ctx.page.waitForTimeout(300);
  check((await sidebarBadge(ctx.page).count()) === 0, "staff sidebar shows no approval badge");
}

// ---------- model ----------
const model = {
  id: "cr30-item-request-lifecycle",
  title: "CR-30 New item request: staff request -> doctor approve/reject -> inventory",
  initial: "StaffStock",
  maxSteps: 14,
  states: {
    StaffStock: { label: "Staff (reception) on stock list\nnew item absent" },
    StaffAddForm: { label: "Staff: Add item form open" },
    StaffDuplicateSku: { label: "Staff: duplicate SKU refused\n(no request created)" },
    StaffSubmitted: { label: "Staff: 'Sent to doctor for approval'\nrequest PENDING, 0 items" },
    StaffStockPending: { label: "Staff stock search\nitem absent while pending" },
    StaffRequestsPending: { label: "Staff 'My item requests'\nWaiting for doctor" },
    StaffApproveForbidden: { label: "Staff calls approve API\n403, still PENDING" },
    StaffImportRefused: { label: "Staff bulk import\n'Ask a doctor to import new items'" },
    PharmacistSubmitted: { label: "Pharmacist add -> sent for approval", terminal: true },
    DoctorStockPending: { label: "Doctor stock search\nitem absent, badge = pending" },
    DoctorNewItemsPending: { label: "Doctor 'New items' tab\nrequest with all details" },
    RejectDialog: { label: "Reject dialog\nno note: Reject disabled" },
    RejectReady: { label: "Reject dialog with note\nReject enabled" },
    DoctorRejected: { label: "Doctor: Rejected with note\n0 items, badge -1" },
    StaffSeesRejected: { label: "Staff sees Rejected\nreviewer + note, 0 items", terminal: true },
    ApproveDialog: { label: "Approve dialog open" },
    DoctorApproved: { label: "Doctor: Approved\nexactly 1 item, badge -1" },
    StaleApproveDialog: { label: "Doctor A dialog open\nDoctor B already approved" },
    ApproveConflict: { label: "Doctor A: 'already approved'\nstill exactly 1 item" },
    DoctorStockHasItem: { label: "Doctor stock search\nitem present" },
    StaffStockHasItem: { label: "Staff stock search\nitem present" },
    StaffSeesApproved: { label: "Staff sees Approved\nby doctor", terminal: true },
    DoctorAddedDirect: { label: "Doctor adds item directly\nno request, 1 item", terminal: true },
  },
  transitions: [
    { from: "StaffStock", event: "openAdd", to: "StaffAddForm" },
    { from: "StaffAddForm", event: "submitDuplicateSku", to: "StaffDuplicateSku" },
    { from: "StaffDuplicateSku", event: "fixSkuAndSubmit", to: "StaffSubmitted" },
    { from: "StaffAddForm", event: "submitFullDetails", to: "StaffSubmitted" },
    { from: "StaffSubmitted", event: "closeAndSearch", to: "StaffStockPending" },
    { from: "StaffStockPending", event: "openMyRequests", to: "StaffRequestsPending" },
    { from: "StaffRequestsPending", event: "reload", to: "StaffRequestsPending" },
    { from: "StaffRequestsPending", event: "staffApproveViaApi", to: "StaffApproveForbidden" },
    { from: "StaffApproveForbidden", event: "reload", to: "StaffRequestsPending" },
    { from: "StaffStock", event: "staffImportExcel", to: "StaffImportRefused" },
    { from: "StaffStock", event: "pharmacistSubmits", to: "PharmacistSubmitted" },
    { from: "StaffStock", event: "doctorAddsDirect", to: "DoctorAddedDirect" },
    { from: "StaffRequestsPending", event: "doctorLoginAndSearch", to: "DoctorStockPending" },
    { from: "DoctorStockPending", event: "openApprovals", to: "DoctorNewItemsPending" },
    { from: "DoctorNewItemsPending", event: "clickReject", to: "RejectDialog" },
    { from: "RejectDialog", event: "typeBlankNote", to: "RejectDialog" },
    { from: "RejectDialog", event: "typeNote", to: "RejectReady" },
    { from: "RejectReady", event: "confirmReject", to: "DoctorRejected" },
    { from: "DoctorRejected", event: "staffLoginAndOpenRequests", to: "StaffSeesRejected" },
    { from: "DoctorNewItemsPending", event: "clickApprove", to: "ApproveDialog" },
    { from: "ApproveDialog", event: "cancel", to: "DoctorNewItemsPending" },
    { from: "ApproveDialog", event: "confirmApprove", to: "DoctorApproved" },
    { from: "ApproveDialog", event: "doubleClickApprove", to: "DoctorApproved" },
    { from: "ApproveDialog", event: "secondDoctorApproves", to: "StaleApproveDialog" },
    { from: "StaleApproveDialog", event: "confirmApprove", to: "ApproveConflict" },
    { from: "DoctorApproved", event: "reload", to: "DoctorApproved" },
    { from: "DoctorApproved", event: "doctorSearchStock", to: "DoctorStockHasItem" },
    { from: "DoctorStockHasItem", event: "staffLoginAndSearch", to: "StaffStockHasItem" },
    { from: "StaffStockHasItem", event: "openMyRequests", to: "StaffSeesApproved" },
  ],
};

// ---------- driver ----------
const driver = {
  setup: async ({ baseUrl, apiUrl, shared }) => {
    if (!DB_URL) throw Error("set DB_URL");
    shared.sessions = await sessions(apiUrl);
    const stamp = Date.now().toString(36);
    shared.existingSku = `CR30-EXIST-${stamp}`;
    const r = await api({ apiUrl, shared }, "admin", "POST", "/inventory/items", {
      name: `CR30 Existing ${stamp}`, type: "MEDICINE", costPrice: 5, sellingPrice: 6, unit: "PIECES", sku: shared.existingSku,
    });
    if (r.status !== 201) throw Error(`fixture item: ${r.status} ${JSON.stringify(r.body)}`);
    const XLSX = require(path.resolve(__dirname, "../../../node_modules/xlsx"));
    shared.xlsxDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr30-xlsx-"));
    shared.makeXlsx = (name) => {
      const ws = XLSX.utils.aoa_to_sheet([["Item Name", "Batch", "Expiry", "Quantity", "MRP"], [name, "IMP1", "2028-12-31", 20, 99]]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Stock");
      const file = path.join(shared.xlsxDir, `${name.replace(/\W+/g, "-")}.xlsx`);
      XLSX.writeFile(wb, file);
      return file;
    };
  },

  reset: async (ctx) => {
    const tag = `${ctx.pathIndex}${Math.random().toString(36).slice(2, 7)}`;
    ctx.vars.name = `CR30 Nebulex ${tag}`;
    ctx.vars.sku = `CR30-SKU-${tag}`;
    ctx.vars.note = `Duplicate of an existing 120 ml pack (${tag})`;
    await as(ctx, "staff");
    await openStock(ctx);
    await searchStock(ctx, ctx.vars.name);
  },

  actions: {
    openAdd: async (ctx) => {
      await ctx.page.getByRole("button", { name: "Add batch" }).click();
      await ctx.page.getByRole("dialog").getByRole("heading", { name: "Add Inventory Item" }).waitFor();
    },
    submitDuplicateSku: async (ctx) => {
      ctx.vars.pendingBefore = pendingCount();
      await fillAddForm(ctx.page, { name: ctx.vars.name, costPrice: "10", sellingPrice: "12", sku: ctx.shared.existingSku });
      await ctx.page.getByRole("button", { name: "Add Item" }).click();
      await ctx.page.getByRole("dialog").getByText(/SKU/i).first().waitFor({ timeout: 15_000 }).catch(() => {});
    },
    fixSkuAndSubmit: async (ctx) => {
      ctx.vars.details = { name: ctx.vars.name, costPrice: "10", sellingPrice: "12", sku: ctx.vars.sku };
      await ctx.page.getByRole("dialog").locator("#sku").fill(ctx.vars.sku);
      await ctx.page.getByRole("button", { name: "Add Item" }).click();
      await ctx.page.getByRole("dialog").getByRole("heading", { name: "Sent to doctor for approval" }).waitFor({ timeout: 15_000 }).catch(() => {});
    },
    submitFullDetails: async (ctx) => {
      ctx.vars.pendingBefore = pendingCount();
      ctx.vars.details = fullDetails(ctx);
      await fillAddForm(ctx.page, ctx.vars.details);
      await ctx.page.getByRole("button", { name: "Add Item" }).click();
      await ctx.page.getByRole("dialog").getByRole("heading", { name: "Sent to doctor for approval" }).waitFor({ timeout: 15_000 }).catch(() => {});
    },
    closeAndSearch: async (ctx) => {
      await ctx.page.getByRole("dialog").getByRole("button", { name: "Close" }).first().click();
      await ctx.page.getByRole("dialog").waitFor({ state: "detached" });
      await searchStock(ctx, ctx.vars.name);
    },
    openMyRequests: async (ctx) => openApprovals(ctx),
    reload: async (ctx) => {
      await ctx.page.reload();
      await ctx.page.getByRole("heading", { name: /item requests$|Price \/ stock approval queue/ }).first().waitFor({ timeout: 60_000 });
      if (ctx.vars.role === "doctor") {
        await ctx.page.getByRole("tab", { name: /New items/ }).click();
        await ctx.page.getByRole("heading", { name: "New item requests" }).waitFor();
      }
      await ctx.page.getByText(/Loading requests/).waitFor({ state: "detached", timeout: 30_000 }).catch(() => {});
    },
    staffApproveViaApi: async (ctx) => {
      const [req] = requestRows(ctx.vars.name);
      const r = await ctx.context.request.post(`${ctx.baseUrl}/api/inventory/item-requests/${req.id}/approve`, { data: {} });
      ctx.vars.lastApi = { status: r.status(), body: await r.json().catch(() => null) };
    },
    staffImportExcel: async (ctx) => {
      const { page } = ctx;
      await page.goto(`${ctx.baseUrl}/dashboard/inventory?area=stock&view=opening`);
      await page.getByRole("heading", { name: "Opening stock import" }).waitFor({ timeout: 60_000 });
      await page.locator('input[type="file"]').first().setInputFiles(ctx.shared.makeXlsx(ctx.vars.name));
      await page.getByRole("button", { name: "Preview import" }).click();
      await page.getByRole("button", { name: "Confirm opening import" }).click({ timeout: 30_000 });
      await page.getByText("Import failed").first().waitFor({ timeout: 30_000 }).catch(() => {});
    },
    pharmacistSubmits: async (ctx) => {
      await as(ctx, "pharmacist");
      await openStock(ctx);
      await ctx.page.getByRole("button", { name: "Add batch" }).click();
      await fillAddForm(ctx.page, { name: ctx.vars.name, costPrice: "8", sellingPrice: "9", sku: ctx.vars.sku });
      await ctx.page.getByRole("button", { name: "Add Item" }).click();
      await ctx.page.getByRole("dialog").getByRole("heading", { name: "Sent to doctor for approval" }).waitFor({ timeout: 15_000 }).catch(() => {});
    },
    doctorAddsDirect: async (ctx) => {
      ctx.vars.pendingBefore = pendingCount();
      await as(ctx, "doctor");
      await openStock(ctx);
      await ctx.page.getByRole("button", { name: "Add batch" }).click();
      await fillAddForm(ctx.page, { name: ctx.vars.name, costPrice: "8", sellingPrice: "9", sku: ctx.vars.sku });
      await ctx.page.getByRole("button", { name: "Add Item" }).click();
      await ctx.page.getByRole("dialog").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
      await searchStock(ctx, ctx.vars.name);
    },
    doctorLoginAndSearch: async (ctx) => {
      await as(ctx, "doctor");
      await openStock(ctx);
      await searchStock(ctx, ctx.vars.name);
    },
    openApprovals: async (ctx) => openApprovals(ctx),
    clickReject: async (ctx) => {
      ctx.vars.pendingAtReview = pendingCount();
      await card(ctx, ctx.vars.name).getByRole("button", { name: "Reject" }).click();
      await ctx.page.getByRole("dialog").waitFor();
    },
    typeBlankNote: async (ctx) => ctx.page.getByRole("dialog").locator("textarea").fill("   "),
    typeNote: async (ctx) => ctx.page.getByRole("dialog").locator("textarea").fill(ctx.vars.note),
    confirmReject: async (ctx) => {
      await ctx.page.getByRole("dialog").getByRole("button", { name: "Reject" }).click();
      await ctx.page.getByRole("dialog").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
    },
    staffLoginAndOpenRequests: async (ctx) => {
      await as(ctx, "staff");
      await openStock(ctx);
      await openApprovals(ctx);
    },
    clickApprove: async (ctx) => {
      ctx.vars.pendingAtReview = pendingCount();
      await card(ctx, ctx.vars.name).getByRole("button", { name: "Approve" }).click();
      await ctx.page.getByRole("dialog").waitFor();
    },
    cancel: async (ctx) => {
      await ctx.page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
      await ctx.page.getByRole("dialog").waitFor({ state: "detached" });
    },
    confirmApprove: async (ctx, t) => {
      const answered = ctx.page.waitForResponse((r) => r.url().includes("/approve") && r.request().method() === "POST", { timeout: 15_000 });
      await ctx.page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
      ctx.vars.lastApprove = (await answered).status();
      if (t.from === "StaleApproveDialog") await ctx.page.getByText("Review failed").first().waitFor({ timeout: 5_000 }).catch(() => {});
      else await ctx.page.getByRole("dialog").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
    },
    doubleClickApprove: async (ctx) => {
      await ctx.page.getByRole("dialog").getByRole("button", { name: "Approve" }).dblclick();
      await ctx.page.getByRole("dialog").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
    },
    secondDoctorApproves: async (ctx) => {
      const other = await ctx.context.browser().newContext({ viewport: { width: 1440, height: 900 } });
      try {
        await becomeIn(other, ctx.baseUrl, ctx.shared.sessions.doctor2);
        const page = await other.newPage();
        const octx = { ...ctx, page, context: other, vars: { role: "doctor" } };
        await openStock(octx);
        await openApprovals(octx);
        await card(octx, ctx.vars.name).getByRole("button", { name: "Approve" }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
        await page.getByRole("dialog").waitFor({ state: "detached", timeout: 15_000 });
        await page.screenshot({ path: path.join(os.tmpdir(), "cr30-second-doctor.png") }).catch(() => {});
      } finally {
        await other.close();
      }
    },
    doctorSearchStock: async (ctx) => {
      await openStock(ctx);
      await searchStock(ctx, ctx.vars.name);
    },
    staffLoginAndSearch: async (ctx) => {
      await as(ctx, "staff");
      await openStock(ctx);
      await searchStock(ctx, ctx.vars.name);
    },
  },

  checks: {
    StaffStock: async (ctx, check) => {
      check(await ctx.page.getByRole("button", { name: "Add batch" }).isVisible(), "staff sees Add batch");
      check((await stockRow(ctx, ctx.vars.name).count()) === 0, "stock search has no row for the new item");
      check(itemCount(ctx.vars.name) === 0, "DB: 0 inventory items with this name");
      check(requestRows(ctx.vars.name).length === 0, "DB: no request for this name yet");
      await staffDoesNotSeeBadge(ctx, check);
    },
    StaffAddForm: async (ctx, check) => {
      const d = ctx.page.getByRole("dialog");
      check(await d.getByRole("heading", { name: "Add Inventory Item" }).isVisible(), "Add Inventory Item dialog open");
      check((await d.locator("#name").inputValue()) === "", "item name empty");
    },
    StaffDuplicateSku: async (ctx, check) => {
      const d = ctx.page.getByRole("dialog");
      check(await d.getByRole("heading", { name: "Add Inventory Item" }).isVisible(), "form stays open (not sent for approval)");
      const msg = await until(async () => (await d.getByText(/SKU already exists/i).count()) > 0);
      check(msg, "dialog says the SKU already exists");
      check((await d.locator("#name").inputValue()) === ctx.vars.name, "typed values kept for correction");
      check(requestRows(ctx.vars.name).length === 0, "DB: no request created for a duplicate SKU");
      check(itemCount(ctx.vars.name) === 0, "DB: 0 items");
    },
    StaffSubmitted: async (ctx, check) => {
      const d = ctx.page.getByRole("dialog");
      check(await d.getByRole("heading", { name: "Sent to doctor for approval" }).isVisible(), "confirmation title");
      check((await d.getByText(ADD_SUCCESS, { exact: true }).count()) === 1, `confirmation text "${ADD_SUCCESS}"`);
      const reqs = requestRows(ctx.vars.name);
      check(reqs.length === 1 && reqs[0].status === "PENDING", "DB: exactly one PENDING request");
      check(reqs[0] && reqs[0].requester === ACCOUNTS.staff, "DB: request recorded against the reception user");
      check(itemCount(ctx.vars.name) === 0, "DB: 0 inventory items while pending");
      check(pendingCount() === ctx.vars.pendingBefore + 1, "DB: branch pending count +1");
    },
    StaffStockPending: async (ctx, check) => {
      check((await ctx.page.getByRole("dialog").count()) === 0, "dialog closed");
      check((await stockRow(ctx, ctx.vars.name).count()) === 0, "staff stock search: item absent while pending");
      check(itemCount(ctx.vars.name) === 0, "DB: 0 items");
    },
    StaffRequestsPending: async (ctx, check) => {
      const { page } = ctx;
      check(await page.getByRole("heading", { name: "My item requests" }).isVisible(), "staff heading 'My item requests'");
      const c = card(ctx, ctx.vars.name);
      check((await c.count()) === 1, "request card for the item");
      check((await c.getByText("Waiting for doctor", { exact: true }).count()) === 1, "status 'Waiting for doctor'");
      check((await c.getByRole("button", { name: "Approve" }).count()) === 0, "staff has no Approve button");
      check(requestRows(ctx.vars.name)[0]?.status === "PENDING", "DB: still PENDING");
      check(itemCount(ctx.vars.name) === 0, "DB: 0 items");
      await staffDoesNotSeeBadge(ctx, check);
    },
    StaffApproveForbidden: async (ctx, check) => {
      check(ctx.vars.lastApi?.status === 403, `staff approve API returns 403 (got ${ctx.vars.lastApi?.status})`);
      check(requestRows(ctx.vars.name)[0]?.status === "PENDING", "DB: request still PENDING");
      check(itemCount(ctx.vars.name) === 0, "DB: 0 items");
    },
    StaffImportRefused: async (ctx, check) => {
      const failed = await until(async () => (await ctx.page.getByText("Import failed").count()) > 0, 15_000);
      check(failed, "toast 'Import failed'");
      check((await ctx.page.getByText("Ask a doctor to import new items").count()) > 0, "message 'Ask a doctor to import new items'");
      check(itemCount(ctx.vars.name) === 0, "DB: 0 items from the import");
    },
    PharmacistSubmitted: async (ctx, check) => {
      const d = ctx.page.getByRole("dialog");
      check((await d.getByText(ADD_SUCCESS, { exact: true }).count()) === 1, "pharmacist sees the approval confirmation");
      const reqs = requestRows(ctx.vars.name);
      check(reqs.length === 1 && reqs[0].status === "PENDING" && reqs[0].requester === ACCOUNTS.pharmacist, "DB: PENDING request by the pharmacist");
      check(itemCount(ctx.vars.name) === 0, "DB: 0 items");
    },
    DoctorAddedDirect: async (ctx, check) => {
      check((await stockRow(ctx, ctx.vars.name).count()) === 1, "doctor's item is in stock search immediately");
      check(itemCount(ctx.vars.name) === 1, "DB: exactly 1 item");
      check(requestRows(ctx.vars.name).length === 0, "DB: no approval request for a doctor's own add");
      check(pendingCount() === ctx.vars.pendingBefore, "DB: pending count unchanged");
    },
    DoctorStockPending: async (ctx, check) => {
      check((await stockRow(ctx, ctx.vars.name).count()) === 0, "doctor stock search: item absent while pending");
      check(itemCount(ctx.vars.name) === 0, "DB: 0 items");
      check(pendingCount() >= 1, "DB: at least one pending request");
      await checkBadge(ctx, check);
    },
    DoctorNewItemsPending: async (ctx, check) => {
      const { page } = ctx;
      const n = pendingCount();
      const task = page.getByRole("navigation", { name: "stock tasks" }).getByRole("button", { name: /^Approve corrections/ });
      check((await until(async () => (await task.textContent()).trim() === `Approve corrections (${n})`)), `task button 'Approve corrections (${n})'`);
      const tab = page.getByRole("tab", { name: /New items/ });
      check((await tab.getAttribute("aria-selected")) === "true", "New items tab selected");
      check((await tab.locator(`[aria-label="${n} pending"]`).textContent()) === String(n), `New items tab badge ${n}`);
      await checkBadge(ctx, check);
      const c = card(ctx, ctx.vars.name);
      check((await c.count()) === 1, "request card present");
      check((await c.getByText("Waiting for doctor", { exact: true }).count()) === 1, "status Waiting for doctor");
      const want = {
        "Cost price": ctx.vars.details.costPrice,
        "Selling price": ctx.vars.details.sellingPrice,
        SKU: ctx.vars.sku,
        ...(ctx.vars.details.manufacturer
          ? { Manufacturer: "CR30 Pharma Ltd", "Generic name": "Nebulexamol", MRP: "60", "Pack size": "10", HSN: "3004", "GST %": "12", Batch: "B-CR30" }
          : {}),
      };
      for (const [label, value] of Object.entries(want)) {
        const dd = c.locator("dt", { hasText: new RegExp(`^${label.replace(/[%]/g, "\\$&")}$`) }).locator("xpath=following-sibling::dd[1]");
        const got = (await dd.textContent().catch(() => null))?.trim();
        check(got === value, `detail ${label} = ${value} (got ${got})`);
      }
      check((await c.getByText(`Requested by ${ctx.shared.sessions.staff.name}`).count()) === 1, "shows requester name");
      check((await c.getByRole("button", { name: "Approve" }).count()) === 1, "Approve button");
      check((await c.getByRole("button", { name: "Reject" }).count()) === 1, "Reject button");
      check(requestRows(ctx.vars.name)[0]?.status === "PENDING", "DB: still PENDING");
      check(itemCount(ctx.vars.name) === 0, "DB: 0 items");
    },
    RejectDialog: async (ctx, check) => {
      const d = ctx.page.getByRole("dialog");
      check(await d.getByRole("heading", { name: "Reject new item" }).isVisible(), "Reject dialog");
      check((await d.locator("textarea").inputValue()).trim() === "", "note empty or blank");
      check(await d.getByRole("button", { name: "Reject" }).isDisabled(), "Reject disabled without a note");
      check(requestRows(ctx.vars.name)[0]?.status === "PENDING", "DB: still PENDING");
    },
    RejectReady: async (ctx, check) => {
      const d = ctx.page.getByRole("dialog");
      check(await d.getByRole("button", { name: "Reject" }).isEnabled(), "Reject enabled with a note");
    },
    DoctorRejected: async (ctx, check) => {
      const c = card(ctx, ctx.vars.name);
      const ok = await until(async () => (await c.getByText("Rejected", { exact: true }).count()) === 1);
      check(ok, "card status Rejected");
      check((await c.getByText(`Rejected by ${ctx.shared.sessions.doctor.name}`).count()) === 1, "Rejected by the doctor");
      check((await c.getByText(ctx.vars.note).count()) === 1, "rejection note shown");
      check((await c.getByRole("button", { name: "Approve" }).count()) === 0, "no Approve on a rejected request");
      const [r] = requestRows(ctx.vars.name);
      check(r?.status === "REJECTED" && r.note === ctx.vars.note && r.reviewer === ACCOUNTS.doctor, "DB: REJECTED with note and reviewer");
      check(itemCount(ctx.vars.name) === 0, "DB: item never created");
      await checkBadge(ctx, check, { expectPending: ctx.vars.pendingAtReview - 1 });
    },
    StaffSeesRejected: async (ctx, check) => {
      const c = card(ctx, ctx.vars.name);
      check(await ctx.page.getByRole("heading", { name: "My item requests" }).isVisible(), "staff My item requests");
      check((await c.getByText("Rejected", { exact: true }).count()) === 1, "staff sees Rejected");
      check((await c.getByText(`Rejected by ${ctx.shared.sessions.doctor.name}`).count()) === 1, "staff sees reviewer");
      check((await c.getByText(ctx.vars.note).count()) === 1, "staff sees the note");
      check(itemCount(ctx.vars.name) === 0, "DB: 0 items");
    },
    ApproveDialog: async (ctx, check) => {
      const d = ctx.page.getByRole("dialog");
      check(await d.getByRole("heading", { name: "Approve new item" }).isVisible(), "Approve dialog");
      check((await d.getByText(`${ctx.vars.name}. The item is added to inventory immediately.`).count()) === 1, "dialog names the item");
      check(itemCount(ctx.vars.name) === 0, "DB: 0 items before confirming");
    },
    DoctorApproved: async (ctx, check) => {
      const c = card(ctx, ctx.vars.name);
      const ok = await until(async () => (await c.getByText("Approved", { exact: true }).count()) === 1);
      check(ok, "card status Approved");
      check((await c.getByText(`Approved by ${ctx.shared.sessions.doctor.name}`).count()) === 1, "Approved by the doctor");
      check((await c.getByRole("button", { name: "Approve" }).count()) === 0, "no Approve button left");
      const [r] = requestRows(ctx.vars.name);
      check(r?.status === "APPROVED" && r.reviewer === ACCOUNTS.doctor && r.itemId, "DB: APPROVED, reviewer, linked item");
      check(itemCount(ctx.vars.name) === 1, `DB: exactly 1 item (got ${itemCount(ctx.vars.name)})`);
      const sku = sql(`select sku || '|' || "costPrice" || '|' || "sellingPrice" from inventory_items where name = ${lit(ctx.vars.name)}`);
      check(sku === `${ctx.vars.sku}|${ctx.vars.details.costPrice}|${ctx.vars.details.sellingPrice}`, `DB item carries proposed SKU/prices (${sku})`);
      await checkBadge(ctx, check, { expectPending: ctx.vars.pendingAtReview - 1 });
    },
    StaleApproveDialog: async (ctx, check) => {
      check(await ctx.page.getByRole("dialog").getByRole("heading", { name: "Approve new item" }).isVisible(), "doctor A's dialog still open");
      const [r] = requestRows(ctx.vars.name);
      check(r?.status === "APPROVED" && r.reviewer === ACCOUNTS.doctor2, "DB: approved by the second doctor");
      check(itemCount(ctx.vars.name) === 1, "DB: exactly 1 item");
    },
    ApproveConflict: async (ctx, check) => {
      const { page } = ctx;
      const msg = await until(async () => (await page.getByText("This request was already approved").count()) > 0);
      check(ctx.vars.lastApprove === 409, `second approve answered 409 (got ${ctx.vars.lastApprove})`);
      check(msg, "doctor A told 'This request was already approved'");
      check(await page.getByText("This request was already approved").first().isVisible(), "the message is visible on screen");
      check((await page.getByText("Review failed").count()) > 0, "toast title 'Review failed'");
      check(itemCount(ctx.vars.name) === 1, `DB: still exactly 1 item (got ${itemCount(ctx.vars.name)})`);
      const c = card(ctx, ctx.vars.name);
      const shown = await until(async () => (await c.getByText(`Approved by ${ctx.shared.sessions.doctor2.name}`).count()) === 1);
      check(shown, "list refreshes to 'Approved by' the second doctor");
    },
    DoctorStockHasItem: async (ctx, check) => {
      check((await stockRow(ctx, ctx.vars.name).count()) === 1, "doctor stock search: item present after approval");
    },
    StaffStockHasItem: async (ctx, check) => {
      check((await stockRow(ctx, ctx.vars.name).count()) === 1, "staff stock search: item present after approval");
      await staffDoesNotSeeBadge(ctx, check);
    },
    StaffSeesApproved: async (ctx, check) => {
      const c = card(ctx, ctx.vars.name);
      check((await c.getByText("Approved", { exact: true }).count()) === 1, "staff sees Approved");
      check((await c.getByText(`Approved by ${ctx.shared.sessions.doctor.name}`).count()) === 1, "staff sees reviewer");
    },
  },

  teardown: async ({ shared }) => {
    if (shared.xlsxDir) fs.rmSync(shared.xlsxDir, { recursive: true, force: true });
  },
};

module.exports = { model, driver };
