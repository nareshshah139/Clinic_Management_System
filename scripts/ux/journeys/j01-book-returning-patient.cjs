const { journey } = require("./lib.cjs");

module.exports = journey(
  { id: "j01", title: "Book a returning patient for tomorrow", story: "FRONT-DESK-01", persona: "reception" },
  async (ui) => {
    const { page } = ui;
    const patient = ui.info.seeded.patients.find((p) => p.id === "cuxpatient000000000000009");
    const tomorrow = ui.info.seeded.tomorrow;
    await ui.start("/dashboard");
    await ui.screen("dashboard");
    const before = await ui.api("GET", `/appointments/doctor/${ui.info.seeded.doctor.id}/schedule?date=${tomorrow}`);
    const beforeCount = (before.appointments || []).filter((a) => a.patient && a.patient.id === patient.id).length;
    await ui.click(page.getByRole("link", { name: "Appointments" }), "Menu: Appointments");
    await page.getByText("Doctor Calendar").waitFor();
    await ui.screen("calendar-today");

    ui.decide("Which doctor", true);
    ui.decide("Which day", true);
    await ui.fill(page.getByLabel("Date"), tomorrow, "Date: tomorrow");
    await page.locator('[data-calendar="CONFIRMED"]').getByText("Kavita Naik").first().waitFor();
    await ui.screen("calendar-tomorrow");

    await ui.type(page.getByPlaceholder("Search patient by name/phone"), "Kavita", "Patient search: Kavita");
    ui.decide("Which match is the patient", false);
    await ui.click(page.getByText(`Kavita Naik — ${patient.phone}`), "Patient search: pick Kavita Naik");
    await page.getByText("Selected: Kavita Naik").waitFor();
    await ui.screen("patient-selected");

    ui.decide("Scheduled or Confirmed column", false);
    ui.decide("Which free time", false);
    const tiles = page.locator('[data-calendar="CONFIRMED"] [role="button"][aria-label^="Book "]');
    await tiles.first().waitFor();
    const labels = await tiles.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    const wanted = labels.findIndex((l) => l.slice(5, 10) > "10:00");
    await ui.click(tiles.nth(wanted), `Calendar: free time ${labels[wanted].slice(5, 16)} in Confirmed`);
    await page.getByRole("heading", { name: "Book Appointment" }).waitFor();
    await ui.screen("booking-dialog");

    ui.decide("Duration", true);
    ui.decide("Appointment type", true);
    ui.decide("Room", true);
    ui.reenter("Booking dialog: patient, phone, date and time shown again");
    await ui.click(page.getByRole("button", { name: "Confirm Booking" }), "Booking dialog: Confirm Booking");
    await page.getByText("Appointment Successfully Booked!").waitFor();
    await ui.screen("booked");

    const after = await ui.api("GET", `/appointments/doctor/${ui.info.seeded.doctor.id}/schedule?date=${tomorrow}`);
    const mine = (after.appointments || []).filter((a) => a.patient && a.patient.id === patient.id);
    ui.goal(mine.length === beforeCount + 1, "an extra appointment for Kavita Naik exists tomorrow");
  },
);
if (require.main === module) module.exports.cli();
