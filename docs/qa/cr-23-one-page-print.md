# CR-08 and CR-23: Space-optimized print on one page

With **Space-optimized layout** ticked, a prescription with 9 medicines and 10 investigations now prints on one page. Before this change, the same prescription spilled Follow-up and the signature onto a second page.

## Behavior

Each change below applies only when Space-optimized layout is ticked. The normal layout is unchanged.

- The patient line uses 4 px of vertical padding instead of 8 px.
- Every other printed block uses 2 px of vertical padding instead of 12 px. This covers Vitals, Diagnosis, Chief Complaints, History, Personal history, Family History, Rx, Investigations, Counseling, Procedures, Procedure Planned, custom sections, Review Date and Follow-up.
- Rx table rows and the table header use 2 px of vertical padding instead of 6 px. The gap under the **Rx** heading is 2 px instead of 8 px.
- The gap above the signature is 16 px instead of 40 px.
- Vitals, Counseling and custom sections print as **Label: value** on one line, the same as the other blocks. Long values wrap under the value. A custom section with a title and no content prints the title without a colon.
- Font sizes do not change.

CR-08's other blocks already printed inline on `main` before this change. That covers Diagnosis, Chief Complaints, History, Personal history, Investigations, Procedures, Procedure Planned, Review Date and Follow-up.

## Not included

- **Examination.** CR-08 lists Examination, but the print layout has no Examination block in either layout, so there is nothing to put inline. Printing examination findings would be a new feature.
- **Review Date and Follow-up on one line.** CR-08 marks this as optional. The target prescription fits on one page without it.
- **The server-generated PDF.** `POST /prescriptions/:id/pdf`, and sharing with `includePdf`, use a separate pdfkit layout in `backend/src/modules/prescriptions/prescriptions.service.ts`. That layout has no space-optimized mode and prints only medicines and a signature. This change does not touch it.

## Verification, 06/11/2026

Both checks run against the actual local frontend and Chromium's Paged.js render. Every API response is synthetic, and the prescription is seeded as a local draft. No real patient records are read or changed.

`scripts/diagnostics/cr23-one-page-browser.cjs` uses a fixture shaped like the 25/10/2026 example. It has 9 medicines, 10 investigations, Vitals, Diagnosis, Chief Complaints, History, Personal history, Procedures, Procedure Planned, a custom section, Review Date and Follow-up.

| | `main` | This change |
| --- | --- | --- |
| Space-optimized pages | 2 | **1** |
| Normal layout pages | 2 | 2 |

The script waits for the print preview to stop changing before each measurement. In every layout state, it checks that all 9 medicines and the signature rendered. It then checks the following:

- The optimized layout fits on one page.
- Each heading in the optimized layout shares a line with its value. That covers Vitals and the custom section as well as the CR-08 blocks.
- Each value's text size matches the normal layout.
- Unticking the option restores the normal height and page count.

Running the same script against `main` and against this change records identical normal-layout field positions (`output/cr23-one-page/checks-baseline.json` and `checks-after.json`). Counseling is not part of the fixture, because the local draft does not store it. Its markup follows the same pattern as Chief Complaints.

`scripts/diagnostics/cr08-print-layout-browser.cjs` passes its short, long and empty scenarios. That covers long values wrapping under the value, empty fields printing nothing, and unticking restoring the stacked layout. The script now waits for the print preview to stop changing before each measurement. Without that wait, it failed intermittently on unmodified `main` too.

The 185 frontend tests in `__tests__/visits` pass. The production TypeScript check (`tsconfig.build.json`) passes.

To reproduce, start the frontend on port 3000, then run `node scripts/diagnostics/cr23-one-page-browser.cjs`. Output goes to the system temp folder unless `CR23_OUTPUT` names a folder.
