const COUNTER = "/dashboard/pharmacy?section=counter";
const WIDE = { width: 1920, height: 1080 };

const RX = {
  flow: ["Rahul Bhatt", "Acne on the back and shoulders", "Acne vulgaris, grade 2", [
    ["Benzoyl Peroxide Gel 2.5% 20 g", "ONCE_DAILY", 30, "Apply on the back at night", 1],
    ["Doxycycline 100 mg Capsule", "ONCE_DAILY", 14, "After breakfast, with a full glass of water", 14],
  ]],
  exceptions: ["Neha Agarwal", "Itchy rash in the armpits and under the breasts", "Intertrigo with candidiasis", [
    ["Luliconazole Cream 1% 20 g", "TWICE_DAILY", 14, "Apply on the rash", 1],
    ["Clindamycin Gel 1% 20 g", "TWICE_DAILY", 14, "Apply on the red pustules only", 1],
    ["Mometasone Cream 0.1% 15 g", "ONCE_DAILY", 5, "Thin layer at night for 5 days only", 1],
  ]],
  waiting: ["Kavya Rao", "Itchy bumps on the arms after insect bites", "Papular urticaria", [
    ["Calamine Lotion 100 ml", "TWICE_DAILY", 7, "Dab on the bumps", 1],
    ["Cetirizine 10 mg Tablet", "ONCE_DAILY", 10, "At bedtime", 10],
  ]],
};

const card = (page, name) => page.locator("button").filter({ has: page.locator("p", { hasText: new RegExp(`^${name}$`) }) }).first();
const reviewRow = (page, drug) => page.locator(`div.grid:has(> div > p:text-is("${drug}"))`).first();

async function select(page, h, name) {
  await h.goto(COUNTER, 1500);
  await card(page, name).click();
  await h.settle(1500);
}

