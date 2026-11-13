# App Discovery: Linaé ClinicMS (Clinic Management System)

> Read-only discovery of the code as it stands. Labels in `code font` or "quotes" are the actual
> strings in the source. Paths are relative to the repo root. Where something was inferred rather
> than read line by line it is marked *(inferred)*.

## Application Type

Multi-role, single-clinic web application for a dermatology OPD (Linaé Skin, Hair & Aesthetic
Clinic, Hyderabad). It is an internal staff tool: there is no public sign-up and no patient-facing
portal UI in this repo (patients can only be "linked" to a portal account by e-mail).

Three large work areas share one shell:

1. **Front desk / clinical** — patients, appointments, rooms, visits, prescriptions, procedures, consultation bills.
2. **Pharmacy** — prescription queue, dispensing counter, GST sales bills, returns, drug master, packages, partner sales, AI assistant.
3. **Inventory & accounts** — purchase-bill OCR intake, suppliers, payments, stock, counts, reorder, GST/margin reports, daily collection.

All dates are Asia/Kolkata (IST) clinic days; all money is INR.

## Tech Stack

| Layer | What | Evidence |
|---|---|---|
| Frontend framework | Next.js 15 (App Router), React 19, TypeScript | `frontend/package.json`, `frontend/src/app` |
| Routing | File-system routes; heavy use of **query-string state** (`?area=&view=`, `?section=`, `?tab=`, `?report=`, `?draft=`, `?bill=`) instead of nested routes | `frontend/src/components/inventory/InventoryWorkspace.tsx`, `frontend/src/components/pharmacy/sales/sales-bill-model.ts` |
| State | Local React state + a `DashboardUserProvider` context; no global store in use (`@tanstack/react-query` is a dependency but pages fetch through `apiClient`) | `frontend/src/components/layout/dashboard-layout.tsx`, `frontend/src/lib/api.ts` |
| Persistence in browser | `localStorage` (appointment doctor/date, tour-seen flags, branded mode, visit + prescription drafts, page size), `sessionStorage` (checkout / payment attempt recovery) | `frontend/src/app/dashboard/appointments/page.tsx`, `frontend/src/components/visits/MedicalVisitForm.tsx`, `frontend/src/components/pharmacy/PharmacyInvoiceBuilderFixed.tsx` |
| UI kit | Tailwind 4, Radix primitives (shadcn-style `components/ui`), lucide icons, Recharts | `frontend/src/components/ui/*` |
| Forms | Mostly hand-rolled controlled inputs; `react-hook-form` + `zod` are installed | — |
| Print / PDF | Paged.js paginated preview, `html2pdf.js`/`jspdf`/`html2canvas`, browser print | `frontend/src/components/visits/PrescriptionBuilder.tsx`, `frontend/src/lib/pharmacy-invoice-print.ts`, `frontend/src/lib/pdf-export.ts` |
| Tours | intro.js | `frontend/src/hooks/useIntroTour.ts`, `frontend/src/components/tours/*` |
| Analytics | OpenPanel (only when `NEXT_PUBLIC_OPENPANEL_CLIENT_ID` is set) | `frontend/src/lib/analytics/*` |
| Backend | NestJS, Prisma, PostgreSQL | `backend/src/modules/*`, `backend/prisma/schema.prisma` |
| Auth | Cookie session: `auth_token` cookie checked by Next middleware for every `/dashboard/*` request; API calls use `credentials: 'include'`; any API 401 redirects to `/login?next=…` | `frontend/src/middleware.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/authRedirect.ts` |
| Authorisation | Server: `RolesGuard` + `PermissionsGuard`. **OWNER, ADMIN and DOCTOR pass every `@Roles()` list**; other roles must be listed and/or hold a named permission grant. Client: sidebar filtering + ad-hoc role checks per page | `backend/src/shared/guards/roles.guard.ts`, `backend/src/shared/guards/permissions.guard.ts`, `frontend/src/components/layout/sidebar.tsx` |
| API proxy | Browser calls `/api/*`, rewritten by Next to the Nest backend (300 s proxy timeout for invoice OCR) | `frontend/next.config.ts` |
| Mutation safety | Idempotency keys + optimistic version numbers on visits, prescriptions, bills, purchase drafts; recovery UIs for "uncertain" outcomes | `frontend/src/lib/api.ts`, `@cc` contract comments throughout |

A useful reading aid: the codebase carries ~280 `@cc [...]` contract comments that state the intended
product behaviour of the component beneath them (`grep -rn "@cc \[" frontend/src`).

## User Roles

Prisma enum `UserRole` (`backend/prisma/schema.prisma`): `OWNER, ADMIN, DOCTOR, NURSE, RECEPTION, ACCOUNTANT, PHARMACIST, LAB_TECH, MANAGER, PATIENT`.

"Clinic staff" on the server = OWNER, ADMIN, MANAGER, DOCTOR, NURSE, RECEPTION, PHARMACIST, ACCOUNTANT
(`backend/src/shared/decorators/clinic-staff-roles.ts`). `LAB_TECH` and `PATIENT` exist in the enum
but have **no sidebar entries and no UI**. The Users form only offers Admin, Doctor, Nurse,
Receptionist, Manager, Pharmacist (no Owner / Accountant / Lab tech).

The frontend also references a **`THERAPIST`** role (visit permissions, Users quick guide, Visits
quick guide) that does **not** exist in the enum.

Sidebar visibility per role (source: `frontend/src/components/layout/sidebar.tsx`):

| Sidebar item | OWNER | ADMIN | MANAGER | DOCTOR | NURSE | RECEPTION | PHARMACIST | ACCOUNTANT |
|---|---|---|---|---|---|---|---|---|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Daily Collection | ✓ | ✓ | ✓ | ✓ | – | – | ✓ | ✓ |
| Patients | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | – |
| Appointments | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | – |
| Visits | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – |
| Procedures | ✓ | ✓ | ✓ | ✓ | – | – | – | – |
| Rooms | ✓ | ✓ | – | ✓ | ✓ | ✓ | – | – |
| Pharmacy Desk | – | ✓ | – | ✓ | – | ✓ | ✓ | – |
| Pharmacy Counter | – | ✓ | – | ✓ | – | ✓ | ✓ | – |
| Sales | ✓ | ✓ | – | ✓ | – | – | ✓ | – |
| Inventory | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | – |
| Pharmacy Report | ✓ | ✓ | ✓ | ✓ | – | – | ✓ | ✓ |
| Reports | ✓ | ✓ | ✓ | – | – | – | – | – |
| Users | ✓ | ✓ | ✓ | – | – | – | – | – |
| Fee list | ✓ | ✓ | – | – | – | – | – | – |
| Test Transcribe | ✓ | ✓ | – | ✓ | – | – | – | – |

What each role can do beyond what it can see:

- **OWNER / ADMIN** — everything. Only they: create/edit/delete users, change roles and permission grants, issue password reset codes, edit the fee list, create a database backup (Dashboard "Admin Controls"), manage clinic holidays, read audit logs (API only, no UI page found).
- **DOCTOR** — full clinical documentation, prescriptions, completing visits; approves pharmacist price/stock edits and new-item requests; edits Terms of Trade; manages rooms; own signature, letterhead, working hours, WhatsApp settings (header "My Settings"); connects own Google Calendar. Server-side passes every role gate.
- **MANAGER** — reads appointments (no Rooms entry, server has no rooms grant for them), Reports, Users list (but user mutations are OWNER/ADMIN only server-side), Inventory, Pharmacy Report.
- **NURSE** — patients, appointments (create/update), visits with a reduced tab set (Overview, Vitals, Photos, History); cannot complete a visit or write a prescription.
- **RECEPTION** — patients, appointments, rooms (read), consultation bills and payments (`billing:invoice:create`), Pharmacy Desk/Counter queue without sales figures or sale actions, Inventory (can *request* new items and see the approval queue). No Visits sidebar entry, although "Start Visit" buttons on Patients still link there (the visit form then offers only the Overview, Photos and History tabs, and the server refuses visit creation for this role).
- **PHARMACIST** — Pharmacy Desk/Counter, Sales bills, drug master, inventory, purchases, pharmacy reports. Price/stock edits go to a doctor/admin approval queue.
- **ACCOUNTANT** — Dashboard, Daily Collection, Pharmacy Report only.

Server role lists for reference: `backend/src/modules/*/**.controller.ts` (`@Roles(...)`), notably
`appointments.controller.ts`, `billing.controller.ts`, `pharmacy-invoice.controller.ts`, `drug.controller.ts`,
`inventory-item-request.controller.ts`, `users.controller.ts` (`MANAGE = [OWNER, ADMIN]`).

## Feature Map

