const BASE = "/dashboard/pharmacy/reports";
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
// The last weekday before today: the seed has pharmacy bills on every day except Sunday.
const countDay = (today) => {
  let day = addDays(today, -1);
  if (new Date(`${day}T00:00:00Z`).getUTCDay() === 0) day = addDays(day, -1);
  return day;
};

const open = (id, query = "") => async (page, h) => {
  await h.goto(`${BASE}?report=${id}${query}`);
  await page.getByRole("button", { name: /^(Go|Download|Refresh)$/ }).first().waitFor({ timeout: 30000 });
  await page.locator("main table").first().waitFor({ timeout: 30000 }).catch(() => {});
  await h.settle(1200);
};
const report = (file, id, caption, query, extra) => ({ file, caption, run: open(id, query), ...extra });

const TOOLBAR = [
  ["Period", "The dates the report covers: this month, last month, one of the past twelve months, this or last quarter, this or last financial year, or <b>Choose dates…</b> for your own <b>From</b> and <b>To</b>. GST returns open on last month, because they are filed for the month just ended."],
  ["Search this report", "Shown on reports with many rows. Type part of a name, bill number, mobile number or GSTIN."],
  ["Go", "Runs the report with the filters you chose. Nothing changes until you click it."],
  ["Print", "Prints the report, laid out for paper."],
  ["Download", "Saves the report as <b>Excel (.xlsx)</b>, <b>CSV</b> or <b>PDF</b>, with the same filters."],
  ["Column headings", "Click a heading to sort by it; click again to reverse. An (i) beside a heading explains how that column is worked out."],
  ["Total row", "The first row under the headings adds up the whole period."],
  ["How these figures are worked out", "Click it at the bottom of a report to read the rules behind the figures."],
];

