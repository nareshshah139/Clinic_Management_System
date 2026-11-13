const { journey } = require("./lib.cjs");

const rupees = (n) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

module.exports = journey(
  { id: "j07", title: "Owner reads the day's money, dues and reorder list", story: "REPORTS", persona: "owner" },
  async (ui) => {
    const seeded = ui.info.seeded;
    const clinic = seeded.invoices.clinic;
    const today = seeded.today.replace(/-/g, "");
    const clinicToday = clinic.filter((i) => i.invoiceNo.includes(`-${today}-`));
    const clinicReceived = clinicToday.reduce((s, i) => s + i.received, 0);
    const partPaid = clinic.find((i) => i.balance > 0 && i.received > 0);
    const overdue = clinic.find((i) => i.balance > 0 && i.received === 0);
    const pharmacyToday = seeded.invoices.pharmacy[seeded.invoices.pharmacy.length - 1];
    const stock = seeded.medicineStates;
    const page = ui.page;
    const visible = async (text) => page.getByText(text, { exact: false }).first().waitFor({ state: "visible" });

    await ui.start("/dashboard");
    await page.getByText("System Alerts").waitFor();
    await ui.screen("dashboard-landing");
    await visible(`Total amount: ₹{overdue.balance.toFixed(2)}`);
    await visible("below reorder level");

    ui.decide("Which menu entry shows today's money", false);
    await ui.click(page.getByRole("link", { name: "Daily Collection" }), "Menu: Daily Collection");
    await page.getByText("Whole day by payment mode").waitFor();
    await ui.screen("daily-collection");
    await visible(rupees(clinicReceived + pharmacyToday.total));
    await visible(rupees(clinicReceived));
    await visible(rupees(pharmacyToday.total));
    const modeRow = (mode) => page.getByRole("row", { name: new RegExp(`^${mode}\\b`) }).first();
    await modeRow("Cash").waitFor();
    await modeRow("UPI").waitFor();
    await visible("Clinic still due");
    await visible(partPaid.patient);
    await visible(rupees(partPaid.balance));

    ui.decide("Which menu entry shows what needs reordering", false);
    await ui.click(page.getByRole("link", { name: "Inventory" }), "Menu: Inventory");
    await page.getByText("What needs attention").waitFor();
    await ui.screen("inventory-today");
    ui.decide("Which attention row lists the items to reorder", false);
    await ui.click(page.getByText("Low stock", { exact: true }).first(), "Inventory Today: Low stock row");
    await page.waitForURL(/stock=LOW/);
    await page.getByText(stock.outOfStock).first().waitFor();
    await ui.screen("low-stock-list");
    for (const name of [stock.outOfStock, ...stock.low]) await visible(name);

    ui.goal(/stock=LOW/.test(page.url()), `owner saw today's takings ${rupees(clinicReceived + pharmacyToday.total)} split clinic/pharmacy and cash/UPI, ${partPaid.patient} owing ${rupees(partPaid.balance)}, the ${rupees(overdue.balance)} overdue total, and the reorder items ${[stock.outOfStock, ...stock.low].join(", ")}`);
  },
);
if (require.main === module) module.exports.cli();