### Authentication (`/login`, `/reset-password` — `frontend/src/app/login/page.tsx`, `frontend/src/app/reset-password/page.tsx`, `frontend/src/components/auth/AuthCard.tsx`)
- Sign in with "Phone or email" + "Password"; button `Sign in` / `Signing in…`; inline error `role="alert"`.
- After login goes to `?next=` if it is a safe local path, else `/dashboard`.
- "Forgot password? Ask your clinic admin for a reset code, then enter your reset code" → `/reset-password`.
- Reset page "Set a new password": `Reset code` (8 characters, single use, expires in 24 h), `New password` (8–72 chars), `Confirm new password`, button `Set new password`; success message then auto-redirect to `/login`; link `Back to sign in`.
- The reset code is issued by an OWNER/ADMIN from Users (`Reset password` → "I have confirmed who is asking. Create code" → `Copy code`) — `frontend/src/components/users/ResetCodeButton.tsx`.
- `Branded` toggle (top-right of login, also in the header) switches a palette extracted from `/letterhead.png`; stored in `localStorage`.
- Logout: icon button `aria-label="Log out"` at the bottom of the sidebar.
- No sign-up, no self-service e-mail reset, no "change my password" UI found (the API `POST /users/:id/change-password` exists).
- `/` redirects to `/dashboard`.

### App shell (`frontend/src/components/layout/dashboard-layout.tsx`, `sidebar.tsx`, `header.tsx`)
- Left sidebar (logo "ClinicMS"), grouped sections **Overview / Clinical / Pharmacy / Admin**; user initials, name, role, logout.
- Inventory entry shows a red count badge of pending new-item requests for DOCTOR/ADMIN/OWNER.
- Mobile (< md): header is replaced by a slim bar with a hamburger (`Open clinic navigation`) that opens the sidebar in a sheet. **The desktop header (search, notifications, settings, tour, branded toggle) is hidden on mobile.**
- Header **global search** ("Search patients, appointments, doctors..."): debounced, min 2 chars, groups results as Patient / Appointment / Staff; Enter opens the first result; Escape dismisses without clearing.
- Header **Notifications** bell: role-specific items built from `/reports/alerts`, refreshed every 60 s; footer item `View reports & alerts`.
- Header **settings** cog → dialog "My Settings". Content exists **only for DOCTOR**: `Doctor signature`, `Prescription letterhead`, `Weekly working hours (IST)` / `Leave and blocked time` / `Overbooking`, "Send WhatsApp on appointment creation", "Use WhatsApp Template". Other roles get an empty dialog with `Close` / `Save`.
- Header `Start Tour` button for RECEPTION only.

### Dashboard (`/dashboard` — `frontend/src/app/dashboard/page.tsx`, `frontend/src/components/dashboard/DoctorPatientPanels.tsx`)
- Stat cards: `Total Users`, `Active Users`, `Total Branches`, `System Status`.
- DOCTOR only: `Recent Visits` (links into the visit) and `My Patients` (search + pagination, links to patient detail).
- OWNER/ADMIN only: `Admin Controls` → `Database Backup` → `Create Backup` (result shown in a native `alert()`).
- `System Alerts` card (overdue invoices, low stock, expiring items, pending payments, always-present "System Status: All systems operational").
- `Today's Appointments` (roles that can read appointments) with `View All Appointments`.
- `Quick Guide` dialog ("Dashboard Guide").

### Patients (`/dashboard/patients`, `/dashboard/patients/[id]` — `frontend/src/components/patients/PatientsManagement.tsx`, `frontend/src/app/dashboard/patients/[id]/page.tsx`, `frontend/src/components/patients/PatientProgressTracker.tsx`)
- List: search (name / phone / ABHA / e-mail, min 2 chars, "Did you mean" suggestions), filters Gender, Consultation Type, Date Range, per-page size; `Clear Filters`; `Export CSV`; pagination.
- `New Patient` → dialog "Create Patient" (first/last name, age, gender, phone, ABHA ID, e-mail, address, emergency contact, consultation type Online/Offline, primary doctor, referral source, **Patient Type Walk-in / Non walk-in**). Choosing *Walk-in* also books a walk-in appointment (doctor, appointment type, optional room) in the same submit.
- Row actions: `View`, `Start Visit`, `More` → `Edit`, `Archive` (with undo toast), `Link portal` / `Unlink portal` (dialog "Link Portal Access"), `WhatsApp` (sends appointment reminder).
- Click-to-copy patient ID and patient code.
- Detail page: header badges, buttons `Resume last visit`, `Start new visit`, `Book appointment`, `Back`; summary card (contact, primary doctor, last visit, next appointment); **progress tracker** (Start → Document → Complete → Prescribe → Billing → Follow-up with contextual buttons `Continue` / `Start Visit` / `Book` / `Prescribe`/`View` / `Bill`/`Invoices`); tabs **Info**, **History** (doctor + date filters, collapsible per-day groups), **Uploads** (photo upload/archive).
- No delete; archive only. No patient merge UI found (a backend test DB name suggests merge exists server-side only).

### Appointments (`/dashboard/appointments` — `frontend/src/app/dashboard/appointments/page.tsx`, `frontend/src/components/appointments/*`)
- Page controls: `Doctor` select, `Date` picker (both remembered in `localStorage`), `Quick Guide` dialog; tabs **Calendar** and **Slots**.
- Calendar tab ("Doctor Calendar"): two side-by-side columns **Scheduled** ("Booked ahead. Call to confirm.") and **Confirmed** ("Confirmed, walk-ins and visits."); filters Visit Type (OPD Consultation / Procedure / Telemedicine), Room, Grid granularity; legend.
- Booking flow: search a patient → pick from results (or `+ Add "<text>" as a new patient` → dialog "Add New Patient") → click or drag a free time in a column → dialog "Book Appointment" (duration 15–90 min, Appointment Type, Procedure Name, room availability cards with conflicts) → success banner "Appointment Successfully Booked!".
- Overbooking: dialog "Overbook this slot?" → `Book anyway` (only when the doctor allows > 1 patient per slot).
- Blocked time banner "Not bookable: …" from doctor leave / holidays / working hours.
- Click an appointment → dialog "Appointment Details": `Start Visit`, `Reschedule` (then click a new slot; banner "Rescheduling …" with `Cancel`), `Cancel Appointment` (confirm dialog "Keep Appointment" / "Yes, Cancel Appointment"), `Confirm` (Scheduled → Confirmed) or `Move to Scheduled`, and `Create bill` / `Open bill` / `View bill`.
- Per-row billing chip ("Not billed", "₹500 · Paid", "₹200 due" …) opens the bill dialog directly.
- Google Calendar: `Sync with Google Calendar` → Google OAuth → `/dashboard/appointments/google-callback` (success / denied / error states, auto-redirect) → status "Syncing" + `Disconnect`; warning when the selected doctor's calendar is not connected.
- Slots tab ("Appointment Scheduler"): its own patient search, filters and Duration select, then **the same day calendar component** beneath it; also supports reschedule.
- Deep link: `?patientId=` pre-selects the patient.

### Consultation / procedure bills and Fee list (`frontend/src/components/appointments/AppointmentBillDialog.tsx`, `/dashboard/fees` — `frontend/src/app/dashboard/fees/page.tsx`, `frontend/src/components/billing/ClinicFeeList.tsx`)
- Dialog "Bill for {patient}": lists each clinic bill (lines, Total / Received / Due, payments and refunds).
- `Create bill`: `Bill line` (prefilled "First consultation" / "Review consultation" / "Procedure: …"), `Fee` (prefilled from the fee list, "From fee list: …", `Use ₹…` to restore), `Paid now`, payment mode radio (Cash, UPI, Card, Net banking / NEFT, Cheque + optional reference); button `Create bill` / `Create bill and record ₹…`. "Consultation and procedure fees are billed without GST."
- `Record payment` against a bill with a balance; `Add another bill`.
- Users without create rights see "Not billed yet. The front desk creates the bill."
- Fee list page: one fee per bill type (First consultation, Review, Procedure); non-admins see a locked empty state "Only an admin can change the fee list."
- Server: `backend/src/modules/billing/billing.controller.ts`, `clinic-fees.controller.ts`. `/dashboard/billing` itself **redirects to the pharmacy Sales bill**.

### Rooms (`/dashboard/rooms` — `frontend/src/app/dashboard/rooms/page.tsx`, `frontend/src/components/rooms/RoomCalendar.tsx`, `RoomsManagement.tsx`)
- Tab **Calendar View** ("Room Calendar & Occupancy"): date, `Today`/`Now`, grid 10–60 min, room-type filter, room search, stat tiles (Total Rooms, Available, Occupied, Appointments), appointment detail popovers. Read-only.
- Tab **Manage Rooms** (ADMIN / DOCTOR / OWNER only): `Add Room` (name, type from 10 room types, capacity, active), edit, delete, activate/deactivate toggle, search and filters.