module.exports = {
  id: "15-pharmacy-report",
  title: "Pharmacy Report",
  intro:
    "Pharmacy Report holds the pharmacy's accounting, GST and stock reports, and the Daily Collection, where the day's takings are counted. Pharmacists, doctors, managers, admins and owners use it; your accountant will ask for several of these reports each month. All figures come from posted pharmacy bills, counter sales, customer returns and supplier bills already added to stock. Drafts are left out.",
  sections: [
    {
      title: "Find a report",
      who: "Pharmacists, doctors, managers, admins and owners",
      body: [
        "Open <b>Pharmacy Report</b> from the Pharmacy part of the menu. The left of the page lists every report, grouped as GST Reports, Margin Reports, Stock Reports, Accounting Reports and Others. The right shows the most used reports as cards.",
        "The yellow note at the top is a reminder: the figures are only as good as the stock and purchase records behind them. Until the clinic's stock take and medicine-name clean-up are finished, check margins and GST totals against the bills before you file anything.",
      ],
      steps: [
        "Click a report name on the left, or a card under <b>Common reports</b>.",
        "Or type in <b>Search reports</b>, for example <i>GSTR</i> or <i>expiry</i>. The list shrinks to the reports that match.",
        "Inside a report, click <b>Pharmacy Report</b> at the top left to come back to this page.",
      ],
      shots: [
        {
          file: "landing",
          caption: "The Pharmacy Report page.",
          run: async (page, h) => {
            await h.goto(BASE);
            await page.getByRole("heading", { name: "Common reports" }).waitFor();
            await h.mark(page.getByLabel("Search reports"), 1);
            await h.mark(page.getByText("Every figure comes from"), 2);
            await h.mark(page.getByRole("heading", { name: "Common reports" }), 3);
          },
        },
        {
          file: "search",
          caption: "Searching the list for GSTR leaves the four GST returns.",
          run: async (page, h) => {
            await h.goto(BASE);
            await page.getByLabel("Search reports").fill("GSTR");
            await h.settle(400);
          },
        },
      ],
      fields: [
        ["1. Search reports", "Finds a report by name or by words linked to it."],
        ["2. Yellow note", "Check figures against the bills until the stock data is cleaned up."],
        ["3. Common reports", "Sales Register, Day wise Summary, GSTR-1, GSTR-3B, Item Wise Margin Report and Daily Collection."],
        ["Daily Collection in the menu", "The <b>Daily Collection</b> item under Overview opens the same Daily Collection report directly."],
      ],
    },
    {
      title: "Use the report toolbar",
      who: "Everyone who uses Pharmacy Report",
      body: [
        "Most reports share one toolbar above the figures. A report shows only the filters it needs. The (i) beside the report's title says in one sentence what the report is for. Wide tables scroll sideways: scroll inside the table to see the columns on the right.",
      ],
      shots: [
        {
          file: "toolbar",
          caption: "The toolbar on the Sales Register.",
          run: async (page, h) => {
            await open("sales-register")(page, h);
            await h.mark(page.getByLabel("Period"), 1);
            await h.mark(page.getByLabel("Type"), 2);
            await h.mark(page.getByLabel("Search this report"), 3);
            await h.mark(page.getByRole("button", { name: "Go" }), 4);
            await h.mark(page.getByRole("button", { name: "Print" }), 5);
            await h.mark(page.getByRole("button", { name: "Download" }), 6);
          },
        },
      ],
      fields: TOOLBAR,
      tips: ["Print and Download always use the filters on screen after you last clicked <b>Go</b>."],
    },
    {
      title: "Purchase Register",
      who: "Pharmacists, accountants",
      body: ["Every supplier bill added to stock, one row each. Use it to check the month's purchases and input GST against the supplier bills in your file. Filters: Period and Search (distributor, bill number or GSTIN)."],
      shots: [report("purchase-register", "purchase-register", "Purchase Register for last month.")],
      fieldsHeading: ["Column", "Meaning"],
      fields: [
        ["Bill No., Bill Date", "The supplier's bill number and date."],
        ["Entry Date", "When the bill was entered in the app."],
        ["Distributor, GSTIN", "The supplier and their GST number."],
        ["Taxable", "The value before GST."],
        ["CGST, SGST, IGST, CESS", "The GST on the bill. A supplier in Telangana charges CGST and SGST; one from another state charges IGST."],
        ["Total GST, Other, Bill Amount", "All GST, any other charges, and the bill total."],
      ],
    },
    {
      title: "Purchase Bills and Sales Bills",
      who: "Pharmacists, accountants",
      body: [
        "These two reports split each bill across the GST slabs: CESS, 0%, 5%, 12%, 18%, 28% and 40%. Each slab has Base (the value before tax), SGST, CGST and IGST, and the last columns give the totals. Purchase Bills shows supplier bills; Sales Bills shows pharmacy bills. They are the same report with a different <b>Type</b>.",
        "Filters: Period, <b>Type</b> (Sales or Purchase), <b>GST</b> (All bills, With GST, Without GST) and Search.",
      ],
      shots: [report("sales-bills", "sales-bills", "Sales Bills, one row per bill, split by GST slab.")],
      fieldsHeading: ["Column", "Meaning"],
      fields: [
        ["Sr No., Bill No.", "Row number and bill number."],
        ["Entry Date, Bill Date", "When it was entered and the date on the bill."],
        ["Customer / Distributor", "Who the bill is for, or from."],
        ["Base, SGST, CGST, IGST under each slab", "That part of the bill taxed at that rate."],
        ["Total: Base, SGST, CGST, IGST, Amount", "The bill's totals."],
      ],
    },
    {
      title: "Sales Register",
      who: "Pharmacists, accountants, doctors",
      body: [
        "Every pharmacy bill and counter sale, one row each. Search a patient's name or mobile number to see everything they bought in the period.",
        "<b>Type</b> chooses <b>Sales</b>, <b>Returns</b> (customer returns, shown as minus amounts) or <b>Sales net of returns</b>.",
      ],
      shots: [report("sales-register", "sales-register", "Sales Register for last month.")],
      fieldsHeading: ["Column", "Meaning"],
      fields: [
        ["Bill No., Bill Date, Customer, Mobile", "Which bill, when, and who it was for."],
        ["Gross", "The price of the items before discount."],
        ["Disc.", "Discount given."],
        ["Taxable", "Gross less discount."],
        ["CESS, SGST, CGST, IGST", "The GST on the bill."],
        ["Total", "Taxable plus all GST: what the customer paid."],
      ],
    },
    {
      title: "Day wise Summary",
      who: "Pharmacists, accountants",
      body: [
        "One row per day with the first and last bill number of the day and the GST slab split. Days with no bills show as ₹0 rows, so a gap in the bill numbers stands out. The line above the table counts the bills and days.",
        "Filters: <b>From</b>, <b>To</b> and <b>Type</b> (Sales or Purchase), then <b>Go</b>. This report has <b>Download</b> but no Print button.",
      ],
      shots: [report("day-wise", "day-wise-summary", "Day wise Summary for this month.")],
    },
    {
      title: "GSTR-1",
      who: "Accountants",
      body: [
        "The figures for the monthly GSTR-1 return of outward supplies. Pharmacy bills do not record a buyer GSTIN, so every sale is reported as B2C, net of returns, and B2B (Table 4) is empty. The report has three tables.",
      ],
      shots: [report("gstr-1", "gstr-1", "GSTR-1 for last month.", "", { viewport: { width: 1440, height: 1300 } })],
      fieldsHeading: ["Table", "What it holds"],
      fields: [
        ["Boxes at the top", "Invoice value for the period, then Taxable value, CGST, SGST and Total tax."],
        ["B2C small, rate-wise (Table 7)", "Type, Place of Supply (36-Telangana), Rate %, Taxable Value, CGST, SGST and Cess for each GST rate."],
        ["HSN summary (Table 12)", "For each HSN code and rate: Description, UQC (unit), Total Qty, Taxable Value, IGST, CGST, SGST, CESS and Total Value."],
        ["Documents issued (Table 13)", "The first and last bill number (Sr. No. From and To), Total number, Cancelled and Net issued."],
      ],
    },
    {
      title: "GSTR-3B",
      who: "Accountants",
      body: [
        "The figures for the monthly GSTR-3B summary return. Table 3.1 and 4 show outward supplies and the eligible input tax credit (ITC). Table 6.1 shows the tax payable and how credit is set off against it, leaving the tax to pay in cash.",
        "The ITC comes from the clinic's own supplier bills. Claim only what the GST portal shows in your GSTR-2B for the month.",
      ],
      shots: [report("gstr-3b", "gstr-3b", "GSTR-3B for last month.", "", { viewport: { width: 1440, height: 1300 } })],
      fieldsHeading: ["Column", "Meaning"],
      fields: [
        ["Boxes at the top", "<b>Output tax</b> on sales, <b>Eligible ITC</b> from purchases, <b>Payable in cash</b> after the credit is used (highlighted), and <b>ITC carried forward</b> to next month."],
        ["Table", "The table number on the GST form, such as 3.1(a)."],
        ["Nature of supplies / tax", "What the line is."],
        ["Taxable value, IGST, CGST, SGST, Cess", "The amounts for that line."],
      ],
    },
    {
      title: "GSTR-2A and GSTR-2B",
      who: "Accountants",
      body: [
        "The GST portal prepares GSTR-2A and GSTR-2B from what your suppliers file. These two reports show the clinic's side, from its own supplier bills, laid out the same way so your accountant can match them line by line against the portal download.",
        "<b>GSTR-2A</b> lists each supplier invoice under <b>B2B invoices</b>, and supplier returns and credit notes under <b>Credit / debit notes</b>. <b>GSTR-2B</b> gives one row per supplier with the total input tax credit and flags suppliers without a valid GSTIN.",
      ],
      shots: [report("gstr-2b", "gstr-2b", "GSTR-2B: input tax credit per supplier.")],
      fieldsHeading: ["Column", "Meaning"],
      fields: [
        ["Supplier GSTIN, Supplier name", "Who the bills are from."],
        ["Invoice / note No., Date, Invoice value (2A)", "Each bill or credit note."],
        ["Place of supply, Rate % (2A)", "The supplier's state, and the GST rate."],
        ["Documents (2B)", "How many bills from that supplier."],
        ["Taxable value, IGST, CGST, SGST, Cess", "Value before tax and the GST on it."],
        ["Total ITC, ITC status (2B)", "The credit, and whether it is <i>Eligible as per books</i>."],
      ],
    },
    {
      title: "HSN wise GST",
      who: "Accountants",
      body: ["Quantity, taxable value and GST for each HSN code and rate. Items without an HSN code are listed last; add their HSN code in Inventory. <b>Type</b> chooses Sales or Purchase."],
      shots: [report("hsn-wise", "hsn-wise", "HSN wise GST for last month's sales.")],
      fieldsHeading: ["Column", "Meaning"],
      fields: [
        ["HSN, Description, UQC", "The code, an item name and the unit."],
        ["Total Qty, Rate %", "Units sold and the GST rate."],
        ["Taxable Value, IGST, CGST, SGST, CESS, Total Value", "Value before tax, the GST, and the total."],
      ],
    },
    {
      title: "Composition GST Report",
      who: "Accountants",
      body: [
        "Only for a pharmacy registered under the GST composition scheme, which files CMP-08 instead of GSTR-1 and GSTR-3B. Choose the <b>Composition rate</b>: 1% (trader), 2% (manufacturer), 5% (restaurant) or 6% (services). A pharmacy is normally a trader.",
        "Columns: <b>Month</b>, <b>Outward turnover</b> (sales less returns, before GST), <b>Composition rate %</b>, <b>CGST</b> and <b>SGST</b> (half each), and <b>Composition tax</b>.",
      ],
      shots: [report("composition", "composition", "Composition GST Report at 1%.")],
    },
    {
      title: "Item Wise Margin Report",
      who: "Pharmacists, owners",
      body: [
        "For each item sold, what it sold for, what it cost, the GST and the profit, highest margin first. Use it to see which medicines earn the clinic money.",
        "The four boxes at the top total the period: <b>Total Sale Amount</b>, <b>Total Purchase</b>, <b>Total Net GST</b> and <b>Total Profit</b>. A yellow box appears when some sales have no purchase cost recorded: their sales are counted in Total Sale Amount but not in Purchase, Net GST or Profit. Add the purchase price on the item in Inventory so future sales are counted.",
      ],
      shots: [
        report("margin", "item-margin", "Item Wise Margin Report with More Filters open.", "", {
          run: async (page, h) => {
            await open("item-margin")(page, h);
            await page.getByRole("button", { name: /More Filters/ }).click();
            await h.settle(400);
          },
        }),
      ],
      fieldsHeading: ["Filter or column", "Meaning"],
      fields: [
        ["From, To", "The dates of the sales."],
        ["Type", "<b>Net sales</b> (sales less returns), <b>Sales only</b> or <b>Returns only</b>."],
        ["Tags", "Only items with this tag."],
        ["Search in, Search", "Type part of a name and choose whether to look in <b>All fields</b>, <b>Item name</b>, <b>Category</b> or <b>Manufacturer</b>."],
        ["More Filters", "Opens four more filters: <b>Category</b>, <b>Manufacturer</b>, <b>Item type</b> (Medicine, Equipment, Supply, Consumable) and <b>Cost status</b> (All, Missing cost, Loss-making). The button shows how many are in use. <b>Clear filters</b> resets them."],
        ["Item Name, Category, Unit, Manufacturer", "Which item, from its newest batch."],
        ["Sale (qty)", "Units sold less units returned."],
        ["Stock, MRP", "Stock now, and the MRP of the newest batch."],
        ["Sales Amt.", "What customers paid, GST included."],
        ["Purchase", "What those units cost, GST included."],
        ["Net GST", "GST collected less GST paid on the cost."],
        ["Profit ₹ (%)", "Sales Amt. less Purchase less Net GST, and as a share of the sale value before GST. Red means a loss."],
      ],
    },
    {
      title: "Expiring Stock",
      who: "Pharmacists",
      body: [
        "Batches with stock that have expired or will expire soon, with what they are worth. Check it every month and return the batches to the distributor before they expire. The report shows stock as it is today; there is no period.",
        "<b>Expiry</b> chooses the window: Already expired, Within 1 month, 2 months, 3 months or 6 months.",
      ],
      shots: [report("expiring", "expiring-stock", "Expiring Stock within 3 months.")],
      fieldsHeading: ["Column", "Meaning"],
      fields: [
        ["Item Name, Batch, Expiry, Supplier", "Which batch and when it expires."],
        ["Stock", "Units left in that batch."],
        ["Value at cost, Value at MRP", "What the units cost and what they would sell for."],
        ["Action", "What to do, for example <i>Return to distributor or move to expiry bin</i>."],
      ],
    },
    {
      title: "Count the day's takings: Daily Collection",
      who: "Pharmacists, reception, doctors, admins",
      body: [
        "Daily Collection shows the whole day's money by payment mode: clinic consultation and procedure bills beside the pharmacy's sales. At closing time the pharmacy counts its cash drawer and checks its UPI and card settlements, and the app shows at once whether anything is short.",
        "Open it from <b>Daily Collection</b> in the menu. It opens on today. Use the arrows beside <b>Day</b> to go back or forward a day, or pick a date.",
      ],
      steps: [
        "Count the cash in the pharmacy drawer.",
        "Check the UPI and card settlement totals for the day.",
        "In the <b>Pharmacy reconciliation by payment mode</b> table, type each amount in the <b>Counted</b> box of its row. The <b>Difference</b> column shows the gap as you type: a minus amount is money missing.",
        "Add a <b>Note</b> if something explains a gap, for example cash kept aside for change.",
        "Click <b>Save count</b>. The coloured line above the boxes changes to say whether the pharmacy balanced, is short or is over.",
        "If you count again later, click <b>Save recount</b>. Click the <b>Counted by</b> line under the table to see every count of the day.",
      ],
      shots: [
        {
          file: "collection",
          caption: "Daily Collection for a past day, before counting.",
          viewport: { width: 1440, height: 1300 },
          run: async (page, h) => {
            await h.goto(`${BASE}?report=daily-collection&from=${countDay(h.seed.today)}`);
            await page.getByRole("table", { name: "Pharmacy reconciliation by payment mode" }).waitFor({ timeout: 30000 });
            await h.settle(800);
          },
        },
        {
          file: "collection-short",
          caption: "Counts entered and saved: the cash drawer is ₹200 short.",
          viewport: { width: 1440, height: 1300 },
          run: async (page, h) => {
            const table = page.getByRole("table", { name: "Pharmacy reconciliation by payment mode" });
            const rows = table.locator("tbody tr");
            for (let i = 0; i < (await rows.count()); i++) {
              const row = rows.nth(i);
              const label = (await row.locator("th").innerText()).trim();
              const expected = Number((await row.locator("td").nth(4).innerText()).replace(/[₹,\s]/g, "")) || 0;
              const counted = label === "Cash" && expected >= 200 ? expected - 200 : expected;
              await row.getByLabel(`${label} counted`).fill(counted.toFixed(2));
            }
            await page.getByPlaceholder(/kept aside for change/).fill("Counted at closing by Anil");
            const save = page.getByRole("button", { name: /Save (count|recount)/ });
            if (await save.isEnabled()) {
              await save.click();
              await page.getByTestId("count-history").waitFor({ timeout: 15000 });
            }
            await h.settle(800);
            await table.scrollIntoViewIfNeeded();
          },
        },
      ],
      fieldsHeading: ["On the screen", "What it means"],
      fields: [
        ["Whole day", "Clinic receipts less refunds, plus what the pharmacy should have in hand. Split into <b>Clinic</b> and <b>Pharmacy</b>."],
        ["Clinic received", "Payments received today on clinic bills, whatever day the bill is from, less refunds."],
        ["Clinic billed today, Clinic still due", "Clinic bills made today, and what is still unpaid at the end of the day (yellow when anything is due)."],
        ["Pharmacy billed today, expected in hand, still due", "The pharmacy's bills today, the money that should be in hand, and what customers still owe."],
        ["Pharmacy count difference", "The saved count less what was expected. Red when short."],
        ["Whole day by payment mode", "Clinic and pharmacy money side by side for each mode."],
        ["Clinic bills", "The consultation and procedure bills paid that day."],
        ["On today's bills", "Payments received today on pharmacy bills dated today."],
        ["On earlier bills", "Payments received today on older bills (balances settled today)."],
        ["Counter sales", "Counter sales paid today. Counter sales on credit move no money."],
        ["Refunds", "Money handed back in this mode today."],
        ["Expected", "On today's bills + On earlier bills + Counter sales − Refunds: what should be in hand."],
        ["Counted, Difference", "What you counted, and Counted − Expected."],
        ["Yellow line: not counted yet", "Nobody has counted the pharmacy for this day."],
        ["Green line: balanced", "The count matches what the app expected."],
        ["Red line: short", "Less money than expected. Check the drawer, pending UPI settlements and any refunds paid in cash."],
        ["Yellow line: over", "More money than expected. Look for a payment taken without a bill, or a bill not yet confirmed."],
      ],
      after: ["Below the count, tables list the day's payments by mode and the bills behind them. Print and Download work as on the other reports."],
      warnings: ["Save a count only after you have really counted. Each saved count is kept with your name and time; a recount does not erase the earlier ones."],
    },
    {
      title: "GST Summary &amp; Monthly P&amp;L",
      who: "Owners, accountants",
      body: [
        "Two summaries on one page. <b>GST Summary</b> totals input GST (on purchases) and output GST (on sales) for a <b>Start date</b> to <b>End date</b>, with <b>Net payable</b> and the split by GST slab. <b>Monthly</b> reports pick a <b>Month</b> and show <b>Procurement</b>, <b>Sales</b>, <b>Gross profit</b>, <b>Stock at cost</b> and <b>Write-off</b>.",
        "Each part has <b>Refresh</b> to work the figures out again, and a list of the source records behind them. <b>Export all source rows</b> downloads that list.",
      ],
      shots: [report("gst-summary", "gst-summary", "GST Summary for this month.")],
    },
    {
      title: "Daily Sales Summary – Doctorwise",
      who: "Owners, doctors",
      body: [
        "Pharmacy sales by prescribing doctor, with each doctor's share. Pharmacy bills carry the prescribing doctor; counter sales carry the doctor typed on them. It opens on this month.",
      ],
      shots: [report("doctorwise", "doctor-wise-sales", "Daily Sales Summary – Doctorwise for this month.")],
      fieldsHeading: ["Column", "Meaning"],
      fields: [
        ["Doctor", "The prescribing doctor."],
        ["Bills, Returns", "How many bills and returns."],
        ["Gross, Disc., Taxable, GST, Total", "As in the Sales Register."],
        ["Share %", "The doctor's share of all pharmacy sales in the period."],
      ],
    },
  ],
};
