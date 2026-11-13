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
    await page.getByRole("button", { name: "Start new visit" }).waitFor();
    await ui.screen("patient-detail-info");

    await ui.click(page.getByRole("tab", { name: "History" }), "Patient page: History tab");
    await page.getByText("Post-inflammatory hyperpigmentation").first().waitFor();
    await ui.screen("patient-detail-history");

    await ui.click(page.getByRole("button", { name: "Show details" }).first(), "Latest visit card: Show details");
    await page.getByText("Review in 3 weeks").first().waitFor();
    await ui.screen("latest-visit-expanded");

    const history = await page.locator("main").innerText();
    const visitDate = new Date(`${ui.info.seeded.today}T12:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
    const seenOnScreen = history.includes("Follow-up for chemical peel") && history.includes("Post-inflammatory hyperpigmentation") && history.includes(visitDate) && history.includes("Review in 3 weeks");

    await ui.click(page.getByRole("link", { name: "Patients", exact: true }), "Menu: Patients");
    await page.getByPlaceholder(/Search by name/).waitFor();
    await ui.screen("patients-list");

    ui.reenter("Patient name typed into the Patients page search (already open on the previous page)");
    await ui.click(page.getByPlaceholder(/Search by name/), "Patients page: search box");
    await ui.type(page.getByPlaceholder(/Search by name/), "Rohan", "Patients page: search for Rohan");
    await page.waitForFunction(() => document.querySelectorAll('button[aria-label^="More actions for"]').length === 1);
    await ui.screen("patients-list-filtered");

    await ui.click(page.getByRole("button", { name: /More actions for Rohan/ }), "Rohan's row: More");
    await ui.screen("row-menu");
    await ui.click(page.getByRole("menuitem", { name: "Edit" }), "Row menu: Edit");
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Edit Patient").waitFor();
    await page.waitForFunction(() => document.querySelector("#phone")?.value.length > 0);
    await ui.screen("edit-patient-dialog");

    await ui.fill(dialog.locator("#phone"), NEW_PHONE, "Edit Patient: Phone");
    await ui.click(dialog.getByRole("button", { name: "Save Changes" }), "Edit Patient: Save Changes");
    await dialog.waitFor({ state: "hidden" });
    await page.getByText(NEW_PHONE).first().waitFor();
    await ui.screen("list-after-save");

    const saved = await ui.api("GET", `/patients/${patient.id}`);
    ui.goal(
      seenOnScreen && saved.phone === NEW_PHONE,
      "the last visit (date, complaint, diagnosis, review advice) was on screen and the patient's phone is now 9822099102",
    );
  },
);
if (require.main === module) module.exports.cli();