### Visits (`/dashboard/visits` — `frontend/src/app/dashboard/visits/page.tsx`, `frontend/src/components/visits/MedicalVisitForm.tsx`, `VisitPhotos.tsx`, `PatientHistoryVisitCard.tsx`, `usePatientHistory.ts`)
- Setup screen "Visit Documentation": card "Your Role & Permissions", card "Start New Visit" (patient type-ahead with keyboard navigation, doctor select), tabs **Ready to Start** / **Patient History**, button `Start Visit Documentation`, card "Available Features".
- "Setup Required" state when there are no patients or doctors (`Manage Patients`, `Manage Users`).
- Deep links skip setup: `?patientId=&appointmentId=&visitId=&doctorId=&autoStart=true`.
- Visit form header: "Visit #n", status badge (DRAFT / IN PROGRESS / COMPLETED), "Linked to Appointment", photo count, progress bar, save status ("Auto-saving…", "Unsaved changes", "Saved hh:mm", "Save failed"), `Visit Workflow Tour`, `Shortcuts`.
- `Consultation type` select (In-person / Tele-video). Tele-video requires the checkbox "Patient consented to tele-video consultation" before any save or export.
- Tabs by role: **Overview** (all), **Vitals**, **Photos**, **Prescription**, **Lab Tests**, **Customization** (doctor/admin/owner), **History** (all). Collapsible "Patient Context" side panel.
  - Vitals: BP, heart rate, temperature, weight, height, BMI, respiratory rate, pain score.
  - Photos: `Choose Files` / `Take Photo`, position tagging (Front, Left, Right, Back, Close-up, Other; `Infer positions`), before/after compare, delete; "Other saved photos" archive.
  - Lab Tests: test checklist, results with units, "Compare with previous visit", autofill from a photo of a report, `Save Labs`; manage the clinic's saved investigations list.
  - Customization: print background image, margins, content offsets, paper preset, header/footer frames, design aids, per-doctor profile (`Save Doctor Default` / `Load Doctor Default`), print-section toggles.
- Footer: progress text, `Save Draft` (Ctrl/Cmd+S), `Complete Visit` (Ctrl/Cmd+Shift+S; doctors only; disabled under 80 % progress with an explanation).
- Conflict and recovery toasts: "Visit changed elsewhere", "Draft changed in another tab", "Auto-save failed", "Not signed in".
- `/dashboard/prescriptions` redirects here.

### Prescription builder (Visits → Prescription tab — `frontend/src/components/visits/PrescriptionBuilder.tsx`, `rx-table.tsx`, `frontend/src/lib/prescription-learning.ts`, `frontend/src/hooks/useSpeechToTextRecorder.ts`, `usePrescriptionSignature.ts`)
- Templates bar: template dropdown (Saved templates / Default templates such as "Acne (Mild) — Topical regimen"), `Refresh`, `Undo`, `Redo`, `Reset to default`, `Save current`, `Save fields`, `New template`; delete a saved template.
- Collapsible sections: "Clinical Details & Vitals", "Chief Complaints", "Diagnosis", "Patient History", "On Examination", "Treatment", "Procedures", "Investigations", "Basic Information", plus `Add Custom Section`.
- Treatment table: medicine search against the drug master with stock shown, `Add Row`, "Recent meds", "Presets", `+ Add to Drug Database` (dialog "Add Drug to Database" → `Save & Add`), custom frequency / dose pattern / timing / duration options, usual-value suggestions ("Suggested · Accept"), learned treatment plan (`Reapply learned plan`, `Fill missing only`).
- Voice dictation mic buttons on free-text fields (record → transcribe → insert).
- `Language` English / Telugu / Hindi — free-text fields are machine-translated on the print preview.
- `Review Date` with day/week shortcut chips.
- Footer: print format `Table` / `Text`, `Print Preview`, `Create Prescription` (or "Save visit first"), `Go to Pharmacy`.
- Full-screen "Prescription Preview": page navigation, zoom, margins (`Reset margins`), "Space-optimized layout", "Fit to 1 page", line spacing, Letterhead default / None, page-break toggles, printer profile, refill stamp, `Show signature`; actions `Save Prescription`, `Close`, `Interactions` (dialog "Interaction Summary"), `Email`, `PDF via WhatsApp`, `High contrast`, `Print`, `Download PDF`.
- After create: dialog "Go to Pharmacy?" → `Stay Here` / `Yes, go to Pharmacy` (opens a new Sales bill prefilled with patient, prescription and doctor).

### Procedures (`/dashboard/procedures` — `frontend/src/app/dashboard/procedures/page.tsx`)
- Header "Smart Procedures Management". Tabs **New Procedure**, **Procedure History**, **Analytics**.
- New Procedure: patient, doctor, nurse/therapist, session no., shot counts, body parts, indications, skin-type assessment, machine selection (Endymed Pro Max, Fotona Starwalker, Soprano Platinum LHR, Hydrafacial) with per-pass parameters, notes; `Save Procedure` — **saved as a Visit** (`apiClient.createVisit`).
- Procedure History: procedures captured from the patient's visits, `Load & Edit`, `View Details`.
- Analytics: placeholder "Analytics dashboard coming soon".

### Pharmacy Desk (`/dashboard/pharmacy?section=desk` — `frontend/src/app/dashboard/pharmacy/pharmacy-workspace.tsx`)
- Dark "Command center" header: metrics `Sales`, `Invoices`, `Stock`, `Packages` (sales roles only), `Quick Guide`, `Refresh`, `Invoices` (→ `/dashboard/pharmacy/invoices`), `Drugs` (→ `/dashboard/pharmacy/drugs`).
- Quick actions: `Pharmacy Counter`, `New sale`, `Inventory Control`.
- **Pharmacy AI assistant** (`Open AI Assistant`): chat sessions, attachments, proposals with `Apply` / `Reject`, archive/restore chats — `frontend/src/components/pharmacy/AgenticPharmacyDock.tsx`.
- **Partner Daily Sync**: manual daily entry of a partner organisation's sales, missing entries, recent submissions, `Commit` stock, resolve outstanding lines by choosing a batch with a reason — `frontend/src/components/pharmacy/PartnerDailySync.tsx`.
- **Treatment Packages**: search/browse, `View Details`, `Create Package` dialog — `PackageBrowser.tsx`, `PharmacyPackageCreator.tsx`.

### Pharmacy Counter (`/dashboard/pharmacy?section=counter` — `frontend/src/components/pharmacy/PharmacyCounterCockpit.tsx`, `PrescriptionDispensingQueue.tsx`, `PrescriptionInventoryLink.tsx`)
- Cockpit ("Queue to pick to bill in one workstation."): Rx queue lanes (Queue / Review / Exceptions / Ready/Paid), `Pull visits`, `Walk-in bill`, `Inventory control`; per-line review (`Accept`, `Sub`, `Edit`), "Pick Assist" (shelf, batch, earliest expiry), task status (`Pause`, `Ready`), `Start billing` / `Open bill`, `Collect payment`, `Daily close`.
- Below it "Prescription Queue": status filter (All / Pending / Partial / Dispensed / Expired), stock column per prescribed line, "Over 2h" ageing, `Link inventory` / `Change link` per medicine, row action `Bill`.

### Drug database (`/dashboard/pharmacy/drugs` — `frontend/src/components/pharmacy/DrugManagement.tsx`)
- Stats, search, category/manufacturer filters, pagination; `Add New Drug` / `Edit Drug` dialog; delete. Reached only from the Pharmacy Desk `Drugs` button (no sidebar entry). `Back` returns to Pharmacy.

### Sales — pharmacy bills (`/dashboard/pharmacy/sales`, `/dashboard/pharmacy/sales/bill` — `frontend/src/app/dashboard/pharmacy/sales/page.tsx`, `sales/bill/page.tsx`, `frontend/src/components/pharmacy/sales/*`, `frontend/src/components/pharmacy/PharmacyInvoiceBuilderFixed.tsx`, `frontend/src/components/register/*`)
- Register tabs **Sales** and **Returns**; date range, search by Bill No / Patient / Mobile, payment-mode filter (incl. "Due (unpaid)"), more filters (State, Source, Entry by), sortable columns, footer totals, pagination; all in the URL.
- Row actions: open, `Edit discount`, `Print`, `Send on WhatsApp` (wa.me link with a prefilled message), with disabled-reason tooltips for drafts/cancelled.
- `New sale` → bill page: a prescription queue on top (row action `Load`) and the bill builder beneath: "Patient & Doctor Details", "Add Items to Invoice" (tabs `Individual Drugs` / `Treatment Packages`), "Invoice Items" (stock warnings, `Substitute`, remove, GST review), "Invoice Summary" (item discounts, bill discount), "Billing Information", payment method; `Save draft`, `Discard draft`, `Print Preview` → dialog "Pharmacy Invoice Preview" with `Confirm Invoice` / `Confirm & Print`, copy type Original / Duplicate, zoom, `Download PDF`.
- Draft URL `?draft=<id>`; finished bill URL `?bill=<id>` (`FinishedBillView`: payments, discount history, `Edit discount` with mandatory reason, `Record refund`, `Print`).
- `New return` and counter-sale rows open the **Inventory** workspace (`?area=sales&view=SALES_RETURN|COUNTER_SALE`) with a `return=` link back.
- Prefill deep link: `?patientId=&prescriptionId=&doctorId=&visitId=`.