module.exports = {
  id: "10-pharmacy-counter",
  title: "Pharmacy Counter",
  intro:
    "The Pharmacy Counter is the pharmacist's workstation for prescriptions. It takes a prescription from the queue, through checking each medicine against stock, to the bill and the hand-over. Pharmacists use it most; doctors, reception and admins can open it too.",
  setup: async (h) => {
    const db = h.db();
    const since = new Date(Date.now() - 20 * 3600000);
    try {
      for (const [patientName, complaint, diagnosis, lines] of Object.values(RX)) {
        const patient = h.seed.patients.find((p) => p.name === patientName);
        const exists = await db.prescription.findFirst({ where: { visit: { patientId: patient.id }, items: { contains: lines[0][0] }, createdAt: { gte: since } } });
        if (exists) continue;
        const doctorId = h.stack.users.doctor.id;
        const visit = await h.api("doctor", "POST", "/visits", {
          patientId: patient.id, doctorId,
          vitals: { systolicBP: 116, diastolicBP: 74, heartRate: 76, weight: 58, height: 162 },
          complaints: [{ complaint }], diagnosis: [{ diagnosis }],
        });
        await h.api("doctor", "POST", "/prescriptions", {
          patientId: patient.id, visitId: visit.id, doctorId, diagnosis, followUpInstructions: "Review in 2 weeks.",
          items: lines.map(([drugName, frequency, duration, instructions, quantity]) => ({ drugName, dosage: 1, dosageUnit: "TABLET", frequency, duration, durationUnit: "DAYS", instructions, quantity })),
        }, { "Idempotency-Key": `guide-10-rx-${visit.id}` });
      }
    } finally {
      await db.$disconnect();
    }
  },
  sections: [
    {
      title: "The parts of the counter",
      who: "Pharmacists",
      body: [
        "Open <b>Pharmacy Counter</b> from the menu, or click the <b>Pharmacy Counter</b> card on the Pharmacy Desk. The screen has a dark strip at the top and three panels that follow the work from left to right: <b>Queue</b>, <b>Active Dispense</b> and <b>Pick + Pay</b>. The full <b>Prescription Queue</b> table is further down the page.",
        "The counter is widest on a large screen. On a smaller screen some columns of the medicine list are cut off on the right; zoom the browser out (Ctrl and minus) to see them.",
      ],
      fields: [
        ["1. Counters", "<b>Queue</b>: prescriptions from today or still open. <b>Review</b>: being checked now. <b>Exceptions</b>: paused, part-filled, cancelled or expired. <b>Ready/Paid</b>: ready to bill or already paid."],
        ["2. Refresh, Rx queue, Bill", "<b>Refresh</b> reloads the queue and rechecks stock. <b>Rx queue</b> is a shortcut to the queue; the same list is the Prescription Queue table lower down. <b>Bill</b> opens a new bill for the selected prescription."],
        ["3. Queue", "The prescriptions waiting, newest first. Click one to start on it."],
        ["4. Active Dispense", "The selected prescription, medicine by medicine, with the stock found for each."],
        ["5. Pick + Pay", "What to take from the shelf next, a checklist from checking to dispensing, and the buttons to bill."],
      ],
      shots: [
        {
          file: "counter",
          as: "pharmacist",
          viewport: WIDE,
          caption: "The Pharmacy Counter, with its parts numbered.",
          run: async (page, h) => {
            await h.goto(COUNTER, 2000);
            await h.mark(page.getByText("Queue", { exact: true }).locator("xpath=../..").first(), 1);
            await h.mark(page.getByRole("button", { name: "Rx queue" }), 2);
            await h.mark(page.getByText("Queue", { exact: true }).nth(1), 3);
            await h.mark(page.getByText("Active Dispense", { exact: true }), 4);
            await h.mark(page.getByText("Pick + Pay", { exact: true }), 5);
          },
        },
      ],
      tips: [
        "The two labels under the title, <b>Pharmacist review</b> and <b>Shelf locations</b>, name the two ways the counter helps you: every medicine is checked by a pharmacist before billing, and Pick + Pay shows the shelf where each batch is kept.",
      ],
    },
    {
      title: "Read the queue",
      who: "Pharmacists",
      body: [
        "Each card in the Queue is one prescription. The two boxes at the top count the <b>Queued</b> prescriptions (waiting, in review or ready to bill) and the <b>Exceptions</b>. The round buttons filter the list.",
      ],
      fieldsHeading: ["On the card or tab", "Meaning"],
      fields: [
        ["All / Queue / Review / Exceptions / Done", "Filters. <b>Queue</b>: not started. <b>Review</b>: being checked or ready to bill. <b>Exceptions</b>: paused, part-filled, cancelled or expired. <b>Done</b>: paid or dispensed."],
        ["Name and code", "The patient and their patient code."],
        ["Queued", "Waiting. Nobody has opened it yet."],
        ["Review", "A pharmacist has opened it and is checking the medicines."],
        ["Bill", "Every medicine is checked; it is ready to bill."],
        ["Paid", "Marked as paid."],
        ["Done", "Fully billed and dispensed."],
        ["Partial", "Some medicines were billed, some are still to give."],
        ["Paused", "Red. Put on hold by a pharmacist, or more than 24 hours old with nothing billed, or past its validity."],
        ["Cancelled", "Cancelled at the counter."],
        ["N medicines", "How many medicines are on the prescription."],
        ["12m pending / 3.5h pending", "How long since the doctor wrote it, in minutes under an hour and hours after that."],
        ["over 2h", "Amber. The patient has been waiting more than two hours."],
      ],
      shots: [
        {
          file: "queue",
          as: "pharmacist",
          viewport: WIDE,
          caption: "The Queue: today's prescriptions are Queued; older unbilled ones show Paused and over 2h.",
          target: (page) => page.locator("div.rounded-lg").filter({ has: page.getByText("today or open") }).last(),
          narrow: true,
          run: async (page, h) => {
            await h.goto(COUNTER, 2000);
          },
        },
        {
          file: "queue-exceptions",
          as: "pharmacist",
          viewport: WIDE,
          caption: "The Exceptions filter.",
          target: (page) => page.locator("div.rounded-lg").filter({ has: page.getByText("today or open") }).last(),
          narrow: true,
          run: async (page, h) => {
            await h.goto(COUNTER, 2000);
            await page.getByRole("button", { name: "Exceptions", exact: true }).click();
            await h.settle(300);
          },
        },
      ],
      shotLayout: "row",
      after: [
        "When no prescription is waiting, the Queue shows <b>No prescriptions waiting</b> with three buttons. <b>Walk-in bill</b> opens a new bill for a customer without a prescription. <b>Pull visits</b> reloads the queue to pick up prescriptions doctors have just saved. <b>Inventory control</b> opens the shelf settings in Inventory.",
      ],
    },
    {
      title: "Review every medicine",
      who: "Pharmacists",
      body: [
        "Click a card to start. The prescription moves to <b>In Review</b> and its medicines appear in Active Dispense. The dark bar shows the patient, doctor, date and a row of steps: Queued, In Review, Partially Filled, Paused, Ready to Bill, Paid, Dispensed and Cancelled. The current step is filled in.",
        "Each medicine row shows what the doctor prescribed, the product in stock the app matched it to, the stock, and the shelf, batch and expiry to pick from. Mark each medicine with one of four buttons.",
      ],
      fieldsHeading: ["Button or label", "Meaning"],
      fields: [
        ["Accept", "Give the medicine as prescribed."],
        ["Sub", "Give a substitute. Choose a reason and note it below."],
        ["Edit", "Give it with a change, such as a different quantity."],
        ["NA", "Not available. A medicine marked NA blocks <b>Ready</b> until it is resolved."],
        ["Inventory Match", "The stock product found for the prescribed name, with its maker. <b>No inventory match</b> means none was found; link it from the Prescription Queue table below."],
        ["IN STOCK / LOW STOCK / OUT OF STOCK / UNMATCHED", "Stock of the matched product. <b>Qty</b> is the quantity still to give."],
        ["Warnings", "<b>Low stock</b>, <b>Out of stock</b>, <b>Near expiry</b>, <b>No match</b>, or <b>Expired batch blocked</b> (an expired batch is on the shelf and will not be sold)."],
        ["Shelf and batch", "The rack, batch number and expiry of the batch to pick, or <b>Unmapped</b>, <b>No batch</b>, <b>No expiry</b>."],
        ["Reason list and note", "The reason for a substitution, change, pause or cancellation: Substitution requested, Quantity changed, Medicine unavailable, Paused for doctor clarification, Cancelled at counter or Stock correction needed. Add your own words in <b>Reason or pharmacist note</b>. Choose them before clicking Sub, Edit, NA or Pause; they are saved with that action."],
      ],
      shots: [
        {
          file: "review-exceptions",
          as: "pharmacist",
          viewport: WIDE,
          caption: "A prescription with problems: one cream out of stock, one gel low, one batch near expiry.",
          run: async (page, h) => {
            await select(page, h, RX.exceptions[0]);
          },
        },
      ],
    },
    {
      title: "Pause a prescription",
      who: "Pharmacists",
      body: [
        "Pause when you cannot finish now, for example a medicine is out of stock and you need the doctor to choose another. The prescription moves to the <b>Exceptions</b> filter with a red <b>Paused</b> badge until someone picks it up again.",
      ],
      steps: [
        "Choose the reason in the list, for example <b>Medicine unavailable</b>.",
        "Type a note in <b>Reason or pharmacist note</b>.",
        "Click <b>NA</b> on the medicine that is not available.",
        "Click <b>Pause</b>.",
      ],
      shots: [
        {
          file: "paused",
          as: "pharmacist",
          viewport: WIDE,
          caption: "The cream marked NA with a reason, and the prescription paused.",
          run: async (page, h) => {
            await select(page, h, RX.exceptions[0]);
            await page.locator("select").filter({ hasText: "Substitution requested" }).selectOption("Medicine unavailable");
            await page.getByPlaceholder("Reason or pharmacist note").fill("Luliconazole out of stock. Asked Dr. Menon for an alternative.");
            await reviewRow(page, "Luliconazole Cream 1% 20 g").getByRole("button", { name: "NA" }).click();
            await h.settle(800);
            await page.getByRole("button", { name: "Pause", exact: true }).click();
            await h.settle(1200);
          },
        },
      ],
    },
    {
      title: "Take a prescription from queue to paid and dispensed",
      who: "Pharmacists",
      body: [
        "This is the everyday flow. Rahul Bhatt's prescription has a gel and a course of capsules, both in stock.",
      ],
      steps: [
        "Click the patient's card in the Queue. It moves to <b>In Review</b>.",
        "Check each medicine against the prescription and click <b>Accept</b> (or Sub or Edit). The count under Active Dispense shows how many lines are reviewed, for example 2/2.",
        "When every medicine is reviewed, the bottom bar reads <b>Ready for billing review</b>. Click <b>Ready</b>. The step moves to <b>Ready to Bill</b> and the card shows <b>Bill</b>.",
        "Pick the medicines. <b>Scan next</b> in Pick + Pay shows the medicine to pick, how many, and its shelf, batch, expiry and stock. <b>Pick Assist</b> lists every medicine the same way, and says when other batches are available if the shelf is short.",
        "Click <b>Open bill</b> (or <b>Collect payment</b>, or <b>Bill</b> in the top strip). A new bill opens with the prescription loaded.",
        "Choose the payment method, click <b>Print Preview</b>, then <b>Confirm Invoice</b>. See the Sales chapter for the details.",
        "Go back to the Pharmacy Counter. The card now shows <b>Done</b> and the step is <b>Dispensed</b>. Hand the medicines over.",
      ],
      shots: [
        {
          file: "flow-review",
          as: "pharmacist",
          viewport: WIDE,
          caption: "Both medicines accepted: Ready for billing review.",
          run: async (page, h) => {
            await select(page, h, RX.flow[0]);
            for (const [drug] of RX.flow[3]) {
              await reviewRow(page, drug).getByRole("button", { name: "Accept" }).click();
              await h.settle(800);
            }
            await page.getByText("Ready for billing review").waitFor();
          },
        },
        {
          file: "flow-ready",
          as: "pharmacist",
          viewport: WIDE,
          caption: "After Ready: the step is Ready to Bill and Pick + Pay shows what to pick and where.",
          run: async (page, h) => {
            await page.getByRole("button", { name: "Ready", exact: true }).click();
            await h.settle(1200);
            await h.mark(page.getByText("Scan next"), 1);
            await h.mark(page.getByText("Pick Assist", { exact: true }), 2);
            await h.mark(page.getByRole("button", { name: "Open bill" }), 3);
          },
        },
        {
          file: "flow-bill",
          as: "pharmacist",
          viewport: { width: 1440, height: 1700 },
          caption: "Open bill loads the prescription into a new bill.",
          target: '[aria-label="Prescription bill"]',
          run: async (page, h) => {
            await page.getByRole("button", { name: "Open bill" }).click();
            await page.waitForURL(/sales\/bill/, { timeout: 120000 });
            await page.getByRole("heading", { name: "Linked Prescription" }).waitFor({ timeout: 120000 });
            await page.locator("[data-invoice-item]").nth(1).waitFor({ timeout: 60000 });
            await page.locator('div:has(> label[for="paymentMethod"]) [role="combobox"]').click();
            await page.getByRole("option", { name: "UPI", exact: true }).click();
            await h.settle(800);
          },
          after: async (page) => {
            await page.getByRole("button", { name: "Print Preview" }).click();
            const done = page.getByRole("button", { name: "Invoice Confirmed" });
            for (let attempt = 0; attempt < 6; attempt++) {
              await page.getByRole("button", { name: "Confirm Invoice" }).click();
              if (await done.waitFor({ timeout: 20000 }).then(() => true, () => false)) break;
            }
            await page.getByRole("button", { name: "Close", exact: true }).first().click();
          },
        },
        {
          file: "flow-dispensed",
          as: "pharmacist",
          viewport: WIDE,
          caption: "Back at the counter: the prescription is Dispensed and every step of the checklist is ticked.",
          run: async (page, h) => {
            await h.goto(COUNTER, 1500);
            await page.getByRole("button", { name: "Done", exact: true }).click();
            await card(page, RX.flow[0]).click();
            await h.settle(1500);
          },
        },
      ],
      fieldsHeading: ["Pick + Pay checklist", "Ticked when"],
      fields: [
        ["Validate (allergy and dose)", "A prescription is selected. Check the patient's allergies and the doses."],
        ["Pick earliest-expiry batch", "A batch was found. Pick the unexpired batch with the nearest expiry date."],
        ["Barcode (confirm batch)", "Every medicine is reviewed."],
        ["GST bill (invoice ready)", "The prescription is Ready to Bill, Paid or Dispensed."],
        ["Payment (capture)", "Paid or Dispensed."],
        ["Dispense (commit)", "Dispensed: the bill covers every medicine."],
      ],
      after: [
        "The <b>Paid</b> button marks the prescription as paid without making a bill here, for example when the bill was made separately. A prescription that is fully billed becomes Dispensed by itself.",
        "When a prescription is billed only in part, its card shows <b>Partial</b> and it stays in Exceptions until the rest is billed.",
      ],
      warnings: ["Confirming the bill takes the medicines out of stock and records the payment."],
    },
    {
      title: "Daily close and shelf locations",
      who: "Pharmacists",
      body: [
        "Two buttons at the bottom of Pick + Pay lead elsewhere. <b>Daily close</b> opens the Pharmacy Desk, where partner pharmacies' daily sales are entered (see <i>Partner Daily Sync</i> in the Pharmacy Desk chapter). <b>Shelf locations</b> opens Inventory, Pharmacy Control, where each medicine's rack is set. The rack you set there is what the counter shows under Shelf and batch and in Pick Assist.",
      ],
      shots: [],
    },
    {
      title: "The Prescription Queue table",
      who: "Pharmacists",
      body: [
        "Below the three panels, the <b>Prescription Queue</b> table lists the same prescriptions with more detail and lets you bill them directly. It works the same way as the queue on the New sale screen (see <i>Bill a prescription from the queue</i> in the Sales chapter); here the button on each row is <b>Bill</b> instead of Load. The green label <b>Validate before adding stock</b> is a reminder to check every medicine before billing.",
        "Use the status list at the top right to show <b>Pending</b>, <b>Partial</b>, <b>Dispensed</b>, <b>Expired</b> or <b>All</b> prescriptions. In the Stock column, <b>Link item</b> or <b>Change link</b> tells the app which product in stock a prescribed medicine is.",
      ],
      shots: [
        {
          file: "rx-table",
          as: "pharmacist",
          viewport: WIDE,
          caption: "The Prescription Queue table under the counter.",
          run: async (page, h) => {
            await h.goto(COUNTER, 2000);
            await page.getByText("Prescription Queue", { exact: true }).evaluate((el) => el.scrollIntoView({ block: "start" }));
            await h.settle(1500);
          },
        },
      ],
    },
  ],
};
