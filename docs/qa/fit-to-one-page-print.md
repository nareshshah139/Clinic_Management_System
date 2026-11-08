# Fit to 1 page print option

The print preview has a new **Fit to 1 page** checkbox, below **Space-optimized layout**. When it is ticked, the prescription prints on one page whenever that is possible at a readable text size.

## Behavior

- It uses the space-optimized layout: headings sit beside their values and the Rx prints as a table.
- It then picks the roomiest of 10 steps that keeps everything on one page. Steps 0 to 3 keep text at 14 px and only reduce line height and the gaps between blocks, Rx rows and the signature. Steps 4 to 9 reduce text from 13.5 px to 11 px, half a pixel at a time.
- A short prescription gets step 0. That step is roomier than Space-optimized layout: blocks have 10 px of padding and line height is 1.45.
- Text never goes below 11 px. If the prescription still does not fit at 11 px, every line prints at 11 px on as many pages as needed. The settings panel then says: "Too much content for one page at a readable size. Printing on N pages with text at 11 px."
- When it fits, the panel says "Fits on 1 page", followed by the text size whenever that is below 14 px.
- While the option is ticked, Space-optimized layout, Line spacing and the four **Break before** checkboxes are disabled. Forced page breaks are ignored.
- Unticking it restores the previous layout.
- The setting applies to the preview, browser printing and Download PDF, because all three use the same Paged.js pages. Like the other print settings, it is not remembered between sessions.

### How it picks a step

`frontend/src/lib/print-fit.ts` copies the print markup into an off-screen box with the same width and print font as the page's content area. It measures the copy's height at each step and stops at the first step that fits the page's content height. Paged.js then lays out that step. If Paged.js still makes two pages, the next step is tried. A positive vertical content offset from a printer profile is subtracted from the available height.

## Not included

- **The server-generated PDF.** `POST /prescriptions/:id/pdf` and sharing with `includePdf` use the separate pdfkit layout. It has no fit mode.
- **Text format.** Fit to 1 page always prints the Rx as a table.

## Printed text never ends inside the bottom margin

This applies to every layout, not only Fit to 1 page.

Two things move content down after Paged.js has split it into pages:

- Continuation pages are nudged about one line lower than page 1, so they sit clear of the letterhead (`CONTINUATION_NUDGE_PX`, 36 px).
- A printer profile, or the doctor's saved print layout, can set a vertical content offset.

Before this change Paged.js did not know about either move, so a full page could end inside the bottom margin. Two synthetic prescriptions showed it:

- 40 medicines, Fit to 1 page: page 2 ended 10 px inside the margin.
- A 60 px content offset, normal layout: page 1 ended 42 px inside the margin.

Now Paged.js lays out each page with extra bottom margin for these moves:

- **Every page** gets extra bottom margin equal to any downward content offset.
- **Continuation pages** get another 48 px (`CONTINUATION_RESERVE_PX`) through `@page`, while `@page :first` keeps page 1 at the normal margin. The built-in Dr. Praneeta Jain letterhead does not nudge continuation pages, so it gets no extra 48 px.

As a backstop, each continuation page's nudge is capped at the free space below its last line.

Content still moves down as before. The cost is that a long prescription can need one more page. The 40-medicine normal layout now prints on 8 pages instead of 7.

Fit to 1 page measures page 1 against its bottom margin including the offset, so a prescription with a 60 px offset fits at a smaller step than the same prescription without one.

## Verification, 08/11/2026

`scripts/diagnostics/fit-one-page-browser.cjs` runs against the actual local frontend and Chromium's Paged.js render. Every API response is synthetic, and each prescription is seeded as a local draft. No real patient records are read or changed.

It has 31 prescriptions. They range from a single medicine to 40 medicines with long instructions. Others have 30 investigations, six custom sections, long complaints, a follow-up with an unbroken word, very long medicine names, multi-line personal history, Hindi and Telugu instructions, a 260 px top margin, a 180 px bottom margin, a 60 px content offset from the doctor's saved print layout, and all four page breaks ticked.

For each prescription the script records the page count in the normal and space-optimized layouts, ticks Fit to 1 page, and checks the following:

- Every medicine, investigation, diagnosis, complaint and follow-up is printed, and the signature is on the last page.
- The 28 prescriptions that are expected to fit print on one page. The other three, which are 26 medicines with two-line instructions, all sections heavy, and 40 medicines, must either fit or use 11 px with the overflow notice. All sections heavy fits, at 11.5 px.
- No text is smaller than 11 px, and line height is at least 1.14 times the text size.
- In the normal, space-optimized and fitted layouts, no text on any page ends inside the bottom margin shown in the settings panel. This includes nudged continuation pages and offset content.
- No two lines of text overlap.
- Each heading shares a line with its value.
- Forced page breaks are dropped.
- When text is shrunk, the printed page is laid out again at the next roomier step, and that layout must not fit. Page fullness alone does not prove this. In the content-offset prescription, the step that fits leaves the page 71% full, because at 13 px the long medicine names wrap and the page grows from 550 px to 780 px.
- A prescription that fits on one page in Space-optimized layout keeps 14 px text.

Four prescriptions are also downloaded as PDFs, and the PDF must have the same number of pages as the preview. One prescription is unticked again to check that the normal page count and stacked layout come back.

All 31 pass.

| Prescription | Normal | Space-optimized | Fit to 1 page |
| --- | --- | --- | --- |
| minimal, 1 medicine | 1 | 1 | 1, 14 px, step 0 |
| typical, 9 medicines, 10 investigations | 2 | 1 | 1, 14 px, step 1 |
| 15 medicines | 2 | 1 | 1, 14 px, step 2 |
| 18 medicines | 2 | 2 | 1, 14 px, step 3 |
| 20 medicines | 3 | 2 | 1, 13 px |
| heavy, 23 medicines | 4 | 2 | 1, 11.5 px |
| 30 medicines, no instructions | 3 | 2 | 1, 12.5 px |
| 10 very long medicine names | 2 | 2 | 1, 12.5 px |
| all sections, heavy | 3 | 2 | 1, 11.5 px |
| 26 medicines, two-line instructions | 5 | 3 | 2, 11 px, with notice |
| 40 medicines, long everything | 7 | 5 | 3, 11 px, with notice |

The content-offset prescription fits at 12.5 px. The other 19 fit at 14 px. Per-prescription results and page images are written to the output folder, along with `summary.json`.

Regression checks:

- `cr23-one-page-browser.cjs`, `cr08-print-layout-browser.cjs` and `print-matrix-browser.cjs` pass, so the normal and space-optimized layouts are unchanged.
- The 270 frontend tests in `__tests__/visits` and `__tests__/lib` pass, including the new `__tests__/lib/print-fit.test.ts`.
- The production TypeScript check (`tsconfig.build.json`) passes.

To reproduce, start the frontend on port 3000, then run `node scripts/diagnostics/fit-one-page-browser.cjs`. It needs `pdftoppm`. Set `FIT_ONLY=typical,heavy-23` to run a subset, and `FIT_OUTPUT` to choose the output folder.
