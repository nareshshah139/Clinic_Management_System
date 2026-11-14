const DESK = "/dashboard/pharmacy?section=desk";
const WIDE = { width: 1920, height: 1080 };
const PARTNER_TODAY = "Kondapur Skin Pharmacy";
const PARTNER_MISSING = "Madhapur Wellness Chemists";
const PACKAGE = "Acne Clear Starter Kit";
const NEW_PACKAGE = "Melasma Care Kit";
const NEW_DRUG = "Hydroquinone Cream 2% 15 g";
const drugId = (name) => `guide-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-drug`;
const ago = (days) => new Date(Date.now() + 19800000 - days * 86400000).toISOString().slice(0, 10);

const section = (page, heading) => page.locator("div.space-y-6").filter({ has: page.getByRole("heading", { name: heading }) }).first();

module.exports = {
  id: "09-pharmacy-desk",
  title: "Pharmacy Desk",
  intro:
    "The Pharmacy Desk is the pharmacy's home screen. It shows today's figures, opens the other pharmacy screens, and holds three tools: the Pharmacy AI assistant, Partner Daily Sync for partner pharmacies' sales, and Treatment Packages. Pharmacists land here when they sign in.",
  setup: async (h) => {
    const sale = (name, date, items) => h.api("pharmacist", "POST", "/pharmacy/partner-sales", { partnerOrganizationName: name, partnerUserName: "Store manager", date, source: "MANUAL", items });
    const has = async (name, date) => ((await h.api("pharmacist", "GET", `/pharmacy/partner-sales?date=${date}&limit=50`)).data || []).some((s) => s.partnerOrganizationName === name);
    if (!(await has(PARTNER_MISSING, ago(1))))
      await sale(PARTNER_MISSING, ago(1), [{ medicineName: "Calamine Lotion 100 ml", batchNumber: "LNB0126", quantitySold: 4, mrp: 95, discountGiven: 0, paymentMode: "CASH" }]);
    if (!(await has(PARTNER_TODAY, ago(0))))
      await sale(PARTNER_TODAY, ago(0), [
        { medicineName: "Sunscreen SPF 50 Lotion 50 ml", batchNumber: "LNF0226", quantitySold: 3, mrp: 450, discountGiven: 45, paymentMode: "UPI" },
        { medicineName: "Cetirizine 10 mg Tablet", batchNumber: "LNB0226", quantitySold: 20, mrp: 3.5, discountGiven: 0, paymentMode: "CASH" },
      ]);
    const packages = (await h.api("doctor", "GET", "/pharmacy/packages?limit=100")).packages || [];
    if (!packages.some((p) => p.name === PACKAGE))
      await h.api("doctor", "POST", "/pharmacy/packages", {
        name: PACKAGE, category: "Dermatology", subcategory: "Acne Treatment", packagePrice: 560, discountPercent: 10, duration: "8 weeks", isPublic: true,
        description: "Night gel, morning gel and a gentle face wash for mild to moderate acne.",
        indications: "Mild to moderate acne vulgaris", contraindications: "Pregnancy (adapalene)",
        items: [
          { drugId: drugId("Adapalene Gel 0.1% 15 g"), quantity: 1, dosage: "Pea-sized amount", frequency: "ONCE_DAILY", duration: "8 weeks", instructions: "At night on dry skin", sequence: 1 },
          { drugId: drugId("Benzoyl Peroxide Gel 2.5% 20 g"), quantity: 1, dosage: "Thin layer", frequency: "ONCE_DAILY", duration: "8 weeks", instructions: "In the morning", sequence: 2 },
          { drugId: drugId("Salicylic Acid Face Wash 100 ml"), quantity: 1, dosage: "Wash", frequency: "TWICE_DAILY", duration: "8 weeks", sequence: 3 },
        ],
      });
  },
  sections: [
    {
      title: "Read the Pharmacy Desk",
      who: "Pharmacists, doctors, admins",
      body: [
        "Open <b>Pharmacy Desk</b> from the menu. The dark command centre at the top sums up the day and leads to every other pharmacy screen. Reception staff see the desk without the sales figures, the New sale card and the Refresh, Invoices and Drugs buttons.",
      ],
      fields: [
        ["1. Sales", "Today's pharmacy sales in rupees. The percentage under it compares today with yesterday."],
        ["2. Invoices", "Bills made today. <b>pending</b> is how many of them are not yet fully paid."],
        ["3. Stock", "How many medicines are in the drug list. <b>low</b> is how many are running low."],
        ["4. Packages", "How many treatment packages (bundles) exist."],
        ["5. Quick Guide, Refresh, Invoices, Drugs", "<b>Quick Guide</b> explains the pharmacy screens. <b>Refresh</b> reloads the four figures. <b>Invoices</b> and <b>Drugs</b> open the pages described below."],
        ["6. Shortcut cards", "<b>Pharmacy Counter</b> (review and pick prescriptions), <b>New sale</b> (bill a prescription or walk-in customer) and <b>Inventory Control</b> (shelves, supplier invoice scanning and expiry, in Inventory)."],
      ],
      shots: [
        {
          file: "desk",
          as: "pharmacist",
          viewport: WIDE,
          caption: "The Pharmacy Desk, with the command centre numbered.",
          run: async (page, h) => {
            await h.goto(DESK, 2000);
            const strip = (label) => page.locator("p", { hasText: new RegExp(`^${label}$`) }).first().locator("xpath=../..");
            await h.mark(strip("Sales"), 1);
            await h.mark(strip("Invoices"), 2);
            await h.mark(strip("Stock"), 3);
            await h.mark(strip("Packages"), 4);
            await h.mark(page.getByRole("button", { name: "Quick Guide" }), 5);
            await h.mark(page.getByRole("button", { name: /^Pharmacy Counter/ }), 6);
          },
        },
      ],
    },
    {
      title: "Quick Guide",
      who: "Everyone who uses the pharmacy",
      body: [
        "<b>Quick Guide</b> opens a short reminder of the pharmacy work in three parts: prescriptions and auto-fill, billing, and inventory controls. Press Esc or click the cross to close it.",
      ],
      shots: [
        {
          file: "quick-guide",
          as: "pharmacist",
          caption: "The Pharmacy Management Guide.",
          narrow: true,
          target: '[role="dialog"]',
          run: async (page, h) => {
            await h.goto(DESK, 1500);
            await page.getByRole("button", { name: "Quick Guide" }).click();
            await page.getByRole("dialog").waitFor();
            await h.settle(400);
          },
          after: async (page) => page.keyboard.press("Escape"),
        },
      ],
    },
    {
      title: "Look up and follow up pharmacy invoices",
      who: "Pharmacists, admins",
      body: [
        "Click <b>Invoices</b> on the desk to open <b>Pharmacy Invoices</b>. It is a card list of bills with their items, useful for checking payment status and collecting balances. It opens on today's bills. For everyday searching and printing, the Sales page is quicker (see the Sales chapter).",
        "The four boxes at the top total the bills in the list: <b>Total Invoices</b>, <b>Total Amount</b>, <b>Completed</b> (fully paid) and <b>Pending Amount</b> (bills not yet fully paid).",
      ],
      fields: [
        ["Search", "Bill number or patient name."],
        ["Status", "Draft, Pending, Confirmed, Dispensed, Completed or Cancelled."],
        ["Payment Status", "Pending, Completed, Failed, Refunded or Partially Paid."],
        ["Payment Method", "Cash, Card, UPI, Net Banking, Wallet or Insurance."],
        ["Date Range", "All dates, Today, This Week, This Month or This Quarter."],
        ["Clear", "Removes every filter and shows all dates."],
      ],
      shots: [
        {
          file: "invoices",
          as: "pharmacist",
          caption: "Pharmacy Invoices, opened from the desk.",
          run: async (page, h) => {
            await h.goto(DESK, 1000);
            await page.getByRole("button", { name: "Invoices", exact: true }).click();
            await page.waitForURL(/pharmacy\/invoices/);
            await h.settle(1500);
          },
        },
      ],
      after: [
        "Each bill card shows its number, a status badge and a payment badge, the patient, phone, doctor, payment mode, number of items, date, subtotal and total, then the list of items. The buttons at the right of a card:",
      ],
      tips: [
        "<b>Eye (View Invoice)</b> opens the printable bill in a new browser tab. Allow pop-ups for the clinic's address if nothing opens.",
        "<b>Arrow (Download Invoice)</b> saves the bill as a PDF.",
        "<b>Green tick (Mark as Paid)</b> appears on finished bills that still owe money. It asks you to confirm the remaining amount, then records it in the bill's payment mode. If the network fails it shows <b>Retry Payment</b>; click it to finish the same payment without charging twice.",
        "<b>Arrow into Sales (Continue in Sales)</b> appears on drafts and opens the draft on the bill screen.",
        "<b>Red bin (Delete Invoice)</b> asks for confirmation and deletes a draft. A finished bill cannot be deleted; the app says so.",
        "<b>Back</b> at the top returns to the previous page.",
      ],
    },
    {
      title: "Manage the drug list",
      who: "Pharmacists, admins",
      body: [
        "Click <b>Drugs</b> on the desk to open <b>Drug Management</b>. This is the master list of medicines the pharmacy sells: the names the bill screen searches. Stock and batches are kept in Inventory; here you keep each medicine's details.",
        "The boxes at the top count <b>Total Drugs</b>, <b>Categories</b>, <b>Manufacturers</b> and <b>Active Drugs</b>. Use <b>Search Drugs</b> (name or composition), <b>Category</b> and <b>Manufacturer</b> to narrow the list, and <b>Clear Filters</b> to reset it.",
        "Each drug row shows the name, a red <b>Discontinued</b> or grey <b>Inactive</b> badge when it applies, the manufacturer, pack size, composition, strength, price and dosage form. The pencil opens the drug to edit it. The red bin deletes it after you confirm. <b>Previous</b> and <b>Next</b> page through long lists.",
      ],
      shots: [
        {
          file: "drugs",
          as: "pharmacist",
          caption: "Drug Management, opened from the desk.",
          run: async (page, h) => {
            await h.goto(DESK, 1000);
            await page.getByRole("button", { name: "Drugs", exact: true }).click();
            await page.waitForURL(/pharmacy\/drugs/);
            await h.settle(1500);
          },
        },
      ],
    },
    {
      title: "Add a new drug",
      who: "Pharmacists, admins",
      steps: [
        "On Drug Management, click <b>Add New Drug</b>.",
        "Fill in the <b>Drug Name</b>, <b>Price (₹)</b>, <b>Manufacturer</b>, <b>Pack Size</b>, <b>Primary Composition</b>, <b>Category</b>, <b>Dosage Form</b> and <b>Strength</b>. Fields marked * are required. Secondary Composition, Barcode and Description are optional.",
        "Click <b>Add Drug</b> at the bottom of the window. When editing, the button reads <b>Update Drug</b>. The drug appears in the list and can be searched on the bill screen.",
      ],
      body: ["Add a drug when the pharmacy starts stocking a medicine that is not in the list yet."],
      shots: [
        {
          file: "add-drug",
          as: "pharmacist",
          caption: "The Add New Drug window, filled in.",
          narrow: true,
          target: '[role="dialog"]',
          run: async (page, h) => {
            await h.goto("/dashboard/pharmacy/drugs", 1500);
            await page.getByRole("button", { name: "Add New Drug" }).click();
            const d = page.getByRole("dialog");
            await d.waitFor();
            await d.getByLabel("Drug Name *").fill(NEW_DRUG);
            await d.getByLabel("Price (₹) *").fill("260");
            await d.getByLabel(/^Manufacturer/).fill("Glenmark");
            await d.getByLabel("Pack Size *").fill("1 tube of 15 g");
            await d.getByLabel(/^Primary Composition/).fill("Hydroquinone (2%)");
            await d.getByLabel("Category *").fill("Depigmenting agents");
            await d.getByLabel(/^Dosage Form/).fill("Cream");
            await d.getByLabel(/^Strength/).fill("2%");
            await h.settle(300);
          },
          after: async (page, h) => {
            const exists = await page.locator("main").getByRole("heading", { name: NEW_DRUG }).count();
            const d = page.getByRole("dialog");
            if (exists) return page.keyboard.press("Escape");
            await d.getByRole("button").filter({ hasText: /Add|Save|Create/ }).last().click();
            await h.settle(1500);
          },
        },
      ],
    },
    {
      title: "Ask the Pharmacy AI assistant",
      who: "Pharmacists, admins",
      body: [
        "The assistant answers questions about the pharmacy in plain language and can prepare changes for you to approve. It stays closed until you need it: click <b>Open AI Assistant</b>. Your clinic must have an AI key set up for it to answer.",
        "It can look up today's pharmacy figures, low stock, recent bills, the prescription queue, supplier purchase invoices, inventory reports and the drug list, and answer with text, a chart or a small report. You can attach a file, such as a photo of a supplier invoice, with the paperclip.",
        "When a question needs a change (add or update a drug or a stock item, adjust stock, or draft, review and post a supplier invoice), the assistant does not change anything itself. It shows a proposal with what it would change. Click <b>Apply</b> to make the change or <b>Reject</b> to drop it. Applying needs the permission for that change.",
        "Each conversation is saved as a chat. Start a new one, switch between <b>Active</b> chats, open the history, and archive or restore old chats.",
      ],
      steps: [
        "Click <b>Open AI Assistant</b>.",
        "Type your question in the box. Press Enter to send, or Shift and Enter for a new line.",
        "Read the answer. If it shows a proposal, check it and click <b>Apply</b> or <b>Reject</b>.",
      ],
      shots: [
        {
          file: "ai-assistant",
          as: "pharmacist",
          viewport: WIDE,
          caption: "The Pharmacy AI assistant, open on the desk.",
          run: async (page, h) => {
            await h.goto(DESK, 1500);
            await page.getByRole("button", { name: "Open AI Assistant" }).click();
            await page.getByPlaceholder(/Ask the pharmacy assistant/).waitFor({ timeout: 60000 });
            await h.settle(1500);
          },
        },
      ],
      tips: ["Always check a proposal before you apply it. An applied change is the same as making it by hand."],
    },
    {
      title: "Enter a partner pharmacy's daily sales",
      who: "Pharmacists, admins",
      body: [
        "Some clinics supply partner pharmacies, which report what they sold each day. <b>Partner Daily Sync</b> records those reports and takes the sold quantities out of the clinic's stock. Each partner sends one report per day.",
      ],
      fields: [
        ["Partners", "How many partner organisations the clinic has."],
        ["Submitted Today", "How many have sent today's report."],
        ["Missing", "How many have not sent it yet."],
        ["Net Sales", "Today's total of the reports, after discounts."],
        ["Refresh", "Reloads the figures and lists."],
      ],
      steps: [
        "Under <b>Manual Daily Entry</b>, check the <b>Date</b>.",
        "Type the partner's <b>Organization Name</b>. A new name creates the partner; <b>Organization ID</b> is only needed if you know it. <b>Submitted By</b> is the person who sent the report.",
        "For each medicine sold, fill in <b>Medicine</b>, <b>Batch</b>, <b>Qty</b>, <b>MRP</b>, <b>Discount</b> (in rupees) and <b>Payment</b> (Cash, Card, UPI or BNPL, buy now pay later). Click <b>Add Item</b> for another line, or the bin to remove one.",
        "Check <b>Form total</b> and click <b>Submit</b>.",
        "In <b>Recent Submissions</b>, click <b>Commit</b> on the report to take its quantities out of stock. The button then reads <b>Committed</b>.",
      ],
      shots: [
        {
          file: "partner-entry",
          as: "pharmacist",
          viewport: WIDE,
          caption: "Partner Daily Sync with a report being entered and one partner missing.",
          target: (page) => section(page, "Partner Daily Sync"),
          run: async (page, h) => {
            await h.goto(DESK, 2000);
            await page.getByLabel("Organization Name").fill("Gachibowli Family Chemists");
            await page.getByLabel("Submitted By").fill("Ramesh Gupta");
            await page.getByPlaceholder("Medicine name").fill("Calamine Lotion 100 ml");
            await page.getByPlaceholder("Batch").fill("LNB0126");
            const row = page.getByPlaceholder("Batch").locator("xpath=ancestor::tr");
            const numbers = row.locator("input[type=number]");
            await numbers.nth(0).fill("2");
            await numbers.nth(1).fill("95");
            await h.settle(400);
          },
        },
        {
          file: "partner-commit",
          as: "pharmacist",
          viewport: WIDE,
          caption: "Recent Submissions after Commit: the stock for today's report is taken out.",
          target: (page) => page.locator("div.rounded-xl, div[class*=card]").filter({ has: page.getByText("Recent Submissions", { exact: true }) }).last(),
          run: async (page, h) => {
            await h.goto(DESK, 2000);
            const row = page.locator("tr").filter({ hasText: PARTNER_TODAY });
            const commit = row.getByRole("button", { name: "Commit" });
            if (await commit.count()) {
              await commit.click();
              await row.getByRole("button", { name: /Committed|Retry outstanding/ }).waitFor({ timeout: 60000 });
            }
            await h.settle(800);
          },
        },
      ],
      fieldsHeading: ["In Missing Entries and Recent Submissions", "Meaning"],
      after: [
        "<b>Missing Entries</b> lists the partners with no report for the chosen date. Each shows its cutoff time (22:00 unless set otherwise) and a badge: <b>Pending</b> before the cutoff, red <b>Late</b> after it.",
        "<b>Recent Submissions</b> lists the reports for the date with the partner, date, status, quantity and net amount. The status reads SUBMITTED, STOCK COMMITTED, PARTIAL STOCK COMMITTED, RECONCILIATION REQUIRED or CANCELLED. The <b>Flags</b> column shows <b>Late</b> (sent after the cutoff), red <b>Discrepancy</b> (something did not match stock) or <b>Clear</b>.",
        "If some units could not be taken out of stock (the batch was not found or stock was short), the button reads <b>Retry outstanding</b> and a box below shows the units outstanding. Click <b>Resolve outstanding</b>, choose the right stocked batch for each medicine with a reason (matching does not move stock), then click <b>Retry these outstanding units</b>.",
      ],
      warnings: ["Commit takes the reported quantities out of the clinic's stock."],
    },
    {
      title: "Browse treatment packages",
      who: "Pharmacists, doctors",
      body: [
        "A treatment package is a bundle of medicines for one condition, sold at one package price, for example an eight-week acne kit. <b>Treatment Packages</b> on the desk lists the clinic's dermatology packages. Type in <b>Search Treatment Packages</b> to find one by name, description or condition.",
        "Each card shows the name and description, the subcategory, <b>Public</b> or <b>Private</b>, the original price struck through, the package price, the saving as <b>% OFF</b>, the number of items, the duration and the doctor who made it. <b>View Details</b> opens everything: category, duration, prices, savings, each medicine with its quantity, dosage, frequency, duration and instructions, what it is for and when not to use it.",
      ],
      shots: [
        {
          file: "packages",
          as: "pharmacist",
          viewport: WIDE,
          caption: "Treatment Packages on the desk.",
          target: (page) => page.locator("div[data-slot=card], div.rounded-xl").filter({ has: page.getByText("Treatment Packages", { exact: true }) }).last(),
          run: async (page, h) => {
            await h.goto(DESK, 2000);
          },
        },
        {
          file: "package-details",
          as: "pharmacist",
          caption: "View Details of a package.",
          narrow: true,
          target: '[role="dialog"]',
          run: async (page, h) => {
            await h.goto(DESK, 2000);
            await page.locator("div").filter({ has: page.getByText(PACKAGE, { exact: true }) }).getByRole("button", { name: "View Details" }).first().click();
            await page.getByRole("dialog").waitFor();
            await h.settle(500);
          },
          after: async (page) => page.keyboard.press("Escape"),
        },
      ],
    },
    {
      title: "Create a treatment package",
      who: "Pharmacists, doctors",
      steps: [
        "Click <b>Create Package</b>.",
        "Type the <b>Name</b>, choose the <b>Category</b> (Dermatology or General) and optionally a <b>Subcategory</b>.",
        "Type the <b>Package Price (₹)</b>, and optionally a <b>Discount %</b> and <b>Duration</b>.",
        "Add a <b>Description</b>, <b>Indications</b> (what it is for) and <b>Contraindications</b> (when not to use it) if you wish.",
        "Under <b>Add drugs</b>, search for each medicine and click <b>Add</b>. For each one set <b>Qty</b>, <b>Dosage</b>, <b>Pattern</b> (such as 0-1-0), <b>Frequency</b> and <b>Duration</b>. The bin removes a medicine.",
        "Check <b>Original price (auto)</b>, the total of the medicines at their normal prices, and <b>Computed discount %</b>.",
        "Click <b>Create Package</b>. <b>Cancel</b> closes the window without saving.",
      ],
      shots: [
        {
          file: "create-package",
          as: "pharmacist",
          caption: "The Create Treatment Package window, filled in.",
          narrow: true,
          viewport: { width: 1440, height: 1300 },
          target: '[role="dialog"]',
          run: async (page, h) => {
            await h.goto(DESK, 2000);
            await page.getByRole("button", { name: "Create Package" }).click();
            const d = page.getByRole("dialog");
            await d.waitFor();
            await d.getByPlaceholder("e.g. Complete Acne Treatment Kit").fill(NEW_PACKAGE);
            await d.getByRole("combobox").first().click();
            await page.getByRole("option", { name: "Dermatology" }).click();
            await d.getByPlaceholder("e.g. Acne Treatment").fill("Pigmentation");
            await d.getByPlaceholder("e.g. 8 weeks").fill("12 weeks");
            const numbers = d.locator("input[type=number]");
            await numbers.nth(0).fill("900");
            for (const [search, name] of [["Azelaic", "Azelaic Acid Cream 20% 15 g"], ["Sunscreen", "Sunscreen SPF 50 Lotion 50 ml"]]) {
              await d.getByPlaceholder("Search drugs by name or ingredient...").fill(search);
              await d.locator("div").filter({ hasText: name }).getByRole("button", { name: "Add" }).last().click();
              await h.settle(300);
            }
            await h.settle(500);
          },
          after: async (page, h) => {
            const packages = (await h.api("pharmacist", "GET", "/pharmacy/packages?limit=100")).packages || [];
            if (packages.some((p) => p.name === NEW_PACKAGE)) return page.keyboard.press("Escape");
            await page.getByRole("dialog").getByRole("button", { name: "Create Package" }).click();
            await h.settle(1500);
            await page.keyboard.press("Escape");
          },
        },
      ],
    },
    {
      title: "Sell a package on a bill",
      who: "Pharmacists",
      body: [
        "Packages are sold from the bill screen. The package goes on the bill as one line at the package price.",
      ],
      steps: [
        "Start a <b>New sale</b> and choose the patient.",
        "Click the <b>Treatment Packages</b> tab next to Individual Drugs.",
        "Click <b>Add</b> on the package. It appears under Invoice Items with a PACKAGE label.",
        "Finish the bill as usual (see the Sales chapter).",
      ],
      shots: [
        {
          file: "package-on-bill",
          as: "pharmacist",
          caption: "The Treatment Packages tab on a new bill, with a package added.",
          viewport: { width: 1440, height: 1400 },
          target: '[aria-label="Prescription bill"]',
          run: async (page, h) => {
            await h.goto("/dashboard/pharmacy/sales/bill", 1500);
            await page.getByLabel("Patient *").fill("Arjun Reddy");
            await page.locator("div.cursor-pointer").filter({ hasText: "Arjun Reddy" }).first().dispatchEvent("mousedown");
            await page.getByRole("tab", { name: "Treatment Packages" }).click();
            await h.settle(800);
            const pkg = page.locator("div").filter({ has: page.getByText(PACKAGE, { exact: true }) }).filter({ has: page.getByRole("button") }).last();
            await pkg.getByRole("button").first().click();
            await h.settle(1000);
          },
        },
      ],
    },
  ],
};
