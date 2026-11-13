# App Discovery: ClinicMS (Clinic Management System, dermatology clinic, Hyderabad)

All paths below are relative to `/home/user/Clinic_Management_System`. Frontend paths are under `frontend/src/` and abbreviated `FE/`; backend paths are under `backend/src/` and abbreviated `BE/`. Everything here was read from source, not from the repo-root `*.md` summaries.

## Application Type

Web app (staff-only, desktop first, with a phone-width drawer menu). Single branch-scoped clinic back office: appointments, doctor visits and prescriptions, an in-house pharmacy (counter billing plus stock and purchasing), clinic fee billing, reports, and admin. There is no patient-facing UI even though `PATIENT` exists as a role (`PATIENT` and `LAB_TECH` have empty permission lists in `BE/shared/access/role-permissions.ts` and no sidebar entries).

## Tech Stack

- Frontend: Next.js 15 App Router, React 19, TypeScript, Tailwind 4 plus Radix UI primitives (`FE/components/ui/*`), react-hook-form + zod, recharts (reports), intro.js (guided tours), html2pdf.js / pagedjs / jspdf / react-pdf (prescription and invoice PDF and print preview), `@openpanel/sdk` (analytics, `FE/lib/analytics/*`), next-intl is a dependency. Data access is one hand-written `apiClient` (`FE/lib/api.ts`); there is no global store, only `DashboardUserProvider` context (`FE/components/layout/dashboard-user-context.tsx`) and URL query state.
- Backend: NestJS 11, Prisma 6 on a relational DB (`backend/prisma/schema.prisma`, about 2,760 lines), JWT via passport-jwt, `ioredis`, `@nestjs/schedule` (crons), pdfkit, sharp, nodemailer, googleapis. Swagger at `/docs`.
- Shared package `shared-types` (npm workspace).
- Auth: `POST /auth/login` sets an HttpOnly `auth_token` cookie; `FE/middleware.ts` redirects any `/dashboard/*` request without the cookie to `/login?next=<path+query>`. Authorization is `RolesGuard` (`@Roles`) and `PermissionsGuard`; `RolesGuard` lets OWNER, ADMIN and DOCTOR pass every `@Roles()` list (`BE/shared/guards/roles.guard.ts`). Forgot-password is admin-issued reset codes (no email self-service).
- Conditional UI is purely by role (sidebar filter, per-component role arrays) plus per-doctor settings; there are no feature flags. Guided tours: `ReceptionistTour` (header, RECEPTION only) and `DoctorTour` (visit form "Keyboard Shortcuts"/tour).

## User Roles

Enum `UserRole`: OWNER, ADMIN, DOCTOR, NURSE, RECEPTION, ACCOUNTANT, PHARMACIST, LAB_TECH, MANAGER, PATIENT. The Users form only offers Admin, Doctor, Nurse, Receptionist, Manager, Pharmacist (`FE/components/users/UsersManagement.tsx` lines ~456-463 and ~555-562); OWNER and ACCOUNTANT cannot be created in the UI.