### Pharmacy Invoices list (`/dashboard/pharmacy/invoices` and Inventory → Sales → "Patient invoice history" — `frontend/src/components/pharmacy/PharmacyInvoiceList.tsx`)
- Summary tiles, search, Status / Payment Status / Payment Method / Date Range filters; card actions `View Invoice`, `Download Invoice`, `Continue in Sales` (drafts), `Delete Invoice`, `Mark as Paid`, `Retry Payment`.

### Inventory workspace (`/dashboard/inventory` — `frontend/src/components/inventory/InventoryWorkspace.tsx`, `workspace-model.ts`)
Five areas (top nav buttons) with a task strip each; state lives in `?area=&view=&document=&item=&invoice=&new=&return=`.

- **Today** — `Scan or enter bill`, `Find or correct stock`, "What needs attention" queues (count due today, counts awaiting approval, price/stock edits awaiting approval, overdue supplier bills, low stock, expiring in 3 months, purchase invoices to review, original files awaiting intake, credit notes awaited, orders awaiting receipt), "Recent activity".
- **Purchases**
  - `Purchase bills` — registers Bills and Returns; `New purchase`, `More` → `Export to Excel`, `Suppliers`; per-row `Mark paid` (dialog "Settle bill": Pay or Set off credit, 30-second `Undo`); returns register with `Set off`, record/correct credit note — `frontend/src/components/inventory/purchase/*`.
  - `Scan or enter bill` — the purchase-invoice workbench: upload PDF/photos (up to 10 files) or `Type instead`; OCR extraction; side-by-side original with source highlights; header fields; product lines with product matching ("These look like different products", `Confirm this match`, `Choose another product`); bulk GST/discount; review checks; `Save draft`, `Mark Reviewed`, `Confirm & post bill` / `Add stock`; link to an earlier inward receipt; recover interrupted imports; agreed Terms of Trade shown per line — `frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx` and `Purchase*.tsx` helpers, `frontend/src/lib/purchase-invoice-*.ts`.
  - `Import CSV` (template download) and `Gmail intake` (`Connect Gmail`, find invoice attachments, `Open review draft`) — `frontend/src/components/inventory/AlternateInvoiceIntake.tsx`.
  - `Suppliers` (list, add/edit, jump to account or bills), `Terms of Trade` (per distributor and product; doctor/admin/owner edit — `frontend/src/components/pharmacy/TradeTermsWorkspace.tsx`), `Payments & dues` ("Purchase Ledger": ageing, alerts, bulk payment allocation — `PurchaseLedger.tsx`), `Credits & vouchers` (`SupplierCreditPanel.tsx`), `Inward challans`, `Gate passes`, `Purchase costs` ("Distributor Analytics" — `DistributorAnalytics.tsx`).
- **Stock**
  - `Stock list` — search/scan, filters (stock level, expiry, count history, product mapping, missing information), sort, batch view toggle, CSV export, bulk location change, `Add batch` (dialog "Add Inventory Item"; non-approvers get "Sent to doctor for approval"), `Edit price`, `Edit stock`, count selected batches — `WorkspaceStock.tsx`, `AddInventoryItemDialog.tsx`, `StockEditDialog.tsx`.
  - Item page (`?item=`): batches, `Edit item`, `Set stock alert`, resolve product identity, held stock by source, item ledger with CSV, `Print batch label`, delete batch, linked corrections — `InventoryItemPage.tsx`.
  - `Stock optimization` (rules, `Run optimization`, returnable vs non-returnable batches, draft supplier returns), `Stock ledger`, `Approve corrections` (two tabs: `Price / stock` approval queue and new item requests, each with `Approve` / `Reject`), `Stock counts` (tabs My counts / Approvals / History / Settings; start a count by item or shelf, count sheet, sign-off, approve-and-adjust or reject), `Loss & breakage`, `Blocked stock`, `Corrections`, `Manual opening stock`, `Opening stock import` (Excel) — `optimization/StockOptimization.tsx`, `InventoryLedger.tsx`, `InventoryApprovals.tsx`, `InventoryUpdates.tsx`, `InventoryItemRequests.tsx`, `counts/*`, `frontend/src/components/pharmacy/PharmacyInventoryStarterImport.tsx`.
- **Sales** — `Counter sales`, `Quotations`, `Customer returns` (workflow documents), `Patient invoice history`.
- **Reorder** — `Shortbook`, `Purchase orders` (send, receive remaining stock, cancel remaining), `Target proposals`, `Manual targets & exclusions`, `Automation settings`, `Monitor` — `ReplenishmentCenter.tsx`.
- All "workflow documents" (returns, loss, hold, corrections, quotations, counter sales, challans, gate passes, credit notes, purchase orders) share one register + editor: `WorkflowDocumentEditor.tsx`, `workflow-document-state.ts`.
- Legacy routes that land here: `/dashboard/inventory-updates` → Stock › Approve corrections; `/dashboard/stock-predictions` → Reorder › Manual targets.

### Pharmacy Report (`/dashboard/pharmacy/reports` — `frontend/src/components/pharmacy/reports/*`, `ComplianceCenter.tsx`, `ItemMarginReport.tsx`, `DayWiseSummaryReport.tsx`)
- Left menu by category with search ("Search reports, e.g. GSTR") and a "Common reports" landing page; open report + filters kept in the URL (`?report=`).
- GST Reports: Purchase Register, Purchase Bills, Sales Register, Sales Bills, Day wise Summary, GSTR-1, GSTR-3B, GSTR-2A, GSTR-2B, HSN wise GST, Composition GST Report. Margin: Item Wise Margin Report. Stock: Expiring Stock. Accounting: Daily Collection, GST Summary & Monthly P&L. Others: Daily Sales Summary – Doctorwise.
- Toolbar: period presets / custom dates, type, GST filter, more filters, column chooser, search within report, `Download` (Excel), `Print`.
- **Daily Collection** (also the sidebar "Daily Collection" item): clinic receipts beside pharmacy takings by payment mode; enter counted amounts per mode + note; `Save count` / `Save recount`.

### Reports & Analytics (`/dashboard/reports` — `frontend/src/app/dashboard/reports/page.tsx`)
- "System Alerts" strip (Overdue Invoices, Low Stock, Expiry Alerts, Pending Payments, Upcoming Appointments).
- Six report cards: Revenue Report, Patient Analytics, Doctor Performance, Appointment Analytics, Inventory Report, Payment Analytics; date range; `Generate Report`; `Export` as JSON / CSV / PDF / Excel.

### Users (`/dashboard/users` — `frontend/src/components/users/UsersManagement.tsx`, `DoctorAvailabilitySettings.tsx`, `ResetCodeButton.tsx`)
- `New User` / "Edit User" dialog (name, e-mail, phone, role, status, password 8–20 chars), delete.
- Per-user dialogs: "Role & Permissions" (`Apply Role`, permission checkboxes grouped by resource, `Save Permissions`), `Reset password` (reset code), and for doctors `Working Hours` and `WhatsApp Settings`.
- `Clinic Holidays` dialog.
- "WhatsApp Template Editor" (`Templates` → `Manage`): touchpoints Appointment Confirmation / Reminder / Invoice Share / Prescription Share; AI-generated draft; variables; `Save Template`; `Send Test`.

### Voice transcription test (`/test-transcribe` — `frontend/src/app/test-transcribe/page.tsx`)
- Lives **outside** `/dashboard` (no sidebar/header, no middleware guard): record audio, playback, `Transcribe`, results tabs Combined / By Speaker / Segments, diagnostics; `Back to dashboard`.

## Navigation Structure

Sidebar order and labels (`frontend/src/components/layout/sidebar.tsx`):

- **Overview**: Dashboard (`/dashboard`) · Daily Collection (`/dashboard/pharmacy/reports?report=daily-collection`)
- **Clinical**: Patients · Appointments · Visits · Procedures · Rooms
- **Pharmacy**: Pharmacy Desk (`/dashboard/pharmacy?section=desk`) · Pharmacy Counter (`?section=counter`) · Sales (`/dashboard/pharmacy/sales`) · Inventory (`/dashboard/inventory`) · Pharmacy Report (`/dashboard/pharmacy/reports`)
- **Admin**: Reports · Users · Fee list (`/dashboard/fees`) · Test Transcribe (`/test-transcribe`)

Pages with no sidebar entry: `/dashboard/patients/[id]`, `/dashboard/pharmacy/sales/bill`, `/dashboard/pharmacy/invoices`, `/dashboard/pharmacy/drugs`, `/dashboard/appointments/google-callback`, `/reset-password`.

Redirect-only routes: `/` → `/dashboard`; `/dashboard/billing` → Sales bill; `/dashboard/prescriptions` → Visits; `/dashboard/stock-predictions` → Inventory Reorder targets; `/dashboard/inventory-updates` → Inventory approvals; `/dashboard/pharmacy?section=billing|invoices|payments` (or any patient/prescription prefill) → Sales bill.

Cross-module links (the main care-to-cash spine):

