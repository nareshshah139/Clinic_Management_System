# Walk report: auth-shell-navigation STORY-005, "Admin checks what each new hire will see in the sidebar"

**Result: FAIL.** The sidebar matches `sidebar.tsx` for every role. But it is the only access control in the frontend. Every role loads every page by URL, and several sidebar links lead to pages whose APIs return 403 for that same role.

- **Walked:** 2026-11-07, live app (frontend :3000, backend :4000), Playwright Chromium at 1280x800, deviceScaleFactor 1.
- **Screenshots:** `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/auth-shell-navigation--STORY-005/`. Each file is named `{role}-{page}.png`; there are 117 page shots plus the bell, variation and mobile shots.
- **Scripts:** `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/scripts/admin/matrix.js` and `bell.js`.
- **Raw data:** `.../scripts/admin/matrix-results.json` and `bell-results.json`.

## How the walk deviated from the story

- **Seeded accounts instead of new hires.** I used the seeded role accounts (`pharmacist@`, `nurse@`, `manager@`, `accountant@`, `labtech@`, `owner@`, `shravya@`, `reception@`, `admin@`) rather than creating Farhana, Swathi and Venkat. The Create User path is walked in admin-users-reports-messaging STORY-002, where I created Sowmya Reddy (NURSE).
- **Steps 14–16 skipped.** I did not change a seeded user's role (Venkat to Accountant and back), because other walkers share these accounts. The seeded ACCOUNTANT account covers the same check.
- **Step 9 not walked.** The nurse cancelling an appointment belongs to the appointments topic.
- **Login is rate-limited to 5 per minute per IP**, and all walkers share it. I hit 4 consecutive 429s on the first login and needed backoff retries for most roles (see F-005-14).

## Role × page matrix (live)

Every page was opened by typing its URL for each role. No page redirected or showed an access-denied screen for any role.

**Legend**

- **●** = link is in that role's sidebar.
- **○** = link is hidden, but the page loads in full by URL.
- **OK** = no 4xx/5xx responses.
- **403-empty** = the API returns 403, but the page shows zeros or an empty state with no error.
- **403-err** = the API returns 403 and the page shows a red error.
- **500** = server error, masked as an empty state.

| Page | ADMIN | OWNER | DOCTOR | RECEPTION | PHARMACIST | NURSE | MANAGER | ACCOUNTANT | LAB_TECH |
|---|---|---|---|---|---|---|---|---|---|
| Dashboard | ● OK | ● OK | ● OK (doctor panels) | ● OK | ● 403-empty (appts) | ● OK | ● 403-empty (appts) | ● 403-empty (appts) | ○ 403-empty (appts) |
| Patients | ● OK | ● OK | ● OK | ● OK | ○ OK, full CRUD and export | ● OK | ● OK | ○ OK | ○ OK |
| Appointments | ● OK | ● OK | ● OK | ● OK | ○ 403-err "Failed to load schedule" | ● OK, rooms 403 | ● **403-err "Failed to load schedule"** | ○ 403-err | ○ 403-err |
| Visits | ● OK | ● OK | ● OK | ○ OK | ○ OK | ● OK | ● OK | ○ OK | ○ OK |
| Procedures | ● OK | ● OK | ● OK | ○ OK | ○ OK | ○ OK | ● OK | ○ OK | ○ OK |
| Rooms | ● OK | ● OK | ● OK | ● OK | ○ 403-empty (0 rooms) | ● **403-empty (0 rooms)** | ● **403-empty (0 rooms)** | ○ 403-empty | ○ 403-empty |
| Pharmacy Desk | ● OK | ○ OK | ○ OK | ● **403** pharmacy/dashboard | ● **403** pharmacy/dashboard | ○ 403 | ○ 403 | ○ 403 | ○ 403 |
| Pharmacy Counter | ● OK | ○ OK | ○ OK | ● **403** | ● **403** | ○ 403 | ○ 403 | ○ 403 | ○ 403 |
| Pharmacy Billing | ● OK | ○ OK | ○ OK | ● **403** /drugs + dashboard | ● **403** /drugs + dashboard | ○ 403 | ○ 403 | ○ 403 | ○ 403 |
| Inventory | ● OK | ● OK | ● OK | ● OK | ● OK ("—" for Low stock and Expiring) | ○ OK | ● OK | ○ OK | ○ OK |
| Reports | ● **500** | ● **500** | ○ 500 | ○ 500 | ○ 500 | ○ 500 | ● **500** | ○ 500 | ○ 500 |
| Users | ● OK | ● OK | ○ OK, full action buttons | ○ OK | ○ OK | ○ OK | ● OK, writes 403 | ○ OK | ○ OK |
| Test Transcribe | ● OK (no app shell) | ● OK | ● OK | ○ OK | ○ OK | ○ OK | ○ OK | ○ OK | ○ OK |

