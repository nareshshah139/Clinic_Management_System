// Inventory: the Reorder area (shortbook, purchase orders, targets) and the Sales area.
const INV = "/dashboard/inventory";
const REORDER = (view) => `${INV}?area=reorder&view=${view}`;
const SALES = (view) => `${INV}?area=sales&view=${view}`;
const PO_REF = "PO-GUIDE-0143";
const SALE_REF = "CS-GUIDE-0001";
const RETURN_REF = "SR-GUIDE-0001";
const SUN = "Sunscreen SPF 50 Lotion 50 ml";

const visible = async (locator, ms = 3000) => locator.first().waitFor({ timeout: ms }).then(() => true, () => false);
const open = async (page, h, route, heading) => {
  await h.goto(route);
  await page.getByRole("heading", { name: heading, exact: true }).first().waitFor({ timeout: 30000 });
  await h.settle(1200);
};
const surface = (page) => page.locator("main.inventory-surface");
// A list row of a document register, found by its reference.
const docRow = (page, ref) => page.getByRole("button", { name: new RegExp(`^${ref}`) });
const docExists = async (page, h, route, heading, ref) => {
  await open(page, h, route, heading);
  return visible(docRow(page, ref), 4000);
};
const poPage = async (page, h) => {
  await open(page, h, REORDER("PURCHASE_ORDER"), "Purchase orders");
  await docRow(page, PO_REF).click();
  await page.getByRole("heading", { name: PO_REF }).or(page.getByText("Document history")).first().waitFor({ timeout: 30000 });
  await h.settle(800);
};
const fillLine = async (page, search, pick) => {
  await page.getByPlaceholder("Search product, batch, barcode or SKU").fill(search);
  await page.getByRole("button", { name: pick }).first().click();
  await page.getByLabel("quantity 1", { exact: true }).waitFor({ timeout: 15000 });
};

// Saved levels flip between two sets so a second run still has a real change to review.
const levelsFor = async (page) => ((await visible(page.getByText("14 / 84 / 28", { exact: true }), 1500)) ? ["12", "72", "24"] : ["14", "84", "28"]);

let poExisted = false;
let saleExisted = false;
let returnExisted = false;

