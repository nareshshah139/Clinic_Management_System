const NEW_ROOM = "Phototherapy Room";

// Calls the backend with the signed-in browser's session, so no second sign-in is needed.
const call = (page, method, route) =>
  page.evaluate(async ({ method, route }) => {
    const res = await fetch(`/api${route}`, { method, credentials: "include" });
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }, { method, route });

async function removeRoom(page, name) {
  const res = await call(page, "GET", "/appointments/rooms/all");
  for (const room of (res && res.rooms) || res || []) if (room.name === name) await call(page, "DELETE", `/appointments/rooms/${room.id}`).catch(() => {});
}

async function openCalendar(page, h) {
  await h.goto("/dashboard/rooms");
  await page.getByText("Room Occupancy Calendar").waitFor();
  await page.getByText("Divya Pillai").first().waitFor();
  await h.settle(600);
}

async function openManage(page, h) {
  await h.goto("/dashboard/rooms");
  await page.getByRole("tab", { name: "Manage Rooms" }).click();
  await page.getByText("All Rooms", { exact: true }).waitFor();
  await page.getByRole("cell", { name: "Laser Suite" }).first().waitFor();
  await h.settle(400);
}

const roomRow = (page, name) => page.getByRole("row").filter({ hasText: name });

module.exports = {
  id: "05-rooms",
  title: "Rooms",
  intro:
    "The Rooms page shows which consultation and procedure rooms are in use at each time of the day, and holds the list of rooms the clinic has. Reception uses it to see where a patient will be seen. Admins and doctors use it to add rooms and switch rooms on or off.",
  sections: [
    {
      title: "See which rooms are in use today",
      who: "Reception, doctors, nurses, admins",
      body: [
        "Open <b>Rooms</b> from the menu. The page opens on the <b>Calendar View</b> tab for today. Each column is one active room, and each coloured block is an appointment booked into that room. An appointment only appears here when a room was chosen while booking it (see the Appointments chapter).",
      ],
      fields: [
        ["1. Date and arrows", "The day you are looking at. The left and right arrows move one day back or forward."],
        ["2. Room type", "Shows only rooms of one type, for example only <b>Procedure</b> rooms. The list offers the types your rooms use."],
        ["3. Search room name", "Type part of a room name to show only matching rooms."],
        ["4. Today, Now and Grid", "<b>Today</b> returns to today's date. <b>Now</b> scrolls the calendar to the current time. <b>Grid</b> sets how far apart the time lines are: 10, 15, 20, 30, 45 or 60 minutes."],
        ["5. Counters", "Four totals for the rooms shown. See the table in the next section."],
        ["6. Room Occupancy Calendar", "One column per room, with the time down the left from 09:00 to 18:00. Under each room name you see its type and <b>Cap</b>, the number of people it holds."],
      ],
      fieldsHeading: ["Part of the screen", "What it does"],
      shots: [
        {
          file: "calendar",
          caption: "The Calendar View for today, with four rooms and their appointments.",
          viewport: { width: 1440, height: 1250 },
          run: async (page, h) => {
            await openCalendar(page, h);
            await h.mark(page.getByRole("heading", { level: 2 }).filter({ hasText: /\d{4}/ }), 1);
            await h.mark(page.getByRole("combobox").first(), 2);
            await h.mark(page.getByPlaceholder("Search room name..."), 3);
            await h.mark(page.getByRole("button", { name: "Today" }), 4);
            await h.mark(page.getByText("Total Rooms", { exact: true }), 5);
            await h.mark(page.getByText("Room Occupancy Calendar"), 6);
          },
        },
      ],
    },
    {
      title: "Read the counters",
      who: "Everyone who opens Rooms",
      body: ["The four boxes above the calendar sum up the day you are looking at."],
      fields: [
        ["Total Rooms", "How many active rooms are shown, after the room type and search filters."],
        ["Available", "Rooms shown that have no appointment at all on this day."],
        ["Occupied", "Rooms shown that have at least one appointment on this day. A room counts as occupied for the whole day, even if it is free right now."],
        ["Appointments", "The number of appointments booked into any room on this day. This total counts every room, even when the room type or search filter hides some of them."],
      ],
      fieldsHeading: ["Counter", "What it counts"],
      shots: [
        {
          file: "counters",
          caption: "The four counters for today.",
          run: async (page, h) => {
            await openCalendar(page, h);
          },
          target: (page) => page.locator("div.grid").filter({ hasText: "Total Rooms" }).filter({ hasText: "Appointments" }).last(),
        },
      ],
    },
    {
      title: "Check the details of a booked room",
      who: "Reception, doctors, nurses",
      body: [
        "Each block starts at the appointment's start time and is as tall as the appointment is long. It shows the patient's name. For a procedure it also shows the procedure name in brackets, for example <i>Laser hair reduction, session 3</i>. When two appointments overlap in one room, they sit side by side.",
        "Hold the mouse over a block to see the full details in a card beside it. Move the mouse into the card to keep it open while you read it.",
      ],
      steps: [
        "Find the room column and the time.",
        "Hold the mouse over the block.",
        "Read the card: patient name, date and time, phone, doctor, visit type, status, procedure notes and room.",
      ],
      shots: [
        {
          file: "hover",
          caption: "Holding the mouse over the Laser Suite booking shows its details.",
          run: async (page, h) => {
            await openCalendar(page, h);
            await page.getByText("Divya Pillai").first().scrollIntoViewIfNeeded();
            await page.getByText("Divya Pillai").first().hover();
            await page.getByText("Doctor:").waitFor();
            await h.settle(300);
          },
          after: async (page) => {
            await page.mouse.move(5, 5);
          },
        },
      ],
      fields: [
        ["Status", "The appointment's status, written in capitals, for example SCHEDULED, CONFIRMED, CHECKED_IN or COMPLETED. The Appointments chapter explains each status."],
        ["Type", "OPD (a consultation), PROCEDURE or TELEMED (a video consultation)."],
        ["Notes", "Shown for procedures: the procedure name typed when booking."],
      ],
      fieldsHeading: ["In the card", "Meaning"],
    },
    {
      title: "Understand the colours",
      who: "Everyone who opens Rooms",
      body: [
        "The colour of a block tells you the kind of appointment and whether it has happened. The legend under the calendar repeats these colours.",
      ],
      fields: [
        ["Available", "A pale green swatch. Empty space in a column means the room is free at that time."],
        ["OPD", "Blue. A consultation booked into the room."],
        ["Procedure", "Purple. A procedure booked into the room."],
        ["Telemedicine", "Grey. A video consultation that was given a room."],
        ["Completed", "Light grey. The visit for this appointment is finished."],
        ["Past (OPD) and Past (Procedure)", "A paler blue or purple. The appointment's time has passed today but it is not marked completed."],
      ],
      fieldsHeading: ["Colour", "Meaning"],
      shots: [
        {
          file: "legend",
          caption: "The legend under the room calendar.",
          run: async (page, h) => {
            await openCalendar(page, h);
          },
          target: (page) => page.locator("div.rounded-xl, div[class*='card']").filter({ has: page.getByRole("heading", { name: "Legend" }) }).last(),
        },
      ],
    },
    {
      title: "Look at another day or one type of room",
      who: "Reception, doctors",
      body: [
        "Use the arrows to plan tomorrow's procedures, or narrow the calendar to the rooms you care about. The filters only change what you see. They do not change any booking.",
      ],
      steps: [
        "Click the right arrow beside the date to move to tomorrow. Click the left arrow to go back a day.",
        "Open the room type list and choose <b>Procedure</b> to show only the procedure rooms.",
        "To find one room, type part of its name in <b>Search room name</b>.",
        "Click <b>Today</b> to come back to today, and <b>Now</b> to scroll to the current time.",
        "Choose a <b>Grid</b> size to space the time lines further apart or closer together.",
      ],
      shots: [
        {
          file: "procedure-filter",
          caption: "Only the procedure rooms, with a 60-minute grid.",
          viewport: { width: 1440, height: 1250 },
          run: async (page, h) => {
            await openCalendar(page, h);
            await page.getByRole("combobox").first().click();
            await page.getByRole("option", { name: /Procedure/ }).click();
            await page.getByRole("combobox").filter({ hasText: "Grid" }).click();
            await page.getByRole("option", { name: "Grid: 60m" }).click();
            await h.settle(500);
          },
        },
      ],
    },
    {
      title: "See the list of rooms",
      who: "Admins and doctors (reception and nurses do not see this tab)",
      body: [
        "Click the <b>Manage Rooms</b> tab. It lists the clinic's active rooms with its type, capacity, status and the date it was added. The boxes at the top count the active rooms: all of them, then the consultation, procedure and telemedicine rooms.",
        "Use the search box, the type list and the status list (<b>All</b>, <b>Active</b>, <b>Inactive</b>) to find a room in a long list. The list holds the active rooms, so <b>Inactive</b> only finds a room you switched off since you opened the page.",
      ],
      shots: [
        {
          file: "manage",
          caption: "Manage Rooms: the counters, filters and the list of rooms.",
          run: async (page, h) => {
            await openManage(page, h);
          },
        },
      ],
      fields: [
        ["Name", "The room's name as it appears when booking and on the room calendar."],
        ["Type", "What the room is used for. The booking window offers consultation rooms for OPD visits and procedure rooms for procedures."],
        ["Capacity", "How many people the room holds. It is shown for information and on the room calendar."],
        ["Status", "<b>Active</b> rooms can be booked and appear on the calendar. <b>Inactive</b> rooms are hidden from both. The switch beside the badge changes it."],
        ["Actions", "<b>Edit</b> changes the room. <b>Delete</b> removes it."],
      ],
      fieldsHeading: ["Column", "Meaning"],
    },
    {
      title: "Add a room",
      who: "Admins and doctors",
      body: ["Add a room when the clinic opens a new consultation or procedure room, so that staff can book patients into it."],
      steps: [
        "On <b>Manage Rooms</b>, click <b>Add Room</b>.",
        "Type the <b>Room Name</b>, for example <i>Phototherapy Room</i>.",
        "Choose the <b>Room Type</b>. The types are listed in the table below.",
        "Type the <b>Capacity</b>: the number of people the room holds.",
        "Leave <b>Room is active</b> ticked if the room can be booked now.",
        "Click <b>Add Room</b> at the bottom of the window. The new room appears in the list and on the room calendar.",
      ],
      shots: [
        {
          file: "add-room",
          caption: "The Add New Room window, filled in.",
          narrow: true,
          run: async (page, h) => {
            await h.goto("/dashboard/rooms");
            await removeRoom(page, NEW_ROOM);
            await openManage(page, h);
            await page.getByRole("button", { name: "Add Room" }).click();
            const dialog = page.getByRole("dialog");
            await dialog.getByPlaceholder("e.g., Consultation Room 1").fill(NEW_ROOM);
            await dialog.getByRole("combobox").click();
            await page.getByRole("option", { name: /Procedure Room/ }).click();
            await dialog.getByPlaceholder(/Number of people/).fill("2");
            await h.settle(300);
          },
          target: '[role="dialog"]',
          after: async (page, h) => {
            await page.getByRole("dialog").getByRole("button", { name: /^(Add Room|Update Room)$/ }).click();
            await page.getByRole("dialog").waitFor({ state: "hidden" }).catch(() => {});
            await h.settle(500);
          },
        },
        {
          file: "room-added",
          caption: "The Phototherapy Room is now in the list.",
          run: async (page, h) => {
            await openManage(page, h);
            await roomRow(page, NEW_ROOM).waitFor();
            await h.mark(roomRow(page, NEW_ROOM), 1);
          },
        },
      ],
      fields: [
        ["Consultation Room", "For OPD consultations."],
        ["Procedure Room", "For procedures such as peels and lasers. A procedure booking needs a room."],
        ["Operation Theater", "For surgical procedures."],
        ["Telemedicine Suite", "For video consultations."],
        ["Emergency Room, Recovery Room, Waiting Area", "Other clinical spaces."],
        ["Laboratory, Imaging Room, Pharmacy", "Support areas you may want to track."],
      ],
      fieldsHeading: ["Room type", "Use it for"],
    },
    {
      title: "Change a room's name, type or capacity",
      who: "Admins and doctors",
      body: ["Edit a room when it is renamed, re-equipped, or holds a different number of people. Appointments already booked into the room stay booked."],
      steps: [
        "On <b>Manage Rooms</b>, click <b>Edit</b> on the room's row.",
        "Change the name, type or capacity.",
        "Click <b>Update Room</b>.",
      ],
      shots: [
        {
          file: "edit-room",
          caption: "Editing the Phototherapy Room to hold three people.",
          narrow: true,
          run: async (page, h) => {
            await openManage(page, h);
            await roomRow(page, NEW_ROOM).getByRole("button", { name: "Edit" }).click();
            await page.getByRole("dialog").getByPlaceholder(/Number of people/).fill("3");
            await h.settle(300);
          },
          target: '[role="dialog"]',
          after: async (page, h) => {
            await page.getByRole("dialog").getByRole("button", { name: /^(Add Room|Update Room)$/ }).click();
            await page.getByRole("dialog").waitFor({ state: "hidden" }).catch(() => {});
            await h.settle(500);
          },
        },
      ],
    },
    {
      title: "Switch a room off or on",
      who: "Admins and doctors",
      body: [
        "Switch a room off while it is under repair or not in use. An inactive room keeps its history but cannot be booked, and it disappears from the room calendar and from the booking window. Switch it on again when it is ready.",
      ],
      steps: [
        "On <b>Manage Rooms</b>, find the room's row.",
        "Click the switch beside the <b>Active</b> badge. The badge changes to <b>Inactive</b> and a message confirms <i>Room deactivated</i>.",
        "To bring the room back while you are still on the page, click the switch again. The message says <i>Room activated</i>.",
      ],
      shots: [
        {
          file: "deactivated",
          caption: "The Phototherapy Room switched off. Its badge now says Inactive.",
          run: async (page, h) => {
            await openManage(page, h);
            await roomRow(page, NEW_ROOM).getByRole("switch").click();
            await roomRow(page, NEW_ROOM).getByText("Inactive").waitFor();
            await h.settle(300);
            await h.mark(roomRow(page, NEW_ROOM).getByRole("switch"), 1);
          },
          after: async (page, h) => {
            await roomRow(page, NEW_ROOM).getByRole("switch").click();
            await roomRow(page, NEW_ROOM).getByText("Active", { exact: true }).waitFor();
            await h.settle(300);
          },
        },
      ],
      warnings: ["The list only shows active rooms when it loads. Once you leave the page or reload it, an inactive room is no longer listed, and you cannot switch it back on from this screen. If you switched a room off by mistake, switch it on again before you leave the page."],
    },
    {
      title: "Delete a room",
      who: "Admins and doctors",
      body: [
        "Delete a room only when the clinic no longer has it. If you might use it again, switch it off instead.",
      ],
      steps: [
        "On <b>Manage Rooms</b>, click <b>Delete</b> on the room's row.",
        "The browser asks <i>Are you sure you want to delete</i> the room. Click <b>OK</b> to delete it, or <b>Cancel</b> to keep it.",
        "A message confirms <i>Room deleted</i> and the row disappears.",
      ],
      warnings: ["Deleting a room cannot be undone."],
      shots: [
        {
          file: "room-deleted",
          caption: "After deleting the Phototherapy Room, the list is back to four rooms.",
          run: async (page, h) => {
            await openManage(page, h);
            page.once("dialog", (d) => d.accept());
            await roomRow(page, NEW_ROOM).getByRole("button", { name: "Delete" }).click();
            await page.getByText("Room deleted").first().waitFor();
            await h.settle(400);
          },
          after: async (page) => {
            await removeRoom(page, NEW_ROOM);
          },
        },
      ],
    },
    {
      title: "Quick Guide",
      who: "Everyone who opens Rooms",
      body: [
        "The <b>Quick Guide</b> button at the top right of the page opens a short summary of the Rooms page. Some of its points describe plans for later versions, such as room amenities, maintenance schedules and reassigning a room from the calendar. Those are not on the screen yet. This chapter describes what the page does today.",
      ],
      shots: [
        {
          file: "quick-guide",
          caption: "The Room Management Quick Guide.",
          narrow: true,
          run: async (page, h) => {
            await h.goto("/dashboard/rooms");
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
