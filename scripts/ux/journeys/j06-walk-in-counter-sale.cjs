const { journey } = require("./lib.cjs");

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

    const addMedicine = async (query, name, label) => {
      await ui.type(page.locator("#drugSearch"), query, `Bill: Medicine, type ${query}`);
      await page.locator('[role="button"]').filter({ hasText: name }).filter({ hasText: "Best match" }).waitFor();
      await ui.press("Enter", `Bill: Enter adds ${label}`);
      await page.getByRole("heading", { name, level: 4 }).waitFor();
    };
    await addMedicine("Cetirizine", "Cetirizine 10mg Tablet", "Cetirizine 10mg Tablet");
    await ui.screen("drug-added-cetirizine");
    await ui.type(page.locator(":focus"), "10", "Bill: Cetirizine Quantity 10 (cursor already there)");
    await addMedicine("Sunscreen", "Sunscreen SPF 50 Gel 50g", "Sunscreen SPF 50 Gel 50g");
    await ui.screen("bill-two-items");

    ui.decide("Payment method", true);
    await ui.click(page.getByRole("button", { name: "Confirm and print" }), "Bill: Confirm and print");
    await page.waitForURL(/[?&]bill=/);
    await page.getByRole("link", { name: "New sale" }).waitFor();
    await ui.screen("bill-finished");

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const found = await ui.api("GET", `/pharmacy/sales-register?register=sales&from=${today}&to=${today}&limit=50`);
    const ids = (found.rows || []).filter((r) => String(r.id).startsWith("PHARMACY_BILL:")).map((r) => String(r.id).split(":")[1]);
    const seedGst = {};
    for (const name of ["Cetirizine 10mg Tablet", "Sunscreen SPF 50 Gel 50g"]) {
      const drug = (await ui.api("GET", `/drugs/autocomplete?q=${encodeURIComponent(name)}&limit=5`)).find((d) => (d.stockName || d.name) === name || d.name === name);
      seedGst[name] = Number(drug.gstRate);
    }
    if (seedGst["Cetirizine 10mg Tablet"] !== 12 || seedGst["Sunscreen SPF 50 Gel 50g"] !== 18) throw Error(`seed GST rates changed: ${JSON.stringify(seedGst)}`);
    let ok = false;
    for (const id of ids) {
      const inv = await ui.api("GET", `/pharmacy/invoices/${id}`);
      const items = inv.items || [];
      const qty = (re) => items.filter((i) => re.test(JSON.stringify(i))).reduce((s, i) => s + Number(i.quantity), 0);
      const gst = (re) => items.filter((i) => re.test(JSON.stringify(i))).map((i) => Number(i.taxPercent));
      const taxRight = gst(/Cetirizine/i).every((t) => t === seedGst["Cetirizine 10mg Tablet"]) && gst(/Sunscreen/i).every((t) => t === seedGst["Sunscreen SPF 50 Gel 50g"]);
      if (inv.status === "CONFIRMED" && inv.paymentStatus === "COMPLETED" && inv.paymentMethod === "CASH" && qty(/Cetirizine/i) === 10 && qty(/Sunscreen/i) === 1 && taxRight) ok = true;
    }
    ui.goal(ok, "a confirmed, paid cash pharmacy invoice today holds 10 Cetirizine 10mg Tablets and 1 Sunscreen SPF 50 Gel 50g, each taxed at its own GST rate");
  },
);
if (require.main === module) module.exports.cli();