1. **Patient → Appointment**: Patients detail `Book appointment` / tracker `Book` → `/dashboard/appointments?patientId=`.
2. **Appointment → Visit**: "Appointment Details" `Start Visit` → `/dashboard/visits?patientId=&appointmentId=&autoStart=true` (or `&visitId=` to resume); visit shows "From Appointment" and `Back to Calendar`.
3. **Patient → Visit** (no appointment): Patients row `Start Visit`, detail `Start new visit` / `Resume last visit`, tracker `Continue`; doctor Dashboard `Recent Visits`; header notification (doctor) → `/dashboard/visits?appointmentId=`.
4. **Appointment → Consultation bill**: billing chip or `Create bill` in the details dialog; `Set fees` link to the fee list for admins.
5. **Visit → Prescription → Pharmacy**: `Create Prescription` → "Go to Pharmacy?" → `/dashboard/pharmacy/sales/bill?patientId=&prescriptionId=&doctorId=`; or footer `Go to Pharmacy` (patient + doctor + visit); or patient tracker `Bill`.
6. **Pharmacy Counter → Sales bill**: queue row `Bill`, cockpit `Start billing` / `Walk-in bill`.
7. **Sales → Inventory**: `New return`, counter-sale and return rows open Inventory workflow documents and come back through `return=`.
8. **Inventory internal**: Today queues → filtered lists; Purchase bills → workbench → Stock; Stock › optimization → Purchases › Returns; Reorder › PO → Inward challan.
9. **Notifications**: low stock / expiry → `/dashboard/inventory?tab=low-stock|expiry`; overdue / pending money → `/dashboard/pharmacy/sales?pay=CREDIT`; appointments → `/dashboard/appointments`.
10. **Old Inventory report links** (`view=reports|daywise|margin`) → "This report is now under Pharmacy Report. Opening it…".

## Data Entities

| Entity (Prisma model) | UI CRUD |
|---|---|
| User, Role, Permission | Create / edit / delete / status / role / permission grants (Users). Read in doctor selects and search. |
| DoctorWorkingHours, DoctorTimeOff (leave, blocked, holiday) | Edit hours, add/remove time off, overbooking limit (My Settings; Users › Working Hours; Clinic Holidays). |
| Patient | Create (Patients; quick-create in Appointments), read, edit, archive/unarchive, link/unlink portal user, CSV export. |
| Appointment | Create, read, confirm / move calendar, reschedule, cancel. Statuses: SCHEDULED, CONFIRMED, CHECKED_IN, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW. |
| Room | Create / edit / delete / activate (Rooms › Manage Rooms). |
| Visit, VisitAttachment, DraftAttachment | Create (Visits, Procedures), autosave/update, complete; photos upload/delete. Status IN_PROGRESS → COMPLETED. |
| ClinicInvestigation | Add / rename / remove saved investigations (visit Lab Tests). |
| Prescription, PrescriptionTemplate, PrinterProfile, PrescriptionPrintEvent | Create/update prescription, create/delete templates, print/PDF/share events. Refills exist in the API; only a "Refill stamp" print toggle was found in the UI. |
| ClinicFee | Edit per bill type (Fee list). |
| NewInvoice / NewPayment (clinic bills) | Create bill, record payment (appointment bill dialog). No edit/cancel UI found. |
| Drug | Create / edit / delete (Drug database); quick create from the prescription builder. |
| PharmacyPackage | Create, browse (Pharmacy Desk). No edit/delete UI is mounted. |
| PharmacyInvoice (+Item, Revision, Payment) | Draft save/discard, confirm (checkout), discount revision, refund, mark paid, delete (invoice list), print/PDF. Statuses DRAFT, PENDING, CONFIRMED, DISPENSED, COMPLETED, CANCELLED; register shows Final / Draft / Cancelled. |
| PharmacyDispenseTask (+Line) | Created from the counter; line review; status QUEUED → IN_REVIEW → PARTIALLY_FILLED / PAUSED → READY_TO_BILL → PAID → DISPENSED / CANCELLED. |
| PrescriptionInventoryLink | Link / change the inventory item for a prescribed medicine. |
| PartnerOrganization, PartnerDailySale | Create daily sale, commit stock, reconcile lines. |
| PharmacyPurchaseInvoice (+Document, Item, Payment) | Upload/OCR, draft, review, post stock, correct, reject, pay, set off. Statuses DRAFT, OCR_REVIEW_REQUIRED, RECONCILIATION_FAILED, REVIEWED, STOCK_COMMITTED, CANCELLED. |
| Supplier, PharmacyTradeTerm | Create / edit suppliers; add / edit / delete terms. |
| InventoryItem (batch), StockTransaction | Add (via request/approval), edit details, edit price/stock (via approval), delete batch, set location, print label. |
| DrugInventoryChangeRequest, InventoryItemRequest | Create (pharmacist/reception), approve / reject (doctor/admin). PENDING → APPROVED / REJECTED. |
| InventoryWorkflowDocument (15 kinds) | Create draft, save, submit/post, reverse, cancel. Labels like "Draft • no stock change", "Awaiting manager approval", "Posted". |
| InventorySupplierCredit / allocations | Record credit note, set off, undo/reverse. |
| PharmacyCashCount | Save count / recount (Daily Collection). |
| WhatsAppTemplate | Create / edit / test (Users). |
| PharmacyAgentSession / Proposal | Chat, apply / reject proposals, archive / restore. |
| AuditLog | No UI. |

## Integrations

| Integration | Where in the UI | Server |
|---|---|---|
| Google Calendar (per-doctor OAuth) | Appointments calendar header; callback page | `backend/src/modules/google-calendar` (`GCAL_*`) |
| Gmail (purchase-invoice attachments) | Inventory › Purchases › Gmail intake | `backend/src/modules/inventory/inventory-workflow.controller.ts` (`GMAIL_*`) |
| WhatsApp Cloud API | Auto-confirmation on booking, patient reminder (Patients › More › WhatsApp), template editor + test send | `backend/src/modules/notifications`, `whatsapp-templates` (`WHATSAPP_*`) |
| WhatsApp click-to-chat (`wa.me`) | Prescription "PDF via WhatsApp" (native share sheet or download + chat), Sales register "Send on WhatsApp" | client only |
| E-mail (SMTP) | Prescription preview `Email` | `prescriptions.controller.ts` `:id/share-preview` (`SMTP_*`) |
| OpenAI — speech to text | Prescription builder mic buttons; `/test-transcribe` | `visits.controller.ts` `transcribe*` (`OPENAI_API_KEY`, `OPENAI_TRANSCRIBE_MODEL`) |
| OpenAI — translation (Hindi/Telugu) | Prescription print preview | `visits.controller.ts` `translate` |
| OpenAI — vision | Lab results autofill from a photo | `visits.controller.ts` `labs/autofill` |
| OpenAI — template generation | WhatsApp template editor "Generating…" | `whatsapp-templates.controller.ts` `generate` |
| Purchase-invoice OCR (Codex/vision model, `pdftotext`) | Inventory › Scan or enter bill | `pharmacy-purchase-invoice.controller.ts` (`PHARMACY_PURCHASE_OCR_*`) |
| Pharmacy AI assistant (Codex CLI) | Pharmacy Desk | `backend/src/modules/pharmacy-agent` (`PHARMACY_AGENT_CODEX_*`) |
| 1mg drug data | No direct UI found *(inferred: drug lookup/import)* | `backend/src/modules/pharmacy/one-mg` |
| Print / PDF | Prescription (Paged.js preview, print, PDF), pharmacy bill (print, PDF), batch QR labels, report print/Excel, CSV exports | client libs |
| Device camera / microphone | `Take Photo` in visit photos; voice dictation | browser APIs |
| Database backup | Dashboard › Admin Controls | `auth.controller.ts` `backup` |
| OpenPanel analytics | invisible | `frontend/src/lib/analytics` |

Tele-video is a **consultation type + consent record** on the visit and a "Telemedicine" appointment/room type; no in-app video call component was found.

## Error / Empty / Loading States

