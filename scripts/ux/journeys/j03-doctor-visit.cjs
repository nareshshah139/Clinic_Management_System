const { journey } = require("./lib.cjs");

module.exports = journey(
  { id: "j03", title: "Doctor sees the next patient", story: "DOCTOR-VISIT-05", persona: "doctor" },
  async (ui) => {
    const page = ui.page;
    await ui.start("/dashboard");
    await ui.screen("dashboard");
    await ui.click(page.getByRole("link", { name: "Appointments" }), "Menu: Appointments");
    await page.getByText("Doctor Calendar").waitFor();
    await page.locator('.group:has-text("Vikram Patil")').last().waitFor();
    ui.decide("Calendar: which doctor (pre-selected to the signed-in doctor)", true);
    await ui.screen("calendar");

    const row = page.locator('.group:has-text("Vikram Patil")').last();
    await row.scrollIntoViewIfNeeded();
    const box = await row.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await ui.click(row.locator('button[title="Start Visit"]'), "Calendar row Vikram Patil: START");
    await page.getByText("Chief Complaints").first().waitFor();
    await ui.screen("visit-opens-on-prescription");

    await ui.type(page.locator("textarea").first(), "Itchy scaly patches on both elbows for 3 weeks", "Chief Complaints");
    await ui.type(page.getByRole("textbox", { name: "Diagnosis" }), "Psoriasis vulgaris", "Diagnosis");

    const search = page.getByPlaceholder("Search medicine name...");
    await ui.type(search.nth(0), "Mometasone", "Medicine 1: search name (blank row already there)");
    await ui.screen("medicine-search-results");
    await ui.click(page.getByRole("button", { name: "Select" }).first(), "Medicine 1: Select Mometasone Cream 0.1% 15g");
    ui.decide("Medicine 1 frequency (preset 1-0-1 or select)", false);
    await ui.click(page.getByRole("button", { name: "1-0-1", exact: true }), "Preset 1-0-1 (twice daily)");
    ui.decide("Medicine 1 duration (preset)", false);
    await ui.click(page.getByRole("button", { name: "14d", exact: true }), "Preset 14d");
    await ui.type(page.getByPlaceholder("e.g., Avoid alcohol").nth(0), "Apply twice daily", "Medicine 1: Instructions");

    await ui.type(search.nth(1), "Cetirizine", "Medicine 2: search name");
    await ui.click(page.getByRole("button", { name: "Select" }).first(), "Medicine 2: Select Cetirizine 10mg Tablet");
    ui.decide("Medicine 2 frequency (preset Night or select)", false);
    await ui.click(page.getByRole("button", { name: "Night", exact: true }), "Preset Night");
    ui.decide("Medicine 2 duration (preset)", false);
    await ui.click(page.getByRole("button", { name: "10d", exact: true }), "Preset 10d");
    await ui.fill(page.getByPlaceholder("e.g., Avoid alcohol").nth(1), "One tablet at night", "Medicine 2: Instructions");
    await ui.screen("prescription-filled");

    await ui.click(page.getByRole("button", { name: "Complete visit" }), "Complete visit (saves the prescription)");
    await page.getByText("Visit completed").first().waitFor();
    await page.waitForURL(/\/dashboard$/);
    await ui.screen("back-on-dashboard");

    const appt = ui.info.seeded.appointments.today.find((a) => a.patient === "Vikram Patil");
    const visits = await ui.api("GET", `/visits?appointmentId=${appt.id}`);
    const visit = visits.visits[0];
    const rx = await ui.api("GET", `/prescriptions?visitId=${visit.id}`);
    const items = rx.prescriptions[0]?.items || [];
    const item = (name) => items.find((i) => new RegExp(name).test(i.drugName)) || {};
    const mometasone = item("Mometasone");
    const cetirizine = item("Cetirizine");
    ui.goal(
      visit.status === "COMPLETED" &&
        rx.prescriptions.length === 1 &&
        mometasone.frequency === "TWICE_DAILY" && Number(mometasone.duration) === 14 && mometasone.durationUnit === "DAYS" && mometasone.instructions === "Apply twice daily" &&
        cetirizine.frequency === "ONCE_DAILY" && Number(cetirizine.duration) === 10 && cetirizine.durationUnit === "DAYS" && cetirizine.instructions === "One tablet at night",
      "visit is COMPLETED and its one prescription holds Mometasone (twice daily, 14 days, 'Apply twice daily') and Cetirizine (once daily, 10 days, 'One tablet at night')",
    );
  },
);
if (require.main === module) module.exports.cli();
