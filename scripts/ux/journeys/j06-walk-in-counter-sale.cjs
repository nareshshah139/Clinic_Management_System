const { journey } = require("./lib.cjs");

const DRUG_SEARCH = "Search by drug name, manufacturer, or ingredient...";

module.exports = journey(
  { id: "j06", title: "Walk-in counter sale for cash", story: "PHARMACY-COUNTER-02", persona: "pharmacist" },
  async (ui) => {
    const page = ui.page;
    await ui.start("/dashboard");
    await page.getByRole("link", { name: "Sales", exact: true }).waitFor();
    await ui.screen("dashboard");
    await ui.click(page.getByRole("link", { name: "Sales", exact: true }), "Menu: Sales");
    await page.getByRole("button", { name: "New sale" }).waitFor();
    await ui.screen("sales-register");
    await ui.click(page.getByRole("button", { name: "New sale" }), "Sales: New sale");
    await page.waitForURL(/\/sales\/bill/);
    await page.locator("#patient").waitFor();
    await ui.screen("new-bill-empty");

    ui.decide("Which registered patient stands in for a customer with no record", false);
    await ui.click(page.locator("#patient"), "Bill: Patient field");
    await ui.type(page.locator("#patient"), "Sanjay", "Bill: Patient search, type a stand-in name");
    await ui.screen("patient-search");
    await ui.click(page.getByText("Sanjay Pawar").first(), "Bill: pick stand-in patient");
    await page.locator("#billingName").waitFor();
    ui.reenter("Billing Name overwritten with the real customer name");
    await ui.fill(page.locator("#billingName"), "Walk-in customer", "Bill: Billing Name");
    ui.reenter("Phone required again for a customer who gave none");
    await ui.fill(page.locator("#billingPhone"), "0000000000", "Bill: Phone");

    await ui.type(page.locator("#drugSearch"), "Cetirizine", "Bill: Search Drugs, type Cetirizine");
    const cetirizine = page.locator('[role="button"]').filter({ hasText: "Cetirizine 10mg Tablet" }).first();
    await cetirizine.waitFor();
    await ui.screen("drug-results-cetirizine");
    await ui.click(cetirizine.getByRole("button", { name: /Add/ }), "Bill: Add Cetirizine 10mg Tablet");
    await page.locator('input[id^="quantity-"]').first().waitFor();
    await ui.fill(page.locator('input[id^="quantity-"]').first(), "10", "Bill: Cetirizine Quantity 10");

    await ui.fill(page.locator("#drugSearch"), "", "Bill: clear Search Drugs");
    await ui.type(page.locator("#drugSearch"), "Sunscreen", "Bill: Search Drugs, type Sunscreen");
    const sunscreen = page.locator('[role="button"]').filter({ hasText: "Sunscreen SPF 50 Gel 50g" }).first();
    await sunscreen.waitFor();
    await ui.click(sunscreen.getByRole("button", { name: /Add/ }), "Bill: Add Sunscreen SPF 50 Gel 50g");
    await page.locator('input[id^="quantity-"]').nth(1).waitFor();
    await ui.screen("bill-two-items");

    ui.decide("Payment method", true);
    await ui.click(page.getByRole("button", { name: /Print Preview/ }), "Bill: Print Preview");
    await page.getByRole("button", { name: "Confirm & Print" }).waitFor();
    await ui.screen("print-preview");
    await ui.click(page.getByRole("button", { name: "Confirm & Print" }), "Preview: Confirm & Print");
    await page.getByRole("button", { name: "Invoice Confirmed" }).waitFor();
    await ui.screen("confirmed-preview");
    console.log("CLOSE", await page.getByRole("button", { name: "Close" }).evaluateAll((els) => els.map((e) => e.outerHTML.slice(0, 160)))); await ui.click(page.getByRole("button", { name: "Close", exact: true }).last(), "Preview: Close");
    await ui.screen("bill-confirmed");

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const found = await ui.api("GET", "/pharmacy/sales-register?limit=50");
    const rows = found.items || found.rows || found.data || [];
    const ids = rows.filter((r) => /walk-in/i.test(JSON.stringify(r))).map((r) => r.id);
    let ok = false;
    for (const id of ids) {
      const inv = await ui.api("GET", `/pharmacy/invoices/${id}`);
      const items = inv.items || [];
      const qty = (re) => items.filter((i) => re.test(JSON.stringify(i))).reduce((s, i) => s + Number(i.quantity), 0);
      if (String(inv.invoiceDate).startsWith(today) && inv.status !== "DRAFT" && inv.paymentStatus === "PAID" && qty(/Cetirizine/i) === 10 && qty(/Sunscreen/i) === 1) ok = true;
    }
    ui.goal(ok, "a confirmed, paid pharmacy invoice today holds 10 Cetirizine 10mg Tablets and 1 Sunscreen SPF 50 Gel 50g");
  },
);
if (require.main === module) module.exports.cli();
