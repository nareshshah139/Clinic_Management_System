const { journey } = require("./lib.cjs");

const ITEM = "Tretinoin Cream 0.025% 20g";
const SUPPLIER = "Apex Medico Agencies";
const BILL = "AMA/2026/1187";

module.exports = journey(
  { id: "j10", title: "Receive a supplier delivery by hand-typed bill", story: "PURCHASES-REORDER-04", persona: "pharmacist" },
  async (ui) => {
    const page = ui.page;
    const line = (key) => page.locator(`[id$="-${key}"]`).first();
    const stockOf = async () => {
      const result = await ui.api("GET", `/inventory/workspace/stock?search=${encodeURIComponent("Tretinoin")}&limit=50&page=1`);
      return (result.rows || []).filter((r) => r.name === ITEM).reduce((sum, r) => sum + Number(r.currentStock || 0), 0);
    };

    await ui.start("/dashboard");
    await ui.screen("dashboard");
    const before = await stockOf();

    await ui.click(page.getByRole("link", { name: "Inventory" }).first(), "Menu: Inventory");
    await page.getByText("What needs attention").waitFor();
    await ui.screen("inventory-today");
    await ui.click(page.getByRole("button", { name: "Scan or enter bill" }).first(), "Inventory: Scan or enter bill");
    await page.getByText("Type instead").waitFor();
    await ui.screen("scan-or-enter-bill");
    await ui.click(page.getByText("Type instead"), "Scan panel: Type instead");
    await page.locator("#saved-purchase-supplier").waitFor();
    await ui.screen("manual-bill-form");

    ui.decide("Which saved supplier sent this bill", false);
    await ui.select("#saved-purchase-supplier", { label: `${SUPPLIER} — 27AAACA5678B1ZQ` }, "Saved supplier: Apex Medico Agencies");
    ui.reenter("Supplier drug licence number (saved on the supplier record)");
    await ui.fill("#distributor-dl", "MH-PUN-3187", "DL No.");
    await ui.fill("#invoice-number", BILL, "Invoice No.");

    await ui.fill(line("product"), ITEM, "Line 1: Product");
    ui.reenter("Product name (item already exists in stock)");
    await ui.fill(line("pack-size"), "20g", "Line 1: Pack Size");
    await ui.fill(line("unit"), "Tube", "Line 1: Stock unit");
    await ui.fill(line("batch"), "TR2611", "Line 1: Batch");
    await ui.fill(line("expiry-month"), "10", "Line 1: Exp. Month");
    await ui.fill(line("expiry-year"), "2028", "Line 1: Exp. Year");
    await ui.fill(line("qty"), "20", "Line 1: Paid Qty");
    await ui.fill(line("rate"), "92", "Line 1: Rate");
    await ui.fill(line("mrp"), "165", "Line 1: MRP");
    ui.reenter("MRP (saved on the item)");
    ui.decide("GST rate (pre-filled 6% + 6%)", true);
    await ui.screen("bill-typed");

    await ui.click(page.getByRole("button", { name: "Refresh Matches" }), "Product matching: Refresh Matches");
    ui.decide("Which saved product this line is", false);
    await ui.fill(page.getByPlaceholder("Search by product name").first(), "Tretinoin", "Search saved products manually");
    await ui.click(page.getByRole("button", { name: `Match ${ITEM}` }), `Match ${ITEM}`);
    await page.getByText("These look like different products").waitFor();
    await ui.screen("different-products-compare");
    await ui.click(page.getByRole("button", { name: "Confirm this match" }), "Compare products: Confirm this match");
    await page.getByText("These look like different products").waitFor({ state: "detached" });
    await ui.screen("after-match");

    const hsn = await line("hsn").inputValue();
    if (!hsn) {
      ui.reenter("HSN code (saved on the item)");
      await ui.fill(line("hsn"), "30049099", "Line 1: HSN");
    }
    await ui.screen("ready-to-add");
    const confirm = page.getByRole("button", { name: "Confirm reviewed values & add stock" });
    await confirm.waitFor();
    await ui.click(confirm, "Invoice actions: Confirm reviewed values & add stock");
    await page.getByText(/Stock added/i).first().waitFor();
    await ui.screen("stock-added");

    const after = await stockOf();
    const bills = await ui.api("GET", `/pharmacy/purchase-invoices?limit=50`);
    const found = (bills.data || []).some((b) => b.invoiceNumber === BILL && b.status === "STOCK_COMMITTED");
    ui.goal(after - before === 20 && found, "Tretinoin Cream stock rose by 20 and purchase bill AMA/2026/1187 exists");
  },
);
if (require.main === module) module.exports.cli();
