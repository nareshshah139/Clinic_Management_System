// Fake data for hand-testing and recording the Visits page (/dashboard/visits) on the demo stack.
//
// As a module:   const { seedVisitsDemo, openAs } = require("./ux-visits-seed.cjs");
//                const demo = await seedVisitsDemo(stack, browser);
// As a command:  STACK_DATABASE_URL=postgresql://user@127.0.0.1:5432/db node scripts/stack/scenarios/ux-visits-seed.cjs [--minutes 20]
//                boots a stack, seeds it, writes output/stack/ux-visits/demo.json and keeps the stack up
//                until Ctrl-C or the time limit, then stops it.
//
// Seeding the same stack twice is safe: the second call returns the first call's result.
// What is deliberately unrealistic is listed at the bottom of this comment so nobody reads it as evidence:
//   - Dr. Arjun Bhatt is created so that he is listed before Dr. Priya Menon (the stack's own doctor login).
//   - Owner, admin and the second doctor get every permission.
//   - Past visit dates are written straight to the database (the API always stamps "now").
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const seeded = new WeakMap();

const PATIENTS = [
  // name, gender, phone, age, email
  ["Asha Verma", "FEMALE", "9000000018", 34, "asha.verma@example.invalid"],
  ["Asha Varma", "FEMALE", "9000000019", 61, null],
  ["Ashok Verma", "MALE", "9000000020", 52, "ashok.v@example.invalid"],
  ["Asha Venkatesh", "FEMALE", "", 29, "asha.venkatesh@example.invalid"],
  ["Bhavna Shah", "FEMALE", "9000000031", 37, "bhavna.shah@example.invalid"],
  ["Chetan Joshi", "MALE", "9000000032", 45, null],
  ["Deepa Nair", "FEMALE", "9000000033", 31, "deepa.nair@example.invalid"],
  ["Farhan Qureshi", "MALE", "9000000034", 26, null],
  ["Gita Rao", "FEMALE", "", 63, null],
  ["Harish Patel", "MALE", "9000000036", 48, "harish.p@example.invalid"],
  ["Imran Sheikh", "MALE", "9000000037", 22, null],
  ["Jaya Krishnan", "FEMALE", "9000000038", 39, "jaya.k@example.invalid"],
  ["Kavita Deshpande", "FEMALE", "9000000039", 57, null],
  ["Lakshman Iyer", "MALE", "9000000040", 70, null],
  ["Meena Kapoor", "FEMALE", "9000000041", 33, null],
  ["Venkata Subramanian Ramachandran Krishnamurthy Iyengar", "MALE", "9000000043", 58, "vsr.krishnamurthy.iyengar@example.invalid"],
  ["Nitin Gokhale", "MALE", "9000000042", 44, null],
];

// Asha Verma's history, oldest first. The newest is left in progress.
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

/** Opens a signed-in page for one of stack.users (doctor, doctor2, owner, admin, reception, pharmacist). */
async function openAs(browser, stack, who, viewport = DESKTOP, contextOptions = {}) {
  const context = await browser.newContext({ viewport, ...contextOptions });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  await stack.login(page, who);
  return { context, page };
}

async function seedVisitsDemo(stack, browser) {
  if (seeded.has(stack)) return seeded.get(stack);
  const { db, branch, users } = stack;

  const owner = await db.user.findUnique({ where: { id: users.owner.id } });
  await db.user.update({ where: { id: owner.id }, data: { permissions: JSON.stringify(["*"]) } });
  const addUser = async (key, role, firstName, lastName) => {
    const email = `${firstName}.${lastName}@stack.example.invalid`.toLowerCase();
    const user = await db.user.create({
      data: { branchId: branch.id, email, firstName, lastName, role, password: owner.password, permissions: JSON.stringify(["*"]) },
    });
    users[key] = { id: user.id, email, password: users.owner.password, role, firstName, lastName };
  };
  await addUser("admin", "ADMIN", "Meera", "Kulkarni");
  await addUser("doctor2", "DOCTOR", "Arjun", "Bhatt");

  const patients = {};
  let code = 100;
  for (const [name, gender, phone, age, email] of PATIENTS)
    patients[name] = await db.patient.create({ data: { branchId: branch.id, name, gender, phone, age, email, patientCode: `V${code++}` } });

  const { context, page } = await openAs(browser, stack, "doctor");
  const visits = [];
  try {
    const patientId = patients["Asha Verma"].id;
    const doctorId = users.doctor.id;
    for (const spec of ASHA_VISITS) {
      const visit = await api(page, "POST", "/visits", { patientId, doctorId, complaints: [{ complaint: spec.complaint }] });
      if (spec.rx) await api(page, "POST", "/prescriptions", { patientId, doctorId, visitId: visit.id, items: spec.rx });
      if (spec.complete) await api(page, "POST", `/visits/${visit.id}/complete`, {});
      const when = new Date(Date.now() - spec.daysAgo * 864e5);
      await db.visit.update({ where: { id: visit.id }, data: { createdAt: when, ...(spec.complete && { completedAt: when }) } });
      visits.push({ id: visit.id, complaint: spec.complaint, complete: spec.complete, hasPrescription: Boolean(spec.rx) });
    }
  } finally {
    await context.close();
  }

  // Today's appointments for the signed-in doctor: one not started, one cancelled.
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
