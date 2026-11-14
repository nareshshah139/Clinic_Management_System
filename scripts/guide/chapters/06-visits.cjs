const zlib = require("node:zlib");

const sessions = {};
async function login(h, who) {
  if (sessions[who]) return sessions[who];
  const user = h.stack.users[who];
  for (let attempt = 0; attempt < 20 && !sessions[who]; attempt++) {
    const res = await fetch(`${h.stack.api}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: user.email, password: user.password }) });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 8000)); continue; }
    const data = await res.json();
    sessions[who] = { bearer: data.access_token || data.accessToken || data.token, cookie: (res.headers.get("set-cookie") || "").split(",").map((c) => c.split(";")[0].trim()).join("; ") };
  }
  if (!sessions[who]) throw Error(`login ${who} kept hitting the rate limit`);
  return sessions[who];
}
async function call(h, who, method, route, body, raw) {
  const s = await login(h, who);
  const auth = { ...(s.bearer ? { Authorization: `Bearer ${s.bearer}` } : {}), Cookie: s.cookie };
  const res = await fetch(`${h.stack.api}${route}`, raw
    ? { method, headers: auth, body: raw }
    : { method, headers: { "Content-Type": "application/json", ...auth }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw Error(`${method} ${route} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// Draws a close-up of a scalp parting: tan skin with dark hair strands. `density` sets how much scalp shows.
function scalpPng(width, height, density, seed) {
  let x = seed;
  const rand = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const px = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let i = 0; i < width; i++) {
      const shade = 0.92 + 0.08 * Math.sin(i / 37 + y / 53) - 0.12 * Math.abs(i - width / 2) / width;
      const o = (y * width + i) * 3;
      px[o] = 214 * shade; px[o + 1] = 164 * shade; px[o + 2] = 132 * shade;
    }
  const strands = Math.round(width * height * density / 900);
  for (let s = 0; s < strands; s++) {
    const side = rand() < 0.5 ? -1 : 1;
    let cx = width / 2 + side * (8 + rand() * width / 2), cy = rand() * height;
    const angle = (side < 0 ? Math.PI * 0.9 : Math.PI * 0.1) + (rand() - 0.5) * 0.5;
    const len = 60 + rand() * 120, tone = 20 + rand() * 30;
    for (let t = 0; t < len; t++) {
      cx += Math.cos(angle); cy += Math.sin(angle) + (rand() - 0.5) * 0.4;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
        const ix = Math.round(cx) + dx, iy = Math.round(cy) + dy;
        if (ix < 0 || iy < 0 || ix >= width || iy >= height) continue;
        const o = (iy * width + ix) * 3;
        px[o] = tone; px[o + 1] = tone * 0.8; px[o + 2] = tone * 0.7;
      }
    }
  }
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) px.copy(rows, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

const PATIENT = "Sunita Sharma";
const EARLIER = "crown for 6 months";
const REVIEW = "Hair fall review after 8 weeks";
const pid = (h, name) => h.seed.patients.find((p) => p.name === name).id;
async function myVisits(h) {
  const list = await call(h, "doctor", "GET", `/visits?patientId=${pid(h, PATIENT)}&limit=50`);
  const visits = list.visits || list.data || list;
  const has = (text) => visits.find((v) => JSON.stringify(v.complaints || "").includes(text));
  return { earlier: has(EARLIER)?.id, review: has(REVIEW)?.id };
}
const visitUrl = async (h, which) => `/dashboard/visits?visitId=${(await myVisits(h))[which]}&patientId=${pid(h, PATIENT)}`;

async function openVisit(page, h, which, tab) {
  await h.goto(await visitUrl(h, which));
  await page.getByRole("tab", { name: "Overview" }).waitFor({ timeout: 60000 });
  if (tab) await page.getByRole("tab", { name: tab, exact: true }).click();
  await h.settle(1200);
}
const panel = '[role="tabpanel"][data-state="active"]';

async function loginInPage(page, h, email) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const status = await page.evaluate(async ({ identifier, password }) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) })).status, { identifier: email, password: h.stack.users.doctor.password });
    if (status !== 429) return;
    await page.waitForTimeout(8000);
  }
}
const NURSE = "asha.kulkarni@stack.example.invalid";

