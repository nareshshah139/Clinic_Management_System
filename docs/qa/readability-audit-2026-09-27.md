# Application readability audit

**Date:** 27 September 2026

**Verdict:** The application has clear domain structure, but readability is inconsistent. Branded contrast, clinical-page reflow, a clipped patient dialog, and missing form labels need attention before the interface can be considered reliable across screen sizes.

**14 findings: 0 P0, 6 P1, 7 P2, 1 P3.** These are grouped root causes, not a count of every affected element. No application fixes were made.

## Scope and evidence

This audit treats readability as the ability to find, distinguish, understand, and verify information in the interface. It covers typography, contrast, hierarchy, labels, copy, density, reflow, and the accessibility structure that supports reading. It is not a source-code maintainability audit or a full accessibility certification.

- Inventoried **all 21 route files** and **137 non-test frontend source files**. Import tracing identified 123 reachable source files, including 94 TSX files. Legacy implementations were separated from active routes.
- Reviewed route content, shared components, forms, help text, and print-generation code. Hidden inventory workflows, permission-specific branches, photo flows, tours, and print output received source review; not every conditional state was rendered.
- Retained **54 valid browser observations across 25 surfaces/states**, using 1440×1000 desktop and 390×844 phone viewports, plus 320px reflow checks and branded-mode checks. The synthetic fixtures include a long patient name, a drug, a room, and empty workflow queues.
- All API traffic in the browser harness was intercepted. Non-GET requests were rejected. No patient, prescription, stock, invoice, or user records were changed.
- Obscura was used for the initial local-page read. Chrome was used for rendered layout, computed styles, and screenshots. A temporary frontend snapshot avoided interference from concurrent development.
- The repository was already modified and continued changing during the audit. Screenshots represent the local snapshot; source links identify the corresponding implementation at report preparation, not a deployed production version.

The usable measurements are in [verified-results.json](/Users/nshah/Clinic_Management_System/output/readability-audit-2026-09-27/verified-results.json). The [source inventory](/Users/nshah/Clinic_Management_System/output/readability-audit-2026-09-27/source-inventory.json) records scope and copy. Raw diagnostic runs retain early build conflicts and fixture-shape errors; those were excluded from findings. Corrected clinical and Inventory overview fixtures were verified separately.

Contrast measurements use computed colors converted to sRGB and composited against ancestor backgrounds. Gradient-backed text was excluded from numerical contrast claims. Disabled controls, decorative icons, and large text were not treated as ordinary-text failures. This was not an axe or screen-reader test.

## Assessment

The implementation fails a consistent readability baseline, although its workflows are clearly specific to clinic operations. Shared tokens and components exist, but local styling, fixed-width compositions, and inconsistent label wiring undermine them.

| Audit dimension | Assessment | Main evidence |
| --- | --- | --- |
| Accessibility supporting reading | 1/4 | Verified text-contrast failures and missing programmatic labels |
| Responsive reading | 1/4 | Clipped dialog and page-level horizontal overflow |
| Theming | 1/4 | Branded mode produces near-invisible foreground colors |
| Implementation consistency | 2/4 | Useful shared primitives; recurring hierarchy and copy drift |
| Performance | Not assessed | Outside this readability audit |

**Assessed subtotal: 5/16.** This is not a full 20-point technical audit score. Ratings express the severity of verified patterns, not a percentage of standards passed.

## P1 — major findings

### R1. Branded mode can make meaningful text nearly invisible

**Evidence:** On Reports, “Pending Payments” and “Upcoming Appointments” measured **1.08:1**: approximately `#e8e8e7` on `#f4f1e2`. Patient contact details and report descriptions measured **4.32:1**. These are active content, not disabled controls. [Screenshot](/Users/nshah/Clinic_Management_System/output/readability-audit-2026-09-27/reports-branded.png).

**Cause and location:** [brand.ts:94](/Users/nshah/Clinic_Management_System/frontend/src/lib/brand.ts:94) chooses an image-derived primary and checks its button foreground, but does not validate that primary as text on the application surfaces. [globals.css:165](/Users/nshah/Clinic_Management_System/frontend/src/app/globals.css:165) collapses several gray text levels to one muted color; [globals.css:184](/Users/nshah/Clinic_Management_System/frontend/src/app/globals.css:184) remaps blue, green, and purple text to the extracted primary.

