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
    await ui.click(page.getByRole("link", { name: "New patient" }), "Landing page: New patient");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name *").waitFor();
    await ui.screen("new-patient-dialog");
    ui.decide("Gender (required, none preselected)", false);
    ui.decide("Doctor (preselected: the only doctor)", true);
    await ui.fill(dialog.getByLabel("Name *"), `${FIRST} ${LAST}`, "New patient: Name");
    await ui.fill(dialog.getByLabel("Age (years)"), "34", "New patient: Age");
    await ui.click(dialog.getByRole("radio", { name: "Male", exact: true }), "New patient: Gender = Male");
    await ui.fill(dialog.getByLabel("Phone *"), PHONE, "New patient: Phone");
    await dialog.getByRole("combobox", { name: /Doctor/ }).filter({ hasText: "Priya Menon" }).waitFor();
    await ui.screen("form-filled");
    await ui.click(dialog.getByRole("button", { name: "Register and book" }), "New patient: Register and book");
    const result = dialog.getByRole("status");
    await result.getByText(/is booked with Dr\. Priya Menon today at/).waitFor();
    await ui.screen("booked");
    const shown = await result.innerText();

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const found = await ui.api("GET", `/patients?search=${PHONE}&limit=5`);
    const rows = found.data || found.patients || found.items || found;
    const patient = (Array.isArray(rows) ? rows : []).find((p) => p.phone === PHONE);
    const appts = patient ? await ui.api("GET", `/appointments?patientId=${patient.id}&limit=20`) : null;
    const list = appts ? appts.data || appts.appointments || appts.items || appts : [];
    const doctorId = ui.info.users.doctor.id;
    const mine = (Array.isArray(list) ? list : []).filter((a) => String(a.date).slice(0, 10) === today && (a.doctorId || a.doctor?.id) === doctorId);
    const booked = (Array.isArray(list) ? list : []).filter((a) => (a.doctorId || a.doctor?.id) === doctorId);
    ui.goal(
      Boolean(patient) && booked.length === 1 && mine.length === 1 && shown.includes(`at ${mine[0].slot}`) && shown.includes(`token ${mine[0].tokenNumber}`),
      `Farhan Qureshi is registered and on today's list for Dr. Priya Menon at ${mine[0] ? mine[0].slot : "no slot"} (booked for ${booked[0] ? String(booked[0].date).slice(0, 10) : "no date"}, today is ${today})`,
    );
  },
);
if (require.main === module) module.exports.cli();