**Sidebars observed** (each matches `frontend/src/components/layout/sidebar.tsx`):

- **ADMIN:** all 13 links.
- **OWNER:** all except the 3 Pharmacy Desk/Counter/Billing links.
- **DOCTOR:** Dashboard, Patients, Appointments, Visits, Procedures, Rooms, Inventory, Test Transcribe. No Pharmacy links.
- **RECEPTION:** Dashboard, Patients, Appointments, Rooms, the 3 Pharmacy links, Inventory. No Visits.
- **PHARMACIST:** Dashboard, the 3 Pharmacy links, Inventory.
- **NURSE:** Dashboard, Patients, Appointments, Visits, Rooms.
- **MANAGER:** Dashboard, Patients, Appointments, Visits, Procedures, Rooms, Inventory, Reports, Users.
- **ACCOUNTANT:** Dashboard only.
- **LAB_TECH:** empty. Only the logo and the footer "Lata LabTech / LAB_TECH" remain.

## Step by step

1. **Admin sidebar.** Matches the story exactly. The footer reads "Admin User / ADMIN".
   - Screenshot `admin-dash.png`: four stat cards, Admin Controls (Create Backup), System Alerts and Today's Appointments.
   - Geometry: 1 overflow spill. "System Status operational" spills 14px into its icon tile (F-005-10).
2. **Steps 2–3 (create users).** Substituted by STORY-002. The Create dialog works, but the Status select is ignored.
3. **Pharmacist** (`pharmacist-*.png`). The sidebar matches step 5, with no Patients link.
   - Pharmacy Desk, Counter and Billing all return 403 on `/pharmacy/dashboard`. Billing also returns 403 on `/drugs`. The orchestrator already proved this; it is re-observed here.
   - The Pharmacy Desk command center is visually broken for every role (F-005-13; `pharmacist-ph-desk.png`, `admin-ph-desk.png`). The stat tiles overlap ("Invoices" and "Stock" labels collide, "0 pending" runs into "0 low"), and "Manual Daily Entry" is squeezed into a 3-line column. The geometry audit reports 9 overflow spills.
4. **Step 7, pharmacist bell.** Shows "No notifications" (`bell-pharmacist.png`). The story's "Low stock / Expiring soon" items do not appear. Meanwhile `/reports/inventory` reports `lowStockItems: 4` and the System Alerts strip says Low Stock 0. Defect 10 is **CONFIRMED**: alerts count only items with stock ≤ 0.
5. **Step 8, nurse sidebar.** Matches.
   - Rooms is in her nav, but `GET /appointments/rooms` returns 403. The Rooms page shows "Total Rooms 0 / Available 0 / Occupied 0" with no error (`nurse-rooms.png`).
6. **Step 10, nurse bell.** Shows "4 upcoming appointments · Within 48 hours · View reports & alerts" (`bell-nurse.png`). This is the admin-summary mapping, linking to Reports, which her sidebar hides. The "overdue invoices" item is absent because there are no invoices in this DB. **PARTIALLY CONFIRMED.** LAB_TECH gets the same summary.
7. **Step 11, manager sidebar.** Matches.
   - Appointments is in the nav, but the page raises a red toast and inline "Failed to load schedule / Forbidden resource (Reference …)" (`manager-appts.png`).
   - The Rooms page is empty from a 403. The Dashboard says "No appointments scheduled for today" while 7 exist (a masked 403 on `/appointments?date=`).
8. **Steps 12–13.** Manager Reset password returns 403 and Edit returns 403. Both are **CONFIRMED** in STORY-011.
9. **Step 15, accountant.** The sidebar shows only Dashboard (**CONFIRMED**). The bell shows "No notifications". The story's "Pending ₹ / Overdue Invoice" items are **NOT REPRODUCED**, because there are no invoices in the DB.
   - Every other page still loads by URL, including Reports and the full Users list.
