const { stack } = require("../lib.cjs");

// The shared api() helper caches a failed (rate-limited) sign-in, so this chapter signs in with retries itself.
let auth = null;
async function call(method, route, body) {
  for (let attempt = 0; !auth && attempt < 20; attempt++) {
    const user = stack.users.admin;
    const res = await fetch(`${stack.api}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: user.email, password: user.password }) });
    if (res.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 6000));
      continue;
    }
    const data = await res.json();
    auth = { Authorization: `Bearer ${data.access_token || data.accessToken || data.token}`, Cookie: (res.headers.get("set-cookie") || "").split(",").map((c) => c.split(";")[0].trim()).join("; ") };
  }
  const res = await fetch(`${stack.api}${route}`, { method, headers: { "Content-Type": "application/json", ...auth }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw Error(`${method} ${route} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// Consultation bills for five of the seeded past visits: [visit index, line, fee, paid, mode].
const BILLS = [
  [0, "First consultation", 800, 800, "UPI"],
  [1, "First consultation", 800, 800, "CASH"],
  [2, "First consultation", 800, 800, "CARD"],
  [3, "Procedure: PRP for hair loss", 4500, 2500, "UPI"],
  [4, "First consultation", 800, 800, "CASH"],
];

const REPORTS = ["Revenue Report", "Patient Analytics", "Doctor Performance", "Appointment Analytics", "Inventory Report", "Payment Analytics"];
const generate = (name) => async (page, h) => {
  await h.goto("/dashboard/reports");
  await page.getByRole("heading", { name, exact: true }).click();
  await page.getByRole("button", { name: "Generate Report" }).click();
  await page.getByRole("button", { name: "Generate Report" }).waitFor({ timeout: 30000 });
  await h.settle(1500);
  await page.locator("main").getByText("Report for", { exact: false }).last().scrollIntoViewIfNeeded();
};
const resultCard = (page) => page.locator("main").getByText(/^Report for /).locator('xpath=ancestor::div[@data-slot="card"][1]');
const tall = { width: 1440, height: 1400 };

module.exports = {
  id: "16-reports",
  title: "Reports & Analytics",
  intro:
    "Reports &amp; Analytics gives the clinic's owners and managers the figures behind the business: money taken, patients seen, how busy each doctor and room is, stock and payments. Pick a report, choose the dates, and the app adds up the records for you. Pharmacy GST and stock reports are in a separate chapter, Pharmacy Report.",
  setup: async (h) => {
    const db = h.db();
    try {
      for (const [index, line, fee, paid, mode] of BILLS) {
        const visitId = h.seed.visits[index];
        const visit = await db.visit.findUnique({ where: { id: visitId }, select: { id: true, patientId: true, createdAt: true } });
        if (!visit || (await db.newInvoice.count({ where: { visitId } }))) continue;
        const invoice = await call("POST", "/billing/invoices", { patientId: visit.patientId, visitId, items: [{ name: line, description: line, quantity: 1, unitPrice: fee, gstRate: 0, discount: 0 }] });
        await call("POST", "/billing/payments", { invoiceId: invoice.id, amount: paid, method: mode });
        await db.newInvoice.update({ where: { id: invoice.id }, data: { createdAt: visit.createdAt } }).catch(() => {});
        await db.newPayment.updateMany({ where: { invoiceId: invoice.id }, data: { createdAt: visit.createdAt } }).catch(() => {});
      }
    } finally {
      await db.$disconnect();
    }
  },
  sections: [
    {
      title: "Open Reports &amp; Analytics",
      who: "Admins, owners and managers",
      body: [
        "Open <b>Reports</b> from the Admin part of the menu. The page has four parts, from top to bottom.",
      ],
      shots: [
        {
          file: "page",
          caption: "Reports &amp; Analytics before a report is generated.",
          viewport: { width: 1440, height: 1100 },
          run: async (page, h) => {
            await h.goto("/dashboard/reports");
            await page.getByRole("heading", { name: "Revenue Report", exact: true }).waitFor();
            await h.settle(800);
            await h.mark(page.getByText("System Alerts", { exact: true }), 1);
            await h.mark(page.getByRole("heading", { name: "Revenue Report", exact: true }), 2);
            await h.mark(page.getByLabel("From date"), 3);
            await h.mark(page.getByRole("button", { name: "Generate Report" }), 4);
            await h.mark(page.getByRole("combobox").filter({ hasText: "Export" }), 5);
          },
        },
      ],
      fields: [
        ["1. System Alerts", "Five counts of things that need attention. See the next section."],
        ["2. Report cards", "The six reports. Click a card to choose it. The chosen card has a blue frame."],
        ["3. Date Range", "The first and last day the report covers. It starts on the last 30 days."],
        ["4. Generate Report", "Works out the chosen report for the dates. It says <b>Generating...</b> while it works."],
        ["5. Export", "Downloads the report as a file."],
        ["Quick Guide", "The button at the top right. A short summary of this page."],
      ],
    },
    {
      title: "Read the System Alerts strip",
      who: "Admins, owners and managers",
      body: ["The orange strip at the top counts what needs attention today. It does not change with the date range."],
      shots: [
        {
          file: "alerts",
          caption: "The System Alerts strip.",
          run: async (page, h) => {
            await h.goto("/dashboard/reports");
            await page.getByText("Upcoming Appointments", { exact: true }).waitFor();
          },
          target: (page) => page.locator('main [data-slot="card"]').first(),
        },
      ],
      fields: [
        ["Overdue Invoices", "Clinic bills past their due date and still unpaid."],
        ["Low Stock", "Medicines whose stock has run out (0 left)."],
        ["Expiry Alerts", "Medicines that expire within the next 30 days."],
        ["Pending Payments", "Card or online payments not yet matched with the bank."],
        ["Upcoming Appointments", "Appointments in the next 48 hours that are not cancelled."],
      ],
    },
    {
      title: "Generate a report",
      who: "Admins, owners and managers",
      steps: [
        "Click the card of the report you want, for example <b>Revenue Report</b>.",
        "Set the first day in the left date box and the last day in the right date box.",
        "Click <b>Generate Report</b>.",
        "Read the report in the box at the bottom. Its title is the report's name and the line under it says which dates it covers.",
      ],
      body: [
        "Every time you change the card or the dates, click <b>Generate Report</b> again. Until you do, the box at the bottom says <i>Report data will be displayed here</i>. If nothing happened in those dates it says <i>No data available for the selected period</i>.",
      ],
      fieldsHeading: ["Report", "What it is for"],
      fields: [
        ["Revenue Report", "Money received for consultations and procedures: totals, payment modes and the doctors who brought in the most."],
        ["Patient Analytics", "How many patients, new or returning, their ages and gender, and who visits most."],
        ["Doctor Performance", "Each doctor's appointments, how many were completed, and the revenue."],
        ["Appointment Analytics", "How many appointments, how many were completed, cancelled or missed, the busiest hours and how much each room is used."],
        ["Inventory Report", "The value of the stock, the best-selling items and the items running low."],
        ["Payment Analytics", "Payments by mode and whether they have been matched with the bank."],
      ],
    },
    {
      title: "Revenue Report",
      who: "Admins, owners and managers",
      body: [
        "Use the Revenue Report at the end of a month, or before a meeting with your accountant, to see what the clinic billed for consultations and procedures. Pharmacy sales are not included; they are in the Pharmacy Report.",
      ],
      shots: [{ file: "revenue", caption: "A Revenue Report for the last 30 days.", viewport: tall, run: generate("Revenue Report"), target: resultCard }],
      fields: [
        ["Total Revenue", "Money received on clinic bills in the dates, GST included. Unpaid balances are not counted."],
        ["GST Amount", "The GST on those bills. Consultations and procedures are billed without GST, so this is usually ₹0."],
        ["Net Revenue", "Total Revenue less GST."],
        ["Total Invoices", "How many payments make up that total."],
        ["Payment Mode Breakdown", "How much was paid by each mode (cash, UPI, card and so on), with the share of the total."],
        ["Top Performing Doctors", "The doctors whose patients paid the most, with their number of visits and the average per visit."],
      ],
    },
    {
      title: "Patient Analytics",
      who: "Admins, owners and managers",
      body: ["Use Patient Analytics to see how many patients the clinic is seeing and who comes back."],
      shots: [{ file: "patients", caption: "Patient Analytics.", viewport: tall, run: generate("Patient Analytics"), target: resultCard }],
      fields: [
        ["Total Patients", "Patients seen in the dates."],
        ["New Patients", "Patients registered in the dates."],
        ["Returning Patients", "Patients who had visited before."],
        ["Avg Age", "The average age of the patients."],
        ["Gender Distribution", "How many patients are of each gender, with the share of the total."],
        ["Most Frequent Patients", "The patients with the most visits, with their last visit date and what they have spent."],
      ],
    },
    {
      title: "Doctor Performance",
      who: "Admins, owners and managers",
      body: ["Use Doctor Performance to compare how busy each doctor is and how many of their appointments end in a completed visit."],
      shots: [{ file: "doctors", caption: "Doctor Performance.", viewport: tall, run: generate("Doctor Performance"), target: resultCard }],
      fields: [
        ["Total Doctors, Active Doctors, Departments", "The counts at the top."],
        ["Percentage beside the name", "The doctor's completion rate: completed appointments as a share of all their appointments."],
        ["Appointments, Completed", "The doctor's appointments in the dates, and how many were completed."],
        ["Revenue, Avg/Appt", "What the doctor's patients were billed, in total and per appointment."],
      ],
    },
    {
      title: "Appointment Analytics",
      who: "Admins, owners and managers",
      body: ["Use Appointment Analytics to plan staff and rooms: it shows the busiest hours and which rooms are used most."],
      shots: [{ file: "appointments", caption: "Appointment Analytics.", viewport: tall, run: generate("Appointment Analytics"), target: resultCard }],
      fields: [
        ["Total Appointments, Completed, Cancelled, No Show", "Counts for the dates. No Show means the patient did not come."],
        ["Peak Hours", "The hours of the day with the most appointments."],
        ["Room Utilization", "For each room: the average appointments per day, the total, and its share of all appointments. Rooms are listed by the app's internal room code, not by name."],
      ],
    },
    {
      title: "Inventory Report",
      who: "Admins, owners and managers",
      body: ["Use the Inventory Report to see the value of the stock and what needs ordering. For batch-by-batch expiry, use Expiring Stock in the Pharmacy Report."],
      shots: [{ file: "inventory", caption: "The Inventory Report.", viewport: tall, run: generate("Inventory Report"), target: resultCard }],
      fields: [
        ["Total Items, Total Value, Low Stock, Out of Stock", "How many items are in stock, what they are worth, and how many are low or finished."],
        ["Top Selling Items", "Shown when there were sales in the dates: the items sold most, with the average selling price."],
        ["Low Stock Alerts", "Each item at or below its reorder level, with the reorder level and how many are left."],
      ],
    },
    {
      title: "Payment Analytics",
      who: "Admins, owners and managers",
      body: ["Use Payment Analytics to check that every payment taken at the desk has reached the bank."],
      shots: [{ file: "payments", caption: "Payment Analytics.", viewport: tall, run: generate("Payment Analytics"), target: resultCard }],
      fields: [
        ["Total Payments, Successful, Failed, Pending", "How many payments there were and how they ended."],
        ["Payment Mode Breakdown", "The amount taken by each payment mode."],
        ["Reconciliation Summary", "<b>Total Transactions</b>, how many are <b>Reconciled</b> (matched with the bank), how many are <b>Pending</b>, and the <b>Rate</b> matched."],
      ],
    },
    {
      title: "Export a report",
      who: "Admins, owners and managers",
      body: ["Export a report to send it to your accountant or keep it with the clinic's records. The file covers the chosen card and dates."],
      steps: [
        "Choose the report card and the dates.",
        "Click <b>Export</b> and choose a format. The file downloads to your computer.",
      ],
      shots: [
        {
          file: "export",
          caption: "The Export formats.",
          run: async (page, h) => {
            await h.goto("/dashboard/reports");
            await page.getByRole("combobox").filter({ hasText: "Export" }).click();
            await page.getByRole("option", { name: "Excel" }).waitFor();
            await h.settle(300);
          },
          after: async (page) => {
            await page.keyboard.press("Escape");
          },
        },
      ],
      fieldsHeading: ["Format", "Use it for"],
      fields: [
        ["PDF", "Printing or emailing. Laid out for paper."],
        ["Excel", "Opening in Microsoft Excel or Google Sheets to work with the figures."],
        ["CSV", "Opening in any spreadsheet or accounting program."],
        ["JSON", "Only when your system administrator asks for it."],
      ],
    },
  ],
};
