# Print line spacing, tighter space-optimized layout and PDF export fix

## Downloaded PDFs no longer drop or shift content

**Symptom.** The clinic reported that when a prescription runs past one page, part of page 2 in the downloaded PDF is covered by the top of the letterhead. Reproducing this showed that the PDF pages did not match the preview at all. Text was larger, wrapped differently, and was cut off at the bottom of pages. In the synthetic 23-medicine prescription below, the PDF lost Zimba cream, Cap. Antoxid-HC and Extra medicine 8 entirely. The space-optimized PDF lost Procedure Planned, Allergies, Review Date and Follow-up.

**Cause.** Paged.js paginates the preview inside `#pagedjs-container`. That container sets the print font (Fira Sans), a 14 px base size, and `--app-text-increase: 0`, which switches off the app's enlarged screen text. Download PDF (`renderPrescriptionPages` in `frontend/src/lib/pdf-export.ts`) copies only the container's contents into an off-screen wrapper and removes every `id`. None of those container rules reached the wrapper, so html2canvas drew the pages with the larger screen text and a different font. Each page was then laid out differently from the way Paged.js had split it.

**Fix.** The export wrapper now gets the class `prescription-pdf-export`. `globals.css` and the print font rule in `PrescriptionBuilder.tsx` apply the same print scope to that class as to `#pagedjs-container`. The PDF now uses the same text size and font as the preview, so each PDF page matches its preview page. The browser Print button already used a correctly scoped host (`#prescription-print-host`) and is unchanged.

With the Dr. Praneeta Jain letterhead, the protected top margin already keeps continuation pages below the letterhead in the preview. The new check asserts this for every page in every scenario. It also checks that each PDF page matches its preview.

## More space saved in the space-optimized layout

These changes apply only when **Space-optimized layout** is ticked.

- **Rx table columns.** Frequency, When and Duration are narrower, and Instructions is wider, so instructions wrap less. Cell side padding is 6 px instead of 12 px.
- **Review Date and Follow-up.** They share one line when both are present. A long follow-up value moves to its own line and wraps under its value. If "Break before Follow-up" is ticked, they stay on separate lines so the page break still works.

## Line spacing option

The print settings panel has a new **Line spacing** control with three choices:

- **Normal**, the default, keeps the current spacing.
- **Compact** sets line height to 1.3, which is 18.2 px at the 14 px print size.
- **Tight** sets line height to 1.2, which is 16.8 px.

Text size does not change. The setting applies to the preview, to browser printing and to Download PDF, in both layouts. Like Space-optimized layout, it is not remembered between sessions.

## Results

These figures come from the synthetic typical prescription: 9 medicines, 10 investigations, vitals and a custom section. Content height is measured in the Paged.js preview.

| Space-optimized, typical prescription | `main` | Normal | Compact | Tight |
| --- | --- | --- | --- | --- |
| Content height | 706 px | 622 px | 579 px | 547 px |

On the heavy 23-medicine prescription, the space-optimized layout takes 2 pages instead of 3 on `main`.

The normal layout at Normal spacing is unchanged. `scripts/diagnostics/cr23-one-page-browser.cjs` records identical field positions on `main` and on this change.

## Verification, 06/11/2026

`scripts/diagnostics/print-matrix-browser.cjs` runs against the actual local frontend and Chromium's Paged.js render, with synthetic API responses and a seeded local draft. No real patient records are read or changed.

It has five prescriptions:

- **typical** has 9 medicines, 10 investigations, vitals and a custom section.
- **minimal** has one medicine and no review date.
- **long-text** has long complaints, 17 investigations, and a long follow-up that includes an unbroken word.
- **heavy** has 23 medicines and runs to several pages.
- **follow-up-only** has a follow-up and no review date.

Each prescription is checked in both layouts at all three line spacings, for 30 states in total. In every state, the script checks the following:

- Every medicine renders, and the signature is on the last page.
- No page is blank.
- On every page, the first text starts below the letterhead band, which is the top 16% of the page.
- Text stays at 14 px, and the line height matches the chosen spacing.
- In the space-optimized layout, each heading shares a line with its value.
- In the space-optimized layout, typical, minimal and follow-up-only fit on one page.
- Content height decreases from Normal to Compact to Tight in each layout.

For five states, the script also clicks **Download PDF** with the save calls stubbed, converts the PDF to images, and compares each page with its preview page. Those states are typical/optimized/tight, long-text/optimized/normal, heavy/normal/normal, heavy/normal/tight and heavy/optimized/compact. The comparison counts the text rows that appear in one image but not within 1 px in the other. It first aligns the two images vertically, allowing a shift of up to 16 px, because html2canvas places all content about 8 px lower than the preview.

| PDF compared with preview | Text rows that differ |
| --- | --- |
| Before the fix (export class removed) | 8.3% to 25.5% on pages with content |
| After the fix | 0.9% to 3.5% |

The limit is 6%. With the export class removed, the script fails at heavy/normal/normal page 1 with 22.5%. With the fix, all 30 states pass.

Regression checks:

- `cr23-one-page-browser.cjs` passes.
- `cr08-print-layout-browser.cjs` passes its short, long and empty scenarios.
- The 220 frontend tests in `__tests__/visits` and `__tests__/lib` pass.
- The production TypeScript check (`tsconfig.build.json`) passes.

Evidence is in `output/print-matrix/`. It holds the summary of all 30 states, and preview and PDF images for the typical and heavy prescriptions, including a heavy PDF page from before the fix.

To reproduce, start the frontend on port 3000, then run `node scripts/diagnostics/print-matrix-browser.cjs`. It needs Python with Pillow and `pdftoppm`. Set `PRINT_MATRIX_ONLY=typical,heavy` to run a subset.
