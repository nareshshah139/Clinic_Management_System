const feeRow = (page, name) => page.locator("form").filter({ has: page.getByRole("heading", { name, exact: true }) });

module.exports = {
  id: "18-fee-list",
  title: "Fee list",
  intro:
    "The Fee list holds the clinic's three standard consultation and procedure fees. When reception creates a bill from the appointment calendar, the bill starts from the matching fee, so nobody has to remember the price. Only admins and owners can change the list.",
  sections: [
    {
      title: "See the clinic's fees",
      who: "Admins and owners",
      body: [
        "Open <b>Fee list</b> from the Admin part of the menu. The page has one row for each kind of bill. Each row says when that fee is used, what it is now, and who changed it last and when.",
        "Consultation and procedure fees are billed without GST.",
      ],
      shots: [
        {
          file: "fee-list",
          caption: "The Fee list with the three fees, each with its last change.",
          run: async (page, h) => {
            await h.goto("/dashboard/fees");
            await page.getByRole("heading", { name: "Procedure", exact: true }).waitFor();
            await h.mark(page.getByRole("heading", { name: "First consultation", exact: true }), 1);
            await h.mark(page.getByRole("heading", { name: "Review", exact: true }), 2);
            await h.mark(page.getByRole("heading", { name: "Procedure", exact: true }), 3);
          },
        },
      ],
      fields: [
        ["1. First consultation", "Used when a patient has no earlier visit in this branch."],
        ["2. Review", "Used when the patient has visited this branch before."],
        ["3. Procedure", "Used for any appointment booked as a procedure, whether or not the patient is new."],
        ["No fee set yet", "Nobody has entered a fee for this row. Bills of this kind start with an empty fee box."],
        ["₹800 · changed 13 Nov 2026, 06:40 pm by Kiran Rao", "The line under each fee: the current fee, when it was last changed and by whom."],
        ["Save", "Grey until you type an amount different from the saved fee."],
      ],
    },
    {
      title: "Set or change a fee",
      who: "Admins and owners",
      body: [
        "Change a fee when the clinic's prices change. Each row saves on its own, so changing the Review fee does not touch the other two.",
        "A new fee applies to bills created after you save it. Bills that already exist keep the amount they were made with.",
      ],
      steps: [
        "Click in the ₹ box of the fee you want to change.",
        "Type the new amount in rupees, for example <b>850</b>. You can type commas, such as 1,200. The amount must be above 0 and no more than ₹10,00,000.",
        "Click <b>Save</b> on the same row. The button stays grey until the amount is different from the saved one.",
        "Check the message at the bottom of the screen, for example <i>Review fee saved: ₹550</i>. The line under the fee name now shows your name and the time.",
      ],
      shots: [
        {
          file: "fee-edit",
          caption: "A new Review fee typed in. Save turns dark once the amount differs from the saved fee.",
          run: async (page, h) => {
            await h.goto("/dashboard/fees");
            const row = feeRow(page, "Review");
            await row.getByPlaceholder("Not set").fill("550");
            await h.mark(row.getByPlaceholder("Not set"), 1);
            await h.mark(row.getByRole("button", { name: "Save" }), 2);
          },
          target: 'section[aria-label="Fees by bill type"]',
        },
        {
          file: "fee-saved",
          caption: "After saving, the row shows the new fee and who changed it.",
          run: async (page, h) => {
            const row = feeRow(page, "Review");
            await row.getByRole("button", { name: "Save" }).click();
            await page.getByText(/Review fee saved/).first().waitFor();
            await h.settle(500);
          },
          after: async (page, h) => {
            await h.goto("/dashboard/fees");
            const row = feeRow(page, "Review");
            await row.getByPlaceholder("Not set").fill("500");
            await row.getByRole("button", { name: "Save" }).click();
            await page.getByText(/Review fee saved: ₹500/).first().waitFor();
          },
        },
      ],
      tips: [
        "If the box turns red with <i>Enter an amount above 0</i>, the amount has letters in it, is 0, or is too large.",
        "If another admin changed the same fee while you were typing, the row says who changed it and to what. Your amount stays in the box. Check it and click <b>Save</b> again.",
      ],
    },
    {
      title: "Clear a fee",
      who: "Admins and owners",
      body: [
        "Clear a fee when the clinic does not want a starting amount for that kind of bill, for example when every procedure is priced differently.",
      ],
      steps: [
        "Delete the amount so the box is empty and shows <b>Not set</b>.",
        "Click <b>Clear fee</b>. The button has this name only while the box is empty.",
      ],
      after: ["After a fee is cleared, bills of that kind start with an empty fee box and the desk types the amount each time."],
    },
    {
      title: "How the appointment calendar uses the fees",
      who: "Reception, admins",
      body: [
        "On the appointment calendar, <b>Create bill</b> on an appointment opens a bill with one line: <i>First consultation</i>, <i>Review consultation</i> or <i>Procedure</i>. The app picks the kind from the appointment: a procedure appointment is a Procedure bill; any other appointment is a First consultation for a new patient and a Review for a patient who has visited this branch before.",
        "The <b>Fee</b> box on the bill is filled with the matching fee from this list, and the line under it says <i>From fee list: Review ₹500</i>. The desk can change the amount for this one bill. The line then says <i>Fee list: Review ₹500, changed for this bill</i> and offers <b>Use ₹500</b> to go back to the list fee. Changing the amount on a bill never changes the Fee list.",
        "When no fee is set for that kind, the box is empty and says <i>No fee set</i>. Admins also see a <b>Set fees</b> link that opens this page. The Appointments chapter shows the whole billing window.",
      ],
    },
    {
      title: "Who can change the fees",
      who: "Everyone",
      body: [
        "Only admins and owners see <b>Fee list</b> in the menu and can change fees. Anyone else who opens the page sees a short message instead of the fees. Reception and doctors still see the fee when they create a bill, and can change the amount on that bill.",
      ],
      shots: [
        {
          file: "fee-locked",
          as: "doctor",
          caption: "What a doctor sees on the Fee list page.",
          run: async (page, h) => {
            await h.goto("/dashboard/fees");
            await page.getByText("Only an admin can change the fee list.").waitFor();
          },
        },
      ],
    },
  ],
};
