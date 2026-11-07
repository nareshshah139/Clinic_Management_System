# Walk report: admin-users-reports-messaging STORY-009, "Month-end revenue review: the Revenue Report says ₹0 while the pharmacy took ₹3.4 lakh"

**Result: FAIL (worse than mapped).** The Revenue Report does not show ₹0. The API returns **HTTP 500** for every date range, and the page renders this as "No data available for the selected period". Payment Analytics and `/reports/dashboard` 500 for the same reason.

- **Persona:** ADMIN (`admin@clinic.test`).
- **Walked:** 2026-11-07, 1280x800.
- **Screenshots:** `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/admin-users-reports-messaging--STORY-009/`
- **Scripts:** `.../scripts/admin/story009.js`, `s9b.js`
- **Results:** `story009-results.json`

## Root cause of the 500

This was established by running the compiled `ReportsService` against the same database.

Every Prisma `groupBy(... _count: { id: true })` that is combined with the `invoice → patient.branchId` relation filter fails with Postgres **42702 `column reference "id" is ambiguous`**:

- `generateRevenueReport`, the `includePaymentBreakdown` groupBy (`backend/src/modules/reports/reports.service.ts:93-95`).
- `generatePaymentReport` (`:784-788`).
- `generateDashboard`, on `newPayment.groupBy` (`:851+`).

The backend logs these only as `http.request_completed status 500 server_error`, with no stack. The frontend client retries each 500 three times (`attempt: 1..3` with the same requestId).

Mapped defect 6 says these reports read a legacy `Payment` table that nothing writes. That remains true in code. It cannot be observed live, because the query fails before it can return ₹0.

## Steps

1. **Reports** (`step-01-reports-default.png`). "Reports & Analytics", the System Alerts strip (Overdue Invoices 0, Low Stock 0, Expiry Alerts 0, Pending Payments 0, Upcoming Appointments 3), six report cards with Revenue selected, then Date Range, Generate Report and Export.
   - `GET /reports/revenue?startDate=2026-10-08&endDate=2026-11-07` returned **500**, three times.
   - At 1280x800 the report output starts at **y≈951**, below the fold. Choosing a card or changing dates gives no visible change in the viewport (F-009-04).
   - Geometry: clean.
2. **Set 01-10-2026 to 31-10-2026.** Each date change fires a new request immediately, so "Generate Report" is never needed. The Quick Guide still says to click it.
3. **Read the results** (`step-03-october-revenue-full.png`, `step-03c-revenue-error-as-empty.png`). The card reads "Revenue Report · Report for 01 Oct 2026 to 31 Oct 2026" with an icon and **"No data available for the selected period"**. The response was a 500.
   - The mapped ₹0.00 cards with Total Revenue / GST / Net / Total Invoices: **REFUTED**. No cards render at all.
4. **Pharmacy Invoices cross-check** (`step-04-pharmacy-invoices.png`). `/dashboard/pharmacy/invoices` shows Total Invoices 0 and Total Amount ₹0.00 under the default "Today" filter. `GET /pharmacy/invoices?limit=100` reports `total: 0`. This DB has **no pharmacy invoices**, so the ₹3.4 lakh mismatch is **NOT REPRODUCIBLE** with the current seed.
5. **Doctor Performance** (`step-05-doctor-performance.png`). Returns 200: totalDoctors 2, `doctorMetrics: []`, department revenue 0. It renders below the fold.
6. **Payment Analytics** (`step-06-payment-analytics.png`). `GET /reports/payments` returned **500**, and the page shows the same "No data" empty state.
7. **Patient Analytics** (`step-07c-patient-analytics-body.png`, range 08 Oct to 07 Nov). Total Patients **11**, New Patients **0**, Returning **0**, Avg Age **32**, Gender F 5 / M 6.
   - **Avg Age:** the database mean of `patients.age` is **38.1**. The page computes 32 by multiplying bucket counts by each bucket's lower bound: (5×31 + 3×18 + 3×46)/11 = 31.5. Defect 21 is **CONFIRMED**.
   - **New 0 of 11:** all 11 patients were created today (12:15 UTC), and the end date `2026-11-07` parses as midnight UTC, which excludes them. With end = `2026-11-08`, the API returns `newPatients: 11`. Defect 9 (end date excludes the end day) is **CONFIRMED** for `createdAt` metrics.
   - The page shows Total ≠ New + Returning with no explanation.
8. **start = end = 31-10 / 07-11** (`step-08-start-equals-end-today.png`). For **Appointment Analytics**, start = end = today returns 7 appointments, and today to tomorrow returns 10. Appointment `date` is stored at midnight UTC, so the end day is **included**. Defect 9 is **REFUTED for appointment counts**.
   - **Variation, start after end** (`step-08b-start-after-end.png`): "Report for 07 Nov 2026 to 01 Oct 2026" with all zeros. There is no validation message. **CONFIRMED.**

**Also observed:** the System Alerts strip says Low Stock 0, while `GET /reports/inventory` returns `lowStockItems: 4` (auth-topic defect 10, **CONFIRMED**).

## Mobile spot-check (390x844, Reports, Revenue)

`mobile-check.png`: the alert strip reflows to 2 columns, but the "Upcoming Appointments" label wraps to 2 lines. The six report cards stack full width, so the report body sits roughly 5 screens down. Geometry is clean, with no overflow.

## Mapped defects checked live

| Topic defect | Live result |
|---|---|
| 5. Reports open to every role | **CONFIRMED** (STORY-005 matrix) |
| 6. Revenue/Doctor/Payment reports read a legacy table, so ₹0 | **SUPERSEDED.** Revenue and Payments return **500** (42702 ambiguous id), shown as "No data". Doctor report returns 200 with revenue 0. |
| 9. End date excludes the end day | **CONFIRMED** for Patient Analytics (`createdAt`); **REFUTED** for Appointment counts |
| 21. Avg Age wrong | **CONFIRMED** (32 shown vs 38.1 actual) |
| Story step 4: pharmacy ₹3.4 lakh vs report | **NOT REPRODUCIBLE** (0 pharmacy invoices in DB) |
| Variation: start after end gives empty results with no validation | **CONFIRMED** |
| Variation: API error swallowed into console | **CONFIRMED** ("Error generating report" in console; UI shows the empty state) |

## Flow log

- **Steps.** Ideal: 3. Actual: the goal cannot be reached. After 3 steps the revenue number is still unavailable, with no sign of why. The persona would conclude that October had no revenue.
- **Hesitation:** after every card click or date change, nothing visible changes. The output is about 150px below the fold, so I had to scroll each time.
- **Redundancy:**
  - System Alerts appear here, on the Dashboard card and in the header bell.
  - "Money" appears on four surfaces (Reports, Pharmacy Invoices, Dashboard statistics, Compliance), and none of them agree.
