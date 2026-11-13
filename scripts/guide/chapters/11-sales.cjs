const line = (page, name) => page.locator("[data-invoice-item]").filter({ has: page.getByRole("heading", { name, level: 4, exact: true }) });
const saleRow = (page, text) => page.locator('[role="tabpanel"]:visible tbody tr').filter({ hasText: text });

async function pickPatient(page, name) {
  await page.getByLabel("Patient *").fill(name);
  await page.locator("div.cursor-pointer").filter({ hasText: name }).first().dispatchEvent("mousedown");
  await page.waitForFunction((n) => document.querySelector("#billingName")?.value === n, name, { timeout: 30000 });
}

async function pickDoctor(page) {
  await page.getByRole("combobox").filter({ hasText: "Select doctor" }).click();
  await page.getByRole("option", { name: /Priya Menon/ }).click();
}

async function addDrug(page, name, search = name.split(" ")[0]) {
  await page.getByLabel("Search Drugs").fill(search);
  const result = page.locator('[role="button"]').filter({ has: page.getByRole("heading", { name, level: 4 }) }).first();
  await result.getByRole("button", { name: "Add" }).click();
  await line(page, name).waitFor({ timeout: 30000 });
}

async function itemDiscount(page, name, percent) {
  await line(page, name).locator("input[type=number]").nth(2).fill(String(percent));
}

/** Clicks Confirm Invoice in the open preview. A busy server can refuse a checkout once; the same click retries it safely. */
async function confirmInvoice(page) {
  const done = page.getByRole("button", { name: "Invoice Confirmed" });
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.getByRole("button", { name: "Confirm Invoice" }).click();
    if (await done.waitFor({ timeout: 20000 }).then(() => true, () => false)) return;
  }
  throw Error("the invoice was not confirmed");
}

async function finish(page) {
  await page.getByRole("button", { name: "Print Preview" }).click();
  await confirmInvoice(page);
}

