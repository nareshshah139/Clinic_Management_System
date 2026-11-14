// Inventory: the Today area and everything under Stock.
const INV = "/dashboard/inventory";
const STOCK = `${INV}?area=stock&view=list`;
const COUNTS = `${INV}?area=stock&view=COUNT`;
const CLINDA = "guide-clindamycin-gel-1-20-g";
const MINOX = "guide-minoxidil-solution-5-60-ml";

// h.api keeps a failed sign-in for the whole run, so a busy server (429) would break every later call.
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

const visible = async (locator, ms = 4000) => locator.first().waitFor({ timeout: ms }).then(() => true, () => false);
const stockList = async (page, h, query = "") => {
  await h.goto(`${STOCK}${query}`);
  await page.getByRole("status").filter({ hasText: /matching batches/ }).first().waitFor({ timeout: 30000 });
  await page.locator("tbody tr").first().waitFor({ timeout: 30000 });
};
const itemPage = async (page, h, id, tab = "") => {
  await h.goto(`${STOCK}&item=${id}${tab ? `&itemTab=${tab}` : ""}`);
  await page.getByRole("button", { name: "Back to stock list" }).waitFor({ timeout: 30000 });
  await page.getByRole("tablist", { name: "Item history" }).waitFor({ timeout: 30000 });
  await h.settle(500);
};

