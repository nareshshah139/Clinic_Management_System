# Writing a chapter of the user guide

The user guide is a PDF for clinic staff: doctors, reception, pharmacists and admins. They are not developers. Each chapter is one file in `scripts/guide/chapters/`. The file holds the words and the recipe for every screenshot, so the text and the pictures cannot drift apart.

Read `chapters/01-getting-started.cjs` first. It is the model to copy.

## The stack

A demo stack is already running. Do not start, stop or restart it. `output/stack/guide/stack.json` has its address and users. `output/stack/guide/seed.json` has the ids of seeded patients, rooms, visits and appointments. `scripts/guide/seed.cjs` shows what data exists: 14 patients, 4 rooms, 18 medicines with stock, six weeks of pharmacy bills, 5 supplier bills, 6 past visits with prescriptions, and today's appointments.

Sign-in users (`as` on a shot): `admin` (Kiran Rao, sees everything, the default), `owner`, `doctor` (Priya Menon), `pharmacist` (Anil Deshmukh), `reception` (Sunita Patil), `anon` (signed out).

Other agents are writing other chapters against the same stack at the same time. So:

- Never delete or rewrite seeded records. Add your own.
- Do not edit `seed.cjs`, `lib.cjs`, `capture.cjs`, `build.cjs` or another agent's chapter. If the framework lacks something, work around it in your chapter and say so in your report.
- If your chapter needs extra data, create it in a chapter-level `setup: async (h) => {}`. It runs once before the chapter's shots. Make it safe to run twice: look for your record first and create it only if it is missing. Use `h.api(who, method, route, body, headers)` for the backend API or `h.db()` for a Prisma client (`await db.$disconnect()` when done).
- The final PDF is built from one run of every chapter, in file order, on a freshly seeded stack. Your chapter must pass when run alone on fresh data, and must not depend on what another chapter created.

## Commands

```bash
node scripts/guide/capture.cjs --only 03            # every shot of chapters whose id starts with 03
node scripts/guide/capture.cjs --only 03 --shot list   # one shot
node scripts/guide/build.cjs --only 03 --out <scratch>/ch03.pdf
pdftoppm -r 50 -png <scratch>/ch03.pdf <scratch>/ch03   # then Read the PNGs to check the pages
```

Screenshots land in `output/guide/shots/<chapter-id>/<file>.jpg`. A failed shot leaves `<file>.FAILED.jpg` showing where the page was. Delete stale `.FAILED.jpg` files once fixed.

## Chapter file shape

```js
module.exports = {
  id: "03-patients",              // must equal the file name without .cjs
  title: "Patients",
  intro: "Two or three sentences: what this part of the app is for and who uses it.",
  setup: async (h) => {},         // optional
  sections: [
    {
      title: "Register a new patient",       // a task, phrased as the thing the reader wants to do
      who: "Reception, doctors",
      body: ["Paragraph.", "Paragraph."],    // why and when, before the steps
      steps: ["Click <b>New Patient</b>.", "…"],
      shots: [
        {
          file: "new-patient",               // unique within the chapter
          caption: "The New Patient form.",
          as: "reception",                   // optional, default admin
          run: async (page, h) => { await h.goto("/dashboard/patients"); … },
          target: '[role="dialog"]',         // optional: screenshot only this element
          fullPage: false,                   // optional: whole scrolling page (use rarely)
          narrow: true,                      // optional: print at 62% width (dialogs, phone-shaped panels)
          viewport: { width: 1440, height: 1200 }, // optional
          after: async (page, h) => {},      // optional: close dialogs, undo toggles
        },
      ],
      shotLayout: "row",                     // optional: 2 to 4 small shots side by side
      fields: [["Name on screen", "What it means"]],   // optional reference table
      fieldsHeading: ["Column", "Meaning"],  // optional table header override
      after: ["Paragraph printed after the table."],
      tips: ["…"],
      warnings: ["…"],                       // actions that move money or stock, or cannot be undone
    },
  ],
};
```

Helpers on `h`: `goto(route)` opens an app path and waits; `settle(ms)` waits for the network to go quiet; `mark(locatorOrSelector, n)` draws a numbered red marker on an element (cleared after the shot); `seed`, `stack`, `api`, `db`.

## Coverage

"Do not skip any part of the application" is the user's instruction. For the pages you own, cover every tab, sub-tab, view switch, dialog, menu, filter bar, row action and print or export. Find them in the code (`frontend/src/app/dashboard/...`, `frontend/src/components/...`) and by clicking through the running app. If a control exists, the guide should say what it does. Where a page has many similar items (for example 17 reports), give each one at least a table row and screenshot the important ones.

Really do the task in the app where you can: book the appointment, save the visit, post the bill. A screenshot of a filled form and its result teaches more than an empty form. Use realistic Indian clinic data that fits the dermatology demo clinic. Never type anything that looks like test data ("test", "asdf", "foo").

## Screenshots

- Default window is 1440 by 900. Keep it unless a page truly needs more height.
- Every screenshot must show real content: no spinners, skeletons, error toasts or half-open menus. Wait for the content you describe.
- Open the Next.js page first with `h.goto`, then act. Each shot starts from wherever the last one ended, so always `goto` or close dialogs in `after`.
- Use `target` for dialogs and panels so the picture is large and readable in print.
- Use `mark` for up to about 6 numbered callouts and refer to the numbers in `steps` or `fields`.
- Prefer role and label locators (`getByRole`, `getByLabel`, `getByPlaceholder`) to CSS classes.
- Look at every screenshot yourself (Read the .jpg) before you call the chapter done. Check that it shows what the caption and steps say.

## Writing

- Write for a busy receptionist or pharmacist. Plain words, short sentences, present tense, "you".
- Say why before how: one or two sentences on when someone needs this task, then the numbered steps.
- Steps start with a verb and name the control in bold exactly as it appears on screen: "Click <b>New Patient</b>."
- One action per step. Say what the reader should see after an important step.
- Explain every status, colour, badge and abbreviation the reader will meet. Tables (`fields`) are good for this.
- State only what you have seen in the running app or read in the code. If you are unsure what a control does, find out. Do not guess.
- No developer words (endpoint, API, component, payload, modal). Say "window" or "box", not "modal".
- No long dashes. No "simply", "just", "easily". HTML allowed in strings: `<b>`, `<i>`, `<br>`. Write `&amp;` for an ampersand.
- A defect you notice in the app (something broken, misleading or mislabelled) goes in your report, not in the guide. The guide describes the app as it is.

## When you finish

Report back: the chapter files you wrote, the number of sections and shots in each, the parts of your pages you could not cover and why, and any app defects you noticed, each with the page and what you saw. Do not commit, push or open a pull request.
