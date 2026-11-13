const { journey } = require("./lib.cjs");

module.exports = journey(
  { id: "j04", title: "Bill a waiting prescription, pay by UPI", story: "PHARMACY-COUNTER-01", persona: "pharmacist" },
  async (ui) => {
    const page = ui.page;
    const rx = ui.info.seeded.waitingPrescription;
    await ui.start("/dashboard");
    await page.getByRole("link", { name: "Pharmacy Counter", exact: true }).waitFor();
    await ui.screen("dashboard");
    await ui.click(page.getByRole("link", { name: "Pharmacy Counter", exact: true }), "Menu: Pharmacy Counter");
    await page.getByRole("button", { name: "Open bill" }).waitFor();
    await page.getByText(rx.patient).first().waitFor();
    await ui.screen("counter-cockpit");
    ui.decide("Which of three Bill buttons (header Bill, Open bill, Collect payment) to press", false);
    await ui.click(page.getByRole("button", { name: "Open bill" }), "Counter: Open bill");
    await page.waitForURL(/\/sales\/bill/);
    await page.locator("#billingName").waitFor();
    await page.locator('input[id^="quantity-"]').nth(2).waitFor();
    await ui.screen("bill-prefilled");

    ui.decide("Payment method", true);
    const method = page.locator("label", { hasText: "Payment Method" }).locator("xpath=..").getByRole("combobox");
    await ui.click(method, "Bill: Payment Method");
    await page.waitForTimeout(1500);
    console.log("DBG", await page.locator("label", { hasText: "Payment Method" }).count(), await method.count(), await page.getByRole("option").allInnerTexts(), await page.locator("[role=listbox]").count());
    await ui.screen("payment-options");
    try { await page.getByRole("option", { name: "UPI" }).click({ timeout: 5000, trial: true }); } catch (e) { console.log("DBG2", e.message); }
    await ui.click(page.getByRole("option", { name: "UPI" }), "Bill: Payment Method, choose UPI");
    await ui.click(page.getByRole("button", { name: /Print Preview/ }), "Bill: Print Preview");
    await page.getByRole("button", { name: "Confirm & Print" }).waitFor();
    await ui.screen("print-preview");
    await ui.click(page.getByRole("button", { name: "Confirm & Print" }), "Preview: Confirm & Print");
    await page.getByRole("button", { name: "Invoice Confirmed" }).waitFor();
    await ui.screen("confirmed-preview");
    await ui.click(page.getByRole("button", { name: "Close" }).last(), "Preview: Close");
    await ui.screen("bill-confirmed");

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const found = await ui.api("GET", "/pharmacy/sales-register?limit=50");
    const rows = found.items || found.rows || found.data || [];
    const ids = rows.filter((r) => JSON.stringify(r).includes(rx.patient)).map((r) => r.id);
    let ok = false;
    for (const id of ids) {
      const inv = await ui.api("GET", `/pharmacy/invoices/${id}`);
      const text = JSON.stringify(inv.items || []);
      const has = rx.medicines.every((m) => text.includes(m.name));
      if (String(inv.invoiceDate).startsWith(today) && inv.status !== "DRAFT" && inv.paymentStatus === "PAID" && has && JSON.stringify(inv.payments || inv).includes("UPI")) ok = true;
    }
    ui.goal(ok, "a confirmed, paid UPI pharmacy invoice today for Meera Shah holds Doxycycline, Adapalene and Sunscreen");
  },
);
if (require.main === module) module.exports.cli();