- **Shared primitives**: `LoadingSkeleton` (variants cards/table with a label), `EmptyState`, `Spinner`, toasts (`use-toast`), `ReviewStatus` — `frontend/src/components/ui/*`.
- **Session**: missing cookie → middleware redirect to `/login?next=`; API 401 → client redirect with return path; dashboard layout falls back to a minimal identity if the profile fetch fails; sidebar shows "Loading…" / "Unknown User" / "Unknown Role".
- **Dashboard**: distinct failure copy for 403 ("Your account does not have access to this yet…") vs unavailable ("This is not an empty list. Check your connection and try again.") with `Try again`; statistics failures are swallowed (cards show 0 / "unknown").
- **Global search**: "No results found for …"; failures are logged and silently yield no results.
- **Notifications**: failures silently show "No notifications".
- **Patients**: "Enter at least 2 characters to search"; patient detail "Patient not found." and error banner with `Back to Patients`; history "Unable to load history."
- **Appointments**: "Patient required" toast when clicking a slot without a patient; 409 "Scheduling Conflict"; "Overlaps existing appointment"; "Refreshing schedule…" overlay; optimistic tile colours (Newly Booked / Booking In Progress); "No appointments match the current filters."; Google callback error variants.
- **Bill dialog**: "Loading the bill…", "Could not load the bill" + `Retry`, inline validation ("Enter the fee as an amount above 0…", "Paid now can be from 0 up to the fee.").
- **Visits**: "Setup Required"; autosave status line; version-conflict and cross-tab draft conflicts; tele-video consent block; completion gate at 80 % progress; "Only doctors can complete a visit."
- **Prescription**: detailed create-error mapping (visit not found, patient/doctor not in branch, timeout, signed out); "Translation unavailable — Showing original text"; "Pagination Error"; signature image load failure blocks print; "Save the prescription first" tooltip on Email.
- **Sales bill**: "This draft no longer exists", "Could not open the draft" + `Try again`; "This draft was finished as bill …"; stock warnings (No match / Out of stock / Insufficient stock / Low stock); "GST rate needs review"; pending-checkout recovery ("Retry pending checkout", "Reopen confirmed invoice").
- **Inventory**: "Loading inventory permissions…" then `Retry permissions`; per-register `Retry records`; permission copy ("Supplier payments require purchase-ledger permission.", "You do not have access to price/stock approvals."); many recovery flows for interrupted imports and uncertain stock outcomes.
- **Pharmacy desk**: package load error "Make sure the backend server is running."; AI assistant "Agent unavailable" / "Assistant unavailable".
- **Native dialogs still in use**: `alert()` for backup result and role change (`Role updated to … successfully!`).
- No custom 404 / error boundary page was found under `frontend/src/app`.

## Conditional UI & Feature Flags

There is no feature-flag service; conditional UI is driven by role, server capability payloads and environment.

- **Role-filtered sidebar** and per-page role checks (see User Roles).
- **Server capabilities**: Inventory loads a capabilities object (`caps`) that hides/disables tasks (ledger, supplier write/update, credit write, per-kind write); the appointment schedule returns `billingAccess` (`read`, `createBill`, `takePayment`, `editFees`) that decides `Create bill` vs `View bill`.
- **Visit tabs by role** (`ROLE_PERMISSIONS` in `MedicalVisitForm.tsx`).
- **Pharmacy Desk**: metrics, `Refresh`, `Invoices`, `Drugs`, `New sale` only for OWNER/ADMIN/DOCTOR/PHARMACIST (`PHARMACY_SALES_ROLES`); reception sees the queue only.
- **Rooms**: `Manage Rooms` tab only for ADMIN/DOCTOR/OWNER; Room filter in Appointments hidden for MANAGER.
- **Google Calendar** controls hidden when the server reports it is not configured.
- **Environment**: OpenPanel analytics; all OpenAI features need `OPENAI_API_KEY`; WhatsApp, SMTP, Gmail, Google Calendar need their credentials.
- **Per-doctor settings**: overbooking (patients per slot), WhatsApp auto-confirm/template, signature, letterhead.
- **Stock reconciliation on/off** (Stock counts › Settings) — when off, "no counts are assigned".
- **Branded mode** toggle (cosmetic).
- **Tours**: seen-flags in `localStorage` per pathname; currently started manually (`autoStart` is not enabled where the tours are mounted).
- **Prescription language** switch enables translation; **Tele-video** enables the consent gate and changes the printed prescription.

## Redundancy Leads (duplicate paths, duplicate info, naming drift)

### A. Same goal reachable from more than one place

1. **Create a patient** — Patients `New Patient` (dialog "Create Patient", full form) vs Appointments `+ Add "…" as a new patient` (dialog "Add New Patient", short form; present in *both* Calendar and Slots tabs). Different field sets and titles.
2. **Book an appointment** — Appointments › Calendar tab vs Appointments › Slots tab (the Slots tab renders the same `DoctorDayCalendar` under a second set of filters and its own patient search) vs Patients "Create Patient" with Patient Type = Walk-in (books silently on submit).
3. **Start / resume a visit** — Appointment details `Start Visit`; Patients row `Start Visit`; patient detail `Start new visit` + `Resume last visit`; progress tracker `Continue` / `Start Visit`; Visits setup screen; doctor Dashboard `Recent Visits`; doctor notification bell; and **Procedures `Save Procedure`**, which also creates a visit.
4. **Record a procedure** — Procedures page form vs the "Procedures" section inside the prescription builder vs appointment type Procedure with "Procedure Name".
5. **Record vitals** — Visit `Vitals` tab vs "Clinical Details & Vitals" section inside the Prescription tab (height, weight, BP, pulse).
6. **Order investigations / labs** — Visit `Lab Tests` tab vs "Investigations" section in the prescription builder.
7. **Hand a prescription to the pharmacy** — builder footer `Go to Pharmacy`; post-create dialog `Yes, go to Pharmacy`; patient progress tracker `Bill`; Pharmacy Counter queue `Bill`; Sales bill page queue `Load`; cockpit `Start billing`.
8. **The prescription queue itself** appears three times: inside the Counter cockpit ("Rx queue"), as "Prescription Queue" directly beneath the cockpit on the same page, and again at the top of every new Sales bill.
9. **Create a pharmacy sale** — Sales `New sale`; Pharmacy Desk quick action `New sale`; cockpit `Walk-in bill`; Inventory › Sales › `Counter sales` (a different document type that also sells stock); legacy `/dashboard/billing` and `/dashboard/pharmacy?section=billing` redirects.
10. **Browse pharmacy bills** — Sales register; `/dashboard/pharmacy/invoices` ("Pharmacy Invoices", from the Desk `Invoices` button); Inventory › Sales › "Patient invoice history" (same `PharmacyInvoiceList` component); Pharmacy Report › Sales Register / Sales Bills.
11. **Take payment on a pharmacy bill** — confirm in the bill builder; invoice list `Mark as Paid` / `Retry Payment`; cockpit `Collect payment`; refunds only in the finished-bill view.
12. **Add a medicine / product** — Drug database `Add New Drug`; prescription builder `+ Add to Drug Database`; Inventory `Add batch` → "Add Inventory Item" (approval flow); created implicitly while posting a purchase bill; Excel opening-stock import; manual opening stock document.
13. **Bring stock in** — Scan or enter bill (OCR); Import CSV; Gmail intake; Inward challan; Manual opening stock; Opening stock import; PO › `Receive remaining stock`.
14. **Correct stock** — `Edit stock` (approval queue); `Corrections` document; Stock counts approve-and-adjust; `Loss & breakage`; "Post linked correction" on the item page; correct a posted purchase.
15. **Supplier returns / credits** — Stock › Stock optimization drafts; Purchases › Purchase bills › Returns tab; `Supplier returns` and `Credit notes` workflow documents; `Credits & vouchers`; "Return to supplier" inside a purchase's actions; a `Purchase returns` shortcut button on the Stock area.
16. **Pay a supplier** — Purchase bills row `Mark paid` ("Settle bill") vs `Payments & dues` bulk allocation vs set-off from the Returns register / Credits panel.
17. **Doctor working hours / leave / overbooking** — header "My Settings" (doctor, own) vs Users › `Working Hours` (admin, any doctor); holidays also via Users › `Clinic Holidays`.
18. **Doctor WhatsApp settings** — header "My Settings" vs Users › `WhatsApp Settings` (the Users version has extra phone-number-ID and token fields).
19. **Prescription letterhead / print layout** — My Settings `Prescription letterhead` upload; Visit › Customization "Print Background Image URL" + "Per-doctor Letterhead Profile"; preview `Letterhead` Default / None; margins editable in both Customization and the preview.
20. **Low stock / expiry review** — Dashboard System Alerts; notification bell; Reports & Analytics alerts strip and Inventory Report; Inventory Today queues; Stock list filters; Pharmacy Report › Expiring Stock; Stock optimization; Pharmacy Desk "Stock … low" metric.
21. **Reports** — `/dashboard/reports` (Revenue, Inventory, Payments …) overlaps `/dashboard/pharmacy/reports` (Sales Register, Daily Collection, margins); "Daily Collection" is both a sidebar item and a report inside Pharmacy Report; Purchase costs analytics stays in Inventory while other purchase reports moved out.
22. **Guides** — per-page `Quick Guide` dialogs, the Appointments in-page "Quick Guide", the intro.js Receptionist tour and Doctor "Visit Workflow Tour", plus the calendar legend. Several guides describe features that are not there (see C).

### B. Same information on several surfaces

