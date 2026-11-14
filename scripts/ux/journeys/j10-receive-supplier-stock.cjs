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
    await page.getByRole("button", { name: "Enter bill by hand" }).waitFor();
    await ui.screen("scan-or-enter-bill");
    await ui.click(page.getByRole("button", { name: "Enter bill by hand" }), "Scan panel: Enter bill by hand");
    await page.locator("#saved-purchase-supplier").waitFor();
    await ui.screen("manual-bill-form");

    ui.decide("Which saved supplier sent this bill", false);
    await ui.select("#saved-purchase-supplier", { label: `${SUPPLIER} — 27AAACA5678B1ZQ` }, "Saved supplier: Apex Medico Agencies");
    await ui.fill("#invoice-number", BILL, "Invoice No.");
    await ui.fill(line("product"), ITEM, "Line 1: Product");

    ui.decide("Which saved product this line is (one exact suggestion)", true);
    const match = page.getByRole("button", { name: "Confirm Match" });
    await match.waitFor();
    await ui.screen("exact-match-suggested");
    await ui.click(match, `Product matching: Confirm Match ${ITEM}`);
    await page.getByText(`Matched ${ITEM}`).first().waitFor();

    await ui.fill(line("batch"), "TR2611", "Line 1: Batch");
    await ui.fill(line("expiry-month"), "10/2028", "Line 1: Expiry");
    await ui.fill(line("qty"), "20", "Line 1: Paid Qty");
    await ui.fill(line("rate"), "92", "Line 1: Rate");
    await ui.screen("ready-to-add");

    const confirm = page.getByRole("button", { name: "Confirm reviewed values & add stock" });
    await confirm.waitFor();
    await ui.click(confirm, "Invoice actions: Confirm reviewed values & add stock");
    await page.getByText(`${ITEM}: 20 added.`).first().waitFor();
    await page.getByRole("button", { name: "Enter another bill" }).waitFor();
    await ui.screen("stock-added");

    const after = await stockOf();
    const bills = await ui.api("GET", `/pharmacy/purchase-invoices?limit=50`);
    const bill = (bills.data || []).find((b) => b.invoiceNumber === BILL && b.status === "STOCK_COMMITTED");
    const saved = bill && (await ui.api("GET", `/pharmacy/purchase-invoices/${bill.id}`));
    const item = saved?.items?.[0];
    const batchKept = item?.productName === ITEM && item.batchNumber === "TR2611" && Number(item.expiryMonth) === 10 && Number(item.expiryYear) === 2028
      && item.packUnitType === "Tube" && item.packSize === "1 unit" && item.hsnCode === "30049099" && Number(item.mrp) === 165 && saved.distributorDlNo === "MH-PUN-3187";
    ui.goal(after - before === 20 && !!bill && batchKept,
      "Tretinoin Cream stock rose by 20; bill AMA/2026/1187 is stock-committed with batch TR2611, expiry 10/2028, unit Tube, the saved pack, HSN, MRP and supplier licence");
  },
);
if (require.main === module) module.exports.cli();