module.exports = {
  id: "14-inventory-reorder-sales",
  title: "Inventory: reorder and sales",
  intro:
    "This chapter covers two areas of the <b>Inventory</b> page. <b>Reorder</b> is where the pharmacy decides what to buy: it lists what is running short (the shortbook), turns shortages into purchase orders, and keeps the minimum and maximum stock level of every medicine. <b>Sales</b> is where counter sales, quotations and customer returns are recorded against exact batches. Pharmacists do most of this work. Approving a purchase order or saving target levels is done by a manager (an admin or the owner).",
  sections: [
    {
      title: "How reordering works: minimum, maximum and reorder level",
      who: "Pharmacists, admins",
      body: [
        "Every medicine can have three numbers, all counted in the medicine's own stock unit (for example tubes or tablets). They drive every screen in the <b>Reorder</b> area.",
        "When a medicine's available stock falls to its minimum, it counts as a shortage. The shortbook (next section) lists it with the quantity needed to get back up to the maximum. For example, Clindamycin Gel has a minimum of 10 and a maximum of 60. If only 4 tubes are left, the shortbook asks for 56.",
        "The app does not buy anything on its own. Each step produces a draft, and a person checks it before any order is sent: the shortbook makes draft requests, a pharmacist turns a request into a purchase order, and a manager approves it. Target proposals work the same way. The app looks at what the pharmacy sold in the last weeks and suggests new minimum and maximum levels. A manager accepts or rejects each suggestion.",
        "The <b>Reorder</b> area has six views. <b>Shortbook</b>, <b>Purchase orders</b> and <b>Target proposals</b> are always in the row. <b>Manual targets &amp; exclusions</b>, <b>Automation settings</b> and <b>Monitor</b> are in the <b>More tasks…</b> list.",
      ],
      fields: [
        ["Minimum", "The lowest stock you are happy to hold. At or below this number the medicine is a shortage."],
        ["Maximum", "The most you want on the shelf. A shortage is topped up to this number."],
        ["Reorder level", "The stock level at which the pharmacy should reorder. You can set it above the minimum to leave time for delivery. Leave it blank if you do not use it."],
        ["Available", "Stock you can sell now, not counting blocked or expired batches."],
        ["Stock unit", "The unit the three numbers are counted in, shown beside each medicine (for example PIECES)."],
      ],
      fieldsHeading: ["Term", "What it means"],
      shots: [
        {
          file: "reorder-views",
          as: "pharmacist",
          caption: "The Reorder area. (1) the six views: the first three are buttons and the rest are in More tasks. (2) the page title and what it lists.",
          viewport: { width: 1440, height: 760 },
          run: async (page, h) => {
            await open(page, h, REORDER("SHORTBOOK"), "Shortbook");
            await page.getByLabel("More inventory tasks").selectOption({ label: "Manual targets & exclusions" }).catch(() => {});
            await open(page, h, REORDER("SHORTBOOK"), "Shortbook");
            await h.mark(page.getByRole("navigation", { name: /Inventory tasks|Reorder/i }).first(), 1).catch(() => {});
            await h.mark(page.getByLabel("More inventory tasks"), 1);
            await h.mark(page.getByRole("heading", { name: "Shortbook", exact: true }), 2);
          },
        },
      ],
    },
    {
      title: "Find what is running short with the shortbook",
      who: "Pharmacists",
      body: [
        "The shortbook is the pharmacy's list of things to buy. Open <b>Reorder</b> and then <b>Shortbook</b>. Each row is one request: a medicine, the quantity needed, who asked and why.",
        "Press <b>Sync shortages</b> to let the app fill the list for you. It checks every medicine against its minimum and adds a request for each one that is short. Requests you already have are kept, so pressing it again does not make duplicates. The reason on those rows reads LOW_STOCK. A medicine with no stock at all is marked URGENT. You can also add your own request with <b>Add manual request</b>, for example when a customer asks for something you do not stock.",
        "Click a row to open the request. You choose the supplier, check the quantity and rate, then press <b>Create purchase order</b>. Creating the order does not add any stock. Stock only changes when the goods arrive.",
      ],
      steps: [
        "Open <b>Inventory</b>, then <b>Reorder</b>, then <b>Shortbook</b>.",
        "Click <b>Sync shortages</b>. A green line says <i>Shortbook refreshed from active targets</i>.",
        "Read the rows. The grey line under each name shows the reason, the priority, the date and the minimum against what is available.",
        "Click a row to open it.",
        "Choose the supplier. The line already has the quantity the app worked out. Change it if needed.",
        "Click <b>Save draft</b> to keep your work, or <b>Create purchase order</b> to move it on.",
      ],
      fields: [
        ["Search item or reference", "Finds requests by medicine name or reference number."],
        ["Status", "Shows only requests in one state, such as Draft, Awaiting manager approval or Received in full. <b>OPEN</b> means anything not finished."],
        ["Supplier GSTIN", "Shows only requests for one supplier, found by the supplier's GST number."],
        ["From, Through", "Limit the list to a range of dates."],
        ["Apply filters, Clear", "Apply what you typed, or remove all filters."],
        ["Download all matching lines", "The small file button saves every line that matches the filters as a spreadsheet file, including lines on other pages."],
      ],
      fieldsHeading: ["Control", "What it does"],
      shots: [
        {
          file: "shortbook",
          as: "pharmacist",
          caption: "The shortbook after Sync shortages. (1) Add manual request, (2) Sync shortages, (3) filters, (4) a request: the medicine, the quantity to buy, the reason and its minimum against stock.",
          viewport: { width: 1440, height: 1250 },
          run: async (page, h) => {
            await open(page, h, REORDER("SHORTBOOK"), "Shortbook");
            if (!(await visible(page.getByRole("button", { name: /^NEED-/ }), 2500))) {
              await page.getByRole("button", { name: "Sync shortages" }).click();
              await page.getByText(/Shortbook refreshed/).waitFor({ timeout: 30000 });
            }
            await page.getByRole("button", { name: /^NEED-/ }).first().waitFor({ timeout: 30000 });
            await h.settle(500);
            await h.mark(page.getByRole("button", { name: "Add manual request" }), 1);
            await h.mark(page.getByRole("button", { name: "Sync shortages" }), 2);
            await h.mark(page.getByRole("button", { name: "Apply filters" }), 3);
            await h.mark(page.getByRole("button", { name: /^NEED-.*Minoxidil/ }), 4);
          },
        },
        {
          file: "shortbook-request",
          as: "pharmacist",
          caption: "One shortbook request opened. The line already holds the quantity to buy. Choose a supplier, then Create purchase order.",
          viewport: { width: 1440, height: 1400 },
          run: async (page, h) => {
            await open(page, h, REORDER("SHORTBOOK"), "Shortbook");
            await page.getByRole("button", { name: /^NEED-.*Minoxidil/ }).first().click();
            await page.getByRole("button", { name: "Create purchase order" }).waitFor({ timeout: 30000 });
            await page.getByLabel("quantity 1", { exact: true }).waitFor({ timeout: 30000 });
            await h.settle(800);
            await h.mark(page.getByRole("button", { name: "Save draft" }), 1);
            await h.mark(page.getByRole("button", { name: "Create purchase order" }), 2);
            await h.mark(page.getByLabel("quantity 1", { exact: true }), 3);
          },
        },
      ],
      tips: ["The shortbook is a to-do list, not an order. Nothing is bought and no stock changes until a purchase order is approved and the goods are received."],
    },
    {
      title: "Create and submit a purchase order",
      who: "Pharmacists",
      body: [
        "A purchase order is your written request to a supplier: which batches, how many, at what rate. Use it when you know what to buy. It stays a draft, and changes no stock, until a manager approves it.",
        "You can start an order from a shortbook request, or from <b>Reorder › Purchase orders › Add purchase order</b> as shown here.",
      ],
      steps: [
        "Open <b>Reorder › Purchase orders</b> and click <b>Add purchase order</b>.",
        "Check the <b>Reference</b>. The app suggests one. Change it if you use your own numbering.",
        "Choose the <b>Supplier</b>, and an <b>Expected date</b> if you know when the goods should arrive.",
        "Choose the <b>Priority</b>: Normal, High or Urgent.",
        "Click the <b>Add a batch</b> box and type a medicine name, batch number, barcode or SKU. Click the batch in the list that appears.",
        "Type the <b>Quantity</b>. Check the rate and GST. The line total and the order total update as you type.",
        "Click <b>Save draft</b> to keep it without sending it on, or <b>Submit for approval</b> when it is ready.",
        "After you submit, the page says <i>Awaiting manager approval</i> and the fields become read only.",
      ],
      fields: [
        ["Reference", "The order number. It must be unique."],
        ["Priority", "Normal, High or Urgent. It tells the approver how fast you need it."],
        ["Quantity", "Units to buy, in the stock unit."],
        ["Free", "Free units the supplier adds under a scheme. Paid and free units together count towards what you ordered."],
        ["Rate excl. GST", "The price per unit before tax."],
        ["Discount %, Scheme ₹", "Percentage discount and a flat scheme amount taken off the line."],
        ["GST %", "Tax rate for the line."],
        ["Remove", "The bin icon takes the line off the order."],
      ],
      fieldsHeading: ["Field", "Meaning"],
      shots: [
        {
          file: "po-form",
          as: "pharmacist",
          caption: "A purchase order filled in: (1) supplier, (2) expected date, (3) the batch added to the order, (4) the quantity to buy, (5) Save draft and Submit for approval.",
          viewport: { width: 1440, height: 1250 },
          run: async (page, h) => {
            poExisted = await docExists(page, h, REORDER("PURCHASE_ORDER"), "Purchase orders", PO_REF);
            await page.getByRole("button", { name: "Add purchase order" }).click();
            const supplier = page.locator("select").filter({ hasText: "Select supplier" });
            await supplier.waitFor({ timeout: 30000 });
            await supplier.selectOption({ index: 1 });
            await page.getByLabel("Reference", { exact: true }).fill(PO_REF);
            await page.getByLabel("Expected date").fill("2026-11-20");
            await page.getByLabel("Reason / notes").fill("Monthly top-up for acne range");
            await fillLine(page, "Adapalene", /Adapalene Gel 0.1% 15 g · LNA/);
            await page.getByLabel("quantity 1", { exact: true }).fill("40");
            await h.settle(500);
            await h.mark(supplier, 1);
            await h.mark(page.getByLabel("Expected date"), 2);
            await h.mark(page.getByLabel("quantity 1", { exact: true }), 4);
            await h.mark(page.getByRole("button", { name: "Submit for approval" }), 5);
          },
          // The order is really saved and submitted, so the next sections can approve it.
          after: async (page, h) => {
            if (!poExisted && (await visible(page.getByRole("button", { name: "Submit for approval" }), 2000))) {
              await page.getByRole("button", { name: "Save draft" }).click();
              await page.getByRole("button", { name: "Export order & remaining quantities" }).waitFor({ timeout: 30000 });
              await page.getByRole("button", { name: "Submit for approval" }).click();
              await page.getByText("Awaiting manager approval").first().waitFor({ timeout: 30000 });
              await h.settle(500);
            }
          },
        },
        {
          file: "po-list",
          as: "pharmacist",
          caption: "The Purchase orders list with the new order. (1) the order, its medicines, priority and status, (2) the status filter, (3) Add purchase order.",
          viewport: { width: 1440, height: 1000 },
          run: async (page, h) => {
            await open(page, h, REORDER("PURCHASE_ORDER"), "Purchase orders");
            await docRow(page, PO_REF).waitFor({ timeout: 30000 });
            await h.mark(docRow(page, PO_REF), 1);
            await h.mark(page.getByLabel("Status"), 2);
            await h.mark(page.getByRole("button", { name: "Add purchase order" }), 3);
          },
        },
      ],
      shotLayout: undefined,
      warnings: ["Submitting an order does not buy anything from the supplier. Nothing is sent until the order is approved and you choose to send it."],
    },
    {
      title: "Approve, send and receive a purchase order",
      who: "Admins and owners approve. Pharmacists send and receive.",
      body: [
        "A manager other than the person who wrote the order opens it and chooses <b>Approve document</b> or <b>Reject proposal</b>. Approving still does not change stock. The document history at the bottom of the page records who did what and when.",
        "Once approved, two buttons appear. <b>Send purchase order</b> tries to email the order to the supplier. If email is not set up for the clinic, the page says <i>Supplier mail transport is not configured. Export the order and deliver it manually.</i> In that case use the <b>Export order &amp; remaining quantities</b> button and send the file yourself. Each attempt is written in the document history.",
        "When the goods arrive, click <b>Receive remaining stock</b>. This opens a receipt in the <b>Purchases</b> area (an inward challan) already filled with the lines still to come. Check the batch number, expiry date and quantity against the delivery, then click <b>Receive stock</b>. The stock goes up only at that point. If only part of the order arrives, receive that part. The order then shows <b>Part received</b> and keeps the rest open.",
      ],
      steps: [
        "Sign in as a manager and open <b>Reorder › Purchase orders</b>.",
        "Click the order that is <i>Awaiting manager approval</i>.",
        "Check the lines and the total, then click <b>Approve document</b>.",
        "Click <b>Send purchase order</b>, or export the order and send it yourself.",
        "When the delivery arrives, open the order and click <b>Receive remaining stock</b>.",
        "Check each line against the delivery note. Enter the real batch and expiry. Click <b>Receive stock</b>.",
      ],
      fields: [
        ["Draft", "Being written. No stock change."],
        ["Awaiting manager approval", "Submitted. A manager must approve or reject it."],
        ["Approved", "Ready to send to the supplier and to receive against."],
        ["Recorded as sent", "The order was sent to the supplier."],
        ["Partly reviewed, Part received", "Some of the goods have arrived. The rest is still open."],
        ["Received in full", "Everything arrived. The order is finished."],
        ["Cancelled, Rejected", "The order was stopped. It cannot be received."],
        ["Cancel document", "Stops an order that is not wanted any more. Use <b>Cancel remaining quantities</b> to close the part that will never arrive."],
        ["Print QR label, Export lines", "Print a label for the document, or save its lines as a spreadsheet file."],
      ],
      fieldsHeading: ["Status or button", "Meaning"],
      shots: [
        {
          file: "po-approve",
          as: "admin",
          caption: "A manager opens the order. (1) the status, (2) Approve document, (3) Reject proposal.",
          viewport: { width: 1440, height: 1000 },
          run: async (page, h) => {
            await poPage(page, h);
            await h.mark(page.getByText(/Awaiting manager approval|^Approved$/).first(), 1);
            if (await visible(page.getByRole("button", { name: "Approve document" }), 2000)) {
              await h.mark(page.getByRole("button", { name: "Approve document" }), 2);
              await h.mark(page.getByRole("button", { name: "Reject proposal" }), 3);
            }
          },
          after: async (page, h) => {
            const approve = page.getByRole("button", { name: "Approve document" });
            if (await visible(approve, 1500)) {
              await approve.click();
              await page.getByRole("button", { name: "Send purchase order" }).waitFor({ timeout: 30000 });
            }
          },
        },
        {
          file: "po-sent",
          as: "admin",
          caption: "After Approve document. (1) Receive remaining stock, (2) Send purchase order. Without supplier email set up the page says so, and the order is exported by hand.",
          viewport: { width: 1440, height: 1000 },
          run: async (page, h) => {
            await poPage(page, h);
            const send = page.getByRole("button", { name: "Send purchase order" });
            await send.waitFor({ timeout: 30000 });
            if (!(await visible(page.getByText(/Supplier mail transport is not configured/), 1500))) {
              await send.click();
              await page.getByText(/Supplier mail transport is not configured/).first().waitFor({ timeout: 30000 });
            }
            await h.settle(500);
            await h.mark(page.getByRole("button", { name: "Receive remaining stock" }), 1);
            await h.mark(send, 2);
            await page.getByText(/Supplier mail transport is not configured/).first().scrollIntoViewIfNeeded();
          },
        },
        {
          file: "po-receive",
          as: "admin",
          caption: "Receive remaining stock opens a receipt in the Purchases area, already linked to the order and filled with the quantities still to come. Stock only rises when you click Receive stock.",
          viewport: { width: 1440, height: 1300 },
          run: async (page, h) => {
            await poPage(page, h);
            await page.getByRole("button", { name: "Receive remaining stock" }).click();
            await page.getByRole("button", { name: "Receive stock" }).waitFor({ timeout: 30000 });
            await page.getByLabel("Quantity", { exact: false }).first().waitFor({ timeout: 5000 }).catch(() => {});
            await h.settle(800);
            await h.mark(page.getByRole("button", { name: "Receive stock" }), 1);
            await h.mark(page.getByLabel("Purchase order"), 2);
          },
        },
      ],
      warnings: ["Click <b>Receive stock</b> only when the goods are in your hands. It adds the batches to your stock and cannot be undone. A wrong receipt is fixed with a correction, not by deleting it."],
    },
    {
      title: "Review target proposals",
      who: "Admins and owners",
      body: [
        "Target proposals suggest new minimum and maximum levels from what the pharmacy actually sold. The app counts the units that left the shelf on posted counter sales over a set number of days. It can also count quotations for medicines you did not have and planned refills. It then works out how many days of stock each medicine has and proposes levels that cover the days set in <b>Automation settings</b>. A proposal is a draft. Nothing changes until you accept a line.",
        "Press <b>Generate target proposal</b> to make today's proposal. Click it in the list to open it. Each medicine shows its saved minimum and maximum, then an arrow and the proposed levels, with the evidence underneath: available stock, units sold, bounced (wanted but not in stock) and refill quotations, and the number of purchase orders.",
        "When a medicine has no recent sales, the app writes <i>Cold start: retain saved targets</i> and proposes the same levels it already has. This is normal for a new clinic. After a few weeks of sales the proposals start to differ.",
        "Medicines that you protected or excluded under <b>Manual targets &amp; exclusions</b> are left alone.",
      ],
      steps: [
        "Open <b>Reorder › Target proposals</b> and click <b>Generate target proposal</b>.",
        "Click the proposal that appears in the list.",
        "Read each medicine. Tick the ones you agree with, or click <b>Select unreviewed</b> to tick them all.",
        "Click <b>Accept selected</b> to save the proposed levels, or <b>Reject selected</b> to keep the old ones.",
        "Click <b>Back to list</b> when you are done.",
      ],
      fields: [
        ["Evidence dates", "The days of sales the proposal looked at."],
        ["Demand inputs", "How many days of history it used, the smallest number of orders it needs before it trusts the data, and whether bounced and refill quotations count."],
        ["Coverage", "The number of days of stock the minimum and maximum should cover."],
        ["Saved min / max → Proposed", "What you have now, and what the app suggests."],
        ["Sales, Bounce, Refill, orders", "The evidence: units sold, units wanted but not in stock, planned refills and purchase orders in the period."],
        ["Select unreviewed, Clear selection", "Tick every line you have not decided on yet, or untick all."],
        ["Accept selected, Reject selected", "Apply the decision to all ticked lines."],
      ],
      fieldsHeading: ["On screen", "Meaning"],
      shots: [
        {
          file: "proposal",
          as: "admin",
          caption: "A target proposal opened. (1) what the app looked at, (2) the saved and proposed levels with the evidence for one medicine, (3) select and decide buttons.",
          viewport: { width: 1440, height: 1250 },
          run: async (page, h) => {
            await open(page, h, REORDER("TARGET_REVIEW"), "Target proposals");
            const row = page.getByRole("button", { name: /^TARGET-/ }).first();
            if (!(await visible(row, 2500))) {
              await page.getByRole("button", { name: "Generate target proposal" }).click();
            } else {
              await row.click();
            }
            await page.getByRole("button", { name: "Accept selected" }).waitFor({ timeout: 60000 });
            await page.getByText(/Saved min \/ max/).first().waitFor({ timeout: 30000 });
            await h.settle(800);
            await h.mark(page.getByText(/Evidence dates/).first(), 1);
            await h.mark(page.getByText(/Saved min \/ max/).first(), 2);
            await h.mark(page.getByRole("button", { name: "Select unreviewed" }), 3);
          },
        },
      ],
    },
    {
      title: "Set minimum, maximum and reorder level by hand",
      who: "Admins and owners. Pharmacists can look.",
      body: [
        "<b>Manual targets &amp; exclusions</b> is the page where you type the three levels yourself. Use it for a new medicine, a seasonal one, or any time you know better than the app. It lists every active medicine with its saved numbers and its available stock.",
        "Changes are made in three steps so a slip does not reach the shelf: tick the medicines, edit the numbers, then click <b>Review selected changes</b>. The review shows the old and new numbers side by side. You must give a reason, and the whole selection is saved together with a record of the old values. Stock quantities and purchase prices are not touched.",
        "Two tick boxes at the right of each row control automation. <b>Protect manual targets</b> stops target proposals from overwriting the numbers you typed. <b>Exclude from target proposals</b> leaves the medicine out of proposals completely. Saved levels still count for shortages in both cases.",
      ],
      steps: [
        "Open <b>Reorder</b>, then <b>More tasks…</b>, then <b>Manual targets &amp; exclusions</b>.",
        "Type part of a name in <b>Search item or reference</b> and click <b>Apply filters</b> to narrow the list. Click <b>Clear</b> to see everything again.",
        "Tick the medicine, or click <b>Select all matching items</b> to tick every row in the list. <b>Clear selection</b> unticks them.",
        "Type the new <b>Minimum</b>, <b>Maximum</b> and <b>Reorder level</b>. Leave a box blank to leave it unconfigured.",
        "Tick <b>Protect manual targets</b> or <b>Exclude from target proposals</b> if you want.",
        "Click <b>Review selected changes</b>. Read the old and new numbers.",
        "Type the <b>Reason</b>, then click <b>Save reviewed targets</b>. Click <b>Back to editing</b> to change something first.",
      ],
      fields: [
        ["Select / item", "The tick box and the medicine, with its stock unit and available stock."],
        ["Saved min / max / reorder", "The three numbers saved now."],
        ["Minimum, Maximum, Reorder level", "Boxes for the new numbers."],
        ["Protect manual targets", "Proposals will not change your numbers."],
        ["Exclude from target proposals", "The medicine is left out of proposals."],
        ["Reason", "Required. Kept with the record of the change."],
      ],
      fieldsHeading: ["Column or box", "Meaning"],
      shots: [
        {
          file: "targets",
          as: "admin",
          caption: "Manual targets. (1) search, (2) Select all matching items, (3) the ticked medicine, (4) new minimum, maximum and reorder level, (5) the automation tick boxes, (6) Review selected changes.",
          viewport: { width: 1440, height: 1200 },
          run: async (page, h) => {
            await open(page, h, REORDER("targets"), "Manual targets & exclusions");
            await page.getByLabel(`Select ${SUN}`).waitFor({ timeout: 30000 });
            await page.getByLabel("Search item or reference").fill("Sunscreen");
            await page.getByRole("button", { name: "Apply filters" }).click();
            await page.getByText(/1 matching items?/).waitFor({ timeout: 30000 });
            const [lo, hi, rl] = await levelsFor(page);
            await page.getByLabel(`Select ${SUN}`).check();
            await page.getByLabel(`Minimum for ${SUN} (PIECES)`).fill(lo);
            await page.getByLabel(`Maximum for ${SUN} (PIECES)`).fill(hi);
            await page.getByLabel(`Reorder level for ${SUN} (PIECES)`).fill(rl);
            await h.settle(500);
            await h.mark(page.getByLabel("Search item or reference"), 1);
            await h.mark(page.getByRole("button", { name: "Select all matching items" }), 2);
            await h.mark(page.getByLabel(`Select ${SUN}`), 3);
            await h.mark(page.getByLabel(`Minimum for ${SUN} (PIECES)`), 4);
            await h.mark(page.getByLabel(`Protect manual targets for ${SUN}`), 5);
            await h.mark(page.getByRole("button", { name: "Review selected changes" }), 6);
          },
        },
        {
          file: "targets-review",
          as: "admin",
          caption: "Review selected changes: the old and new numbers, a reason box and the Save reviewed targets button. Nothing is saved until you click it.",
          viewport: { width: 1440, height: 1000 },
          run: async (page, h) => {
            await open(page, h, REORDER("targets"), "Manual targets & exclusions");
            await page.getByLabel("Search item or reference").fill("Sunscreen");
            await page.getByRole("button", { name: "Apply filters" }).click();
            await page.getByText(/1 matching items?/).waitFor({ timeout: 30000 });
            const [lo, hi, rl] = await levelsFor(page);
            await page.getByLabel(`Select ${SUN}`).check();
            await page.getByLabel(`Minimum for ${SUN} (PIECES)`).fill(lo);
            await page.getByLabel(`Maximum for ${SUN} (PIECES)`).fill(hi);
            await page.getByLabel(`Reorder level for ${SUN} (PIECES)`).fill(rl);
            await page.getByRole("button", { name: "Review selected changes" }).click();
            await page.getByRole("button", { name: "Save reviewed targets" }).waitFor({ timeout: 30000 });
            await page.getByLabel(/^Reason/).fill("Sunscreen sells faster in summer, so keep more on the shelf");
            await h.settle(500);
            await page.getByRole("button", { name: "Save reviewed targets" }).scrollIntoViewIfNeeded();
            await h.mark(page.getByLabel(/^Reason/), 1);
            await h.mark(page.getByRole("button", { name: "Save reviewed targets" }), 2);
            await h.mark(page.getByRole("button", { name: "Back to editing" }), 3);
          },
          after: async (page, h) => {
            await page.getByRole("button", { name: "Save reviewed targets" }).click();
            await page.getByText("Reviewed targets and exclusions saved with their history.").waitFor({ timeout: 30000 });
          },
        },
      ],
      tips: ["After you save, the shortbook uses the new levels the next time you press <b>Sync shortages</b>."],
    },
    {
      title: "Automation settings and the monitor",
      who: "Admins and owners",
      body: [
        "<b>Automation settings</b> decides how the app proposes targets and drafts orders by itself. Automation only makes drafts for a manager to approve. Sending an order always needs a person. Until an automation owner is chosen the page shows <i>Setup required</i>.",
        "Choose an <b>Automation owner</b>: the person the drafts are made in the name of. Turn on <b>Automatic target proposals</b> and <b>Automatic PO drafts</b> if you want them. Open <b>How demand is calculated</b> for a short explanation. Click <b>Save settings</b>, and <b>Run saved settings</b> to try it at once. Each run is listed under <b>Saved run outcomes</b>.",
        "<b>Monitor</b> is a report on how reordering is going. Choose a <b>From</b> and <b>Through</b> date and click <b>Apply filters</b>. The counts show how many orders were created, approved, sent, failed, part received and received. Below them, <b>Demand &amp; stock coverage</b> lists each medicine in the latest proposal with the stock available, the units sold per day and the days of cover. Click <b>Review proposal</b> on a row to open the evidence. <b>Supplier choices</b> shows which suppliers your orders went to.",
      ],
      fields: [
        ["Demand lookback (days)", "How many days of sales to look at."],
        ["Minimum order history", "How many past orders a medicine needs before its sales count as a pattern."],
        ["Min. cover (days), Max. cover (days)", "How many days of stock the minimum and maximum should cover."],
        ["Target refresh (days)", "How often a new proposal is made."],
        ["Include unfulfilled bounce quotations", "Count customers who asked for a medicine you did not have."],
        ["Include planned refill quotations", "Count refills planned for patients."],
        ["FAILED (monitor)", "Attempts to send an order that did not go through, for example because supplier email is not set up."],
        ["Days of cover", "Available stock divided by units sold per day. <i>No observed demand</i> means nothing sold in the period."],
      ],
      fieldsHeading: ["Setting or figure", "Meaning"],
      shots: [
        {
          file: "settings",
          as: "admin",
          caption: "Automation setup. (1) who owns the automation and what it has done, (2) the two switches, (3) the demand settings, (4) Save settings and Run saved settings.",
          viewport: { width: 1440, height: 1400 },
          run: async (page, h) => {
            await open(page, h, REORDER("settings"), "Automation setup & summary");
            await page.getByText("How demand is calculated").click();
            await h.settle(500);
            await h.mark(page.getByLabel("Automation owner"), 1);
            await h.mark(page.getByText(/Automatic target proposals/).first(), 2);
            await h.mark(page.getByLabel("Demand lookback (days)"), 3);
            await h.mark(page.getByRole("button", { name: "Save settings" }), 4);
          },
        },
        {
          file: "monitor",
          as: "admin",
          caption: "The monitor. (1) the date range, (2) counts of orders by outcome, (3) demand and stock coverage for each medicine.",
          viewport: { width: 1440, height: 1400 },
          run: async (page, h) => {
            await open(page, h, REORDER("monitor"), "Replenishment monitor");
            await page.getByText("Demand & stock coverage").waitFor({ timeout: 30000 });
            await h.mark(page.getByLabel("From"), 1);
            await h.mark(page.getByText("PART RECEIVED").first(), 2);
            await h.mark(page.getByText("Demand & stock coverage"), 3);
          },
        },
      ],
    },
    {
      title: "Record a counter sale",
      who: "Pharmacists",
      body: [
        "The <b>Sales</b> area of Inventory records sales from exact batches of stock, one document per sale. It has four views: <b>Counter sales</b>, <b>Quotations</b>, <b>Customer returns</b> and, in <b>More tasks…</b>, <b>Patient invoice history</b>.",
        "A counter sale is for someone who walks up and buys medicines without a prescription bill, for example a skin cream or sunscreen. You pick the batch, so the right expiry and price are used. A draft does not hold any stock. Stock goes down when you click <b>Post sale</b>.",
        "The sale then shows <i>Confirmed stock effects</i> (the units taken off the shelf) and a history of who saved and posted it. Posted sales also appear in the <b>Sales</b> item of the main menu.",
      ],
      steps: [
        "Open <b>Inventory › Sales › Counter sales</b> and click <b>New document</b>.",
        "Type the customer's name and phone number if you want them on the bill. Leave them blank for a walk-in customer.",
        "Choose the <b>Payment method</b>: Cash, UPI, Card or Credit.",
        "Choose the <b>Doctor</b> if a doctor advised it, and the <b>Order type</b>: Pickup, Delivery or In clinic.",
        "Click <b>Add a batch</b>, type the medicine, and click the batch you are handing over. The app shows the batch number, expiry date and rack.",
        "Type the <b>Quantity</b>. Check the rate, discount and GST. The total updates.",
        "Click <b>Post sale</b>. The page now shows <i>Posted</i> and the stock effect.",
      ],
      fields: [
        ["Counter sales list", "Past sales. Filter by <b>Status</b>, <b>Reference</b> and a date range. <b>Previous</b> and <b>Next</b> move between pages."],
        ["Reference", "The sale number."],
        ["Payment method", "Cash, UPI, Card or Credit."],
        ["Order type", "Pickup, Delivery or In clinic."],
        ["Batch-selection reason", "Asked when you choose a batch that expires later than an older batch on the shelf. Write why."],
        ["Post sale", "Saves the sale and reduces stock."],
      ],
      fieldsHeading: ["Field", "Meaning"],
      shots: [
        {
          file: "counter-sale",
          as: "pharmacist",
          caption: "A counter sale ready to post. (1) customer and payment, (2) the batch and its expiry, (3) quantity, (4) the total, (5) Post sale.",
          viewport: { width: 1440, height: 1250 },
          run: async (page, h) => {
            saleExisted = await docExists(page, h, SALES("COUNTER_SALE"), "Counter sales", SALE_REF.replace(/^/, "(WF-)?"));
            await page.getByRole("button", { name: "New document" }).click();
            await page.getByLabel("Customer name (optional)").waitFor({ timeout: 30000 });
            await page.getByLabel("Reference", { exact: true }).fill(SALE_REF);
            await page.getByLabel("Customer name (optional)").fill("Meena Joshi");
            await page.getByLabel("Phone (optional)").fill("9822012345");
            await page.getByLabel("Payment method").selectOption("UPI");
            await fillLine(page, "Calamine", /Calamine Lotion 100 ml · /);
            await page.getByLabel("quantity 1", { exact: true }).fill("2");
            await h.settle(500);
            await h.mark(page.getByLabel("Customer name (optional)"), 1);
            await h.mark(page.getByText(/LNB0126/).first(), 2);
            await h.mark(page.getByLabel("quantity 1", { exact: true }), 3);
            await h.mark(page.getByText(/^Total ₹/).first(), 4);
            await h.mark(page.getByRole("button", { name: "Post sale" }).first(), 5);
          },
          after: async (page, h) => {
            if (!saleExisted && (await visible(page.getByRole("button", { name: "Post sale" }), 2000))) {
              await page.getByRole("button", { name: "Post sale" }).first().click();
              await page.getByText("Confirmed stock effects").waitFor({ timeout: 30000 });
              await h.settle(500);
            }
          },
        },
        {
          file: "counter-sale-posted",
          as: "pharmacist",
          caption: "The posted sale. (1) the status, (2) Confirmed stock effects: two units left the shelf, (3) the history of who saved and posted it.",
          viewport: { width: 1440, height: 1500 },
          run: async (page, h) => {
            await open(page, h, SALES("COUNTER_SALE"), "Counter sales");
            await page.getByRole("button", { name: /COUNTER-SALE|CS-GUIDE/ }).first().click();
            await page.getByText("Confirmed stock effects").waitFor({ timeout: 30000 });
            await h.settle(500);
            await h.mark(page.getByText("Posted", { exact: true }).first(), 1);
            await h.mark(page.getByText("Confirmed stock effects"), 2);
            await h.mark(page.getByRole("heading", { name: "Document history" }), 3);
          },
        },
      ],
    },
    {
      title: "Take a customer return",
      who: "Pharmacists",
      body: [
        "Use <b>Customer returns</b> when a customer brings back something you sold. The return is tied to the original sale, so the app knows the batch, the price and how many are left that can still be returned. You decide what happens to each returned item.",
        "A return needs a reason before it can be posted.",
      ],
      steps: [
        "Open <b>Inventory › Sales › Customer returns</b> and click <b>New document</b>.",
        "Type the sale's reference in <b>Search original sale</b>.",
        "Under <b>Add from original sale</b>, choose the sold batch. It shows how many can still be returned.",
        "Check the <b>Quantity</b> being returned.",
        "In <b>Disposition</b> choose what happens to the goods.",
        "Choose the <b>Refund method</b> and write the <b>Reason / notes</b>.",
        "Click <b>Post return</b>.",
      ],
      fields: [
        ["Restock", "The item is sound. It goes back on the shelf and stock goes up."],
        ["Quarantine", "The item is held aside until someone checks it. It is not for sale. It appears under Stock › Blocked stock."],
        ["Record as loss", "The item is thrown away. Stock does not go up and the loss is recorded."],
        ["Refund method", "Cash, UPI, Card or Credit."],
      ],
      fieldsHeading: ["Disposition", "What it does"],
      shots: [
        {
          file: "customer-return",
          as: "pharmacist",
          caption: "A customer return. (1) the original sale, (2) the line taken from it, (3) the disposition, (4) the reason, (5) Post return.",
          viewport: { width: 1440, height: 1300 },
          run: async (page, h) => {
            returnExisted = await docExists(page, h, SALES("SALES_RETURN"), "Customer returns", RETURN_REF);
            await page.getByRole("button", { name: "New document" }).click();
            await page.getByLabel("Search original sale").waitFor({ timeout: 30000 });
            await page.getByLabel("Reference", { exact: true }).fill(RETURN_REF);
            await page.getByLabel("Search original sale").fill("COUNTER-SALE");
            const pick = page.getByLabel("Add from original sale");
            await h.settle(1500);
            await pick.selectOption({ index: 1 });
            await page.getByLabel("Customer name (optional)").fill("Meena Joshi");
            await page.getByLabel("Reason / notes").fill("Bought the wrong size, pack unopened");
            await h.settle(500);
            await h.mark(page.getByLabel("Search original sale"), 1);
            await h.mark(pick, 2);
            await h.mark(page.locator("select").filter({ hasText: "Restock" }).first(), 3);
            await h.mark(page.getByLabel("Reason / notes"), 4);
            await h.mark(page.getByRole("button", { name: "Post return" }), 5);
          },
          after: async (page, h) => {
            if (!returnExisted && (await visible(page.getByRole("button", { name: "Post return" }), 2000))) {
              await page.getByRole("button", { name: "Post return" }).click();
              await page.getByText("Confirmed stock effects").waitFor({ timeout: 30000 });
              await h.settle(500);
            }
          },
        },
      ],
    },
    {
      title: "Quotations and patient invoice history",
      who: "Pharmacists, reception",
      body: [
        "A <b>quotation</b> is a price quote for a customer. It does not hold stock and does not sell anything. When the customer agrees, click <b>Create sale draft</b>. This can be done once, and gives a counter sale draft you then post as usual.",
        "Choose the <b>Request source</b> so the app can learn from it. <b>Unfilled customer demand</b> means the customer wanted something you did not have. <b>Requested refill</b> means a patient will need a repeat supply on the <b>Expected date</b>. Both feed the target proposals when the settings include them.",
        "<b>Patient invoice history</b> (under <b>More tasks…</b>) lists the pharmacy bills raised for patients from the Pharmacy Desk. Use <b>Search</b>, <b>Status</b>, <b>Payment Status</b>, <b>Payment Method</b> and <b>Date Range</b> to find a bill. Each card shows the patient, doctor, payment, items and total.",
      ],
      fields: [
        ["Quotations list", "Filter by <b>Status</b>, <b>Reference</b> and dates. <b>New quotation</b> starts one."],
        ["Create sale draft", "Turns an agreed quotation into a counter sale draft."],
        ["Request source", "Manual quotation, Unfilled customer demand or Requested refill."],
        ["Total Invoices, Total Amount, Completed, Pending Amount", "The four totals above the invoice history."],
      ],
      fieldsHeading: ["On screen", "Meaning"],
      shots: [
        {
          file: "quotation",
          as: "pharmacist",
          caption: "A new quotation. (1) the request source, (2) the expected date and priority, (3) Create sale draft once the customer agrees.",
          viewport: { width: 1440, height: 1300 },
          run: async (page, h) => {
            await open(page, h, SALES("QUOTATION"), "Quotations");
            await page.getByRole("button", { name: "New quotation" }).click();
            await page.getByLabel("Request source").waitFor({ timeout: 30000 });
            await page.getByLabel("Customer name (optional)").fill("Rohan Kulkarni");
            await fillLine(page, "Sunscreen", /Sunscreen SPF 50 Lotion 50 ml · /);
            await page.getByLabel("quantity 1", { exact: true }).fill("3");
            await h.settle(500);
            await h.mark(page.getByLabel("Request source"), 1);
            await h.mark(page.getByLabel("Expected date"), 2);
            await h.mark(page.getByRole("button", { name: "Create sale draft" }), 3);
          },
        },
        {
          file: "invoice-history",
          as: "pharmacist",
          caption: "Patient invoice history. (1) the totals, (2) the filters, (3) one bill with its patient, doctor, payment and items.",
          viewport: { width: 1440, height: 1100 },
          run: async (page, h) => {
            await open(page, h, SALES("history"), "Pharmacy Invoices");
            await page.getByText("Showing", { exact: false }).first().waitFor({ timeout: 30000 });
            await h.mark(page.getByText("Total Invoices"), 1);
            await h.mark(page.getByText("Date Range").first(), 2);
            await h.mark(page.getByText(/^PHI-2026-/).first(), 3);
          },
        },
      ],
    },
    {
      title: "Inventory Sales and the Sales item in the menu",
      who: "Pharmacists, doctors, admins, owners",
      body: [
        "The main menu has its own <b>Sales</b> item (under Pharmacy). It is not the same thing as <b>Inventory › Sales</b>. The menu item is the register of pharmacy bills. It shows every sale, whoever made it: bills from the Pharmacy Desk for patients, and counter sales posted from Inventory. You use it to look up, print or correct the discount on a bill.",
        "<b>Inventory › Sales</b> is where a sale is created and controlled from the stock side. You choose the exact batch, and a posted sale shows the stock it took. A counter sale posted here appears in the menu's <b>Sales</b> register with the reference you gave it.",
      ],
      shots: [
        {
          file: "menu-sales",
          as: "pharmacist",
          caption: "The Sales item in the main menu. (1) the Sales and Returns tabs, (2) New sale, (3) the counter sale posted from Inventory appears among the bills.",
          viewport: { width: 1440, height: 1000 },
          run: async (page, h) => {
            await h.goto("/dashboard/pharmacy/sales");
            await page.getByRole("heading", { name: "Sales", exact: true }).waitFor({ timeout: 30000 });
            await page.getByText(/COUNTER-SALE|CS-GUIDE/).first().waitFor({ timeout: 30000 });
            await h.settle(800);
            await h.mark(page.getByRole("tab", { name: "Returns" }), 1);
            await h.mark(page.getByRole("button", { name: "New sale" }), 2);
            await h.mark(page.getByText(/COUNTER-SALE|CS-GUIDE/).first(), 3);
          },
        },
      ],
    },
  ],
};
