const { journey } = require("./lib.cjs");

module.exports = journey(
  { id: "j04", title: "Bill a waiting prescription, pay by UPI", story: "PHARMACY-COUNTER-01", persona: "pharmacist" },
  async (ui) => {
    const page = ui.page;
    const rx = ui.info.seeded.waitingPrescription;
    await ui.start("/dashboard");
    const waiting = page.getByRole("list", { name: "Prescriptions waiting" }).getByRole("listitem").filter({ hasText: rx.patient });
    await waiting.getByRole("link", { name: "Bill", exact: true }).waitFor();
    await ui.screen("dashboard");
    await ui.click(waiting.getByRole("link", { name: "Bill", exact: true }), "Landing page: Bill on the waiting prescription");
    await page.waitForURL(/\/sales\/bill/);
    await page.locator("#billingName").waitFor();
    await page.locator('input[id^="quantity-"]').nth(2).waitFor();
    await ui.screen("bill-prefilled");

    ui.decide("Payment method", true);
    await ui.click(page.getByRole("button", { name: "UPI", exact: true }), "Bill: Payment UPI");
    await ui.click(page.getByRole("button", { name: "Confirm and print" }), "Bill: Confirm and print");
    await page.waitForURL(/[?&]bill=/);
    await page.getByRole("link", { name: "Prescriptions waiting" }).waitFor();
    await ui.screen("bill-finished");

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const found = await ui.api("GET", `/pharmacy/sales-register?register=sales&from=${today}&to=${today}&q=${encodeURIComponent(rx.patient)}&field=patient&limit=50`);
    const rows = found.items || found.rows || found.data || [];
    const ids = rows.filter((r) => JSON.stringify(r).includes(rx.patient)).map((r) => String(r.id).replace(/^PHARMACY_BILL:/, ""));
    let ok = false;
    for (const id of ids) {
      const inv = await ui.api("GET", `/pharmacy/invoices/${id}`);
      const text = JSON.stringify(inv.items || []);
      const has = rx.medicines.every((m) => text.includes(m.name));
      if (String(inv.invoiceDate).startsWith(today) && inv.status === "CONFIRMED" && inv.paymentStatus === "COMPLETED" && has && JSON.stringify(inv.payments || inv).includes("UPI")) ok = true;
    }
    ui.goal(ok, "a confirmed, paid UPI pharmacy invoice today for Meera Shah holds Doxycycline, Adapalene and Sunscreen");
  },
);
if (require.main === module) module.exports.cli();
