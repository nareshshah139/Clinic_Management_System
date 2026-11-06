# CR-08 and CR-23: Space-optimized print on one page

With **Space-optimized layout** ticked, a prescription with 9 medicines and 10 investigations now prints on one page. Before this change, the same prescription spilled Follow-up and the signature onto a second page.

## Behavior

Each change below applies only when Space-optimized layout is ticked. The normal layout is unchanged.

- Every printed block uses 2 px of vertical padding instead of 12 px. This covers the patient line, Vitals, Diagnosis, Chief Complaints, History, Personal history, Family History, Rx, Investigations, Counseling, Procedures, Procedure Planned, custom sections, Review Date and Follow-up.
- Rx table rows and the table header use 2 px of vertical padding instead of 6 px. The gap under the **Rx** heading is 2 px instead of 8 px.
- The gap above the signature is 16 px instead of 40 px.
- Vitals, Counseling and custom sections print as **Label: value** on one line, the same as the other blocks. Long values wrap under the value.
- Font sizes do not change.

CR-08's other blocks already printed inline before this change. Diagnosis, History, Personal history, Investigations, Procedures and Procedure Planned did so on `main`. Chief Complaints, Review Date and Follow-up have done so since 27/09/2026.

## Not included

- **Examination.** CR-08 lists Examination, but the print layout has no Examination block in either layout, so there is nothing to put inline. Printing examination findings would be a new feature.
- **Review Date and Follow-up on one line.** CR-08 marks this as optional. The target prescription fits on one page without it.

## Verification, 06/11/2026

Both checks run against the actual local frontend and Chromium's Paged.js render. Every API response is synthetic, and the prescription is seeded as a local draft. No real patient records are read or changed.

`scripts/diagnostics/cr23-one-page-browser.cjs` uses a fixture shaped like the 25/10/2026 example. It has 9 medicines, 10 investigations, Diagnosis, Chief Complaints, History, Personal history, Procedures, Procedure Planned, Review Date and Follow-up.

| | Before | After |
| --- | --- | --- |
| Space-optimized pages | 2 | **1** |
| Space-optimized content height | 831 px | 658 px |
| Normal layout pages | 2 | 2 |
| Normal layout content height | 808 px | 808 px |

The script also checks the following:

- Each heading shares a line with its value.
- Text size matches the normal layout.
- Unticking the option restores the normal height and page count.

The normal-layout field positions recorded before and after the change are identical. Evidence is in `output/cr23-one-page/`.

`scripts/diagnostics/cr08-print-layout-browser.cjs` passes its short, long and empty scenarios. That covers long values wrapping under the value, empty fields printing nothing, and unticking restoring the stacked layout. The script now waits for Paged.js to finish rendering before its first measurement. Without that wait, the long scenario failed intermittently on unmodified `main` too.

The 185 frontend tests in `__tests__/visits` pass. The production TypeScript check (`tsconfig.build.json`) passes.

To reproduce, start the frontend on port 3000, then run `node scripts/diagnostics/cr23-one-page-browser.cjs`.