- **Patient history / past visits**: patient detail `History` tab; Visits setup `Patient History` tab; visit form `History` tab ("Patient Visit History"); visit form "Patient Context" side panel; Procedures `Procedure History`; doctor Dashboard `Recent Visits`.
- **Patient photos**: patient detail `Uploads` tab and visit `Photos` tab (same `VisitPhotos` component; the detail page passes `visitId="temp"`).
- **Today's appointments**: Dashboard card, Appointments calendar, Rooms calendar, notification bell.
- **Patient identity block** repeated as page header badges, summary card and `Info` tab on the patient page (phone, e-mail, ABHA, gender, age each shown twice or more).
- **Page titles doubled**: Patients shows "Patients Management" then "Patients"; Users shows "Users Management" then "Users"; Rooms shows "Room Management" then a tab heading then "Rooms Management".
- **Role info on Visits setup**: "Your Role & Permissions" card and "Available Features" card say the same thing.
- **Bill status**: appointment row chip, appointment details dialog, bill dialog, Daily Collection.
- **Pharmacy sales totals**: Desk metrics, Sales register footer, invoice-list tiles, Daily Collection, Sales Register report, Reports & Analytics revenue.
- **Pending approvals count**: sidebar badge, Inventory task label "Approve corrections (n)", Today queue row.

### C. Naming drift (one concept, several names)

- **Bill / Invoice / Sale**: sidebar "Sales", button `New sale`, page region "Prescription bill", builder headings "Add Items to Invoice" / "Invoice Summary" / `Confirm Invoice`, list "Pharmacy Invoices", Inventory "Patient invoice history", register "Bill No", finished view "bill". Consultation bills are "bill" in the UI but `invoices` in the API and "Overdue Invoice" in alerts.
- **Two unrelated billing systems share the words**: clinic bills (`/billing/invoices`, no GST, created from the calendar) and pharmacy bills (`/pharmacy/invoices`, GST). The patient progress tracker's "Billing" step checks **clinic** invoices but its button opens a **pharmacy** bill.
- **Inventory / Stock / Drugs / Items / Products / Medicines / Batches**: "Inventory" (sidebar), "Stock" (area, metric), "Drug Database" / "Drug Management" / `Drugs`, "Add Inventory Item" opened by a button labelled `Add batch`, "Product" in purchases, "Medicine" in prescriptions.
- **Supplier / Distributor / Vendor**: "Suppliers" task, "Distributor" columns, "Distributor Analytics", "Supplier returns", "Supplier credits".
- **Purchase bill / Purchase invoice / Bill**: "Purchase bills", "Scan or enter bill", "Purchase invoices to review", "Invoice OCR", "Purchase Ledger" vs task name "Payments & dues".
- **Terms of Trade / Agreed terms / Trade terms**.
- **Customer returns / Sales returns / Returns** and **Supplier returns / Purchase returns / Return challan**.
- **Approve corrections / Price / stock approval queue / Inventory Updates / approval queue**; and "Corrections" is a different task from "Approve corrections".
- **Stock counts / Cycle count / Stock reconciliation / stocktake / audit**.
- **Reorder / Replenishment / Shortbook / Stock predictions / Targets**.
- **Visit / Consultation / Visit Documentation / Encounter**; **Telemedicine / TELEMED / Tele-video / Online**; **OPD / OPD Consultation / Offline (In-Clinic Visit) / In-person**.
- **Scheduled** is both a calendar column and an appointment status; "Confirm" moves between columns.
- **Receptionist / Reception / front desk / "the desk"**; **Therapist** (UI only, not a real role).
- **Lab Tests / Investigations / Labs**.
- **Pharmacy Desk / Command center / Pharmacy dashboard**; **Pharmacy Counter / Counter cockpit / Dispensing queue / Rx queue / Prescription Queue**; cockpit `Daily close` actually opens the Pharmacy Desk; Desk `Inventory Control` opens Inventory.
- **Reports** (admin) vs **Pharmacy Report** (singular) vs "Reports & Analytics".
- **Add vs New vs Create**: `New Patient` (guide says 'Add Patient') → "Create Patient" → `Create`; `New User` → "Create User"; `Add Room` → "Add New Room"; `Add New Drug` → "Add Drug".
- **Product name**: "ClinicMS" (sidebar, login) vs "Linaé" (document titles, letterhead).

### D. Stale or dead paths worth walking

- Links to `/dashboard/inventory?tab=low-stock`, `?tab=expiry` (notifications) and `?tab=pharmacy-control[&section=shelf]` (Pharmacy Desk `Inventory Control`, cockpit `Inventory control`) use a `tab` parameter the Inventory workspace does not read, so they land on **Today**.
- The Pharmacy guide still says "Use Inventory > Pharmacy Control for Excel import / invoice scanning"; no such area exists.
- Header search "Staff" results link to `/dashboard/users?search=<id>`, which the Users page does not read; patient results seed the Patients search box with the patient **ID** rather than opening the patient; appointment results always open the plain Appointments page.
- `View reports & alerts` in the bell goes to `/dashboard/reports`, which only OWNER/ADMIN/MANAGER have in their sidebar.
- OWNER has no Pharmacy Desk/Counter entry although the server admits the role; MANAGER has Inventory but no Sales.
- "My Settings" is empty for every role except DOCTOR, yet still shows `Save`.
- Components present in the repo but **not mounted on any route** (do not write stories for them): `frontend/src/components/billing/BillingManagement.tsx`, `pharmacy/PharmacyDashboard.tsx`, `pharmacy/PharmacyPackageManager.tsx`, `inventory/PharmacyInventoryControl.tsx` (+ `ShelfIntelligence.tsx`), `stock-prediction/StockPredictionDashboard.tsx`.
- Procedures › Analytics is a "coming soon" placeholder.
- Quick guides promise things with no matching UI (insurance details on patients, room amenities/cleaning schedules, "View user activity", Therapist role).
- `/test-transcribe` is a developer test page exposed in the Admin section of the sidebar.

## Recommended Story Topics

1. **Sign-in, app shell & dashboard** (`auth-shell-dashboard`) — entry to everything: login, admin-issued reset code, session expiry and return path, role-filtered sidebar, mobile nav, global search, notification bell, My Settings, branded mode, legacy redirects, role-specific dashboard, tours and quick guides. — key files: `frontend/src/app/login/page.tsx`, `frontend/src/app/reset-password/page.tsx`, `frontend/src/middleware.ts`, `frontend/src/components/layout/dashboard-layout.tsx`, `frontend/src/components/layout/sidebar.tsx`, `frontend/src/components/layout/header.tsx`, `frontend/src/components/layout/branded-mode-context.tsx`, `frontend/src/app/dashboard/page.tsx`, `frontend/src/components/dashboard/DoctorPatientPanels.tsx`, `frontend/src/components/tours/ReceptionistTour.tsx`, `frontend/src/components/tours/DoctorTour.tsx`, `frontend/src/components/common/QuickGuide.tsx`, `frontend/src/components/users/ResetCodeButton.tsx`, `frontend/src/lib/api.ts`, `backend/src/modules/auth/auth.controller.ts`

2. **Patient records** (`patients`) — the register everyone starts from: search/filter/export, create (incl. walk-in auto-booking), edit, archive/undo, portal link, WhatsApp reminder, detail page tabs, history filters, uploads, progress tracker and its cross-links. — key files: `frontend/src/app/dashboard/patients/page.tsx`, `frontend/src/components/patients/PatientsManagement.tsx`, `frontend/src/app/dashboard/patients/[id]/page.tsx`, `frontend/src/components/patients/PatientProgressTracker.tsx`, `frontend/src/components/visits/PatientHistoryVisitCard.tsx`, `frontend/src/components/visits/usePatientHistory.ts`, `frontend/src/components/visits/VisitPhotos.tsx`, `backend/src/modules/patients/patients.controller.ts`

3. **Appointments, rooms & doctor availability** (`appointments-rooms`) — front-desk scheduling: two-column Scheduled/Confirmed calendar, booking dialog, quick-create patient, confirm/reschedule/cancel, overbooking, blocked time, Slots tab, Google Calendar sync, room calendar and room management, working hours/leave/holidays that constrain booking. — key files: `frontend/src/app/dashboard/appointments/page.tsx`, `frontend/src/components/appointments/AppointmentsCalendar.tsx`, `DoctorDayCalendar.tsx`, `CalendarColumn.tsx`, `AppointmentBookingDialog.tsx`, `AppointmentScheduler.tsx`, `PatientQuickCreateDialog.tsx`, `useOverbookConfirm.tsx`, `appointment-calendars.ts`, `frontend/src/app/dashboard/appointments/google-callback/page.tsx`, `frontend/src/app/dashboard/rooms/page.tsx`, `frontend/src/components/rooms/RoomCalendar.tsx`, `frontend/src/components/rooms/RoomsManagement.tsx`, `frontend/src/components/users/DoctorAvailabilitySettings.tsx`, `frontend/src/lib/doctor-availability.ts`, `backend/src/modules/appointments/appointments.controller.ts`, `backend/src/modules/doctor-availability/doctor-availability.controller.ts`