10. **Step 17.** The doctor has no Pharmacy links and Reception has no Visits: **CONFIRMED**.
    - The doctor's bell (`bell-shravya.png`) lists "UXW Nurse81617 on 08 Nov 2026", a walk-in I booked with **Dr. Praneeta** during STORY-212. This shows doctor notifications are not scoped to the signed-in doctor. Defect 5 is **CONFIRMED** live.
11. **OWNER variation.** **CONFIRMED.**
12. **LAB_TECH variation.** **CONFIRMED** (`labtech-dash.png`): empty sidebar, landing on `/dashboard`. It shows admin stat cards ("Total Users 12 / Active Users 12"), the header search and the bell.
13. **Slow `/auth/me` variation.** Delayed by 6s via route interception, as NURSE. The sidebar shows all 13 items with the footer "Loading… / Unknown Role" (`var-authme-slow-nurse.png`). **CONFIRMED.**
14. **`/auth/me` returns 502.** The sidebar keeps every item, and the header and footer read "Unknown User / Unknown Role". No retry is offered (`var-authme-502-nurse.png`). Defect 19 is **CONFIRMED**.
15. **404.** `/dashboard/does-not-exist` renders Next's bare "404 This page could not be found." with no sidebar, header or Log out (`var-404.png`). Defect 23 is **CONFIRMED**.
16. **Mobile spot-check** (390x844, admin dashboard; `mobile-check.png`).
    - Only a hamburger and "ClinicMS" remain. There is no search, bell, Branded switch or settings. Defect 15 is **CONFIRMED**.
    - The stat cards stack cleanly. Geometry is clean: no overflow, no wrapped controls.

## Mapped defects (auth-shell-navigation topic) checked live

| # | Claim | Live result |
|---|---|---|
| 5 | Doctor notifications not scoped | **CONFIRMED.** Praneeta's walk-in shows in Shravya's bell. |
| 8 | Admin stat cards shown to every role; Total = Active | **CONFIRMED.** 12/12 for LAB_TECH, NURSE and others; 10/10 earlier for admin. |
| 9 | "All systems operational" is fake and always shown | **CONFIRMED.** Shown for every role, including when `/auth/me` failed. |
| 10 | Low-stock alert counts only stock ≤ 0 | **CONFIRMED.** Alerts say Low Stock 0; the inventory report says 4. |
| 15 | Mobile hides the header | **CONFIRMED.** |
| 17 | MANAGER shown Users actions the backend refuses | **CONFIRMED** (STORY-011). |
| 18 | LAB_TECH empty sidebar but full search and pages | **CONFIRMED**, and it goes further: every page loads by URL. |
| 19 | Unknown role shows full nav, no retry | **CONFIRMED.** |
| 23 | No 404 / error boundary; 404 leaves the shell | **CONFIRMED.** |
| Story step 7 | Pharmacist bell shows Low stock / Expiring | **REFUTED** on current data: "No notifications". |

## Geometry audit (admin, one per distinct page)

| Page | Result |
|---|---|
| Dashboard | 1 spill (System Status value, 14px) |
| Patients | Clean apart from natural button widths |
| Appointments | Clean |
| Visits | Clean |
| Procedures | 4 wrapped device buttons ("Endymed Pro Max", "Fotona Starwalker", "Soprano Platinum LHR", "Hydrafacial") |
| Rooms | Clean (legend chip widths only) |
| Pharmacy Desk | **9 spills** in the command-center tiles |
| Pharmacy Counter | 3 spills (Queue / Exceptions / Ready-Paid tiles, 6–8px) |
| Pharmacy Billing | Clean (totals rows only) |
| Inventory | Clean |
| Reports | Clean |
| Users | Clean |
| Test Transcribe | Clean, but renders outside the app shell |

There is no page-level horizontal overflow anywhere.

## Flow log

- **Steps.** The story's ideal is 4 steps per role (log out, sign in, scan, try one action). Actual: 4 per role plus login retries. 429 throttling forced 20s waits several times, so 9 roles took about 8 minutes of wall time. No "view as role" preview exists.
- **Hesitation points:**
  - Sidebar links that open broken pages: MANAGER → Appointments; NURSE/MANAGER → Rooms; RECEPTION → Pharmacy.
  - Empty states that actually hide 403s: Dashboard "No appointments scheduled for today"; Rooms "0".
  - The Reports "No data available" message hides a 500.
- **Cross-screen redundancy:**
  - System Alerts appear on the Dashboard card, the Reports strip and the header bell, each with different content.
  - User counts appear on the Dashboard cards (12) and the Users table (13+ rows); the two differ.
- **Re-entry:** none.