module.exports = {
  id: "12-inventory-stock",
  title: "Inventory: today and stock",
  intro:
    "The <b>Inventory</b> page is where the pharmacy receives, checks and corrects its stock. It has five areas across the top: <b>Today</b>, <b>Purchases</b>, <b>Stock</b>, <b>Sales</b> and <b>Reorder</b>. This chapter covers Today and Stock: finding a batch, correcting it, getting price and stock changes approved, counting the shelves and recording losses. The next two chapters cover Purchases, Reorder and Sales. Pharmacists do most of this work. Doctors and admins approve the changes that alter stock or price.",
  setup: async (h) => {
    // A pharmacist's request to add a new medicine, so the New items queue has something to approve.
    const name = "Tretinoin 0.025% cream";
    const known = [];
    for (const status of ["PENDING", "APPROVED", "REJECTED"])
      known.push(...((await call(h, "doctor", "GET", `/inventory/item-requests?status=${status}`).catch(() => [])) || []));
    if (!known.some((r) => r.itemName === name))
      await call(h, "pharmacist", "POST", "/inventory/items", {
        name: "Tretinoin Cream 0.025% 20 g", brandName: "Tretinoin", form: "CREAM", strength: "0.025%", isCombination: false, type: "MEDICINE",
        costPrice: 98, sellingPrice: 158, mrp: 158, unit: "TUBES", manufacturer: "Sun Pharma", gstRate: 12, hsnCode: "30049099",
        minStockLevel: 5, maxStockLevel: 30, requiresPrescription: true, isControlled: false, status: "ACTIVE",
      });
  },
  sections: [
    {
      title: "Find your way around Inventory",
      who: "Pharmacists, reception, doctors, admins",
      body: [
        "Open <b>Inventory</b> from the menu. The page always opens on <b>Today</b>, a short list of the work waiting for you. The five buttons under the page title switch between the areas. Each area has its own row of tasks. Tasks that do not fit in the row are in the <b>More tasks…</b> list at the end of the row.",
        "The page remembers where you are in its address. If you open a medicine and then press the browser's Back button, you return to the same list with the same filters. The round arrow at the top right reloads everything on the page.",
      ],
      fields: [
        ["Today", "What needs attention now, with a count for each kind of work. See the next sections."],
        ["Purchases", "Supplier bills, payments, supplier credit notes, returns to suppliers and supplier details. See the chapter Inventory: purchases."],
        ["Stock", "The stock list, each medicine's batches and history, approvals, stock counts, losses and holds. This chapter."],
        ["Sales", "Counter sales, quotations and customer returns recorded from Inventory. See the chapter Inventory: reorder and sales."],
        ["Reorder", "The shortbook, purchase orders and the stock levels that trigger reordering. See the chapter Inventory: reorder and sales."],
      ],
      shots: [
        {
          file: "today",
          as: "pharmacist",
          caption: "Inventory opens on Today. (1) the five areas, (2) data quality counters, (3) the two everyday tasks, (4) what needs attention.",
          viewport: { width: 1440, height: 1500 },
          run: async (page, h) => {
            await h.goto(INV);
            await page.getByText("Recent activity").waitFor({ timeout: 30000 });
            await h.mark(page.getByRole("navigation", { name: "Inventory areas" }), 1);
            await h.mark(page.getByRole("region", { name: "Data quality" }), 2);
            await h.mark(page.getByLabel("Everyday inventory tasks"), 3);
            await h.mark(page.getByRole("heading", { name: "What needs attention" }), 4);
          },
        },
      ],
    },
    {
      title: "Check data quality",
      who: "Pharmacists, admins",
      body: [
        "The <b>Data quality</b> row shows five counters. Each counts the batches in stock that are missing a piece of information. A counter with nothing missing is grey with a green dot. A counter that needs work is coloured: red when the gap can stop a correct GST bill or a stock match, amber when it is housekeeping.",
        "Click a counter to open the stock list showing only those batches. The counter stays highlighted. Click it again to show all stock. Fix each batch with <b>Edit item</b> on its page (see <i>Correct the details of a batch</i>).",
      ],
      fields: [
        ["Missing location", "Amber. No rack or shelf is saved, so staff cannot find the batch quickly."],
        ["Missing category", "Amber. No category, so category filters and reports leave it out."],
        ["Missing HSN code", "Red. GST bills need the HSN code."],
        ["Missing min/max", "Amber. No minimum or maximum stock level, so low-stock alerts and reordering cannot work."],
        ["Unmapped", "Red. The batch is not linked to a medicine in the product list, so prescriptions and sales cannot find it."],
      ],
      fieldsHeading: ["Counter", "What it lists"],
      shots: [
        {
          file: "data-quality",
          caption: "After clicking Missing category: the counter is highlighted (1) and the list shows only those batches. The filter also appears as a chip (2); click it to remove the filter.",
          run: async (page, h) => {
            await h.goto(INV);
            await page.getByRole("button", { name: /^Missing category:/ }).click();
            await page.getByRole("status").filter({ hasText: /matching batches/ }).first().waitFor({ timeout: 30000 });
            await page.locator("tbody tr").first().waitFor({ timeout: 30000 });
            await h.settle(500);
            await h.mark(page.getByRole("button", { name: /^Missing category:/ }), 1);
            await h.mark(page.getByLabel("Active filters"), 2);
          },
        },
      ],
    },
    {
      title: "Work through What needs attention",
      who: "Pharmacists, admins, doctors",
      body: [
        "Each row of <b>What needs attention</b> shows a number and a kind of work. Click the row to open exactly those records. Hold the mouse over a row to read a one-line explanation. A row with 0 has nothing waiting. Some rows only appear for people who can act on them.",
        "Above the list are two buttons for the jobs done every day. <b>Scan or enter bill</b> opens supplier bill entry (see the chapter Inventory: purchases). <b>Find or correct stock</b> opens the stock list. Under the list, <b>Check low stock</b>, <b>Check next 3 months’ expiry</b> and <b>Check overdue supplier balances</b> are shortcuts to the same lists as the matching rows. <b>Recent activity</b> lists the latest inventory documents, such as losses, holds and orders. Click one to open it.",
      ],
      fields: [
        ["Price/stock edits awaiting approval", "Price and stock changes sent by staff that a doctor or admin must approve. Opens Stock › Approve corrections."],
        ["Overdue supplier bills", "Supplier bills past their due date, with the total outstanding. Opens Purchases › Payments &amp; dues. Only shown when a bill is overdue."],
        ["Low stock", "Batches whose available quantity is at or below the minimum saved for them. Opens the stock list filtered to Low stock."],
        ["Expiring in the next 3 months", "Batches with stock that expire within three months. Opens the stock list filtered to that expiry window."],
        ["Purchase invoices to review", "Supplier bills entered but not yet added to stock. Opens the purchase bill list filtered to Not posted."],
        ["Original files awaiting intake", "Photos or PDFs of supplier bills that were uploaded but not yet turned into a bill. Opens Scan or enter bill."],
        ["Stock count due today", "Shown to a person on the count rota. The number of items to count today. Opens your count."],
        ["Counts awaiting your approval", "Shown to approvers. Signed-off counts that differ from the system, with the value short and extra. Stock changes only when you approve."],
        ["Batches not counted this cycle", "Shown to whoever sets up counting, when the count cycle is behind. Opens the count settings."],
        ["Credit notes awaited", "Goods returned to a supplier where the supplier's credit note has not arrived yet. Opens Purchases › Returns."],
        ["Orders awaiting receipt", "Approved purchase orders whose goods have not all arrived. Opens Reorder › Purchase orders."],
      ],
      fieldsHeading: ["Row", "What it counts and where it goes"],
      shots: [
        {
          file: "today-admin",
          caption: "Today for an admin. Hold the mouse over a row to see what it counts.",
          viewport: { width: 1440, height: 1450 },
          run: async (page, h) => {
            await h.goto(INV);
            await page.getByText("Recent activity").waitFor({ timeout: 30000 });
            await page.getByRole("button", { name: /Low stock/ }).first().hover();
            await h.settle(800);
          },
        },
      ],
    },
    {
      title: "Find a medicine in the stock list",
      who: "Pharmacists, reception, doctors, admins",
      body: [
        "Open <b>Stock</b>, then <b>Stock list</b>. The list has one row per batch, so a medicine with three batches has three rows. Click <b>Find or correct stock</b> on Today to get here too.",
      ],
      steps: [
        "Type part of a product name, generic name, batch number, barcode or SKU in <b>Search stock</b>. You can also scan a barcode into the box.",
        "Click <b>Search</b> or press Enter. The best matches come first. A row may say <i>Similar spelling</i> when the app corrected a typing mistake, or <i>Matched earlier name</i> when the medicine was renamed.",
        "Use the three buttons <b>All batches</b>, <b>Current / on hand</b> and <b>Previous / depleted</b> to show every batch, only batches with stock, or only empty batches kept for history.",
        "Use <b>Stock level</b> and <b>Expiry</b> to narrow the list, and <b>Sort</b> to change the order.",
        "Click a product name to open its page.",
        "Click <b>Reset</b> to clear the search and every filter.",
      ],
      shots: [
        {
          file: "stock-list",
          as: "pharmacist",
          caption: "The stock list: (1) search, (2) Filters, (3) batch view, (4) stock level and expiry, (5) export. The batches are listed below.",
          viewport: { width: 1440, height: 1250 },
          run: async (page, h) => {
            await stockList(page, h);
            await h.mark(page.getByPlaceholder("Type a product name or scan a barcode"), 1);
            await h.mark(page.getByRole("button", { name: "Filters" }), 2);
            await h.mark(page.getByRole("navigation", { name: "Batch view" }), 3);
            await h.mark(page.getByLabel("Stock level"), 4);
            await h.mark(page.getByRole("button", { name: "Export all matching stock" }), 5);
          },
        },
      ],
      fields: [
        ["Stock level", "<b>Low stock</b> (at or below minimum), <b>Above maximum</b>, <b>Stock on shelf</b> (more than zero), <b>Out of stock</b>, <b>Negative — count needed</b>, <b>Set aside / held</b> and <b>Expired</b>."],
        ["Expiry", "Batches that expire within 1, 2, 3 or 6 months."],
        ["Sort", "<b>Best match</b> (after a search), <b>Product name</b>, <b>Expiry date</b>, <b>Available stock</b> or <b>Purchase price</b>."],
        ["Value of matching batches", "The value of the batches in the list, for current and expired stock: at PTR (the price to retailer you pay), at MRP, at MRP without GST, and at the known landing cost. A note says how many batches have no cost saved."],
        ["Product / batch", "The product name, the pack, and the batch number. Click the name to open the product page."],
        ["Batch state", "A coloured label. See <i>What the colours mean</i> below."],
        ["Expiry", "The expiry date printed on the batch. <i>Unverified</i> means no expiry is saved."],
        ["Available", "Units you can sell now, in the batch's stock unit. Units set aside are shown under it."],
        ["Selling price", "The price charged per stock unit."],
        ["Location", "The rack or shelf. <i>Not assigned</i> if none is saved."],
        ["Edit", "<b>Edit price</b> and <b>Edit stock</b> send a change for approval. See <i>Change a price or a stock quantity</i>."],
      ],
      fieldsHeading: ["Control or column", "What it does"],
      tips: ["The search box also opens documents directly: type or scan the code printed on an inventory document or a purchase bill label to jump to it."],
    },
    {
      title: "What the colours mean",
      who: "Everyone who uses stock",
      body: [
        "Each batch row is tinted, and the same colour appears on its <b>Batch state</b> label. The label always says the state in words, so you never have to rely on the colour alone.",
      ],
      fields: [
        ["Current / on hand (green)", "Stock on the shelf, in date and available. Green means stock is there, not that someone has checked it."],
        ["Held, on hand (amber)", "All the stock in the batch is set aside and cannot be sold. See <i>Block stock from sale</i>."],
        ["On hand, expiry unverified (amber)", "Stock is there but no expiry date is saved. Check the pack and correct the batch."],
        ["Inactive, on hand (amber)", "The item is marked inactive or discontinued but still has stock."],
        ["Expired, on hand (red)", "The batch is past its expiry date and still has stock. Remove it with a loss or a supplier return."],
        ["Negative stock — count needed (red)", "The system shows less than zero. Count the batch to correct it."],
        ["Previous / depleted (grey)", "The batch is empty. It is kept for history."],
      ],
      fieldsHeading: ["Label (colour)", "Meaning"],
      shots: [
        {
          file: "stock-low",
          as: "pharmacist",
          caption: "Stock level set to Low stock. Clindamycin and Minoxidil are at or below their minimum.",
          run: async (page, h) => {
            await stockList(page, h, "&stock=LOW");
          },
        },
      ],
    },
    {
      title: "Use more filters, cost columns and bulk actions",
      who: "Pharmacists, admins",
      body: [
        "Click <b>Filters</b> to show more ways to narrow the list. The choices in each drop-down come from your own stock, so you only see values that exist. Text boxes such as <b>HSN or MISSING</b> accept the word MISSING to list batches where that detail is empty.",
        "Tick <b>Show cost &amp; stock details</b> to add the columns <b>Physical</b> (units on the shelf), <b>Held</b> (units set aside), <b>Stock unit</b>, <b>Purchase cost</b> and <b>MRP</b>.",
        "Tick the box at the start of one or more rows to act on them together. <b>Set location for N selected batches</b> moves them to a new rack or shelf: type the location and a reason, then click <b>Apply reviewed location</b>. Stock does not change. <b>Count selected batches</b> starts a stock count for just those batches. With nothing ticked, the button reads <b>Count matching batches</b> and counts everything the filters show.",
        "The download arrow at the top right saves every matching batch, all pages, as a spreadsheet file (CSV).",
      ],
      fields: [
        ["Category, Subcategory, Product type, Stock unit, Manufacturer, Supplier, Rack / shelf / bin, Item status", "Pick one value from the list."],
        ["Dosage form, Schedule", "Type the form (for example cream) or the drug schedule."],
        ["HSN or MISSING, GST rate or MISSING", "Type a code or rate, or MISSING."],
        ["Minimum / Maximum margin %", "Batches whose margin between cost and selling price is in this range."],
        ["Minimum / Maximum PTR", "Batches whose purchase price is in this range."],
        ["Count history", "<b>Not counted</b>, <b>Counted</b>, <b>Pending</b>, <b>Completed</b> or <b>Blocked</b>."],
        ["Product mapping", "<b>Mapped</b>, <b>Unmapped</b> or <b>Waiting for mapping</b> to a product in the medicine list."],
        ["Missing information", "Lists each missing detail with the number of batches missing it."],
      ],
      fieldsHeading: ["Filter", "How to use it"],
      shots: [
        {
          file: "stock-filters",
          as: "pharmacist",
          caption: "Filters open, cost and stock details shown, and two batches ticked.",
          viewport: { width: 1440, height: 1500 },
          run: async (page, h) => {
            await stockList(page, h);
            await page.getByRole("button", { name: "Filters" }).click();
            await page.getByLabel("Show cost & stock details").check();
            await page.getByRole("checkbox", { name: /^Select Adapalene/ }).check();
            await page.getByRole("checkbox", { name: /^Select Azelaic/ }).check();
            await page.evaluate(() => window.scrollTo(0, 0));
            await h.settle(500);
            await h.mark(page.getByRole("button", { name: /^Set location for/ }), 1);
            await h.mark(page.getByRole("button", { name: /^Count selected batches/ }), 2);
          },
        },
      ],
    },
    {
      title: "Open a medicine's page",
      who: "Pharmacists, doctors, admins",
      body: [
        "Click a product name in the stock list to open its page. The page describes the medicine across all its batches, and keeps the batch you clicked as the <i>opened batch</i>. <b>Back to stock list</b> returns to the list with your filters.",
      ],
      fields: [
        ["1. Name and maker", "The product name, the manufacturer (click it to list everything from that maker), the pack and the stock unit."],
        ["2. Opened batch", "The state label, batch number and expiry of the batch you opened."],
        ["3. Current stock", "Units on the shelf across all batches, how many are held and how many are available. Click it to show the batches."],
        ["4. Edit item, Set stock alert, print", "Correct the batch details, set minimum and maximum levels, or print a shelf label for the opened batch."],
        ["5. Item details", "Item code, standard MRP, GST %, HSN, barcode, category, schedule, location, minimum and maximum quantity and margin. <i>Not set</i> means the detail is missing."],
        ["6. Actions", "<b>Edit stock</b>, <b>Edit price</b>, <b>Blocked stock</b>, <b>Loss &amp; breakage</b>, <b>Supplier returns</b> and <b>Count this batch</b>. Each starts the matching task for this batch."],
        ["7. History tabs", "Batches, Purchases, Purchase returns, Sales, Sales returns, Ledger, Blocked stock and Information."],
      ],
      fieldsHeading: ["Part", "What it shows"],
      shots: [
        {
          file: "item-page",
          caption: "The page for Clindamycin Gel, with its parts numbered.",
          viewport: { width: 1440, height: 1250 },
          run: async (page, h) => {
            await itemPage(page, h, CLINDA);
            await h.mark(page.getByRole("heading", { name: /Clindamycin/ }), 1);
            await h.mark(page.getByText(/^Opened batch/), 2);
            await h.mark(page.getByRole("button", { name: /Current stock/ }), 3);
            await h.mark(page.getByRole("button", { name: "Edit item" }), 4);
            await h.mark(page.getByLabel("Item details"), 5);
            await h.mark(page.getByRole("button", { name: "Count this batch" }), 6);
            await h.mark(page.getByRole("tablist", { name: "Item history" }), 7);
          },
        },
      ],
      tips: [
        "Staff who cannot count stock see a <b>Batch recovery reference</b> box instead of the count button. Copy the reference and send it to a colleague who can count, if the batch looks wrong.",
        "If a batch is linked to more than one product, a box asks you to choose the product printed on the physical pack, give a reason and tick to confirm. This fixes the link without changing stock.",
      ],
    },
    {
      title: "Check the batches of a medicine",
      who: "Pharmacists, admins",
      body: [
        "The <b>Batches</b> tab lists every batch of the medicine, with its quantity and prices. Several batches can be on hand at once; compare expiry dates and sell the earliest first. Tick <b>Hide zero quantity</b> to hide empty batches. The <b>Total</b> row adds up quantity and value.",
        "Each row has buttons. <b>Open</b> switches the page to that batch. <b>Edit</b> corrects that batch's details. The printer prints its shelf label. <b>Delete</b> removes a batch record entirely. It only works for an empty batch with no history. Otherwise the button is greyed out and the reason is written under it, for example <i>Dispose or return remaining stock before deleting a batch</i>. Deleting asks you to confirm and cannot be undone.",
      ],
      fields: [
        ["Qty", "Units in the batch. Held units are shown in brackets."],
        ["MRP", "Maximum retail price per stock unit."],
        ["PTR", "Price to retailer: what the clinic paid per unit, before GST."],
        ["Discount %", "The purchase discount on the supplier bill."],
        ["Landing price", "The real cost per unit after discounts and free goods."],
        ["Margin %", "The difference between cost and selling price, as a percentage."],
        ["Total by MRP / Total by PTR", "Quantity multiplied by MRP or by PTR."],
        ["GST %", "The GST rate charged on sale."],
      ],
      fieldsHeading: ["Column", "Meaning"],
      shots: [
        {
          file: "item-batches",
          caption: "The Batches tab. Delete is greyed out because the batch still has stock, and the reason is shown.",
          run: async (page, h) => {
            await itemPage(page, h, CLINDA);
            const tab = page.getByRole("tabpanel");
            await tab.scrollIntoViewIfNeeded();
            await page.mouse.wheel(0, 450);
            await h.settle(400);
          },
        },
      ],
      warnings: ["Deleting a batch cannot be undone. Use it only for a batch entered by mistake."],
    },
    {
      title: "Correct the details of a batch",
      who: "Pharmacists, admins",
      body: [
        "Use <b>Edit item</b> (or <b>Edit</b> on a batch row) when a detail was entered wrongly: the name, batch number, expiry date, rack, manufacturer, category, HSN, GST rate, barcode or the default dosage used when prescribing. These corrections save straight away and do not change the stock quantity or the selling price.",
        "The window shows <b>Correct saved details</b>. Open <b>More details: tax, stock limits &amp; codes</b> for the less common fields and the <b>Availability</b> choice (Active, Inactive or Discontinued). As you type, a before-and-after list shows exactly what will change.",
      ],
      steps: [
        "Open the medicine and click <b>Edit item</b>.",
        "Change the details. Check them against the pack or the original bill.",
        "Type the reason in <b>Why are you changing it?</b>.",
        "Click <b>Save corrected details</b>. The page says <i>Corrected details saved. Stock quantity unchanged.</i>",
      ],
      shots: [
        {
          file: "item-edit",
          as: "pharmacist",
          caption: "Correcting Clindamycin Gel: the category is added and the before-and-after list shows the change.",
          viewport: { width: 1440, height: 1000 },
          run: async (page, h) => {
            await itemPage(page, h, CLINDA);
            await page.getByRole("button", { name: "Edit item" }).click();
            const form = page.getByRole("form", { name: "Edit product details" });
            await form.waitFor();
            await form.getByText("More details: tax, stock limits & codes").click();
            await form.getByLabel("Category", { exact: true }).fill("Topical antibiotic");
            await form.getByLabel("Why are you changing it?").fill("Category was missing; checked the carton");
            await h.settle(400);
            await form.getByText("Check your changes").scrollIntoViewIfNeeded();
            await page.mouse.wheel(0, 250);
          },
          after: async (page, h) => {
            await page.getByRole("button", { name: "Save corrected details" }).click();
            await page.getByText("Corrected details saved").waitFor({ timeout: 15000 });
          },
        },
      ],
      tips: ["If you leave the page before saving, your typing is kept. When you come back the page says <i>Restored unsaved product details</i>."],
    },
    {
      title: "Set minimum, maximum and reorder levels",
      who: "Pharmacists, admins",
      body: [
        "The low-stock alert, the Low stock filter and reordering all use three numbers saved on each batch. Set them when you add a new medicine, and review them when demand changes.",
      ],
      steps: [
        "Open the medicine and click <b>Set stock alert</b>. The details window opens with the stock limits shown.",
        "Fill in <b>Minimum stock</b>, <b>Maximum stock</b> and <b>Reorder at</b>.",
        "Type the reason, then click <b>Save corrected details</b>.",
      ],
      fields: [
        ["Minimum stock", "When available stock falls to this number or below, the batch counts as low stock."],
        ["Maximum stock", "The most you want on the shelf. Stock above it shows under <b>Above maximum</b>."],
        ["Reorder at", "The level at which the item is added to the shortbook for reordering."],
      ],
      shots: [
        {
          file: "item-stock-alert",
          as: "pharmacist",
          caption: "Set stock alert opens the stock limits.",
          run: async (page, h) => {
            await itemPage(page, h, MINOX);
            await page.getByRole("button", { name: "Set stock alert" }).click();
            const form = page.getByRole("form", { name: "Edit product details" });
            await form.getByLabel("Minimum stock").fill("12");
            await form.getByLabel("Why are you changing it?").fill("Higher demand from hair clinic patients");
            await h.settle(400);
            await form.getByText("Check your changes").scrollIntoViewIfNeeded();
            await page.mouse.wheel(0, 250);
          },
          after: async (page) => {
            await page.getByRole("button", { name: "Cancel" }).click();
          },
        },
      ],
      tips: ["Reorder levels for many items at once are easier to set under Reorder › Manual targets &amp; exclusions."],
    },
    {
      title: "Change a price or a stock quantity",
      who: "Pharmacists (doctors and admins approve)",
      body: [
        "A change to a selling price or to the number of units on the shelf needs a second person. The pharmacist proposes it with a reason, and a doctor or admin approves it. Until then nothing changes.",
        "Use <b>Edit stock</b> when you counted a single batch and the shelf does not match. Enter the number you counted, including any units set aside. For a full shelf check use a stock count instead.",
      ],
      steps: [
        "In the stock list, or on the medicine's page, click <b>Edit price</b> or <b>Edit stock</b>.",
        "Type the new selling price, or the number of units you counted on the shelf. A box shows the old and new value.",
        "Type the reason in <b>Why are you changing it?</b>.",
        "Click <b>Submit for approval</b>. The page says <i>Submitted for doctor or admin approval</i>, with a link to the approval queue.",
      ],
      shots: [
        {
          file: "edit-price",
          as: "pharmacist",
          caption: "Edit price for Clindamycin Gel, ready to submit.",
          run: async (page, h) => {
            await itemPage(page, h, CLINDA);
            await page.getByRole("button", { name: "Edit price" }).click();
            const dialog = page.getByRole("dialog");
            await dialog.getByRole("spinbutton").fill("175");
            await dialog.getByLabel("Why are you changing it?").fill("New MRP ₹175 printed on the latest batch from Cipla");
            await h.settle(300);
          },
          target: '[role="dialog"]',
          narrow: true,
          after: async (page) => {
            await page.getByRole("dialog").getByRole("button", { name: "Submit for approval" }).click();
            await page.getByText("Submitted for doctor or admin approval.").waitFor({ timeout: 15000 });
          },
        },
        {
          file: "edit-stock",
          as: "pharmacist",
          caption: "Edit stock from the stock list: 9 bottles on the system, 8 on the shelf.",
          run: async (page, h) => {
            await stockList(page, h, "&search=Minoxidil");
            await page.getByRole("button", { name: "Edit stock" }).first().click();
            const dialog = page.getByRole("dialog");
            await dialog.getByRole("spinbutton").fill("8");
            await dialog.getByLabel("Why are you changing it?").fill("Counted 8 bottles on rack E-01; one bottle missing");
            await h.settle(300);
          },
          target: '[role="dialog"]',
          narrow: true,
          after: async (page) => {
            await page.getByRole("dialog").getByRole("button", { name: "Submit for approval" }).click();
            await page.getByText("Submitted for doctor or admin approval.").waitFor({ timeout: 15000 });
          },
        },
      ],
      shotLayout: "row",
    },
    {
      title: "Approve or reject price and stock changes",
      who: "Doctors, admins",
      body: [
        "Open <b>Stock</b>, then <b>Approve corrections</b>. The task shows a count in brackets when new medicines are waiting. It has two tabs: <b>Price / stock</b> for changes to existing batches, and <b>New items</b> for medicines staff asked to add. Today also shows <b>Price/stock edits awaiting approval</b> with the count.",
        "Each request in the <b>Price / stock approval queue</b> shows the medicine and batch, the old and new value, who asked and their reason. Pharmacists see the same queue so they can follow their requests, but only doctors and admins see the <b>Approve</b> and <b>Reject</b> buttons.",
      ],
      steps: [
        "Read the reason and the old and new values.",
        "Click <b>Approve</b> or <b>Reject</b>.",
        "Type a <b>Review note</b> if you want to explain the decision. It is optional.",
        "Click <b>Approve</b> or <b>Reject</b> in the window. An approved change updates the batch at once and is recorded in its ledger as <i>Approved stock edit</i>.",
      ],
      shots: [
        {
          file: "approval-queue",
          caption: "The price and stock approval queue, with the two requests sent by the pharmacist.",
          run: async (page, h) => {
            await h.goto(`${INV}?area=stock&view=approvals`);
            await page.getByRole("tab", { name: "Price / stock" }).click();
            await page.getByText(/pending request/).waitFor({ timeout: 30000 });
            await h.settle(500);
          },
        },
        {
          file: "approval-dialog",
          caption: "Approving the price change, with a review note.",
          run: async (page, h) => {
            await h.goto(`${INV}?area=stock&view=approvals`);
            await page.getByRole("tab", { name: "Price / stock" }).click();
            await page.getByText(/pending request/).waitFor({ timeout: 30000 });
            const row = page.locator("li, article, tr, div").filter({ hasText: /Clindamycin/ }).filter({ has: page.getByRole("button", { name: "Approve", exact: true }) }).last();
            await row.getByRole("button", { name: "Approve", exact: true }).click();
            await page.getByRole("dialog").getByPlaceholder("Optional note").fill("Matches the new Cipla price list");
            await h.settle(300);
          },
          target: '[role="dialog"]',
          narrow: true,
          after: async (page, h) => {
            await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
            await h.settle(1500);
            const left = page.getByRole("button", { name: "Approve", exact: true });
            if (await visible(left, 3000)) {
              await left.first().click();
              await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
              await h.settle(1500);
            }
          },
        },
      ],
      shotLayout: "row",
      tips: ["If the batch changed after the request was sent, for example because a sale was made, the app refuses to apply an out-of-date stock request. Ask for a fresh request."],
    },
    {
      title: "Approve new medicines added by staff",
      who: "Doctors approve; pharmacists and reception request",
      body: [
        "When a pharmacist or receptionist adds a new medicine with <b>Add batch</b> on the stock list, it does not enter stock straight away. The window says <i>Sent to doctor for approval</i>. If a similar medicine already exists, the request carries a warning so the doctor can spot a duplicate.",
        "The doctor opens <b>Stock › Approve corrections</b>, then the <b>New items</b> tab. The tab shows a red count when requests are waiting. Each request shows the medicine details and who asked. Click <b>Approve</b> to add it to inventory, or <b>Reject</b> and give a note such as <i>Duplicate of an existing 120 ml pack</i>. <b>History</b> lists requests already decided.",
      ],
      shots: [
        {
          file: "add-item",
          as: "pharmacist",
          caption: "Add batch opens Add Inventory Item. Fields marked * are required.",
          run: async (page, h) => {
            await stockList(page, h);
            await page.getByRole("button", { name: "Add batch" }).click();
            await page.getByRole("dialog").getByText("Basic Information").waitFor();
            await h.settle(400);
          },
          target: '[role="dialog"]',
          narrow: true,
          after: async (page) => { await page.keyboard.press("Escape"); },
        },
        {
          file: "new-items",
          as: "doctor",
          caption: "The New items tab: a pharmacist's request to add Tretinoin cream.",
          run: async (page, h) => {
            await h.goto(`${INV}?area=stock&view=approvals`);
            await page.getByRole("tab", { name: /New items/ }).click();
            await page.getByText(/Tretinoin/).first().waitFor({ timeout: 30000 }).catch(() => {});
            await h.settle(500);
          },
        },
      ],
      shotLayout: "row",
      fields: [
        ["Basic Information", "Item Name, Type (Medicine, Consumable, Equipment or Supply), the medicine's form and strength, generic and brand name, manufacturer, category."],
        ["Pricing", "Cost Price, Selling Price, MRP and GST rate. Cost and selling price are required."],
        ["Unit &amp; Packaging", "The stock unit (pieces, tubes, strips, bottles and so on), pack size and pack unit."],
        ["Stock Levels", "Min Stock, Max Stock, Reorder Level and Reorder Qty."],
        ["Identification", "Batch number, expiry date, HSN code, barcode, SKU and item code."],
        ["Additional Details", "Storage location and conditions, supplier, and whether it needs a prescription or is a controlled drug."],
      ],
      fieldsHeading: ["Part of the form", "What to fill in"],
    },
    {
      title: "Read a medicine's history",
      who: "Pharmacists, doctors, admins",
      body: [
        "The tabs on a medicine's page show everything that happened to it, across all its batches. The chosen tab is kept in the page address, so you can share it or come back to it.",
        "The <b>Ledger</b> tab is the full record of stock in and out. At the top a label says whether the ledger agrees with the stock on hand: <i>Ledger matches stock on hand</i> (green), <i>Matches only after unrecorded changes</i> or <i>Ledger does not match</i> (amber). An amber box lists any batch where the two disagree. Rows where stock changed without a record are tinted amber with a note. Use <b>From</b>, <b>To</b> and <b>Type</b> (Sale, Purchase, Return, Adjustment) to filter, and <b>Download CSV</b> to save the rows you see.",
      ],
      fields: [
        ["Batches", "Every batch with quantity and prices. See <i>Check the batches of a medicine</i>."],
        ["Purchases", "The supplier bills that brought this medicine in, with bill number, supplier, date, amount and status. Click one to open the bill."],
        ["Purchase returns", "Returns of this medicine to a supplier."],
        ["Sales", "Every sale of this medicine, taken from the ledger."],
        ["Sales returns", "Medicine returned by customers."],
        ["Ledger", "Every movement: bill or document number, date and time, type, batch, in, out, batch and item balance after the movement, customer or distributor, and who did it."],
        ["Blocked stock", "Holds placed on this medicine, how many units are still held, and why."],
        ["Information", "Category, manufacturer, HSN, GST, barcode, SKU and a list of missing details."],
      ],
      fieldsHeading: ["Tab", "What it shows"],
      shots: [
        {
          file: "item-ledger",
          caption: "The Ledger tab for Minoxidil after the approved stock change.",
          viewport: { width: 1440, height: 1250 },
          run: async (page, h) => {
            await itemPage(page, h, MINOX, "ledger");
            await page.getByText(/^Showing \d+ of \d+ entries/).waitFor({ timeout: 30000 });
            await page.getByRole("tablist", { name: "Item history" }).scrollIntoViewIfNeeded();
            await h.settle(300);
          },
        },
      ],
      after: [
        "Doctors and admins also see an <b>Action</b> on each ledger row. <b>Correct</b> lets them post a linked correction: type the correct signed quantity and a reason, then click <b>Post linked correction</b>. The original movement stays in the record and the correction is a separate document (see <i>Corrections</i>). When the movement belongs to a purchase bill, a sale or another document, the button opens that document instead, because the fix belongs there.",
      ],
    },
    {
      title: "Find slow-moving stock to return or use up",
      who: "Pharmacists, admins",
      body: [
        "<b>Stock › Stock optimization</b> looks for stock that has not sold for a long time. Stock bought from a distributor in the last year can usually go back to them, so the app groups it by distributor and can start a return draft. Older stock stays in the second list with its remaining shelf life, so you can discount it or use it in the clinic first.",
        "Two rules decide what counts as slow. <b>Non-moving days</b> flags stock not sold for that many days. <b>Minimum batch value (₹)</b> leaves out batches worth so little that returning them costs more than it recovers. Change them and click <b>Save rules</b>.",
      ],
      steps: [
        "Click <b>Run optimization</b>. The app checks every batch on the shelf against its sales and purchase bills.",
        "Read the <b>returnable</b> groups. Each distributor shows its batches, how long since each last sold, shelf life left and value.",
        "To send stock back, use the group's button to create a return draft. It opens in Purchases › Returns, where you finish and post it (see the chapter Inventory: purchases).",
        "Batches already on an open return show that return's reference instead.",
      ],
      shots: [
        {
          file: "optimize",
          as: "pharmacist",
          caption: "Stock optimization after a run.",
          viewport: { width: 1440, height: 1300 },
          run: async (page, h) => {
            await h.goto(`${INV}?area=stock&view=optimize`);
            await page.getByRole("button", { name: "Run optimization" }).click();
            await h.settle(3000);
          },
        },
      ],
      tips: ["If the run finds nothing, no batch passed both rules. Lower Non-moving days to look further."],
    },
    {
      title: "Set up the stock count cycle",
      who: "Admins, owners, doctors",
      body: [
        "Stock counts check the shelves against the system a few items at a time, so that every batch is counted once in each cycle without closing the pharmacy. The app gives each counter a short list every day.",
        "Open <b>Stock › Stock counts</b> and the <b>Settings</b> tab.",
      ],
      steps: [
        "Turn on <b>Stock reconciliation is off</b>. The label changes to <i>on</i>.",
        "Set <b>Cycle length (days)</b>: every batch in stock is counted once in this many days.",
        "Set <b>Items per person per day</b>.",
        "Tick the <b>People who count</b>.",
        "Read the summary. It says whether the people and numbers you chose cover all batches in the cycle, and warns that saving starts a new cycle today.",
        "Click <b>Save settings</b>. <b>Undo changes</b> puts back the saved settings. The <b>Current cycle</b> box then shows the cycle dates, the day number and how many batches are counted so far.",
      ],
      shots: [
        {
          file: "count-settings",
          caption: "Count settings: one pharmacist counts 3 items a day over a 10-day cycle.",
          viewport: { width: 1440, height: 1100 },
          run: async (page, h) => {
            await h.goto(`${COUNTS}&tab=settings`);
            const toggle = page.getByRole("switch", { name: /Stock reconciliation is/ });
            await toggle.waitFor({ timeout: 30000 });
            if ((await toggle.getAttribute("aria-checked")) !== "true") {
              await toggle.click();
              await page.getByLabel("Items per person per day").fill("3");
              await page.getByLabel(/^Anil Deshmukh/).check();
              await page.getByRole("button", { name: "Save settings" }).click();
              await page.getByText("Current cycle").first().waitFor({ timeout: 20000 });
            }
            await h.settle(800);
          },
        },
      ],
      tips: ["Turning reconciliation on, or changing the cycle length, starts a new cycle. Batches counted in the old cycle will be counted again."],
    },
    {
      title: "Count the shelves and sign off",
      who: "Pharmacists and others on the count rota",
      body: [
        "When you have items to count, Today shows <b>Stock count due today</b>. Click it, or open <b>Stock › Stock counts › My counts</b>. Each count shows when it is due and how many items are left.",
      ],
      steps: [
        "Click <b>Start counting</b> (or <b>Continue counting</b>).",
        "Go to each location shown and count what is on the shelf. Type the number in <b>Counted</b>. Enter 0 when a batch is not there. The <b>Difference</b> column fills in by itself. Your numbers save as you type.",
        "Click <b>+ Note</b> to explain a difference on that line.",
        "When every line is counted, click <b>Sign off count</b>.",
        "If anything differs, the window lists the batches that differ. Type why in <b>Why do these differ? (required)</b> and click <b>Sign off and send for approval</b>. If everything matched, click <b>Sign off</b>: stock is confirmed without a change.",
      ],
      shots: [
        {
          file: "count-due",
          as: "pharmacist",
          caption: "Today shows the count due.",
          run: async (page, h) => {
            await h.goto(INV);
            await page.getByText("Recent activity").waitFor({ timeout: 30000 });
            await h.mark(page.getByRole("button", { name: /Stock count due today/ }), 1);
          },
        },
        {
          file: "count-sheet",
          as: "pharmacist",
          caption: "The counting sheet. One tube of Azelaic Acid Cream is short.",
          run: async (page, h) => {
            await h.goto(COUNTS);
            const start = page.getByRole("button", { name: /^(Start|Continue) counting:/ });
            if (await visible(start, 15000)) {
              await start.first().click();
              const boxes = page.getByRole("textbox", { name: /^Counted quantity of/ });
              await boxes.first().waitFor({ timeout: 30000 });
              const rows = page.getByRole("listitem").filter({ has: boxes });
              for (let i = 0; i < (await boxes.count()); i++) {
                const system = Number((await rows.nth(i).locator("span.tabular-nums").first().innerText()).replace(/\D/g, ""));
                await boxes.nth(i).fill(String(i === 1 ? system - 1 : system));
              }
              await h.settle(1500);
            }
          },
        },
        {
          file: "count-signoff",
          as: "pharmacist",
          caption: "Signing off: the difference needs a reason.",
          run: async (page, h) => {
            const sign = page.getByRole("button", { name: "Sign off count" });
            if (!(await visible(sign, 3000))) return;
            await sign.click();
            const dialog = page.getByRole("dialog", { name: "Sign off this count" });
            await dialog.getByLabel("Why do these differ? (required)").fill("One Azelaic tube found crushed behind the rack and binned");
            await h.settle(300);
          },
          target: '[role="dialog"]',
          narrow: true,
          after: async (page, h) => {
            const dialog = page.getByRole("dialog", { name: "Sign off this count" });
            if (await visible(dialog, 1000)) {
              await dialog.getByRole("button", { name: "Sign off and send for approval" }).click();
              await page.getByText(/^Signed by/).waitFor({ timeout: 20000 });
            }
          },
        },
      ],
      shotLayout: "row",
    },
    {
      title: "Approve or reject a stock count",
      who: "Doctors, admins, owners",
      body: [
        "A signed count that differs from the system waits for approval. Today shows <b>Counts awaiting your approval</b> with the value short and extra. Open <b>Stock › Stock counts › Approvals</b> and click a count. The record lists the differing batches first, and its header shows the items, how many differ, and the value short and extra.",
        "<b>Approve and adjust stock</b> opens a window listing each stock change and the total change in stock value. The reason is filled in with who signed the count and when. Each difference is applied to today's stock, so sales made since the count are kept. <b>Reject</b> asks why, so the next count can fix it; those batches will be counted again.",
        "Nobody approves their own count. If you signed it, the record names who can decide it. Only when no other approver is active in the branch can you decide it yourself, after ticking a box that is recorded.",
      ],
      shots: [
        {
          file: "count-approvals",
          caption: "Counts waiting for approval.",
          run: async (page, h) => {
            await h.goto(`${COUNTS}&tab=approvals`);
            await h.settle(1500);
          },
        },
        {
          file: "count-approve",
          caption: "Approve and adjust stock: the change to each batch and to stock value.",
          run: async (page, h) => {
            const row = page.locator('table[aria-label="Counts awaiting approval"] tbody tr').first();
            if (!(await visible(row, 3000))) return;
            await row.click();
            await page.getByRole("button", { name: "Approve and adjust stock" }).click();
            await page.getByRole("dialog", { name: "Approve and adjust stock" }).waitFor();
            await h.settle(400);
          },
          target: '[role="dialog"]',
          narrow: true,
          after: async (page, h) => {
            const dialog = page.getByRole("dialog", { name: "Approve and adjust stock" });
            if (await visible(dialog, 1000)) {
              await dialog.getByRole("button", { name: "Approve and adjust stock" }).click();
              await page.getByText(/^Approved by/).waitFor({ timeout: 20000 });
            }
          },
        },
        {
          file: "count-approved",
          caption: "The approved count record.",
          run: async (page, h) => {
            await h.settle(800);
          },
        },
      ],
      shotLayout: "row",
    },
    {
      title: "Count an item or a shelf on demand",
      who: "Pharmacists, admins",
      body: [
        "When something looks wrong outside the cycle, count it now. Click <b>Count an item</b> on the Stock counts page (or <b>Count this batch</b> on a medicine's page). You count and sign it off; any difference goes for approval as usual.",
      ],
      steps: [
        "Click <b>Count an item</b>.",
        "Type a medicine name, batch or rack in <b>Find a batch</b>, or choose a whole shelf.",
        "Tick the batches to count.",
        "Click <b>Count N batch</b>. The counting sheet opens.",
      ],
      shots: [
        {
          file: "count-item",
          as: "pharmacist",
          caption: "Count an item or a shelf.",
          run: async (page, h) => {
            await h.goto(COUNTS);
            await page.getByRole("button", { name: "Count an item" }).click();
            const dialog = page.getByRole("dialog", { name: "Count an item or a shelf" });
            await dialog.getByLabel("Find a batch").fill("Ketoconazole");
            await dialog.getByRole("checkbox").first().waitFor({ timeout: 30000 });
            await dialog.getByRole("checkbox").first().check();
            await h.settle(400);
          },
          target: '[role="dialog"]',
          narrow: true,
          after: async (page) => { await page.keyboard.press("Escape"); },
        },
      ],
    },
    {
      title: "Look up past counts",
      who: "Pharmacists, admins",
      body: [
        "The <b>History</b> tab lists every count: who counted, when, how many items, how many differed, and whether it was confirmed, approved or rejected. Search by item, batch or person, and filter by <b>Person</b> and <b>Status</b>. Click a count to open its record.",
      ],
      shots: [
        {
          file: "count-history",
          caption: "Stock count history.",
          run: async (page, h) => {
            await h.goto(`${COUNTS}&tab=history`);
            await h.settle(1500);
          },
        },
      ],
    },
    {
      title: "Record loss or breakage",
      who: "Pharmacists",
      body: [
        "Use a loss when stock is damaged, broken, expired and thrown away, or lost. It removes the units from stock with a reason. Find it under <b>More tasks… › Loss &amp; breakage</b>, which lists past losses, or start one from the medicine's page with <b>Loss &amp; breakage</b>.",
      ],
      steps: [
        "Open the medicine and click <b>Loss &amp; breakage</b>. A draft opens with that batch already added. To start from the list, click <b>New document</b> and add batches with <b>Add a batch</b>.",
        "Check <b>Date</b> and <b>Stock source</b>: <b>Available stock (no hold)</b>, or held stock if the units were set aside first.",
        "Type the reason in <b>Reason / notes</b>.",
        "Enter the <b>Quantity</b> lost on each line.",
        "Click <b>Post stock loss</b>. To finish later, click <b>Save draft</b>; a draft does not change stock.",
      ],
      shots: [
        {
          file: "loss",
          as: "pharmacist",
          caption: "A posted loss. The confirmed stock effect shows one tube removed.",
          viewport: { width: 1440, height: 1400 },
          run: async (page, h) => {
            await itemPage(page, h, CLINDA);
            await page.getByRole("button", { name: "Loss & breakage" }).click();
            await page.getByPlaceholder("Required before posting").fill("Tube split at the seam during shelf check");
            await page.getByLabel("quantity 1", { exact: true }).fill("1");
            await page.getByRole("button", { name: "Post stock loss" }).click();
            await page.getByText("Confirmed stock effects").waitFor({ timeout: 20000 });
            await h.settle(500);
          },
        },
      ],
      warnings: ["Posting removes the units from stock. A wrong loss can only be undone by a doctor or admin with <b>Correct by reversal</b> on the document."],
      fields: [
        ["Draft • no stock change", "Saved but not posted. Stock is unchanged."],
        ["Awaiting manager approval", "Sent for a manager's approval. A doctor or admin sees <b>Approve document</b> and <b>Reject proposal</b>."],
        ["Approved • ready for next step", "Approved, waiting to be posted or received."],
        ["Posted", "Stock has changed."],
        ["Released", "A hold whose units are back in available stock."],
        ["Reversed", "Undone by a correcting entry. The original stays in history."],
        ["Cancelled / Rejected", "Stopped before it changed stock."],
      ],
      fieldsHeading: ["Document status", "Meaning"],
      after: [
        "Every inventory document (losses, holds, corrections, opening stock, returns, orders, sales) shows a box at the top explaining its status and what to do next, the lines, the <b>Confirmed stock effects</b> once posted, and a <b>Document history</b> with each change and who made it. <b>View recorded changes</b> shows what changed at each step. <b>Cancel document</b> stops a draft. The list for each kind of document has filters for <b>Status</b>, <b>Reference</b>, <b>From date</b> and <b>To date</b>, with <b>Previous</b> and <b>Next</b> for more pages.",
      ],
    },
    {
      title: "Block stock from sale",
      who: "Pharmacists",
      body: [
        "A hold keeps units in physical stock but stops them being sold, for example while you wait for a recall notice or a supplier's decision on a damaged carton. Start it from the medicine's page with <b>Blocked stock</b>, or from <b>More tasks… › Blocked stock</b> with <b>New document</b>.",
      ],
      steps: [
        "Enter the reason and the quantity to hold on each line.",
        "Click <b>Block stock</b>. The units are now shown as held, and the batch's available stock drops.",
        "When the matter is settled, open the hold and click <b>Release held stock</b> to make the units available again. To remove them instead, record a loss or supplier return from held stock.",
      ],
      shots: [
        {
          file: "hold",
          as: "pharmacist",
          caption: "Two bottles of Ketoconazole Shampoo held. Release held stock puts them back.",
          viewport: { width: 1440, height: 1300 },
          run: async (page, h) => {
            await itemPage(page, h, "guide-ketoconazole-shampoo-2-100-ml");
            await page.getByRole("button", { name: "Blocked stock" }).first().click();
            await page.getByPlaceholder("Required before posting").fill("Seal looks broken on two bottles; asked Dr. Reddy's rep to inspect");
            await page.getByLabel("quantity 1", { exact: true }).fill("2");
            await page.getByRole("button", { name: "Block stock" }).click();
            await page.getByText("Confirmed stock effects").waitFor({ timeout: 20000 });
            await h.settle(500);
            await h.mark(page.getByRole("button", { name: "Release held stock" }), 1);
          },
        },
      ],
    },
    {
      title: "Corrections",
      who: "Doctors, admins",
      body: [
        "<b>More tasks… › Corrections</b> lists linked corrections. A correction fixes a stock movement that was recorded with the wrong quantity, while keeping the original movement and a reason. You do not start one from this list. Start it from the <b>Ledger</b> tab of a medicine with <b>Correct</b> on the wrong row (see <i>Read a medicine's history</i>). A posted inventory document is corrected with <b>Correct by reversal</b> on the document itself.",
      ],
      shots: [
        {
          file: "corrections",
          caption: "The Corrections list.",
          run: async (page, h) => {
            await h.goto(`${INV}?area=stock&view=CORRECTION`);
            await h.settle(1000);
          },
        },
      ],
    },
    {
      title: "Enter opening stock",
      who: "Pharmacists, admins",
      body: [
        "Opening stock is the stock already on the shelf when the clinic starts using the app, or a batch found with no purchase record. It sets the starting balance of a batch with no earlier movements. It creates no amount owed to a supplier.",
        "For a few batches use <b>More tasks… › Manual opening stock</b>, click <b>New document</b>, add each batch with its quantity and rate, and click <b>Post opening stock</b>.",
        "For a whole pharmacy use <b>More tasks… › Opening stock import</b>. Click <b>Choose Excel</b> or drop an .xlsx or .xls file (up to 5 MB and 1,000 rows) on the box, then click <b>Preview import</b> and check the rows before importing. <b>Excel columns and format</b> lists the columns the file needs.",
      ],
      shots: [
        {
          file: "opening-manual",
          as: "pharmacist",
          caption: "A new manual opening stock entry.",
          run: async (page, h) => {
            await h.goto(`${INV}?area=stock&view=OPENING_STOCK`);
            await page.getByRole("button", { name: "New document" }).click();
            await page.getByRole("button", { name: "Post opening stock" }).waitFor({ timeout: 20000 });
            await h.settle(500);
          },
        },
        {
          file: "opening-import",
          caption: "Opening stock import from Excel.",
          run: async (page, h) => {
            await h.goto(`${INV}?area=stock&view=opening`);
            await page.getByText("Excel columns and format").click();
            await h.settle(500);
          },
        },
      ],
      shotLayout: "row",
    },
    {
      title: "See every stock movement in the stock ledger",
      who: "Pharmacists, admins",
      body: [
        "<b>Stock › Stock ledger</b> lists every change to stock across all medicines: purchases, sales, returns, losses, holds, counts and approved edits. Use it to answer questions such as <i>what left the shelf yesterday?</i>",
        "Set <b>From</b> and <b>To</b>, or click <b>Today</b>, <b>7 days</b>, <b>30 days</b> or <b>90 days</b>. Type in <b>Search</b> to find a medicine or document. <b>Method</b> narrows to one kind of movement, such as Purchase invoice, Pharmacy bill, Supplier return, Loss or breakage, Stock count or Approved stock edit. <b>All</b>, <b>Stock in</b> and <b>Stock out</b> choose the direction. <b>Export CSV</b> saves the rows. Click a medicine or document in a row to open it.",
      ],
      shots: [
        {
          file: "stock-ledger",
          caption: "The stock ledger for the last 30 days.",
          run: async (page, h) => {
            await h.goto(`${INV}?area=stock&view=ledger`);
            await page.getByRole("button", { name: "30 days" }).click();
            await h.settle(1500);
          },
        },
      ],
    },
  ],
};
