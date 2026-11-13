const { journey } = require("./lib.cjs");

const FIRST = process.env.UX_J02_FIRST || "Farhan";
const LAST = "Qureshi";
const PHONE = process.env.UX_J02_PHONE || "9890012345";

module.exports = journey(
  { id: "j02", title: "Walk-in new patient onto today's list", story: "FRONT-DESK-05", persona: "reception" },
  async (ui) => {
    const page = ui.page;
    await ui.start("/dashboard");
    await ui.screen("dashboard");
    await ui.click(page.getByRole("link", { name: "Patients" }), "Menu: Patients");
    await page.getByRole("button", { name: "New Patient" }).waitFor();
    await ui.screen("patients-list");
    await ui.click(page.getByRole("button", { name: "New Patient" }), "Patients: New Patient");
    await page.getByRole("dialog").getByText("Create Patient").waitFor();
    await ui.screen("create-patient-dialog");
    const dialog = page.getByRole("dialog");
    await ui.fill(dialog.getByLabel("First Name"), FIRST, "Create Patient: First Name");
    await ui.fill(dialog.getByLabel("Last Name"), LAST, "Create Patient: Last Name");
    await ui.fill(dialog.getByLabel("Age (years)"), "34", "Create Patient: Age (years)");
    ui.decide("Gender (defaults to Other, not a sensible value)", false);
    await ui.click(dialog.locator("#gender"), "Create Patient: Gender dropdown");
    await ui.click(page.getByRole("option", { name: "Male", exact: true }), "Create Patient: Gender = Male");
    await ui.fill(dialog.getByLabel("Phone", { exact: true }), PHONE, "Create Patient: Phone");
    ui.decide("Patient Type (Non walk-in default hides the booking path)", false);
    await ui.click(dialog.locator("#patientType"), "Create Patient: Patient Type dropdown");
    await ui.click(page.getByRole("option", { name: "Walk-in", exact: true }), "Create Patient: Patient Type = Walk-in");
    await dialog.getByText("Appointment Type (walk-in)").waitFor();
    await ui.screen("walk-in-fields-revealed");
    ui.decide("Doctor (for walk-in) (no default, nothing books if left empty)", false);
    await ui.click(dialog.locator("#walkinDoctorId"), "Create Patient: Doctor (for walk-in) dropdown");
    await ui.click(page.getByRole("option", { name: /Priya Menon/ }), "Create Patient: Doctor = Dr. Priya Menon");
    await ui.screen("form-filled");
    await ui.click(dialog.getByRole("button", { name: "Create", exact: true }), "Create Patient: Create");
    await page.getByText("Walk-in appointment booked").first().waitFor();
    await ui.screen("booked-toast-on-patients-list");

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const found = await ui.api("GET", `/patients?search=${PHONE}&limit=5`);
    const rows = found.data || found.patients || found.items || found;
    const patient = (Array.isArray(rows) ? rows : []).find((p) => p.phone === PHONE);
    const appts = patient ? await ui.api("GET", `/appointments?patientId=${patient.id}&limit=20`) : null;
    const list = appts ? appts.data || appts.appointments || appts.items || appts : [];
    const doctorId = ui.info.users.doctor.id;
    const mine = (Array.isArray(list) ? list : []).filter((a) => String(a.date).slice(0, 10) === today && (a.doctorId || a.doctor?.id) === doctorId);
    console.error(JSON.stringify({found,appts}).slice(0,1800));
    ui.goal(Boolean(patient) && mine.length === 1, "Farhan Qureshi exists and has one appointment today with Dr. Priya Menon");
  },
);
if (require.main === module) module.exports.cli();
