const card = (title) => (page) => page.locator(`xpath=//*[normalize-space(text())="${title}"]/ancestor::div[@data-slot="card"][1]`).first();
const waitDashboard = async (page, h) => {
  await h.goto("/dashboard");
  await page.getByText("System Status", { exact: true }).first().waitFor({ timeout: 30000 });
  await page.getByText("Important notifications requiring your attention").waitFor();
  await h.settle(800);
};
const tall = { width: 1440, height: 1250 };

module.exports = {
  id: "02-dashboard",
  title: "Dashboard",
  intro:
    "The Dashboard is the first page most staff see after signing in. It shows the clinic's numbers at a glance, the alerts that need attention and today's appointments. Doctors also see their recent visits and their own patients. What appears depends on your role.",
  sections: [
    {
      title: "Read the Dashboard",
      who: "Admins and owners",
      body: [
        "Open <b>Dashboard</b> at the top of the menu. An admin or owner sees four areas, marked in the picture below. Wait a moment after the page opens: grey boxes show while the numbers load.",
      ],
      shots: [
        {
          file: "admin",
          caption: "The Dashboard for an admin.",
          viewport: tall,
          run: async (page, h) => {
            await waitDashboard(page, h);
            await h.mark(page.getByText("Total Users", { exact: true }), 1);
            await h.mark(page.getByText("Admin Controls", { exact: true }), 2);
            await h.mark(page.getByText("System Alerts", { exact: true }), 3);
            await h.mark(page.getByText("Today's Appointments", { exact: true }), 4);
          },
        },
      ],
      fields: [
        ["1. Counters", "Four boxes with the clinic's totals. See the table below."],
        ["2. Admin Controls", "The database backup. Admins and owners only."],
        ["3. System Alerts", "Things that need someone's attention, such as stock running out."],
        ["4. Today's Appointments", "The first appointments of the day, in time order."],
        ["Quick Guide", "The button at the top right. It opens a short explanation of this page."],
      ],
    },
    {
      title: "The counters",
      who: "Everyone who sees the Dashboard",
      body: ["The four boxes across the page count the clinic's staff accounts and branches. They are the same for every role."],
      fields: [
        ["Total Users", "Every staff account in the clinic, including accounts that are switched off."],
        ["Active Users", "Staff accounts that can sign in now."],
        ["Total Branches", "How many clinic branches are set up."],
        ["System Status", "<b>operational</b> when the app is working normally."],
      ],
    },
    {
      title: "Back up the database",
      who: "Admins and owners",
      body: [
        "<b>Admin Controls</b> has one tool: <b>Database Backup</b>. It makes a complete copy of the clinic's data, including patients, visits, bills and stock, and saves it on the clinic's server. It does not download anything to your computer.",
        "Make a backup before a big change, such as a stock take, and at regular times agreed with whoever looks after your server.",
      ],
      steps: [
        "Click <b>Create Backup</b>. The button changes to <b>Creating...</b> while the app works.",
        "Read the message that appears. It says whether the backup worked, and if it did, when it was made, where it was saved and its size. Click <b>OK</b> to close it.",
      ],
      shots: [
        {
          file: "admin-controls",
          caption: "Admin Controls with the Create Backup button.",
          run: async (page, h) => {
            await waitDashboard(page, h);
          },
          target: card("Admin Controls"),
        },
      ],
      warnings: [
        "A backup holds every patient's medical and personal details. It stays on the clinic's server. Only the person responsible for the server should copy it anywhere else.",
        "If the message says <i>Backup Failed</i>, tell whoever looks after your server. Do not keep clicking the button.",
      ],
    },
    {
      title: "Act on System Alerts",
      who: "Everyone who sees the Dashboard",
      body: [
        "<b>System Alerts</b> lists what needs attention, one line per kind of problem. Each line has a coloured badge for how urgent it is. A <b>System Status</b> line is always there and says <i>All systems operational</i> when nothing is wrong with the app.",
        "Which alerts you see depends on your role. For example, only staff who look after stock see stock alerts.",
      ],
      shots: [
        {
          file: "alerts",
          caption: "System Alerts with one stock alert and the System Status line.",
          run: async (page, h) => {
            await waitDashboard(page, h);
          },
          target: card("System Alerts"),
          narrow: true,
        },
      ],
      fieldsHeading: ["Alert", "What it means and what to do"],
      fields: [
        ["Overdue Invoices (HIGH)", "Clinic bills that are past their due date, with the total owed. Follow up with the patients."],
        ["Low Stock Alert (MEDIUM)", "The message says how many items are <i>below reorder level</i>. It counts medicines whose stock has run out completely (0 left). Order them, or ask the pharmacy. The Inventory page and the Inventory report in Reports show which ones, along with items that are low but not yet out."],
        ["Expiring Items (MEDIUM or HIGH)", "Medicines that expire within 30 days. The badge is HIGH when any expire within 7 days. The Expiring Stock report in Pharmacy Report lists the batches."],
        ["Pending Payments (LOW)", "Card or online payments still waiting to be matched with the bank."],
        ["System Status (LOW)", "Always shown. <i>All systems operational</i> means the app is working."],
      ],
      after: [
        "Badge colours: red <b>HIGH</b> needs action today, yellow <b>MEDIUM</b> needs action soon, blue <b>LOW</b> is for information.",
        "If the box says <i>Couldn't load clinic alerts</i>, click <b>Try again</b>. If it says your account does not have access, ask your admin to check your role.",
      ],
    },
    {
      title: "See today's appointments",
      who: "Admins, owners, managers, doctors, nurses and reception",
      body: [
        "<b>Today's Appointments</b> shows today's bookings in time order, each with the patient's name, the time slot and its status. Admins, nurses and reception see the first five for the whole clinic. A doctor sees every appointment booked with them today.",
        "Click <b>View All Appointments</b> to open the full appointment calendar.",
      ],
      shots: [
        {
          file: "appointments",
          as: "reception",
          caption: "Today's Appointments as reception sees it.",
          run: async (page, h) => {
            await waitDashboard(page, h);
            await page.getByRole("button", { name: "View All Appointments" }).waitFor();
          },
          target: card("Today's Appointments"),
          narrow: true,
        },
      ],
      fieldsHeading: ["Status", "What it means"],
      fields: [
        ["SCHEDULED", "Booked, not yet confirmed with the patient."],
        ["CONFIRMED", "The patient has confirmed they are coming."],
        ["CHECKED_IN", "The patient has arrived and is waiting."],
        ["IN_PROGRESS", "The patient is with the doctor now."],
        ["COMPLETED", "The visit is finished."],
        ["CANCELLED / NO_SHOW", "The appointment was cancelled, or the patient did not come."],
      ],
      tips: ["If there are no bookings today the box says <i>No appointments scheduled for today</i>."],
    },
    {
      title: "Your patients and recent visits (doctors)",
      who: "Doctors",
      body: [
        "A doctor's Dashboard starts with two extra boxes, above the counters.",
        "<b>Recent Visits</b> lists your last eight consultations, newest first, with the patient's name, the first diagnosis and the date and time. Click a visit to open it on the Visits page.",
        "<b>My Patients</b> lists the patients who have you as their primary doctor. The number in brackets is how many there are. Each row shows the patient code, phone number and the date of their last visit. Click a patient to open their record.",
      ],
      steps: [
        "To find one of your patients, type at least two letters of their name, phone number or patient code in <b>Search by name, phone or code</b>.",
        "When you have more than ten patients, use <b>Previous</b> and <b>Next</b> under the list to move between pages.",
      ],
      shots: [
        {
          file: "doctor",
          as: "doctor",
          caption: "The top of a doctor's Dashboard: Recent Visits and My Patients.",
          run: async (page, h) => {
            await waitDashboard(page, h);
            await page.getByRole("list", { name: "My patients" }).waitFor();
            await h.mark(page.getByText("Recent Visits", { exact: true }), 1);
            await h.mark(page.getByText("My Patients", { exact: true }), 2);
            await h.mark(page.getByPlaceholder("Search by name, phone or code"), 3);
          },
        },
      ],
      after: ["Below these boxes a doctor sees the counters, System Alerts and their own Today's Appointments. Doctors do not see Admin Controls."],
    },
    {
      title: "What reception and pharmacy staff see",
      who: "Reception, pharmacists",
      body: [
        "Reception see the counters, System Alerts and Today's Appointments. They also have a <b>Start Tour</b> button in the top bar (see the next section).",
        "Pharmacists see the counters and System Alerts only, because they do not work with appointments. After signing in they go straight to the pharmacy screens; the Dashboard is still in their menu.",
      ],
      shots: [
        {
          file: "reception",
          as: "reception",
          caption: "Reception: note the Start Tour button at the top.",
          run: async (page, h) => {
            await waitDashboard(page, h);
          },
        },
        {
          file: "pharmacist",
          as: "pharmacist",
          caption: "Pharmacist: counters and alerts, no appointments.",
          run: async (page, h) => {
            await waitDashboard(page, h);
          },
        },
      ],
      shotLayout: "row",
    },
    {
      title: "Take the reception tour",
      who: "Reception",
      body: [
        "The tour walks you through a page one part at a time. A box points at each part and explains it. It is there for new staff and for anyone who wants a reminder. It only starts when you click the button.",
        "The tour exists for the Dashboard, Appointments, Patients, Rooms and the Pharmacy Desk and Counter. On the Dashboard it has four steps: a welcome, the menu, the counters and Today's Appointments.",
      ],
      steps: [
        "Click <b>Start Tour</b> at the top of the screen. The page goes dark except for the part being explained.",
        "Click <b>Next →</b> to move on, or <b>← Back</b> to go back. The dots and the bar at the bottom of the box show how far you are.",
        "Click <b>Finish</b> on the last step.",
        "To leave early, click the red <b>✕</b>, press Esc, or click the dark area outside the box.",
        "To see the tour again, open the page and click <b>Start Tour</b> again. It can be replayed as often as you like.",
      ],
      shots: [
        {
          file: "tour-reception",
          as: "reception",
          caption: "The reception tour on the Dashboard, pointing at the menu.",
          run: async (page, h) => {
            await waitDashboard(page, h);
            await page.getByRole("button", { name: "Start tour" }).click();
            await page.locator(".introjs-tooltip").waitFor();
            await page.locator(".introjs-nextbutton").click();
            await h.settle(900);
          },
          after: async (page) => {
            await page.keyboard.press("Escape");
          },
        },
      ],
    },
    {
      title: "Take the doctor's visit tour",
      who: "Doctors",
      body: [
        "Doctors have a longer tour of the visit screen, where consultations are written. It explains the visit from start to finish in 18 steps: the patient panel, the tabs, vitals, photos, the prescription builder, dermatology features, lab tests, history, saving, printing, completing the visit, voice dictation, keyboard shortcuts and data safety. It takes five to seven minutes.",
      ],
      steps: [
        "Open a visit. For example, click a visit under <b>Recent Visits</b> on your Dashboard.",
        "Click <b>Visit Workflow Tour</b> at the top of the visit form, beside <b>Shortcuts</b>.",
        "Use <b>Next →</b>, <b>← Back</b> and <b>Finish</b> as in the reception tour. Click the red <b>✕</b> or press Esc to stop. Click <b>Visit Workflow Tour</b> again whenever you want to restart it.",
      ],
      shots: [
        {
          file: "tour-doctor",
          as: "doctor",
          caption: "The first step of the Visit Workflow Tour.",
          run: async (page, h) => {
            await waitDashboard(page, h);
            await page.getByRole("list", { name: "Recent visits" }).getByRole("link").first().click();
            await page.getByRole("button", { name: "Visit workflow tour" }).waitFor({ timeout: 30000 });
            await h.settle(1500);
            await page.getByRole("button", { name: "Visit workflow tour" }).click();
            await page.locator(".introjs-tooltip").waitFor();
            await h.settle(900);
          },
          after: async (page) => {
            await page.keyboard.press("Escape");
          },
        },
      ],
    },
  ],
};
