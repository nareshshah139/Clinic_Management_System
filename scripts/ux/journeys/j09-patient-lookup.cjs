const { journey } = require("./lib.cjs");

const NEW_PHONE = "9822099102";

module.exports = journey(
  { id: "j09", title: "Look up a patient's last visit and fix their phone", story: "PATIENT-RECORDS-03", persona: "doctor" },
  async (ui) => {
    const page = ui.page;
    const patient = ui.info.seeded.patients.find((p) => p.id === "cuxpatient000000000000002");
    await ui.start("/dashboard");
    await page.getByLabel("My patients").getByText(patient.name).waitFor();
    await ui.screen("dashboard");

    ui.decide("Which way to the patient: header search, My Patients card, Patients page", false);
    await ui.click(page.getByLabel("My patients").getByRole("link", { name: new RegExp(patient.name) }), "My Patients card: Rohan Kulkarni");
    await page.getByRole("heading", { name: "Last visit" }).waitFor();
    await page.getByText("Cetirizine").first().waitFor();
    await ui.screen("patient-page-last-visit");

    const text = await page.locator("main").innerText();
    const visitDate = new Date(`${ui.info.seeded.today}T12:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
    const seenOnScreen = ["Follow-up for chemical peel", "Post-inflammatory hyperpigmentation", visitDate, "Review in 3 weeks", "Adapalene", "Cetirizine"].every((part) => text.includes(part));

    await ui.click(page.getByRole("button", { name: "Edit", exact: true }), "Patient page: Edit");
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Edit patient").waitFor();
    await page.waitForFunction(() => document.querySelector("#phone")?.value.length > 0);
    await ui.screen("edit-patient-dialog");

    await ui.fill(dialog.locator("#phone"), NEW_PHONE, "Edit patient: Phone");
    await ui.click(dialog.getByRole("button", { name: "Save changes" }), "Edit patient: Save changes");
    await dialog.waitFor({ state: "hidden" });
    await page.getByText(NEW_PHONE).first().waitFor();
    await ui.screen("patient-page-after-save");

    const saved = await ui.api("GET", `/patients/${patient.id}`);
    ui.goal(
      seenOnScreen && saved.phone === NEW_PHONE && String(saved.dob).slice(0, 10) === "1988-07-19",
      "the last visit (date, complaint, diagnosis, review advice) and the last prescription (Adapalene, Cetirizine) were on screen, the phone is now 9822099102 and the date of birth is still 1988-07-19",
    );
  },
);
if (require.main === module) module.exports.cli();
