# Walk report: STORY-703, add a new depigmentation cream to the drug master

- **Topic**: pharmacy-desk-catalog-ai
- **Result**: **FAIL**. The first add works. Every later add returns HTTP 500 (D-1).
- **Walked**: 2026-11-07, Playwright Chromium at 1280x800 (DPR 1), plus a mobile check at 390x844
- **Personas**: pharmacist@clinic.test (Pooja Pharmacist, PHARMACIST) first, then admin@clinic.test (ADMIN)
- **Screenshots**: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/pharmacy-desk-catalog-ai--STORY-703/`
- **Scripts**: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/scripts/pharmacy/s703*.js`

Starting state: the `drugs` table was empty (0 rows) and inventory held 79 items.

## Pass 1: PHARMACIST

| Step | Action | Screenshot | What the screen shows | Geometry |
|---|---|---|---|---|
| 0 | Login | `p01-dashboard.png` | The pharmacist dashboard shows admin-style tiles ("Total Users 10", "Total Branches 1"). The "System Status: operational" value runs into its icon. `GET /appointments` returns 403. | 1 spill (System Status tile, 14px) |
| 1 | Sidebar "Pharmacy Desk" | `p02-desk.png` | The Desk command bar is broken at 1280px. The metric tiles Sales/Invoices/Stock/Packages are squeezed to about 55px each, and their labels collide ("Invoices Stock"). The values are hidden, the "0 pending"/"0 low" sub-labels spill out, and the subtitle is cut to "Queue, review, pick, bill, pay, d…". Partner Daily Sync squeezes "Manual Daily Entry" into an 85px column, so the heading wraps over 3 lines. `GET /pharmacy/dashboard` returns 403, so every metric silently reads 0. | 9 spills, up to 127px (`Manual Daily Entry` card 103px, `Add Item` 11px, metric tiles 14-23px) |
| 1b | Header "Drugs" | `p03-drugs.png` | The page shows "Drug Management" (h2) and then "Drug Database" (PageHeader): two titles for one page. All four stat cards read 0, and the list reads "No drugs found. Adjust your search or add a drug". `/drugs`, `/drugs/categories` and `/drugs/manufacturers` all return 403, and the user sees no error. The search placeholder is cut to "Search by name, co". | clean |
| 3 | "Add New Drug" | `p04-add-dialog.png` | The dialog has a two-column form. Every field is marked required with *. | n/a |
| 5 | "Add Drug" with Strength empty | `p05-missing-strength.png` | A native browser `alert()`: "Please fill required product master fields: Strength". It is not an inline error. | n/a |
| 6 | Fill Strength, then "Add Drug" | `p06-after-add.png` | The dialog closes and the list still reads "Drugs (0) / No drugs found". **`POST /drugs` returned success and the DB now holds "Melaglow-T Cream 15g" with `barcode=''`, `sku=''`**, but the reload is 403, so the pharmacist sees no new drug and gets no success message. They will likely try again. | n/a |

## Pass 2: ADMIN

| Step | Action | Screenshot | What the screen shows | Geometry |
|---|---|---|---|---|
| 1 | Desk, then "Drugs" | `a01-desk-admin.png`, `a02-drugs-admin.png` | The Desk metric strip has the same broken layout as for the pharmacist, so it is not caused by the 403. Drug Management lists the pharmacist's Melaglow record. | clean (drugs page) |
| Var. | Add the same name and manufacturer again | `a03-dup-filled.png`, `a03-dup-after.png` | 409, shown as a native alert: "A drug with the same name and manufacturer already exists (Reference: …)". The dialog stays open. **Variation confirmed.** | n/a |
| Edge | Add a second drug, "La Shield SPF 50 Gel 60g" (all fields valid, Barcode blank) | `a04-second-filled.png`, `a04-second-after.png` | **`POST /drugs` returns 500.** Native alert: "Internal server error (Reference: c69a5140-…)". The dialog stays open and the data is kept, but the message gives the user nothing to act on. | n/a |
| Edge | Add a third drug, "Clindac-A Gel 20g" | `a05-third-after.png` | 500 again, with the same alert. **D-1 confirmed:** no second drug can ever be added through this dialog. | n/a |
| 7 | Search "Melaglow" | `a06-search.png` | The card shows the badge "Dermatology – Depigmenting", Manufacturer, Pack Size, Composition, Strength, Price ₹289.00, Form and Additional. This matches the story. The "Search Drugs" label sits flush against the input's focus ring. | clean |
| 8 | Category filter dropdown | `a07-category-filter.png` | The options are "All categories" and "Dermatology – Depigmenting". This matches the story. | n/a |
| Mobile | 390x844 | `mobile-check.png` | The "Back" button label breaks one letter per line ("B / ac / k"). The page title also wraps. The drug card spills 26px. | 3 spills (drug card, 9-26px) |

## Mapped defects checked live

| Defect | Verdict | Evidence |
|---|---|---|
| D-1 (`barcode:""`/`sku:""` UNIQUE, so every add after the first returns 500) | **CONFIRMED** for Add. The DB shows the first row with `''`/`''`. The 2nd and 3rd adds both returned 500. Edit was not tested: only one row exists, so it cannot collide yet. | `a04-second-after.png`, `a05-third-after.png` |
| D-14 (wildcard RBAC: PHARMACIST gets 403 on drug list and Desk metrics) | **CONFIRMED** in the UI | `p02-desk.png`, `p03-drugs.png` |
| D-20 (Desk/Drug Management failures are silent) | **CONFIRMED**. The page shows 0 metrics and "No drugs found" with an "Add New Drug" CTA, and no error. | `p03-drugs.png` |
| Story claim "two headings for one page" | **CONFIRMED** | `p03-drugs.png` |
| D-4 (package is always private) / D-6 (create dialog stays open) | **CONFIRMED** while setting up STORY-605. The new package has `isPublic=false`, and the dialog stayed open after a successful create. | `../pharmacy-counter-billing--STORY-605/setup-package-created.png` |

## Downstream impact (seen in STORY-603 and STORY-605)

Because of D-1, the drug master can hold only one drug. Pharmacy Billing's "Individual Drugs" search and the "Substitute" flow read `/drugs`, so the counter can sell only Melaglow. That drug has no inventory batch, so checkout fails with "Insufficient non-expired stock". A walk-in OTC sale is impossible.

## Flow log

- Story path: 8 steps. Ideal path: 3 (open, add, save).
- Actual path, PHARMACIST: 6 steps, ending in a false empty state. The pharmacist cannot confirm the drug was saved, which invites a duplicate attempt (the second attempt would 409 or 500).
- Actual path, ADMIN: 3 steps for the first drug. A second drug is impossible after any number of retries.
- Hesitations:
  - (a) Desk "Drugs" is the only way in, because the sidebar has no Drug Management entry.
  - (b) After the pharmacist's save there is no toast, so I could not tell whether it saved.
  - (c) A 500 alert with only a reference ID leaves the user no next step.
- Redundancy: "Drug Management" and "Drug Database" are stacked titles. The drug count appears as Desk "Stock" (hidden at 1280) and again as "Total Drugs".
- Login was rate-limited (429) because other walkers ran in parallel. The login form shows the raw "ThrottlerException: Too Many Requests (Reference: …)" (`/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/debug/after.png`).
