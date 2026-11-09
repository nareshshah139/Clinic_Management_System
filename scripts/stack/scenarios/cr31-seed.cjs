const assert = require("node:assert/strict");

const IST_MS = 19800000;
const istDay = (instant) => new Date(instant.getTime() + IST_MS).toISOString().slice(0, 10);
const ddmmyyyy = (day) => `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

const PRODUCTS = [
  ["Adapalene Gel 15g", "A-01", 12],
  ["Azelaic Acid Cream 20%", "A-02", 8],
  ["Benzoyl Peroxide Gel 2.5%", "A-03", 15],
  ["Calamine Lotion 100ml", "B-01", 20],
  ["Cetirizine 10mg Tab", "B-02", 40],
  ["Clindamycin Gel 1%", "B-03", 9],
  ["Clobetasol Cream 15g", "C-01", 11],
  ["Doxycycline 100mg Cap", "C-02", 30],
  ["Fluconazole 150mg Tab", "C-03", 14],
  ["Fusidic Acid Cream 15g", "D-01", 10],
  ["Hydroquinone Cream 2%", "D-02", 6],
  ["Isotretinoin 10mg Cap", "D-03", 25],
  ["Ketoconazole Shampoo 100ml", "E-01", 7],
  ["Luliconazole Cream 1%", "E-02", 13],
  ["Minoxidil Solution 5%", "E-03", 5],
  ["Mometasone Cream 0.1%", "F-01", 16],
  ["Niacinamide Serum 10%", "F-02", 9],
  ["Permethrin Cream 5%", "F-03", 4],
  ["Salicylic Acid Face Wash", "G-01", 18],
  ["Tacrolimus Ointment 0.1%", "G-02", 8],
];
const EMPTY = [["Terbinafine Cream 1%", "G-03"], ["Tretinoin Cream 0.025%", "H-01"]];

async function api(stack, token, method, path, body) {
  const response = await fetch(`${stack.api}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw Object.assign(Error(`${method} ${path} -> ${response.status} ${text.slice(0, 300)}`), { status: response.status, data });
  return data;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function throttled(run, label) {
  for (let attempt = 0; ; attempt++) {
    const status = await run();
    if (status !== 429 || attempt >= 12) return status;
    console.log(`  ${label}: login throttled, waiting`);
    await sleep(10000);
  }
}

async function tokenFor(stack, who) {
  const user = stack.users[who];
  let token;
  const status = await throttled(async () => {
    const response = await fetch(`${stack.api}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: user.email, password: user.password }),
    });
    if (response.status === 201) token = (await response.json()).access_token;
    return response.status;
  }, who);
  assert.equal(status, 201, `login ${who}`);
  return token;
}

async function browserLogin(stack, page, who) {
  const user = stack.users[who];
  await page.goto(`${stack.base}/login`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const status = await throttled(
    () =>
      page.evaluate(
        async ({ identifier, password }) =>
          (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) })).status,
        { identifier: user.email, password: user.password },
      ),
    who,
  );
  assert.equal(status, 201, `browser login ${who}`);
}

async function addUser(stack, key, { role, firstName, lastName, permissions }) {
  const owner = await stack.db.user.findUnique({ where: { id: stack.users.owner.id } });
  const email = `${firstName}.${lastName}@stack.example.invalid`.toLowerCase();
  const user = await stack.db.user.create({
    data: { branchId: stack.branch.id, email, firstName, lastName, role, password: owner.password, permissions: JSON.stringify(permissions) },
  });
  stack.users[key] = { id: user.id, email, password: stack.users.owner.password, role, firstName, lastName };
  return user;
}

async function seed(stack) {
  const today = istDay(new Date());
  const pharmacist = await stack.db.user.findUnique({ where: { id: stack.users.pharmacist.id } });
  await addUser(stack, "admin", { role: "ADMIN", firstName: "Asha", lastName: "Rao", permissions: [] });
  await addUser(stack, "kavya", { role: "PHARMACIST", firstName: "Kavya", lastName: "Joshi", permissions: JSON.parse(pharmacist.permissions) });
  const batches = {};
  for (const [index, [name, location, stock]] of PRODUCTS.entries()) {
    const item = await stack.db.inventoryItem.create({
      data: {
        branchId: stack.branch.id, name, type: "MEDICINE", costPrice: 10 + index * 2.5, sellingPrice: 30 + index * 4, unit: "STRIPS", currentStock: stock, gstRate: 12,
        batchNumber: `B${String(index + 1).padStart(3, "0")}`, expiryDate: new Date(`2027-${String((index % 12) + 1).padStart(2, "0")}-28T00:00:00Z`),
        stockStatus: "IN_STOCK", storageLocation: `Rack ${location}`, status: "ACTIVE",
      },
    });
    batches[name] = item;
  }
  for (const [name, location] of EMPTY)
    batches[name] = await stack.db.inventoryItem.create({
      data: {
        branchId: stack.branch.id, name, type: "MEDICINE", costPrice: 40, sellingPrice: 90, unit: "TUBES", currentStock: 0, gstRate: 12,
        batchNumber: "E001", expiryDate: new Date("2027-09-30T00:00:00Z"), stockStatus: "OUT_OF_STOCK", storageLocation: `Rack ${location}`, status: "ACTIVE",
      },
    });
  await stack.db.inventoryWorkflowSettings.create({
    data: {
      branchId: stack.branch.id,
      updatedBy: stack.users.owner.id,
      settings: { auditEnabled: false, auditDailyCount: 6, auditAdjustmentMode: "THRESHOLD", approvalValue: 900, negativeCountNeedsApproval: true, ownerId: stack.users.owner.id, autoMinMaxEnabled: false, autoPoEnabled: false },
    },
  });
  return { today, batches, names: PRODUCTS.map(([name]) => name) };
}

module.exports = { seed, api, tokenFor, browserLogin, addUser, istDay, ddmmyyyy, PRODUCTS };
