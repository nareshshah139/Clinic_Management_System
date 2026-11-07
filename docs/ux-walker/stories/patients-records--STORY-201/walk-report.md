# STORY-201: Receptionist finds a returning patient by phone prefix. Walk report

**Result: PASS (goal reachable), with a HIGH layout defect.** 6 findings: 1 high, 2 medium, 3 low.
Persona: Riya Sharma (RECEPTION). The seed has no Lakshmi Prasanna Reddy, so the target was **Arjun Reddy, 9876543212** (prefix `987654321`). Playwright at 1280x800.
Screenshots: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/patients-records--STORY-201/`

## Steps

| # | Action | Actual | Screenshot | Geometry |
|---|--------|--------|------------|----------|
| 1 | Sidebar → Patients | "Patients Management" loads (the skeleton was not visible at capture). Three stacked headings. The search box is 158px wide with a truncated placeholder. **The table body looks empty in the first viewport** because every row is 783px tall (F-201-01, F-201-02, F-201-04). | step-1a-patients-loading.png, step-1-patients-list.png | `Clear Filters / Export CSV` widths differ (intentional). The row-height defect was measured by hand: all 11 rows are 783px, the Actions td is 96px wide, and the table is 1124px inside a 924px scroller. |
| 2 | Type `9` | "Enter at least 2 characters to search" and a "Did you mean" box with 8 phone chips stacked vertically, pushing the table down about 350px (F-201-03). | step-2-typed-9.png | n/a |
| 2b | Click chip `9876543219` (variation) | The box fills with the full number and the query runs. Matches the catalog. | var-did-you-mean-chip.png | n/a |
| 3 | Type `987654321` | All 10 seeded 98765-432xx patients returned (prefix match works). The rows are still off-screen. | step-3-prefix-results.png | as step 1 |
| 3b | Click "ID: bw0xhc61" chip | The row does not open (stopPropagation works). No "Copied" toast appeared in headless Chromium, probably because clipboard permission is denied. **Unverified.** The screenshot shows the 783px row with "MAL E" and the letter-stacked Actions buttons. | var-id-copy.png, finding-actions-column.png | n/a |
| 4 | Click the Arjun row | `/dashboard/patients/<id>` shows "Arjun Reddy", ID / Code / M / 35 yrs. Matches the catalog. | step-4-detail.png | as STORY-002 step 3 |

## Variations and edge cases
- Code prefix `tr` returns Arjun (TRYAT). Email fragment `@patient` returns John Doe. No match `zzqx` gives "No patients found / Adjust your search or filters to find a patient." All match the catalog. `var-search-code.png`, `var-search-email.png`, `var-search-nomatch.png`
- Browser Back from detail: the list comes back **with the search cleared** (F-201-05). `var-back-to-list.png`
- Catalog claim "newest registrations first": **refuted**. The list renders sorted by "Patient ▲" (alphabetical, client-side).

## Mobile spot-check (390x844)
`mobile-check.png`: the search box is full width and the filters stack. That is fine. The table is below the fold. `mobile-check-detail.png`: the detail page is OK apart from the clipped tracker (STORY-002 F-002-08). Geometry: no page overflow.

## Mapped defects touched
- CONFIRMED: patients #8 (global-search dead link, see STORY-007), #5 (no Last Visit column even though the patient has history). Redundancy note: "two headings" confirmed (three, in fact).
- CONSISTENT, NOT FULLY PROVEN: patients #4 (Consultation "—" on every row; no ONLINE patient was available to prove the drop).

## Flow log
- Ideal 3 steps (open Patients, type prefix, click row). Actual 3 actions, plus **about 3 extra scrolls**, because a 783px row means the matching patient is never in the first viewport after searching. On a 1280x800 laptop she has to scroll before she can see any result.
- Hesitations: the first keystroke opened the tall "Did you mean" stack, which moved the table. Six action buttons in a row with labels broken letter by letter are hard to read ("A rc hi v e").
- Re-entry: the search is lost on Back, so she retypes it.
- Redundancy: demographics appear in the list row, the detail header badges, the summary card and the Info tab (as mapped).
