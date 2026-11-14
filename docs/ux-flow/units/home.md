# Unit `home`: landing page, header, menu, sign-in

- Worktree `/home/user/wt/home`, branch `ux/home`.
- Read in full: `docs/ux-flow/journeys/j08.md`, `docs/ux-flow/journeys/j07.md`; in `docs/ux-flow/redundancy.md` the section "Dead and Broken Surfaces", proposed changes 1, 2 and 14, and naming table 4.4.
- Journeys you own: `j08` (baseline 4 actions), `j07` (baseline 3). Do not edit other journey scripts.
- Main files: `frontend/src/app/dashboard/page.tsx` and `page.test.tsx`, `frontend/src/components/dashboard/*`, `frontend/src/components/layout/{header,sidebar}.tsx`, `frontend/src/app/login/page.tsx`, `backend/src/modules/reports/reports.service.ts` (alerts queries only).

## Build
1. **A landing page per role at `/dashboard`**, replacing the four stat cards (Total Users, Active Users, Total Branches, System Status) and the "System Status" alert for everyone. Each role sees its own work above the fold at 1366x850, with one obvious primary action.
   - RECEPTION: two large buttons, "Book appointment" (to `/dashboard/appointments`) and "New patient" (to `/dashboard/patients?new=walkin`; the patients unit makes that URL open the registration dialog). Then "Today's appointments", next patient first: time, patient, status in plain words, and the existing bill chip opening the existing bill dialog (reuse `AppointmentBillDialog` and the calendar's billing chip logic; do not edit those files). Then "Bills to collect": patient name and balance per open clinic bill.
   - DOCTOR: "Today's patients" (this doctor's appointments, next first), each row with "Start visit" or "Continue visit" linking to the existing visits route (see how the calendar's START builds `/dashboard/visits?patientId=&appointmentId=&autoStart=true`, and the in-progress case with `visitId`). The existing patient search directly below, without the long default list pushing it down. Recent visits after that.
   - PHARMACIST: "Prescriptions waiting" with a "Bill" button per row (the same link the Counter queue uses to open a prefilled bill), a "New sale" button (to `/dashboard/pharmacy/sales/bill`), and "Low stock (N)" and "Expiring soon (N)" as links to the matching Inventory list.
   - OWNER, ADMIN, MANAGER: three figures, each a link: today's collection (clinic and pharmacy, split cash / UPI / card; reuse the Daily Collection endpoint) to Daily Collection; bills due with patient names and balances; requests waiting for approval to the Inventory approvals view. Then "Needs attention": low stock and expiring items by name. "Create Backup" and other admin controls move to the bottom.
   - NURSE: today's appointments. ACCOUNTANT: the collection figures. Every role gets a sane page.
   A card whose endpoint returns 403 for a role must not be requested for that role.
2. **Alert rows are real links with names and amounts.** Overdue and part-paid clinic bills show patient name and balance owed (not the bill total) and link to `/dashboard/appointments?date=<bill date, YYYY-MM-DD>` (the appointments unit makes that page read `date`). Low stock and expiry rows link to Inventory. Find the right `area` and `view` values in `frontend/src/components/inventory/InventoryWorkspace.tsx`; today's `?tab=low-stock` and `?tab=expiry` links are ignored by that page.
3. **One low-stock rule.** The alerts endpoint counts only stock at or below zero and labels it "below reorder level" (`reports.service.ts` around 1141-1160 and the summary near 636). Use the definition Inventory uses (`backend/src/modules/inventory/inventory-workspace.service.ts`, stock query) so the dashboard, the bell and Inventory show one number. Same for the expiry window and its label. Update affected backend specs honestly and add one that pins the shared rule.
4. **Header.** The patient search result opens `/dashboard/patients/<id>` (today it opens the list with the internal id in the search box and "No patients found", `header.tsx` near 424). Bell rows open what they name: doctor rows the visit for that patient, reception rows the calendar on that date, inventory rows the fixed links. Remove the bell's "View reports & alerts" link for roles that cannot open Reports. Hide the settings gear for roles whose dialog is empty. Remove the "Branded" switch from the header (it stays on the login page; it is a per-browser look in localStorage). Drop the users group from header search or link it without a dead parameter.
5. **Menu.** Remove "Test Transcribe" from the sidebar (leave the route). The owner decided menus otherwise stay exactly as they are: change no other entry or role list.
6. **Guides and tours stay** (owner decision). Keep "Start Tour" and the dashboard's Quick Guide button. Rewrite their content so every step and sentence matches the new landing page and header; a guide that names a control that no longer exists is a defect.
7. **Subtext** per the tables in j08 and j07 for the login page, dashboard and header, except guide and tour entries (item 6). One money format on the dashboard (`₹2,360.00`).

## Do not build
- Remembering the sign-in identifier on the device.
- A phone header with search and bell (deferred). The landing page must still read well at 390x844.
- Reports page, Daily Collection report, Inventory Today layout.

## Expected
- `j08`: 4 to 3. The receptionist's landing page shows today's schedule with booked patients by name, so the menu click goes.
- `j07`: 3 to 0 or 1. On the landing page the owner reads today's collection with its cash/UPI split, both seeded debtors by name with ₹1,450 and ₹2,360, and the low items by name. Keep all three assertions on seeded figures and names.
- Capture `/dashboard` for all four seeded roles at 1366x850 and 390x844 and look at every image before reporting.