**Impact:** Users can miss alerts, monetary information, and identifying details after enabling a supported appearance option.

**Recommendation:** Separate text/link colors from button-fill colors. Validate each foreground against its actual surface; constrain extracted colors or use a known accessible fallback. Preserve distinct primary, secondary, and muted text roles. Retest both cached and newly extracted palettes.

**Category / standard:** Theming, accessibility; [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Normal text requires at least 4.5:1; large text uses 3:1. **Suggested command:** `$impeccable colorize`.

### R2. Default-mode helper text, calendar times, and some status labels are too faint

**Evidence:** Appointment hour labels are **10px at 2.60:1**. The Patients search hint is **12px at 2.60:1**. Reports “Expiry Alerts” is **14px at 2.77:1**; “Upcoming Appointments” is **14px at 3.03:1**. Pharmacy Billing discount text measures **3.22:1 at 16px**.

**Locations:** [DoctorDayCalendar.tsx:364](/Users/nshah/Clinic_Management_System/frontend/src/components/appointments/DoctorDayCalendar.tsx:364), [PatientsManagement.tsx:926](/Users/nshah/Clinic_Management_System/frontend/src/components/patients/PatientsManagement.tsx:926), [Reports:1175](/Users/nshah/Clinic_Management_System/frontend/src/app/dashboard/reports/page.tsx:1175), [PharmacyInvoiceBuilderFixed.tsx:2528](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PharmacyInvoiceBuilderFixed.tsx:2528).

**Impact:** Scheduling and financial information demands more visual effort than nearby primary text. These colors are used for information users need to read.

**Recommendation:** Use darker semantic foregrounds on pale surfaces. Raise calendar times to a practical readable size and test each status color against its background. Preserve color as a supplementary cue.

**Category / standard:** Accessibility; [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). **Suggested command:** `$impeccable colorize`.

### R3. The patient-creation dialog extends above and below a phone screen

**Evidence:** At 390×844, the dialog is **1082px high**, spanning **y = −119 to 963**. The close button is above the screen; Cancel and Create start at **y = 902**. The dialog has `overflow-y: visible` and no internal scrolling. [Screenshot](/Users/nshah/Clinic_Management_System/output/readability-audit-2026-09-27/new-patient-mobile.png), [measurements](/Users/nshah/Clinic_Management_System/output/readability-audit-2026-09-27/final-checks.json).

**Locations:** [PatientsManagement.tsx:740](/Users/nshah/Clinic_Management_System/frontend/src/components/patients/PatientsManagement.tsx:740), shared [dialog.tsx:62](/Users/nshah/Clinic_Management_System/frontend/src/components/ui/dialog.tsx:62).

**Impact:** Users cannot read the entire form or reach the save/close actions in the ordinary phone view.

**Recommendation:** Bound long dialogs to the dynamic viewport and give the form body an explicit scroll region. Keep the title and actions reachable; use a full-screen form on small screens if needed. Apply this deliberately to long dialogs, including enlarged-text states.

**Category / standard:** Responsive reading; relevant to [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). **Suggested command:** `$impeccable adapt`.

### R4. The clinical form expands the entire page, including on desktop

**Evidence:** At a 1440px desktop viewport, the Prescription state has **1550px of content inside an 1184px main area**. At 390px, Visit Overview/Vitals expand to **1006px** and Prescription to **1542px**. The phone initially shows the patient-context column while the actual form sits to its right. [Desktop prescription](/Users/nshah/Clinic_Management_System/output/readability-audit-2026-09-27/prescription-desktop.png), [phone visit](/Users/nshah/Clinic_Management_System/output/readability-audit-2026-09-27/visits-mobile.png).

**Locations:** [MedicalVisitForm.tsx:1574](/Users/nshah/Clinic_Management_System/frontend/src/components/visits/MedicalVisitForm.tsx:1574) uses a horizontal flex layout and `w-80` context column; [MedicalVisitForm.tsx:1690](/Users/nshah/Clinic_Management_System/frontend/src/components/visits/MedicalVisitForm.tsx:1690) leaves the main flex child without a `min-w-0` constraint. [PrescriptionBuilder.tsx:5023](/Users/nshah/Clinic_Management_System/frontend/src/components/visits/PrescriptionBuilder.tsx:5023) contains the wide medicine table.

**Impact:** Patient identity, form labels, entered values, and save status cannot be read together. Ordinary form sections inherit the table's width pressure.

**Recommendation:** Stack or collapse patient context at smaller breakpoints, constrain the main flex child, and contain two-dimensional scrolling to the medicine table. Keep the rest of the form within the viewport. A table can legitimately scroll; that does not justify making the whole form scroll sideways.

**Category / standard:** Responsive reading; [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). **Suggested command:** `$impeccable adapt`.

### R5. Several nonclinical toolbars and the patient progress strip do not reflow

**Evidence:** At 390px, page-level content widths are **495px on Patients**, **649px on Patient Details**, **1093px on Rooms**, and **680px on Pharmacy Desk**. Patients and Rooms still require 495px and 1093px respectively at a **320px viewport**. The Patients description becomes a narrow stack of words while action buttons continue offscreen. [Patients](/Users/nshah/Clinic_Management_System/output/readability-audit-2026-09-27/patients-mobile.png), [Rooms](/Users/nshah/Clinic_Management_System/output/readability-audit-2026-09-27/rooms-mobile.png), [Patient Details](/Users/nshah/Clinic_Management_System/output/readability-audit-2026-09-27/patient-detail-mobile.png).

**Locations:** [PatientsManagement.tsx:729](/Users/nshah/Clinic_Management_System/frontend/src/components/patients/PatientsManagement.tsx:729), [RoomCalendar.tsx:260](/Users/nshah/Clinic_Management_System/frontend/src/components/rooms/RoomCalendar.tsx:260), [PatientProgressTracker.tsx:247](/Users/nshah/Clinic_Management_System/frontend/src/components/patients/PatientProgressTracker.tsx:247). Pharmacy Desk's embedded content also needs width containment around its table-heavy panels.

**Impact:** Users must pan to discover controls and workflow steps. Reading order breaks before reaching the data itself.

**Recommendation:** Wrap or stack toolbars, make filters fluid, and replace the fixed horizontal progress strip with a wrapping or vertical layout. Constrain embedded panels with `min-w-0`. Keep local table scrolling separate from page reflow.

**Category / standard:** Responsive reading; [WCAG 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). **Suggested command:** `$impeccable adapt`.

### R6. Many visible form labels are not associated with their controls

**Evidence:** The Create User dialog has **seven controls without associated labels**; Vitals has **nine**. The Users form renders `<Label>` beside inputs without `htmlFor`/`id`; Vitals uses unassociated `<label>` elements. Patients filters depend on the selected text, and Reports presents two date inputs beneath one unassociated “Date Range” label. These findings were checked in source after the DOM scan.

**Locations:** [UsersManagement.tsx:480](/Users/nshah/Clinic_Management_System/frontend/src/components/users/UsersManagement.tsx:480), [MedicalVisitForm.tsx:1926](/Users/nshah/Clinic_Management_System/frontend/src/components/visits/MedicalVisitForm.tsx:1926), [PatientsManagement.tsx:913](/Users/nshah/Clinic_Management_System/frontend/src/components/patients/PatientsManagement.tsx:913), [Reports:1232](/Users/nshah/Clinic_Management_System/frontend/src/app/dashboard/reports/page.tsx:1232).

**Impact:** Assistive technology cannot reliably connect the field to its purpose; selected filter values also lose context for sighted users.

**Recommendation:** Give each field a stable id and associated label, including explicit Start date/End date. Label select triggers through `aria-labelledby` where appropriate. Keep helper/error text connected through `aria-describedby`. The existing Create Patient form demonstrates correctly linked labels and can be reused as a pattern.

**Category / standard:** Accessibility, form comprehension; [labels and instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html), with programmatic relationships also relevant to WCAG 1.3.1/4.1.2. **Suggested command:** `$impeccable harden`.

## P2 — improve in the next pass

### R7. Vitals units disappear when users enter a value

**Location:** [MedicalVisitForm.tsx:1926](/Users/nshah/Clinic_Management_System/frontend/src/components/visits/MedicalVisitForm.tsx:1926).

**Evidence / impact:** `mmHg`, `bpm`, `°F`, `kg`, and `cm` are input placeholders. Once populated, the field shows the number without its unit. This makes entered values harder to verify and creates inconsistency with the more explicit prescription labels such as “Height (cm)”.

**Recommendation:** Put units in persistent labels or suffixes: “Temperature (°F)”, “Weight (kg)”, “Blood pressure — systolic (mmHg)”. Reserve placeholders for examples. **Category:** Form comprehension. **Suggested command:** `$impeccable clarify`.

### R8. Operational details use an overly small type scale

**Evidence:** The reachable source contains **507 `text-xs` occurrences and 53 explicit sizes below 12px**. These are source occurrences, not individual failures. Pharmacy Counter alone declares 19 sizes below 12px; its rendered desktop state contains 32 text elements below 13px. Queue status, Batch/Expiry/Stock labels, regimen details, and warning chips use 10–11px text.

**Locations:** [PharmacyCounterCockpit.tsx:981](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PharmacyCounterCockpit.tsx:981), [PharmacyCounterCockpit.tsx:1377](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PharmacyCounterCockpit.tsx:1377), [Pharmacy page:558](/Users/nshah/Clinic_Management_System/frontend/src/app/dashboard/pharmacy/page.tsx:558), [MedicalVisitForm.tsx:2181](/Users/nshah/Clinic_Management_System/frontend/src/components/visits/MedicalVisitForm.tsx:2181).

**Recommendation:** Establish a practical product scale: generally 14–16px for operational text and 12–13px only for genuinely secondary metadata. Increase space where needed instead of shrinking essential text. This is a readability recommendation; WCAG does not mandate a universal minimum font size. **Suggested command:** `$impeccable typeset`.

### R9. Ellipsis can hide distinguishing medicine information

**Locations:** [PharmacyCounterCockpit.tsx:975](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PharmacyCounterCockpit.tsx:975), [InventoryUpdates.tsx:519](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryUpdates.tsx:519), [PharmacyCounterCockpit.tsx:1380](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PharmacyCounterCockpit.tsx:1380).

**Evidence / impact:** Drug names, dose/frequency strings, manufacturer/pack details, and batch facts use one-line `truncate`. The cited elements do not offer an inline expand control or their own full-value tooltip. A distinguishing suffix can be hidden when values are longer than the available column. This is a **source-verified long-content risk**, not a claim that the short synthetic drug was misread.

**Recommendation:** Wrap medicine names and regimen text, retain strength/form/pack identifiers, and provide a keyboard/touch-accessible full-detail view. Avoid truncating batch and expiry verification values. **Category:** Content integrity. **Suggested command:** `$impeccable harden`.

### R10. Visual section titles often have no heading semantics

**Evidence:** Login, Procedures, and Pharmacy Billing had no semantic heading in their rendered main content. The shared `CardTitle` is a `div`, so visually distinct form sections are absent from a heading outline. Appointments exposed “Legend” as its heading while its principal title was a card title.

**Locations:** [card.tsx:32](/Users/nshah/Clinic_Management_System/frontend/src/components/ui/card.tsx:32), [Login:56](/Users/nshah/Clinic_Management_System/frontend/src/app/login/page.tsx:56), [Procedures:505](/Users/nshah/Clinic_Management_System/frontend/src/app/dashboard/procedures/page.tsx:505), [PharmacyInvoiceBuilderFixed.tsx:1872](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PharmacyInvoiceBuilderFixed.tsx:1872).

**Recommendation:** Provide one descriptive page heading and contextual section headings. Add a semantic option to CardTitle or use headings at call sites; do not turn every card title into the same heading level indiscriminately. **Category:** Reading structure/accessibility. **Suggested command:** `$impeccable harden`.

### R11. Some staff-facing copy is technical, abbreviated, or promotional

**Examples and locations:** “HITL”, “Sub”, and “NA” in [PharmacyCounterCockpit.tsx:490](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PharmacyCounterCockpit.tsx:490); “proposed DB updates” in [AgenticPharmacyDock.tsx:580](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/AgenticPharmacyDock.tsx:580); environment variable names in [AlternateInvoiceIntake.tsx:186](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/AlternateInvoiceIntake.tsx:186); “Name the diagnosis. The plan can assemble itself.” in [PrescriptionBuilder.tsx:4200](/Users/nshah/Clinic_Management_System/frontend/src/components/visits/PrescriptionBuilder.tsx:4200).

**Impact:** Staff must decode implementation concepts or infer the actual operation and review responsibility.

**Recommendation:** Use “Pharmacist review”, “Substitute”, “Unavailable”, and “proposed record changes”. Put administrator setup details behind a troubleshooting disclosure. Describe the prescription feature as suggesting or filling information with an explicit review step. Retain familiar domain terms such as GSTIN, with concise help where needed. **Suggested command:** `$impeccable clarify`.

### R12. Repeated headings and descriptions delay access to the task

**Evidence:** Patients shows “Patients Management”, “Patients”, then “Patient Records”, each with descriptive copy. Users and Invoices repeat the same pattern. On a phone, the Patients data heading appears only near the bottom of the first viewport.

**Locations:** [Patients route:10](/Users/nshah/Clinic_Management_System/frontend/src/app/dashboard/patients/page.tsx:10), [PatientsManagement.tsx:729](/Users/nshah/Clinic_Management_System/frontend/src/components/patients/PatientsManagement.tsx:729), [UsersManagement.tsx:469](/Users/nshah/Clinic_Management_System/frontend/src/components/users/UsersManagement.tsx:469), [Invoices route:13](/Users/nshah/Clinic_Management_System/frontend/src/app/dashboard/pharmacy/invoices/page.tsx:13).

**Recommendation:** Keep one page title and action area, followed by filters and results. Use section headings only when they distinguish different content. Preserve explanatory text that changes a decision or prevents an error. **Category:** Hierarchy and density. **Suggested command:** `$impeccable distill`.

### R13. The backend prescription PDF makes instructions smaller than medicine lines

**Source evidence:** [prescriptions.service.ts:1697](/Users/nshah/Clinic_Management_System/backend/src/modules/prescriptions/prescriptions.service.ts:1697) uses 11pt for medicine lines and **9pt gray text for instructions**. This is the backend PDF path; it is not a claim about every configurable frontend print format.

**Impact:** Patient-facing instructions receive less visual weight despite being information the reader needs to follow.

**Recommendation:** Test instructions at 11–12pt with adequate leading and clear separation. Verify long regimens, multilingual text, and actual printed size across the backend PDF and frontend preview paths. **Limitation:** Print-generation code was reviewed; no new production prescription or physical print was generated. **Suggested command:** `$impeccable typeset`.

## P3 — polish

### R14. Browser tabs all retain the starter application title

**Location:** [app/layout.tsx:17](/Users/nshah/Clinic_Management_System/frontend/src/app/layout.tsx:17).

The title is “Create Next App” across tested routes. This makes multiple clinic tabs and browser history harder to distinguish. Use concise titles such as “Patients · ClinicMS” and “Inventory · ClinicMS”, avoiding patient-identifying details in browser titles. **Suggested command:** `$impeccable polish`.

## Coverage by application area

“Rendered” means representative states with synthetic data, not every role, populated data volume, or error condition.

| Area | Review coverage | Main findings / observations |
| --- | --- | --- |
| Root, Login, shell | Source; Login and desktop/mobile shell rendered | R1, R10, R14; login labels are correctly associated |
| Dashboard | Source; desktop/mobile rendered | Generally clear primary typography; shared theme and card-heading concerns |
| Patients | List, detail, Create Patient dialog rendered | R2, R3, R5, R6, R12; Create Patient label associations are good |
| Appointments | Scheduler/calendar rendered; booking, quick-create, OAuth callback source-reviewed | R2, R6, R8, R10; useful textual calendar legend |
| Visits | Overview, Vitals, Prescription rendered; photos/history/customization source-reviewed | R4, R6, R7, R8, R10, R11 |
| Procedures | Main entry state rendered; history/analytics source-reviewed | R6, R10, R11; domain parameters generally have visible labels |
| Rooms | Calendar rendered; room administration source-reviewed | R5, R6; calendar toolbar, rather than just its grid, overflows |
| Pharmacy Desk | Main desk rendered; packages, partner entry, assistant source-reviewed | R5, R8, R11 |
| Pharmacy Counter | Empty queue/workstation rendered; populated review/pick rows source-reviewed | R8, R9, R11; long-content risks need populated regression fixtures |
| Pharmacy Billing | Builder, drug catalog, invoice list rendered | R2, R6, R10, R12; retain distinct money and unit labels |
| Inventory | Today, Stock, Purchases intake, Shortbook rendered | Better task navigation; some intake overflow; R6/R11 in deeper forms |
| Inventory workflows | Source review of register, suppliers, ledger, credits, imports, GST/compliance, analytics, stock detail, count/return/loss/hold/correction, sales, reorder targets/settings/monitor | Persistent labels and explicit saved/draft outcomes are useful; preserve these while simplifying copy |
| Inventory Updates | Catalog/approval area rendered; populated request/source review | R6, R9 |
| Reports | Revenue/main state and branded mode rendered; all six report renderers source-reviewed | R1, R2, R6, R10 |
| Users | List and Create User dialog rendered; roles/permissions/hours/WhatsApp source-reviewed | R6, R11, R12 |
| Help, tours, transcription | Help/tours source-reviewed; transcription page rendered | Some small tour annotations; shared copy/type improvements apply |
| Redirect routes | `/dashboard/billing`, `/dashboard/prescriptions`, `/dashboard/stock-predictions`, and `/` source-reviewed | Redirect to current workflows; not separate legacy screens |
| Printed output | Frontend prescription/invoice styling and backend prescription PDF source-reviewed | R13; physical output and all paper profiles remain unverified |

## What is working well

- The shell already collapses desktop navigation to an explicitly labelled phone navigation button.
- Login and Create Patient provide useful examples of associated labels; several newer inventory forms also use properly wrapped native labels.
- Patient history uses explicit field labels, preserved whitespace, word wrapping, and expandable details rather than relying solely on dense tables.
- Inventory separates named areas and tasks and provides explicit return navigation. Its Today, Stock, and Shortbook states fit the tested phone viewport.
- Purchase intake explains the original-document check, draft state, and stock consequences. Preserve that useful specificity while reducing repeated explanatory text.
- Shared tables provide an overflow container; Quick Guide and appointment-booking dialogs already demonstrate bounded scrolling. The fix is to apply those patterns consistently.
- The standard light theme generally gives primary body text strong contrast. Several failures are concentrated in semantic accent colors and branded overrides, making shared corrections valuable.

## Detector interpretation

The Impeccable detector emitted **108 raw observations**, primarily side-border and styling heuristics. They are not 108 readability defects. Calendar border colors can encode appointment categories, and Arial in print output is appropriate. Generic warnings about those patterns were not promoted to findings. Inactive legacy components were not counted as active-screen problems. [Raw detector output](/Users/nshah/Clinic_Management_System/output/readability-audit-2026-09-27/detector.json).

Dark-mode tokens were inspected, but no user-facing dark-mode switch was verified. No full dark-mode, performance, keyboard-navigation, or screen-reader conformance claim is made. The application’s High contrast control is local to the prescription preview; it does not establish an application-wide contrast pass.

## Recommended order

1. **P1 — `$impeccable colorize`:** repair branded text roles and default semantic text colors (R1–R2).
2. **P1 — `$impeccable adapt`:** bound the patient dialog, constrain the clinical layout, and reflow toolbars/progress (R3–R5).
3. **P1/P2 — `$impeccable harden`:** associate labels, restore semantic headings, and keep full medicine identifiers available (R6, R9–R10).
4. **P2 — `$impeccable clarify`:** persist units and replace ambiguous staff-facing copy (R7, R11).
5. **P2 — `$impeccable typeset` and `$impeccable distill`:** improve operational and printed type; remove repeated page introductions (R8, R12–R13).
6. **P3 — `$impeccable polish`:** finish browser titles and consistency (R14).

After fixes, repeat contrast checks in default and branded modes, 320/390px reflow checks, large-text and text-spacing checks, labelled-form inspection, and populated medicine-row/print samples. The exploratory 200% root-text and text-spacing screenshots in the evidence directory are not a browser-zoom or WCAG conformance pass; a formal resize/spacing verification remains necessary. See [W3C text-spacing guidance](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html).

The recommendations can be addressed one at a time or together. Re-run `$impeccable audit` after implementation to verify the result.
