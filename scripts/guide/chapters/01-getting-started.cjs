module.exports = {
  id: "01-getting-started",
  title: "Getting started",
  intro:
    "This chapter covers what every member of staff needs on day one: signing in, finding your way around the screen, searching, and the tools in the top bar. The rest of the guide is organised by the menu on the left of the screen.",
  sections: [
    {
      title: "Sign in",
      who: "Everyone",
      body: [
        "Open the clinic's address in a browser. The sign-in page asks for the phone number or email address your clinic admin registered for you, and your password.",
        "After you sign in, the app opens the page that fits your role. Doctors and admins land on the Dashboard. Pharmacy staff land on the pharmacy screens.",
      ],
      steps: [
        "Type your registered phone number or email in <b>Phone or email</b>.",
        "Type your password.",
        "Click <b>Sign in</b>.",
      ],
      shots: [
        {
          file: "login",
          as: "anon",
          caption: "The sign-in page.",
          run: async (page, h) => {
            await h.goto("/login");
            await h.mark(page.getByPlaceholder("Phone or email"), 1);
            await h.mark(page.locator('input[type="password"]'), 2);
            await h.mark(page.getByRole("button", { name: "Sign in" }), 3);
          },
        },
      ],
      tips: ["If the page says the details are wrong, check Caps Lock first. After several wrong attempts the app makes you wait before trying again."],
    },
    {
      title: "Reset a forgotten password",
      who: "Everyone",
      body: [
        "The app does not email reset links. Your clinic admin creates a one-time reset code for you from the Users page (see the Users chapter). The code has 8 characters, works once and expires after 24 hours.",
      ],
      steps: [
        "Ask your clinic admin for a reset code.",
        "On the sign-in page, click <b>enter your reset code</b>.",
        "Type the code, then your new password twice. The password needs at least 8 characters.",
        "Click <b>Set new password</b>, then sign in with the new password.",
      ],
      shots: [
        {
          file: "reset-password",
          as: "anon",
          caption: "Set a new password with the reset code from your admin.",
          run: async (page, h) => {
            await h.goto("/reset-password");
          },
        },
      ],
    },
    {
      title: "The parts of the screen",
      who: "Everyone",
      body: [
        "Every page has the same frame. Learn these four areas once and you can find anything.",
      ],
      fields: [
        ["1. Menu", "The list on the left. It is grouped into Overview, Clinical, Pharmacy and Admin. You only see the items your role is allowed to use."],
        ["2. Search", "Finds patients, appointments and doctors from any page."],
        ["3. Top bar tools", "Branded mode, notifications, your settings and your name."],
        ["4. Work area", "The page you opened from the menu. Most pages have a <b>Quick Guide</b> button at the top right that explains that page."],
        ["5. Your account", "Your name and role, with the sign-out button beside it."],
      ],
      shots: [
        { file: "cover", hidden: true, caption: "", run: async (page, h) => { await h.goto("/dashboard/appointments"); } },
        {
          file: "layout",
          caption: "The Dashboard, with the five areas of the screen marked.",
          run: async (page, h) => {
            await h.goto("/dashboard");
            await h.mark(page.locator('nav[aria-label="Main navigation"]'), 1);
            await h.mark(page.getByPlaceholder(/Search patients/), 2);
            await h.mark(page.getByRole("button", { name: "Notifications" }), 3);
            await h.mark(page.getByRole("heading", { name: "Dashboard" }), 4);
            await h.mark(page.getByRole("button", { name: /sign out|log ?out/i }), 5);
          },
        },
      ],
    },
    {
      title: "Search from anywhere",
      who: "Everyone",
      body: [
        "The search box at the top works on every page. Type at least two letters of a patient's name, a phone number, or a doctor's name. Results appear under the box as you type. Each result says what it is, such as Patient. Click a result to open it, or press Enter to open the first one.",
      ],
      shots: [
        {
          file: "search",
          caption: "Typing a name lists the matching patients. Press Enter to open the first result.",
          run: async (page, h) => {
            await h.goto("/dashboard");
            await page.getByPlaceholder(/Search patients/).fill("Meera");
            await h.settle(1500);
          },
          after: async (page) => {
            await page.keyboard.press("Escape");
          },
        },
      ],
      tips: ["Press Esc or click outside the list to close the results."],
    },
    {
      title: "Notifications",
      who: "Everyone",
      body: [
        "The bell shows a red count when something needs attention, such as medicines running low or appointments coming up. Click the bell to read the list. Clicking a notification opens the page where you can act on it.",
      ],
      shots: [
        {
          file: "notifications",
          caption: "The notifications list under the bell.",
          run: async (page, h) => {
            await h.goto("/dashboard");
            await page.getByRole("button", { name: "Notifications" }).click();
            await h.settle(800);
          },
          after: async (page) => {
            await page.keyboard.press("Escape");
          },
        },
      ],
    },
    {
      title: "My Settings",
      who: "Doctors (other roles see a shorter window)",
      body: [
        "The gear icon opens <b>My Settings</b>. For a doctor this is where the things that print on a prescription are set up, along with working hours and WhatsApp confirmations.",
      ],
      fields: [
        ["Signature", "Upload a picture of your signature. It prints above your name on prescriptions when <b>Show signature</b> is ticked in the print preview."],
        ["Letterhead", "Upload your own letterhead image. Prescriptions you print use it as the page background."],
        ["Availability", "Your working days and hours. The appointment calendar offers only these times."],
        ["Send WhatsApp on appointment creation", "Sends the patient a confirmation message when an appointment is booked with you. The clinic's WhatsApp account must be connected first."],
        ["Use WhatsApp Template", "Sends an approved template message. Needed when messaging a patient who has not written to the clinic in the last 24 hours."],
      ],
      shots: [
        {
          file: "my-settings",
          as: "doctor",
          caption: "My Settings for a doctor: signature, letterhead, availability and WhatsApp.",
          run: async (page, h) => {
            await h.goto("/dashboard");
            await page.getByRole("button", { name: "Open settings" }).click();
            await h.settle(1500);
          },
          target: '[role="dialog"]',
          after: async (page) => {
            await page.keyboard.press("Escape");
          },
        },
      ],
    },
    {
      title: "Branded mode",
      who: "Everyone",
      body: [
        "The <b>Branded</b> switch in the top bar changes the app's colours and logo to the clinic's own branding. It only changes how the app looks on your computer. Nothing about your data changes.",
      ],
      shots: [
        {
          file: "branded",
          caption: "The same Dashboard with Branded mode switched on.",
          run: async (page, h) => {
            await h.goto("/dashboard");
            await page.getByRole("switch", { name: "Toggle branded mode" }).click();
            await h.settle(1000);
          },
          after: async (page, h) => {
            await page.getByRole("switch", { name: "Toggle branded mode" }).click();
            await h.settle(300);
          },
        },
      ],
    },
    {
      title: "Quick Guides and tours",
      who: "Everyone",
      body: [
        "Most pages have a <b>Quick Guide</b> button at the top right. It opens a short explanation of that page, written for the people who use it. Doctors and reception staff also have guided tours. A tour points at each part of the screen in turn and explains it. It starts only when you click its button, and you can skip it at any step and start it again later. The Dashboard chapter shows both tours.",
      ],
      shots: [
        {
          file: "quick-guide",
          caption: "The Quick Guide for the Dashboard.",
          run: async (page, h) => {
            await h.goto("/dashboard");
            await page.getByRole("button", { name: "Quick Guide" }).click();
            await h.settle(1000);
          },
          after: async (page) => {
            await page.keyboard.press("Escape");
          },
        },
      ],
    },
    {
      title: "What each role sees",
      who: "Admins and owners decide roles",
      body: [
        "The menu is different for each role. If a page in this guide is missing from your menu, your role does not include it. Ask your clinic admin to change your role or permissions on the Users page.",
      ],
      fields: [
        ["Admin / Owner", "Everything, including Reports, Users and the Fee list."],
        ["Doctor", "Dashboard, Patients, Appointments, Visits, Procedures, Rooms, the pharmacy screens, Inventory and Pharmacy Report."],
        ["Reception", "Dashboard, Patients, Appointments, Rooms, Pharmacy Desk and Counter, and Inventory."],
        ["Pharmacist", "Pharmacy Desk, Pharmacy Counter, Sales, Inventory, Pharmacy Report and Daily Collection."],
        ["Nurse", "Dashboard, Patients, Appointments, Visits and Rooms."],
      ],
      shots: [
        { file: "menu-admin", viewport: { width: 1440, height: 1180 }, caption: "Admin", target: '[data-tour="sidebar"]', run: async (page, h) => { await h.goto("/dashboard"); } },
        { file: "menu-doctor", viewport: { width: 1440, height: 1180 }, as: "doctor", caption: "Doctor", target: '[data-tour="sidebar"]', run: async (page, h) => { await h.goto("/dashboard"); } },
        { file: "menu-reception", viewport: { width: 1440, height: 1180 }, as: "reception", caption: "Reception", target: '[data-tour="sidebar"]', run: async (page, h) => { await h.goto("/dashboard"); } },
        { file: "menu-pharmacist", viewport: { width: 1440, height: 1180 }, as: "pharmacist", caption: "Pharmacist", target: '[data-tour="sidebar"]', run: async (page, h) => { await h.goto("/dashboard/pharmacy?section=desk"); } },
      ],
      shotLayout: "row",
    },
    {
      title: "Sign out",
      who: "Everyone",
      body: ["Click the arrow beside your name at the bottom of the menu. On a shared computer, always sign out before you leave the desk."],
      shots: [],
    },
  ],
};
