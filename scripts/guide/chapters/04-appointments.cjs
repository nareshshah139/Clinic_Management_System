const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const NEW_PATIENT = { first: "Ayesha", last: "Siddiqui", age: "34", phone: "9963014752" };
const MINE = ["Vikram Singh", "Rahul Bhatt", "Sunita Sharma", "Ayesha Siddiqui"];

const tomorrow = (h) => addDays(h.seed.today, 1);
const column = (page, calendar) => page.locator(`section[data-calendar="${calendar}"]`);
const tile = (page, calendar, slot, verb = "Book") => column(page, calendar).getByRole("button", { name: new RegExp(`^${verb} ${slot}($|,)`) }).first();
const block = (page, name) => page.locator("[data-appointment-block]").filter({ hasText: name }).first();
const dayGrid = (page) => page.locator("div.grid").filter({ has: page.locator("[data-time-gutter]") }).first();

async function openDay(page, h, { doctor = "Priya Menon", date = h.seed.today } = {}) {
  await h.goto("/dashboard/appointments");
  await page.getByRole("combobox", { name: "Doctor" }).click();
  await page.getByRole("option", { name: doctor }).click();
  await page.getByLabel("Date").fill(date);
  await page.getByText("Doctor Calendar").waitFor();
  await column(page, "CONFIRMED").waitFor();
  await h.settle(1200);
}

async function choosePatient(page, h, name) {
  await page.getByPlaceholder("Search patient by name/phone").first().fill(name);
  await page.locator("div.cursor-pointer").filter({ hasText: name }).first().click();
  await h.settle(300);
}


