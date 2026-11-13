const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { journey } = require("./lib.cjs");

const PHOTO = path.join(os.tmpdir(), "ux-j03-lesion.jpg");
const PHOTO_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAEsAZADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwC5RRRXjH0oUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB/9k=";

module.exports = journey(
  { id: "j03", title: "Doctor sees the next patient", story: "DOCTOR-VISIT-05", persona: "doctor" },
  async (ui) => {
    fs.writeFileSync(PHOTO, Buffer.from(PHOTO_BASE64, "base64"));
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
    await page.getByText("Visit Documentation").first().waitFor();
    await ui.screen("visit-overview");

    await ui.click(page.getByRole("tab", { name: "Prescription" }), "Visit tab: Prescription");
    await page.getByText("Chief Complaints").first().waitFor();
    await ui.screen("prescription-builder");
    await ui.type(page.locator("textarea").first(), "Itchy scaly patches on both elbows for 3 weeks", "Chief Complaints");
    await ui.type(page.getByRole("textbox", { name: "Diagnosis" }), "Psoriasis vulgaris", "Diagnosis");

    await ui.click(page.getByRole("button", { name: "Add Row" }), "Treatment: Add Row");
    const search = page.getByPlaceholder("Search medicine name...");
    await ui.type(search.nth(0), "Mometasone", "Medicine 1: search name");
    await ui.screen("medicine-search-results");
    await ui.click(page.getByRole("button", { name: "Select" }).first(), "Medicine 1: Select Mometasone Cream 0.1% 15g");
    ui.decide("Medicine 1 frequency (preset 1-0-1 or select)", false);
    await ui.click(page.getByRole("button", { name: "1-0-1", exact: true }), "Preset 1-0-1 (twice daily)");
    ui.decide("Medicine 1 duration (preset)", false);
    await ui.click(page.getByRole("button", { name: "14d", exact: true }), "Preset 14d");
    await ui.type(page.getByPlaceholder("e.g., Avoid alcohol").nth(0), "Apply twice daily", "Medicine 1: Instructions");

    await ui.type(search.nth(1), "Cetirizine", "Medicine 2: search name");
    await ui.click(page.getByRole("button", { name: "Select" }).first(), "Medicine 2: Select Cetirizine 10mg Tablet");
    ui.decide("Medicine 2 frequency (preset 0-1-0 or select)", false);
    await ui.click(page.getByRole("button", { name: "0-1-0", exact: true }), "Preset 0-1-0 (night)");
    ui.decide("Medicine 2 duration (no 10d preset)", false);
    await ui.fill(page.getByPlaceholder("#").nth(1), "10", "Medicine 2: Duration 10");
    await ui.fill(page.getByPlaceholder("e.g., Avoid alcohol").nth(1), "One tablet at night", "Medicine 2: Instructions");
    await ui.screen("prescription-filled");

    await ui.click(page.getByRole("button", { name: "Create Prescription" }), "Create Prescription");
    await page.getByText("Go to Pharmacy?").first().waitFor();
    await ui.screen("go-to-pharmacy-dialog");
    await ui.click(page.getByRole("button", { name: "Stay Here" }), "Dialog Go to Pharmacy: Stay Here");

    await ui.click(page.getByRole("tab", { name: "Vitals" }), "Visit tab: Vitals");
    await ui.screen("vitals-tab");
    await ui.click(page.getByRole("button", { name: "Mark Vitals Complete" }), "Mark Vitals Complete (nothing entered)");
    await ui.click(page.getByRole("tab", { name: "Lab Tests" }), "Visit tab: Lab Tests");
    await ui.screen("lab-tests-tab");
    await ui.click(page.getByRole("button", { name: "Save Labs" }), "Save Labs (nothing selected)");

    await ui.click(page.getByRole("tab", { name: "Photos" }), "Visit tab: Photos");
    await ui.screen("photos-tab");
    ui.decide("Photos: a photo is required to reach 80%", false);
    await ui.upload(page.locator('input[type="file"][multiple]'), PHOTO, "Photos: choose a lesion photo file");
    await page.getByText("Tag photo positions").waitFor();
    await ui.screen("tag-photo-dialog");
    await ui.click(page.getByRole("dialog").getByRole("button", { name: "Upload" }), "Tag photo dialog: Upload");
    await page.getByText("Before / After Photos (1)").waitFor();
    await ui.screen("photo-uploaded");
    await ui.click(page.getByRole("button", { name: "Complete Visit" }), "Complete Visit");
    await page.getByText("Visit completed").first().waitFor();
    await ui.screen("visit-completed");

    const appt = ui.info.seeded.appointments.today.find((a) => a.patient === "Vikram Patil");
    const visits = await ui.api("GET", `/visits?appointmentId=${appt.id}`);
    const visit = visits.visits[0];
    const rx = await ui.api("GET", `/prescriptions?visitId=${visit.id}`);
    const names = (rx.prescriptions[0]?.items || []).map((i) => i.drugName).join("|");
    ui.goal(
      visit.status === "COMPLETED" && /Mometasone/.test(names) && /Cetirizine/.test(names),
      "visit is COMPLETED and its prescription holds Mometasone and Cetirizine",
    );
  },
);
if (require.main === module) module.exports.cli();
