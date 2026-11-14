const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const seeded = new WeakMap();

const PATIENTS = [
  { name: "Asha Verma", gender: "FEMALE", phone: "9000000018", age: 34, email: "asha.verma@example.invalid" },
  { name: "Asha Varma", gender: "FEMALE", phone: "9000000019", age: 61, email: null },
  { name: "Ashok Verma", gender: "MALE", phone: "9000000020", age: 52, email: "ashok.v@example.invalid" },
  { name: "Asha Venkatesh", gender: "FEMALE", phone: "", age: 29, email: "asha.venkatesh@example.invalid" },
  { name: "Bhavna Shah", gender: "FEMALE", phone: "9000000031", age: 37, email: "bhavna.shah@example.invalid" },
  { name: "Chetan Joshi", gender: "MALE", phone: "9000000032", age: 45, email: null },
  { name: "Deepa Nair", gender: "FEMALE", phone: "9000000033", age: 31, email: "deepa.nair@example.invalid" },
  { name: "Farhan Qureshi", gender: "MALE", phone: "9000000034", age: 26, email: null },
  { name: "Gita Rao", gender: "FEMALE", phone: "", age: 63, email: null },
  { name: "Harish Patel", gender: "MALE", phone: "9000000036", age: 48, email: "harish.p@example.invalid" },
  { name: "Imran Sheikh", gender: "MALE", phone: "9000000037", age: 22, email: null },
  { name: "Jaya Krishnan", gender: "FEMALE", phone: "9000000038", age: 39, email: "jaya.k@example.invalid" },
  { name: "Kavita Deshpande", gender: "FEMALE", phone: "9000000039", age: 57, email: null },
  { name: "Lakshman Iyer", gender: "MALE", phone: "9000000040", age: 70, email: null },
  { name: "Meena Kapoor", gender: "FEMALE", phone: "9000000041", age: 33, email: null },
  { name: "Venkata Subramanian Ramachandran Krishnamurthy Iyengar", gender: "MALE", phone: "9000000043", age: 58, email: "vsr.krishnamurthy.iyengar@example.invalid" },
  { name: "Nitin Gokhale", gender: "MALE", phone: "9000000042", age: 44, email: null },
];

const ASHA_VISITS = [
  { complaint: "Acne on the face", daysAgo: 120, complete: true },
  {
    complaint: "Itchy rash on both forearms", daysAgo: 60, complete: true,
    rx: [
      { drugName: "Fucibet cream", dosage: 1, dosageUnit: "TABLET", frequency: "DAILY", duration: 14, durationUnit: "DAYS", instructions: "Thin layer, twice daily" },
      { drugName: "Cetaphil cleanser", dosage: 1, dosageUnit: "TABLET", frequency: "DAILY", duration: 30, durationUnit: "DAYS" },
    ],
  },
  { complaint: "Hair fall for 3 months", daysAgo: 21, complete: true },
  { complaint: "Follow-up: patchy scalp scaling", daysAgo: 2, complete: false },
];

