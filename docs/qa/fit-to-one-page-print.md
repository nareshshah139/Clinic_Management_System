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

## Known issue in existing code

The continuation-page nudge in `PrescriptionBuilder.tsx` (`continuationExtraOffsetPx`) moves the content of page 2 onward about 35 px down. It does not shorten those pages for Paged.js, so a full continuation page can run that far into the bottom margin. Fit to 1 page only produces a continuation page in the 11 px overflow case. There, 11 px rows leave less slack at the bottom of the page than 14 px rows, so the synthetic 40-medicine prescription shows it: page 2 ends 10 px below the printable area. No normal or space-optimized page in these runs crossed the line. This change does not alter that code.

## Verification, 08/11/2026

`scripts/diagnostics/fit-one-page-browser.cjs` runs against the actual local frontend and Chromium's Paged.js render. Every API response is synthetic, and each prescription is seeded as a local draft. No real patient records are read or changed.

It has 30 prescriptions. They range from a single medicine to 40 medicines with long instructions. Others have 30 investigations, six custom sections, long complaints, a follow-up with an unbroken word, very long medicine names, multi-line personal history, Hindi and Telugu instructions, a 260 px top margin, a 180 px bottom margin, and all four page breaks ticked.

For each prescription the script records the page count in the normal and space-optimized layouts, ticks Fit to 1 page, and checks the following:

- Every medicine, investigation, diagnosis, complaint and follow-up is printed, and the signature is on the last page.
- The 27 prescriptions that are expected to fit print on one page. The other three, which are 26 medicines with two-line instructions, all sections heavy, and 40 medicines, must either fit or use 11 px with the overflow notice. All sections heavy fits, at 11.5 px.
- No text is smaller than 11 px, and line height is at least 1.14 times the text size.
- Text on page 1 stays inside the printable area. Continuation pages are allowed the existing nudge described above.
- No two lines of text overlap.
- Each heading shares a line with its value.
- Forced page breaks are dropped.
- When text is shrunk, the page is more than 80% full, so a roomier step could not have fitted. A prescription that fits on one page in Space-optimized layout keeps 14 px text.

Four prescriptions are also downloaded as PDFs, and the PDF must have the same number of pages as the preview. One prescription is unticked again to check that the normal page count and stacked layout come back.

All 30 pass.

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

The other 19 prescriptions fit at 14 px. Per-prescription results and page images are written to the output folder, along with `summary.json`.

Regression checks:

- `cr23-one-page-browser.cjs`, `cr08-print-layout-browser.cjs` and `print-matrix-browser.cjs` pass, so the normal and space-optimized layouts are unchanged.
- The 270 frontend tests in `__tests__/visits` and `__tests__/lib` pass, including the new `__tests__/lib/print-fit.test.ts`.
- The production TypeScript check (`tsconfig.build.json`) passes.

To reproduce, start the frontend on port 3000, then run `node scripts/diagnostics/fit-one-page-browser.cjs`. It needs `pdftoppm`. Set `FIT_ONLY=typical,heavy-23` to run a subset, and `FIT_OUTPUT` to choose the output folder.