4. **Consultation billing & fee list** (`clinic-billing-fees`) — money at the front desk: billing chip states, create bill from the fee list, part payment, payment modes and references, add another bill, permission-limited views, admin fee list, and how the takings surface in Daily Collection. — key files: `frontend/src/components/appointments/AppointmentBillDialog.tsx`, `frontend/src/components/appointments/appointment-billing-view.ts`, `frontend/src/app/dashboard/fees/page.tsx`, `frontend/src/components/billing/ClinicFeeList.tsx`, `frontend/src/lib/clinic-payment-modes.ts`, `frontend/src/components/pharmacy/reports/DailyCollectionReport.tsx`, `frontend/src/app/dashboard/billing/page.tsx`, `backend/src/modules/billing/billing.controller.ts`, `backend/src/modules/billing/clinic-fees.controller.ts`

5. **Visit documentation & procedures** (`visits-procedures`) — the clinical record: setup screen and deep links, role-based tabs, vitals, photos with position tagging and compare, lab tests with photo autofill and saved investigations, history, patient context, autosave/draft/conflict recovery, tele-video consent, shortcuts, complete-visit gate, and the separate Procedures page that also writes visits. — key files: `frontend/src/app/dashboard/visits/page.tsx`, `frontend/src/components/visits/MedicalVisitForm.tsx`, `VisitPhotos.tsx`, `PatientPhotoArchive.tsx`, `ClinicInvestigations.tsx`, `ClinicalHistoryDetails.tsx`, `VisitIdentityBar.tsx`, `VisitStateContext.tsx`, `frontend/src/app/dashboard/procedures/page.tsx`, `backend/src/modules/visits/visits.controller.ts`

6. **Prescription writing, printing & sharing** (`prescriptions`) — the doctor's core output: templates, drug search and quick-add, regimen suggestions and learned plans, voice dictation, custom sections, translation, review date, paginated preview with fit-to-one-page/letterhead/signature controls, interactions, print/PDF/WhatsApp/e-mail, signature and letterhead settings, customization tab, pharmacy hand-off. — key files: `frontend/src/components/visits/PrescriptionBuilder.tsx`, `frontend/src/components/visits/rx-table.tsx`, `frontend/src/lib/prescription-learning.ts`, `frontend/src/lib/frequency.ts`, `frontend/src/lib/prescription-letterhead.ts`, `frontend/src/lib/print-fit.ts`, `frontend/src/hooks/useSpeechToTextRecorder.ts`, `frontend/src/hooks/usePrescriptionSignature.ts`, `frontend/src/components/users/DoctorSignatureSettings.tsx`, `frontend/src/components/users/DoctorLetterheadSettings.tsx`, `frontend/src/app/test-transcribe/page.tsx`, `backend/src/modules/prescriptions/prescriptions.controller.ts`, `docs/PRESCRIPTION_PDF_PIPELINE.md`

7. **Pharmacy desk, counter & dispensing** (`pharmacy-desk-counter`) — pharmacist's workstation: desk metrics and quick actions, counter cockpit (review, substitute, pick, ready, paid), prescription queue and inventory linking, drug database, treatment packages, partner daily sync, AI assistant; role differences for reception. — key files: `frontend/src/app/dashboard/pharmacy/pharmacy-workspace.tsx`, `frontend/src/components/pharmacy/PharmacyCounterCockpit.tsx`, `PrescriptionDispensingQueue.tsx`, `PrescriptionInventoryLink.tsx`, `DrugManagement.tsx`, `PackageBrowser.tsx`, `PharmacyPackageCreator.tsx`, `PartnerDailySync.tsx`, `AgenticPharmacyDock.tsx`, `frontend/src/app/dashboard/pharmacy/drugs/page.tsx`, `backend/src/modules/pharmacy/pharmacy-dispense-task.controller.ts`, `backend/src/modules/pharmacy/pharmacy-prescription-queue.controller.ts`

8. **Pharmacy sales, bills & returns** (`pharmacy-sales`) — selling: Sales/Returns registers with URL filters, new sale from prescription or walk-in, stock warnings and substitution, drafts, confirm and print, finished bill view, discount revision, refund, WhatsApp/print from the register, the parallel invoice list, counter sales / quotations / customer returns in Inventory. — key files: `frontend/src/app/dashboard/pharmacy/sales/page.tsx`, `frontend/src/app/dashboard/pharmacy/sales/bill/page.tsx`, `frontend/src/components/pharmacy/sales/SalesRegister.tsx`, `sales-register-model.ts`, `sales-bill-model.ts`, `FinishedBillView.tsx`, `BillDiscountInput.tsx`, `frontend/src/components/pharmacy/PharmacyInvoiceBuilderFixed.tsx`, `frontend/src/components/pharmacy/PharmacyInvoiceList.tsx`, `frontend/src/app/dashboard/pharmacy/invoices/page.tsx`, `frontend/src/components/register/RegisterGrid.tsx`, `frontend/src/components/register/RegisterFilters.tsx`, `frontend/src/components/inventory/WorkflowDocumentEditor.tsx`, `frontend/src/lib/pharmacy-invoice-print.ts`, `backend/src/modules/pharmacy/pharmacy-invoice.controller.ts`

9. **Purchases, suppliers & payables** (`inventory-purchases`) — getting stock in and paying for it: scan/enter bill with OCR review and product matching, CSV and Gmail intake, purchase bills register, mark paid / set off / undo, returns and credit notes, suppliers, terms of trade, payments & dues ledger, inward challans, gate passes, purchase costs. — key files: `frontend/src/components/inventory/InventoryWorkspace.tsx`, `frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx`, `PurchaseSourcePreview.tsx`, `PurchaseFieldReview.tsx`, `PurchaseSupplierReview.tsx`, `PurchaseLedger.tsx`, `TradeTermsWorkspace.tsx`, `DistributorAnalytics.tsx`, `frontend/src/components/inventory/AlternateInvoiceIntake.tsx`, `PurchaseDocumentActions.tsx`, `SupplierCreditPanel.tsx`, `frontend/src/components/inventory/purchase/PurchaseBills.tsx`, `PurchaseRegister.tsx`, `PurchaseReturnsRegister.tsx`, `MarkPaidDialog.tsx`, `SetOffCreditDialog.tsx`, `RecordCreditNoteDialog.tsx`, `settle.tsx`, `frontend/src/lib/purchase-invoice-review.ts`, `backend/src/modules/pharmacy/pharmacy-purchase-invoice.controller.ts`, `docs/product/inventory-workflow-operator-guide.md`

10. **Stock control, counts & reorder** (`inventory-stock-reorder`) — keeping the shelf right: Today queues, stock list filters and export, item page, add batch/new-item request, price/stock edit approvals, stock counts (start, sheet, sign-off, approve/reject, settings), loss/blocked/corrections, opening stock, stock optimization, ledger, shortbook, purchase orders, target proposals, manual targets, automation and monitor. — key files: `frontend/src/components/inventory/InventoryWorkspace.tsx`, `workspace-model.ts`, `WorkspaceStock.tsx`, `InventoryItemPage.tsx`, `AddInventoryItemDialog.tsx`, `StockEditDialog.tsx`, `StockDetailsEditor.tsx`, `InventoryApprovals.tsx`, `InventoryUpdates.tsx`, `InventoryItemRequests.tsx`, `InventoryLedger.tsx`, `ReplenishmentCenter.tsx`, `WorkflowDocumentEditor.tsx`, `frontend/src/components/inventory/counts/StockCounts.tsx`, `CountSheet.tsx`, `CountRegister.tsx`, `StartCountDialog.tsx`, `SignOffDialog.tsx`, `DecisionDialog.tsx`, `ReconciliationSettingsPanel.tsx`, `frontend/src/components/inventory/optimization/StockOptimization.tsx`, `frontend/src/components/pharmacy/PharmacyInventoryStarterImport.tsx`, `backend/src/modules/inventory/inventory-workflow.controller.ts`, `backend/src/modules/inventory/inventory-item-request.controller.ts`

11. **Reports, users & clinic administration** (`reports-admin`) — oversight: Pharmacy Report catalogue (search, GST returns, margin, expiring stock, daily collection count), Reports & Analytics with exports, user accounts, roles and permission grants, reset codes, clinic holidays, per-doctor working hours and WhatsApp settings, WhatsApp template editor, database backup. — key files: `frontend/src/app/dashboard/pharmacy/reports/page.tsx`, `frontend/src/components/pharmacy/reports/PharmacyReportWorkspace.tsx`, `report-catalog.ts`, `ReportToolbar.tsx`, `TableReport.tsx`, `DailyCollectionReport.tsx`, `frontend/src/components/pharmacy/ComplianceCenter.tsx`, `ItemMarginReport.tsx`, `DayWiseSummaryReport.tsx`, `frontend/src/app/dashboard/reports/page.tsx`, `frontend/src/app/dashboard/users/page.tsx`, `frontend/src/components/users/UsersManagement.tsx`, `frontend/src/lib/whatsapp-settings.ts`, `backend/src/modules/users/users.controller.ts`, `backend/src/modules/pharmacy/pharmacy-reports.controller.ts`, `backend/src/modules/reports/reports.controller.ts`, `backend/src/modules/whatsapp-templates/whatsapp-templates.controller.ts`