module.exports = {
  id: "04-appointments",
  title: "Appointments",
  intro:
    "The Appointments page is each doctor's diary for the day. Reception books patients into it, calls them to confirm, and moves or cancels bookings. Doctors use it to see who is next and to start the visit. The front desk can also bill a consultation straight from the diary.",
  setup: async (h) => {
    const db = h.db();
    try {
      const day = new Date(`${addDays(h.seed.today, 1)}T00:00:00Z`);
      await db.appointment.updateMany({
        where: { date: day, status: { not: "CANCELLED" }, patient: { name: { in: MINE } } },
        data: { status: "CANCELLED" },
      });
      await db.patient.updateMany({ where: { phone: NEW_PATIENT.phone }, data: { isArchived: true, phone: "0000000000" } }).catch(() => {});
      const rahul = h.seed.patients.find((p) => p.name === "Rahul Bhatt").id;
      await db.appointment.create({
        data: { patientId: rahul, doctorId: h.seed.doctor2, branchId: h.stack.branchId, date: day, slot: "11:00-11:30", visitType: "OPD", status: "CONFIRMED" },
      });
    } finally {
      await db.$disconnect();
    }
  },
  sections: [
    {
      title: "Open a doctor's day",
      who: "Reception, doctors, nurses, admins",
      body: [
        "Open <b>Appointments</b> from the menu. Choose the doctor and the date at the top. The page opens on today, and remembers the doctor you chose last time on this computer.",
        "The <b>Calendar</b> tab is the day view used for booking. The <b>Slots</b> tab shows the same day with a few different controls (see <i>Use the Slots tab</i> below).",
      ],
      steps: [
        "Choose the doctor in <b>Doctor</b>.",
        "Choose the day in <b>Date</b>.",
        "Read the day in the two columns under the legend.",
      ],
      shots: [
        {
          file: "page",
          as: "reception",
          caption: "The Appointments page for Dr. Priya Menon, today.",
          fullPage: true,
          run: async (page, h) => {
            await openDay(page, h);
            await h.mark(page.getByRole("combobox", { name: "Doctor" }), 1);
            await h.mark(page.getByLabel("Date"), 2);
            await h.mark(page.getByRole("tab", { name: "Calendar" }), 3);
            await h.mark(page.getByPlaceholder("Search patient by name/phone"), 4);
            await h.mark(page.getByRole("heading", { name: "Legend" }), 5);
            await h.mark(column(page, "SCHEDULED").locator("header"), 6);
          },
        },
      ],
      fields: [
        ["1. Doctor", "Whose diary you see."],
        ["2. Date", "The day you see. Bookings, moves and bills all apply to this day."],
        ["3. Calendar and Slots", "Two views of the same day."],
        ["4. Filters and patient search", "Visit Type, Room, Patient and Grid. The patient you choose here is the one you book."],
        ["5. Legend", "What the colours mean."],
        ["6. Scheduled and Confirmed", "The two columns of the day, side by side on one time scale."],
      ],
      fieldsHeading: ["Marker", "What it is"],
    },
    {
      title: "Understand the Scheduled and Confirmed columns",
      who: "Reception, doctors",
      body: [
        "Each doctor's day has two calendars. <b>Scheduled</b> (left, grey line) holds patients booked ahead who have not yet confirmed. Reception calls them the day before. <b>Confirmed</b> (right, blue line) is the doctor's real day: confirmed patients, walk-ins and patients who are being seen or have been seen.",
        "Under each column title, a line counts its patients, for example <i>3 patients to confirm</i> or <i>2 patients confirmed</i>. The time runs down the left. A red line across both columns marks the current time on today's page. Times that have passed are greyed and cannot be booked.",
        "Each column has its own places. A patient in Scheduled at 11:00 does not stop you booking another patient into Confirmed at 11:00.",
      ],
      shots: [
        {
          file: "day",
          as: "reception",
          caption: "Today's two columns for Dr. Priya Menon.",
          run: async (page, h) => {
            await openDay(page, h);
            await dayGrid(page).scrollIntoViewIfNeeded();
          },
          target: dayGrid,
        },
      ],
    },
    {
      title: "Read an appointment block",
      who: "Reception, doctors",
      body: [
        "Each booking is a coloured block that starts at its start time and is as tall as it is long. From left to right, a block shows:",
      ],
      fields: [
        ["#3", "The token number: the order in which the patient was booked for the day. Call patients by it at the desk."],
        ["10:30-11:00", "The time, when the block is wide enough."],
        ["Name", "The patient. A line through the name means a no-show or cancelled appointment."],
        ["First, Review or Procedure", "The bill type. <b>First</b> (first consultation) for a patient's first visit, <b>Review</b> for a returning patient, <b>Procedure</b> for procedures. It decides which fee the bill uses."],
        ["Status", "A coloured dot, or the status in words on a wide screen. See the next section."],
        ["Procedure name, type, age, sex, room", "Shown when there is room on the block, for example <i>(Chemical peel)</i>, 52y, F, Laser Suite."],
        ["Bill chip", "At the right edge: <b>Not billed</b>, an amount <b>due</b>, or an amount and <b>Paid</b>. See <i>Bill a consultation from the calendar</i>."],
        ["INFO, RESCHED, START", "Appear when you hold the mouse over the block. <b>INFO</b> opens the details. <b>RESCHED</b> starts moving the booking (only for Scheduled and Confirmed bookings). <b>START</b> opens the visit; it reads <b>CONT</b> when a visit is already open."],
      ],
      fieldsHeading: ["On the block", "Meaning"],
      shots: [
        {
          file: "block-hover",
          as: "reception",
          caption: "Holding the mouse over a block shows INFO, RESCHED and START.",
          run: async (page, h) => {
            await openDay(page, h);
            await block(page, "Lakshmi").scrollIntoViewIfNeeded();
            await block(page, "Lakshmi").hover();
            await h.settle(500);
          },
          target: (page) => column(page, "CONFIRMED"),
          after: async (page) => {
            await page.mouse.move(5, 5);
          },
        },
      ],
      tips: ["The details also appear as a small tip when you rest the mouse on a block: token, name, time and status."],
    },
    {
      title: "Know the statuses and colours",
      who: "Reception, doctors",
      body: [
        "The thin bar on the left edge of a block, and the status dot, show where the appointment is in the day. The block's fill shows the visit type.",
      ],
      fields: [
        ["Scheduled (grey)", "Booked ahead, not yet confirmed. Shown in the Scheduled column."],
        ["Confirmed (blue)", "The patient has confirmed, or was booked straight into Confirmed."],
        ["Checked in (amber)", "The patient is at the clinic and waiting. The Appointments page has no button to set this status."],
        ["In progress (green)", "The doctor has started the visit from this appointment."],
        ["Completed (light grey, faded)", "The visit is finished. The block turns light grey."],
        ["No-show (red, name crossed out)", "The patient did not come. The Appointments page has no button to set this status; it appears on reports."],
        ["Cancelled", "Cancelled appointments are removed from the calendar."],
        ["OPD fill (light blue)", "A consultation."],
        ["Procedure fill (light purple)", "A procedure."],
        ["Telemedicine fill (light grey)", "A video consultation."],
        ["Past (OPD), Past (Procedure)", "A paler fill once the time has passed."],
        ["Newly Booked (green ring)", "The booking you just made, for a few seconds."],
        ["Booking In Progress (amber)", "The time you are booking while the booking is being saved."],
      ],
      fieldsHeading: ["Status or colour", "Meaning"],
      shots: [
        {
          file: "legend",
          as: "reception",
          caption: "The legend above the calendar.",
          run: async (page, h) => {
            await openDay(page, h);
          },
          target: (page) => page.getByRole("heading", { name: "Legend" }).locator(".."),
        },
      ],
    },
    {
      title: "Filter the day",
      who: "Reception, doctors",
      body: ["Filters hide blocks you do not need. They do not change any booking. A blue <b>Filters Active</b> bar reminds you that some blocks are hidden."],
      fields: [
        ["Visit Type", "All Types, OPD Consultation, Procedure or Telemedicine."],
        ["Room", "Shows only appointments in one room."],
        ["Patient", "Search for the patient you want to book. See the next section."],
        ["Grid", "How far apart the time lines are: 10, 15, 20, 30, 45 or 60 minutes. With a larger grid, clicking a line still finds the first free 15 minutes inside it."],
      ],
      fieldsHeading: ["Filter", "What it does"],
      shots: [
        {
          file: "filter",
          as: "reception",
          caption: "Only procedures, with the Filters Active bar.",
          run: async (page, h) => {
            await openDay(page, h);
            await page.getByRole("combobox").filter({ hasText: "All Types" }).click();
            await page.getByRole("option", { name: "Procedure" }).click();
            await h.settle(600);
            await page.getByText("Filters Active:").scrollIntoViewIfNeeded();
          },
        },
      ],
    },
    {
      title: "Book an appointment for a registered patient",
      who: "Reception",
      body: [
        "Book into <b>Scheduled</b> when the patient books ahead and you will call to confirm. Book into <b>Confirmed</b> for a walk-in or a patient who has already confirmed. You cannot book a time that has already passed.",
      ],
      steps: [
        "Choose the doctor and the date.",
        "Type the patient's name or phone number in <b>Patient</b>.",
        "Click the patient in the list under the box. A <b>Selected</b> badge shows their name and phone.",
        "Click a free time in the <b>Scheduled</b> or <b>Confirmed</b> column. The <b>Book Appointment</b> window opens.",
        "Check the patient, date and time. Change the <b>Duration</b> if the visit needs longer than the time you clicked.",
        "Choose the <b>Appointment Type</b>: OPD Consultation, Procedure or Telemedicine.",
        "Optionally click a room card to put the patient in that room. Cards say <b>Available</b> or <b>Occupied</b> at that time.",
        "Click <b>Confirm Booking</b>. A green message says <i>Appointment Successfully Booked!</i> and the new block appears with a green ring.",
      ],
      shots: [
        {
          file: "book-dialog",
          as: "reception",
          caption: "Booking Vikram Singh into the Scheduled column for tomorrow at 11:30.",
          viewport: { width: 1440, height: 1100 },
          run: async (page, h) => {
            await openDay(page, h, { date: tomorrow(h) });
            await choosePatient(page, h, "Vikram Singh");
            await tile(page, "SCHEDULED", "11:30-12:00").click();
            await page.getByRole("dialog").getByText("Book Appointment").waitFor();
            await page.getByRole("dialog").getByText("Consultation Room 1").first().click();
            await h.settle(600);
          },
          target: '[role="dialog"]',
          after: async (page, h) => {
            await page.getByRole("dialog").getByRole("button", { name: "Confirm Booking" }).click();
            await page.getByText("Appointment Successfully Booked!").waitFor();
          },
        },
        {
          file: "booked",
          as: "reception",
          caption: "The booking message, and Vikram Singh's new block at 11:30.",
          run: async (page, h) => {
            await page.getByText("Appointment Successfully Booked!").scrollIntoViewIfNeeded();
            await h.mark(block(page, "Vikram Singh"), 1);
          },
        },
      ],
      fields: [
        ["Duration", "15, 20, 30, 45, 60 or 90 minutes. The end time and the room check change to match."],
        ["Appointment Type", "<b>OPD Consultation</b>: a normal visit. <b>Procedure</b>: needs a procedure room and lets you type the procedure name. <b>Telemedicine</b>: a video consultation."],
        ["Room Availability", "Rooms that suit the appointment type. An <b>Occupied</b> card names the patient and doctor already in it. A room is optional except for procedures."],
      ],
      fieldsHeading: ["In the window", "What to do"],
      tips: [
        "If the time is outside the doctor's working hours, an amber warning appears. You can still book.",
        "If the doctor is on leave or the time is blocked, a red bar says <i>Not bookable</i> and the time cannot be booked.",
        "Drag down across several free times to book a longer appointment in one go.",
      ],
    },
    {
      title: "Book a patient who is not registered yet",
      who: "Reception",
      body: [
        "When a caller is new to the clinic, register them from the Appointments page without leaving it.",
      ],
      steps: [
        "Type the patient's full name in <b>Patient</b>.",
        "When there is no match, the <b>Add New Patient</b> window opens with the name filled in. (You can also click <b>+ Add … as a new patient</b>.)",
        "Fill in <b>Gender</b> and <b>Phone</b>, which are required, and the age. Email, ABHA ID and consultation type are optional.",
        "Click <b>Create Patient</b>. The new patient is selected for booking.",
        "Click a free time and book as usual.",
      ],
      shots: [
        {
          file: "quick-create",
          as: "reception",
          caption: "The Add New Patient window, opened from the patient search.",
          narrow: true,
          viewport: { width: 1440, height: 1000 },
          run: async (page, h) => {
            await openDay(page, h, { date: tomorrow(h) });
            await page.getByPlaceholder("Search patient by name/phone").fill(`${NEW_PATIENT.first} ${NEW_PATIENT.last}`);
            const d = page.getByRole("dialog");
            await d.getByText("Add New Patient").waitFor();
            await d.getByPlaceholder("e.g. 35").fill(NEW_PATIENT.age);
            await d.getByRole("combobox").first().click();
            await page.getByRole("option", { name: "Female" }).click();
            await d.getByPlaceholder(/Phone number/).fill(NEW_PATIENT.phone);
            await h.settle(300);
          },
          target: '[role="dialog"]',
          after: async (page, h) => {
            await page.getByRole("dialog").getByRole("button", { name: "Create Patient" }).click();
            await page.getByText(/Selected: Ayesha/).waitFor();
          },
        },
      ],
    },
    {
      title: "Book a procedure",
      who: "Reception",
      body: [
        "A procedure needs a procedure room, so that two patients are not booked into the Laser Suite at once. The procedure name you type is shown on the calendar beside the patient's name.",
      ],
      steps: [
        "Select the patient and click a free time.",
        "Set <b>Appointment Type</b> to <b>Procedure</b>.",
        "Type the <b>Procedure Name</b>, for example <i>Chemical peel</i>.",
        "Set the <b>Duration</b>.",
        "Click an <b>Available</b> procedure room. It turns blue. <b>Confirm Booking</b> stays greyed until you pick a room.",
        "Click <b>Confirm Booking</b>.",
      ],
      shots: [
        {
          file: "procedure-dialog",
          as: "reception",
          caption: "Booking a 45-minute chemical peel in the Laser Suite.",
          viewport: { width: 1440, height: 1100 },
          run: async (page, h) => {
            if (!(await page.getByText(/Selected: Ayesha/).isVisible().catch(() => false))) {
              await openDay(page, h, { date: tomorrow(h) });
              await choosePatient(page, h, "Ayesha Siddiqui");
            }
            await tile(page, "CONFIRMED", "12:30-13:00").click();
            const d = page.getByRole("dialog");
            await d.getByText("Book Appointment").waitFor();
            await d.getByRole("combobox").nth(0).click();
            await page.getByRole("option", { name: "45 minutes" }).click();
            await d.getByRole("combobox").nth(1).click();
            await page.getByRole("option", { name: "Procedure" }).click();
            await d.getByPlaceholder(/Chemical Peel/).fill("Chemical peel");
            await d.getByText("Laser Suite").first().click();
            await h.settle(600);
          },
          target: '[role="dialog"]',
          after: async (page, h) => {
            await page.getByRole("dialog").getByRole("button", { name: "Confirm Booking" }).click();
            await page.getByText("Appointment Successfully Booked!").waitFor();
            await h.settle(600);
          },
        },
      ],
    },
    {
      title: "See an appointment's details",
      who: "Reception, doctors",
      body: ["Click a block, or <b>INFO</b> on it, to open <b>Appointment Details</b>. The buttons at the bottom are where you confirm, move, cancel or start the appointment."],
      fields: [
        ["Date, Slot, Calendar", "When the appointment is and which column it is in."],
        ["Patient, Phone, Email, Age, Sex", "Who it is. Click the phone number to call from a phone."],
        ["Bill type and Bill", "The bill type and the bill's state, with <b>Create bill</b>, <b>Open bill</b> or <b>View bill</b>."],
        ["Type, Procedure, Room, Status", "OPD, PROCEDURE or TELEMED, the procedure name, the room and the status."],
        ["Close", "Closes the window."],
        ["Start Visit", "Opens the Visits page for this patient and appointment."],
        ["Reschedule", "Starts moving the appointment. Only for Scheduled and Confirmed appointments."],
        ["Cancel Appointment", "Cancels it, after a check."],
        ["Confirm or Move to Scheduled", "<b>Confirm</b> moves a Scheduled appointment to Confirmed at the same time. <b>Move to Scheduled</b> does the opposite for a Confirmed one."],
      ],
      fieldsHeading: ["In the window", "Meaning"],
      shots: [
        {
          file: "details",
          as: "reception",
          caption: "Appointment Details for a Scheduled appointment.",
          narrow: true,
          run: async (page, h) => {
            await openDay(page, h, { date: tomorrow(h) });
            await column(page, "SCHEDULED").getByRole("button", { name: /Vikram Singh/ }).first().click();
            await page.getByRole("dialog").getByText("Appointment Details").waitFor();
            await h.settle(300);
          },
          target: '[role="dialog"]',
        },
      ],
    },
    {
      title: "Confirm an appointment after the call",
      who: "Reception",
      body: [
        "Call each patient in the Scheduled column the day before. When they confirm, move them to Confirmed so the doctor's real day is up to date.",
      ],
      steps: [
        "Click the patient's block in <b>Scheduled</b>.",
        "Click <b>Confirm</b>.",
        "A message says <i>Appointment confirmed</i>. The block moves to the <b>Confirmed</b> column at the same time.",
        "To undo, open the block in Confirmed and click <b>Move to Scheduled</b>.",
      ],
      shots: [
        {
          file: "confirmed",
          as: "reception",
          caption: "Vikram Singh confirmed: his block is now in the Confirmed column.",
          run: async (page, h) => {
            const d = page.getByRole("dialog");
            if (!(await d.getByText("Appointment Details").isVisible().catch(() => false))) {
              await openDay(page, h, { date: tomorrow(h) });
              await column(page, "SCHEDULED").getByRole("button", { name: /Vikram Singh/ }).first().click();
            }
            await d.getByRole("button", { name: "Confirm", exact: true }).click();
            await column(page, "CONFIRMED").getByRole("button", { name: /Vikram Singh/ }).first().waitFor();
            await h.settle(800);
            await dayGrid(page).scrollIntoViewIfNeeded();
            await h.mark(column(page, "CONFIRMED").getByRole("button", { name: /Vikram Singh/ }).first(), 1);
          },
          target: dayGrid,
        },
      ],
      tips: ["If the same time is already full in Confirmed, the app asks you to pick another free time in Confirmed instead, with an amber bar that says <i>Moving … to Confirmed</i>."],
    },
    {
      title: "Reschedule an appointment",
      who: "Reception",
      body: ["Move an appointment when the patient asks for another time. The patient, doctor, visit type and room stay the same."],
      steps: [
        "Hold the mouse over the block and click <b>RESCHED</b>, or open the block and click <b>Reschedule</b>.",
        "An amber bar says <i>Rescheduling</i> and the patient's name.",
        "To move to another day, change the <b>Date</b> first. The bar stays.",
        "Click a free time in either column. Clicking in the other column also moves the patient to that calendar.",
        "A message says <i>Appointment rescheduled</i>. Click <b>Cancel</b> on the amber bar to stop without moving.",
      ],
      shots: [
        {
          file: "reschedule",
          as: "reception",
          caption: "Rescheduling Vikram Singh: the amber bar and the free times to click.",
          run: async (page, h) => {
            await openDay(page, h, { date: tomorrow(h) });
            await column(page, "CONFIRMED").getByRole("button", { name: /Vikram Singh/ }).first().click();
            await page.getByRole("dialog").getByRole("button", { name: "Reschedule" }).click();
            await page.getByText("Rescheduling Vikram Singh").waitFor();
            await page.getByText("Rescheduling Vikram Singh").scrollIntoViewIfNeeded();
            await h.settle(300);
          },
          after: async (page, h) => {
            await tile(page, "CONFIRMED", "15:00-15:30", "Move to").click();
            await page.getByText("Appointment rescheduled").first().waitFor();
            await h.settle(500);
          },
        },
      ],
    },
    {
      title: "Cancel an appointment",
      who: "Reception",
      body: ["Cancel when the patient will not come. The time becomes free for someone else, and the block disappears from the calendar."],
      steps: [
        "Click the block.",
        "Click <b>Cancel Appointment</b>.",
        "Check the patient, date, time and type in the window.",
        "Click <b>Yes, Cancel Appointment</b>, or <b>Keep Appointment</b> to go back.",
      ],
      warnings: ["A cancelled appointment cannot be brought back. Book a new one if the patient changes their mind."],
      shots: [
        {
          file: "cancel",
          as: "reception",
          caption: "The check before cancelling.",
          narrow: true,
          run: async (page, h) => {
            await openDay(page, h, { date: tomorrow(h) });
            await column(page, "CONFIRMED").getByRole("button", { name: /Vikram Singh/ }).first().click();
            await page.getByRole("dialog").getByRole("button", { name: "Cancel Appointment" }).click();
            await page.getByRole("button", { name: "Yes, Cancel Appointment" }).waitFor();
            await h.settle(300);
          },
          target: '[role="dialog"]',
          after: async (page, h) => {
            await page.getByRole("button", { name: "Yes, Cancel Appointment" }).click();
            await page.getByText("Appointment Cancelled").first().waitFor();
          },
        },
      ],
    },
    {
      title: "Start a visit from an appointment",
      who: "Doctors",
      body: [
        "When the patient is in the room, start the visit from their appointment, so the visit, the prescription and the bill are all linked to it.",
        "Hold the mouse over the block and click <b>START</b>, or open the block and click <b>Start Visit</b>. The Visits page opens with the patient. The appointment's status changes to <b>In progress</b>. When the doctor completes the visit, it changes to <b>Completed</b> and the block turns grey. If a visit is already open for the appointment, the button reads <b>CONT</b> and reopens it.",
        "The Visits chapter explains how to write up the visit.",
      ],
      shots: [],
    },
    {
      title: "Bill a consultation from the calendar",
      who: "Reception (doctors see the bill state only)",
      body: [
        "The chip at the right of each block shows the bill for that appointment. The front desk can create the consultation or procedure bill and take the payment without leaving the calendar.",
      ],
      fields: [
        ["Not billed (grey)", "No bill yet."],
        ["Not billed (amber, with !)", "The visit is finished and there is still no bill. Bill it."],
        ["₹1,000 due (amber)", "A bill exists and this much is unpaid."],
        ["₹2,500 · Paid (green)", "The bill is fully paid. With more than one bill it adds, for example, <i>2 bills</i>."],
      ],
      fieldsHeading: ["Chip", "Meaning"],
      steps: [
        "Click the chip on the block, or <b>Create bill</b> in the appointment's details. The <b>Bill for</b> window opens.",
        "Check the <b>Bill line</b>. It starts as <i>First consultation</i>, <i>Review consultation</i> or <i>Procedure:</i> and the procedure name.",
        "Check the <b>Fee</b>. It comes from the clinic's fee list for the bill type, and the line under it says so, for example <i>From fee list: Procedure ₹2,500</i>. You can change it for this bill. <b>Use ₹2,500</b> puts the list fee back.",
        "Type what the patient pays now in <b>Paid now</b>. Leave 0 to bill now and collect later.",
        "Choose the payment mode: Cash, UPI, Card, Net banking / NEFT or Cheque. For net banking or a cheque, you can type the bank reference or cheque number.",
        "Click <b>Create bill and record</b> the amount (or <b>Create bill</b> when nothing is paid now).",
      ],
      shots: [
        {
          file: "bill-create",
          as: "reception",
          caption: "Creating the procedure bill, with ₹1,500 paid now in cash.",
          narrow: true,
          viewport: { width: 1440, height: 1100 },
          run: async (page, h) => {
            await openDay(page, h, { date: tomorrow(h) });
            await block(page, "Ayesha Siddiqui").locator("[data-appointment-billing]").click();
            const d = page.getByRole("dialog");
            await d.getByText(/Bill for Ayesha/).waitFor();
            await d.getByLabel("Paid now").fill("1500");
            await d.getByRole("radio", { name: "Cash" }).click();
            await h.settle(400);
          },
          target: '[role="dialog"]',
          after: async (page, h) => {
            await page.getByRole("dialog").getByRole("button", { name: /^Create bill/ }).click();
            await page.getByText(/created and ₹1,500/).first().waitFor();
            await page.keyboard.press("Escape");
            await h.settle(800);
          },
        },
        {
          file: "bill-chip",
          as: "reception",
          caption: "The block now shows ₹1,000 due.",
          run: async (page, h) => {
            await openDay(page, h, { date: tomorrow(h) });
            await block(page, "Ayesha Siddiqui").scrollIntoViewIfNeeded();
            await h.mark(block(page, "Ayesha Siddiqui").locator("[data-appointment-billing]"), 1);
          },
          target: (page) => column(page, "CONFIRMED"),
        },
      ],
      warnings: ["Bills and payments recorded here go into the clinic's accounts and the Daily Collection. Check the amount and mode before you save."],
      tips: ["Consultation and procedure fees are billed without GST. To change the standard fees, an admin uses the Fee list page (see the Fee list chapter)."],
    },
    {
      title: "Take the rest of a payment",
      who: "Reception",
      body: ["When a patient pays the balance later, record it on the same bill."],
      steps: [
        "Click the amber <b>due</b> chip on the block.",
        "Under <b>Record payment</b>, check <b>Amount received</b>. It starts at the amount due.",
        "Choose the payment mode.",
        "Click <b>Record</b> and the amount. The chip turns green and says <b>Paid</b>.",
        "To add a separate bill to the same appointment, click <b>Add another bill</b>.",
      ],
      shots: [
        {
          file: "bill-pay",
          as: "reception",
          caption: "The bill with its first payment, and the balance being paid by UPI.",
          narrow: true,
          viewport: { width: 1440, height: 1100 },
          run: async (page, h) => {
            await openDay(page, h, { date: tomorrow(h) });
            await block(page, "Ayesha Siddiqui").locator("[data-appointment-billing]").click();
            const d = page.getByRole("dialog");
            await d.getByText("Record payment").waitFor();
            await d.getByRole("radio", { name: "UPI" }).click();
            await h.settle(400);
          },
          target: '[role="dialog"]',
          after: async (page, h) => {
            await page.getByRole("dialog").getByRole("button", { name: /^Record ₹/ }).click();
            await page.getByText(/recorded on/).first().waitFor();
            await page.keyboard.press("Escape");
          },
        },
      ],
    },
    {
      title: "Overbook a full time",
      who: "Reception",
      body: [
        "Some doctors see more than one patient in the same slot. An admin sets this as <b>Patients per slot</b> in the doctor's availability (see the Users chapter). When the doctor allows it, a booked time shows a small <b>Overbook 1/2</b> label: one patient booked, two allowed. Clicking it books a second patient after a check.",
      ],
      steps: [
        "Select the patient and click the booked time in the column you want.",
        "Fill in the <b>Book Appointment</b> window and click <b>Confirm Booking</b>.",
        "The <b>Overbook this slot?</b> window says how many patients the time already has. Click <b>Book anyway</b>, or <b>Cancel</b> to pick another time.",
        "The two bookings sit side by side in the column.",
      ],
      shots: [
        {
          file: "overbook",
          as: "reception",
          caption: "The check before a second patient is booked into 11:00.",
          narrow: true,
          run: async (page, h) => {
            const date = tomorrow(h);
            const db = h.db();
            await db.user.update({ where: { id: h.seed.doctor2 }, data: { maxBookingsPerSlot: 2 } });
            await db.$disconnect();
            await openDay(page, h, { doctor: "Arvind Shetty", date });
            await choosePatient(page, h, "Sunita Sharma");
            await tile(page, "CONFIRMED", "11:00-11:30").click();
            await page.getByRole("dialog").getByRole("button", { name: "Confirm Booking" }).click();
            await page.getByText("Overbook this slot?").waitFor();
            await h.settle(300);
          },
          target: '[role="dialog"]',
          after: async (page, h) => {
            await page.getByRole("button", { name: "Book anyway" }).click();
            await page.getByText("Appointment Successfully Booked!").waitFor();
            await h.settle(800);
          },
        },
        {
          file: "overbooked",
          as: "reception",
          caption: "Two patients at 11:00 in Dr. Arvind Shetty's Confirmed column.",
          run: async (page, h) => {
            await block(page, "Sunita Sharma").scrollIntoViewIfNeeded();
            await h.mark(block(page, "Sunita Sharma"), 1);
          },
          target: (page) => column(page, "CONFIRMED"),
          after: async (page, h) => {
            const db = h.db();
            await db.user.update({ where: { id: h.seed.doctor2 }, data: { maxBookingsPerSlot: 1 } });
            await db.$disconnect();
          },
        },
      ],
    },
    {
      title: "Use the Slots tab",
      who: "Reception",
      body: [
        "The <b>Slots</b> tab shows the same two columns. Instead of a grid size it has a <b>Duration</b> list (10 to 90 minutes), which sets the length of the times you click. The chosen patient appears in a green <b>Selected Patient</b> box with their ID, phone and email, and a <b>Clear</b> button. Booking, confirming, moving and cancelling work as on the Calendar tab.",
      ],
      shots: [
        {
          file: "slots",
          as: "reception",
          caption: "The Slots tab with a patient selected.",
          run: async (page, h) => {
            await openDay(page, h, { date: tomorrow(h) });
            await page.getByRole("tab", { name: "Slots" }).click();
            await page.getByText("Appointment Scheduler").waitFor();
            await choosePatient(page, h, "Neha Agarwal");
            await page.getByText("✓ Selected Patient").scrollIntoViewIfNeeded();
          },
        },
      ],
    },
    {
      title: "The doctor's view",
      who: "Doctors",
      body: [
        "A doctor sees the same page. Most doctors use it to see who is waiting and to click <b>START</b> on the next patient. A doctor can book, confirm and move appointments like reception. The bill chips show the bill state, but only staff allowed to take payments can create a bill or record a payment from them.",
      ],
      shots: [
        {
          file: "doctor",
          as: "doctor",
          caption: "Dr. Priya Menon's own day.",
          run: async (page, h) => {
            await openDay(page, h);
            await dayGrid(page).scrollIntoViewIfNeeded();
          },
        },
      ],
    },
    {
      title: "Sync with Google Calendar",
      who: "Doctors",
      body: [
        "When the clinic has set up Google Calendar, a <b>Sync with Google Calendar</b> button appears at the top right of the Doctor Calendar. A doctor clicks it, signs in to Google and allows access. Their appointments are then copied to their Google Calendar, and the button is replaced by <b>Syncing</b> with their account and a <b>Disconnect</b> button.",
        "A green bar under the title says when the chosen doctor's appointments sync. An amber bar says when they do not, and asks the doctor to connect their own calendar. If the clinic has not set up Google Calendar, none of this appears.",
      ],
      shots: [],
    },
    {
      title: "Quick Guide",
      who: "Everyone who uses Appointments",
      body: ["The <b>Quick Guide</b> button beside the date opens a short reminder of how the two columns and booking work."],
      shots: [
        {
          file: "quick-guide",
          as: "reception",
          caption: "The Appointments Quick Guide.",
          narrow: true,
          run: async (page, h) => {
            await h.goto("/dashboard/appointments");
            await page.getByRole("button", { name: "Quick Guide" }).click();
            await page.getByRole("dialog").waitFor();
            await h.settle(400);
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
