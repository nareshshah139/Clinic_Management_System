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

const RX_PATIENT = "Pooja Deshpande";

const SALES = "/dashboard/pharmacy/sales";
const V = (page) => page.locator('[role="tabpanel"]:visible');
const P = { sale: "Divya Pillai", draft: "Harish Mishra", discard: "Rahul Bhatt", part: "Lakshmi Venkataraman" };

async function openBill(page, h, patient, edit) {
  const bill = await latestBill(h, patient, "CONFIRMED");
  if (!bill) throw Error(`no finished bill for ${patient}`);
  await h.goto(`${SALES}/bill?bill=${bill.id}${edit ? "&edit=discount" : ""}`, 1200);
  return bill;
}

async function searchSales(page, h, field, text) {
  await h.goto(SALES);
  await V(page).getByLabel("Search by").selectOption(field);
  await V(page).getByPlaceholder(/^(Bill number|Patient name|Mobile number)$/).fill(text);
  await h.settle(1500);
}

module.exports = {
  id: "11-sales",
  title: "Sales",
  intro:
    "The Sales page is the pharmacy's bill book. Every pharmacy bill, draft bill and customer return is listed here, and <b>New sale</b> opens the screen where you bill medicines to a patient. Pharmacists use it all day. Doctors, admins and owners can open it too.",
  setup: async (h) => {
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
      title: "Find your way around the Sales list",
      who: "Pharmacists, admins",
      body: [
        "Open <b>Sales</b> from the menu. The list shows the bills of the current financial year, newest first. Two tabs at the top switch between <b>Sales</b> (bills) and <b>Returns</b> (money and medicines given back). The button beside the tabs starts a <b>New sale</b>, or a <b>New return</b> when the Returns tab is open.",
        "Click a bill number, or anywhere on a row, to open that bill.",
      ],
      fields: [
        ["1. Search by", "Choose what to search: <b>Bill No</b>, <b>Patient</b> name or <b>Mobile</b> number. Then type in the box beside it. The list updates as you type."],
        ["2. Period", "The dates the list covers. See <i>Choose the period</i> below."],
        ["3. Payment", "Shows only bills paid by one mode, or only bills with money still due. See <i>Filter by payment</i>."],
        ["4. More filters", "Filters by state, source and the person who made the entry. A number on the button shows how many of these filters are on."],
        ["5. Row actions", "Edit discount, Print and Send on WhatsApp for that bill. See <i>Row actions</i>."],
        ["6. Totals line", "The total of the bills in the list and how many there are. Drafts and cancelled bills are not counted; a note under the total says how many were left out. The arrows on the right move between pages of 50 rows."],
      ],
      shots: [
        {
          file: "sales-list",
          as: "pharmacist",
          caption: "The Sales list with its search, filters, row actions and totals.",
          run: async (page, h) => {
            await h.goto(SALES, 1200);
            await h.mark(V(page).getByLabel("Search by"), 1);
            await h.mark(V(page).getByLabel("Period"), 2);
            await h.mark(V(page).getByRole("combobox", { name: /^Payment/ }), 3);
            await h.mark(V(page).getByRole("button", { name: /More filters/ }), 4);
            await h.mark(V(page).locator("tbody tr").first().getByRole("button", { name: /Edit discount/ }), 5);
            await h.mark(V(page).getByText(/^Total Amount/).first(), 6);
          },
        },
      ],
      after: [
        "The columns are <b>Bill No</b>, <b>Entry Date</b> (when the bill was saved), <b>Bill Date</b>, <b>Entry By</b> (who saved it), <b>Patient</b>, <b>Mobile</b>, <b>Bill Amount</b> and <b>Payment</b>. Click a column heading to sort by it. Click it again to reverse the order. The small arrow shows the column the list is sorted by.",
      ],
    },
    {
      title: "Read the badges on a bill row",
      who: "Pharmacists, admins",
      body: ["Coloured badges in the <b>Bill No</b> and <b>Payment</b> columns tell you the state of each bill at a glance."],
      fieldsHeading: ["Badge", "Meaning"],
      fields: [
        ["Cash, UPI, Card, Net banking, Wallet, Insurance", "How the bill was paid. A bill paid in two ways shows two badges."],
        ["Due ₹…", "Red. The patient still owes this amount on the bill."],
        ["Refund due ₹…", "Amber. The patient paid more than the bill now comes to, usually after a discount was raised. Hand the money back and record the refund (see <i>Change the discount on a finished bill</i>)."],
        ["Refunded ₹…", "Money already paid back on this bill."],
        ["Draft", "A bill saved to finish later. It has no bill number yet and has not moved stock or taken payment. A grey note such as <i>PHI-2026-080 not final</i> may follow it."],
        ["Cancelled / Cancelled draft", "The bill or draft was cancelled. Its amount is struck through and it is not counted in the total."],
        ["Revised", "A discount on this bill was changed after it was finished."],
        ["Counter sale", "A quick sale made in Inventory rather than on this bill screen. It opens in Inventory."],
      ],
      shots: [
        {
          file: "sales-due",
          as: "pharmacist",
          caption: "Bills with money still due, chosen with Payment: Due (unpaid). The totals line now shows the amount still to collect.",
          run: async (page, h) => {
            await h.goto(SALES, 1000);
            await V(page).getByRole("combobox", { name: /^Payment/ }).selectOption("CREDIT");
            await h.settle(1500);
          },
        },
      ],
    },
    {
      title: "Search for a bill",
      who: "Pharmacists, admins",
      body: ["Use search when a patient comes back with a question about a bill."],
      steps: [
        "In <b>Search by</b>, choose <b>Bill No</b>, <b>Patient</b> or <b>Mobile</b>.",
        "Type part of the bill number, the patient's name or the mobile number. The list narrows as you type.",
        "Click <b>Clear filters</b> to go back to the full list.",
      ],
      shots: [
        {
          file: "sales-search",
          as: "pharmacist",
          caption: "Searching by patient name.",
          run: async (page, h) => {
            await searchSales(page, h, "patient", "Meera");
          },
        },
      ],
    },
    {
      title: "Choose the period",
      who: "Pharmacists, admins",
      body: [
        "The <b>Period</b> list picks the dates the Sales list covers. It starts on the current financial year (April to March). The dates chosen show on the button beside it. Click that button to type your own <b>from</b> and <b>to</b> dates; the period then shows <b>Custom</b>.",
      ],
      fieldsHeading: ["Period", "Dates covered"],
      fields: [
        ["Today", "Today only."],
        ["Yesterday", "Yesterday only."],
        ["Last 7 days", "Today and the six days before it."],
        ["This month", "The calendar month so far."],
        ["FY 2026-27", "The current financial year, 1 April to 31 March."],
        ["FY 2025-26", "The previous financial year."],
        ["Custom", "The dates you type in the box that opens from the dates button."],
      ],
      shots: [
        {
          file: "sales-dates",
          as: "pharmacist",
          caption: "Click the dates beside Period to type your own date range.",
          run: async (page, h) => {
            await h.goto(SALES, 1000);
            await V(page).getByRole("button", { name: /^Change dates/ }).click();
            await h.settle(500);
          },
          after: async (page) => page.keyboard.press("Escape"),
        },
      ],
    },
    {
      title: "Filter by payment and by state",
      who: "Pharmacists, admins",
      body: [
        "<b>Payment</b> shows only bills paid by one mode: Cash, UPI, Card, Net banking, Wallet, Insurance or Other. Choose <b>Due (unpaid)</b> to list every bill with money still owed. With a payment filter on, the totals line shows how much was collected by that mode, or how much is still due.",
        "<b>More filters</b> opens three more lists. <b>State</b> shows only Final, Draft or Cancelled bills. <b>Source</b> separates <b>Pharmacy bills</b> made on the bill screen from <b>Counter sales</b> made in Inventory. <b>Entry by</b> shows only the bills saved by one member of staff.",
      ],
      shots: [
        {
          file: "sales-more-filters",
          as: "pharmacist",
          caption: "More filters: State, Source and Entry by.",
          run: async (page, h) => {
            await h.goto(SALES, 1000);
            await V(page).getByRole("button", { name: /More filters/ }).click();
            await h.settle(500);
          },
          after: async (page) => page.keyboard.press("Escape"),
        },
      ],
    },
    {
      title: "Row actions: discount, print and WhatsApp",
      who: "Pharmacists, admins",
      body: ["Three small buttons sit at the right end of each row. Point at one to see its name. A button that cannot be used on that row is greyed out, and pointing at it tells you why."],
      fieldsHeading: ["Button", "What it does"],
      fields: [
        ["% Edit discount", "Opens the finished bill with the discount window ready. Not available on drafts (open the draft instead), cancelled bills, counter sales or returns."],
        ["Printer: Print", "Prints the bill, or the return receipt, without opening it. Drafts and cancelled bills cannot be printed."],
        ["Speech bubble: Send on WhatsApp", "Opens WhatsApp with a ready message to the patient's mobile: the bill number, date, amount, payment modes and any balance due. For a return it states the refund. It needs a valid 10-digit mobile number and a finished bill."],
      ],
      shots: [
        {
          file: "sales-row-actions",
          as: "pharmacist",
          caption: "The row actions: 1 Edit discount, 2 Print, 3 Send on WhatsApp.",
          target: (page) => V(page).locator("table"),
          run: async (page, h) => {
            await h.goto(SALES, 1000);
            const row = V(page).locator("tbody tr").first();
            await h.mark(row.getByRole("button", { name: /Edit discount/ }), 1);
            await h.mark(row.getByRole("button", { name: /^Print/ }), 2);
            await h.mark(row.getByRole("link", { name: /WhatsApp/ }).or(row.getByRole("button", { name: /WhatsApp/ })), 3);
          },
        },
      ],
    },
    {
      title: "Bill medicines to a patient (New sale)",
      who: "Pharmacists",
      body: [
        "Use New sale for a walk-in customer or any sale that does not start from a prescription. The bill screen has the patient and medicines on the left and the money on the right.",
      ],
      steps: [
        "On the Sales page, click <b>New sale</b>.",
        "In <b>Patient</b>, type part of the patient's name or phone number and click the patient in the list. Billing Name and Phone fill in by themselves.",
        "In <b>Doctor</b>, choose the prescribing doctor if there is one.",
        "In <b>Search Drugs</b>, type part of a medicine name, maker or ingredient. The closest result is marked <b>Best Match</b>, the next ones <b>High Match</b>. Each result shows the maker, pack size and price.",
        "Click <b>Add</b> beside the medicine. It appears under <b>Invoice Items</b>.",
        "Repeat for each medicine.",
      ],
      shots: [
        {
          file: "new-sale-search",
          as: "pharmacist",
          caption: "Patient and doctor chosen, and medicines found by typing \"Sun\".",
          viewport: { width: 1440, height: 1300 },
          run: async (page, h) => {
            await h.goto("/dashboard/pharmacy/sales/bill");
            await pickPatient(page, P.sale);
            await pickDoctor(page);
            await page.getByLabel("Search Drugs").fill("Sun");
            await h.settle(1200);
          },
          target: '[aria-label="Prescription bill"]',
        },
      ],
      tips: [
        "The <b>A-</b>, <b>100%</b> and <b>A+</b> buttons make the text of this part of the screen smaller or larger. Click <b>100%</b> to reset it.",
        "The <b>Treatment Packages</b> tab adds a ready-made package instead of single medicines. See <i>Treatment Packages</i> in the Pharmacy Desk chapter.",
      ],
    },
    {
      title: "Set quantity, discount and GST on each medicine",
      who: "Pharmacists",
      body: [
        "Each medicine on the bill has its own row of boxes. The GST rate comes from the medicine's stock record. The total of the row updates as you type.",
      ],
      fields: [
        ["Quantity", "How many units to sell. If the quantity is more than the stock, a red <b>Insufficient stock: N available</b> badge appears. A grey <b>Low stock: N available</b> badge warns that the shelf is nearly empty."],
        ["Unit Price", "The selling price of one unit, taken from stock."],
        ["Discount %", "An item discount on this medicine only."],
        ["Tax %", "The GST rate. If it is empty, the box is marked and the bill shows <b>GST pending</b>; type the rate before you finish."],
        ["Total", "Quantity times price, less the item discount, plus GST."],
        ["Prescription directions", "Optional dosage, frequency, duration and instructions that print on the bill for the patient."],
        ["Substitute", "Replaces the medicine with another product while keeping the quantity. Search for the replacement, or click <b>Cancel substitution</b>."],
        ["Bin", "Removes the medicine from the bill."],
      ],
      shots: [
        {
          file: "new-sale-items",
          as: "pharmacist",
          caption: "Two medicines on the bill: two sunscreens, and a serum with a 10% item discount.",
          viewport: { width: 1440, height: 1700 },
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
      ],
    },
    {
      title: "Give a discount on the whole bill",
      who: "Pharmacists",
      body: [
        "A bill discount comes off the whole bill after the item discounts and before GST. Choose whether you are giving a percentage or a rupee amount.",
      ],
      steps: [
        "Under <b>Bill discount</b> in the Invoice Summary, click <b>%</b> for a percentage or <b>₹</b> for an amount in rupees.",
        "Type the discount. The summary shows it as a separate green line.",
      ],
      fields: [
        ["Subtotal", "Quantity times price for all medicines, before any discount."],
        ["Item discounts", "The total of the discounts given on single medicines."],
        ["Bill discount", "The discount on the whole bill."],
        ["Tax", "GST on what is left after the discounts."],
        ["Total", "What the patient pays."],
      ],
      shots: [
        {
          file: "new-sale-summary",
          as: "pharmacist",
          caption: "The Invoice Summary with a ₹50 bill discount.",
          narrow: true,
          run: async (page, h) => {
            if (!(await page.locator("[data-invoice-item]").count()))
              await newSale(page, h, P.sale, [["Sunscreen SPF 50 Lotion 50 ml", 2, 0, "Sun"], ["Niacinamide Serum 10% 30 ml", 1, 10, "Niac"]]);
            await page.getByRole("button", { name: "Rupees" }).click();
            await page.getByLabel("Bill discount", { exact: true }).fill("50");
            await h.settle(400);
          },
          target: (page) => page.getByText("Invoice Summary", { exact: true }).locator("xpath=ancestor::div[.//text()[contains(., 'Total:')]][1]"),
        },
      ],
    },
    {
      title: "Take payment and finish the sale",
      who: "Pharmacists",
      body: [
        "Finishing a bill gives it its bill number, takes the medicines out of stock and records the payment for the full total in the mode you chose. Until then nothing is saved.",
      ],
      steps: [
        "Under <b>Billing Information</b>, check the <b>Billing Name</b> and <b>Phone</b>. Change them if the bill should be in another name.",
        "In <b>Payment Method</b>, choose <b>Cash</b>, <b>Card</b>, <b>UPI</b> or <b>Net Banking</b>.",
        "Type any <b>Notes</b> that should print on the bill.",
        "Click <b>Print Preview</b>. The bill opens full screen as it will print. It says <i>Given when the bill is printed</i> where the bill number will go.",
        "Check the bill, then click <b>Confirm Invoice</b>. The button changes to <b>Invoice Confirmed</b> and the bill number appears.",
        "Click <b>Print</b> to print it, or <b>Download PDF</b> to save it. Click <b>Close</b> when done.",
      ],
      shots: [
        {
          file: "new-sale-preview",
          as: "pharmacist",
          caption: "Print Preview before confirming: the bill has no number yet.",
          run: async (page, h) => {
            await page.locator('div:has(> label[for="paymentMethod"]) [role="combobox"]').click();
            await page.getByRole("option", { name: "UPI", exact: true }).click();
            await page.getByLabel("Notes").fill("Use the sunscreen every 3 hours outdoors.");
            await page.getByRole("button", { name: "Print Preview" }).click();
            await h.settle(1500);
          },
        },
        {
          file: "new-sale-confirmed",
          as: "pharmacist",
          caption: "After Confirm Invoice: the bill has its number and can be printed.",
          run: async (page, h) => {
            await confirmInvoice(page);
            await h.settle(1500);
          },
          after: async (page) => {
            await page.getByRole("button", { name: "Close", exact: true }).first().click();
          },
        },
      ],
      fields: [
        ["Confirm Invoice", "Finishes the bill: gives the number, moves stock and records the payment."],
        ["Confirm &amp; Print", "Does the same and opens the print window in one step. After confirming it reads <b>Print</b>."],
        ["Copy Type", "<b>Original</b> for the patient, <b>Duplicate</b> for a second copy. The word prints on the bill."],
        ["Preview Zoom", "Makes the preview larger or smaller on screen. It does not change the print."],
        ["Download PDF", "Saves the confirmed bill as a PDF file."],
      ],
      after: [
        "The printed bill shows the clinic's name and details, the bill number, copy type and date, the patient's name and phone (<b>Bill To</b>), each medicine with quantity, unit price, discount %, tax % and amount, then the subtotal, item discount, bill discount, tax and <b>Grand Total</b>, a GST table that splits the tax into CGST, SGST and IGST for each rate, and your notes.",
      ],
      warnings: [
        "Confirm Invoice takes the medicines out of stock and records the payment. Check the bill before you confirm. Only the discount can be changed afterwards.",
        "Every bill is recorded as paid in full at the counter. If the patient pays only part now, see <i>A bill with money still due</i>.",
      ],
    },
    {
      title: "Open a finished bill",
      who: "Pharmacists, admins",
      body: [
        "Click a bill in the Sales list to open it. The bill shows its number, a badge for its state (<b>Paid</b>, <b>Due</b>, <b>Refund due</b> or <b>Cancelled</b>), the date, patient, phone and doctor, every medicine, the totals, and what has been paid. Under it, <b>Payments</b> lists each payment and refund, and <b>Discount changes</b> lists every change to the discount with who made it, when, why, and the old and new totals.",
        "Use <b>Print</b> to print it again, <b>Edit discount</b> to change its discount, and <b>Back to Sales</b> to return to the list. Items, quantities and prices cannot be changed on a finished bill.",
      ],
      shots: [
        {
          file: "finished-bill",
          as: "pharmacist",
          caption: "A finished bill, paid by UPI.",
          run: async (page, h) => {
            await openBill(page, h, P.sale);
          },
        },
      ],
    },
    {
      title: "Change the discount on a finished bill",
      who: "Pharmacists, admins",
      body: [
        "Sometimes the doctor agrees a discount after the bill was paid. You can change the item discounts and the bill discount on a finished bill. The bill keeps its number, and the medicines and stock stay as they were.",
        "If the new total is lower than what the patient paid, the bill shows <b>Refund due</b> until you record the money you hand back.",
      ],
      steps: [
        "Open the bill and click <b>Edit discount</b>, or click the <b>%</b> button on its row in the Sales list.",
        "Change the <b>Item discount %</b> of any medicine, or the <b>Bill discount</b>.",
        "Check <b>Total after change</b>. <b>Refund due after saving</b> shows how much to give back.",
        "Type a <b>Reason</b>. It is required.",
        "Click <b>Save discount</b>.",
        "Click <b>Record refund ₹…</b>, choose how you paid it back (<b>Paid back by</b>), add a UPI or card reference if any, and click <b>Record refund</b>.",
      ],
      shots: [
        {
          file: "edit-discount",
          as: "pharmacist",
          caption: "Edit discount: a 10% discount on the sunscreen leaves a refund due.",
          narrow: true,
          target: '[role="dialog"]',
          run: async (page, h) => {
            await openBill(page, h, P.sale, true);
            await page.getByRole("dialog").waitFor();
            await page.getByLabel("Discount % for Sunscreen SPF 50 Lotion 50 ml").fill("10");
            await page.getByRole("dialog").getByRole("textbox").last().fill("Regular patient discount agreed by Dr. Priya Menon");
            await h.settle(400);
          },
        },
        {
          file: "refund-due",
          as: "pharmacist",
          caption: "After saving: the bill is Revised and shows the refund due.",
          run: async (page, h) => {
            await page.getByRole("button", { name: "Save discount" }).click();
            await page.getByRole("button", { name: /^Record refund/ }).waitFor();
            await h.settle(600);
          },
        },
        {
          file: "record-refund",
          as: "pharmacist",
          caption: "Recording the refund handed back in cash.",
          narrow: true,
          target: '[role="dialog"]',
          run: async (page, h) => {
            await page.getByRole("button", { name: /^Record refund/ }).click();
            await page.getByRole("dialog").waitFor();
            await h.settle(400);
          },
        },
        {
          file: "refund-recorded",
          as: "pharmacist",
          caption: "The bill after the refund: Payments shows the refund, and Discount changes shows who changed the discount and why.",
          viewport: { width: 1440, height: 1200 },
          run: async (page, h) => {
            await page.getByRole("dialog").getByRole("button", { name: /^Record refund/ }).click();
            await page.getByRole("dialog").waitFor({ state: "detached" });
            await h.settle(1000);
          },
        },
      ],
      warnings: ["A discount change and a refund cannot be undone. Each one is kept in the bill's history."],
    },
    {
      title: "A bill with money still due",
      who: "Pharmacists, admins",
      body: [
        "A bill owes money when the amount paid is less than its total. This happens when a discount is lowered after the bill was paid, or when the bill is to be paid by insurance. The Sales list shows a red <b>Due ₹…</b> badge on the row and the bill shows <b>Due</b>.",
        "In the example below, a 20% discount was given at the counter, and the owner later decided it should not apply. Lowering the discount to 0 raised the total, so <b>Still to collect</b> shows the difference.",
        "To collect the balance, open <b>Pharmacy Desk</b>, click <b>Invoices</b>, find the bill and click the green <b>Mark as Paid</b> tick (see the Pharmacy Desk chapter). It records the remaining amount in the bill's payment mode.",
      ],
      shots: [
        {
          file: "part-paid-edit",
          as: "pharmacist",
          caption: "Removing a discount after payment leaves an amount still to collect.",
          narrow: true,
          target: '[role="dialog"]',
          run: async (page, h) => {
            await newSale(page, h, P.part, [["Tacrolimus Ointment 0.1% 10 g", 1, 20, "Tacro"]], { payment: "Cash" });
            await finish(page);
            await page.getByRole("button", { name: "Close", exact: true }).first().click();
            await openBill(page, h, P.part, true);
            await page.getByRole("dialog").waitFor();
            await page.getByLabel("Discount % for Tacrolimus Ointment 0.1% 10 g").fill("0");
            await page.getByRole("dialog").getByRole("textbox").last().fill("Discount not approved by the clinic owner");
            await h.settle(400);
          },
        },
        {
          file: "part-paid-bill",
          as: "pharmacist",
          caption: "The bill now shows Due and the amount still owed.",
          run: async (page, h) => {
            await page.getByRole("button", { name: "Save discount" }).click();
            await page.getByRole("dialog").waitFor({ state: "detached" });
            await h.settle(1000);
          },
        },
      ],
    },
    {
      title: "Save a bill as a draft and finish it later",
      who: "Pharmacists",
      body: [
        "Save a draft when the patient will collect later, or you are waiting for the doctor. A draft is listed in Sales with a <b>Draft</b> badge. It has no bill number, does not move stock and does not take payment. The bill number is given when you finish it.",
      ],
      steps: [
        "Fill in the bill as for a new sale.",
        "Click <b>Save draft</b> under Print Preview. The heading changes to <b>Draft</b> with <i>Gets its bill number when finished</i>.",
        "Later, open the Sales list and click the <b>Draft</b> row (search by patient name to find it quickly).",
        "Change anything you need. The note under Save draft shows <b>Unsaved changes</b> until you save again, then <b>All changes saved to the draft</b>.",
        "Click <b>Print Preview</b> and <b>Confirm Invoice</b> to finish it. It now gets its bill number.",
      ],
      shots: [
        {
          file: "draft-saved",
          as: "pharmacist",
          caption: "A saved draft.",
          run: async (page, h) => {
            await newSale(page, h, P.draft, [["Minoxidil Solution 5% 60 ml", 1, 0, "Minox"], ["Ketoconazole Shampoo 2% 100 ml", 1, 0, "Ketoc"]], { payment: "Card", notes: "Patient will collect after 6 pm" });
            await page.getByRole("button", { name: "Save draft" }).click();
            await page.getByText("All changes saved to the draft").waitFor({ timeout: 60000 });
            await h.settle(800);
            await page.getByText("Gets its bill number when finished").scrollIntoViewIfNeeded();
          },
        },
        {
          file: "draft-row",
          as: "pharmacist",
          caption: "The draft in the Sales list.",
          run: async (page, h) => {
            await searchSales(page, h, "patient", P.draft);
            await h.mark(V(page).locator("tbody tr").first().locator("td").first(), 1);
          },
        },
        {
          file: "draft-reopened",
          as: "pharmacist",
          caption: "The draft reopened: the patient, medicines and notes are all kept.",
          run: async (page, h) => {
            await page.getByRole("link", { name: `Open draft bill for ${P.draft}` }).first().click();
            await page.waitForURL(/draft=/);
            await line(page, "Minoxidil Solution 5% 60 ml").waitFor({ timeout: 60000 });
            await line(page, "Minoxidil Solution 5% 60 ml").getByLabel("Quantity").fill("2");
            await h.settle(500);
          },
          after: async (page) => {
            await finish(page).catch(() => {});
            await page.getByRole("button", { name: "Close", exact: true }).first().click().catch(() => {});
          },
        },
      ],
    },
    {
      title: "Discard a draft",
      who: "Pharmacists",
      body: [
        "If the patient does not come back for a draft, discard it so it does not clutter the list. Nothing was sold, so stock and payments do not change. The draft stays in the Sales list as a <b>Cancelled draft</b> so you can see it existed.",
        "A finished bill cannot be cancelled or deleted from the bill screen. If a patient returns medicines, make a return (below). If the price was wrong, change the discount.",
      ],
      steps: [
        "Open the draft.",
        "Click <b>Discard draft</b> under Save draft.",
        "Click <b>Discard draft</b> in the window to confirm, or <b>Keep draft</b> to go back.",
      ],
      shots: [
        {
          file: "discard-draft",
          as: "pharmacist",
          caption: "Discarding a draft asks you to confirm.",
          narrow: true,
          target: '[role="dialog"]',
          run: async (page, h) => {
            await newSale(page, h, P.discard, [["Calamine Lotion 100 ml", 1, 0, "Calam"]]);
            await page.getByRole("button", { name: "Save draft" }).click();
            await page.getByText("All changes saved to the draft").waitFor({ timeout: 60000 });
            await page.getByRole("button", { name: "Discard draft" }).click();
            await page.getByRole("dialog").waitFor();
            await h.settle(300);
          },
          after: async (page, h) => {
            await page.getByRole("dialog").getByRole("button", { name: "Discard draft" }).click();
            await h.settle(1500);
          },
        },
        {
          file: "cancelled-draft",
          as: "pharmacist",
          caption: "The discarded draft shows as a Cancelled draft, with its amount struck through.",
          run: async (page, h) => {
            await searchSales(page, h, "patient", P.discard);
          },
        },
      ],
      warnings: ["Discarding a draft cannot be undone."],
    },
    {
      title: "Bill a prescription from the queue",
      who: "Pharmacists",
      body: [
        "The top of the New sale screen shows the <b>Prescription dispensing queue</b>: prescriptions written by the doctors that have not been fully billed. Use it to bill a prescription without typing each medicine.",
      ],
      fields: [
        ["Status list", "<b>Pending</b> (not billed yet, the default), <b>Partial</b> (some medicines billed), <b>Dispensed</b>, <b>Expired</b> (older than its validity, or more than 24 hours old with nothing billed) or <b>All</b>."],
        ["Patient", "Name, patient code and how long the prescription has been waiting."],
        ["Medication", "Each medicine with the quantity billed so far out of the quantity prescribed, for example 0/1."],
        ["Status", "Pending, Partial, Dispensed or Expired. <b>Over 2h</b> means the patient has waited more than two hours."],
        ["Stock", "For each medicine: <b>In stock</b>, <b>Low</b>, <b>Out</b> or <b>Not linked</b>, with the quantity on the shelf. <b>Near expiry</b> warns that the batch expires soon."],
        ["Link item / Change link", "Tells the app which stock product a prescribed medicine is. See below."],
        ["Refresh (round arrow)", "Checks the stock again for that row. The arrow at the top reloads the whole queue."],
        ["Load", "Fills the bill below with this prescription's patient, doctor and medicines."],
      ],
      shots: [
        {
          file: "bill-queue",
          as: "pharmacist",
          caption: "The prescription queue at the top of the New sale screen.",
          run: async (page, h) => {
            await h.goto("/dashboard/pharmacy/sales/bill", 1500);
            await h.mark(page.locator("tbody tr").filter({ hasText: RX_PATIENT }).getByRole("button", { name: "Load" }), 1);
          },
        },
        {
          file: "change-link",
          as: "pharmacist",
          caption: "Change link: choose the exact stock product for a prescribed medicine.",
          narrow: true,
          target: '[role="dialog"]',
          run: async (page, h) => {
            await h.goto("/dashboard/pharmacy/sales/bill", 1500);
            await page.getByRole("button", { name: "Change inventory link for Azelaic Acid Cream 20% 15 g" }).first().click();
            await page.getByRole("dialog").waitFor();
            await h.settle(1200);
          },
          after: async (page) => page.keyboard.press("Escape"),
        },
        {
          file: "bill-loaded",
          as: "pharmacist",
          caption: "The prescription loaded into the bill. The blue box shows the linked prescription.",
          viewport: { width: 1440, height: 1300 },
          target: '[aria-label="Prescription bill"]',
          run: async (page, h) => {
            await h.goto("/dashboard/pharmacy/sales/bill", 1500);
            await page.locator("tbody tr").filter({ hasText: RX_PATIENT }).getByRole("button", { name: "Load" }).click();
            await page.getByRole("heading", { name: "Linked Prescription" }).waitFor({ timeout: 60000 });
            await line(page, "Sunscreen SPF 50 Lotion 50 ml").waitFor({ timeout: 60000 });
            await h.settle(1000);
          },
        },
      ],
      steps: [
        "Click <b>Load</b> on the prescription's row.",
        "The bill fills in. Check each medicine: substitute, change the quantity or remove items as needed. Changes here do not alter the doctor's prescription.",
        "Take payment and finish the bill as usual. The prescription leaves the Pending list once all of it is billed.",
      ],
      after: [
        "When the queue shows <b>Not linked</b> for a medicine, the app could not find which product in stock the doctor meant. Click <b>Link item</b> (or <b>Change link</b> to correct an existing match), search the clinic's stock, choose the right product, strength and unit, and click <b>Confirm and remember match</b>. The app remembers the match for the same medicine on later prescriptions.",
      ],
    },
    {
      title: "Take back medicines (New return)",
      who: "Pharmacists",
      body: [
        "Make a return when a patient brings back unused medicines. The return opens in the Inventory screen, under <b>Sales</b>, <b>Customer returns</b>. You pick the medicines from the original sale, so the refund uses the price, discount and GST the patient actually paid.",
      ],
      steps: [
        "On the Returns tab, click <b>New return</b>.",
        "In <b>Search original sale</b>, type the bill number or medicine name.",
        "In <b>Add from original sale</b>, choose the sold batch. The list shows how many units can still be returned. The medicine is added to the table.",
        "Set the <b>Quantity</b> being returned.",
        "In <b>Disposition</b>, choose <b>Restock</b> to put it back on the shelf, or <b>Quarantine</b> to keep it aside (for example an opened tube).",
        "In <b>Refund method</b>, choose <b>CASH</b>, <b>UPI</b>, <b>CARD</b> or <b>CREDIT</b> (store credit).",
        "Type the reason in <b>Reason / notes</b>. It is required.",
        "Click <b>Post return</b>. <b>Save draft</b> keeps it to finish later.",
      ],
      shots: [
        {
          file: "new-return",
          as: "pharmacist",
          caption: "A return of one sunscreen against the original bill, refunded in cash.",
          viewport: { width: 1440, height: 1300 },
          run: async (page, h) => {
            const bill = await latestBill(h, P.sale, "CONFIRMED");
            await h.goto(`${SALES}?tab=returns`, 1000);
            await page.getByRole("button", { name: "New return" }).first().click();
            await page.waitForURL(/view=SALES_RETURN/, { timeout: 120000 });
            await page.getByLabel("Search original sale").waitFor({ timeout: 120000 });
            await page.getByLabel("Customer name (optional)").fill(P.sale);
            await page.getByLabel("Phone (optional)").fill("9847012345");
            await page.getByLabel("Refund method").selectOption("CASH");
            await page.getByLabel("Reason / notes").fill("Patient bought one extra tube by mistake. Seal unbroken.");
            await page.getByLabel("Search original sale").fill(bill.invoiceNumber);
            await h.settle(1500);
            const select = page.getByLabel("Add from original sale");
            const value = await select.locator("option").filter({ hasText: "Sunscreen" }).first().getAttribute("value");
            await select.selectOption(value);
            await h.settle(800);
          },
        },
        {
          file: "return-posted",
          as: "pharmacist",
          caption: "The posted return, with the refund recorded.",
          viewport: { width: 1440, height: 1300 },
          run: async (page, h) => {
            await page.getByRole("button", { name: "Post return" }).click();
            await page.getByText("Refund / credit recorded").waitFor({ timeout: 60000 });
            await h.settle(800);
          },
        },
      ],
      warnings: ["Posting a return puts restocked medicines back into stock and records the refund. It cannot be edited afterwards."],
    },
    {
      title: "See returns",
      who: "Pharmacists, admins",
      body: [
        "The <b>Returns</b> tab lists money and medicines given back to customers. It has the same search, period and filters as the Sales tab. Its extra column <b>Against bill</b> shows which bill each return was made against, and the <b>Refund</b> column shows how the money went back. <b>Store credit</b> means the refund was kept as credit for the patient.",
      ],
      shots: [
        {
          file: "returns-list",
          as: "pharmacist",
          caption: "The Returns tab.",
          run: async (page, h) => {
            await h.goto(`${SALES}?tab=returns`, 1500);
          },
        },
      ],
    },
  ],
};
