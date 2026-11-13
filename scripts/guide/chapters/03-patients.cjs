const NEW = { first: "Sneha", last: "Iyer", age: "32", phone: "9845012378", abha: "91234567890123", email: "sneha.iyer@example.in", address: "Road No. 3, Banjara Hills, Hyderabad", emergency: "Karthik Iyer (husband), 9845012379" };
const WALKIN = { first: "Farhan", last: "Qureshi", age: "27", phone: "9701234567" };

// Calls the backend with the signed-in browser's session, so no second sign-in is needed.
const call = (page, method, route, body) =>
  page.evaluate(async ({ method, route, body }) => {
    const res = await fetch(`/api${route}`, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }, { method, route, body });

/** Archives earlier copies of a patient this chapter registers, so a second run starts clean. */
async function archiveByPhone(page, phone) {
  const res = await call(page, "GET", `/patients?search=${phone}&limit=50`);
  for (const p of (res && res.data) || []) if (p.phone === phone) await call(page, "POST", `/patients/${p.id}/archive`, {});
}

async function findId(page, phone) {
  const res = await call(page, "GET", `/patients?search=${phone}&limit=5`);
  return ((res && res.data) || []).find((p) => p.phone === phone)?.id;
}

async function openList(page, h) {
  await h.goto("/dashboard/patients");
  await page.getByRole("cell", { name: /Meera Shah/ }).first().waitFor();
  await h.settle(400);
}

async function pick(page, trigger, option) {
  await trigger.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function fillNew(page, h, p, { walkin = false } = {}) {
  await openList(page, h);
  await page.getByRole("button", { name: "New Patient" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("First Name").fill(p.first);
  await d.getByLabel("Last Name").fill(p.last);
  await d.getByLabel("Age (years)").fill(p.age);
  await pick(page, d.getByRole("combobox", { name: "Gender" }), walkin ? "Male" : "Female");
  await d.getByLabel("Phone").fill(p.phone);
  if (!walkin) {
    await d.getByLabel(/ABHA ID/).fill(p.abha);
    await d.getByLabel("Email").fill(p.email);
    await d.getByLabel("Address").fill(p.address);
    await d.getByLabel("Emergency Contact").fill(p.emergency);
    await pick(page, d.getByRole("combobox", { name: "Primary Doctor" }), "Dr. Priya Menon");
    await pick(page, d.getByRole("combobox", { name: /How did the patient hear/ }), "Instagram");
  } else {
    await pick(page, d.getByRole("combobox", { name: /How did the patient hear/ }), "Friends & Family");
    await pick(page, d.getByRole("combobox", { name: "Patient Type" }), "Walk-in");
    await pick(page, d.getByRole("combobox", { name: "Doctor (for walk-in)" }), "Dr. Arvind Shetty");
    await pick(page, d.getByRole("combobox", { name: /Appointment Type/ }), "OPD Consultation");
  }
  await h.settle(300);
}

async function searchFor(page, h, text) {
  await openList(page, h);
  await page.getByLabel("Search patients").fill(text);
  await h.settle(1500);
}

const rowOf = (page, name) => page.getByRole("row").filter({ hasText: name });

/** A soft skin-tone picture drawn in the browser, used as a stand-in clinical photo. */
const photo = (page, seed) =>
  page.evaluate((seed) => {
    const c = Object.assign(document.createElement("canvas"), { width: 960, height: 720 });
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(480, 330, 60, 480, 360, 620);
    grad.addColorStop(0, "#e9bf9f");
    grad.addColorStop(1, "#b97f5f");
    g.fillStyle = grad;
    g.fillRect(0, 0, 960, 720);
    let s = seed;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 26; i++) {
      const x = 180 + rnd() * 600, y = 140 + rnd() * 440, r = 6 + rnd() * 10;
      const spot = g.createRadialGradient(x, y, 0, x, y, r);
      spot.addColorStop(0, "rgba(178,74,70,0.75)");
      spot.addColorStop(1, "rgba(178,74,70,0)");
      g.fillStyle = spot;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  }, seed);

async function openPatient(page, h, id, tab) {
  await h.goto(`/dashboard/patients/${id}`);
  await page.getByRole("tab", { name: "Info" }).waitFor();
  if (tab) {
    await page.getByRole("tab", { name: tab }).click();
    await h.settle(1200);
  }
}

const meera = (h) => h.seed.patients.find((p) => p.name === "Meera Shah").id;
const WIDE = { width: 1680, height: 1000 };

module.exports = {
  id: "03-patients",
  title: "Patients",
  intro:
    "Every person the clinic sees has a patient record. Reception registers new patients and keeps their details up to date. Doctors open a patient's page to see their visits, prescriptions and photos before starting a consultation. This chapter covers the Patients list and the page for one patient.",
  sections: [
    {
      title: "Find your way around the Patients list",
      who: "Reception, doctors, nurses, admins",
      body: [
        "Open <b>Patients</b> from the menu. The page lists the clinic's patients, newest registrations first, 20 to a page. Click anywhere on a row to open that patient's page.",
      ],
      shots: [
        {
          file: "list",
          caption: "The Patients list.",
          viewport: WIDE,
          run: async (page, h) => {
            await openList(page, h);
            await h.mark(page.getByRole("button", { name: "New Patient" }), 1);
            await h.mark(page.getByLabel("Search patients"), 2);
            await h.mark(page.getByRole("combobox", { name: "Filter by gender" }), 3);
            await h.mark(page.getByRole("button", { name: "Export CSV" }), 4);
            await h.mark(page.getByRole("button", { name: /Patient\s*▲/ }), 5);
            await h.mark(rowOf(page, "Anjali Kulkarni").getByRole("button", { name: /More actions/ }), 6);
          },
        },
      ],
      fields: [
        ["1. New Patient", "Opens the form to register a patient."],
        ["2. Search", "Finds patients by name, phone, ABHA number, patient code or email."],
        ["3. Filters", "Gender, consultation type, date range and how many patients to show on a page."],
        ["4. Clear Filters and Export CSV", "Clear Filters empties the search and resets every filter. Export CSV saves the list as a spreadsheet file."],
        ["5. Column headings", "Click <b>Patient</b>, <b>Age</b>, <b>Gender</b> or <b>Referral</b> to sort."],
        ["6. Row buttons", "<b>View</b>, <b>Start Visit</b> and <b>More</b> (Edit, Archive, Link portal, WhatsApp)."],
      ],
      fieldsHeading: ["Marker", "What it is"],
      after: ["Each row shows these columns:"],
    },
    {
      title: "Read a patient row",
      who: "Everyone who uses Patients",
      body: ["The columns give you the patient's key details without opening the record."],
      fields: [
        ["Patient", "The name, with initials in a circle. Under the name, <b>ID</b> shows the last 8 characters of the patient's internal number. Click it to copy the full number, for example to give to support staff."],
        ["Patient Code", "A short 5-character code the app gives every patient when they are registered, for example <i>U2XK4</i>. Write it on files or tell it to the patient. You can type it in the search box. Click <b>Copy code</b> to copy it."],
        ["Age", "Age in years."],
        ["Gender", "MALE, FEMALE or OTHER."],
        ["Contact", "Phone number, and email if one was given."],
        ["ABHA ID", "The patient's 14-digit Ayushman Bharat Health Account number, if recorded."],
        ["Referral", "How the patient heard about the clinic, for example INSTAGRAM or FRIENDS_FAMILY."],
        ["Consultation", "Online or Offline, when the list has it. A dash means it is not shown."],
        ["Actions", "<b>View</b> opens the patient's page. <b>Start Visit</b> opens the Visits page with a new visit for this patient. <b>More</b> opens the menu of other actions."],
      ],
      fieldsHeading: ["Column", "What it shows"],
      shots: [],
    },
    {
      title: "Search for a patient",
      who: "Reception, doctors",
      body: [
        "Search before you register someone, so you do not create the same patient twice. The search needs at least two characters. It matches part of a name, the start of a phone number, an ABHA number, the start of a patient code, or part of an email address.",
      ],
      steps: [
        "Click in the search box.",
        "Type part of the name or the first digits of the phone number, for example <i>Sha</i>.",
        "Wait a moment. The list shows only the matching patients.",
        "Click the row to open the patient.",
      ],
      shots: [
        {
          file: "search",
          caption: "Searching for “Sha” finds Meera Shah and Sunita Sharma.",
          viewport: WIDE,
          run: async (page, h) => {
            await searchFor(page, h, "Sha");
            await page.getByRole("cell", { name: /Sunita Sharma/ }).first().waitFor();
          },
        },
        {
          file: "did-you-mean",
          caption: "With one letter typed, the list suggests names from the page.",
          run: async (page, h) => {
            await openList(page, h);
            await page.getByLabel("Search patients").fill("M");
            await page.getByText("Did you mean").waitFor();
            await h.settle(300);
          },
          target: (page) => page.locator('[data-tour="search-patients"]'),
          narrow: true,
        },
      ],
      shotLayout: "row",
      tips: ["If you type only one letter, the box says <i>Enter at least 2 characters to search</i> and offers <b>Did you mean</b> suggestions from the patients on the page. Click a suggestion to search for it."],
    },
    {
      title: "Filter, sort and page through the list",
      who: "Reception, admins",
      body: [
        "The filters narrow the list to a group of patients, for example the women registered or seen this month. Filters and the search work together.",
      ],
      fields: [
        ["All Genders", "Choose Male, Female or Other to show only those patients."],
        ["All Consultations", "Choose Online or Offline to show only patients with that consultation type."],
        ["All Time", "<b>Last 1 Week</b> or <b>Last 1 Month</b> shows patients who were registered, or had a visit, in that time."],
        ["20 / page", "Shows 10, 20 or 50 patients on a page. The app remembers your choice on this computer."],
        ["Previous, page numbers, Next", "Appear under the list when there is more than one page. The text beside them says, for example, <i>Showing 1 to 10 of 14 patients</i>."],
        ["Column headings", "Click <b>Patient</b>, <b>Age</b>, <b>Gender</b> or <b>Referral</b> to sort by it. A ▲ means smallest first, ▼ largest first. Click again to reverse. Sorting puts the patients on the current page in order."],
        ["Clear Filters", "Empties the search box and sets every filter back to All."],
      ],
      fieldsHeading: ["Control", "What it does"],
      shots: [
        {
          file: "filter-sort",
          caption: "Female patients, sorted by age with the oldest first.",
          viewport: WIDE,
          run: async (page, h) => {
            await openList(page, h);
            await pick(page, page.getByRole("combobox", { name: "Filter by gender" }), "Female");
            await h.settle(1200);
            await page.getByRole("button", { name: /^Age/ }).click();
            await page.getByRole("button", { name: /^Age/ }).click();
            await h.settle(400);
            await h.mark(page.getByRole("combobox", { name: "Filter by gender" }), 1);
            await h.mark(page.getByRole("button", { name: /^Age/ }), 2);
          },
        },
        {
          file: "pages",
          caption: "With 10 patients a page, page buttons appear under the list.",
          run: async (page, h) => {
            await openList(page, h);
            await pick(page, page.getByRole("combobox", { name: "Patients per page" }), "10 / page");
            await page.getByText(/Showing 1 to 10 of/).waitFor();
            await page.getByText(/Showing 1 to 10 of/).scrollIntoViewIfNeeded();
            await h.settle(300);
          },
          target: (page) => page.getByText(/Showing 1 to 10 of/).locator(".."),
          after: async (page, h) => {
            await pick(page, page.getByRole("combobox", { name: "Patients per page" }), "20 / page");
          },
        },
      ],
    },
    {
      title: "Export the patient list",
      who: "Admins, reception",
      body: [
        "<b>Export CSV</b> saves the patients that match the current search and filters to a file you can open in Excel or Google Sheets. All matching patients are saved, not only the ones on the screen. The file is named <i>patients_export_</i> followed by the date.",
        "The file has these columns: ID, Name, Age, Gender, Phone, Email, ABHA ID, Referral, Consultation Type, Portal Linked and Created At.",
      ],
      steps: [
        "Set the search and filters, or click <b>Clear Filters</b> to export everyone.",
        "Click <b>Export CSV</b>.",
        "A message at the top right says how many patients were exported. The file is in your browser's downloads.",
      ],
      warnings: ["The file holds patients' personal details. Store it safely and delete it when you no longer need it."],
      shots: [
        {
          file: "export",
          caption: "The message after exporting.",
          run: async (page, h) => {
            await openList(page, h);
            const download = page.waitForEvent("download").catch(() => null);
            await page.getByRole("button", { name: "Export CSV" }).click();
            await download;
            await page.getByText(/Exported \d+ patients to CSV/).first().waitFor();
            await h.settle(200);
          },
          target: (page) => page.locator("li").filter({ hasText: /Exported \d+ patients/ }).first(),
          narrow: true,
        },
      ],
    },
    {
      title: "Register a new patient",
      who: "Reception, doctors",
      body: [
        "Register a patient the first time they come to the clinic or call to book. Search first to make sure they are not already registered. Only the first name and phone number are required, but the more you fill in now, the less you have to ask later.",
      ],
      steps: [
        "Click <b>New Patient</b>. The <b>Create Patient</b> window opens.",
        "Type the <b>First Name</b> and <b>Last Name</b>.",
        "Type the <b>Age (years)</b> and choose the <b>Gender</b>.",
        "Type the <b>Phone</b> number.",
        "Fill in the optional fields described in the table below.",
        "Click <b>Create</b>. The window closes and the patient appears at the top of the list.",
      ],
      shots: [
        {
          file: "new-patient",
          caption: "The Create Patient window, filled in for a new patient.",
          viewport: { width: 1440, height: 1100 },
          run: async (page, h) => {
            await h.goto("/dashboard/patients");
            await archiveByPhone(page, NEW.phone);
            await fillNew(page, h, NEW);
          },
          target: '[role="dialog"]',
          narrow: true,
          after: async (page, h) => {
            await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
            await page.getByRole("dialog").waitFor({ state: "hidden" });
            await h.settle(500);
          },
        },
        {
          file: "new-patient-row",
          caption: "Sneha Iyer in the list, with her new patient code.",
          viewport: WIDE,
          run: async (page, h) => {
            await searchFor(page, h, "Sneha");
            await page.getByRole("cell", { name: /Sneha Iyer/ }).first().waitFor();
            await h.mark(rowOf(page, "Sneha Iyer").getByRole("button", { name: "Copy code" }), 1);
          },
        },
      ],
      fields: [
        ["ABHA ID", "The patient's Ayushman Bharat Health Account number. It must be exactly 14 digits, with no spaces or dashes. Leave it empty if the patient does not have one."],
        ["Email", "Used for the patient portal and for sending documents."],
        ["Address", "Where the patient lives."],
        ["Emergency Contact", "A name and phone number to call in an emergency."],
        ["Consultation Type", "<b>Offline (In-Clinic Visit)</b> for patients who come in, <b>Online</b> for video consultations."],
        ["Primary Doctor", "The doctor who usually sees this patient. <b>Automatic</b> means: if a doctor registers the patient, that doctor; otherwise the first doctor who sees them. <b>Not assigned</b> leaves it empty."],
        ["How did the patient hear about us?", "Instagram, Twitter, Google, Doctor, Friends &amp; Family or Other. The clinic's reports use it to see which referrals bring patients."],
        ["Patient Type", "<b>Non walk-in</b> for most registrations. <b>Walk-in</b> books an appointment as well (see the next section)."],
      ],
      fieldsHeading: ["Optional field", "What to enter"],
      tips: [
        "If you leave out the first name or phone, the window says <i>Please fill in all required fields (Name, Phone)</i>. If the ABHA ID is not 14 digits, it says <i>ABHA ID must be a 14-digit number</i>.",
        "The patient code is given automatically when you click Create. You cannot type it yourself.",
      ],
    },
    {
      title: "Register a walk-in and book the next free slot",
      who: "Reception",
      body: [
        "When a new patient walks in without an appointment, you can register them and put them in the doctor's queue in one go. The app finds the doctor's next free 30-minute slot, today or in the next 7 days, and books it in the doctor's <b>Confirmed</b> calendar.",
      ],
      steps: [
        "Click <b>New Patient</b> and fill in the patient's details as usual.",
        "Set <b>Patient Type</b> to <b>Walk-in</b>.",
        "Choose the doctor in <b>Doctor (for walk-in)</b>.",
        "Choose the <b>Appointment Type (walk-in)</b>: OPD Consultation, Procedure or Telemedicine.",
        "Optionally choose a <b>Room</b>. For a procedure, pick a free procedure room. Telemedicine has no room.",
        "Click <b>Create</b>. A message says <i>Walk-in appointment booked</i> with the date and time.",
      ],
      shots: [
        {
          file: "walkin-form",
          caption: "A walk-in for Dr. Arvind Shetty.",
          viewport: { width: 1440, height: 1100 },
          run: async (page, h) => {
            await h.goto("/dashboard/patients");
            await archiveByPhone(page, WALKIN.phone);
            await fillNew(page, h, WALKIN, { walkin: true });
          },
          target: '[role="dialog"]',
          narrow: true,
          after: async (page, h) => {
            await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
            await page.getByText("Walk-in appointment booked").first().waitFor({ timeout: 20000 });
          },
        },
        {
          file: "walkin-booked",
          caption: "The message confirms the booking in the Confirmed calendar.",
          run: async (page, h) => {
            await page.getByText("Walk-in appointment booked").first().waitFor();
          },
          target: (page) => page.locator("li").filter({ hasText: "Walk-in appointment booked" }).first(),
          narrow: true,
        },
      ],
      tips: [
        "If the doctor has no free slot in the next 7 days, the message says <i>No slots available</i>. The patient is still registered. Book them from the Appointments page.",
        "If a doctor allows more than one patient per slot and the slot is already taken, the app asks whether to overbook it. See the Appointments chapter.",
      ],
    },
    {
      title: "Change a patient's details",
      who: "Reception, doctors",
      body: ["Update the record when a patient changes their phone number, moves house, or gives details they did not have before."],
      steps: [
        "Find the patient in the list.",
        "Click <b>More</b> on their row, then <b>Edit</b>. The <b>Edit Patient</b> window opens with their details.",
        "Change what you need.",
        "Click <b>Save Changes</b>.",
      ],
      shots: [
        {
          file: "more-menu",
          caption: "The More menu on a patient's row.",
          viewport: WIDE,
          run: async (page, h) => {
            await searchFor(page, h, "Sneha");
            await rowOf(page, "Sneha Iyer").getByRole("button", { name: /More actions/ }).click();
            await page.getByRole("menuitem", { name: "Edit" }).waitFor();
            await h.settle(300);
          },
          after: async (page) => {
            await page.keyboard.press("Escape");
          },
        },
        {
          file: "edit-patient",
          caption: "The Edit Patient window with a new address.",
          viewport: { width: 1440, height: 1100 },
          run: async (page, h) => {
            await searchFor(page, h, "Sneha");
            await rowOf(page, "Sneha Iyer").getByRole("button", { name: /More actions/ }).click();
            await page.getByRole("menuitem", { name: "Edit" }).click();
            const d = page.getByRole("dialog");
            await d.getByText("Edit Patient").waitFor();
            await h.settle(800);
            await d.getByLabel("Address").fill("Flat 402, Aditya Residency, Road No. 10, Jubilee Hills, Hyderabad");
          },
          target: '[role="dialog"]',
          narrow: true,
          after: async (page, h) => {
            await page.getByRole("dialog").getByRole("button", { name: "Save Changes" }).click();
            await page.getByRole("dialog").waitFor({ state: "hidden" }).catch(() => {});
            await h.settle(500);
          },
        },
      ],
    },
    {
      title: "Archive a patient",
      who: "Reception, admins",
      body: [
        "Archive a record that was created by mistake, for example a duplicate. An archived patient no longer appears in the list or in searches. Their visits, prescriptions and bills are kept.",
      ],
      steps: [
        "Click <b>More</b> on the patient's row, then <b>Archive</b>.",
        "The row disappears and a message says <i>Patient archived</i>.",
        "If you archived the wrong patient, click <b>Undo</b> in the message straight away. The patient comes back.",
      ],
      warnings: ["The Undo button only stays while the message is on screen. After that, ask your clinic admin to restore the patient."],
      shots: [
        {
          file: "archived",
          caption: "The message after archiving, with its Undo button.",
          run: async (page, h) => {
            await searchFor(page, h, "Sneha");
            await rowOf(page, "Sneha Iyer").getByRole("button", { name: /More actions/ }).click();
            await page.getByRole("menuitem", { name: "Archive" }).click();
            await page.getByText("Patient archived").first().waitFor();
            await h.settle(300);
          },
          target: (page) => page.locator("li").filter({ hasText: "Patient archived" }).first(),
          narrow: true,
          after: async (page, h) => {
            await page.getByRole("button", { name: "Undo" }).first().click();
            await page.getByText("Archive undone").first().waitFor();
            await h.settle(300);
          },
        },
      ],
    },
    {
      title: "Link a patient to the patient portal",
      who: "Reception, admins",
      body: [
        "If the patient has an account on the clinic's patient portal, link it to their record so they can see their own information there. The portal account must already exist.",
      ],
      steps: [
        "Click <b>More</b> on the patient's row, then <b>Link portal</b>.",
        "Check the <b>Email</b>. It starts with the email on the patient's record. Change it to the email of their portal account if it is different.",
        "Click <b>Link</b>. A message says <i>Portal user linked</i>, and a <b>Portal Linked</b> badge appears under the name.",
        "To remove the link, click <b>More</b>, then <b>Unlink portal</b>, then <b>Confirm</b> in the message.",
      ],
      shots: [
        {
          file: "link-portal",
          caption: "The Link Portal Access window.",
          narrow: true,
          run: async (page, h) => {
            await searchFor(page, h, "Sneha");
            await rowOf(page, "Sneha Iyer").getByRole("button", { name: /More actions/ }).click();
            await page.getByRole("menuitem", { name: "Link portal" }).click();
            await page.getByRole("dialog").getByText("Link Portal Access").waitFor();
            await h.settle(300);
          },
          target: '[role="dialog"]',
          after: async (page) => {
            await page.keyboard.press("Escape");
          },
        },
      ],
    },
    {
      title: "Send a WhatsApp reminder",
      who: "Reception",
      body: [
        "<b>More</b> then <b>WhatsApp</b> sends the patient a reminder of their next appointment on WhatsApp. A message says <i>Reminder sent</i>. If the patient has no upcoming appointment, or the clinic's WhatsApp account is not connected, a red message says the reminder failed.",
      ],
      shots: [],
    },
    {
      title: "Open a patient's page",
      who: "Doctors, reception, nurses",
      body: [
        "Click a patient's row, or <b>View</b>, to open their page. The top of the page sums up the patient. Below it, a row of steps shows where their latest visit has got to, and three tabs hold the details.",
      ],
      shots: [
        {
          file: "detail",
          caption: "Meera Shah's page.",
          viewport: { width: 1440, height: 1000 },
          run: async (page, h) => {
            await openPatient(page, h, meera(h));
            await page.getByText("Primary contact").waitFor();
            await page.getByText("Prescribe", { exact: true }).waitFor();
            await h.settle(800);
            await h.mark(page.getByText(/^Code:/), 1);
            await h.mark(page.getByRole("button", { name: "Resume last visit" }), 2);
            await h.mark(page.getByText("Primary contact"), 3);
            await h.mark(page.getByText("Document", { exact: true }), 4);
            await h.mark(page.getByRole("tab", { name: "Info" }), 5);
          },
        },
      ],
      fields: [
        ["1. Badges", "The internal ID, the patient code, the ABHA number if there is one, gender and age."],
        ["2. Buttons", "<b>Resume last visit</b> reopens the latest visit. <b>Start new visit</b> opens a new visit on the Visits page. <b>Book appointment</b> opens Appointments with this patient already chosen. <b>Back</b> returns to the list."],
        ["3. Summary", "<b>Primary contact</b>: phone, email and primary doctor. <b>Last visit</b>: date and doctor. <b>Next appointment</b>: date and time, or <i>Not scheduled</i>, and how the patient was referred."],
        ["4. Progress steps", "Where the latest visit has got to. See the next section."],
        ["5. Tabs", "<b>Info</b>, <b>History</b> and <b>Uploads</b>."],
      ],
      fieldsHeading: ["Marker", "What it shows"],
    },
    {
      title: "Follow a patient's progress",
      who: "Doctors, reception",
      body: [
        "The six circles under the summary follow the patient's latest visit from start to follow-up. Green means done, a pulsing blue circle means this is the next thing to do, and grey means not reached yet. The buttons under the circles take you straight to the next task.",
      ],
      fields: [
        ["Start", "Done when the patient has a visit. Blue when they have an upcoming appointment but no visit yet."],
        ["Document", "Blue while a visit from the last 24 hours has no prescription yet. Green once the visit is documented."],
        ["Complete", "Green when the latest visit is finished."],
        ["Prescribe", "Green when the latest visit has a prescription, blue when it still needs one."],
        ["Billing", "Green when the patient has a recent bill, blue when a prescription is waiting to be billed."],
        ["Follow-up", "Green when a follow-up has been set on the latest visit."],
        ["Continue, Start Visit or Book", "<b>Continue</b> reopens the latest visit. <b>Start Visit</b> appears when an appointment is waiting. <b>Book</b> appears when the patient has no visit and no appointment."],
        ["View or Prescribe", "Opens the latest visit's prescription, or the visit to write one."],
        ["Invoices or Bill", "Opens the patient's bills, or a new bill for the latest visit."],
      ],
      fieldsHeading: ["Step or button", "Meaning"],
      shots: [
        {
          file: "progress",
          caption: "Meera Shah's progress: visit, documentation, prescription and bill are done.",
          run: async (page, h) => {
            await openPatient(page, h, meera(h));
            await page.getByText("Prescribe", { exact: true }).waitFor();
            await h.settle(800);
          },
          target: (page) => page.getByText("Follow-up", { exact: true }).locator("xpath=ancestor::div[contains(@class,'w-full')][1]"),
        },
      ],
    },
    {
      title: "Check a patient's details",
      who: "Everyone who opens a patient",
      body: ["The <b>Info</b> tab lists the patient's gender, age, phone, email, ABHA ID and address. To change any of them, go back to the list and use <b>More</b>, then <b>Edit</b>."],
      shots: [
        {
          file: "info-tab",
          caption: "The Info tab.",
          run: async (page, h) => {
            await openPatient(page, h, meera(h));
            await page.getByText("Patient Information").waitFor();
          },
          target: (page) => page.locator("[role=tabpanel][data-state=active]"),
        },
      ],
    },
    {
      title: "Read a patient's history",
      who: "Doctors, nurses",
      body: [
        "The <b>History</b> tab lists every visit and appointment, newest first, grouped by date. Each card shows the visit date, the doctor, the visit status, the chief complaint, the diagnosis and the number of medicines prescribed.",
      ],
      steps: [
        "Click the <b>History</b> tab.",
        "To narrow the list, choose a doctor in the <b>All doctors</b> list, or set a from and to date. <b>Clear filters</b> shows everything again.",
        "Click a date bar to hide or show the records for that day.",
        "On a card, click <b>Show details</b> to read the history, medicines and photos from that visit. <b>Full details</b> and <b>Compact view</b> switch between the full record and a short one.",
        "Click <b>Resume session</b> to open the visit on the Visits page.",
        "Click <b>Refresh</b> to load any changes made since you opened the page.",
      ],
      shots: [
        {
          file: "history",
          caption: "Meera Shah's History tab, with two visits.",
          viewport: { width: 1440, height: 1100 },
          run: async (page, h) => {
            await openPatient(page, h, meera(h), "History");
            await page.getByText("Patient History").waitFor();
            await page.getByRole("button", { name: /Show details/ }).first().waitFor();
            await page.getByRole("tab", { name: "History" }).scrollIntoViewIfNeeded();
          },
          target: (page) => page.locator("[role=tabpanel][data-state=active]"),
        },
        {
          file: "history-details",
          caption: "One visit opened with Show details.",
          viewport: { width: 1440, height: 1300 },
          run: async (page, h) => {
            await openPatient(page, h, meera(h), "History");
            await page.getByRole("button", { name: /Show details/ }).first().click();
            await h.settle(600);
          },
          target: (page) => page.getByRole("button", { name: /Hide details/ }).first().locator("xpath=ancestor::div[contains(@class,'border')][2]"),
        },
      ],
    },
    {
      title: "Add before and after photos",
      who: "Doctors, nurses",
      body: [
        "Photos let you compare a patient's skin or hair over time. The <b>Uploads</b> tab holds photos for the patient. Each photo is tagged with the position it shows, so the same view can be compared between visits.",
      ],
      steps: [
        "Click the <b>Uploads</b> tab.",
        "Click <b>Choose Files</b> (or <b>Upload</b>) and pick one or more pictures. On a phone or tablet, <b>Take Photo</b> (or <b>Camera</b>) opens the camera.",
        "The <b>Tag photo positions</b> window opens. For each picture, choose the position: Front, Left, Right, Back, Close-up or Other. <b>Infer positions</b> fills them in the usual order. <b>Grid</b> shows all pictures at once and <b>Single</b> shows one at a time.",
        "Click <b>Upload</b>. The photos appear in the viewer.",
        "Use <b>Prev</b> and <b>Next</b> to move between photos, or click a thumbnail. When there are photos from more than one visit, <b>Compare: Off</b> switches to a side-by-side view of the same position from two visits.",
      ],
      shots: [
        {
          file: "tag-photos",
          caption: "Tagging two photos before they are uploaded.",
          viewport: { width: 1440, height: 1000 },
          run: async (page, h) => {
            await h.goto("/dashboard/patients");
            const id = await findId(page, NEW.phone);
            await openPatient(page, h, id, "Uploads");
            const files = [];
            for (const [i, name] of [[7, "sneha-front.jpg"], [19, "sneha-left-cheek.jpg"]])
              files.push({ name, mimeType: "image/jpeg", buffer: Buffer.from(await photo(page, i), "base64") });
            await page.locator('input[type="file"][multiple]').setInputFiles(files);
            await page.getByText("Tag photo positions").waitFor();
            await page.getByRole("button", { name: "Infer positions" }).click();
            await h.settle(600);
          },
          target: '[role="dialog"]',
          after: async (page, h) => {
            await page.getByRole("dialog").getByRole("button", { name: "Upload", exact: true }).click();
            await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
            await h.settle(800);
          },
        },
        {
          file: "uploads",
          caption: "The Uploads tab after the upload.",
          viewport: { width: 1440, height: 1100 },
          run: async (page, h) => {
            await h.goto("/dashboard/patients");
            const id = await findId(page, NEW.phone);
            await openPatient(page, h, id, "Uploads");
            await page.getByText(/Before \/ After Photos \([1-9]/).waitFor();
            await h.settle(800);
          },
          target: (page) => page.locator("[role=tabpanel][data-state=active]"),
        },
      ],
    },
    {
      title: "Quick Guide",
      who: "Everyone who uses Patients",
      body: [
        "The <b>Quick Guide</b> button at the top right of the Patients page opens a short summary of the page. Where it differs from the screen, follow the screen: the button is called <b>New Patient</b>, only the first name and phone are required, and age is typed in years rather than a date of birth.",
      ],
      shots: [
        {
          file: "quick-guide",
          caption: "The Patients Management Guide.",
          narrow: true,
          run: async (page, h) => {
            await openList(page, h);
            await page.getByRole("button", { name: "Quick Guide" }).click();
            await h.settle(600);
          },
          target: '[role="dialog"]',
          after: async (page) => {
            await page.keyboard.press("Escape");
          },
        },
      ],
    },
  ],
};