/** The newest bill for a patient, so a shot can open what an earlier shot created. */
async function latestBill(h, patientName, status) {
  const db = h.db();
  try {
    return await db.pharmacyInvoice.findFirst({
      where: { branchId: h.stack.branchId, billingName: patientName, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
    });
  } finally {
    await db.$disconnect();
  }
}

async function newSale(page, h, patient, lines, { payment, notes, billRupees } = {}) {
  await h.goto("/dashboard/pharmacy/sales/bill");
  await pickPatient(page, patient);
  await pickDoctor(page);
  for (const [name, qty, disc, search] of lines) {
    await addDrug(page, name, search);
    if (qty && qty !== 1) await line(page, name).getByLabel("Quantity").fill(String(qty));
    if (disc) await itemDiscount(page, name, disc);
  }
  if (billRupees) {
    await page.getByRole("button", { name: "Rupees" }).click();
    await page.getByLabel("Bill discount", { exact: true }).fill(String(billRupees));
  }
  if (payment) {
    await page.locator('div:has(> label[for="paymentMethod"]) [role="combobox"]').click();
    await page.getByRole("option", { name: payment, exact: true }).click();
  }
  if (notes) await page.getByLabel("Notes").fill(notes);
}

/**
 * The seeded bills are numbered without moving the clinic's bill-number counter, so finishing a bill would
 * reuse PHI-<year>-001 and fail. Raise the counter past the highest existing number (never lowers it).
 */
async function raiseBillCounter(h) {
  const db = h.db();
  try {
    const year = h.seed.today.slice(0, 4);
    const bills = await db.pharmacyInvoice.findMany({ where: { branchId: h.stack.branchId, invoiceNumber: { startsWith: `PHI-${year}-` } }, select: { invoiceNumber: true } });
    const highest = Math.max(0, ...bills.map((b) => Number(b.invoiceNumber.split("-")[2]) || 0));
    const key = { type: "PHARMACY", branchId: h.stack.branchId, periodKey: year };
    const current = await db.numberSequence.findUnique({ where: { type_branchId_periodKey: key } });
    if (!current) await db.numberSequence.create({ data: { ...key, lastNumber: highest } });
    else if (current.lastNumber < highest) await db.numberSequence.update({ where: { type_branchId_periodKey: key }, data: { lastNumber: highest } });
  } finally {
    await db.$disconnect();
  }
}

const RX_PATIENT = "Pooja Deshpande";

module.exports = {
  id: "11-sales",
  title: "Sales",
  intro: "test",
  setup: async (h) => {
    await raiseBillCounter(h);
    const patient = h.seed.patients.find((p) => p.name === RX_PATIENT);
    const db = h.db();
    try {
      const existing = await db.prescription.findFirst({ where: { visit: { patientId: patient.id }, items: { contains: "Azelaic" }, createdAt: { gte: new Date(Date.now() - 20 * 3600000) } } });
      if (existing) return;
    } finally {
      await db.$disconnect();
    }
    const doctorId = h.stack.users.doctor.id;
    const visit = await h.api("doctor", "POST", "/visits", {
      patientId: patient.id, doctorId,
      vitals: { systolicBP: 112, diastolicBP: 72, heartRate: 70, weight: 54, height: 160 },
      complaints: [{ complaint: "Dark marks left after acne" }], diagnosis: [{ diagnosis: "Post-inflammatory hyperpigmentation" }],
    });
    await h.api("doctor", "POST", "/prescriptions", {
      patientId: patient.id, visitId: visit.id, doctorId, diagnosis: "Post-inflammatory hyperpigmentation", followUpInstructions: "Review in 6 weeks.",
      items: [
        { drugName: "Azelaic Acid Cream 20% 15 g", dosage: 1, dosageUnit: "TABLET", frequency: "ONCE_DAILY", duration: 30, durationUnit: "DAYS", instructions: "Apply a thin layer at night", quantity: 1 },
        { drugName: "Sunscreen SPF 50 Lotion 50 ml", dosage: 1, dosageUnit: "TABLET", frequency: "TWICE_DAILY", duration: 30, durationUnit: "DAYS", instructions: "Reapply every 3 hours outdoors", quantity: 1 },
      ],
    }, { "Idempotency-Key": `guide-11-rx-${visit.id}` });
  },
  sections: [
    {
      title: "Start a new sale",
      who: "Pharmacists",
      body: ["x"],
      shots: [
        {
          file: "new-sale-search",
          as: "pharmacist",
          caption: "x",
          viewport: { width: 1440, height: 1300 },
          run: async (page, h) => {
            await h.goto("/dashboard/pharmacy/sales/bill");
            await pickPatient(page, "Divya Pillai");
            await pickDoctor(page);
            await page.getByLabel("Search Drugs").fill("Sun");
            await h.settle(1200);
          },
          target: '[aria-label="Prescription bill"]',
        },
        {
          file: "new-sale-items",
          as: "pharmacist",
          caption: "x",
          viewport: { width: 1440, height: 1500 },
          run: async (page, h) => {
            await addDrug(page, "Sunscreen SPF 50 Lotion 50 ml", "Sun");
            await line(page, "Sunscreen SPF 50 Lotion 50 ml").getByLabel("Quantity").fill("2");
            await addDrug(page, "Niacinamide Serum 10% 30 ml", "Niac");
            await itemDiscount(page, "Niacinamide Serum 10% 30 ml", 10);
            await page.getByLabel("Search Drugs").fill("");
            await h.settle(600);
          },
          target: '[aria-label="Prescription bill"]',
        },
        {
          file: "new-sale-preview",
          as: "pharmacist",
          caption: "x",
          run: async (page, h) => {
            await page.getByRole("button", { name: "Rupees" }).click();
            await page.getByLabel("Bill discount", { exact: true }).fill("50");
            await page.locator('div:has(> label[for="paymentMethod"]) [role="combobox"]').click();
            await page.getByRole("option", { name: "UPI", exact: true }).click();
            await page.getByRole("button", { name: "Print Preview" }).click();
            await h.settle(1500);
          },
        },
        {
          file: "new-sale-confirmed",
          as: "pharmacist",
          caption: "x",
          run: async (page, h) => {
            await confirmInvoice(page);
            await h.settle(1500);
          },
          after: async (page) => {
            await page.getByRole("button", { name: "Close", exact: true }).first().click();
          },
        },
      ],
    },
  ],
};
