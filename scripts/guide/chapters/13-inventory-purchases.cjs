// Inventory: everything under Purchases (supplier bills, payments, credits, returns, terms, suppliers).
const fs = require("fs");
const os = require("os");
const path = require("path");

const INV = "/dashboard/inventory";
const REG = `${INV}?area=purchases&view=register`;
const RETURNS = `${REG}&tab=returns`;
const SUPPLIER = { name: "Sri Sai Pharma Distributors", gst: "36AAAAA0000A1Z5", dl: "TS/HYD/20B-4410" };
const P = process.env.GUIDE_PURCHASE_TEST === "2"
  ? { name: "Mometasone Cream 0.1% 15 g", search: "Mometasone", rate: "95", mrp: "135", composition: "Mometasone furoate 0.1% w/w", strength: "0.1%", form: "Cream", category: "Corticosteroid", batch: "MO26B05" }
  : process.env.GUIDE_PURCHASE_TEST
  ? { name: "Tacrolimus Ointment 0.1% 10 g", search: "Tacrolimus", rate: "290", mrp: "410", composition: "Tacrolimus 0.1% w/w", strength: "0.1%", form: "Ointment", category: "Immunomodulator", batch: "TC26B03" }
  : { name: "Luliconazole Cream 1% 20 g", search: "Luliconazole", rate: "150", mrp: "240", composition: "Luliconazole 1% w/w", strength: "1%", form: "Cream", category: "Antifungal", batch: "LC26B14" };
const PRODUCT = P.name;
const state = { billNo: "SSP/26-27/1301", returnNo: null };

