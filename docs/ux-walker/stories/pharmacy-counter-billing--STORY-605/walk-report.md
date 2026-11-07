# Walk report: STORY-605, walk-in customer buys a sunscreen and an acne care package without a prescription

- **Topic**: pharmacy-counter-billing
- **Result**: **FAIL**. Neither persona can complete a walk-in sale.
- **Walked**: 2026-11-07 with Playwright Chromium at 1280x800
- **Personas**: pharmacist@clinic.test (PHARMACIST), then admin@clinic.test (ADMIN)
- **Patient**: Meera Krishnan (9876543219). I used her because "Priya Menon" is not seeded.
- **Screenshots**: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/pharmacy-counter-billing--STORY-605/`
- **Scripts**: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/scripts/pharmacy/s605*.js`

## Precondition setup

- **Package**: no packages existed. As ADMIN I created "Acne Control – 30 Day" (₹1,450, Dermatology, 6 × Melaglow-T) from Desk → Create Package (`setup-package-form.png`, `setup-package-created.png`). After a successful create the dialog **stayed open and filled** (D-6 confirmed). The package was saved with **isPublic = false** (D-4 confirmed).
- **Drug**: "La Shield SPF 50 Gel 60 g" **cannot be created** because of D-1 (see STORY-703). The only drug in the master is Melaglow-T Cream 15g, and it has no inventory batch.

## Pass 1: PHARMACIST

| Step | Screenshot | What the screen shows | Geometry / network |
|---|---|---|---|
| 1 Sidebar "Pharmacy Billing" | `p01-billing.png` | "Pharmacy Billing" appears twice. The prescription dispensing queue sits above the builder. The status badge wraps as "Pe ndi ng" and the "Load" button reads vertically. To reach the builder the user scrolls past every queued prescription. | `/drugs` 403 → "Failed to load initial data" |
| 2 Patient search "98765432", then "Meera" | `p02-patient-search.png` | The search works and Billing Name/Phone fill in. | n/a |
| 3 Doctor | n/a | The select shows only the placeholder. The doctor list is empty because of the failed `Promise.all`. | n/a |
| 4 Search Drugs "la shield", then "Melaglow" | `p03-drug-search-lashield.png`, `p04-drug-search-melaglow.png` | **There are no results and no message.** `GET /drugs?search=…` returns 403. To the pharmacist this looks the same as "drug not stocked". | 403 ×2 |
| 6 "Treatment Packages" tab | `p05-packages-tab.png` | "No packages available". The list was blanked by the failed initial load, and the package is private to the admin anyway. | n/a |
| End | `p06-items.png` | No item can be added, so the pharmacist cannot make a walk-in sale. | n/a |

## Pass 2: ADMIN

| Step | Screenshot | What the screen shows | Geometry |
|---|---|---|---|
| 1–2 Billing, then patient | `a01-billing.png`, `a02-patient-search.png` | Same as pass 1. The patient fills in. | n/a |
| 4 Search "la shield" | `a03-drug-search-lashield.png` | No result, because the drug cannot exist (D-1). | n/a |
| 4b Search "Melaglow", then "Add" | `a04-drug-search-melaglow.png` | The result card shows "Best Match", ₹289.00 and a category chip. **There is no stock indicator**, although the drug has no inventory. | n/a |
| 5 Card Tax % | `a06-items.png` | **Tax % defaults to 18** for the manually added drug (mapped #4 confirmed). | n/a |
| 6 Packages tab, then select the package | `a05-packages-tab.png` | The card shows struck-through ₹1734.00, ₹1450.00 and "16% OFF", with "1 items". The PACKAGE card is added, **also at Tax 18%**. | n/a |
| 7 Package Discount 5% | `a07-summary.png` | Subtotal ₹1739.00, Discount −₹72.50, Tax ₹299.97, Total ₹1966.47. | uneven label/value widths only (intentional) |
| 8 Print Preview, then "Confirm Invoice" | `a08-preview.png`, `a09-confirmed.png`, `a09b-confirm-error.png` | **Checkout returns 400.** The toast reads "Error Confirming Invoice — Insufficient non-expired stock for Melaglow-T Cream 15g. Required 7, available 0." The toast sits on top of the "Confirm Invoice" button in the Controls panel. Trying again with Melaglow alone gives the same error (Required 1). | n/a |
| 9 Print / banner | `a10-after-pdf.png`, `a11-after-close.png`, `a09c-after-error-close.png` | Nothing to print. The invoice stays DRAFT and no "Start a new invoice" banner appears. Two invoice numbers were used up (see F-603-12). | n/a |

## Mapped defects checked live

| Defect | Verdict |
|---|---|
| #4 Manually added drugs and packages default to 18% GST | **CONFIRMED** for both the drug and the package |
| #6 One failing load blanks the patient/doctor/drug/package lists | **CONFIRMED** for doctor and package. The patient search still worked because it queries `/patients` on its own. |
| Edge "doctor optional" | **CONFIRMED**. Preview is allowed with no doctor. |
| Edge "patient mandatory, no quick-add" | Not exercised, because a patient existed |
| D-4/D-6 (package creator) | **CONFIRMED** during setup |

## Mobile check

Not repeated. This story uses the same Billing screen as STORY-603. See `../pharmacy-counter-billing--STORY-603/mobile-check.png` and the Billing wrap findings there.

## Flow log

- Story path: 9 steps. Ideal path: 6.
- Actual path:
  - PHARMACIST: 5 steps, then a dead end. The drug search was silently empty.
  - ADMIN: 8 steps, ending in a stock error at the final confirm.
  - The sale is impossible for both personas.
- Hesitations:
  - (a) Scrolling past the queue to reach the builder, which is step 1's friction.
  - (b) An empty drug search with no "no results" or "no permission" text.
  - (c) The drug search offers a product with zero stock and an "Add" button, and the problem appears only at the final confirm.
- Redundancy: the billing heading is duplicated, and the queue appears both here and on the Counter.
- The root cause chain is D-1 (only one drug can exist) plus Billing reading the drug master (`/drugs`) instead of stocked inventory for OTC search.
