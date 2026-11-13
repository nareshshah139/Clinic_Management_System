const sessions = {};
async function call(h, who, method, route, body) {
  if (!sessions[who]) {
    const user = h.stack.users[who];
    for (let attempt = 0; attempt < 20 && !sessions[who]; attempt++) {
      const res = await fetch(`${h.stack.api}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: user.email, password: user.password }) });
      if (res.status === 429) { await new Promise((r) => setTimeout(r, 8000)); continue; }
      const data = await res.json();
      sessions[who] = { bearer: data.access_token || data.accessToken || data.token, cookie: (res.headers.get("set-cookie") || "").split(",").map((c) => c.split(";")[0].trim()).join("; ") };
    }
    if (!sessions[who]) throw Error(`login ${who} kept hitting the rate limit`);
  }
  const s = sessions[who];
  const res = await fetch(`${h.stack.api}${route}`, { method, headers: { "Content-Type": "application/json", ...(s.bearer ? { Authorization: `Bearer ${s.bearer}` } : {}), Cookie: s.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw Error(`${method} ${route} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const PATIENT = "Divya Pillai";
const patientId = (h) => h.seed.patients.find((p) => p.name === PATIENT).id;
const procedureSessions = async (h) => {
  const list = await call(h, "doctor", "GET", `/visits?patientId=${patientId(h)}&limit=50`);
  return (list.visits || list.data || list).map((v) => (typeof v.plan === "string" ? JSON.parse(v.plan) : v.plan)?.dermatology?.procedures?.[0]).filter(Boolean);
};
const soprano = (sessionNo, nurseId, h, notes) => ({
  patientId: patientId(h),
  doctorId: h.stack.users.doctor.id,
  complaints: [],
  treatmentPlan: {
    dermatology: {
      procedures: [{
        type: "Soprano Platinum LHR", therapistId: nurseId, sessionNo, bodyPart: ["Face", "Chin", "Neck"],
        indications: "Hirsutism of the chin and upper neck. Laser hair reduction course of 6 sessions.",
        skinTypes: { fitzpatrick: "IV", robert: "", scar: "", herpes: "None" },
        shotCounts: { begin: 1200, end: 1840 }, machine: "soprano-platinum-lhr",
        parameters: { Area: { 1: "Chin", 2: "Neck" }, Fluence: { 1: "10", 2: "9" }, "Spot Size": { 1: "Small", 2: "Large" } },
      }],
    },
    notes,
  },
});

async function pick(page, label, option) {
  await page.locator(`div:has(> label:text-is("${label}")) [role="combobox"]`).first().click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function fillNewProcedure(page, h) {
  await h.goto("/dashboard/procedures");
  await page.getByRole("tab", { name: "New Procedure" }).waitFor();
  await pick(page, "Patient *", PATIENT);
  await pick(page, "Doctor *", "Dr. Priya Menon");
  await pick(page, "Nurse/Therapist", "Asha Kulkarni");
  await page.getByPlaceholder("Session number").fill("3");
  const shots = page.getByPlaceholder("e.g. 50");
  await shots.nth(0).fill("1840");
  await shots.nth(1).fill("2475");
  for (const part of ["Chin", "Neck"]) await page.getByRole("button", { name: part, exact: true }).click();
  await page.getByPlaceholder("Enter procedure indications...").fill("Hirsutism of the chin and upper neck. Session 3 of 6. Hair regrowth thinner since session 2.");
  await pick(page, "Fitzpatrick Type", "Type IV");
  await pick(page, "Herpes Status", "None");
  await page.getByRole("button", { name: /Soprano Platinum LHR/ }).click();
  const table = page.locator("table");
  const row = (name) => table.locator("tr").filter({ has: page.locator("td", { hasText: new RegExp(`^${name}$`) }) });
  const fill = async (name, values) => { for (const [i, v] of values.entries()) await row(name).locator("input").nth(i).fill(v); };
  await fill("Area", ["Chin", "Neck"]);
  await fill("Fluence", ["11", "10"]);
  await fill("Spot Size", ["Small", "Large"]);
  await page.getByPlaceholder("Enter any additional notes or observations...").fill("Mild redness after the treatment, settled with ice packs. Advised sunscreen and no waxing between sessions.");
}

module.exports = {
  id: "08-procedures",
  title: "Procedures",
  intro:
    "The Procedures page records machine treatments such as laser hair reduction, radio-frequency tightening and Hydrafacial: who did the session, which body parts were treated, the skin assessment, and the machine settings for each pass. Each saved procedure is stored as a visit for the patient, so it also appears in the patient's history. Doctors, admins and owners can open this page.",
  setup: async (h) => {
    const db = h.db();
    const nurse = await db.user.findFirst({ where: { branchId: h.stack.branchId, role: "NURSE" } });
    await db.$disconnect();
    const existing = await procedureSessions(h);
    if (!existing.some((p) => p.sessionNo === 2 && p.machine === "soprano-platinum-lhr")) {
      const visit = await call(h, "doctor", "POST", "/visits", soprano(2, nurse?.id, h, "Tolerated well. Mild perifollicular redness for an hour."));
      const db2 = h.db();
      await db2.visit.update({ where: { id: visit.id }, data: { createdAt: new Date(Date.now() - 28 * 86400000) } });
      await db2.$disconnect();
    }
  },
  sections: [
    {
      title: "The Procedures page",
      who: "Doctors, admins, owners",
      body: [
        "Open <b>Procedures</b> from the Clinical part of the menu. The page has three tabs. <b>New Procedure</b> is the form for recording a session. <b>Procedure History</b> lists earlier sessions for the patient chosen in the form. <b>Analytics</b> is reserved for procedure statistics.",
        "When the page opens, the form already has the first patient, the first doctor and the first nurse in the clinic's lists filled in. Always change them to the people for this session before you save.",
      ],
      shots: [
        {
          file: "page",
          as: "doctor",
          caption: "The Procedures page opens on the New Procedure tab.",
          run: async (page, h) => {
            await h.goto("/dashboard/procedures");
            await page.getByText("Basic Information").waitFor();
            await h.mark(page.getByRole("tab", { name: "New Procedure" }), 1);
            await h.mark(page.getByRole("tab", { name: "Procedure History" }), 2);
            await h.mark(page.getByRole("tab", { name: "Analytics" }), 3);
            await h.mark(page.getByRole("button", { name: "Quick Guide" }), 4);
          },
        },
      ],
      fields: [
        ["1. New Procedure", "The form for a new session."],
        ["2. Procedure History", "Earlier sessions of the selected patient."],
        ["3. Analytics", "Not in use yet. It shows <i>Analytics dashboard coming soon</i>."],
        ["4. Quick Guide", "A short summary of this page."],
      ],
    },
    {
      title: "Record a procedure session",
      who: "Doctors (nurses and therapists work alongside, but the doctor saves)",
      body: [
        "Fill the form during or straight after the session, while the machine readings are in front of you. Fields marked * are required. The form also needs a machine before it will save.",
      ],
      steps: [
        "Under <b>Basic Information</b>, choose the <b>Patient *</b>, the <b>Doctor *</b> and the <b>Nurse/Therapist</b> who ran the machine.",
        "Under <b>Procedure Metrics</b>, type the <b>Session No.</b> and the machine's shot counter at the start (<b>Shot Count (Begin)</b>) and at the end (<b>Shot Count (End)</b>). <b>Total Shots</b> works itself out as end minus begin.",
        "Click each treated area under <b>Body Parts</b>. A selected area turns dark. Click it again to remove it.",
        "Type why the procedure is being done in <b>Indications</b>.",
        "Under <b>Skin Type Assessment</b>, choose the <b>Fitzpatrick Type</b>, and the <b>Robert Type</b>, <b>Scar Type</b> and <b>Herpes Status</b> where they apply.",
      ],
      shots: [
        {
          file: "basic-metrics",
          as: "doctor",
          caption: "Basic information, procedure metrics, body parts and skin type filled in for a laser hair reduction session.",
          run: async (page, h) => {
            await fillNewProcedure(page, h);
            await page.getByText("Basic Information").scrollIntoViewIfNeeded();
            await page.evaluate(() => window.scrollTo(0, 0));
          },
          viewport: { width: 1440, height: 1250 },
        },
      ],
      fields: [
        ["Patient *", "The patient being treated. Choosing a patient also loads their earlier sessions into Procedure History."],
        ["Doctor *", "The doctor responsible for the session."],
        ["Nurse/Therapist", "The nurse who operated the machine. Only staff with the Nurse role are listed."],
        ["Session No.", "Which session of the course this is. After a save the form adds 1 for the next session."],
        ["Shot Count (Begin) / (End)", "The machine's shot counter before and after the session."],
        ["Total Shots", "End minus begin. You cannot type in it."],
        ["Body Parts", "Face, Forehead, Cheeks, Nose, Chin, Neck, Chest, Back, Arms, Legs, Hands, Feet, Abdomen, Shoulders, Other. You can pick several."],
        ["Fitzpatrick Type", "Skin type I to VI, which guides laser energy."],
        ["Robert Type", "Type 1 to 4."],
        ["Scar Type", "Atrophic, Hypertrophic, Keloid, Rolling, Boxcar or Ice Pick, for scar treatments."],
        ["Herpes Status", "Active, Inactive, History or None. Important before facial laser and peels."],
      ],
    },
    {
      title: "Choose the machine and enter its settings",
      who: "Doctors",
      body: [
        "Each machine has its own settings. When you click a machine under <b>Machine Selection</b>, a table of that machine's settings appears below it, with one column per pass. Type the setting used for each pass. Leave unused passes empty.",
      ],
      steps: [
        "Click the machine used, for example <b>Soprano Platinum LHR</b>. It turns dark.",
        "In the <b>Parameters</b> table, type the value for each setting under <b>Pass 1</b>, <b>Pass 2</b> and so on.",
        "Type anything else worth recording in <b>Additional Notes</b>, such as how the patient tolerated it and aftercare advice.",
        "Click <b>Save Procedure</b>. The browser shows <i>Procedure saved successfully!</i>. Click <b>OK</b>.",
      ],
      shots: [
        {
          file: "machine",
          as: "doctor",
          caption: "Soprano Platinum LHR selected, with the settings for two passes and the notes.",
          run: async (page, h) => {
            await fillNewProcedure(page, h);
            await page.getByText("Machine Selection").evaluate((el) => el.scrollIntoView({ block: "start" }));
            await page.evaluate(() => window.scrollBy(0, -20));
          },
          viewport: { width: 1440, height: 1100 },
        },
        {
          file: "saved",
          as: "doctor",
          caption: "After saving, the form keeps the patient and machine and moves on to the next session number.",
          run: async (page, h) => {
            const done = (await procedureSessions(h)).some((p) => p.sessionNo === 3 && p.machine === "soprano-platinum-lhr");
            await fillNewProcedure(page, h);
            if (!done) {
              page.once("dialog", (d) => d.accept());
              await page.getByRole("button", { name: "Save Procedure" }).click();
              await page.getByPlaceholder("Session number").and(page.locator('[value="4"]')).waitFor();
            } else {
              await page.getByPlaceholder("Session number").fill("4");
              await page.getByPlaceholder("e.g. 50").nth(0).fill("0");
              await page.getByPlaceholder("e.g. 50").nth(1).fill("0");
              for (const input of await page.locator("table input").all()) await input.fill("");
              await page.getByPlaceholder("Enter any additional notes or observations...").fill("");
            }
            await h.mark(page.getByPlaceholder("Session number"), 1);
            await page.evaluate(() => window.scrollTo(0, 0));
          },
        },
      ],
      shotLayout: "row",
      fields: [
        ["Endymed Pro Max", "Settings: Intensity, RF, Depth, Area Treated, Mode. Up to 8 passes."],
        ["Fotona Starwalker", "Settings: Area, Spot Size, Energy, Fluency, Frequency, Wavelength, PTP Mode. Up to 8 passes."],
        ["Soprano Platinum LHR", "Settings: Area, Fluence, Spot Size. Up to 8 passes."],
        ["Hydrafacial", "Settings: Actives Used, Area. One pass."],
      ],
      after: [
        "After a save, the form keeps the patient, doctor, nurse, body parts and skin type, adds 1 to the session number (marked 1), and empties the shot counts, the machine settings and the notes. This makes it quick to record the next session of a course.",
      ],
      warnings: [
        "If the patient, doctor or machine is missing, the browser shows <i>Please fill in all required fields</i> and nothing is saved.",
        "A saved procedure cannot be changed or deleted from this page. Check the settings before you click <b>Save Procedure</b>.",
      ],
    },
    {
      title: "Look at earlier sessions",
      who: "Doctors",
      body: [
        "Before a repeat session, check what was used last time. <b>Procedure History</b> shows the sessions of the patient currently chosen in the <b>Patient *</b> box on the New Procedure tab. Choose the patient there first.",
      ],
      steps: [
        "On the <b>New Procedure</b> tab, choose the patient.",
        "Click the <b>Procedure History</b> tab. The heading says how many sessions were found.",
        "Click <b>Refresh</b> if you saved a session a moment ago and it is not listed yet.",
        "Click <b>Load &amp; Edit</b> on a card to start a new session from it. The app switches to the New Procedure tab with that session's patient, doctor and machine chosen. Fill in the rest and save it as a new session.",
      ],
      shots: [
        {
          file: "history",
          as: "doctor",
          caption: "Procedure History for the selected patient, one card per session.",
          run: async (page, h) => {
            await h.goto("/dashboard/procedures");
            await pick(page, "Patient *", PATIENT);
            await page.getByRole("tab", { name: "Procedure History" }).click();
            await page.getByRole("button", { name: "Refresh" }).click();
            await page.getByRole("button", { name: "Load & Edit" }).first().waitFor();
            await h.settle(500);
          },
        },
      ],
      fields: [
        ["Card heading", "Patient name and the date and time the session was saved."],
        ["Badge", "The machine or procedure name."],
        ["Doctor line", "The doctor responsible. The card does not show the machine settings."],
        ["Load &amp; Edit", "Starts a new session with the same patient, doctor and machine. The session number goes back to 1, so correct it."],
        ["View Details", "Marks the card as selected. It does not open anything more at present."],
      ],
      tips: ["Procedures saved here also appear in the patient's visit history on the Visits page."],
    },
    {
      title: "Analytics",
      who: "Doctors, admins, owners",
      body: [
        "The <b>Analytics</b> tab is a placeholder. It shows <i>Analytics dashboard coming soon</i> and no figures yet, even when procedures are saved. For procedure counts and income, use the Reports chapter.",
      ],
      shots: [
        {
          file: "analytics",
          as: "doctor",
          caption: "The Analytics tab.",
          viewport: { width: 1440, height: 640 },
          run: async (page, h) => {
            await h.goto("/dashboard/procedures");
            await page.getByRole("tab", { name: "Analytics" }).click();
            await page.getByText("Analytics dashboard coming soon").waitFor();
          },
        },
      ],
    },
    {
      title: "The Quick Guide",
      who: "Everyone who uses the page",
      body: ["Click <b>Quick Guide</b> at the top right for a short reminder of how to create procedures, enter machine settings and use the history."],
      shots: [
        {
          file: "quick-guide",
          as: "doctor",
          narrow: true,
          caption: "The Procedures Management Guide.",
          run: async (page, h) => {
            await h.goto("/dashboard/procedures");
            await page.getByRole("button", { name: "Quick Guide" }).click();
            await page.getByRole("dialog").waitFor();
            await h.settle(500);
          },
          target: '[role="dialog"]',
          after: async (page) => { await page.keyboard.press("Escape"); },
        },
      ],
    },
  ],
};