- OWNER: wildcard permissions; sees every sidebar entry except "Pharmacy Desk" and "Pharmacy Counter". Dashboard "Admin Controls" (Create Backup) for OWNER and ADMIN.
- ADMIN: wildcard; sees all 16 sidebar entries.
- MANAGER: appointments, billing, inventory, pharmacy, reports (all), users read/update. Sidebar has no Rooms, Sales, Pharmacy Desk or Pharmacy Counter. Cannot use the clinical sections of the visit form (the form's role table has no MANAGER, so only Overview and History tabs show).
- DOCTOR: appointments read/update, visits all, pharmacy drug read, invoice read, approves price/stock edits and new-item requests; in practice `RolesGuard` also lets DOCTOR through every `@Roles()` route (so they can bill pharmacy sales and use billing). Owns per-doctor settings (signature, letterhead, working hours, overbooking, WhatsApp) in header "My Settings".
- NURSE: appointments create/read/update/reschedule, rooms read. Sidebar: Dashboard, Patients, Appointments, Visits, Rooms. In the visit form gets Vitals and Photos only (role table `NURSE: vitals, photos, basic-assessment, complaints`).
- RECEPTION: appointments including delete, clinic billing create/read/take payment/confirm, full inventory permission set (items, POs, suppliers, transactions). Sidebar: Dashboard, Patients, Appointments, Rooms, Pharmacy Desk, Pharmacy Counter, Inventory. No Visits entry and no Sales entry. Gets the `ReceptionistTour` button in the header. On Pharmacy Desk the `sells` flag is false for RECEPTION, so the dashboard metrics, Invoices, Drugs and "New sale" are hidden.
- PHARMACIST: inventory, pharmacy invoices, purchase invoices (create, review, commit stock), purchase ledger, compliance, pharmacy dashboard. Sidebar: Dashboard, Daily Collection, Pharmacy Desk, Pharmacy Counter, Sales, Inventory, Pharmacy Report.
- ACCOUNTANT: billing read, revenue, statistics, pharmacy compliance read. Sidebar: Dashboard, Daily Collection, Pharmacy Report only. Can record supplier payments (`LEDGER_WRITER_ROLES` in `FE/components/inventory/purchase/purchase-register-model.ts`).
- LAB_TECH, PATIENT: no permissions, no sidebar items (an empty menu).
- "THERAPIST" exists only in frontend code (`FE/app/dashboard/visits/page.tsx` role descriptions, `FE/components/visits/MedicalVisitForm.tsx` role table) and not in the Prisma enum; it cannot occur.

## Feature Map

### 1. Sign-in, shell and cross-cutting UI
Owner: `FE/app/login/page.tsx`, `FE/app/reset-password/page.tsx`, `FE/components/layout/{dashboard-layout,sidebar,header}.tsx`, `FE/components/auth/AuthCard.tsx`.
- Login page card "ClinicMS Login": fields "Phone or email" and "Password", button "Sign in" (shows "Signing in…"), "Branded" switch (top right, same switch repeats in the dashboard header), link "enter your reset code".
- Reset page (AuthCard title "Set a new password"): "Reset code" (placeholder `ABCD-EFGH`), "New password", "Confirm new password", link "Back to sign in".
- Header (desktop only; phone shows a top bar with "Open clinic navigation" menu button and "ClinicMS"): global search box "Search patients, appointments, doctors..." (results link to `/dashboard/patients?search=`, `/dashboard/appointments`, `/dashboard/users?search=`); "Branded" switch; "Notifications" bell (role-shaped list, polls `/reports/alerts` every 60 s); settings gear "Open settings" opens dialog "My Settings" (doctor-only content: Doctor signature, Doctor letterhead, Doctor availability, "Send WhatsApp on appointment creation", "Use WhatsApp Template", buttons "Close"/"Save"). Non-doctors get an empty dialog with only Close and Save.
- Sidebar footer: avatar, name, role, "Log out".
- Quick guides: `FE/components/common/QuickGuide.tsx` buttons on Dashboard ("Dashboard Guide"), Patients ("Patients Management Guide"), Users ("Users Management Guide"), Rooms ("Room Management Guide"), Reports, Visits ("Visit Documentation Guide"), Pharmacy ("Pharmacy Management Guide"), Procedures, and Appointments ("Quick Guide" dialog).

### 2. Dashboard (`/dashboard`)
Owner: `FE/app/dashboard/page.tsx`; doctor panels `FE/components/dashboard/DoctorPatientPanels.tsx`.
- Page title "Dashboard" ("Welcome back! Here's what's happening at your clinic today.").
- Doctor only: cards "Recent Visits" (link to the visit) and "My Patients" (link to patient detail, Previous/Next paging).
- Stat cards "Total Users", "Active Users", "Total Branches", "System Status".
- OWNER/ADMIN only: card "Admin Controls" with "Database Backup" and button "Create Backup" (alert box with timestamp, folder, size).
- Card "System Alerts" (Overdue Invoices, Low Stock Alert, Expiring Items, Pending Payments, always "System Status: All systems operational"; button "Refresh dashboard" when empty).
- Card "Today's Appointments" (first 5, sorted by slot; button "View All Appointments") for roles in `APPOINTMENT_READ_ROLES`.
- Failure states: "Couldn't load clinic alerts" / "Couldn't load today's appointments" with "Try again".

### 3. Appointments (`/dashboard/appointments`)
Owner: `FE/app/dashboard/appointments/page.tsx` (page title "Appointments", filters Doctor, Date, button "Quick Guide"), tabs "Calendar" and "Slots".
- Tab "Calendar": `FE/components/appointments/AppointmentsCalendar.tsx` card "Doctor Calendar" with `DoctorDayCalendar.tsx` + `CalendarColumn.tsx`. Two columns from `appointment-calendars.ts`: "Scheduled" ("Booked ahead. Call to confirm.") and "Confirmed" ("Confirmed, walk-ins and visits."). Filters Visit Type (All Types / OPD Consultation / Procedure / Telemedicine), Room, Patient search "Search patient by name/phone", Grid (10-60 min). "Sync with Google Calendar" / "Disconnect" (Google OAuth, callback `FE/app/dashboard/appointments/google-callback/page.tsx`). Click a free time to open dialog "Book Appointment" (`AppointmentBookingDialog.tsx`: Duration, "Appointment Type", Procedure Name, room cards Available/Occupied, buttons "Cancel", "Confirm Booking"). Row hover buttons "INFO", "RESCHED", "START"/"CONT". Row bill chip ("₹500 · Paid", "₹200 due", "Not billed") opens the Bill dialog. Click a row for dialog "Appointment Details" (Date, Slot, Calendar, Patient, Phone, Email, Age, Sex, Bill type, Bill with "Open bill"/"Create bill"/"View bill", Type, Procedure, Room, Status; buttons "Close", "Start Visit", "Reschedule", "Cancel Appointment", and "Confirm" or "Move to Scheduled"). Cancel dialog "Cancel Appointment" with "Keep Appointment"/"Yes, Cancel Appointment". Overbook prompt "Overbook this slot?" with "Cancel"/"Book anyway" (`useOverbookConfirm.tsx`). Drag across tiles to move/reschedule.
- Tab "Slots": `AppointmentScheduler.tsx` card "Appointment Scheduler" ("Select a doctor and date to view available appointment slots"), its own Doctor, Date, Visit Type, Room, Duration and patient search, free-slot grid, same booking dialog and reschedule flow.
- Patient picker inside both tabs: results list plus "+ Add "<name>" as a new patient" opening dialog "Add New Patient" (`PatientQuickCreateDialog.tsx`: first/last name, age, gender, phone, ABHA, consultation type; "Cancel"/create).
- Deep link `?patientId=` pre-selects the patient (`usePrefilledPatient.ts`), used by "Book appointment" on patient detail and "Book" in the progress tracker.
- Appointment bill dialog `AppointmentBillDialog.tsx`: title "Bill for <patient>"; sections "Record payment" (Amount received, Payment mode picker, "Record ₹x payment"), "Create bill"/"Add another bill" (Bill line, Fee, Paid now, "Create bill", "Create bill and record ₹x"), link "Set fees" to the Fee list.
- No UI action sets CHECKED_IN, NO_SHOW or COMPLETED; "Checked in", "No-show" are only badges. Opening "Start Visit" sets the appointment IN_PROGRESS on the server (`BE/modules/visits/visits.service.ts` line ~187).

### 4. Visits and prescriptions (`/dashboard/visits`)
Owner: `FE/app/dashboard/visits/page.tsx` (setup screen) and `FE/components/visits/MedicalVisitForm.tsx` (form, 2.7k lines), `FE/components/visits/PrescriptionBuilder.tsx` (7k lines). `/dashboard/prescriptions` only redirects here.
- Entry URLs: `?patientId=&appointmentId=&autoStart=true` (from calendar START, patient list Start Visit, patient detail), `?visitId=&patientId=` (resume), `?appointmentId=` (header doctor notification).
- Setup screen: role banner (Therapist/Nurse/Doctor/Reception descriptions), card "Start New Visit": "Select Patient" ("Search name, phone, or email"), "Select Doctor" ("Choose a doctor..."), then tabs "Ready to Start" (button "Start Visit Documentation") and "Patient History" (timeline). Card "Available Features" is a static role blurb. "Setup Required" card if no patients or doctors exist.
- Visit page header: "Visit Documentation" (badge "From Appointment"), `PatientProgressTracker` (buttons "Continue"/"Start Visit", "Book", "View"/"Prescribe", "Bill"/"Invoices"), "Visit Documentation Guide", "Back to Calendar", "Back to Setup", sticky `VisitIdentityBar`.
- Form tabs (role-dependent): "Overview" (cards Visit Information, Progress Summary, Quick Actions "Record Vitals"/"Capture Photos"), "Vitals" (BP, pulse, temp, weight, height, BMI, RR, pain), "Photos" (`VisitPhotos.tsx`, "Before / After Photos", compare mode, dialog "Tag photo positions"), "Prescription" (doctor only; the builder), "Lab Tests" (card "Lab Tests (Investigations)", autofill from photo, "Compare with previous visit"), "Customization" (print letterhead, offsets), "History" (visit timeline, `PatientHistoryVisitCard`). Dialog "Keyboard Shortcuts". Footer: "Save Draft" and, for doctors, "Complete Visit" (needs 80% progress; the sentence "Completion requires 80% progress" explains it). Drafts autosave to localStorage; save conflicts offer discard-and-reload.
- PrescriptionBuilder sections: "Clinical Details & Vitals", "Chief Complaints", "Diagnosis", "Patient History", "On Examination" (dermatology skin type, morphology, distribution), "Treatment" (medicine rows "Add Row", "+ Add to Drug Database", dialog "Add Drug to Database"), "Procedures", "Basic Information", custom sections ("Add Custom Section"), templates (dialogs "Create New Template", "Save as Template", "Save Fields as Template", "Delete template", Undo/Redo), voice dictation (`FE/hooks/useSpeechToTextRecorder.ts`), translate-on-print language switch.
- Output actions: button "Print Preview" opens full-screen dialog "Prescription Preview" (Paper and zoom, margins, "Show signature", buttons "Save Prescription", "Close", "Interactions" opens dialog "Interaction Summary", "Email", "PDF via WhatsApp", "High contrast", "Print", "Download PDF"). Outside the preview: "Create Prescription" (or "Save visit first") and "Go to Pharmacy" which opens dialog "Go to Pharmacy?" ("Stay Here" / "Yes, go to Pharmacy") and navigates to a prefilled Sales bill.
- Lab-test catalogue maintenance: `ClinicInvestigations.tsx` (`ManageClinicInvestigations`) inside the builder.

### 5. Patients (`/dashboard/patients`, `/dashboard/patients/[id]`)
Owner: `FE/components/patients/PatientsManagement.tsx` (list, page title "Patients Management"), `FE/app/dashboard/patients/[id]/page.tsx` (detail).
- List: search "Search by name, phone, ABHA, or email (min 2 chars)", filters Gender, Consultation Type, Date Range, per-page; buttons "Clear Filters", "Export CSV", "New Patient" (dialog "Create Patient"/"Edit Patient": names, age, gender, phone, email, ABHA, Emergency Contact, consultation type Online/Offline, primary doctor "Automatic"/"Not assigned", referral source, "Patient Type" Non walk-in or Walk-in, "Doctor (for walk-in)", "Appointment Type (walk-in)", room; saving a walk-in auto-books the next free slot). Row buttons "View", "Start Visit", "More" (Edit, Archive, Link/Unlink portal, WhatsApp). Dialog "Link Portal Access" ("Existing portal account email").
- Detail: header with name, ID/Code/ABHA/gender/age badges; buttons "Resume last visit", "Start visit", "Book appointment", "Back to Patients"; summary cells Primary contact, Last visit, Next appointment; tabs "Info" (card "Patient Information"), "History" (card "Patient History", doctor and date filters, collapsible dates, "Refresh"), "Uploads" (`VisitPhotos`/`PatientPhotoArchive`).
- Backend-only (no UI): patient merge and dedup (`BE/modules/patients/patient-deduplication.service.ts`, cron every 6 h), appointment reminders endpoint.

### 6. Pharmacy Desk and Counter (`/dashboard/pharmacy`)
Owner: `FE/app/dashboard/pharmacy/pharmacy-workspace.tsx`; sidebar entries "Pharmacy Desk" (`?section=desk`) and "Pharmacy Counter" (`?section=counter`); legacy `?section=billing|invoices|payments` and any prefill params redirect to the Sales bill page (`FE/components/pharmacy/sales/sales-bill-model.ts`).
- Desk: title "Pharmacy Desk" ("Command center", "Queue, review, pick, bill, pay, dispense."), metric strips Sales, Invoices, Stock, Packages (only `sells` roles: OWNER, ADMIN, DOCTOR, PHARMACIST), buttons "Refresh", "Invoices" (to `/dashboard/pharmacy/invoices`), "Drugs" (to `/dashboard/pharmacy/drugs`), quick actions "Pharmacy Counter", "New sale", "Inventory Control"; AI assistant launcher/dock (`FE/components/pharmacy/AgenticPharmacyDock.tsx`, input "Ask the pharmacy assistant about pharmacy operations."); `PartnerDailySync.tsx` (cards "Manual Daily Entry", "Missing Entries", "Recent Submissions", partner-pharmacy daily sales); `PackagesPanel` card "Treatment Packages" with "Create Package" (dialog "Create Treatment Package", `PharmacyPackageCreator.tsx`) and `PackageBrowser.tsx`.
- Counter: title "Pharmacy Counter"; `PharmacyCounterCockpit.tsx` panels "Queue" (filter chips All/Queue/Review/Exceptions/Done; empty-state buttons "Walk-in bill", "Pull visits", "Inventory control"), "Active Dispense" (buttons "Pause", "Ready", "Paid", "Open bill"; "Start billing"), "Pick + Pay" (checklist Validate, Pick earliest-expiry batch, Barcode, GST bill, Payment, Dispense; "Pick Assist" shelf/batch view); below it section "Prescription Queue" (`PrescriptionDispensingQueue.tsx`, status filters All/Pending/Partial/Dispensed/Expired, row button "Bill").
- Pharmacy Invoices page (`FE/app/dashboard/pharmacy/invoices/page.tsx`, `PharmacyInvoiceList.tsx`, title "Pharmacy Invoices", card "Invoices (n)", row icon buttons "View Invoice", "Download Invoice", "Continue in Sales", "Delete Invoice"). Drug Database page (`FE/app/dashboard/pharmacy/drugs/page.tsx`, `DrugManagement.tsx`, title "Drug Database"/"Drug Management", card "Drugs (n)", add-drug dialog).

### 7. Sales (pharmacy counter billing) (`/dashboard/pharmacy/sales`, `/dashboard/pharmacy/sales/bill`)
Owner: `FE/app/dashboard/pharmacy/sales/page.tsx`, `.../sales/bill/page.tsx`, `FE/components/pharmacy/sales/*`, `FE/components/pharmacy/PharmacyInvoiceBuilderFixed.tsx` (3.3k lines). `/dashboard/billing` redirects to the sales bill page.
- Register (`SalesHeader` title "Sales", tabs "Sales" and "Returns", button "New sale"/"New return"): search by Bill No / Patient / Mobile, filters payment mode (Cash, UPI, Card, Net banking, Wallet, Insurance, "Due (unpaid)", Other), state (Final/Draft/Cancelled), source (Pharmacy bills/Counter sales), entry by; "Clear filters"; row opens the bill or draft.
- New bill (`NewBill` in bill page): the `PrescriptionDispensingQueue` again (row button "Load") above region "Prescription bill". Builder card header "New bill" or badge "Draft ... not final"; cards "Add Items to Invoice" ("Search Drugs", also packages), "Invoice Items" (Quantity, Unit Price, Discount %, Tax %, Dosage, Frequency, Duration, Instructions), "Patient" selection ("Patient *", "Doctor"), "Billing Name *", "Phone *", "Payment Method" (Cash/Card/UPI/Net Banking), "Notes", "Invoice Summary" with bill-discount input. Buttons "Print Preview" (then dialog "Pharmacy Invoice Preview": "Copy Type", "Preview Zoom", "Close", "Confirm & Print" or "Print", "Download PDF"), "Save draft", "Discard draft" (dialog "Discard this draft?").
- Finished bill view (`FinishedBillView.tsx`): title "Bill <number>" with status badge (Paid / Due / Refund due / Cancelled / Revised), buttons "Print", "Edit discount" (dialog "Edit discount on …", reason required), "Record refund ₹x" (dialog "Record refund of …"); cards "Payments", "Discount changes".
- Stock effect: finishing a bill posts to `/pharmacy/invoices/checkout`; the dispense-task statuses (Paused/Ready/Paid) are tracked separately in the Counter cockpit (`/pharmacy/dispense-tasks`).

### 8. Clinic fee billing (appointment bills) and fee list
Owners: `FE/components/appointments/AppointmentBillDialog.tsx`, `FE/components/appointments/appointment-billing-view.ts`, `FE/app/dashboard/fees/page.tsx` + `FE/components/billing/ClinicFeeList.tsx`. Backend `BE/modules/billing/{billing.controller,clinic-fees.controller}.ts`.
- Fee list page (sidebar "Fee list", OWNER/ADMIN only; others see "Only an admin can change the fee list."): one row per bill type (First consultation, Review, Procedure) with "₹" field (placeholder "Not set") and "Save"/"Clear fee"; shows who changed it and when; version-conflict message.
- Consultation and procedure fees are billed without GST. Payment modes via `FE/lib/clinic-payment-modes.ts`.
- `FE/components/billing/BillingManagement.tsx` (1.5k lines) is not imported anywhere (dead; `/dashboard/billing` redirects to the pharmacy Sales bill page).

### 9. Inventory workspace (`/dashboard/inventory`)
Owner: `FE/components/inventory/InventoryWorkspace.tsx` (all state in query `?area=&view=`); title "Inventory" ("Receive, review and manage pharmacy stock."), refresh button "Refresh inventory". Area buttons: Today, Purchases, Stock, Sales, Reorder. Sub-tasks per area (labels from `menus` in that file):
- Today: cards "What needs attention" (Price/stock edits awaiting approval, Overdue supplier bills, Low stock, Expiring in the next 3 months, Purchase invoices to review, Original files awaiting intake, Stock count due today, Counts awaiting your approval, Batches not counted this cycle, Credit notes awaited, Orders awaiting receipt); buttons "Scan or enter bill", "Find or correct stock".
- Purchases: "Purchase bills" (`purchase/PurchaseBills.tsx`, tabs "Purchase" and "Returns", buttons "New purchase"/"New return", menu "More" with "Export to Excel", "Payments & dues", "Suppliers", row action "Mark paid"), "Scan or enter bill" (`pharmacy/PurchaseInvoiceWorkbench.tsx`, 5.8k lines: "Upload invoice PDF or image", OCR review, "Review checks", "Mark Reviewed", "Add stock" / "Post bill", "Save draft", "Reject invoice"; list "Saved uploads"), "Import CSV" and "Gmail intake" (`AlternateInvoiceIntake.tsx`), "Suppliers" (`SupplierWorkspace`), "Terms of Trade" (`pharmacy/TradeTermsWorkspace.tsx`), "Payments & dues" (`pharmacy/PurchaseLedger.tsx`), "Credits & vouchers" (`SupplierCreditPanel.tsx`; dialogs `RecordCreditNoteDialog`, `SetOffCreditDialog`, `MarkPaidDialog`), "Inward challans", "Gate passes", "Purchase costs" (`pharmacy/DistributorAnalytics.tsx`).
- Stock: "Stock list" (`WorkspaceStock.tsx`, add item via `AddInventoryItemDialog.tsx` title "Add Inventory Item", non-approvers get "Sent to doctor for approval"; `StockEditDialog.tsx` "Edit …"), "Stock optimization" (`optimization/StockOptimization.tsx`), "Stock ledger" (`InventoryLedger.tsx`), "Approve corrections" (`InventoryApprovals.tsx`: tabs "Price / stock" and "New items"; count badge also on the sidebar "Inventory" link), "Stock counts" (`counts/*`: dialogs "Count an item or a shelf", "Sign off this count", decision dialog), "Loss & breakage", "Blocked stock", "Corrections", "Manual opening stock", "Opening stock import" (`pharmacy/PharmacyInventoryStarterImport.tsx`).
- Sales (inventory side): "Counter sales", "Quotations", "Customer returns", "Patient invoice history" (renders `PharmacyInvoiceList`).
- Reorder: "Shortbook", "Purchase orders", "Target proposals", "Manual targets & exclusions", "Automation settings", "Monitor" (`ReplenishmentCenter.tsx`). Stock-prediction backend is `BE/modules/stock-prediction/*`.
- Item detail page: `InventoryItemPage.tsx` (`?item=`), `WorkflowDocumentEditor.tsx` for every workflow document kind, defined in `workspace-model.ts` (`workflowKinds`).
- Legacy redirects: `/dashboard/inventory-updates` goes to `?area=stock&view=approvals`; `/dashboard/stock-predictions` goes to `?area=reorder&view=targets`; old report views go to Pharmacy Report.

### 10. Reports
- `FE/app/dashboard/reports/page.tsx`, title "Reports & Analytics" (OWNER/ADMIN/MANAGER): report cards Revenue Report, Patient Analytics, Doctor Performance, Appointment Analytics, Inventory Report, Payment Analytics; date range; "Generate" button; export select (JSON, CSV, PDF, Excel); result cards such as "Payment Mode Breakdown", "Top Performing Doctors", "Gender Distribution", "Most Frequent Patients", "Peak Hours", "Room Utilization", "Top Selling Items", "Low Stock Alerts", "Reconciliation Summary"; a "System Alerts" card.
- Pharmacy Report (`FE/app/dashboard/pharmacy/reports/page.tsx`, `FE/components/pharmacy/reports/PharmacyReportWorkspace.tsx`, catalog `report-catalog.ts`): search "Search reports", categories GST Reports (Purchase Register, Purchase Bills, Sales Register, Sales Bills, Day wise Summary, GSTR-1, GSTR-3B, GSTR-2A, GSTR-2B, HSN wise GST, Composition GST Report), Margin Reports (Item Wise Margin Report), Stock Reports (Expiring Stock), Accounting Reports (Daily Collection, GST Summary & Monthly P&L), Others (Daily Sales Summary - Doctorwise). Landing page shows "common" reports. Roles PHARMACY_REPORT_ROLES: OWNER, ADMIN, MANAGER, DOCTOR, PHARMACIST, ACCOUNTANT.
- "Daily Collection" (sidebar Overview, `DailyCollectionReport.tsx`): one-day clinic plus pharmacy takings by payment mode with a cash count save.
- Pharmacy compliance/margin components: `ComplianceCenter.tsx` (not wired, see below), `ItemMarginReport.tsx`, `DayWiseSummaryReport.tsx`.

### 11. Admin: Users, Rooms, Procedures, Fees
- Users (`/dashboard/users`, title "Users Management", `FE/components/users/UsersManagement.tsx`): header buttons "Clinic Holidays" (dialog "Clinic Holidays", `BranchHolidaySettings`), "New User" (dialog "Create User"/"Edit User": role, status Active/Inactive/Suspended/Pending); table "All Users" with row buttons "Edit", "Delete", "Reset password" (`ResetCodeButton.tsx`, dialog "Reset password for <name>", "Copy code"), and for doctors "Working Hours" (dialog "Availability: Dr. …" with `DoctorAvailabilitySettings`: shifts, "Copy Monday to Tue–Fri", "Save hours", time off/leave/holiday, "Save overbooking"), "Role & Permissions" (dialog; "Apply Role", "Clear All", "Save Permissions"), "WhatsApp Settings" (dialog "Doctor WhatsApp Settings", access token, template; "Manage" opens "WhatsApp Template Editor" with variables, AI generate, "Send Test").
- Rooms (`/dashboard/rooms`, title "Room Management", tabs "Calendar View" with `RoomCalendar.tsx` "Room Calendar & Occupancy" and "Manage Rooms" for ADMIN/DOCTOR/OWNER only with `RoomsManagement.tsx`: "Add New Room"/"Edit Room", "All Rooms", activate/deactivate switch). NURSE and RECEPTION see only the calendar.
- Procedures (`/dashboard/procedures`, title "Smart Procedures Management", `FE/app/dashboard/procedures/page.tsx`, OWNER/ADMIN/MANAGER/DOCTOR): tabs "New Procedure" (patient, doctor, nurse, machine parameters per pass, skin type assessment, "Additional Notes", "Save Procedure" which creates a Visit), "Procedure History" ("Procedures captured from visits"), "Analytics" (placeholder "Analytics dashboard coming soon").
- Fee list: see feature area 8.
- "Test Transcribe" (`FE/app/test-transcribe/page.tsx`, title "Voice Transcription Test", sidebar entry for OWNER/ADMIN/DOCTOR): a developer test page for the speech-to-text endpoint, shown in production navigation.

### Unreachable or dead code (do not write stories for these)
Never imported: `FE/components/pharmacy/PharmacyDashboard.tsx`, `FE/components/pharmacy/PharmacyPackageManager.tsx`, `FE/components/inventory/PharmacyInventoryControl.tsx` (and its child `ShelfIntelligence.tsx`), `FE/components/stock-prediction/StockPredictionDashboard.tsx`, `FE/components/billing/BillingManagement.tsx`, `FE/components/visits/VisitStateContext.tsx`. `ComplianceCenter.tsx` is only reached if imported elsewhere (not from any route found). `BE/modules/pharmacy/one-mg/*` is a stub that returns empty data (TODOs), though `apiClient` has `oneMgSearch` etc.

## Navigation Structure

Landing and routing:
- `/` redirects to `/dashboard`. After sign-in every role lands on `/dashboard` unless the URL carried `?next=` (a local absolute path; anything unsafe falls back to `/dashboard`, see `loginDestination` in `FE/app/login/page.tsx`). There is no per-role landing page: reception, doctor, pharmacist and accountant all see the same Dashboard first, and the dashboard content differs only by role-gated cards (doctor panels, admin controls, today's appointments).
- A 401 anywhere sends the user to `/login` and remembers the path (`FE/lib/authRedirect.ts`, `cms_next_after_login`).
- Desktop: persistent left sidebar (`FE/components/layout/sidebar.tsx`) plus header. Phone: top bar with a menu button that opens the same sidebar in a drawer.

Sidebar entries exactly as rendered (heading, label, route) in source order; each role sees the filtered subset:

| Section | Label | Route | Roles |
|---|---|---|---|
| Overview | Dashboard | `/dashboard` | OWNER, ADMIN, MANAGER, DOCTOR, NURSE, RECEPTION, PHARMACIST, ACCOUNTANT |
| Overview | Daily Collection | `/dashboard/pharmacy/reports?report=daily-collection` | OWNER, ADMIN, MANAGER, DOCTOR, PHARMACIST, ACCOUNTANT |
| Clinical | Patients | `/dashboard/patients` | OWNER, ADMIN, MANAGER, DOCTOR, NURSE, RECEPTION |
| Clinical | Appointments | `/dashboard/appointments` | OWNER, ADMIN, MANAGER, DOCTOR, NURSE, RECEPTION |
| Clinical | Visits | `/dashboard/visits` | OWNER, ADMIN, MANAGER, DOCTOR, NURSE |
| Clinical | Procedures | `/dashboard/procedures` | OWNER, ADMIN, MANAGER, DOCTOR |
| Clinical | Rooms | `/dashboard/rooms` | OWNER, ADMIN, DOCTOR, NURSE, RECEPTION |
| Pharmacy | Pharmacy Desk | `/dashboard/pharmacy?section=desk` | ADMIN, DOCTOR, PHARMACIST, RECEPTION |
| Pharmacy | Pharmacy Counter | `/dashboard/pharmacy?section=counter` | ADMIN, DOCTOR, PHARMACIST, RECEPTION |
| Pharmacy | Sales | `/dashboard/pharmacy/sales` | OWNER, ADMIN, DOCTOR, PHARMACIST |
| Pharmacy | Inventory (red count badge when item requests await approval) | `/dashboard/inventory` | OWNER, ADMIN, MANAGER, DOCTOR, PHARMACIST, RECEPTION |
| Pharmacy | Pharmacy Report | `/dashboard/pharmacy/reports` | OWNER, ADMIN, MANAGER, DOCTOR, PHARMACIST, ACCOUNTANT |
| Admin | Reports | `/dashboard/reports` | OWNER, ADMIN, MANAGER |
| Admin | Users | `/dashboard/users` | OWNER, ADMIN, MANAGER |
| Admin | Fee list | `/dashboard/fees` | OWNER, ADMIN |
| Admin | Test Transcribe | `/test-transcribe` | OWNER, ADMIN, DOCTOR |

Resulting menu per role (section headings only appear if the role has an entry in them):
- OWNER (14): Dashboard, Daily Collection; Patients, Appointments, Visits, Procedures, Rooms; Sales, Inventory, Pharmacy Report; Reports, Users, Fee list, Test Transcribe.
- ADMIN (16): everything above plus Pharmacy Desk and Pharmacy Counter.
- MANAGER (10): Dashboard, Daily Collection; Patients, Appointments, Visits, Procedures; Inventory, Pharmacy Report; Reports, Users.
- DOCTOR (13): Dashboard, Daily Collection; Patients, Appointments, Visits, Procedures, Rooms; Pharmacy Desk, Pharmacy Counter, Sales, Inventory, Pharmacy Report; Test Transcribe.
- NURSE (5): Dashboard; Patients, Appointments, Visits, Rooms.
- RECEPTION (7): Dashboard; Patients, Appointments, Rooms; Pharmacy Desk, Pharmacy Counter, Inventory.
- PHARMACIST (7): Dashboard, Daily Collection; Pharmacy Desk, Pharmacy Counter, Sales, Inventory, Pharmacy Report.
- ACCOUNTANT (3): Dashboard, Daily Collection; Pharmacy Report.
- LAB_TECH, PATIENT: none (blank sidebar).
Sidebar rule from the source: Inventory is the only stock-work menu entry; "Inventory Updates" and "Stock Predictions" no longer appear in the menu and redirect into Inventory.

Other navigation surfaces and cross-links:
- Header notifications: DOCTOR items go to `/dashboard/visits?appointmentId=`; RECEPTION to `/dashboard/appointments` and overdue invoices to `/dashboard/pharmacy/sales?pay=CREDIT`; PHARMACIST to `/dashboard/inventory?tab=low-stock` and `?tab=expiry`; ACCOUNTANT to the due Sales list; OWNER/ADMIN summary items to the same destinations. (The `tab=` links are not understood by the Inventory workspace, which reads `area` and `view`; they land on its Today screen.)
- Inventory workspace: top buttons for areas, a row of primary sub-tasks (first 3, or 5 for Stock) plus a "More inventory tasks" select, phone uses one "Inventory task" select; every state lives in the query string, with a `return=` parameter for the back button.
- Sales: tabs "Sales" and "Returns" (`?tab=returns`), `?pay=`, `?state=`, `?source=`, `?by=` filters; bill page `?draft=`, `?bill=` (`&edit=discount`), or prefill `?patientId=&prescriptionId=&doctorId=&visitId=`.
- Pharmacy: `?section=desk|counter` (also accepts `?tab=`); Pharmacy Report `?report=<id>`.
- Appointments to Visits: START / "Start Visit" go to `/dashboard/visits?patientId=&appointmentId=&autoStart=true|visitId=`; Patients to Appointments: `?patientId=`.
- Redirect-only routes: `/` (to `/dashboard`), `/dashboard/prescriptions` (to visits), `/dashboard/billing` (to sales bill), `/dashboard/inventory-updates`, `/dashboard/stock-predictions` (to inventory), pharmacy `?section=billing|invoices|payments` (to sales bill).
- Permission-denied handling: no route guard on the frontend beyond the cookie; hidden menu items are the only gate, so a role can open a URL it has no menu entry for and receive an API 403 shown as an inline error (e.g. dashboard "Your account does not have access to this yet", Inventory "Inventory permissions could not be loaded").
- Not-found, loading and empty states: skeleton loaders everywhere (`LoadingSkeleton`), `EmptyState` component, patient detail "Patient not found." with "Back to Patients".

## Data Entities

(Prisma models in `backend/prisma/schema.prisma`; CRUD as exposed through the UI.)
- User (staff, with role, status, per-doctor settings, working hours, time off, Google Calendar token, WhatsApp metadata): create / read / update / delete; plus admin-issued reset code, role and permissions edit. `DoctorWorkingHours`, `DoctorTimeOff` (leave, holiday, blocked), Branch (clinic holidays only): create / read / delete through the Users dialogs.
- Patient: create (Patients "Create Patient", appointment quick-create, walk-in) / read / update / archive (`/archive`, `/unarchive`) / link-unlink portal user; export CSV; merge exists only in backend.
- Appointment (status SCHEDULED, CONFIRMED, CHECKED_IN, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW; calendar Scheduled or Confirmed; visit type OPD, PROCEDURE, TELEMED; room; slot; overbooking): create / read / reschedule / cancel; bulk-update endpoint has no UI.
- Room: create / read / update / activate-deactivate. Room schedule read in calendar.
- Visit (vitals, complaints, diagnosis, examination, plan; status; version for conflict detection), VisitAttachment / DraftAttachment (photos before/after), ClinicInvestigation (lab test catalogue, per clinic): create / read / update / complete / delete photos.
- Prescription and PrescriptionRefill, PrescriptionTemplate(+Version, approvals), PrinterProfile, PrescriptionPrintEvent, ClinicAsset (letterhead, signature), TranslationMemoryEntry, layout experiments: created from the visit builder; templates created, applied, deleted.
- Service, Invoice / InvoiceItem / Payment (older clinic billing), NewInvoice / NewInvoiceItem / NewPayment (current appointment fee bills), ClinicFee (First consultation, Review, Procedure fee with version): bill created and paid from the appointment dialog; fee list edited.
- PharmacyInvoice / PharmacyInvoiceItem / PharmacyInvoiceRevision / PharmacyPayment (sales bills, drafts, refunds, discount revisions), PharmacyDispenseTask(+Lines) (counter queue), Drug, PharmacyPackage(+Items), PrescriptionInventoryLink, DrugInventoryChangeRequest and InventoryItemRequest (approval queues), PharmacyTradeTerm, PartnerOrganization / PartnerDailySale(+Items) (partner pharmacy daily sync), PharmacyCashCount (daily collection cash count).
- Inventory: InventoryItem, StockTransaction, StockAdjustment, StockMovement, ReorderRule, StockPrediction, InventoryAudit, Supplier, PurchaseOrder, InventoryWorkflowDocument / Event / Effect (the generic document engine behind challans, gate passes, returns, counts, shortbook, quotations, counter sales, credit notes, target reviews), InventoryWorkflowSettings, InventorySupplierCredit / CreditAllocation / CreditSetOff, InventoryIntakeDraft, InventoryMigration (+Row, StockOperation), InventoryMailboxConnection (Gmail intake).
- Purchase: PharmacyPurchaseInvoice (+Document, Item, Payment, PaymentAllocation, ImportAttempt): uploaded or keyed, OCR-read, reviewed, stock committed, paid, rejected.
- Pharmacy assistant: PharmacyAgentSession / Message / Attachment / Run / Proposal / ProposalAction / AuditEvent.
- Misc: AuditLog (module `BE/modules/audit-logs`, no UI found), WhatsAppTemplate, NumberSequence (bill numbering), IdempotencyRecord, Consent, Referral, LabOrder, DeviceLog, Permission/Role (stored grants edited in "Role & Permissions").

## Integrations

- Google Calendar (OAuth, per doctor/user): "Sync with Google Calendar" on the appointment calendar; callback page `/dashboard/appointments/google-callback`; server `BE/modules/google-calendar/*`, env `GCAL_CLIENT_ID`, `GCAL_CLIENT_SECRET`, `GCAL_REDIRECT_URI`.
- WhatsApp Cloud API (Meta Graph v18): appointment confirmation messages (doctor "My Settings" switch, per-doctor token in Users), template editor with AI generation, patient "WhatsApp" row action, prescription "PDF via WhatsApp" (browser share/wa.me fallback); env `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.
- Email (SMTP via nodemailer): prescription "Email" button; env `SMTP_*`.
- OpenAI: voice transcription (chunked upload, `/visits/transcribe*`), lab-test photo autofill (`/visits/labs/autofill`), print translation (`/visits/translate`), template generation, speaker diarization; env `OPENAI_*`.
- Codex CLI (local agent) for purchase-invoice OCR and the embedded pharmacy assistant; env `PHARMACY_PURCHASE_OCR_*`, `PHARMACY_AGENT_*`; `pdftotext` binary.
- Gmail OAuth for purchase invoice intake ("Gmail intake"); env `GMAIL_*`.
- 1mg: stub controller only.
- OpenPanel (frontend product analytics), Railway deployment (`railway.json`), database backup job (`POST /auth/backup`, `GET /auth/backup/:jobId`) behind dashboard "Create Backup".
- Scheduled jobs: patient dedup (every 6 h), inventory workflow scheduler (every 30 min).
- Browser-side: PDF generation (html2pdf, pagedjs), `navigator.share`, MediaRecorder microphone, camera capture for photos, `localStorage` for visit drafts, last-selected doctor/date on Appointments, and "Branded" mode.

## Recommended Story Topics

Weighted by daily use. Main source files per topic (the Phase 2 agent should read these first).

1. **Front desk: find or register a patient, book, confirm, reschedule, cancel** (highest weight; every patient, every day). Files: `FE/app/dashboard/appointments/page.tsx`, `FE/components/appointments/{AppointmentsCalendar,DoctorDayCalendar,CalendarColumn,AppointmentScheduler,AppointmentBookingDialog,PatientQuickCreateDialog,useOverbookConfirm,usePrefilledPatient,appointment-calendars}.ts(x)`, `FE/components/patients/PatientsManagement.tsx` (walk-in section of "Create Patient"), `FE/components/tours/ReceptionistTour.tsx`, `FE/lib/{overbooking,doctor-availability,appointment-access}.ts`, `BE/modules/appointments/*`, `BE/modules/google-calendar/*`.
2. **Doctor's visit: dashboard, start visit from the calendar, vitals, photos, labs, prescription, preview/print/share, complete.** Files: `FE/app/dashboard/page.tsx`, `FE/components/dashboard/DoctorPatientPanels.tsx`, `FE/app/dashboard/visits/page.tsx`, `FE/components/visits/{MedicalVisitForm,PrescriptionBuilder,VisitPhotos,ClinicInvestigations,PatientHistoryVisitCard,VisitIdentityBar}.tsx`, `FE/components/tours/DoctorTour.tsx`, `FE/hooks/{useSpeechToTextRecorder,usePrescriptionSignature,useDoctorLetterhead}.ts`, `FE/lib/{prescription-letterhead,pdf-export,speech-to-text}.ts`, `BE/modules/{visits,prescriptions,clinic-investigations}/*`.
3. **Pharmacy counter billing: prescription queue, dispense, Sales bill, print, discount, refund, returns, drafts.** Files: `FE/app/dashboard/pharmacy/{page,pharmacy-workspace}.tsx`, `FE/app/dashboard/pharmacy/sales/{page,bill/page}.tsx`, `FE/components/pharmacy/{PharmacyCounterCockpit,PrescriptionDispensingQueue,PharmacyInvoiceBuilderFixed,PharmacyInvoiceList,PartnerDailySync,PackageBrowser,PharmacyPackageCreator}.tsx`, `FE/components/pharmacy/sales/*`, `FE/lib/{bill-pricing,bill-number,pharmacy-invoice-print,download-invoice-pdf}.ts`, `BE/modules/pharmacy/{pharmacy-invoice,pharmacy-sales-register,pharmacy-dispense-task,pharmacy-prescription-queue}*.ts`.
4. **Clinic billing and payments at the appointment: create bill, take payment, fee list, daily collection.** Files: `FE/components/appointments/{AppointmentBillDialog,appointment-billing-view}.ts(x)`, `FE/app/dashboard/fees/page.tsx`, `FE/components/billing/ClinicFeeList.tsx`, `FE/lib/clinic-payment-modes.ts`, `FE/components/pharmacy/reports/DailyCollectionReport.tsx` (Daily Collection), `BE/modules/billing/*`.
5. **Patient records: list, search, detail, history, photos, portal link, archive, export.** Files: `FE/app/dashboard/patients/{page,[id]/page}.tsx`, `FE/components/patients/{PatientsManagement,PatientProgressTracker}.tsx`, `FE/components/visits/{usePatientHistory,PatientPhotoArchive,VisitPhotos}.ts(x)`, `FE/lib/{patient-history,history-visibility}.ts`, global search in `FE/components/layout/header.tsx`, `BE/modules/patients/*`.
6. **Inventory day to day: Today queue, stock list, add item and approvals, counts, losses, corrections, ledger.** Files: `FE/components/inventory/{InventoryWorkspace,WorkspaceStock,InventoryItemPage,AddInventoryItemDialog,StockEditDialog,InventoryApprovals,InventoryUpdates,InventoryItemRequests,InventoryLedger,WorkflowDocumentEditor,workspace-model}.ts(x)`, `FE/components/inventory/counts/*`, `FE/components/inventory/optimization/*`, `FE/hooks/usePurchasePermissions.ts`, `BE/modules/inventory/*`.
7. **Purchases and reorder: scan or enter a supplier bill, review, add stock, pay, returns and credit notes, suppliers, shortbook, purchase orders, targets.** Files: `FE/components/pharmacy/{PurchaseInvoiceWorkbench,PurchaseLedger,PurchaseSupplierReview,PurchaseFieldReview,PurchaseProductDetails,TradeTermsWorkspace,DistributorAnalytics,SupplierPaymentRecovery}.tsx`, `FE/components/inventory/{purchase/*,AlternateInvoiceIntake,SupplierCreditPanel,ReplenishmentCenter}.tsx`, `FE/lib/purchase-invoice-*.ts`, `BE/modules/pharmacy/pharmacy-purchase-*.ts`, `BE/modules/stock-prediction/*`.
8. **Reports and analytics: dashboard alerts, Reports & Analytics page, Pharmacy Report menu (GST, margin, stock, accounting), exports.** Files: `FE/app/dashboard/reports/page.tsx`, `FE/components/pharmacy/reports/*`, `FE/components/pharmacy/{ItemMarginReport,DayWiseSummaryReport,GstSlabGroupTable,ReportInfoTip}.tsx`, `FE/app/dashboard/page.tsx` (alerts), `BE/modules/reports/*`, `BE/modules/pharmacy/pharmacy-reports.*`.
9. **Admin and setup: users, roles and permissions, reset codes, doctor hours/holidays/overbooking, rooms, fee list, procedures, doctor My Settings (signature, letterhead, WhatsApp).** Files: `FE/components/users/*`, `FE/app/dashboard/users/page.tsx`, `FE/components/rooms/*`, `FE/app/dashboard/rooms/page.tsx`, `FE/app/dashboard/procedures/page.tsx`, `FE/app/dashboard/fees/page.tsx`, header "My Settings" in `FE/components/layout/header.tsx`, `BE/modules/{users,doctor-availability,whatsapp-templates,audit-logs}/*`.
10. **Sign-in, role landing, navigation and recovery: login, `?next=`, reset-password with admin code, logout, role-filtered menu, phone drawer, notifications, legacy redirects, permission-denied and error states, mobile viewport, dashboard backup.** Files: `FE/app/login/page.tsx`, `FE/app/reset-password/page.tsx`, `FE/middleware.ts`, `FE/lib/authRedirect.ts`, `FE/components/layout/*`, `FE/app/dashboard/page.tsx`, `BE/modules/auth/*`, `BE/shared/guards/*`, `BE/shared/access/role-permissions.ts`.

Optional spill-over if the swarm has spare capacity: the pharmacy AI assistant and partner daily sync (`AgenticPharmacyDock.tsx`, `PartnerDailySync.tsx`, `BE/modules/pharmacy-agent/*`, `BE/modules/pharmacy/pharmacy-partner-sales.*`) and voice dictation/test page.

### Redundancy leads (same goal by several routes; same facts on several surfaces)

Same goal, more than one route:
- Book an appointment: Appointments tab "Calendar" (click a free time), tab "Slots" (`AppointmentScheduler`), patient "Create Patient" dialog with Patient Type "Walk-in" (auto-books the next free slot), patient detail "Book appointment", `PatientProgressTracker` "Book". Quick patient creation also exists twice: "Create Patient" (`PatientsManagement`) and "Add New Patient" (`PatientQuickCreateDialog`).
- Start a visit: Appointments row "START", "Appointment Details" > "Start Visit", Patients row "Start Visit", patient detail "Start visit" and "Resume last visit", progress tracker "Start Visit"/"Continue", Visits setup "Start Visit Documentation", header doctor notification, dashboard "Recent Visits". No separate check-in step.
- Create a prescription: "Create Prescription" button in the builder vs "Save Prescription" inside "Prescription Preview" (the preview also auto-saves before Download PDF/Email/WhatsApp); "Save Draft"/"Complete Visit" in the form footer is a third save. `/dashboard/prescriptions` redirects to visits.
- Bill a prescription in the pharmacy: builder "Go to Pharmacy" and dialog "Go to Pharmacy?", progress tracker "Bill"/"Invoices", Counter "Open bill"/"Start billing"/"Walk-in bill", queue "Bill" (Counter) vs "Load" (Sales bill page), Desk "New sale", Sales "New sale", Pharmacy Desk quick action. Three queue lists show the same prescriptions: Counter cockpit "Queue" panel, Counter "Prescription Queue" section, and the queue at the top of the Sales bill page.
- Sell without a prescription: Pharmacy Sales "New sale" (bill) vs Inventory > Sales > "Counter sales" (document engine with batch picking) vs the Sales register source filter "Counter sales"; sales returns: Sales tab "Returns" vs Inventory > Sales > "Customer returns".
- See pharmacy invoices: Sales register, Pharmacy Desk "Invoices" page (`PharmacyInvoiceList` titled "Pharmacy Invoices"), Inventory > Sales > "Patient invoice history" (same component), plus Pharmacy Report "Sales Register".
- Take payment / mark paid: clinic bill dialog "Record payment"; Counter "Paid" dispense status vs the Sales bill's "Payment Method" at "Confirm & Print"; purchase side "Mark paid" on Purchase bills vs "Payments & dues" ledger vs credits "Set off".
- Return stock to a supplier: Purchase bills tab "Returns" ("New return"), Inventory task "Credit notes", "Credits & vouchers", and Stock optimization's "onReturns" shortcut; help text says to record the credit note "here or from Purchase bills > Returns".
- Add a stock item: "Add Inventory Item" (non-approvers send for doctor approval), Drug Database "add drug" (`DrugManagement`), PrescriptionBuilder "Add Drug to Database"/"+ Add to Drug Database", "Manual opening stock", "Opening stock import", purchase intake creating items. Two catalogues (Drug and InventoryItem).
- Approve price/stock edits and new items: Inventory Today card, "Approve corrections" tab, sidebar badge, legacy `/dashboard/inventory-updates`.
- Reorder targets: "Stock optimization" (Stock area), "Target proposals", "Manual targets & exclusions", "Monitor", legacy `/dashboard/stock-predictions`, and the unrendered `StockPredictionDashboard`.
- Receive stock: "Scan or enter bill" (`PurchaseInvoiceWorkbench`), "Import CSV", "Gmail intake", "Inward challans", "Purchase orders" receive, and purchase "Add stock"/"Post bill".
- Reports for the same numbers: dashboard "System Alerts", header Notifications, Inventory "Today", Reports page "Low Stock Alerts"/"Inventory Report", Pharmacy Report "Expiring Stock"; revenue/collection by payment mode in Reports "Payment Mode Breakdown" (twice: Revenue and Payment Analytics), "Daily Collection" (sidebar "Daily Collection" and under Pharmacy Report), Pharmacy Report "Sales Register", and Day wise Summary. Two report entries in the sidebar for pharmacy: "Daily Collection" and "Pharmacy Report" both go to the same workspace.
- Doctor availability and WhatsApp settings: header "My Settings" (doctor) vs Users > "Working Hours" and "WhatsApp Settings" (admin) edit the same data. Rooms visible in Appointments filters, Rooms page "Calendar View" and the booking dialog.
- Procedures: appointment type "Procedure" (+ Procedure Name), PrescriptionBuilder "Procedures" section, and the standalone "Smart Procedures Management" page which creates a Visit.
- Branded mode switch appears on the login page and in the header.

Same information on several surfaces:
- Patient identity (name, age, gender, phone, ID): appointment row, "Appointment Details" dialog, `VisitIdentityBar`, `PatientProgressTracker`, patient detail badges and "Patient Information", Pharmacy bill header.
- Visit history: Visits setup tab "Patient History", visit form tab "History", patient detail tab "History", dashboard "Recent Visits", `PatientProgressTracker` summary.
- Bill state: appointment row chip, "Appointment Details" > "Bill", "Bill for <patient>" dialog, and `PatientProgressTracker` "Invoices". Pharmacy bill state: Sales register state/payment columns, finished bill badges, Counter lifecycle (Ready to Bill/Paid/Dispensed), Pharmacy Invoices list.
- Low stock / expiry counts: dashboard, header bell, Inventory Today, Reports page, Pharmacy Desk "Stock ... low" strip.
- Status of an appointment: row badge, details dialog, header/dashboard list.
- Quick Guide text and tours repeat instructions already on the page; some guide text is stale (the Patients guide says "Add Patient" and the button is "New Patient"; the Users guide lists "Therapist").

### Surprises and risks the later agents should know
- RECEPTION sees Pharmacy Desk/Counter but cannot bill (no Sales entry, `sells` false); Pharmacy Desk is hidden from OWNER and MANAGER; RECEPTION has no Visits entry although the calendar's "Start Visit" button is shown to them (route reachable, clinical tabs limited to Overview and History).
- Inventory links from the header (`?tab=low-stock|expiry`) and from the Pharmacy Desk/Counter ("Inventory Control", `?tab=pharmacy-control`) do not match the workspace's `area`/`view` params, so they open Inventory > Today.
- "Test Transcribe" is a developer page in the production sidebar; `/dashboard/billing` leads to pharmacy Sales, not clinic billing.
- Several large components are unreachable (see the dead-code list); do not write stories for them.
- Visit completion is blocked below 80% progress with a "Section progress does not verify clinical completeness" note; save conflicts and local drafts are important error paths.
- `AuditLog` and patient merge have backend support but no UI.