module.exports = {
  id: "06-visits",
  title: "Visits",
  intro:
    "A visit is the clinical record of one consultation: vitals, photos, lab results, the prescription and the notes the doctor writes. The Visits page is where doctors document a consultation from start to finish, and where nurses record vitals and photos before the doctor sees the patient. This chapter covers starting, filling, saving and completing a visit. Writing and printing the prescription has its own chapter.",
  setup: async (h) => {
    const found = await myVisits(h);
    const doctorId = h.stack.users.doctor.id;
    if (!found.earlier) {
      const visit = await call(h, "doctor", "POST", "/visits", {
        patientId: pid(h, PATIENT), doctorId,
        vitals: { systolicBP: 132, diastolicBP: 84, heartRate: 78, weight: 66, height: 156 },
        complaints: [{ complaint: `Hair fall and thinning at the ${EARLIER}` }],
        diagnosis: [{ diagnosis: "Female pattern hair loss, Ludwig grade 1" }],
        treatmentPlan: { followUpInstructions: "Review in 8 weeks with photos", dermatology: { investigations: ["CBC", "Ferritin", "Vitamin D", "TSH"], labResults: { CBC: { value: "11.2", unit: "g/dL Hb" }, Ferritin: { value: "18", unit: "ng/mL" }, "Vitamin D": { value: "14", unit: "ng/mL" }, TSH: { value: "2.6", unit: "mIU/L" } } } },
      });
      const form = new FormData();
      form.append("files", new Blob([scalpPng(960, 640, 0.9, 7)], { type: "image/png" }), "crown-before.png");
      form.append("files", new Blob([scalpPng(960, 640, 0.7, 11)], { type: "image/png" }), "parting-before.png");
      form.append("positions", JSON.stringify(["FRONT", "CLOSE_UP"]));
      await call(h, "doctor", "POST", `/visits/${visit.id}/photos`, undefined, form);
      const db = h.db();
      await db.visit.update({ where: { id: visit.id }, data: { createdAt: new Date(Date.now() - 56 * 86400000) } });
      await db.$disconnect();
    }
    if (!found.review) {
      await call(h, "doctor", "POST", "/visits", {
        patientId: pid(h, PATIENT), doctorId,
        complaints: [{ complaint: `${REVIEW}. Less hair on the pillow, new short hairs at the parting.` }],
      });
    }
  },
  sections: [
    {
      title: "Open the Visits page",
      who: "Doctors, nurses, admins, owners",
      body: [
        "Open <b>Visits</b> from the Clinical part of the menu. The first screen has three boxes. <b>Your Role &amp; Permissions</b> shows the role you are signed in with and what it lets you record. <b>Start New Visit</b> is where you choose the patient and doctor. <b>Available Features</b> lists the parts of the visit your role can fill in.",
        "Most visits are opened from somewhere else: the <b>Start Visit</b> button on an appointment, a patient's page, or a link on the Dashboard. All of them land on the visit form described below.",
      ],
      shots: [
        {
          file: "setup",
          as: "doctor",
          caption: "The Visits page for a doctor.",
          run: async (page, h) => {
            await h.goto("/dashboard/visits");
            await page.getByText("Start New Visit").waitFor();
            await h.mark(page.getByText("Your Role & Permissions"), 1);
            await h.mark(page.getByPlaceholder("Search name, phone, or email"), 2);
            await h.mark(page.getByRole("combobox").first(), 3);
            await h.mark(page.getByText("Available Features", { exact: true }), 4);
          },
        },
      ],
      fields: [
        ["1. Your Role &amp; Permissions", "Your role and a one-line summary. A purple <b>Doctor</b> badge means full access to every part of the visit."],
        ["2. Select Patient", "Search by name, phone or email."],
        ["3. Select Doctor", "The consulting doctor."],
        ["4. Available Features", "What your role can record. For a doctor: complete documentation, dermatology assessments and treatment planning."],
      ],
      fieldsHeading: ["On screen", "What it is"],
    },
    {
      title: "Start a new visit",
      who: "Doctors and nurses",
      body: [
        "Use this when the patient has no appointment in the system, for example a walk-in, or when you want to document a visit straight away.",
      ],
      steps: [
        "Click in <b>Select Patient</b> and type part of the patient's name, phone number or email. Matching patients appear in a list. Use the arrow keys and Enter, or click the patient.",
        "Check <b>Select Doctor</b>. The box starts with the first doctor in the clinic's list, which may not be you. Click it and choose the consulting doctor.",
        "Two tabs appear below. <b>Ready to Start</b> shows the patient and doctor you chose. Click <b>Start Visit Documentation</b>.",
      ],
      shots: [
        {
          file: "patient-search",
          as: "doctor",
          caption: "Typing part of a name lists the matching patients.",
          run: async (page, h) => {
            await h.goto("/dashboard/visits");
            await page.getByPlaceholder("Search name, phone, or email").pressSequentially("Sunita", { delay: 50 });
            await page.getByRole("button", { name: /Sunita Sharma/ }).first().waitFor();
            await h.settle(400);
          },
        },
        {
          file: "ready",
          as: "doctor",
          caption: "Patient and doctor chosen. Click Start Visit Documentation.",
          run: async (page, h) => {
            await h.goto("/dashboard/visits");
            await page.getByPlaceholder("Search name, phone, or email").pressSequentially("Sunita", { delay: 50 });
            await page.getByRole("button", { name: /Sunita Sharma/ }).first().click();
            await page.getByRole("combobox").first().click();
            await page.getByRole("option", { name: /Priya Menon/ }).click();
            await page.getByRole("button", { name: "Start Visit Documentation" }).waitFor();
            await h.mark(page.getByRole("button", { name: "Start Visit Documentation" }), 1);
            await h.settle(400);
          },
          target: (page) => page.locator('[data-slot="card"]:has-text("Start New Visit")').last(),
        },
      ],
      tips: ["If you have not chosen a doctor, the Ready to Start tab says <i>Please select a doctor to start the visit</i>."],
    },
    {
      title: "Check the patient's history before you start",
      who: "Doctors and nurses",
      body: [
        "After choosing a patient, click the <b>Patient History</b> tab next to Ready to Start. It lists the patient's earlier visits and appointments, newest first. The newest is highlighted and labelled <b>Most recent record</b>.",
        "Each card shows the date, the doctor, the visit status, the chief complaint and the diagnosis, and counts of photos and prescription items. Click <b>Show details</b> to see everything recorded, and <b>Full details</b> or <b>Compact view</b> to switch between the full record and a short summary. <b>Resume session</b> opens that visit for editing. <b>View Prescription</b> (inside the details) shows the medicines given at that visit, with a <b>Print</b> button. <b>Refresh</b> reloads the list.",
      ],
      shots: [
        {
          file: "setup-history",
          as: "doctor",
          caption: "The Patient History tab on the start screen, with the most recent visit opened.",
          viewport: { width: 1440, height: 1400 },
          run: async (page, h) => {
            await h.goto("/dashboard/visits");
            await page.getByPlaceholder("Search name, phone, or email").pressSequentially("Sunita", { delay: 50 });
            await page.getByRole("button", { name: /Sunita Sharma/ }).first().click();
            await page.getByRole("tab", { name: "Patient History" }).click();
            await page.getByRole("button", { name: "Show details" }).first().waitFor({ timeout: 60000 });
            const seeded = page.locator('[data-slot="card"]:has-text("Telogen effluvium")').last();
            await seeded.getByRole("button", { name: "Show details" }).click();
            await h.settle(600);
          },
          target: (page) => page.locator(panel).last(),
        },
        {
          file: "view-prescription",
          as: "doctor",
          caption: "View Prescription shows what was prescribed at an earlier visit.",
          run: async (page, h) => {
            await page.getByRole("button", { name: "View Prescription" }).first().click();
            await page.getByRole("dialog", { name: "Prescription Details" }).getByText("Medications").first().waitFor({ timeout: 60000 });
            await h.settle(500);
          },
          target: '[role="dialog"]',
          after: async (page) => { await page.keyboard.press("Escape"); },
        },
      ],
      shotLayout: "row",
      fields: [
        ["DRAFT / IN PROGRESS / COMPLETED", "The visit's status. Draft means it has not been saved yet. In progress means it is saved but the doctor has not completed it."],
        ["Appointment", "A card labelled Appointment is a booking with no visit documentation yet."],
        ["Photos / Rx Items", "How many photos and prescription items the visit has."],
      ],
    },
    {
      title: "Open a visit from an appointment",
      who: "Doctors",
      body: [
        "When the patient has an appointment, start the visit from the appointment instead: click <b>Start Visit</b> on the appointment in the calendar (see the Appointments chapter). The visit opens with the patient, doctor and appointment already filled in.",
        "A visit opened this way shows a blue <b>From Appointment</b> badge next to the page title and <b>Linked to Appointment</b> in the visit header. The line under the title adds the appointment's time slot and type. A <b>Back to Calendar</b> button returns to the calendar.",
      ],
      shots: [
        {
          file: "from-appointment",
          as: "doctor",
          caption: "A visit opened from a checked-in appointment.",
          run: async (page, h) => {
            const patientId = pid(h, "Mohammed Irfan Khan");
            await h.goto(`/dashboard/visits?patientId=${patientId}&appointmentId=${h.seed.appointments[1]}&doctorId=${h.stack.users.doctor.id}&autoStart=true`);
            await page.getByText("Linked to Appointment").waitFor({ timeout: 60000 });
            await h.settle(1000);
            await h.mark(page.getByText("From Appointment"), 1);
            await h.mark(page.getByTestId("visit-identity").last(), 2);
            await h.mark(page.getByText("Linked to Appointment"), 3);
            await h.mark(page.getByRole("button", { name: "Back to Calendar" }), 4);
          },
        },
      ],
      fields: [
        ["1. From Appointment", "This visit belongs to an appointment."],
        ["2. Patient line", "Patient name, age and sex, the doctor, the appointment time and type. It stays at the top while you scroll."],
        ["3. Linked to Appointment", "Saving this visit records it against the appointment."],
        ["4. Back to Calendar", "Returns to the page you came from."],
      ],
    },
    {
      title: "The parts of the visit form",
      who: "Doctors and nurses",
      body: [
        "Every visit, new or resumed, opens on the same form. The line at the top shows who the visit is for. The small row of coloured steps under the title tracks the patient's progress (start, document, prescribe and so on) with <b>Continue</b>, <b>View</b> and <b>Bill</b> shortcuts. <b>Back to Setup</b> returns to the start screen.",
      ],
      shots: [
        {
          file: "form",
          as: "doctor",
          caption: "A visit being documented. The tabs across the middle hold each part of the record.",
          run: async (page, h) => {
            await openVisit(page, h, "review");
            await h.mark(page.getByText("Patient Context", { exact: true }), 1);
            await h.mark(page.getByText(/^Visit #\d+/).first(), 2);
            await h.mark(page.locator("#visit-consultation-type"), 3);
            await h.mark(page.getByRole("tablist").last(), 4);
            await h.mark(page.getByRole("button", { name: "Shortcuts" }), 5);
          },
        },
      ],
      fields: [
        ["1. Patient Context", "Name, patient ID, age, sex and phone, with red <b>ALLERGIES</b> and blue <b>Medical History</b> boxes when recorded, and the two most recent visits with their diagnoses. Click the <b>X</b> to hide it, and <b>Show Patient Context</b> to bring it back."],
        ["2. Visit header", "The visit number for this patient, the status (IN PROGRESS or COMPLETED), your role, the progress percentage, the photo count and the save status."],
        ["3. Consultation type", "<b>In-person</b> or <b>Tele-video</b>. See the next section."],
        ["4. Tabs", "Overview, Vitals, Photos, Prescription, Lab Tests, Customization and History. Nurses see fewer tabs. A green dot on a tab means that part is complete."],
        ["5. Shortcuts", "Lists the keyboard shortcuts. <b>Visit Workflow Tour</b> next to it walks you through the form."],
      ],
      after: [
        "The <b>Overview</b> tab sums up the visit. <b>Visit Information</b> shows the visit number, status and who is recording. <b>Progress Summary</b> marks each part Complete or Pending and shows the overall progress. <b>Quick Actions</b> jump to <b>Record Vitals</b> or <b>Capture Photos</b> for staff who do those first.",
      ],
    },
    {
      title: "Tele-video consultations",
      who: "Doctors",
      body: [
        "If you see the patient by video, change <b>Consultation type</b> to <b>Tele-video</b> before saving. A box appears: tick <b>Patient consented to tele-video consultation</b> once the patient has agreed. The consent is recorded with your name and the time of saving.",
        "Until consent is ticked, the visit cannot be saved and automatic saving pauses. The prescription of a tele-video visit carries a tele-video label and disclaimer (see the Prescriptions chapter).",
      ],
      shots: [
        {
          file: "tele-video",
          as: "doctor",
          caption: "Tele-video chosen, waiting for the consent tick.",
          run: async (page, h) => {
            await h.goto(`/dashboard/visits?patientId=${pid(h, "Rahul Bhatt")}&doctorId=${h.stack.users.doctor.id}&autoStart=true`);
            await page.locator("#visit-consultation-type").selectOption("TELE_VIDEO");
            await h.settle(400);
          },
          target: (page) => page.locator('[data-slot="card"]:has(#visit-consultation-type)').last(),
        },
      ],
    },
    {
      title: "Record vitals",
      who: "Doctors and nurses",
      body: [
        "Nurses usually take vitals before the patient goes in to the doctor. The values are shared with the vitals on the Prescription tab and print on the prescription.",
      ],
      steps: [
        "Click the <b>Vitals</b> tab.",
        "Type the readings. <b>BMI</b> fills itself in from height and weight.",
        "Click <b>Mark Vitals Complete</b>. The visit is saved and the Vitals tab gets a green dot.",
      ],
      shots: [
        {
          file: "vitals",
          as: "doctor",
          caption: "Vitals for a review visit, saved.",
          run: async (page, h) => {
            await openVisit(page, h, "review", "Vitals");
            const box = (label) => page.locator(`${panel} div:has(> label:text-is("${label}")) input`).first();
            for (const [label, value] of [["BP Systolic", "128"], ["BP Diastolic", "82"], ["Heart Rate", "76"], ["Temperature", "98.4"], ["Weight", "65"], ["Height", "156"], ["Resp. Rate", "16"], ["Pain Score (0-10)", "0"]]) await box(label).fill(value);
            await page.getByRole("button", { name: "Mark Vitals Complete" }).click();
            await page.getByText(/^Saved \d/).first().waitFor({ timeout: 60000 }).catch(() => {});
            await h.settle(800);
            await page.locator('[data-slot="card"]:has(#visit-consultation-type)').last().scrollIntoViewIfNeeded();
          },
        },
      ],
      fields: [
        ["BP Systolic / Diastolic", "Blood pressure in mmHg."],
        ["Heart Rate", "Beats per minute."],
        ["Temperature", "In °F."],
        ["Weight / Height", "In kg and cm."],
        ["Resp. Rate", "Breaths per minute."],
        ["Pain Score (0-10)", "How much pain the patient reports."],
      ],
    },
    {
      title: "Add photos",
      who: "Doctors and nurses",
      body: [
        "Photos are the best way to show progress in skin and hair treatment. Take them in the same positions at every visit so they can be compared side by side.",
        "Click <b>Upload</b> (or <b>Choose Files</b> on an empty visit) to pick photos from the computer. On a phone or tablet, <b>Camera</b> (or <b>Take Photo</b>) opens the camera. Files up to 25 MB are accepted.",
      ],
      steps: [
        "Click the <b>Photos</b> tab.",
        "Click <b>Upload</b> and choose one or more photos.",
        "In <b>Tag photo positions</b>, choose the position of each photo: Front, Left, Right, Back, Close-up or Other. <b>Infer positions</b> fills them in the usual order. <b>Grid</b> shows all photos at once. <b>Single</b> shows one large photo at a time with <b>Prev</b> and <b>Next</b>.",
        "Click <b>Upload</b>. The button counts the batches as they go. A message confirms <i>Photos uploaded</i>.",
      ],
      shots: [
        {
          file: "photo-tags",
          as: "doctor",
          caption: "Tag photo positions before uploading.",
          run: async (page, h) => {
            await openVisit(page, h, "review", "Photos");
            await page.getByText(/Before \/ After Photos/).waitFor();
            await page.locator('input[type="file"][multiple]').setInputFiles([
              { name: "crown-week8.png", mimeType: "image/png", buffer: scalpPng(960, 640, 1.5, 7) },
              { name: "parting-week8.png", mimeType: "image/png", buffer: scalpPng(960, 640, 1.2, 11) },
            ]);
            await page.getByRole("dialog", { name: "Tag photo positions" }).waitFor();
            await page.getByRole("dialog").getByRole("button", { name: "Grid" }).click();
            const pickers = page.getByRole("dialog").getByRole("combobox");
            await pickers.nth(0).click(); await page.getByRole("option", { name: "Front", exact: true }).click();
            await pickers.nth(1).click(); await page.getByRole("option", { name: "Close-up", exact: true }).click();
            await h.settle(500);
          },
          target: '[role="dialog"]',
          after: async (page, h) => {
            const has = (await call(h, "doctor", "GET", `/visits/${(await myVisits(h)).review}/photos`).catch(() => ({})));
            const count = (has.items || has.attachments || []).length;
            if (count) await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
            else {
              await page.getByRole("dialog").getByRole("button", { name: "Upload", exact: true }).click();
              await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 90000 });
            }
          },
        },
        {
          file: "photos",
          as: "doctor",
          caption: "The visit's photos with their positions, and photos saved at other visits below.",
          viewport: { width: 1440, height: 1400 },
          run: async (page, h) => {
            await openVisit(page, h, "review", "Photos");
            await page.getByAltText("thumb").first().waitFor({ timeout: 60000 });
            await page.getByText("Other saved photos").waitFor({ timeout: 60000 }).catch(() => {});
            await h.settle(1500);
          },
          target: (page) => page.locator(panel).last(),
        },
      ],
      shotLayout: "row",
      fields: [
        ["Large picture", "The selected photo, with the upload time and position underneath. <b>Prev</b> and <b>Next</b> step through the photos."],
        ["Thumbnails", "Click one to show it large. The small red bin on a thumbnail deletes that photo."],
        ["Delete", "Deletes the photo shown large. Deleted photos cannot be brought back."],
        ["Other saved photos", "Photos from the patient's other visits, and uploads that were never attached to a visit, grouped by date. Click one to open it full size."],
      ],
      tips: ["If you upload photos before the visit has been saved, the app saves the visit first so the photos have somewhere to go."],
    },
    {
      title: "Compare before and after",
      who: "Doctors",
      body: [
        "Click <b>Compare: Off</b> to switch to <b>Compare: On</b>. Choose an earlier visit in <b>Compare against</b>. The earlier photo appears on the left and today's on the right, matched by position. <b>Prev</b> and <b>Next</b> move between positions that both visits have. If the positions do not match, the screen says <i>No positions to compare</i>.",
      ],
      shots: [
        {
          file: "compare",
          as: "doctor",
          caption: "The crown photo 8 weeks ago (left) and today (right).",
          run: async (page, h) => {
            await openVisit(page, h, "review", "Photos");
            await page.getByAltText("thumb").first().waitFor({ timeout: 60000 });
            await page.getByRole("button", { name: "Compare: Off" }).click();
            await page.locator(panel).last().getByRole("combobox").first().click();
            await page.getByRole("option").first().click();
            await page.getByAltText("before").waitFor({ timeout: 30000 });
            await h.settle(1500);
          },
          target: (page) => page.locator('[data-slot="card"]:has-text("Before / After Photos")').last().locator('[data-slot="card-content"] > div').first(),
        },
      ],
    },
    {
      title: "Enter lab results",
      who: "Doctors",
      body: [
        "The <b>Lab Tests</b> tab records the results of blood and other tests the patient brings. These results stay in the visit record. Tests you want the patient to have done are ordered in the Investigations box of the Prescription tab instead.",
      ],
      steps: [
        "Click the <b>Lab Tests</b> tab.",
        "Tick each test the report includes. A box for each ticked test appears under <b>Enter Results</b>.",
        "Type the <b>Value</b> and the <b>Unit</b> for each test.",
        "Tick <b>Compare with previous visit</b> to see, beside each value, how much it has changed since the last visit (Δ).",
        "Click <b>Save Labs</b>.",
      ],
      shots: [
        {
          file: "labs",
          as: "doctor",
          caption: "Ferritin and vitamin D results entered, with Compare with previous visit ticked.",
          viewport: { width: 1440, height: 1200 },
          run: async (page, h) => {
            await openVisit(page, h, "review", "Lab Tests");
            const p = page.locator(panel).last();
            for (const test of ["Ferritin", "Vitamin D"]) {
              const tick = p.locator("label", { hasText: new RegExp(`^${test}$`) }).locator("input");
              if (!(await tick.isChecked())) await tick.check();
            }
            const result = (test) => p.locator(`div.border:has(> div:text-is("${test}"))`);
            await result("Ferritin").getByPlaceholder("Value").fill("34");
            await result("Ferritin").getByPlaceholder("Unit").fill("ng/mL");
            await result("Vitamin D").getByPlaceholder("Value").fill("31");
            await result("Vitamin D").getByPlaceholder("Unit").fill("ng/mL");
            await p.getByText("Compare with previous visit").click();
            await p.getByRole("button", { name: "Save Labs" }).click();
            await h.settle(2500);
          },
          target: (page) => page.locator(panel).last(),
        },
      ],
      fields: [
        ["Autofill from a report", "Under the results, choose a photo or PDF of the lab report (JPG, PNG or PDF). The app reads the report, ticks the tests it finds and fills in the values. A message says <i>Autofill complete</i>. Always check the values against the report."],
        ["Δ", "The change since the previous visit. A dash means there is no earlier value to compare."],
      ],
    },
    {
      title: "Write the prescription and clinical notes",
      who: "Doctors",
      body: [
        "The <b>Prescription</b> tab holds the chief complaints, histories, examination, diagnosis, medicines, investigations and follow-up. It is described in full in the Prescriptions chapter. The <b>Customization</b> tab, which sets up the print layout, is covered there too.",
      ],
      shots: [],
    },
    {
      title: "See the visit history",
      who: "Doctors and nurses",
      body: [
        "The <b>History</b> tab inside the form lists all the patient's visits and appointments, newest first. The dot beside each is green for completed, blue for in progress and grey otherwise. Each card works like the cards on the start screen: <b>Show details</b>, <b>Full details</b> or <b>Compact view</b>, and <b>Resume session</b> to open that visit instead of this one.",
      ],
      shots: [
        {
          file: "history",
          as: "doctor",
          caption: "Patient Visit History inside the visit form.",
          viewport: { width: 1440, height: 1200 },
          run: async (page, h) => {
            await openVisit(page, h, "review", "History");
            await page.getByText("Patient Visit History").waitFor();
            const earlier = page.locator(`${panel} [data-slot="card"]:has-text("${EARLIER}")`).last();
            await earlier.getByRole("button", { name: "Show details" }).click({ timeout: 60000 });
            await h.settle(1000);
          },
          target: (page) => page.locator(panel).last(),
        },
      ],
    },
    {
      title: "Save your work",
      who: "Doctors and nurses",
      body: [
        "You do not lose work if you forget to save. As you type, the form keeps a copy in the browser on this computer. If the page is closed or the computer restarts, opening the same visit again brings your entries back.",
        "Once a visit has been saved once, the app also saves changes to the clinic's records by itself a few seconds after you stop typing. The visit header shows the save status.",
        "Click <b>Save Draft</b> at the bottom of the form, or press Ctrl+S (Cmd+S on a Mac), to save at any time. A message confirms <i>Visit saved</i>.",
      ],
      fields: [
        ["Unsaved changes", "You changed something that has not been saved to the clinic's records yet."],
        ["Auto-saving… / Saving…", "A save is in progress."],
        ["Saved 10:42 am", "Everything is saved. The time is the last save."],
        ["Save failed", "The save did not go through. The app tries again shortly. Your entries are kept in the browser."],
        ["Visit changed elsewhere", "Someone else saved this visit while you had it open. An amber box explains that your draft is kept and automatic saving has paused. Keep working and save, or click <b>Discard draft and reload saved visit</b> to throw your changes away and load the saved version."],
        ["Draft changed in another tab", "The same visit is open in another browser tab. Close one of them."],
      ],
      shots: [
        {
          file: "actions",
          as: "doctor",
          caption: "The bottom of the form: progress and the save buttons.",
          run: async (page, h) => {
            await openVisit(page, h, "review", "Overview");
            await page.getByRole("button", { name: "Save Draft" }).scrollIntoViewIfNeeded();
            await h.mark(page.getByRole("button", { name: "Save Draft" }), 1);
            await h.mark(page.getByRole("button", { name: /^Complete Visit|^Completing/ }), 2);
          },
          target: (page) => page.locator("div.border-t:has(> div > button:text-is('Save Draft'))").first(),
        },
      ],
    },
    {
      title: "Complete the visit",
      who: "Doctors",
      body: [
        "Completing a visit marks the documentation as finished. The status changes from IN PROGRESS to COMPLETED, and if a review date is set on the Prescription tab it becomes the patient's follow-up date. Only doctors can complete a visit.",
        "<b>Complete Visit</b> becomes available at 80% progress. In practice that means all four of these parts are marked complete: Vitals (click <b>Mark Vitals Complete</b>), Photos (upload at least one photo), Lab Tests (click <b>Save Labs</b>) and Prescription (open the print preview or save the prescription). Below the progress, the form lists the parts still remaining. The progress only counts these steps. It does not check that the notes are clinically complete.",
      ],
      steps: [
        "Check the progress line at the bottom of the form.",
        "Click <b>Complete Visit</b>, or press Ctrl+Shift+S. A message confirms <i>Visit completed</i>.",
      ],
      shots: [
        {
          file: "completed",
          as: "doctor",
          caption: "A completed visit.",
          run: async (page, h) => {
            await openVisit(page, h, "review", "Overview");
            const complete = page.getByRole("button", { name: "Complete Visit" });
            if (!(await page.getByText("COMPLETED").first().isVisible().catch(() => false))) {
              if (await complete.isDisabled()) {
                await page.getByRole("tab", { name: "Vitals" }).click();
                await page.getByRole("button", { name: "Mark Vitals Complete" }).click();
                await h.settle(2500);
                await page.getByRole("tab", { name: "Photos" }).click();
                await page.getByAltText("thumb").first().waitFor({ timeout: 60000 });
                await page.getByRole("tab", { name: "Lab Tests" }).click();
                await page.getByRole("button", { name: "Save Labs" }).click();
                await h.settle(2500);
                await page.getByRole("tab", { name: "Prescription" }).click();
                await page.getByRole("button", { name: "Print Preview" }).click();
                await page.locator("[data-prescription-preview-sidebar]").waitFor();
                await page.locator("[data-prescription-preview-sidebar]").getByRole("button", { name: "Close", exact: true }).click();
                await page.getByRole("tab", { name: "Overview" }).click();
              }
              await complete.click();
              await page.getByText("Visit completed").first().waitFor({ timeout: 60000 });
            }
            await h.settle(1000);
          },
        },
      ],
      warnings: ["If you click Complete Visit too early, the app says <i>More details needed to complete</i> and lists what to fill in. A nurse who tries sees <i>Doctor access required</i>."],
    },
    {
      title: "Resume a visit later",
      who: "Doctors and nurses",
      body: [
        "To continue a visit, click <b>Resume session</b> on its card in the patient's history, or use the link from the patient's page or the Dashboard. The visit opens with everything saved so far. Any entries kept in the browser on this computer are brought back too.",
      ],
      shots: [],
    },
    {
      title: "What a nurse sees",
      who: "Nurses",
      body: [
        "Nurses record the parts of the visit that happen before the doctor: vitals, photos and complaints. Their role card is green and reads <i>Can record vitals, capture photos, complaints, and basic assessments</i>. In the form, a nurse sees only the <b>Overview</b>, <b>Vitals</b>, <b>Photos</b> and <b>History</b> tabs. There is no Prescription, Lab Tests or Customization tab and no Complete Visit button. Progress for a nurse is counted out of three parts instead of five.",
        "A nurse saves with <b>Save Draft</b>. The doctor then opens the same visit, sees the vitals and photos already there, and completes it.",
      ],
      shots: [
        {
          file: "nurse-setup",
          as: "owner",
          caption: "The start screen for a nurse.",
          run: async (page, h) => {
            await h.goto("/dashboard");
            await loginInPage(page, h, NURSE);
            await h.goto("/dashboard/visits");
            await page.getByText("Full Vitals").waitFor({ timeout: 60000 });
          },
        },
        {
          file: "nurse-form",
          as: "owner",
          caption: "The visit form for a nurse: no Prescription, Lab Tests or Customization tab.",
          run: async (page, h) => {
            await openVisit(page, h, "review", "Overview");
          },
          after: async (page, h) => {
            await h.goto("/dashboard");
            await loginInPage(page, h, h.stack.users.owner.email);
          },
        },
      ],
      shotLayout: "row",
    },
    {
      title: "Quick Guide and shortcuts",
      who: "Everyone who uses the page",
      body: [
        "<b>Quick Guide</b> at the top of the page summarises how to start and document a visit. Inside the form, <b>Shortcuts</b> lists the keyboard shortcuts.",
      ],
      fields: [
        ["Ctrl/Cmd + S", "Save Draft."],
        ["Ctrl/Cmd + Shift + S", "Complete Visit."],
        ["↑ / ↓ and Enter", "Move through and choose from the patient search list."],
        ["Esc", "Close menus."],
      ],
      shots: [
        {
          file: "quick-guide",
          as: "doctor",
          narrow: true,
          caption: "The Visit Documentation Guide.",
          run: async (page, h) => {
            await h.goto("/dashboard/visits");
            await page.getByRole("button", { name: "Quick Guide" }).click();
            await page.getByRole("dialog").waitFor();
            await h.settle(400);
          },
          target: '[role="dialog"]',
          after: async (page) => { await page.keyboard.press("Escape"); },
        },
      ],
    },
  ],
};
