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
    const reorder = [stock.outOfStock, ...stock.low];
    const page = ui.page;
    const visible = async (text) => page.getByText(text, { exact: false }).first().waitFor({ state: "visible" });

    await ui.start("/dashboard");
    await page.getByText("Today's collection").waitFor();
    await visible(rupees(clinicReceived + pharmacyToday.total));
    await visible(`Clinic ${rupees(clinicReceived)} · Pharmacy ${rupees(pharmacyToday.total)}`);
    await visible("Cash ₹");
    await visible("UPI ₹");
    const dues = page.getByRole("list", { name: "Bills due" });
    await dues.getByText(partPaid.patient).waitFor();
    const lowList = page.getByRole("list", { name: /^Low stock/ });
    for (const name of reorder) await lowList.getByText(name).waitFor();
    await ui.screen("dashboard-landing");

    const owedRows = await dues.getByRole("listitem").allInnerTexts();
    const owes = (name, balance) => owedRows.some((row) => row.includes(name) && row.includes(rupees(balance)));
    const low = await lowList.innerText();
    const owedRight = owes(partPaid.patient, partPaid.balance) && owes(overdue.patient, overdue.balance);
    ui.goal(
      owedRight && reorder.every((name) => low.includes(name)),
      `owner saw today's takings ${rupees(clinicReceived + pharmacyToday.total)} split clinic/pharmacy and cash/UPI, ${partPaid.patient} owing ${rupees(partPaid.balance)}, ${overdue.patient} owing the ${rupees(overdue.balance)} overdue, and the reorder items ${reorder.join(", ")}`,
    );
  },
);
if (require.main === module) module.exports.cli();
