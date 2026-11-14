const NEW_USER = { firstName: "Deepa", lastName: "Nair", email: "deepa.nair@stack.example.invalid", phone: "9849012345" };
const HOLIDAY = "2027-01-26";
const userRow = (page, name) => page.getByRole("row", { name: new RegExp(name) });
const dialog = '[role="dialog"]';
const openUsers = async (page, h) => {
  await h.goto("/dashboard/users");
  await page.getByRole("row", { name: /Priya Menon/ }).waitFor();
};
const close = async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
};
let resetCode = null;

module.exports = {
  id: "17-users",
  title: "Users",
  intro:
    "The Users page is where admins and owners manage the clinic's staff accounts: who can sign in, what role they have, and what they are allowed to do. It also holds each doctor's working hours and WhatsApp settings, and the clinic's holidays. Managers can open the page and see the list, but only admins and owners can change accounts.",
  setup: async (h) => {
    const db = h.db();
    try {
      const old = await db.user.findFirst({ where: { email: NEW_USER.email } });
      if (old) await db.user.delete({ where: { id: old.id } }).catch(() => db.user.update({ where: { id: old.id }, data: { email: `removed-${Date.now()}@stack.example.invalid`, isActive: false } }));
    } finally {
      await db.$disconnect();
    }
  },
  sections: [
    {
      title: "Find your way around the Users page",
      who: "Admins and owners",
      body: [
        "Open <b>Users</b> from the Admin part of the menu. The table lists every staff account in the clinic, with buttons for each one on the right.",
      ],
      shots: [
        {
          file: "list",
          caption: "The Users page.",
          run: async (page, h) => {
            await openUsers(page, h);
            await h.mark(page.getByRole("button", { name: "New User" }), 1);
            await h.mark(page.getByRole("button", { name: "Clinic Holidays" }), 2);
            await h.mark(page.getByRole("button", { name: "Quick Guide" }), 3);
            await h.mark(page.getByRole("button", { name: "Edit" }).first(), 4);
          },
        },
      ],
      fields: [
        ["1. New User", "Creates a staff account."],
        ["2. Clinic Holidays", "Days the whole clinic is closed."],
        ["3. Quick Guide", "A short summary of this page."],
        ["4. Row buttons", "<b>Edit</b>, <b>Delete</b>, <b>Reset password</b> and <b>Role &amp; Permissions</b> on every row. Doctors' rows also have <b>Working Hours</b> and <b>WhatsApp Settings</b>."],
        ["Name, Email", "The person's name and the email address they can sign in with."],
        ["Role", "What kind of work they do. It decides which pages they see. See <i>What each role can do</i> below."],
        ["Status", "Whether they can sign in. See <i>Account statuses</i> below."],
      ],
    },
    {
      title: "Add a new member of staff",
      who: "Admins and owners",
      body: [
        "Create an account for each person who joins, so everyone signs in as themselves. Never share one account between two people: the app records who did what.",
      ],
      steps: [
        "Click <b>New User</b>. The <b>Create User</b> window opens.",
        "Type the <b>First Name</b> and <b>Last Name</b>.",
        "Type their <b>Email</b> and mobile number in <b>Phone</b>. They can sign in with either. The phone number is required.",
        "Choose the <b>Role</b>. The window starts on Receptionist.",
        "Leave <b>Status</b> on <b>Active</b> so they can sign in.",
        "Type a starting password of 8 to 20 characters in <b>Password</b>. Tell it to the person privately.",
        "Click <b>Create</b>. The window closes and the new person appears in the table.",
      ],
      shots: [
        {
          file: "new-user",
          caption: "The Create User window filled in for a new nurse.",
          narrow: true,
          run: async (page, h) => {
            await openUsers(page, h);
            await page.getByRole("button", { name: "New User" }).click();
            const d = page.locator(dialog);
            await d.getByText("Create User").waitFor();
            const inputs = d.locator("input");
            await inputs.nth(0).fill(NEW_USER.firstName);
            await inputs.nth(1).fill(NEW_USER.lastName);
            await d.locator('input[type="email"]').fill(NEW_USER.email);
            await d.locator('input[type="tel"]').fill(NEW_USER.phone);
            await d.getByRole("combobox").first().click();
            await page.getByRole("option", { name: "Nurse" }).click();
            await d.locator('input[type="password"]').fill("Linae@2026");
            await h.settle(300);
          },
          target: dialog,
        },
        {
          file: "new-user-saved",
          caption: "Deepa Nair now has an account with the NURSE role.",
          run: async (page, h) => {
            await page.locator(dialog).getByRole("button", { name: "Create" }).click();
            await userRow(page, "Deepa Nair").waitFor();
            await h.settle(500);
            await h.mark(userRow(page, "Deepa Nair"), 1);
          },
        },
      ],
      fieldsHeading: ["Role in the list", "Who it is for"],
      fields: [
        ["Admin", "Runs the clinic system. Sees every page."],
        ["Doctor", "Sees patients, writes visits and prescriptions, and has the pharmacy screens."],
        ["Nurse", "Records patients, appointments, vitals and room use."],
        ["Receptionist", "Front desk: patients, appointments, rooms, and pharmacy billing."],
        ["Manager", "Runs the clinic day to day: reports, users, stock, appointments."],
        ["Pharmacist", "Pharmacy billing, stock and pharmacy reports."],
      ],
      after: ["The Owner role cannot be given from this window. The clinic's owner account is set up when the clinic is first installed."],
      tips: ["If you see <i>Phone number is required</i> or <i>Password must be 8-20 characters</i>, fix that field and click <b>Create</b> again."],
    },
    {
      title: "Change someone's details or status",
      who: "Admins and owners",
      body: [
        "Use <b>Edit</b> when someone changes their phone number or email, moves to a different job, or leaves. The window is the same as for a new user, without the password box. Passwords are changed with a reset code, described next.",
      ],
      steps: [
        "Click <b>Edit</b> on the person's row. The <b>Edit User</b> window opens with their details.",
        "Change what you need. To stop someone signing in, set <b>Status</b> to <b>Inactive</b> or <b>Suspended</b>.",
        "Click <b>Save</b>.",
      ],
      shots: [
        {
          file: "edit-user",
          caption: "Editing an account.",
          narrow: true,
          run: async (page, h) => {
            await openUsers(page, h);
            await userRow(page, "Deepa Nair").getByRole("button", { name: "Edit" }).click();
            await page.locator(dialog).getByText("Edit User").waitFor();
            await h.settle(300);
          },
          target: dialog,
          after: close,
        },
      ],
      fieldsHeading: ["Status", "What it means"],
      fields: [
        ["ACTIVE", "Can sign in and work."],
        ["INACTIVE", "Cannot sign in. The sign-in page says <i>Account disabled</i>. Use it when someone leaves; their past work stays on record."],
        ["SUSPENDED", "Cannot sign in. The sign-in page says <i>Account suspended</i>. Use it to block an account for a while."],
        ["PENDING", "Cannot sign in yet. Use it for someone who has not started."],
      ],
    },
    {
      title: "Give someone a password reset code",
      who: "Admins and owners",
      body: [
        "The app never emails passwords or reset links. When someone forgets their password, you make them a one-time reset code, and they choose a new password with it. You never see their new password.",
        "Make a code only after you have checked in person, or on a call you are sure of, that the person is asking. Anyone with the code can take over the account. You can make a code for staff at your level or below. Only an owner can make one for an owner.",
      ],
      steps: [
        "Click <b>Reset password</b> on the person's row.",
        "Read the warning, then click <b>I have confirmed who is asking. Create code</b>.",
        "Give the 8-character code to the person. Click <b>Copy code</b> if you want to paste it into a message to them. The code is shown only once, works once and expires after 24 hours. Making another code cancels the first one.",
        "The person opens the sign-in page, clicks <b>enter your reset code</b>, and types the code in <b>Reset code</b>.",
        "They type a new password of at least 8 characters in <b>New password</b> and again in <b>Confirm new password</b>, then click <b>Set new password</b>.",
        "The page says <i>Password updated</i> and opens the sign-in page. They sign in with the new password.",
      ],
      shots: [
        {
          file: "reset-confirm",
          caption: "Step 1: confirm who is asking.",
          narrow: true,
          run: async (page, h) => {
            await openUsers(page, h);
            await userRow(page, "Deepa Nair").getByRole("button", { name: "Reset password" }).click();
            await page.locator(dialog).getByRole("button", { name: /Create code/ }).waitFor();
          },
          target: dialog,
        },
        {
          file: "reset-code",
          caption: "Step 2: the one-time code to give the person.",
          narrow: true,
          run: async (page, h) => {
            await page.locator(dialog).getByRole("button", { name: /Create code/ }).click();
            const code = page.getByLabel("Reset code");
            await code.waitFor();
            resetCode = (await code.innerText()).trim();
          },
          target: dialog,
          after: close,
        },
        {
          file: "reset-page",
          as: "anon",
          caption: "Step 3: the person sets a new password with the code.",

          run: async (page, h) => {
            await h.goto("/reset-password");
            await page.getByLabel("Reset code").fill(resetCode || "");
            await page.getByLabel("New password", { exact: true }).fill("Deepa@Linae26");
            await page.getByLabel("Confirm new password").fill("Deepa@Linae26");
            await h.settle(300);
          },
          after: async (page) => {
            await page.getByRole("button", { name: /Set new password/ }).click();
            await page.getByText(/Password updated/).waitFor({ timeout: 15000 });
          },
        },
      ],
      tips: ["If the person's code says it is wrong or expired, make a new one. Each new code replaces the last."],
    },
    {
      title: "Change a role or permissions",
      who: "Admins and owners",
      body: [
        "<b>Role &amp; Permissions</b> changes what someone can do. The role on the left sets the pages in their menu. The list on the right holds individual permissions, grouped by area, for finer control.",
      ],
      steps: [
        "Click <b>Role &amp; Permissions</b> on the person's row.",
        "To change the role, choose it in <b>Role</b> and click <b>Apply Role</b>. A message confirms the change, and the permissions list is reset to that role's usual permissions.",
        "To fine-tune, tick or untick permissions on the right. <b>Select all</b> and <b>Clear</b> work on one group; <b>Clear All</b> unticks everything. <b>Selected</b> shows how many are ticked.",
        "Click <b>Save Permissions</b>. A message confirms the change.",
      ],
      shots: [
        {
          file: "role-permissions",
          caption: "The Role &amp; Permissions window.",
          run: async (page, h) => {
            await openUsers(page, h);
            await userRow(page, "Deepa Nair").getByRole("button", { name: "Role & Permissions" }).click();
            await page.locator(dialog).getByRole("button", { name: "Apply Role" }).waitFor();
            await h.settle(1500);
          },
          target: dialog,
          after: close,
        },
      ],
      warnings: [
        "If the list on the right is empty and <b>Selected</b> shows 0, do not click <b>Save Permissions</b>: that would save the person with no permissions. Change the role with <b>Apply Role</b> instead, and ask your system administrator about the empty list.",
      ],
    },
    {
      title: "What each role can do",
      who: "Admins and owners",
      body: ["The role decides which pages appear in the person's menu. Pages they cannot use are hidden, and the app refuses the action if they reach it another way."],
      fieldsHeading: ["Role", "Pages in the menu"],
      fields: [
        ["Admin", "Every page: Dashboard, Daily Collection, Patients, Appointments, Visits, Procedures, Rooms, Pharmacy Desk, Pharmacy Counter, Sales, Inventory, Pharmacy Report, Reports, Users, Fee list and Test Transcribe. Can make database backups."],
        ["Owner", "The same as Admin, except the Pharmacy Desk and Pharmacy Counter."],
        ["Manager", "Dashboard, Daily Collection, Patients, Appointments, Visits, Procedures, Inventory, Pharmacy Report, Reports and Users. Not the Fee list, Rooms or the pharmacy billing screens."],
        ["Doctor", "Dashboard, Daily Collection, Patients, Appointments, Visits, Procedures, Rooms, Pharmacy Desk, Pharmacy Counter, Sales, Inventory, Pharmacy Report and Test Transcribe."],
        ["Nurse", "Dashboard, Patients, Appointments, Visits and Rooms."],
        ["Receptionist", "Dashboard, Patients, Appointments, Rooms, Pharmacy Desk, Pharmacy Counter and Inventory."],
        ["Pharmacist", "Dashboard, Daily Collection, Pharmacy Desk, Pharmacy Counter, Sales, Inventory and Pharmacy Report."],
      ],
    },
    {
      title: "Set a doctor's working hours, leave and overbooking",
      who: "Admins and owners",
      body: [
        "Each doctor's row has <b>Working Hours</b>. The appointment calendar uses these hours to show when the doctor is free. Doctors can set their own hours in My Settings (see Getting started); this button lets an admin do it for them.",
      ],
      steps: [
        "Click <b>Working Hours</b> on the doctor's row. The <b>Availability</b> window opens.",
        "Under <b>Weekly working hours (IST)</b>, set a start and end time for each shift. Click <b>+ Shift</b> beside a day to add a second shift, for example an evening clinic. Click the bin to remove a shift. A day with no shift shows <i>Day off</i>.",
        "Click <b>Copy Monday to Tue–Fri</b> to give the weekdays the same hours as Monday.",
        "Click <b>Save hours</b>.",
        "Under <b>Overbooking</b>, switch on <b>Allow overbooking</b> and choose up to how many patients can share one slot, then click <b>Save overbooking</b>. When it is off, each time slot takes one patient. When it is on, reception must confirm each extra patient in a slot that is already taken.",
        "Under <b>Leave and blocked time</b>, choose the <b>Type</b> (<b>Leave</b> or <b>Blocked time</b>), the <b>From</b> and <b>To</b> dates, and either <b>All day</b> or a start and end time. Add a reason if you like, then click <b>Add leave</b> (or <b>Add blocked time</b>). Nobody can book the doctor during that time. Upcoming time off is listed above the form, with a bin to remove it.",
      ],
      shots: [
        {
          file: "working-hours",
          caption: "A doctor's weekly hours, leave and overbooking.",
          viewport: { width: 1440, height: 1250 },
          run: async (page, h) => {
            await openUsers(page, h);
            await userRow(page, "Priya Menon").getByRole("button", { name: "Working Hours" }).click();
            await page.locator(dialog).getByRole("button", { name: "Save hours" }).waitFor();
            await h.settle(800);
          },
          target: dialog,
          after: close,
        },
      ],
      tips: ["A yellow note at the top means the hours shown are a default or an older setting. Click <b>Save hours</b> to keep them as the doctor's schedule."],
    },
    {
      title: "Set up WhatsApp messages for a doctor",
      who: "Admins and owners",
      body: [
        "The clinic can send patients a WhatsApp confirmation when an appointment is booked with a doctor. <b>WhatsApp Settings</b> on the doctor's row turns this on for that doctor. The clinic's WhatsApp Business account must be connected first by whoever set up the system.",
      ],
      shots: [
        {
          file: "whatsapp",
          caption: "Doctor WhatsApp Settings.",
          narrow: true,
          run: async (page, h) => {
            await openUsers(page, h);
            await userRow(page, "Priya Menon").getByRole("button", { name: "WhatsApp Settings" }).click();
            await page.locator(dialog).getByText("Doctor WhatsApp Settings").waitFor();
            await h.settle(400);
          },
          target: dialog,
          after: close,
        },
      ],
      fields: [
        ["Send WhatsApp on appointment creation", "Switch on to send the patient a message whenever an appointment is booked with this doctor."],
        ["Doctor WhatsApp Phone Number ID", "Optional. Only if this doctor sends from their own WhatsApp number instead of the clinic's. The number comes from the WhatsApp Business account."],
        ["Doctor WhatsApp Access Token", "Optional, with the number above. Leave it blank to keep the saved one. It is never shown again after saving."],
        ["Use WhatsApp Template", "Switch on to send an approved template instead of plain text. WhatsApp needs a template to message a patient who has not written to the clinic in the last 24 hours. Then type the <b>Template Name</b> and <b>Language Code</b> exactly as approved, for example <i>en</i>."],
        ["Templates: Manage", "Opens the template editor, where you write and keep message templates (see below)."],
        ["Save / Close", "<b>Save</b> keeps the settings. <b>Close</b> leaves without saving."],
      ],
    },
    {
      title: "Write WhatsApp message templates",
      who: "Admins and owners",
      body: [
        "The template editor holds the wording of the clinic's WhatsApp messages. Open it with <b>Manage</b> in a doctor's WhatsApp Settings. The list at the top shows saved templates with <b>Edit</b> and <b>Delete</b>; <b>New</b> starts a blank one.",
      ],
      shots: [
        {
          file: "templates",
          caption: "The WhatsApp Template Editor.",
          viewport: { width: 1440, height: 1250 },
          run: async (page, h) => {
            await openUsers(page, h);
            await userRow(page, "Priya Menon").getByRole("button", { name: "WhatsApp Settings" }).click();
            await page.locator(dialog).getByRole("button", { name: "Manage" }).click();
            await page.getByText("WhatsApp Template Editor").waitFor();
            await h.settle(800);
          },
          target: (page) => page.locator(dialog).filter({ hasText: "WhatsApp Template Editor" }).last(),
          after: async (page) => {
            await close(page);
            await close(page);
          },
        },
      ],
      fields: [
        ["Name", "Your own name for the template, for example <i>Appointment Confirmation</i>."],
        ["Touchpoint", "When it is used: Appointment Confirmation, Appointment Reminder, Invoice Share or Prescription Share."],
        ["Language", "The language code, for example <i>en</i> or <i>hi</i>."],
        ["Ownership", "<b>My Template</b> is yours only. <b>Branch Template (Admin)</b> is shared with the whole clinic."],
        ["Generator Hints and Generate", "Type a few words about the clinic and click <b>Generate</b> to have a draft written for you. Read it before saving."],
        ["Active", "Switch off to keep a template without using it."],
        ["Designer", "Write the message. <b>B</b>, <i>I</i> and <u>U</u> make text bold, italic or underlined."],
        ["Variables", "Blanks filled in for each patient, such as the patient's name or appointment time. The ready-made ones are patient_name, doctor_name, appointment_date, appointment_time and queue_token. Click one to put it into the message where the cursor is. To make a new one, type its name (letters, numbers and underscores) and click <b>Add</b>."],
        ["Plain Text (fallback)", "The message without formatting. It fills itself from the designer; you can edit it."],
        ["Save Template", "Keeps the template."],
        ["Send Test", "After saving, type your own number in <b>Test Phone</b> with the country code, for example +919849012345, and click <b>Send Test</b> to see the message on your phone. The variables are sent blank in a test."],
      ],
    },
    {
      title: "Add a clinic holiday",
      who: "Admins and owners",
      body: [
        "A clinic holiday closes the clinic for every doctor. Appointments cannot be booked on it. Add festivals and closures well ahead so reception does not book patients on those days.",
      ],
      steps: [
        "Click <b>Clinic Holidays</b> at the top of the Users page.",
        "Choose the first day in <b>From</b> and the last day in <b>To</b>. For one day, make them the same.",
        "Leave <b>All day</b> ticked, or untick it and set a <b>Start time</b> and <b>End time</b> for a half day.",
        "Type a <b>Reason</b>, for example <i>Republic Day</i>.",
        "Click <b>Add clinic holiday</b>. It appears in the list above the form. Click the bin beside a holiday to remove it.",
      ],
      shots: [
        {
          file: "holidays",
          caption: "Clinic Holidays with Republic Day added.",
          narrow: true,
          run: async (page, h) => {
            await openUsers(page, h);
            await page.getByRole("button", { name: "Clinic Holidays" }).click();
            const d = page.locator(dialog);
            await d.getByText("Holidays close the clinic for all doctors").waitFor();
            await h.settle(800);
            if (!(await d.getByText(/Republic Day/).count())) {
              await d.locator('input[type="date"]').nth(0).fill(HOLIDAY);
              await d.locator('input[type="date"]').nth(1).fill(HOLIDAY);
              await d.getByRole("textbox").last().fill("Republic Day");
              await d.getByRole("button", { name: /Add clinic holiday/ }).click();
              await d.getByText(/Republic Day/).first().waitFor();
            }
            await h.settle(500);
          },
          target: dialog,
          after: close,
        },
      ],
    },
    {
      title: "Remove a staff account",
      who: "Admins and owners",
      body: [
        "Delete an account only when it was made by mistake, for example a duplicate. For someone who leaves, set their status to <b>Inactive</b> instead: their name stays on the visits, bills and prescriptions they made.",
      ],
      steps: [
        "Click <b>Delete</b> on the person's row.",
        "The browser asks <i>Delete user?</i>. Click <b>OK</b> to delete, or <b>Cancel</b> to keep the account.",
        "The person disappears from the table.",
      ],
      shots: [
        {
          file: "deleted",
          caption: "The list after the Deepa Nair account was deleted.",
          run: async (page, h) => {
            await openUsers(page, h);
            page.once("dialog", (d) => d.accept());
            await userRow(page, "Deepa Nair").getByRole("button", { name: "Delete" }).click();
            await userRow(page, "Deepa Nair").waitFor({ state: "detached", timeout: 15000 });
            await h.settle(500);
          },
        },
      ],
      warnings: ["Deleting cannot be undone."],
    },
  ],
};
