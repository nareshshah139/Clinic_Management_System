const sessions = {};
async function call(h, who, method, route, body, headers = {}) {
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
  const res = await fetch(`${h.stack.api}${route}`, { method, headers: { "Content-Type": "application/json", ...(s.bearer ? { Authorization: `Bearer ${s.bearer}` } : {}), Cookie: s.cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw Error(`${method} ${route} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const MARK = "worse before exams";
const pid = (h, name) => h.seed.patients.find((p) => p.name === name).id;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const med = (name, dosePattern, frequency, timing, duration, instructions, dosageUnit = "TABLET") => ({
  drugName: name, drugId: `guide-${slug(name)}-drug`, inventoryItemId: `guide-${slug(name)}`, dosage: 1, dosageUnit, dosePattern, frequency, timing, duration, durationUnit: "DAYS", instructions,
});
const MEDS = [
  med("Isotretinoin 10 mg Capsule", "0-0-1", "ONCE_DAILY", "After Dinner", 30, "Take after dinner. Avoid alcohol and vitamin A tablets.", "CAPSULE"),
  med("Adapalene Gel 0.1% 15 g", "0-0-1", "ONCE_DAILY", "HS", 30, "Pea-sized amount on dry skin at night"),
  med("Clindamycin Gel 1% 20 g", "1-0-0", "ONCE_DAILY", "AM", 30, "Apply only on red pimples"),
  med("Salicylic Acid Face Wash 100 ml", "1-0-1", "TWICE_DAILY", "AM", 30, "Wash the face morning and night"),
  med("Sunscreen SPF 50 Lotion 50 ml", "1-0-0", "ONCE_DAILY", "AM", 30, "Apply 20 minutes before going out. Reapply every 3 hours"),
];

async function showcaseVisit(h) {
  const list = await call(h, "doctor", "GET", `/visits?patientId=${pid(h, "Arjun Reddy")}&limit=50`);
  const found = (list.visits || list.data || list).find((v) => JSON.stringify(v.complaints || "").includes(MARK));
  return found?.id;
}

const card = (page, section) => page.locator(`[data-slot="card"]:has(#section-${section}-heading)`).last();
const tabPanel = '[role="tabpanel"][data-state="active"]';

async function openRx(page, h, visitId) {
  await h.goto(`/dashboard/visits?visitId=${visitId}`);
  await page.getByRole("tab", { name: "Prescription" }).click();
  await page.getByRole("button", { name: "Add Row" }).first().waitFor();
  const hide = page.getByRole("button", { name: "Hide patient context" });
  if (await hide.isVisible()) await hide.click();
  await h.settle(1200);
}

async function openShowcase(page, h) {
  await openRx(page, h, await showcaseVisit(h));
}

const SCRATCH = "Rahul Bhatt";
async function openScratch(page, h) {
  const patientId = pid(h, SCRATCH);
  const url = `/dashboard/visits?patientId=${patientId}&doctorId=${h.stack.users.doctor.id}&autoStart=true`;
  await h.goto("/dashboard/patients");
  await page.evaluate((id) => Object.keys(localStorage).filter((k) => k.includes(id)).forEach((k) => localStorage.removeItem(k)), patientId);
  await h.goto(url);
  await page.getByRole("tab", { name: "Prescription" }).click();
  await page.getByRole("button", { name: "Add Row" }).first().waitFor();
  const hide = page.getByRole("button", { name: "Hide patient context" });
  if (await hide.isVisible()) await hide.click();
  await h.settle(800);
}

async function searchMedicine(page, h, text) {
  const inputs = page.getByPlaceholder("Search medicine name...");
  if (!(await inputs.count())) await page.getByRole("button", { name: "Add Row" }).first().click();
  const input = inputs.last();
  await input.click();
  await input.pressSequentially(text, { delay: 60 });
  await page.getByText("Best Match").first().waitFor();
  await h.settle(600);
  return input;
}

async function openPreview(page, h) {
  await page.getByRole("button", { name: "Print Preview" }).click();
  await page.locator("[data-prescription-preview-sidebar]").waitFor();
  await page.waitForFunction(() => document.querySelector("#pagedjs-container .pagedjs_page"), null, { timeout: 60000 }).catch(() => {});
  await h.settle(2500);
}
const closePreview = async (page) => {
  const close = page.locator("[data-prescription-preview-sidebar]").getByRole("button", { name: "Close", exact: true });
  if (await close.isVisible().catch(() => false)) await close.click();
};
const sidebar = (page) => page.locator("[data-prescription-preview-sidebar]");

module.exports = {
  id: "07-prescriptions",
  title: "Prescriptions",
  intro:
    "Doctors write the prescription inside the visit, on the <b>Prescription</b> tab. The same screen holds the clinical notes that go on the printout: complaints, histories, diagnosis, medicines, investigations, procedures and follow-up. This chapter follows one real example, an acne patient, from the first box to the printed and shared prescription. Only doctors, admins and owners see the Prescription tab.",
  setup: async (h) => {
    if (await showcaseVisit(h)) return;
    const review = new Date(Date.now() + 19800000 + 28 * 86400000).toISOString().slice(0, 10);
    const visit = await call(h, "doctor", "POST", "/visits", {
      patientId: pid(h, "Arjun Reddy"), doctorId: h.stack.users.doctor.id,
      vitals: { systolicBP: 118, diastolicBP: 78, heartRate: 76, weight: 70, height: 176 },
      complaints: [{ complaint: `Painful pimples on the face and back for 8 months, ${MARK}` }],
      history: {
        pastHistory: "Topical clindamycin 1 year ago, partial relief",
        medicationHistory: "Doxycycline 100 mg for 6 weeks, stopped 3 months ago",
        personalHistory: "Engineering student. Sleeps late, eats fried food often. Uses an oil-based face cream.",
        familyHistory: { dm: false, htn: true, thyroid: false, others: "Father had severe acne as a teenager" },
      },
      examination: {
        generalAppearance: "Multiple inflamed papules and pustules over both cheeks and the jawline. Three nodules on the upper back. Open and closed comedones on the forehead. Early atrophic scars on the cheeks.",
        dermatology: { skinType: "IV", morphology: ["Papule", "Pustule", "Nodule", "Comedo"], distribution: ["Face", "Trunk"], acneSeverity: "moderate", itchScore: 1, skinConcerns: ["Acne", "Scarring"], diagnoses: ["Acne vulgaris"] },
      },
      diagnosis: [{ diagnosis: "Acne vulgaris, grade 3" }],
      treatmentPlan: {
        investigations: ["CBC", "LFT", "Fasting lipid profile"],
        procedurePlanned: "Salicylic acid peel 30% after 6 weeks",
        followUpInstructions: "Review in 4 weeks with blood reports",
        followUpDate: review,
        dermatology: { procedures: [{ type: "Comedone extraction" }], counseling: "Do not pick or squeeze pimples. Isotretinoin dries the lips: use a lip balm. Drink plenty of water." },
      },
    });
    await call(h, "doctor", "POST", "/prescriptions", {
      patientId: pid(h, "Arjun Reddy"), visitId: visit.id, doctorId: h.stack.users.doctor.id, items: MEDS,
      diagnosis: "Acne vulgaris, grade 3", followUpInstructions: "Review in 4 weeks with blood reports", language: "EN",
    }, { "Idempotency-Key": `guide-ch07-${visit.id}` });
  },
  sections: [
    {
      title: "Open the Prescription tab",
      who: "Doctors",
      body: [
        "Start or open the visit as described in the Visits chapter, then click the <b>Prescription</b> tab. The tab is a long page of boxes, from top to bottom in the order you usually work: vitals, complaints, diagnosis, history, examination, treatment, procedures, investigations, then language, follow-up and review date, with the print and save buttons at the very bottom.",
        "A green dot on the Prescription tab means at least four of the key parts are filled in (complaints, diagnosis, history or examination, vitals, medicines). A box with content turns green and shows <b>Has Data</b> and <b>Auto-included in preview</b>, which means it will be printed.",
        "Click the <b>X</b> at the top of the Patient Context panel to hide it and give the prescription more room. <b>Show Patient Context</b> brings it back.",
        "Everything you type is kept as you go. Once the visit has been saved once, the app saves your changes in the background a few seconds after you stop typing. The visit header shows <i>Auto-saving…</i>, then <i>Saved</i> and the time.",
      ],
      shots: [
        {
          file: "tab-top",
          as: "doctor",
          caption: "The top of the Prescription tab: the templates bar and Clinical Details &amp; Vitals.",
          run: async (page, h) => {
            await openShowcase(page, h);
            await page.locator(tabPanel).evaluate((el) => el.scrollIntoView({ block: "start" }));
            await h.mark(page.getByRole("tab", { name: "Prescription" }), 1);
            await h.mark(page.locator('div:has(> div > label:text-is("Templates"))').first(), 2);
            await h.mark(card(page, "clinical"), 3);
          },
        },
      ],
      fields: [
        ["1. Prescription tab", "Where the prescription is written."],
        ["2. Templates bar", "Apply, save and manage templates. See <i>Use templates</i> below."],
        ["3. Clinical Details &amp; Vitals", "Height, weight, BP and pulse. BMI works itself out. These are the same vitals as on the Vitals tab, and they print in the patient line of the prescription."],
      ],
    },
    {
      title: "Record the chief complaints",
      who: "Doctors",
      body: [
        "Write what the patient came for, in their words if possible. As you type, the box offers complaints you have used before. Click one to use it.",
        "The microphone button on the right records the conversation and adds the patient's part of it to the box (see <i>Dictate with the microphone</i> below). Below the box, click the <b>Skin Concerns</b> that apply. Selected ones turn dark.",
      ],
      shots: [
        {
          file: "complaints",
          as: "doctor",
          caption: "Chief Complaints with Acne and Scarring selected as skin concerns.",
          run: async (page, h) => {
            await openShowcase(page, h);
            await h.mark(card(page, "chief-complaints").getByRole("button", { name: "Start voice input" }), 1);
          },
          target: (page) => card(page, "chief-complaints"),
        },
      ],
      tips: ["Skin concerns help you search and report on patients later. They do not print."],
    },
    {
      title: "Enter the diagnosis",
      who: "Doctors",
      body: [
        "Type the diagnosis in plain words, for example <i>Acne vulgaris, grade 3</i>. Earlier diagnoses are offered as you type. The diagnosis drives the treatment suggestions further down.",
      ],
      shots: [
        {
          file: "diagnosis",
          as: "doctor",
          caption: "The Diagnosis box.",
          run: async (page, h) => { await openShowcase(page, h); },
          target: (page) => card(page, "diagnosis"),
        },
      ],
      warnings: ["If the Diagnosis box is empty, the printed prescription has no diagnosis line at all. Fill it in before you print."],
    },
    {
      title: "Record the patient's history",
      who: "Doctors",
      body: ["The <b>Patient History</b> box holds the background that matters for treatment. Everything here prints under <i>History</i>."],
      shots: [
        {
          file: "histories",
          as: "doctor",
          caption: "Past, medication, menstrual, family and personal history.",
          run: async (page, h) => { await openShowcase(page, h); },
          target: (page) => card(page, "histories"),
        },
      ],
      fields: [
        ["Past History", "Earlier skin problems and treatments, for example a course of clindamycin a year ago."],
        ["Medication History", "Medicines the patient takes now or took recently."],
        ["Menstrual History", "For women: cycle regularity, PCOS symptoms and similar. Leave empty for men."],
        ["Family History", "Tick <b>Diabetes</b>, <b>Hypertension</b> or <b>Thyroid</b>, and type anything else in <b>Others</b>."],
        ["Personal history", "Diet, sleep, habits, occupation and the cosmetics or products the patient uses."],
      ],
    },
    {
      title: "Record the examination (On Examination)",
      who: "Doctors",
      body: [
        "The <b>On Examination</b> box records the dermatology examination. Click its title to fold it away or open it again. The app remembers your choice. When it is folded and has content, the title shows <b>filled</b>.",
        "Examination findings are for the doctor's record only. They are saved with the visit and shown in the patient's history, but they do not print on the prescription.",
      ],
      shots: [
        {
          file: "examination",
          as: "doctor",
          caption: "On Examination for an acne patient: skin type IV, papules, pustules, nodules and comedones on the face and trunk.",
          run: async (page, h) => { await openShowcase(page, h); },
          target: (page) => card(page, "on-examination"),
        },
      ],
      fields: [
        ["Fitzpatrick Skin Type", "Click I to VI. Click the selected type again to clear it."],
        ["Acne Severity", "Type mild, moderate or severe."],
        ["Itch Score (0-10)", "How itchy the patient says the skin is, 0 for none and 10 for the worst."],
        ["Morphology", "Click every lesion type you see: Macule, Papule, Pustule, Nodule, Plaque, Vesicle, Scale, Erosion, Ulcer, Comedo. To add your own, type it in <b>Type and press Enter to add</b> and press Enter or click <b>Add</b>. Your own entries show a small x to remove them."],
        ["Distribution / Body Areas", "Where the lesions are: Face, Scalp, Neck, Trunk, Arms, Legs, Hands, Feet, Flexures, Extensors, Generalized. You can add your own the same way."],
        ["Dermatology Diagnoses", "Common diagnoses to click. A clicked diagnosis is saved with the visit's diagnoses."],
        ["Detailed Examination", "Free text for the full findings. The microphone button beside it adds dictated text."],
      ],
    },
    {
      title: "Add medicines",
      who: "Doctors",
      body: [
        "The <b>Treatment</b> box is the medicine list (the Rx). Each medicine is one row with five parts: the medicine, how often, when, for how long, and instructions. Rows with no medicine name are ignored when you save.",
      ],
      steps: [
        "Click <b>Add Row</b>. A new empty row appears and the cursor goes to it.",
        "Type at least two letters of the medicine in <b>Search medicine name...</b>. A list of matches opens.",
        "Click the medicine, or click <b>Select</b> next to it. The row fills in.",
        "Choose the <b>Frequency</b>, for example <b>1-0-1</b> for morning and night.",
        "Choose <b>When</b>, for example <b>After Dinner</b> or <b>HS</b> (at bedtime).",
        "Type the number in the <b>Duration</b> box and choose the unit (DAYS, WEEKS, MONTHS, YEARS).",
        "Type any <b>Instructions</b>, for example <i>Apply only on red pimples</i>. Earlier instructions for the same medicine are offered as you type.",
        "Press Enter in the medicine box to add the next row straight below.",
      ],
      shots: [
        {
          file: "rx-search",
          as: "doctor",
          caption: "Searching for a medicine. The best match is marked in green, the next two in blue. Stock in the pharmacy shows under each name.",
          run: async (page, h) => {
            await openScratch(page, h);
            await card(page, "treatment").scrollIntoViewIfNeeded();
            await searchMedicine(page, h, "Clob");
            await page.evaluate(() => window.scrollBy(0, 0));
          },
        },
        {
          file: "rx-row",
          as: "doctor",
          caption: "After choosing the medicine, its usual values are filled in. <i>Suggested · Accept</i> marks values the app suggested.",
          run: async (page, h) => {
            await openScratch(page, h);
            await searchMedicine(page, h, "Clob");
            await page.getByRole("button", { name: "Select" }).first().click();
            await page.getByText("Loading usual values…").waitFor({ state: "hidden" }).catch(() => {});
            await h.settle(1200);
          },
          target: (page) => card(page, "treatment").locator("table"),
        },
      ],
      fields: [
        ["Best Match / High Match", "How closely a search result matches what you typed."],
        ["Strength missing", "The medicine record has no strength. Check the pack before prescribing."],
        ["Stock", "How many are in the pharmacy now. A red number means 5 or fewer are left. A dash means the medicine is not stocked or the count is still loading. Point at a row to see <i>Remaining stock</i>."],
        ["Loading usual values…", "The app is looking up how this medicine is usually prescribed."],
        ["Suggested · Accept", "Shown under a value the app filled in for you: from your own prescriptions in the last 12 months, from the clinic's prescriptions, or from the pharmacy's defaults. Point at it to see which. Click it to accept the value. If you change the value yourself, the hint disappears."],
        ["Suggestions unavailable", "The usual values could not be loaded. Type the values, or choose the medicine again to retry."],
      ],
    },
    {
      title: "Frequency, timing, duration and custom options",
      who: "Doctors",
      body: [
        "Frequency uses the dose pattern most Indian prescriptions use: three numbers for morning, afternoon and night. <b>1-0-1</b> means one in the morning and one at night. Choosing a pattern also fills a matching <b>When</b> if it is empty.",
        "The quick buttons above the table apply to the row you last clicked. <b>1-0-1</b>, <b>0-1-0</b>, <b>1-1-1</b> and <b>HS</b> set the frequency. <b>5d</b>, <b>7d</b>, <b>14d</b> and <b>4w</b> set the duration. <b>Recent meds</b>, when shown, lists medicines you prescribed recently. Click one to put it in the current row.",
        "If an option you need is not in a list, choose <b>+ Custom...</b> at the bottom of the Frequency, When or Duration list. Type the new option and click <b>Add &amp; Apply</b>. It is saved on this computer for next time.",
      ],
      shots: [
        {
          file: "frequency-list",
          as: "doctor",
          caption: "The Frequency list, with + Custom... at the bottom.",
          run: async (page, h) => {
            await openScratch(page, h);
            await searchMedicine(page, h, "Clob");
            await page.getByRole("button", { name: "Select" }).first().click();
            await h.settle(1500);
            await page.getByRole("combobox", { name: /^Frequency for/ }).first().click();
            await page.getByRole("option", { name: "+ Custom..." }).waitFor();
          },
          after: async (page) => { await page.keyboard.press("Escape"); },
        },
        {
          file: "custom-option",
          as: "doctor",
          narrow: true,
          caption: "Adding a custom dose pattern.",
          run: async (page, h) => {
            await page.getByRole("combobox", { name: /^Frequency for/ }).first().click();
            await page.getByRole("option", { name: "+ Custom..." }).click();
            await page.getByRole("dialog").getByRole("textbox").fill("1-0-0 on alternate days");
          },
          target: '[role="dialog"]',
          after: async (page) => { await page.getByRole("button", { name: "Cancel" }).click().catch(() => {}); },
        },
      ],
      shotLayout: "row",
      fields: [
        ["When", "AM, PM, After Breakfast, After Lunch, After Dinner, Before Meals, QHS and HS (at bedtime), With Food, Empty Stomach. The list only offers timings that suit the chosen frequency."],
        ["Duration unit", "DAYS, WEEKS, MONTHS or YEARS, plus any custom units."],
      ],
    },
    {
      title: "Change the order, add and remove rows",
      who: "Doctors",
      body: [
        "Every row has two buttons at its right end. The <b>+</b> button adds an empty row directly below that row, so you can slot a medicine in where it belongs. If the next row is already empty, the cursor moves there instead of adding another one. The bin button removes the row.",
        "There is no drag to reorder. To move a medicine, add a row where you want it, choose the medicine there, and remove the old row.",
        "<b>Reuse last meds</b> copies the medicines from the patient's previous visit into the table. <b>+ Add to Drug Database</b> opens a small form to add a medicine the search cannot find (name, manufacturer, price and pack size). <b>Save &amp; Add</b> saves it for the whole clinic and puts it in the prescription.",
      ],
      shots: [
        {
          file: "rx-table",
          as: "doctor",
          caption: "The finished medicine table for the acne patient. Each row has + (add below) and the bin (remove).",
          run: async (page, h) => {
            await openShowcase(page, h);
            for (const cell of await card(page, "treatment").locator("table td:first-child").all()) { await cell.hover(); await page.waitForTimeout(400); }
            await h.settle(800);
            await h.mark(card(page, "treatment").getByRole("button", { name: "Reuse last meds" }), 1);
            await h.mark(card(page, "treatment").getByRole("button", { name: "Add Row" }), 2);
            await h.mark(card(page, "treatment").getByRole("button", { name: /^Add a medicine below/ }).first(), 3);
            await h.mark(card(page, "treatment").getByRole("button", { name: /^Remove / }).first(), 4);
          },
          target: (page) => card(page, "treatment"),
          viewport: { width: 1440, height: 2000 },
        },
        {
          file: "add-drug",
          as: "doctor",
          narrow: true,
          caption: "Add Drug to Database.",
          run: async (page, h) => {
            await openShowcase(page, h);
            await page.getByRole("button", { name: "+ Add to Drug Database" }).click();
            await page.getByRole("dialog").waitFor();
          },
          target: '[role="dialog"]',
          after: async (page) => { await page.keyboard.press("Escape"); },
        },
      ],
      fields: [
        ["1. Reuse last meds", "Copies the previous visit's medicines. If there are none, the app says <i>No previous medications found</i>."],
        ["2. Add Row", "Adds an empty row at the end."],
        ["3. + on a row", "Adds an empty row below that row."],
        ["4. Bin on a row", "Removes the row."],
        ["Total items", "How many rows the table has."],
      ],
    },
    {
      title: "Treatment suggestions",
      who: "Doctors",
      body: [
        "When a diagnosis is entered, the dark <b>Treatment suggestions</b> panel at the top of the Treatment box looks for what was prescribed before for the same diagnosis: your recent prescriptions, similar visits and saved plans. If it finds a strong pattern and the table is still empty, it fills the table in for you. It never overwrites medicines you have already entered.",
      ],
      shots: [
        {
          file: "suggestions",
          as: "doctor",
          caption: "Treatment suggestions for a visit that already has medicines: the learned plan is ready but nothing was overwritten.",
          run: async (page, h) => { await openShowcase(page, h); },
          target: (page) => card(page, "treatment").locator("div.rounded-lg.border").first(),
        },
      ],
      fields: [
        ["Combo", "How many medicines the suggested plan has."],
        ["Review", "The suggested follow-up window in days."],
        ["Labs", "How many investigations the plan suggests."],
        ["Evidence", "How many earlier plans match."],
        ["Reapply learned plan", "Replaces the table with the suggested plan."],
        ["Fill missing only", "Adds only the medicines and follow-up details that are missing. What you entered stays."],
        ["Undo autofill / Undo quick-fill", "Puts the table back as it was before the suggestion was applied."],
      ],
      tips: ["The suggestions get better as more prescriptions are saved in the clinic. A new clinic sees <i>No strong pattern yet for this diagnosis</i> at first."],
    },
    {
      title: "Procedures and investigations",
      who: "Doctors",
      body: [
        "Type any procedure done today in <b>Procedures</b>, and anything you plan for a later visit in <b>Procedure Planned</b>. Both print.",
        "Under <b>Investigations</b>, tick the tests the patient needs. If a test is not listed, type it in <b>Add Custom Investigation</b> and click <b>Add</b>. It is ticked for this patient and saved to the clinic's list, so everyone sees it next time.",
        "Click <b>Manage saved investigations</b> to see the clinic's own tests. Use the pencil to rename one and the bin to remove one. Removing asks <i>Remove … for everyone in the clinic?</i>: click <b>Remove</b> to confirm or <b>Keep</b> to cancel.",
      ],
      shots: [
        {
          file: "procedures",
          as: "doctor",
          caption: "Procedures done today and planned.",
          run: async (page, h) => { await openShowcase(page, h); },
          target: (page) => card(page, "procedures"),
        },
        {
          file: "investigations",
          as: "doctor",
          caption: "Investigations: CBC, LFT and fasting lipid profile before starting isotretinoin.",
          run: async (page, h) => { await openShowcase(page, h); await page.getByRole("button", { name: "Manage saved investigations" }).click(); await card(page, "investigations").evaluate((el) => el.scrollIntoView({ block: "center" })); await h.settle(500); },
          target: (page) => card(page, "investigations"),
        },
      ],
    },
    {
      title: "Add a custom section",
      who: "Doctors",
      body: [
        "Use a custom section for anything that has no box of its own, such as diet advice or a skin-care routine. Click <b>Add Custom Section</b> below Investigations. Type a <b>Section Title</b> and its <b>Content</b>. The section prints under its own title. Click <b>Remove</b> to delete it.",
        "Counselling advice entered with the visit plan prints under its own <b>Counseling</b> heading.",
      ],
      shots: [
        {
          file: "custom-section",
          as: "doctor",
          caption: "A custom section with skin-care advice.",
          run: async (page, h) => {
            await openScratch(page, h);
            await page.getByRole("button", { name: "Add Custom Section" }).click();
            const box = page.locator('[data-slot="card"]:has(label:text-is("Section Title"))').last();
            await box.locator("input").nth(0).fill("Skin care routine");
            await box.locator("input").nth(1).fill("Gentle face wash twice a day, oil-free moisturiser, sunscreen every morning.");
            await h.settle(400);
          },
          target: (page) => page.locator('[data-slot="card"]:has(label:text-is("Section Title"))').last(),
        },
      ],
    },
    {
      title: "Language, follow-up and review date",
      who: "Doctors",
      body: [
        "In <b>Basic Information</b>, choose the <b>Language</b> the patient reads: English, Telugu or Hindi. With Telugu or Hindi, the free-text parts are translated when you open the print preview: diagnosis, complaints, histories, family history, procedures, investigations, custom sections, counselling and the per-medicine instructions. Medicine names, numbers and units stay as they are. Boxes that will be translated show a small translation icon next to their label.",
        "Type <b>Follow-up Instructions</b>, or click one of the ready-made buttons such as <b>Follow up in 14 days</b>. Clicking one also sets the review date.",
        "Set the <b>Review Date</b> with the date box, or click a shortcut under it: <b>7d</b>, <b>2w</b>, <b>3w</b>, <b>30d</b>, <b>6w</b> and similar. When the visit is completed, the review date becomes the patient's follow-up date.",
      ],
      shots: [
        {
          file: "language",
          as: "doctor",
          caption: "Telugu chosen: the box explains what will be translated on print.",
          run: async (page, h) => {
            await openScratch(page, h);
            const basic = card(page, "basic");
            await basic.getByRole("combobox").first().click();
            await page.getByRole("option", { name: "Telugu" }).click();
            await basic.getByRole("textbox", { name: "Follow-up instructions" }).fill("Review in 2 weeks");
            await h.settle(500);
          },
          target: (page) => card(page, "basic"),
        },
        {
          file: "bottom-bar",
          as: "doctor",
          caption: "Review Date with its shortcuts, and the buttons at the bottom of the tab.",
          run: async (page, h) => {
            await openShowcase(page, h);
            const date = page.getByRole("textbox", { name: "Review date" }).or(page.getByLabel("Review date"));
            await date.first().scrollIntoViewIfNeeded();
            await h.mark(page.getByRole("button", { name: "Print Preview" }), 1);
            await h.mark(page.getByRole("button", { name: /^(Create|Update) Prescription$/ }), 2);
            await h.mark(page.getByRole("button", { name: "Go to Pharmacy" }), 3);
          },

        },
      ],
    },
    {
      title: "Save the prescription",
      who: "Doctors",
      body: [
        "Saving makes the prescription part of the patient's record and sends it to the Pharmacy Desk queue. You need a patient, a doctor and at least one medicine. If the visit has never been saved, the app saves it first.",
      ],
      steps: [
        "Check the medicine table and the follow-up.",
        "Click <b>Create Prescription</b> at the bottom of the tab. A message confirms <i>Prescription created</i>, or <i>Prescription updated</i> if you are saving changes to one already saved.",
        "The app asks <b>Go to Pharmacy?</b>. Click <b>Yes, go to Pharmacy</b> to bill the medicines now, or <b>Stay Here</b> to keep working.",
      ],
      shots: [
        {
          file: "go-to-pharmacy",
          as: "doctor",
          narrow: true,
          caption: "After saving, the app offers to open the pharmacy bill.",
          run: async (page, h) => {
            await openShowcase(page, h);
            await page.getByRole("button", { name: /^(Create|Update) Prescription$/ }).click();
            await page.getByRole("dialog", { name: "Go to Pharmacy?" }).waitFor({ timeout: 60000 });
            await h.settle(400);
          },
          target: '[role="dialog"]',
          after: async (page) => { await page.getByRole("button", { name: "Stay Here" }).click().catch(() => {}); },
        },
      ],
      fields: [
        ["Go to Pharmacy", "At the bottom of the tab. Opens a new pharmacy bill for this patient and visit, without saving first."],
        ["Print (Table / Text)", "Chooses how medicines print: as a table, or as lines of text."],
        ["Total qty", "The total quantity of all rows, used by the pharmacy."],
      ],
      warnings: ["If the button is greyed out or the app says <i>Cannot create prescription</i>, the message says what is missing, for example <i>Add at least one medication</i>."],
    },
    {
      title: "Use templates",
      who: "Doctors",
      body: [
        "A template saves a whole prescription you write often, such as your usual acne starter, so you can apply it in one click. The bar at the top of the tab has all the template tools.",
      ],
      fields: [
        ["Templates list", "Click it to see <b>Saved templates</b> (yours and the clinic's) and <b>Default templates</b> that come with the app. Click a name to apply it. <b>No template</b> clears the choice. The bin next to a saved template deletes it."],
        ["Refresh", "Reloads the list, for example after a colleague saved a new template."],
        ["Undo / Redo", "Steps back or forward through your recent changes to the medicine table."],
        ["Reset to default", "Clears the medicine table and the follow-up instructions for this visit. Use with care."],
        ["Save current", "Saves the current medicines as a template. Type a name such as <i>Acne starter, isotretinoin</i> and click <b>Save Template</b>."],
        ["Save fields", "Saves only the chief complaints, diagnosis and examination as a template on this computer."],
        ["New template", "Builds a template from scratch: name, chief complaints, diagnosis, examination findings and medicines."],
      ],
      shots: [
        {
          file: "save-template",
          as: "doctor",
          narrow: true,
          caption: "Save current: name the template.",
          run: async (page, h) => {
            await openShowcase(page, h);
            await page.getByRole("button", { name: "Save current" }).click();
            await page.getByRole("dialog").getByPlaceholder("Dermatology follow-up").fill("Acne grade 3, isotretinoin start");
          },
          target: '[role="dialog"]',
          after: async (page) => {
            const list = await page.getByRole("dialog").count();
            if (list) await page.getByRole("button", { name: "Save Template" }).click();
            await page.waitForTimeout(1500);
          },
        },
        {
          file: "templates-list",
          as: "doctor",
          caption: "The templates list with saved and default templates.",
          run: async (page, h) => {
            await openScratch(page, h);
            await page.locator('div:has(> div > label:text-is("Templates"))').first().getByRole("button").first().click();
            await page.getByRole("menu").waitFor();
            await h.settle(400);
          },
          narrow: true,
          target: '[role="menu"]',
          after: async (page) => { await page.keyboard.press("Escape"); },
        },
        {
          file: "new-template",
          as: "doctor",
          caption: "New template: build a template from scratch.",
          viewport: { width: 1440, height: 1800 },
          run: async (page, h) => {
            await openScratch(page, h);
            await page.getByRole("button", { name: "New template" }).click();
            await page.getByRole("dialog").getByPlaceholder("e.g., Acne follow-up (Derm)").fill("Melasma maintenance");
          },
          target: '[role="dialog"]',
          after: async (page) => { await page.keyboard.press("Escape"); },
        },
      ],
    },
    {
      title: "Dictate with the microphone",
      who: "Doctors",
      body: [
        "The microphone buttons next to <b>Chief Complaints</b> and <b>Detailed Examination</b> turn speech into text. Click the microphone and allow the browser to use it. The button turns red while recording. Talk with the patient as usual, then click the button again to stop. The button spins while the recording is transcribed, and the text is added to the end of the box. A recording stops by itself after 10 minutes.",
        "For Chief Complaints, the app separates the doctor's and the patient's voices and inserts what the patient said. For Detailed Examination it inserts everything. Always read the text before saving. If nothing is heard, the app says <i>No speech detected</i>. To check a microphone, use the Test Transcribe page (see the Voice transcription test chapter).",
      ],
      shots: [],
    },
    {
      title: "Preview and print the prescription",
      who: "Doctors",
      body: [
        "Click <b>Print Preview</b> at the bottom of the Prescription tab. The preview fills the screen: the pages on the left exactly as they will print, and the print settings on the right. The page updates as you change a setting (<b>Live Preview: On</b>). Click <b>Live Preview: Off</b> to pause updates while you change several things.",
      ],
      shots: [
        {
          file: "preview",
          as: "doctor",
          caption: "Print Preview: the prescription on the left, the settings on the right.",
          run: async (page, h) => { await openShowcase(page, h); await openPreview(page, h); },
          after: async (page) => { await closePreview(page); },
        },
        {
          file: "preview-settings",
          as: "doctor",
          caption: "The settings panel of the preview.",
          viewport: { width: 1440, height: 1700 },
          run: async (page, h) => { await openShowcase(page, h); await openPreview(page, h); },
          target: "[data-prescription-preview-sidebar]",
          after: async (page) => { await closePreview(page); },
        },
      ],
      shotLayout: "row",
      fields: [
        ["Zoom", "Makes the preview bigger or smaller on screen. It does not change the printout."],
        ["Top margin / Bottom margin", "Moves the content down from the top or up from the bottom, for letterheads with a printed header or footer. <b>Reset margins</b> goes back to the default."],
        ["Space-optimized layout", "Puts patient details, vitals, diagnosis, histories and procedures on fewer lines with inline headings. Always prints medicines as a table."],
        ["Fit to 1 page", "Shrinks spacing and text, down to a minimum readable size, so everything fits on one page. It turns on the space-optimized layout and sets line spacing and page breaks itself. A green line says <i>Fits on 1 page</i>. An amber line says how many pages it will take if it cannot fit."],
        ["Line spacing", "Normal, Compact or Tight. Reduces the gap between lines. Text size stays the same."],
        ["Print Format", "Table or Text for the medicine list."],
        ["Letterhead", "<b>Letterhead</b> prints on the doctor's letterhead from My Settings, or the clinic's. <b>None (Plain)</b> prints on plain paper, for pre-printed letterhead paper. Applies to the preview and the PDF."],
        ["Page Breaks", "Start a new page before the medicines (Rx), Investigations, Follow-up or Signature. <b>Avoid breaks inside tables</b> keeps the medicine table on one page where possible."],
        ["Printer profile", "Saved margin settings for a particular printer, if your clinic has set them up."],
        ["Refill stamp", "Prints a <i>Refill eligible</i> stamp on the first page."],
        ["Show signature", "Prints the doctor's signature from My Settings. If none is uploaded, the box says so and cannot be ticked. The choice is remembered for this doctor on this computer."],
        ["Page Navigation", "Shown when the prescription runs to more than one page: <b>Prev</b>, <b>Next</b> and <b>Go to</b> a page."],
      ],
      tips: ["The blue tip at the top of the panel explains how to stop the browser printing its own header and footer: in the print window open <b>More settings</b> and turn off <b>Headers and footers</b>."],
    },
    {
      title: "Fit a long prescription on one page",
      who: "Doctors",
      body: ["Tick <b>Fit to 1 page</b>. The app tries the roomiest layout that fits and reports the result under the box."],
      shots: [
        {
          file: "fit-one-page",
          as: "doctor",
          caption: "Fit to 1 page switched on, with the result shown under it.",
          run: async (page, h) => {
            await openShowcase(page, h);
            await openPreview(page, h);
            await sidebar(page).getByText("Fit to 1 page").click();
            await page.locator("[data-fit-status]").waitFor({ timeout: 60000 });
            await h.settle(1500);
          },
          after: async (page) => { await sidebar(page).getByText("Fit to 1 page").click().catch(() => {}); await closePreview(page); },
        },
      ],
    },
    {
      title: "Print, download and share",
      who: "Doctors",
      body: [
        "The buttons at the bottom of the preview panel finish the job. <b>Save Prescription</b> (green) saves from inside the preview. Download PDF, WhatsApp and Email save the latest visit details first, so the copy the patient gets matches the record.",
      ],
      fields: [
        ["Save Prescription", "Saves the prescription. Reads <i>Add medications to save</i> until there is at least one medicine."],
        ["Close", "Closes the preview."],
        ["Interactions", "Checks the medicines for known interactions and lists them, or says <i>No interactions found</i>."],
        ["Email", "Emails the PDF to the patient's email address. Works only after the prescription is saved, and only if the patient has an email address on file."],
        ["PDF via WhatsApp", "Makes the PDF and shares it. On a phone or tablet, the share menu opens so you can pick WhatsApp. On a computer, the PDF downloads and a WhatsApp chat with the patient's number opens: attach the downloaded file there. Needs a phone number on the patient's record."],
        ["High contrast", "Shows the preview in high contrast, to check it is readable."],
        ["Print", "Opens the browser's print window for the prescription."],
        ["Download PDF", "Saves the prescription as a PDF file named after the prescription number."],
      ],
      shots: [
        {
          file: "interactions",
          as: "doctor",
          narrow: true,
          caption: "The Interaction Summary for the current medicines.",
          run: async (page, h) => {
            await openShowcase(page, h);
            await openPreview(page, h);
            await sidebar(page).getByRole("button", { name: "Interactions" }).click();
            await page.getByRole("dialog", { name: "Interaction Summary" }).waitFor();
            await h.settle(1500);
          },
          target: (page) => page.getByRole("dialog", { name: "Interaction Summary" }),
          after: async (page) => { await page.keyboard.press("Escape"); await page.waitForTimeout(300); await closePreview(page); },
        },
      ],
    },
    {
      title: "Tele-video consultations on the print",
      who: "Doctors",
      body: [
        "When the visit's <b>Consultation type</b> is <b>Tele-video</b> (set at the top of the visit, see the Visits chapter), the prescription prints <i>Consultation: Tele-video</i> beside the date and adds a note at the end saying it was issued after a tele-video consultation with the patient's consent and is not valid for medico-legal purposes. The patient's consent must be ticked before the visit or prescription can be saved.",
      ],
      shots: [
        {
          file: "tele-video",
          as: "doctor",
          caption: "A tele-video prescription: the consultation label next to the date.",
          run: async (page, h) => {
            await openScratch(page, h);
            await page.locator("#visit-consultation-type").selectOption("TELE_VIDEO");
            await page.getByText("Patient consented to tele-video consultation").click();
            await page.getByRole("textbox", { name: "Diagnosis" }).fill("Acne vulgaris, grade 2");
            await searchMedicine(page, h, "Adap");
            await page.getByRole("button", { name: "Select" }).first().click();
            await h.settle(1500);
            await openPreview(page, h);
            await page.locator("[data-consultation-label]").first().scrollIntoViewIfNeeded().catch(() => {});
          },
          after: async (page) => { await closePreview(page); },
        },
      ],
    },
    {
      title: "Print layout settings (Customization tab)",
      who: "Doctors",
      body: [
        "The <b>Customization</b> tab of the visit sets up how prescriptions are laid out on paper. Most clinics set it once per doctor and then use <b>Load Doctor Default</b>.",
      ],
      shots: [
        {
          file: "customization",
          as: "doctor",
          caption: "The Customization tab.",
          viewport: { width: 1440, height: 1400 },
          run: async (page, h) => {
            await openShowcase(page, h);
            await page.getByRole("tab", { name: "Customization" }).click();
            await page.getByText("Customization Options").waitFor();
          },
          target: '[role="tabpanel"][data-state="active"]',
        },
      ],
      fields: [
        ["Print Background Image URL", "A letterhead image to print behind the prescription. Leave empty to use the doctor's own letterhead from My Settings. <b>Choose File</b> picks an image from the computer. <b>Clear</b> removes it."],
        ["Top / Bottom / Left / Right Margin (px)", "Space around the content, to keep clear of a printed header and footer."],
        ["Content X / Y Offset", "Moves the whole content sideways or up and down. The arrow buttons nudge it one step at a time. <b>Reset Offsets</b> puts it back."],
        ["Paper Preset", "A4 or Letter."],
        ["Grayscale Mode", "Prints in black and white."],
        ["Show Safe Margin", "Shows the safe printing area, in mm, on the preview."],
        ["Enable Header/Footer Frames", "Reserves a header and footer area of the heights given in mm. <b>Reset Frames</b> sets both to 20 mm."],
        ["Design Aids", "Grid, rulers and snap-to-grid on the preview, with the grid size and nudge step, to line content up with a letterhead."],
        ["Save Doctor Default / Load Doctor Default", "Saves these layout settings for the selected doctor, or applies the saved ones."],
        ["Print Sections", "Tick the parts of the prescription to print, for example vitals, diagnosis, histories, investigations, follow-up and signature. Untick a part to leave it off the paper."],
      ],
    },
  ],
};