async function api(page, method, url, body) {
  const result = await page.evaluate(
    async ({ method, url, body }) => {
      const response = await fetch(`/api${url}`, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: body && JSON.stringify(body),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    { method, url, body },
  );
  assert(result.status < 300, `${method} ${url} -> ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

async function openAs(browser, stack, who, viewport = DESKTOP, contextOptions = {}) {
  const context = await browser.newContext({ viewport, ...contextOptions });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  await stack.login(page, who);
  return { context, page };
}

function backdateVisit(db, visitId, daysAgo, completed) {
  const when = new Date(Date.now() - daysAgo * 864e5);
  return db.visit.update({ where: { id: visitId }, data: { createdAt: when, ...(completed && { completedAt: when }) } });
}

async function seedVisitsDemo(stack, browser) {
  if (seeded.has(stack)) return seeded.get(stack);
  const { db, branch, users } = stack;

  const owner = await db.user.findUnique({ where: { id: users.owner.id } });
  await db.user.update({ where: { id: owner.id }, data: { permissions: JSON.stringify(["*"]) } });
  const addUserWithEveryPermission = async (key, role, firstName, lastName) => {
    const email = `${firstName}.${lastName}@stack.example.invalid`.toLowerCase();
    const user = await db.user.create({
      data: { branchId: branch.id, email, firstName, lastName, role, password: owner.password, permissions: JSON.stringify(["*"]) },
    });
    users[key] = { id: user.id, email, password: users.owner.password, role, firstName, lastName };
  };
  await addUserWithEveryPermission("admin", "ADMIN", "Meera", "Kulkarni");
  const addDoctorListedBeforeTheSignedInOne = (key, firstName, lastName) => addUserWithEveryPermission(key, "DOCTOR", firstName, lastName);
  await addDoctorListedBeforeTheSignedInOne("doctor2", "Arjun", "Bhatt");

  const patients = {};
  let code = 100;
  for (const patient of PATIENTS)
    patients[patient.name] = await db.patient.create({ data: { branchId: branch.id, ...patient, patientCode: `V${code++}` } });

  const { context, page } = await openAs(browser, stack, "doctor");
  const visits = [];
  try {
    const patientId = patients["Asha Verma"].id;
    const doctorId = users.doctor.id;
    for (const spec of ASHA_VISITS) {
      const visit = await api(page, "POST", "/visits", { patientId, doctorId, complaints: [{ complaint: spec.complaint }] });
      if (spec.rx) await api(page, "POST", "/prescriptions", { patientId, doctorId, visitId: visit.id, items: spec.rx });
      if (spec.complete) await api(page, "POST", `/visits/${visit.id}/complete`, {});
      await backdateVisit(db, visit.id, spec.daysAgo, spec.complete);
      visits.push({ id: visit.id, complaint: spec.complaint, complete: spec.complete, hasPrescription: Boolean(spec.rx) });
    }
  } finally {
    await context.close();
  }

  const today = new Date(new Date().toISOString().slice(0, 10));
  const appointment = (patient, slot, status, tokenNumber) =>
    db.appointment.create({ data: { branchId: branch.id, doctorId: users.doctor.id, patientId: patients[patient].id, date: today, slot, status, tokenNumber } });
  const appointments = {
    confirmed: await appointment("Bhavna Shah", "23:30-23:45", "CONFIRMED", 1),
    cancelled: await appointment("Deepa Nair", "23:45-23:59", "CANCELLED", 2),
  };

  const demo = {
    base: stack.base,
    users,
    patients: Object.fromEntries(Object.entries(patients).map(([name, p]) => [name, p.id])),
    visits,
    appointments: Object.fromEntries(Object.entries(appointments).map(([key, a]) => [key, a.id])),
    noHistoryPatient: "Gita Rao",
    historyPatient: "Asha Verma",
  };
  seeded.set(stack, demo);
  return demo;
}

module.exports = { seedVisitsDemo, openAs, api, DESKTOP, PHONE };

if (require.main === module) {
  const { chromium } = require("playwright");
  const { bootStack } = require("../boot.cjs");
  const at = process.argv.indexOf("--minutes");
  const minutes = at > -1 ? Number(process.argv[at + 1]) : 20;
  (async () => {
    const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "ux-visits" });
    const browser = await chromium.launch();
    try {
      const demo = await seedVisitsDemo(stack, browser);
      const file = path.join(stack.output, "demo.json");
      fs.writeFileSync(file, JSON.stringify(demo, null, 2));
      console.log(`READY ${stack.base} (details in ${path.relative(process.cwd(), file)}); stops in ${minutes} min or on Ctrl-C`);
    } finally {
      await browser.close();
    }
    await new Promise((resolve) => setTimeout(resolve, minutes * 60000));
    await stack.stop();
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
