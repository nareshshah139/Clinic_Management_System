const { journey } = require("./lib.cjs");

module.exports = journey(
  { id: "j05", title: "Bill a consultation and collect a balance", story: "CLINIC-BILLING-01/02", persona: "reception" },
  async (ui) => {
    const page = ui.page;
    const today = page.getByRole("list", { name: "Today's appointments" }).getByRole("listitem");
    const sneha = today.filter({ hasText: "Sneha Deshpande" });
    const rohan = today.filter({ hasText: "Rohan Kulkarni" });
    const dialog = page.getByRole("dialog");

    await ui.start("/dashboard");
    await sneha.getByRole("button").waitFor();
    await ui.screen("dashboard");

    await ui.click(sneha.getByRole("button"), "Landing page row (Sneha): bill chip 'Not billed'");
    await dialog.getByRole("heading", { name: /Bill for/ }).waitFor();
    await dialog.getByText("Create bill").first().waitFor();
    await ui.screen("sneha-create-bill-dialog");
    ui.decide("Bill line (consultation type)", true);
    ui.decide("Fee amount", true);
    ui.decide("Paid now amount", true);
    ui.decide("Payment mode", true);
    await ui.click(dialog.getByRole("button", { name: /^Create bill and record/ }), "Bill dialog: Create bill and record payment");
    await dialog.waitFor({ state: "hidden" });
    await sneha.getByRole("button", { name: /paid/i }).waitFor();
    await ui.screen("landing-sneha-paid");

    await ui.click(rohan.getByRole("button"), "Landing page row (Rohan): bill chip with balance due");
    await dialog.getByText("Record payment").waitFor();
    await ui.screen("rohan-record-payment-dialog");
    ui.decide("Amount received", true);
    ui.decide("Payment mode (UPI, not the Cash default)", false);
    await ui.click(dialog.getByRole("radio", { name: "UPI" }), "Bill dialog: mode UPI");
    await ui.click(dialog.getByRole("button", { name: /^Record .* payment$/ }), "Bill dialog: Record payment");
    await dialog.waitFor({ state: "hidden" });
    await rohan.getByRole("button", { name: /paid/i }).waitFor();
    await ui.screen("landing-both-paid");

    const list = (body) => body?.invoices || body?.data || body?.items || (Array.isArray(body) ? body : []);
    const billed = async (name, appointmentId) =>
      list(await ui.api("GET", `/billing/invoices?search=${encodeURIComponent(name)}&limit=50`)).filter((i) => i.appointmentId === appointmentId);
    const forSneha = await billed("Sneha", "cuxappttoday0000000000005");
    const forRohan = await billed("Rohan", "cuxappttoday0000000000002");
    ui.goal(
      forSneha.length === 1 && forRohan.length >= 1 && [...forSneha, ...forRohan].every((i) => Number(i.balance) === 0),
      "Sneha's consultation invoice and Rohan's part-paid invoice both have zero balance",
    );
  },
);
if (require.main === module) module.exports.cli();