// h.api keeps a failed sign-in for the whole run, so keep our own sessions (and wait out 429).
const sessions = {};
async function call(h, who, method, route, body) {
  for (let attempt = 0; !sessions[who]; attempt++) {
    const user = h.stack.users[who];
    const res = await fetch(`${h.stack.api}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: user.email, password: user.password }) });
    if (res.status === 429 && attempt < 20) { await new Promise((r) => setTimeout(r, 6000)); continue; }
    if (!res.ok) throw Error(`sign-in ${who} ${res.status}`);
    const data = await res.json().catch(() => ({}));
    const cookie = (res.headers.get("set-cookie") || "").split(",").map((c) => c.split(";")[0].trim()).join("; ");
    sessions[who] = { Authorization: `Bearer ${data.access_token || data.accessToken || data.token}`, Cookie: cookie };
  }
  const res = await fetch(`${h.stack.api}${route}`, { method, headers: { "Content-Type": "application/json", ...sessions[who] }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw Error(`${method} ${route} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const TALL = { width: 1440, height: 3400 };
const quiet = async (page, ms = 300) => page.waitForTimeout(ms);
const ddmmyyyy = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

const register = async (page, h, query = "") => {
  await h.goto(`${REG}${query}`);
  await page.getByRole("tabpanel", { name: "Purchase" }).locator("table tbody tr").first().waitFor({ timeout: 60000 });
  await h.settle(500);
};
const returnsList = async (page, h) => {
  await h.goto(RETURNS);
  await page.getByRole("tabpanel", { name: "Returns" }).locator("table tbody tr").first().waitFor({ timeout: 60000 });
  await h.settle(500);
};
const intake = async (page, h) => {
  await h.goto(`${INV}?area=purchases&view=intake`);
  const fresh = page.getByRole("button", { name: "New invoice" });
  if (await fresh.isVisible({ timeout: 4000 }).catch(() => false)) await fresh.click();
  await page.getByText("Scan a bill").first().waitFor({ timeout: 30000 });
  await h.settle(500);
};
const typeInstead = async (page, h) => {
  await intake(page, h);
  await page.getByText("Type instead").click();
  await page.getByLabel("Saved supplier").waitFor({ timeout: 15000 });
  await quiet(page, 800);
};
const lineSection = (page) => page.locator("section[aria-label='Invoice details and products']");
const fillLine = async (page, values) => {
  const line = lineSection(page);
  for (const [label, value] of Object.entries(values)) await line.getByLabel(label, { exact: true }).first().fill(value);
};
const openOtherDetails = async (page) => {
  await page.locator("details", { hasText: "Other commercial details" }).last().evaluate((d) => { d.open = true; });
};
const openMatchPanel = async (page) => {
  await page.locator("details", { hasText: "Product matching and details" }).last().evaluate((d) => { d.open = true; });
  await page.waitForTimeout(500);
};
// Marks are placed from where things are now, so stop scrolling and layout shifts first.
const still = async (page) => {
  await page.waitForTimeout(1500);
  await page.evaluate(() => { document.querySelectorAll("main").forEach((m) => { m.scrollTop = 0; }); window.scrollTo(0, 0); });
  await page.waitForTimeout(400);
};
const bodyText = (page) => page.evaluate(() => document.querySelector("main").innerText.replace(/\s+/g, " "));

module.exports = {
  id: "13-inventory-purchases",
  title: "Inventory: purchases",
  intro:
    "The <b>Purchases</b> area of Inventory is where the pharmacy records what it buys. You enter each distributor's bill, add the stock it brings, pay the distributor, send damaged or near-expiry goods back, and keep the distributors' details and agreed terms. Pharmacists do the daily entry. Payments, credit notes and terms need extra permissions, which admins and owners have. The row of tasks under the area buttons shows <b>Purchase bills</b>, <b>Scan or enter bill</b> and <b>Import CSV</b>. A <b>More tasks…</b> list holds Gmail intake, Suppliers, Terms of Trade, Payments &amp; dues, Credits &amp; vouchers, Inward challans, Gate passes and Purchase costs.",
  setup: async (h) => {
    // The distributor the sample bill and return are made out to.
    const listed = await call(h, "pharmacist", "GET", "/inventory/suppliers");
    let supplier = (listed.suppliers || []).find((s) => s.name === SUPPLIER.name);
    if (!supplier)
      supplier = await call(h, "pharmacist", "POST", "/inventory/suppliers", {
        name: SUPPLIER.name, gstNumber: SUPPLIER.gst, contactPerson: "Ramesh Naidu", phone: "9848012345", city: "Hyderabad", state: "Telangana", paymentTerms: "30 days",
      });
    if (!supplier.drugLicenseNo) await call(h, "pharmacist", "PATCH", `/inventory/suppliers/${supplier.id}`, { drugLicenseNo: SUPPLIER.dl });
    // Next free bill number, so a second run on the same data still enters a new bill.
    const db = await h.db();
    try {
      const rows = await db.pharmacyPurchaseInvoice.findMany({ where: { invoiceNumber: { startsWith: "SSP/26-27/13" } }, select: { invoiceNumber: true } });
      const top = Math.max(1300, ...rows.map((r) => Number(r.invoiceNumber.split("/").pop()) || 0));
      state.billNo = `SSP/26-27/${top + 1}`;
    } finally {
      await db.$disconnect();
    }
    // A small picture standing in for a phone photo of a bill.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    state.photo = path.join(os.tmpdir(), "SSP-26-27-bill-photo.png");
    fs.writeFileSync(state.photo, png);
  },
  sections: [
    {
      title: "Find your way around Purchases",
      who: "Pharmacists, admins, owners",
      body: [
        "Click <b>Purchases</b> under the page title. It opens on <b>Purchase bills</b>, the list of every supplier bill the pharmacy has entered. The row of tasks under the area buttons shows the three most used tasks. The rest are in the <b>More tasks…</b> list at the end of the row. Each task below has its own section in this chapter.",
        "What you see depends on the permissions your administrator gave you. Someone without the purchase ledger permission does not see Payments &amp; dues or Credits &amp; vouchers, and cannot record payments or credit notes. A person without permission to add suppliers sees the supplier list but not the Add supplier button.",
      ],
      fields: [
        ["Purchase bills", "The register of supplier bills and, on its second tab, the returns sent back to suppliers."],
        ["Scan or enter bill", "Upload a photo or PDF of a bill, or type it in, then add its stock."],
        ["Import CSV", "Load a bill from a spreadsheet file the distributor sent."],
        ["Gmail intake", "Pick up bills that arrive as email attachments. Needs an administrator to connect Gmail."],
        ["Suppliers", "The saved list of distributors and their details."],
        ["Terms of Trade", "The price and discount each distributor agreed for each product."],
        ["Payments &amp; dues", "What you owe each distributor, how old it is, and where you record a payment."],
        ["Credits &amp; vouchers", "Credit notes from distributors, for goods you returned."],
        ["Inward challans", "A record of goods that arrived before their bill."],
        ["Gate passes", "A record of a delivery's reference and linked order, with no stock effect."],
        ["Purchase costs", "Reviewed purchases ranked by distributor and by product cost."],
      ],
      fieldsHeading: ["Task", "What it is for"],
      shots: [
        {
          file: "area",
          as: "pharmacist",
          caption: "The Purchases area opens on Purchase bills. (1) the three main tasks, (2) the More tasks list, (3) the Purchase and Returns tabs.",
          run: async (page, h) => {
            await register(page, h);
            await h.mark(page.getByRole("button", { name: "Scan or enter bill", exact: true }), 1);
            await h.mark(page.getByLabel("More inventory tasks"), 2);
            await h.mark(page.getByRole("tablist", { name: "Purchase registers" }), 3);
          },
        },
      ],
    },
    {
      title: "Look up a supplier bill in the register",
      who: "Pharmacists, admins, owners",
      body: [
        "Use <b>Purchase bills</b> to find a bill, see whether it has been paid and open it. The list shows one row per bill, newest first, for the current financial year (April to March). The line at the bottom adds up the bills in view and the amount still owed on them.",
        "Click a bill number to open the bill. Click a column heading to sort by it; click again to reverse the order. Click the underlined <b>Outstanding in these bills</b> total to jump to Payments &amp; dues (with the purchase ledger permission).",
      ],
      steps: [
        "Click <b>Purchases</b>. The bill list opens.",
        "Choose what to search by in <b>Search by</b>, such as Bill No, then type in the box next to it.",
        "Choose a <b>Period</b>, or click the dates to pick your own range.",
        "Choose a <b>Payment status</b> to see only bills that are due, overdue and so on.",
        "Click <b>More filters</b> for distributor, bill status, source and who entered the bill. A number on the button counts the filters you set there.",
        "Click <b>Clear filters</b> to start again.",
        "Click a bill number to open the bill.",
      ],
      fields: [
        ["Sr No", "The bill's running number in the register."],
        ["Bill No", "The distributor's invoice number. Click it to open the bill."],
        ["Entry Date", "When the bill was entered in ClinicMS."],
        ["Bill Date", "The date printed on the distributor's bill."],
        ["Entry By", "Who typed or scanned it. A dash means the person is not recorded."],
        ["Distributor", "The supplier named on the bill."],
        ["Bill Amount", "The total payable on the bill, GST included."],
        ["Payment", "The payment status of the bill (see the table below). People with the purchase ledger permission also get a <b>Mark paid</b> button on bills that still have a balance."],
      ],
      fieldsHeading: ["Column", "Meaning"],
      shots: [
        {
          file: "register",
          as: "admin",
          caption: "The purchase bill register. (1) search, (2) period, (3) payment status, (4) more filters, (5) a bill number, (6) Mark paid, (7) totals for the bills in view.",
          run: async (page, h) => {
            await register(page, h);
            const panel = page.getByRole("tabpanel", { name: "Purchase" });
            await h.mark(page.getByRole("searchbox"), 1);
            await h.mark(page.getByLabel("Period"), 2);
            await h.mark(page.getByLabel("Payment status"), 3);
            await h.mark(page.getByRole("button", { name: /More filters/ }), 4);
            await h.mark(panel.getByRole("button", { name: /^Open bill/ }).first(), 5);
            await h.mark(panel.getByRole("button", { name: /^Mark bill/ }).first(), 6);
            await h.mark(page.getByRole("status").filter({ hasText: /Outstanding in th/ }).first(), 7);
          },
        },
        {
          file: "register-filters",
          as: "admin",
          caption: "More filters open, with Payment status set to Due. The button shows how many extra filters are set, and Clear filters removes them all.",
          run: async (page, h) => {
            await register(page, h);
            await page.getByRole("button", { name: /More filters/ }).click();
            await page.getByLabel("Distributor", { exact: true }).selectOption({ label: "Mumbai Derma Supplies" }).catch(async () => {
              await page.locator("label").filter({ hasText: /^\s*Distributor/ }).locator("select").selectOption({ index: 1 });
            });
            await h.settle(800);
            await page.getByLabel("Payment status").selectOption({ label: "Due" });
            await h.settle(1200);
          },
        },
      ],
      after: ["<b>Payment status</b> and the payment column use these words."],
      tips: [
        "The <b>More</b> menu above the list (next to <b>New purchase</b>) has <b>Export to Excel</b> for the bills in view, <b>Payments &amp; dues</b> and <b>Suppliers</b>.",
        "Type part of a bill number to narrow the list. The search waits until you stop typing.",
      ],
    },
    {
      title: "Understand bill and payment statuses",
      who: "Pharmacists, admins, owners",
      body: [
        "Two separate things are tracked for each bill: whether its stock has been added, and whether the distributor has been paid. The register shows the payment state in the last column. The bill status appears in <b>More filters</b> under <b>Bill status</b>.",
      ],
      fields: [
        ["Not posted", "The bill is a draft or still being checked. Stock has not been added and nothing is owed yet. Hold the mouse over the badge for the reason."],
        ["Due", "Stock is added and the bill is unpaid but not yet past its due date."],
        ["Overdue", "Unpaid and past its due date. The badge also tells you how many days late."],
        ["Part paid", "Some money has been paid; a balance remains."],
        ["Paid", "Nothing more is owed on the bill."],
        ["Cancelled", "The bill was cancelled. It is shown crossed out and is left out of the totals."],
        ["Draft", "Bill status: saved but not finished."],
        ["Any review step", "Bill status: the bill is somewhere between being scanned and being added to stock."],
        ["OCR review required", "Bill status: a scanned bill whose reading must be checked by a person."],
        ["Reconciliation failed", "Bill status: the lines do not add up to the printed total. Correct the lines before adding stock."],
        ["Reviewed", "Bill status: checked and ready for the final step of adding stock."],
        ["Stock added", "Bill status: the stock is in the pharmacy and the bill is a purchase on record."],
        ["Typed in, Scanned, CSV import, Gmail", "Source: how the bill was entered."],
      ],
      fieldsHeading: ["Word", "Meaning"],
      shots: [
        {
          file: "bill-open",
          as: "admin",
          caption: "An open bill shows the distributor, the lines, the stock added and the totals. Use the back arrow to return to the list.",
          viewport: { width: 1440, height: 1700 },
          run: async (page, h) => {
            await register(page, h);
            await page.getByRole("tabpanel", { name: "Purchase" }).getByRole("button", { name: /^Open bill/ }).first().click();
            await page.getByText("Products on this bill").first().waitFor({ timeout: 30000 });
            await h.settle(1000);
          },
        },
      ],
    },
    {
      title: "Enter a bill by scanning or uploading it",
      who: "Pharmacists",
      body: [
        "When a delivery arrives with a printed bill, you can upload a photo or PDF of it instead of typing every line. ClinicMS reads the bill into a draft. You check the reading against the paper, fix anything wrong and only then add the stock. A scan never changes stock by itself.",
        "Reading a bill needs an AI reading service to be connected by your administrator. It is not connected on the demonstration system used for this guide, so the guide stops at the upload step. When it is connected, <b>Scan bill</b> sends the pages away, and the form fills in with the distributor, bill number, date and lines it could read. Each value is marked <b>Correct</b>, <b>Check</b> or <b>Checked / matches</b> (red, amber, green) so you know what to look at. Then you follow the same checks as in manual entry, below. If the reading service is not available, click <b>Type instead</b> and enter the bill by hand.",
      ],
      steps: [
        "Click <b>Scan or enter bill</b>.",
        "Click <b>Choose Files</b> and pick the photo or PDF. You can pick up to 10 files for one bill, in page order.",
        "Check the <b>Received on</b> date. It is the day the goods arrived and starts as today.",
        "Click <b>Scan bill</b>. The button stays grey until a file is chosen.",
        "Compare every value on the draft with the paper bill, correct anything marked red or amber, and add the stock (see the next sections).",
      ],
      fields: [
        ["Recent invoices", "Click to open the list of the latest bills. Click one to reopen it, for example to finish a draft."],
        ["Review status guide", "Explains the red, amber and green badges."],
        ["Recover interrupted import", "Use it if a scan or a stock update stopped half way (see <i>Drafts and recovery</i>)."],
        ["Automatic import", "An optional setting that lets very clear scans be added without the manual review. Leave it off unless your administrator tells you to use it."],
      ],
      fieldsHeading: ["Control", "What it does"],
      shots: [
        {
          file: "scan-upload",
          as: "pharmacist",
          caption: "Scan or enter bill with a photo chosen. (1) choose the file, (2) the date the goods arrived, (3) Scan bill, (4) Type instead.",
          run: async (page, h) => {
            await intake(page, h);
            await page.locator('input[type="file"]').first().setInputFiles(state.photo);
            await quiet(page, 800);
            await h.mark(page.locator('input[type="file"]').first(), 1);
            await h.mark(page.getByLabel("Received on"), 2);
            await h.mark(page.getByRole("button", { name: "Scan bill" }), 3);
            await h.mark(page.getByText("Type instead"), 4);
          },
        },
      ],
      warnings: ["A scan is only a reading of the paper. Always compare it with the bill before you add stock. A wrong quantity or batch number is much easier to fix now than after the stock is added."],
    },
    {
      title: "Enter a bill by hand: the supplier and the bill details",
      who: "Pharmacists",
      body: [
        "Type a bill in when you have no photo, or when the scan could not be read. You can also use this form to correct a scanned draft. The form has three parts: the supplier, the bill details, and the products. The example in this chapter is a delivery of Luliconazole cream from Sri Sai Pharma Distributors.",
        "Choosing the distributor from <b>Saved supplier</b> fills in its name and GSTIN, and ClinicMS confirms it matches a saved supplier. If the distributor is not yet saved, add it under <b>Suppliers</b> first (see <i>Keep the distributor list</i>).",
      ],
      steps: [
        "Click <b>Scan or enter bill</b>, then <b>Type instead</b>.",
        "Open <b>Saved supplier</b> and choose the distributor. The green message <b>Matching saved supplier found</b> appears.",
        "Type the distributor's drug licence number in <b>DL No.</b>, as printed on the bill.",
        "Type the <b>Invoice No.</b> and choose the <b>Invoice Date</b>.",
        "Check <b>Goods Received</b>, the day the stock arrived.",
        "Choose the <b>Bill Type</b>: <b>Cash</b> or <b>Credit</b>. For a credit bill, choose the <b>Due Date</b>.",
      ],
      fields: [
        ["Distributor, GSTIN", "The supplier's name and 15-character GST number. Filled in when you choose a saved supplier."],
        ["Saved supplier", "The suppliers saved in ClinicMS. Always choose one so the bill is counted against the right account."],
        ["DL No.", "The distributor's drug licence number printed on the bill. A bill cannot be added to stock without it."],
        ["Invoice No. / Invoice Date", "The number and date printed on the distributor's bill."],
        ["Goods Received", "The day the stock reached the pharmacy."],
        ["Bill Type", "Cash for bills paid on delivery. Credit for bills you pay later; give a Due Date so ClinicMS can warn you when it is overdue."],
        ["Additional invoice details", "Optional extras, such as the doctor name or registration number on the bill."],
      ],
      fieldsHeading: ["Field", "What to enter"],
      shots: [
        {
          file: "manual-details",
          as: "pharmacist",
          caption: "The supplier and bill details filled in for a credit bill: saved supplier, drug licence number, invoice number and date, bill type and due date. The red notes above the form are the checks still open; they clear as you fill in the products.",
          viewport: TALL,
          target: "main",
          run: async (page, h) => {
            await typeInstead(page, h);
            await page.getByLabel("Saved supplier").selectOption({ label: `${SUPPLIER.name} — ${SUPPLIER.gst}` });
            await quiet(page, 800);
            await page.getByLabel("DL No.").fill(SUPPLIER.dl);
            await page.getByLabel("Invoice No.").fill(state.billNo);
            await page.getByLabel("Invoice Date").fill(iso(daysAgo(12)));
            await page.getByLabel("Goods Received").fill(iso(daysAgo(11)));
            await page.getByLabel("Bill Type").selectOption({ label: "Credit" }).catch(() => page.getByLabel("Bill Type").click().then(() => page.getByRole("option", { name: "Credit" }).click()));
            await quiet(page, 1000);
            for (let i = 0; i < 4 && !(await page.getByLabel("Due Date", { exact: true }).first().inputValue()); i++) {
              await page.getByLabel("Due Date", { exact: true }).first().fill(iso(daysAgo(5)));
              await quiet(page, 800);
            }
          },
        },
      ],
      tips: ["Use <b>Save draft</b> at the bottom at any time to keep your work and finish later."],
    },
    {
      title: "Enter the lines and match each to a product",
      who: "Pharmacists",
      body: [
        "Each product on the bill is one line. Type the line exactly as the bill shows it. ClinicMS then tries to find the same product in the pharmacy's product list, so the new stock is added under the right medicine and shows up in prescriptions, sales and reorder lists. This is the product match, shown for each line in <b>Product matching and details</b>.",
        "The match status tells you what to do. <b>Not in inventory</b> means no saved product fits the name and pack you typed. Use <b>Search saved products manually</b>, type part of the name, and click <b>Match</b> next to the right product. If the product really is new, choose a product kind and click <b>Create new item</b>; first search, so you do not create a duplicate. <b>Same product · confirm</b> or <b>Possible match</b> means ClinicMS found a likely product: compare the invoice line with the saved product beside it and click <b>Confirm Match</b> if they are the same. <b>Matched</b> means the line is linked.",
        "If a matched medicine is missing details ClinicMS needs, such as category, composition, dosage form, strength or whether it needs a prescription, a red box asks you to complete them from the product label. Fill them in and click <b>Save details and recheck invoice</b>.",
      ],
      steps: [
        "In <b>Products on this bill</b>, type the name in <b>Product</b> as printed on the bill.",
        "Fill <b>Pack Size</b> (the number of units in a pack as ClinicMS counts them, usually <b>1</b>), <b>Batch</b>, and the expiry in <b>Exp. Month</b> and <b>Exp. Year</b>.",
        "Enter <b>Paid Qty</b> (units you pay for) and <b>Free Qty</b> (bonus units on the bill).",
        "Enter the <b>Rate</b> per unit before GST, the <b>MRP</b> printed on the pack, <b>Disc %</b> and the <b>CGST %</b> and <b>SGST %</b> (or <b>IGST %</b> for another state).",
        "Open <b>Other commercial details</b> and enter the <b>HSN</b> code. Check that the line total matches the bill.",
        "In <b>Product matching and details</b>, look at the status of the line. If it says <b>Not in inventory</b>, search for the product and click <b>Match</b>.",
        "If it says <b>Same product · confirm</b>, click <b>Confirm Match</b>.",
        "If a box asks for the product's details, fill them in and click <b>Save details and recheck invoice</b>.",
      ],
      fields: [
        ["Product", "The name as printed on the bill."],
        ["Pack Size, Stock unit", "How many units are in a pack and the unit the pharmacy counts in. Must agree with the saved product, otherwise the match fails."],
        ["Batch, Exp. Month, Exp. Year", "Batch number and expiry month and year printed on the pack. Needed to track and recall stock."],
        ["Paid Qty, Free Qty", "Units paid for and units given free. Both are added to stock."],
        ["Rate, MRP", "Purchase price per unit before GST, and the printed maximum retail price."],
        ["Disc %, Special %, Scheme amount", "Discount given on the line. Reduces the taxable value."],
        ["CGST %, SGST %, IGST %", "GST rates. Use CGST and SGST for a distributor in your state, IGST for another state."],
        ["HSN", "The tax classification code for the product."],
        ["Taxable, GST, Effective Cost", "Worked out for you. Effective cost is what each unit really cost after discount and free units."],
      ],
      fieldsHeading: ["Field", "What to enter"],
      shots: [
        {
          file: "manual-lines",
          as: "pharmacist",
          caption: "One line entered: product name as on the bill, pack size, batch and expiry, paid and free quantity, rate, MRP, discount and GST. Under the line ClinicMS works out the taxable value, GST and net payable.",
          viewport: TALL,
          run: async (page, h) => {
            await page.locator('input[id$="-product"]').first().fill(PRODUCT);
            await fillLine(page, {
              "Pack Size": "20 g", Batch: P.batch, "Exp. Month": "09", "Exp. Year": "2028", "Paid Qty": "24", "Free Qty": "2",
              Rate: P.rate, MRP: P.mrp, "Disc %": "5", "CGST %": "6", "SGST %": "6",
            });
            await openOtherDetails(page);
            await fillLine(page, { HSN: "30049099" });
            await quiet(page, 1200);
            const line = lineSection(page);
          },
          target: "section[aria-label='Invoice details and products']",
        },
        {
          file: "match-none",
          as: "pharmacist",
          caption: "The line shows Not in inventory, because a pack of &quot;20 g&quot; does not fit the saved product. (1) the match status, (2) the invoice line, (3) search saved products by hand.",
          viewport: TALL,
          run: async (page, h) => {
            await page.getByRole("button", { name: "Refresh Matches" }).click({ timeout: 4000 }).catch(() => {});
            await page.getByText("Not in inventory").first().waitFor({ timeout: 20000 });
            await page.getByPlaceholder("Search by product name").fill(P.search);
            await page.getByRole("button", { name: new RegExp("^Match " + P.search) }).waitFor({ timeout: 20000 });
            await still(page);
            await h.mark(page.getByText("Not in inventory").first(), 1);
            await h.mark(page.getByText("OCR / DRAFT LINE"), 2);
            await h.mark(page.getByPlaceholder("Search by product name"), 3);
          },
          target: "details:has(> summary:has-text(\"Product matching and catalogue\"))",
        },
        {
          file: "match-confirm",
          as: "pharmacist",
          caption: "After correcting the pack size to 1, ClinicMS finds the product: Same product · confirm. The invoice line is on top and the saved product beneath, with the reasons it matched (name exact match, pack size match). Confirm Match is at the right.",
          viewport: TALL,
          run: async (page, h) => {
            await fillLine(page, { "Pack Size": "1" });
            await quiet(page, 2500);
            await openMatchPanel(page);
            await page.getByText("Same product").first().waitFor({ timeout: 30000 }).catch(async () => {
              await page.getByRole("button", { name: "Refresh Matches" }).click({ timeout: 4000 }).catch(() => {});
              await page.getByText("Same product").first().waitFor({ timeout: 30000 });
            });
          },
          target: "details:has(> summary:has-text(\"Product matching and catalogue\"))",
        },
        {
          file: "match-details",
          as: "pharmacist",
          caption: "ClinicMS asks for the medicine's missing details. Fill them from the pack label, then click Save details and recheck invoice.",
          viewport: TALL,
          run: async (page, h) => {
            await openMatchPanel(page);
            await page.getByRole("button", { name: "Confirm Match" }).click();
            const edit = page.getByText("Edit saved product details");
            if (await edit.isVisible({ timeout: 15000 }).catch(() => false)) {
              await edit.click();
              await page.getByLabel("Category (required)").fill(P.category);
              await page.getByLabel("Composition (required)").fill(P.composition);
              await page.getByLabel("Dosage form (required)").fill(P.form);
              await page.getByLabel("Strength (required)").fill(P.strength);
              await page.getByLabel("Prescription required").selectOption({ label: "Yes" });
              await quiet(page, 500);
              await still(page);
            await h.mark(page.getByLabel("Category (required)"), 1);
              await h.mark(page.getByRole("button", { name: "Save details and recheck invoice" }), 2);
            }
          },
          target: "details:has(> summary:has-text(\"Product matching and catalogue\"))",
          after: async (page) => {
            const save = page.getByRole("button", { name: "Save details and recheck invoice" });
            if (await save.isVisible().catch(() => false)) { await save.click(); await quiet(page, 5000); }
          },
        },
      ],
      warnings: ["Match every line to the right product. Stock added under the wrong medicine will be sold and counted as that medicine."],
    },
    {
      title: "Review the bill and add the stock",
      who: "Pharmacists",
      body: [
        "Before stock is added, ClinicMS checks the bill. The line <b>Check before adding stock</b> near the top counts the checks still open, for example a missing drug licence, HSN or batch. Click <b>Next check</b> and <b>Previous</b> at the bottom to step through them. Open checks also show as red boxes with a <b>How to fix</b> note and a link that jumps to the field. The button <b>Confirm reviewed values &amp; add stock</b> stays grey until every check is cleared.",
        "Look at <b>Check bill total</b>. It shows gross, taxable value, GST, TCS and the net payable ClinicMS calculated. It must equal the total printed on the bill. Under <b>Reported discounts, TCS &amp; rounding</b> you can enter bill-level amounts such as trade discount, TCS and rounding so the totals match the paper.",
        "Adding stock is final for the pharmacy's records. After it succeeds, the bill is a posted purchase: the batches appear in the stock list, and the bill is owed to the distributor.",
      ],
      steps: [
        "Read the line <b>Check before adding stock</b>. It should say <b>Ready for your final check</b>.",
        "Compare <b>Net Payable</b> under <b>Check bill total</b> with the total on the paper bill.",
        "Click <b>Confirm reviewed values &amp; add stock</b>.",
        "Wait for the green <b>Stock added</b> message. It names the batches and how many units were added.",
      ],
      shots: [
        {
          file: "ready",
          as: "pharmacist",
          caption: "Every check is clear. (1) the check counter says Ready for your final check, (2) the calculated totals, (3) Confirm reviewed values &amp; add stock.",
          viewport: TALL,
          run: async (page, h) => {
            await page.getByRole("button", { name: /Confirm reviewed/ }).waitFor({ timeout: 30000 });
            await page.getByText("Ready for your final check").first().waitFor({ timeout: 30000 });
            await still(page);
            await h.mark(page.getByText("Ready for your final check").first(), 1);
            await h.mark(page.getByText("Net Payable").first(), 2);
            await h.mark(page.getByRole("button", { name: /Confirm reviewed/ }), 3);
          },
        },
        {
          file: "posted",
          as: "pharmacist",
          caption: "Stock added. The bill shows the three steps complete, the batches added and the totals.",
          viewport: { width: 1440, height: 1500 },
          run: async (page, h) => {
            await page.getByRole("button", { name: /Confirm reviewed/ }).click();
            await page.getByText("Stock added", { exact: true }).first().waitFor({ timeout: 60000 });
            await h.settle(1500);
            await page.evaluate(() => document.querySelector("main")?.scrollTo?.(0, 0));
          },
        },
      ],
      warnings: ["Adding stock cannot be undone from this page. If a quantity, price or product detail is wrong afterwards, open the batch from the bill (or the stock list) and correct it there. See the chapter Inventory: today and stock."],
    },
    {
      title: "Drafts and recovery",
      who: "Pharmacists",
      body: [
        "Click <b>Save draft</b> whenever you have to stop. The bill is saved, no stock is added, and it appears in the bill list with the status <b>Not posted</b>. Open it again from <b>Recent invoices</b> on the Scan or enter bill page, or from the register, and carry on. A bill that has been scanned but not finished is a draft too. The Today page counts these as <b>Purchase invoices to review</b>.",
        "<b>Recover interrupted import</b> is for the rare case when a scan, a save or an add-stock step was cut off, for example by a lost connection. It asks for the reference that was shown to the person who started the work. Recovery checks whether the bill and its stock were actually saved and stops unfinished work safely, so stock is never added twice. Stock whose history is unknown stays locked until it is counted on the shelf.",
      ],
      steps: [
        "Click <b>Scan or enter bill</b>.",
        "Click <b>Recent invoices</b> to open the list.",
        "Click the bill to continue. A draft opens in the same form you started with.",
        "If an import was interrupted, click <b>Recover interrupted import</b> and follow the prompts.",
      ],
      shots: [
        {
          file: "recent-invoices",
          as: "pharmacist",
          caption: "Recent invoices lists the latest bills, including the one just posted. Click one to reopen it.",
          run: async (page, h) => {
            await intake(page, h);
            await page.getByText(/^Recent invoices/).first().click();
            await quiet(page, 1500);
          },
        },
        {
          file: "recovery",
          as: "pharmacist",
          caption: "Recover interrupted import asks for the reference of the interrupted work.",
          run: async (page, h) => {
            await intake(page, h);
            await page.getByRole("button", { name: "Recover interrupted import" }).click();
            await quiet(page, 1500);
          },
        },
      ],
    },
    {
      title: "Import a bill from a CSV file or Gmail",
      who: "Pharmacists, admins",
      body: [
        "Some distributors send their bills as a spreadsheet. <b>Import CSV</b> reads such a file into a review draft. The draft then goes through the same checks as a typed bill, and nothing is added to stock until you confirm it.",
        "<b>Gmail intake</b>, in the <b>More tasks…</b> list, lists bill attachments that arrive by email so you can open one as a review draft. It needs your administrator to connect the pharmacy's Gmail first; until then the page says so and points you to photo, PDF and CSV entry.",
      ],
      steps: [
        "Click <b>Import CSV</b>.",
        "Open <b>CSV format and required columns</b> to see which columns the file must have. The download button next to the title gives you a blank sample file.",
        "Click <b>Choose File</b> and pick the CSV.",
        "Click <b>Open review draft</b>, then review the draft as for a typed bill.",
      ],
      shotLayout: "row",
      shots: [
        {
          file: "csv",
          as: "pharmacist",
          caption: "Import CSV.",
          narrow: true,
          run: async (page, h) => {
            await h.goto(`${INV}?area=purchases&view=csv`);
            await page.getByText("CSV format and required columns").waitFor({ timeout: 30000 });
            await page.getByText("CSV format and required columns").click();
            await quiet(page, 800);
          },
          target: "main",
        },
        {
          file: "gmail",
          as: "admin",
          caption: "Gmail intake before Gmail is connected.",
          narrow: true,
          run: async (page, h) => {
            await h.goto(`${INV}?area=purchases&view=gmail`);
            await page.getByText("Invoice attachments from Gmail").waitFor({ timeout: 30000 });
          },
          target: "main",
        },
      ],
    },
    {
      title: "Keep the distributor list",
      who: "Pharmacists, admins",
      body: [
        "<b>Suppliers</b> is the saved list of distributors. Every bill, return and payment is attached to one of these records, matched by the GSTIN. Add a distributor here before you enter its first bill. Each row shows its details; click a row to see or change them, and use the links on the row to open that distributor's bills or its account in Payments &amp; dues.",
      ],
      steps: [
        "Open <b>More tasks…</b> and choose <b>Suppliers</b>.",
        "Click <b>Add supplier</b>.",
        "Type the <b>Supplier name</b> and the 15-character <b>GSTIN</b>.",
        "Add the <b>Drug licence</b>, <b>Contact person</b>, <b>Phone</b>, <b>Address</b> and <b>Payment terms</b> if you have them.",
        "Leave <b>Active supplier</b> ticked, then click <b>Save supplier</b>.",
      ],
      fields: [
        ["Supplier name, GSTIN", "The distributor's name and GST number as on its bills. The GSTIN must match the bill."],
        ["Drug licence, Food licence", "The distributor's licence numbers. Bills need the drug licence."],
        ["Contact person, Email, Phone, Address", "Who to call and where to send enquiries."],
        ["Payment terms", "A reminder of the agreed credit period, for example 30 days."],
        ["Notes", "Anything staff should know about this distributor."],
        ["Active supplier", "Untick to stop a distributor being chosen on new bills, without deleting its history."],
      ],
      fieldsHeading: ["Field", "What it holds"],
      shots: [
        {
          file: "suppliers",
          as: "pharmacist",
          caption: "The supplier list.",
          run: async (page, h) => {
            await h.goto(`${INV}?area=purchases&view=suppliers`);
            await page.getByText(SUPPLIER.name).first().waitFor({ timeout: 30000 });
            await h.settle(500);
          },
        },
        {
          file: "add-supplier",
          as: "pharmacist",
          caption: "The Add supplier form, filled in for a new distributor. Nothing is saved until you click Save supplier.",
          run: async (page, h) => {
            await h.goto(`${INV}?area=purchases&view=suppliers`);
            await page.getByRole("button", { name: "Add supplier" }).click();
            await page.getByLabel("Supplier name").waitFor();
            await page.getByLabel("Supplier name").fill("Deccan Dermacare Distributors");
            await page.getByLabel("GSTIN").fill("36DDDDD3333D1Z5");
            await page.getByLabel("Contact person").fill("Farhan Qureshi");
            await page.getByLabel("Phone").fill("9440198765");
            await page.getByLabel("Payment terms").fill("45 days");
            await quiet(page, 500);
          },
          target: 'form:has(label:has-text("Supplier name"))',
          after: async (page) => { await page.getByRole("button", { name: "Cancel" }).click().catch(() => {}); },
        },
      ],
    },
    {
      title: "Pay a distributor and watch overdue bills",
      who: "Pharmacists, admins, owners (purchase ledger permission)",
      body: [
        "<b>Payments &amp; dues</b> is the purchase ledger. It shows how much the pharmacy owes in total, how much is overdue and what is due soon, then a summary per distributor, the age of the debts and alerts. Use it each week to decide whom to pay. The register's <b>Outstanding</b> total and the Today row <b>Overdue supplier bills</b> both lead here.",
        "A bill becomes overdue when its due date has passed. The bill entered in this chapter was a credit bill with a due date five days ago, so it appears as overdue.",
        "You can record a payment in two places. In the bill list, click <b>Mark paid</b> on a row to settle that one bill. In Payments &amp; dues, choose the distributor in the payment form further down, enter the amount and split it across that distributor's unpaid bills.",
      ],
      steps: [
        "Open <b>More tasks…</b> and choose <b>Payments &amp; dues</b>.",
        "Read the cards at the top and the <b>Distributor Summary</b>. Click a distributor to see its bills.",
        "To pay one bill, go to <b>Purchase bills</b> and click <b>Mark paid</b> on its row.",
        "Choose the <b>Mode</b>: Cash, Cheque, NEFT / RTGS, UPI or Card.",
        "Check the date and amount. For a cheque or transfer, type the number in <b>Cheque / UTR no.</b>.",
        "Click <b>Record payment</b>. The row now reads <b>Paid</b> (or <b>Part paid</b>) and an <b>Undo</b> button stays beside it for a short time if you made a mistake.",
      ],
      fields: [
        ["Outstanding", "Total owed to all distributors, after any credit you hold."],
        ["Overdue", "The part of that total already past its due date."],
        ["Due Soon", "Bills falling due in the next few days."],
        ["TCS Watch", "Bills where tax collected at source is approaching its limit."],
        ["Distributor Summary", "One row per distributor: number of bills, outstanding, credit held and counts of pending, part paid and paid bills."],
        ["Aging", "Outstanding amounts grouped by how old the bills are: 0 to 30, 31 to 60, 61 to 90 and over 90 days."],
        ["Alerts", "Counts of bills due in 7 days, due today, overdue and with TCS approaching."],
      ],
      fieldsHeading: ["Card", "Meaning"],
      shots: [
        {
          file: "ledger",
          as: "admin",
          caption: "Payments &amp; dues. The overdue card is now above zero because of the credit bill entered earlier.",
          viewport: { width: 1440, height: 1500 },
          run: async (page, h) => {
            await h.goto(`${INV}?area=purchases&view=ledger`);
            await page.getByText("Distributor Summary").waitFor({ timeout: 60000 });
            await h.settle(1500);
          },
        },
        {
          file: "mark-paid",
          as: "admin",
          caption: "Mark paid opens a small window: mode of payment, date, amount and the cheque or transfer number. Nothing is recorded until you click Record payment.",
          narrow: true,
          target: '[role="dialog"]',
          run: async (page, h) => {
            await register(page, h, `&gstin=${SUPPLIER.gst}`);
            await page.getByRole("button", { name: new RegExp(`^Mark bill ${state.billNo.replace(/[/]/g, "\\/")} paid`) }).click();
            await page.getByRole("dialog").waitFor();
            await page.getByRole("dialog").locator("select").selectOption("NEFT");
            await quiet(page, 500);
          },
          after: async (page) => { await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click(); },
        },
      ],
      tips: ["The distributor strip that appears above the bill list when you filter by one distributor shows what you owe it, the credit you hold from it and a button to set that credit off against its bills."],
    },
    {
      title: "Return goods to a supplier",
      who: "Pharmacists",
      body: [
        "When goods are near expiry, broken or wrongly supplied, you send them back to the distributor on a return challan, which is the paper that goes with the goods. ClinicMS records the return, takes the units off the shelf and then waits for the distributor's credit note. Returns are on the second tab of <b>Purchase bills</b>.",
        "The return works in two steps. <b>Create return challan</b> posts the return: stock leaves the pharmacy now. <b>Record credit note</b> comes later, when the distributor sends its credit note, and turns the return into money you hold with that distributor.",
      ],
      steps: [
        "Open <b>Purchase bills</b> and click the <b>Returns</b> tab. It lists the returns already made.",
        "Click <b>New return</b>.",
        "Choose the <b>Supplier</b>, and the <b>Reason for return</b>: Expired, Near expiry, Breakage, Wrong item supplied, Excess supply or Other. Add a <b>Note (optional)</b>.",
        "Leave <b>Stock source</b> on <b>Available stock (no hold)</b>. Choose the <b>Return price basis</b>: purchase rate per stock unit, or an agreed rate that you type for each line.",
        "Under <b>Add a batch</b>, search by product, batch, barcode or SKU, and click the batch to add it.",
        "Type the <b>Quantity</b> to return. Check the rate, discount, GST and the total at the bottom.",
        "Click <b>Create return challan</b>. A green message confirms it. Use <b>Save draft</b> instead if you are not ready; a draft does not change stock.",
      ],
      fields: [
        ["Reference", "A number for the return, filled in for you. You can change it."],
        ["Stock source", "Which stock the batch list draws from. The default is stock that is not on hold."],
        ["Return price basis", "Whether the credit you expect uses the purchase rate or a rate you agreed with the distributor."],
        ["Free", "Free units on the line, if you are returning bonus stock."],
        ["Scheme ₹", "A scheme amount to deduct from the line."],
      ],
      fieldsHeading: ["Field", "Meaning"],
      shots: [
        {
          file: "return-form",
          as: "pharmacist",
          caption: "A new return for six tubes. (1) supplier, (2) reason, (3) price basis, (4) the batch added, (5) quantity, (6) totals.",
          viewport: { width: 1440, height: 1500 },
          run: async (page, h) => {
            await h.goto(RETURNS);
            await page.getByRole("button", { name: "New return" }).first().click();
            await page.getByLabel("Reason for return").waitFor({ timeout: 30000 });
            const supplierSelect = page.locator("label").filter({ hasText: /^\s*Supplier/ }).locator("select").first();
            await supplierSelect.selectOption({ label: (await supplierSelect.locator("option").allInnerTexts()).find((t) => t.includes(SUPPLIER.name)) });
            await page.getByLabel("Reason for return").selectOption({ label: "Near expiry" });
            await page.getByLabel("Note (optional)").fill("Six tubes from the last delivery, expiry is within a year.");
            await page.getByPlaceholder("Search product, batch, barcode or SKU").fill(P.search);
            await page.getByText(P.batch).first().waitFor({ timeout: 20000 });
            await page.locator("button, [role=option]").filter({ hasText: P.batch }).first().click();
            const qty = page.getByRole("spinbutton").first();
            await qty.waitFor({ timeout: 15000 });
            await qty.fill("6");
            await quiet(page, 800);
            await h.mark(supplierSelect, 1);
            await h.mark(page.getByLabel("Reason for return"), 2);
            await h.mark(page.getByLabel("Return price basis"), 3);
            await h.mark(page.locator("tbody tr").first(), 4);
            await h.mark(qty, 5);
            await h.mark(page.getByText(/^Total ₹/).first(), 6);
          },
        },
        {
          file: "return-posted",
          as: "pharmacist",
          caption: "The return after Create return challan. The units have left stock, and the return now waits for the distributor's credit note.",
          viewport: { width: 1440, height: 1300 },
          run: async (page, h) => {
            await page.getByRole("button", { name: "Create return challan" }).click();
            await page.getByRole("button", { name: /Record credit note/ }).first().waitFor({ timeout: 60000 });
            await h.settle(1500);
          },
        },
        {
          file: "returns-list",
          as: "pharmacist",
          caption: "The Returns tab after the return was made. The row shows the distributor, the value, and the status Credit note awaited. Record credit note on the row opens the credit note window.",
          run: async (page, h) => { await h.goto(RETURNS); await page.getByRole("tabpanel", { name: "Returns" }).locator("table").first().waitFor({ timeout: 60000 }).catch(() => {}); await h.settle(1500); },
        },
      ],
      warnings: ["Create return challan takes the stock out of the pharmacy immediately. Count the goods and check the quantity before you click."],
    },
    {
      title: "Record a supplier credit note",
      who: "Pharmacists, admins, owners (purchase ledger permission)",
      body: [
        "A distributor usually sends a credit note some days after it receives returned goods. Record it so the pharmacy's books match: the credit becomes money you hold with that distributor, and you can set it off against its unpaid bills. <b>Credits &amp; vouchers</b> lists the credit notes you have recorded and the supplier returns they belong to; a return still waiting for its note shows on the Returns tab as <b>Credit note awaited</b>. The Today row <b>Credit notes awaited</b> counts the waiting returns.",
      ],
      steps: [
        "Open the <b>Returns</b> tab and find the return. It shows <b>Record credit note</b> on its row.",
        "Click <b>Record credit note</b>.",
        "Type the distributor's <b>Credit note no.</b> and <b>Credit note date</b> from its paper.",
        "Type the <b>Amount (₹)</b> on the note, or click <b>Same as return value</b> if it equals the value of the return.",
        "Click <b>Record credit note</b>. A message offers <b>Set off</b> so you can apply the credit to an unpaid bill straight away.",
      ],
      fields: [
        ["Awaited", "Value of returns sent to the distributor whose credit note has not yet been recorded."],
        ["Credit held", "Credit from recorded notes that has not yet been set off against bills."],
        ["Set off", "Using held credit to reduce the balance of one or more unpaid bills from the same distributor. A set-off can be undone from the message that appears afterwards."],
        ["Correct credit note", "A recorded note can be corrected. You must give a reason, which is kept on record."],
      ],
      fieldsHeading: ["Word", "Meaning"],
      shots: [
        {
          file: "credit-dialog",
          as: "admin",
          caption: "Recording the distributor's credit note against the return. The note number and date come from the distributor's paper. The note is saved when you click Record credit note.",
          narrow: true,
          target: '[role="dialog"]',
          run: async (page, h) => {
            await returnsList(page, h);
            await page.getByRole("button", { name: /^Record credit note/ }).first().click();
            const d = page.getByRole("dialog");
            await d.waitFor();
            await d.getByLabel("Credit note no.").fill(`SSP-CN-${String(Date.now()).slice(-5)}`);
            await d.getByLabel("Credit note date").fill(ddmmyyyy(new Date()));
            await d.getByRole("button", { name: "Same as return value" }).click();
            await quiet(page, 500);
          },
          after: async (page) => {
            await page.getByRole("dialog").getByRole("button", { name: "Record credit note" }).click();
            await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 30000 });
            await quiet(page, 1500);
          },
        },
        {
          file: "credits",
          as: "admin",
          caption: "Credits &amp; vouchers after the credit note was recorded. It lists each credit note with the distributor and the return it belongs to.",
          run: async (page, h) => {
            await h.goto(`${INV}?area=purchases&view=credits`);
            await page.getByRole("button", { name: "Record credit note" }).waitFor({ timeout: 30000 });
            await h.settle(1500);
          },
        },
      ],
    },
    {
      title: "Check each distributor's agreed terms",
      who: "Pharmacists, admins, owners",
      body: [
        "<b>Terms of Trade</b> stores what each distributor agreed to give you for each product, such as a rate and a discount. Whoever checks a delivery can compare the bill with the agreement and spot a price that crept up. Find the distributor, open it, and see its products and agreed terms.",
      ],
      steps: [
        "Open <b>More tasks…</b> and choose <b>Terms of Trade</b>.",
        "Type a name or GSTIN in <b>Find distributor</b>, or scroll the list.",
        "Click the distributor to see its terms.",
        "Click <b>Add terms</b> to record a new agreement.",
      ],
      shots: [
        {
          file: "terms",
          as: "admin",
          caption: "Terms of Trade lists the distributors and how many products have agreed terms.",
          run: async (page, h) => {
            await h.goto(`${INV}?area=purchases&view=terms`);
            await page.getByText(SUPPLIER.name).first().waitFor({ timeout: 30000 });
            await h.settle(800);
          },
        },
        {
          file: "terms-open",
          as: "admin",
          caption: "Add terms opens the form for a new agreement.",
          run: async (page, h) => {
            await h.goto(`${INV}?area=purchases&view=terms`);
            await page.getByRole("button", { name: "Add terms" }).click();
            await quiet(page, 1500);
          },
        },
      ],
    },
    {
      title: "Inward challans and gate passes",
      who: "Pharmacists, admins",
      body: [
        "Sometimes goods arrive before the bill. An <b>Inward challan</b> records the stock as received, so you can sell it, and the later bill is linked to the challan so the goods are not counted twice. A <b>Gate pass</b> only records a delivery's reference and its linked order or receipt. It has no effect on stock or money. Each page lists its documents and can be filtered by status, reference, date range and supplier GSTIN.",
      ],
      steps: [
        "Open <b>More tasks…</b> and choose <b>Inward challans</b> or <b>Gate passes</b>.",
        "Click <b>New document</b> to start one.",
        "Use <b>Status</b>, <b>Reference</b>, <b>From date</b>, <b>To date</b> and <b>Supplier GSTIN</b> to find an older document.",
      ],
      shotLayout: "row",
      shots: [
        {
          file: "challans",
          as: "pharmacist",
          caption: "Inward challans.",
          narrow: true,
          target: "main",
          run: async (page, h) => { await h.goto(`${INV}?area=purchases&view=INWARD_CHALLAN`); await page.getByRole("heading", { name: "Inward challans" }).waitFor({ timeout: 30000 }); await h.settle(1500); },
        },
        {
          file: "gate-passes",
          as: "pharmacist",
          caption: "Gate passes.",
          narrow: true,
          target: "main",
          run: async (page, h) => { await h.goto(`${INV}?area=purchases&view=GATE_PASS`); await page.getByRole("heading", { name: "Gate passes" }).waitFor({ timeout: 30000 }); await h.settle(1500); },
        },
      ],
    },
    {
      title: "Compare purchase costs and find the day-wise reports",
      who: "Pharmacists, admins, owners",
      body: [
        "<b>Purchase costs</b> ranks the distributors by how much you bought from each, and the products by what each unit really cost you after discounts and free stock. Use it to see which distributor is cheapest for a product. It counts only reviewed purchases, and leaves out drafts that still have reading problems. Set the dates, GSTIN, product or HSN at the top and click <b>Refresh</b>; click <b>Reset</b> to go back to the default period.",
        "The GST summary, day-wise summary and item margin reports used to be part of Inventory. They now live in <b>Pharmacy Report</b>, and old links to them take you to the same report there. See the chapter on the pharmacy report.",
      ],
      shots: [
        {
          file: "costs",
          as: "admin",
          caption: "Purchase costs: totals for the period, the distributor ranking and the effective cost of each product.",
          viewport: { width: 1440, height: 1400 },
          run: async (page, h) => {
            await h.goto(`${INV}?area=purchases&view=analytics`);
            await page.getByText("Distributor Ranking").waitFor({ timeout: 90000 });
            await h.settle(1500);
          },
        },
      ],
    },
  ],
};
