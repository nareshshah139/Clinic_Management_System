# UX Path Catalog: Linaé ClinicMS (Clinic Management System)

Generated: 2026-11-07 (ux-paths Phase 3 consolidation)
Total Stories: 120
Coverage: 118 / 120 UI-reachable features (98.3%). Four more features are only partly exercised; see the Coverage Matrix.

Inputs: [`discovery.md`](discovery.md) and the 10 topic files in [`topics/`](topics/). Deduplicated defects found while mapping are in [`defects.md`](defects.md).

**About this catalog**
- **Stories are included by reference.** Each entry below gives the title, type, persona, ideal path and alternate paths, plus a link to the full story (steps, variations, edge cases) in its topic file. The full bodies are not copied here, to keep the catalog readable. /ux-walker should open the linked topic section for the steps.
- **IDs.** Every story has a sequential catalog ID, STORY-001 to STORY-120, ordered by the topic order recommended in discovery. The topic files used colliding numbers (four files use STORY-001..012; the others use 201.., 401.., 601.., 701.., 801.., 901..). Browser walk reports are filed under the **original** ID in `docs/ux-walker/stories/{topic-slug}--STORY-{original}/`, so use the mapping table below to translate. In this catalog, "STORY-nnn" always means the catalog ID unless a topic slug is written in front of it.
- **No stories were deleted.** Walk reports are keyed by original ID, so near-duplicates stay in place. They are flagged under "Cross-topic overlaps", with a suggested primary story for each.
- **Seed gaps that affect the walk.** The seed has no OWNER, NURSE, MANAGER, PHARMACIST or ACCOUNTANT user. Stories that need one depend on STORY-110 (an admin creates the user first). Pharmacist stories assume "Suresh Goud" or "Farhana Begum" exists. `admin@clinic.test` can stand in, because ADMIN passes every role check.

## Summary

| Type | Count |
|------|-------|
| Short | 39 |
| Medium | 65 |
| Long | 16 |
| **Total** | **120** |

| Topic | Catalog IDs | Short | Medium | Long |
|---|---|---|---|---|
| auth-shell-navigation | 001–012 | 3 | 7 | 2 |
| patients-records | 013–024 | 5 | 6 | 1 |
| appointments-scheduling-rooms | 025–036 | 3 | 8 | 1 |
| visit-documentation | 037–048 | 5 | 6 | 1 |
| prescriptions-print-share | 049–060 | 6 | 5 | 1 |
| pharmacy-counter-billing | 061–072 | 4 | 7 | 1 |
| pharmacy-desk-catalog-ai | 073–084 | 4 | 6 | 2 |
| inventory-stock-sales-reorder | 085–096 | 3 | 6 | 3 |
| purchases-suppliers-compliance | 097–108 | 3 | 7 | 2 |
| admin-users-reports-messaging | 109–120 | 3 | 7 | 2 |

Personas covered: ADMIN (most back-office stories), DOCTOR (Dr. Shravya, Dr. Praneeta), RECEPTION (Riya), PHARMACIST (created), NURSE (created), MANAGER (created), ACCOUNTANT, PATIENT and LAB_TECH (sidebar checks only, in STORY-005, 024, 119 and 120). OWNER is never the main persona of a story.

## Catalog ID mapping

Use this table to find the walk-report folder for a catalog ID.

| Catalog ID | Topic file | Original ID | Title | Walk report folder |
|---|---|---|---|---|
| STORY-001 | `topics/auth-shell-navigation.md` | STORY-001 | Front-desk sign-in with a phone number | `docs/ux-walker/stories/auth-shell-navigation--STORY-001/` |
| STORY-002 | `topics/auth-shell-navigation.md` | STORY-002 | Following a shared deep link while signed out, plus old bookmarks and a 404 | `docs/ux-walker/stories/auth-shell-navigation--STORY-002/` |
| STORY-003 | `topics/auth-shell-navigation.md` | STORY-003 | Admin issues a reset code and the receptionist sets a new password | `docs/ux-walker/stories/auth-shell-navigation--STORY-003/` |
| STORY-004 | `topics/auth-shell-navigation.md` | STORY-004 | The session expires overnight, then she logs out on purpose | `docs/ux-walker/stories/auth-shell-navigation--STORY-004/` |
| STORY-005 | `topics/auth-shell-navigation.md` | STORY-005 | Admin checks what each new hire will see in the sidebar | `docs/ux-walker/stories/auth-shell-navigation--STORY-005/` |
| STORY-006 | `topics/auth-shell-navigation.md` | STORY-006 | Receptionist on a phone uses the mobile drawer | `docs/ux-walker/stories/auth-shell-navigation--STORY-006/` |
| STORY-007 | `topics/auth-shell-navigation.md` | STORY-007 | Finding a patient from the header search | `docs/ux-walker/stories/auth-shell-navigation--STORY-007/` |
| STORY-008 | `topics/auth-shell-navigation.md` | STORY-008 | The notifications bell for each role | `docs/ux-walker/stories/auth-shell-navigation--STORY-008/` |
| STORY-009 | `topics/auth-shell-navigation.md` | STORY-009 | Switching on Branded mode | `docs/ux-walker/stories/auth-shell-navigation--STORY-009/` |
| STORY-010 | `topics/auth-shell-navigation.md` | STORY-010 | Learning from the Quick Guides and the Visit Workflow Tour | `docs/ux-walker/stories/auth-shell-navigation--STORY-010/` |
| STORY-011 | `topics/auth-shell-navigation.md` | STORY-011 | Morning dashboard check — Admin backup and doctor panels | `docs/ux-walker/stories/auth-shell-navigation--STORY-011/` |
| STORY-012 | `topics/auth-shell-navigation.md` | STORY-012 | A new receptionist's first morning, end to end | `docs/ux-walker/stories/auth-shell-navigation--STORY-012/` |
| STORY-013 | `topics/patients-records.md` | STORY-201 | Receptionist finds a returning patient by phone prefix and opens her record | `docs/ux-walker/stories/patients-records--STORY-201/` |
| STORY-014 | `topics/patients-records.md` | STORY-202 | Registering a new non-walk-in patient, recovering from a phone-format error | `docs/ux-walker/stories/patients-records--STORY-202/` |
| STORY-015 | `topics/patients-records.md` | STORY-203 | Walk-in patient registered and auto-booked into the next free slot | `docs/ux-walker/stories/patients-records--STORY-203/` |
| STORY-016 | `topics/patients-records.md` | STORY-204 | Correcting a patient's details with Edit Patient | `docs/ux-walker/stories/patients-records--STORY-204/` |
| STORY-017 | `topics/patients-records.md` | STORY-205 | Archiving a duplicate record, then undoing a mistaken archive | `docs/ux-walker/stories/patients-records--STORY-205/` |
| STORY-018 | `topics/patients-records.md` | STORY-206 | Linking (and later unlinking) patient-portal access | `docs/ux-walker/stories/patients-records--STORY-206/` |
| STORY-019 | `topics/patients-records.md` | STORY-207 | Sending a WhatsApp appointment reminder from the patient list | `docs/ux-walker/stories/patients-records--STORY-207/` |
| STORY-020 | `topics/patients-records.md` | STORY-208 | Admin filters recent female online patients and exports them to CSV | `docs/ux-walker/stories/patients-records--STORY-208/` |
| STORY-021 | `topics/patients-records.md` | STORY-209 | Doctor reviews a patient's chart on the detail page before consultation | `docs/ux-walker/stories/patients-records--STORY-209/` |
| STORY-022 | `topics/patients-records.md` | STORY-210 | Using the progress tracker to move a patient from booking to billing | `docs/ux-walker/stories/patients-records--STORY-210/` |
| STORY-023 | `topics/patients-records.md` | STORY-211 | Front-desk morning to doctor follow-through (end-to-end) | `docs/ux-walker/stories/patients-records--STORY-211/` |
| STORY-024 | `topics/patients-records.md` | STORY-212 | Role boundaries on patient records (nurse, manager, pharmacist by URL) | `docs/ux-walker/stories/patients-records--STORY-212/` |
| STORY-025 | `topics/appointments-scheduling-rooms.md` | STORY-001 | Receptionist books a routine OPD consultation for a returning patient | `docs/ux-walker/stories/appointments-scheduling-rooms--STORY-001/` |
| STORY-026 | `topics/appointments-scheduling-rooms.md` | STORY-002 | Walk-in first-time patient created inline while booking | `docs/ux-walker/stories/appointments-scheduling-rooms--STORY-002/` |
| STORY-027 | `topics/appointments-scheduling-rooms.md` | STORY-003 | Book a 60-minute Chemical Peel in a procedure room | `docs/ux-walker/stories/appointments-scheduling-rooms--STORY-003/` |
| STORY-028 | `topics/appointments-scheduling-rooms.md` | STORY-004 | Doctor clicks "Book appointment" from a patient's chart for a follow-up | `docs/ux-walker/stories/appointments-scheduling-rooms--STORY-004/` |
| STORY-029 | `topics/appointments-scheduling-rooms.md` | STORY-005 | Patient calls to move her appointment to the afternoon (reschedule) | `docs/ux-walker/stories/appointments-scheduling-rooms--STORY-005/` |
| STORY-030 | `topics/appointments-scheduling-rooms.md` | STORY-006 | Cancel a no-show appointment, with a "Keep" change of mind | `docs/ux-walker/stories/appointments-scheduling-rooms--STORY-006/` |
| STORY-031 | `topics/appointments-scheduling-rooms.md` | STORY-007 | Doctor connects her Google Calendar | `docs/ux-walker/stories/appointments-scheduling-rooms--STORY-007/` |
| STORY-032 | `topics/appointments-scheduling-rooms.md` | STORY-008 | Doctor sets a split weekly schedule and marks a CME leave | `docs/ux-walker/stories/appointments-scheduling-rooms--STORY-008/` |
| STORY-033 | `topics/appointments-scheduling-rooms.md` | STORY-009 | Admin declares Sankranti a clinic holiday and fixes a doctor's hours | `docs/ux-walker/stories/appointments-scheduling-rooms--STORY-009/` |
| STORY-034 | `topics/appointments-scheduling-rooms.md` | STORY-010 | Receptionist checks which procedure room is free for a walk-in laser touch-up | `docs/ux-walker/stories/appointments-scheduling-rooms--STORY-010/` |
| STORY-035 | `topics/appointments-scheduling-rooms.md` | STORY-011 | Admin adds a new laser room, then retires an old one | `docs/ux-walker/stories/appointments-scheduling-rooms--STORY-011/` |
| STORY-036 | `topics/appointments-scheduling-rooms.md` | STORY-012 | A full clinic day — from morning schedule check to the doctor starting visits | `docs/ux-walker/stories/appointments-scheduling-rooms--STORY-012/` |
| STORY-037 | `topics/visit-documentation.md` | STORY-401 | Dr. Shravya documents an acne follow-up end to end, from a calendar tile to Complete Visit | `docs/ux-walker/stories/visit-documentation--STORY-401/` |
| STORY-038 | `topics/visit-documentation.md` | STORY-402 | Dr. Praneeta starts a walk-in visit from the Visits setup screen | `docs/ux-walker/stories/visit-documentation--STORY-402/` |
| STORY-039 | `topics/visit-documentation.md` | STORY-403 | Nurse Swathi records pre-consult vitals and hits a backend wall | `docs/ux-walker/stories/visit-documentation--STORY-403/` |
| STORY-040 | `topics/visit-documentation.md` | STORY-404 | Receptionist Riya captures "before" photos for a laser-hair-reduction patient | `docs/ux-walker/stories/visit-documentation--STORY-404/` |
| STORY-041 | `topics/visit-documentation.md` | STORY-405 | Dr. Shravya compares melasma photos across visits and removes a blurry shot | `docs/ux-walker/stories/visit-documentation--STORY-405/` |
| STORY-042 | `topics/visit-documentation.md` | STORY-406 | Dictating chief complaints and examination by voice | `docs/ux-walker/stories/visit-documentation--STORY-406/` |
| STORY-043 | `topics/visit-documentation.md` | STORY-407 | AI-autofilling pre-methotrexate labs from a diagnostic-centre PDF | `docs/ux-walker/stories/visit-documentation--STORY-407/` |
| STORY-044 | `topics/visit-documentation.md` | STORY-408 | Tele-video follow-up blocked until consent is recorded | `docs/ux-walker/stories/visit-documentation--STORY-408/` |
| STORY-045 | `topics/visit-documentation.md` | STORY-409 | Two doctors edit the same visit; autosave conflict and recovery | `docs/ux-walker/stories/visit-documentation--STORY-409/` |
| STORY-046 | `topics/visit-documentation.md` | STORY-410 | Walk-in documentation lost after a refresh, and session expiry mid-visit | `docs/ux-walker/stories/visit-documentation--STORY-410/` |
| STORY-047 | `topics/visit-documentation.md` | STORY-411 | Recording a Soprano laser hair reduction session on the Procedures page | `docs/ux-walker/stories/visit-documentation--STORY-411/` |
| STORY-048 | `topics/visit-documentation.md` | STORY-412 | Admin sanity-checks speech transcription on /test-transcribe | `docs/ux-walker/stories/visit-documentation--STORY-412/` |
| STORY-049 | `topics/prescriptions-print-share.md` | STORY-001 | Dr. Shravya writes, prints and hands off an acne prescription for a walk-in college student | `docs/ux-walker/stories/prescriptions-print-share--STORY-001/` |
| STORY-050 | `topics/prescriptions-print-share.md` | STORY-002 | Printing a Telugu prescription for an elderly patient | `docs/ux-walker/stories/prescriptions-print-share--STORY-002/` |
| STORY-051 | `topics/prescriptions-print-share.md` | STORY-003 | Fitting a long acne-scar + melasma regimen onto one page | `docs/ux-walker/stories/prescriptions-print-share--STORY-003/` |
| STORY-052 | `topics/prescriptions-print-share.md` | STORY-004 | New doctor sets up signature and letterhead before her first OPD | `docs/ux-walker/stories/prescriptions-print-share--STORY-004/` |
| STORY-053 | `topics/prescriptions-print-share.md` | STORY-005 | Emailing the prescription PDF to a patient who left without the printout | `docs/ux-walker/stories/prescriptions-print-share--STORY-005/` |
| STORY-054 | `topics/prescriptions-print-share.md` | STORY-006 | Sending the prescription on WhatsApp from the desktop | `docs/ux-walker/stories/prescriptions-print-share--STORY-006/` |
| STORY-055 | `topics/prescriptions-print-share.md` | STORY-007 | Building a reusable melasma template and cleaning up old ones | `docs/ux-walker/stories/prescriptions-print-share--STORY-007/` |
| STORY-056 | `topics/prescriptions-print-share.md` | STORY-008 | Reception bills the medicines after the doctor's handoff | `docs/ux-walker/stories/prescriptions-print-share--STORY-008/` |
| STORY-057 | `topics/prescriptions-print-share.md` | STORY-009 | Quick follow-up using last visit's medicines and treatment suggestions | `docs/ux-walker/stories/prescriptions-print-share--STORY-009/` |
| STORY-058 | `topics/prescriptions-print-share.md` | STORY-010 | Prescribing a brand that is not in the drug master, with a custom dosing pattern | `docs/ux-walker/stories/prescriptions-print-share--STORY-010/` |
| STORY-059 | `topics/prescriptions-print-share.md` | STORY-011 | Reprinting an old prescription from the visit history | `docs/ux-walker/stories/prescriptions-print-share--STORY-011/` |
| STORY-060 | `topics/prescriptions-print-share.md` | STORY-012 | Non-doctor roles look for the prescription controls | `docs/ux-walker/stories/prescriptions-print-share--STORY-012/` |
| STORY-061 | `topics/pharmacy-counter-billing.md` | STORY-601 | Accept every line of a morning acne prescription and mark it ready to bill | `docs/ux-walker/stories/pharmacy-counter-billing--STORY-601/` |
| STORY-062 | `topics/pharmacy-counter-billing.md` | STORY-602 | Pause a prescription because the antifungal is out of stock, with a note to the doctor | `docs/ux-walker/stories/pharmacy-counter-billing--STORY-602/` |
| STORY-063 | `topics/pharmacy-counter-billing.md` | STORY-603 | Doctor prescribes, then the pharmacist reviews, bills, prints, collects and dispenses (end to end) | `docs/ux-walker/stories/pharmacy-counter-billing--STORY-603/` |
| STORY-064 | `topics/pharmacy-counter-billing.md` | STORY-604 | Load a prescription whose cream is not linked to inventory and link it once for all patients | `docs/ux-walker/stories/pharmacy-counter-billing--STORY-604/` |
| STORY-065 | `topics/pharmacy-counter-billing.md` | STORY-605 | Walk-in customer buys a sunscreen and an acne care package without a prescription | `docs/ux-walker/stories/pharmacy-counter-billing--STORY-605/` |
| STORY-066 | `topics/pharmacy-counter-billing.md` | STORY-606 | Wi-Fi drops while confirming; recover the pending checkout without double billing | `docs/ux-walker/stories/pharmacy-counter-billing--STORY-606/` |
| STORY-067 | `topics/pharmacy-counter-billing.md` | STORY-607 | Re-print a duplicate copy of yesterday's invoice for an insurance claim | `docs/ux-walker/stories/pharmacy-counter-billing--STORY-607/` |
| STORY-068 | `topics/pharmacy-counter-billing.md` | STORY-608 | Evening reconciliation in Pharmacy Invoices: filter unpaid UPI bills, collect, and try to delete a mistake | `docs/ux-walker/stories/pharmacy-counter-billing--STORY-608/` |
| STORY-069 | `topics/pharmacy-counter-billing.md` | STORY-609 | Receptionist covers the pharmacy counter during the pharmacist's lunch | `docs/ux-walker/stories/pharmacy-counter-billing--STORY-609/` |
| STORY-070 | `topics/pharmacy-counter-billing.md` | STORY-610 | Doctor sends the patient straight to Pharmacy from the prescription | `docs/ux-walker/stories/pharmacy-counter-billing--STORY-610/` |
| STORY-071 | `topics/pharmacy-counter-billing.md` | STORY-611 | Front desk checks whether a patient's medicines are already billed from the patient profile | `docs/ux-walker/stories/pharmacy-counter-billing--STORY-611/` |
| STORY-072 | `topics/pharmacy-counter-billing.md` | STORY-612 | Triage a long Saturday queue: filters, overdue items and the second queue table | `docs/ux-walker/stories/pharmacy-counter-billing--STORY-612/` |
| STORY-073 | `topics/pharmacy-desk-catalog-ai.md` | STORY-701 | Morning glance at the Pharmacy Desk metric strip | `docs/ux-walker/stories/pharmacy-desk-catalog-ai--STORY-701/` |
| STORY-074 | `topics/pharmacy-desk-catalog-ai.md` | STORY-702 | Receptionist opens the Pharmacy Desk and finds that most of it doesn't work for her | `docs/ux-walker/stories/pharmacy-desk-catalog-ai--STORY-702/` |
| STORY-075 | `topics/pharmacy-desk-catalog-ai.md` | STORY-703 | Add a new depigmentation cream to the drug master | `docs/ux-walker/stories/pharmacy-desk-catalog-ai--STORY-703/` |
| STORY-076 | `topics/pharmacy-desk-catalog-ai.md` | STORY-704 | Correct a drug's details, try a price change, and retire an old SKU | `docs/ux-walker/stories/pharmacy-desk-catalog-ai--STORY-704/` |
| STORY-077 | `topics/pharmacy-desk-catalog-ai.md` | STORY-705 | Find all Glenmark dermatology products in the catalog | `docs/ux-walker/stories/pharmacy-desk-catalog-ai--STORY-705/` |
| STORY-078 | `topics/pharmacy-desk-catalog-ai.md` | STORY-706 | Dr. Shravya builds a melasma night-care treatment package | `docs/ux-walker/stories/pharmacy-desk-catalog-ai--STORY-706/` |
| STORY-079 | `topics/pharmacy-desk-catalog-ai.md` | STORY-707 | Review a pre-built acne package before recommending it | `docs/ux-walker/stories/pharmacy-desk-catalog-ai--STORY-707/` |
| STORY-080 | `topics/pharmacy-desk-catalog-ai.md` | STORY-708 | Record the partner pharmacy's daily sale before the 10 p.m. cut-off | `docs/ux-walker/stories/pharmacy-desk-catalog-ai--STORY-708/` |
| STORY-081 | `topics/pharmacy-desk-catalog-ai.md` | STORY-709 | Reconcile a partner sale whose batch doesn't match clinic stock | `docs/ux-walker/stories/pharmacy-desk-catalog-ai--STORY-709/` |
| STORY-082 | `topics/pharmacy-desk-catalog-ai.md` | STORY-710 | Ask the Pharmacy AI assistant about low stock and act on its proposal | `docs/ux-walker/stories/pharmacy-desk-catalog-ai--STORY-710/` |
| STORY-083 | `topics/pharmacy-desk-catalog-ai.md` | STORY-711 | Manage AI chat threads — new chat, archive, restore | `docs/ux-walker/stories/pharmacy-desk-catalog-ai--STORY-711/` |
| STORY-084 | `topics/pharmacy-desk-catalog-ai.md` | STORY-712 | Admin's end-of-week pharmacy catalog clean-up, end to end | `docs/ux-walker/stories/pharmacy-desk-catalog-ai--STORY-712/` |
| STORY-085 | `topics/inventory-stock-sales-reorder.md` | STORY-801 | Morning triage from the Inventory "Today" queues | `docs/ux-walker/stories/inventory-stock-sales-reorder--STORY-801/` |
| STORY-086 | `topics/inventory-stock-sales-reorder.md` | STORY-802 | Pharmacist-side stock correction approved by a doctor | `docs/ux-walker/stories/inventory-stock-sales-reorder--STORY-802/` |
| STORY-087 | `topics/inventory-stock-sales-reorder.md` | STORY-803 | Receptionist explores Inventory and runs into permission walls | `docs/ux-walker/stories/inventory-stock-sales-reorder--STORY-803/` |
| STORY-088 | `topics/inventory-stock-sales-reorder.md` | STORY-804 | Add a new batch and post its opening balance manually | `docs/ux-walker/stories/inventory-stock-sales-reorder--STORY-804/` |
| STORY-089 | `topics/inventory-stock-sales-reorder.md` | STORY-805 | First-day setup from the old pharmacy's Excel stock sheet | `docs/ux-walker/stories/inventory-stock-sales-reorder--STORY-805/` |
| STORY-090 | `topics/inventory-stock-sales-reorder.md` | STORY-806 | Doctor-led expiry count with variance that needs manager approval | `docs/ux-walker/stories/inventory-stock-sales-reorder--STORY-806/` |
| STORY-091 | `topics/inventory-stock-sales-reorder.md` | STORY-807 | Hold a suspected batch, then return it to the distributor for credit | `docs/ux-walker/stories/inventory-stock-sales-reorder--STORY-807/` |
| STORY-092 | `topics/inventory-stock-sales-reorder.md` | STORY-808 | Walk-in counter sale from Inventory, including a quotation and FEFO override | `docs/ux-walker/stories/inventory-stock-sales-reorder--STORY-808/` |
| STORY-093 | `topics/inventory-stock-sales-reorder.md` | STORY-809 | Customer returns an unopened product: quarantine, inspect, release | `docs/ux-walker/stories/inventory-stock-sales-reorder--STORY-809/` |
| STORY-094 | `topics/inventory-stock-sales-reorder.md` | STORY-810 | Low stock to shortbook to purchase order to partial receipt | `docs/ux-walker/stories/inventory-stock-sales-reorder--STORY-810/` |
| STORY-095 | `topics/inventory-stock-sales-reorder.md` | STORY-811 | Configure replenishment automation and review a target proposal | `docs/ux-walker/stories/inventory-stock-sales-reorder--STORY-811/` |
| STORY-096 | `topics/inventory-stock-sales-reorder.md` | STORY-812 | Old bookmarks and phone-width task switching | `docs/ux-walker/stories/inventory-stock-sales-reorder--STORY-812/` |
| STORY-097 | `topics/purchases-suppliers-compliance.md` | STORY-901 | Scan a three-line distributor bill, match products and add stock (OCR end to end) | `docs/ux-walker/stories/purchases-suppliers-compliance--STORY-901/` |
| STORY-098 | `topics/purchases-suppliers-compliance.md` | STORY-902 | Receptionist tries one-click "Import & Add Stock" and finishes the review manually | `docs/ux-walker/stories/purchases-suppliers-compliance--STORY-902/` |
| STORY-099 | `topics/purchases-suppliers-compliance.md` | STORY-903 | The same bill is uploaded twice — exact duplicate blocked, near-duplicate is not | `docs/ux-walker/stories/purchases-suppliers-compliance--STORY-903/` |
| STORY-100 | `topics/purchases-suppliers-compliance.md` | STORY-904 | Reject a badly misread bill, then try to enter it again | `docs/ux-walker/stories/purchases-suppliers-compliance--STORY-904/` |
| STORY-101 | `topics/purchases-suppliers-compliance.md` | STORY-905 | Import a distributor's Marg ERP CSV export with line discounts | `docs/ux-walker/stories/purchases-suppliers-compliance--STORY-905/` |
| STORY-102 | `topics/purchases-suppliers-compliance.md` | STORY-906 | Connect Gmail and pull this week's supplier invoice attachments | `docs/ux-walker/stories/purchases-suppliers-compliance--STORY-906/` |
| STORY-103 | `topics/purchases-suppliers-compliance.md` | STORY-907 | Add a new Bengaluru supplier, then fix its GSTIN two different ways | `docs/ux-walker/stories/purchases-suppliers-compliance--STORY-907/` |
| STORY-104 | `topics/purchases-suppliers-compliance.md` | STORY-908 | Month-end supplier payables: pay, misallocate, reallocate, reverse and apply a credit | `docs/ux-walker/stories/purchases-suppliers-compliance--STORY-908/` |
| STORY-105 | `topics/purchases-suppliers-compliance.md` | STORY-909 | Receive stock on an inward challan, then post the later bill without double-counting | `docs/ux-walker/stories/purchases-suppliers-compliance--STORY-909/` |
| STORY-106 | `topics/purchases-suppliers-compliance.md` | STORY-910 | Pull October GST figures and the monthly report for the CA | `docs/ux-walker/stories/purchases-suppliers-compliance--STORY-910/` |
| STORY-107 | `topics/purchases-suppliers-compliance.md` | STORY-911 | Compare effective cost of Adapalene gel across distributors | `docs/ux-walker/stories/purchases-suppliers-compliance--STORY-911/` |
| STORY-108 | `topics/purchases-suppliers-compliance.md` | STORY-912 | Role boundaries on the Purchases menu (reception vs doctor) | `docs/ux-walker/stories/purchases-suppliers-compliance--STORY-912/` |
| STORY-109 | `topics/admin-users-reports-messaging.md` | STORY-001 | Riya is locked out before the Saturday rush and the admin gives her a reset code | `docs/ux-walker/stories/admin-users-reports-messaging--STORY-001/` |
| STORY-110 | `topics/admin-users-reports-messaging.md` | STORY-002 | Onboarding Sowmya, the new nurse, and tripping over the Create User dialog | `docs/ux-walker/stories/admin-users-reports-messaging--STORY-002/` |
| STORY-111 | `topics/admin-users-reports-messaging.md` | STORY-003 | Promoting Mohammed from Pharmacist to Manager through "Role & Permissions" | `docs/ux-walker/stories/admin-users-reports-messaging--STORY-003/` |
| STORY-112 | `topics/admin-users-reports-messaging.md` | STORY-004 | Kiran resigned. Suspend his login, then try to delete Dr. Praneeta's duplicate account | `docs/ux-walker/stories/admin-users-reports-messaging--STORY-004/` |
| STORY-113 | `topics/admin-users-reports-messaging.md` | STORY-005 | Closing the clinic for Diwali tomorrow and Sankranti in January | `docs/ux-walker/stories/admin-users-reports-messaging--STORY-005/` |
| STORY-114 | `topics/admin-users-reports-messaging.md` | STORY-006 | Setting Dr. Praneeta's split shifts and a conference leave | `docs/ux-walker/stories/admin-users-reports-messaging--STORY-006/` |
| STORY-115 | `topics/admin-users-reports-messaging.md` | STORY-007 | Turning on WhatsApp confirmations for Dr. Shravya, from both settings screens | `docs/ux-walker/stories/admin-users-reports-messaging--STORY-007/` |
| STORY-116 | `topics/admin-users-reports-messaging.md` | STORY-008 | Writing Telugu and English appointment templates with the AI generator and sending a test | `docs/ux-walker/stories/admin-users-reports-messaging--STORY-008/` |
| STORY-117 | `topics/admin-users-reports-messaging.md` | STORY-009 | Month-end revenue review: the Revenue Report says ₹0 while the pharmacy took ₹3.4 lakh | `docs/ux-walker/stories/admin-users-reports-messaging--STORY-009/` |
| STORY-118 | `topics/admin-users-reports-messaging.md` | STORY-010 | Exporting the Patient Analytics report for the auditor, in CSV, then PDF, then Excel | `docs/ux-walker/stories/admin-users-reports-messaging--STORY-010/` |
| STORY-119 | `topics/admin-users-reports-messaging.md` | STORY-011 | Lakshmi, the new MANAGER, finds most of the Users page is for show | `docs/ux-walker/stories/admin-users-reports-messaging--STORY-011/` |
| STORY-120 | `topics/admin-users-reports-messaging.md` | STORY-012 | Quarterly access audit: who can do what, and the doctor who made himself Owner | `docs/ux-walker/stories/admin-users-reports-messaging--STORY-012/` |

## Coverage Matrix

The features are the Feature Map items in `discovery.md`, split into 120 UI-reachable features across 9 areas. A feature counts as covered when at least one story walks it as a step or as a named variation or edge case. "Partial" means it appears only as a variation or edge case, or only one of its sub-actions is walked.

| Feature Area | Features | Covered | Stories | Gaps |
|---|---|---|---|---|
| Auth, session & shell | 13 | 13 | STORY-001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011, 012, 013, 096, 109 | None. The `MINIMAL_BOOT` backend mode is out of UI scope. |
| Patients | 10 | 10 | STORY-013–024, 041, 071 | Copy ID / patient code on click is walked only incidentally. |
| Appointments, scheduling & rooms | 14 | 14 | STORY-015, 025–036, 037, 113, 114 | Partial: "Failed to load schedule" / Retry / "Refreshing schedule…" appear only as edge cases of STORY-036. |
| Visits (clinical documentation) | 15 | 15 | STORY-037–048, 052, 059, 060 | Partial: the "Keyboard Shortcuts" dialog is mentioned only in STORY-038 edge cases. |
| Prescriptions | 13 | 13 | STORY-049–060, 070 | Partial: ClinicInvestigations saved lists appear only in STORY-043 (alternate path) and STORY-051. Print-event logging is checked only through the WhatsApp share in STORY-054. |
| Pharmacy (Desk / Counter / Billing / Invoices / Drugs) | 13 | 13 | STORY-061–084 | None. "Shelf locations" and "Pull visits" are covered only as edge cases of STORY-072. |
| Inventory workspace (Today / Stock / Sales / Reorder) | 16 | 15 | STORY-085–096, 067, 068 | **Uncovered: Stock → Corrections** (the "Post linked correction" and "Resolve product identity" stock-list actions, and the held-stock view). |
| Purchases, suppliers & compliance | 15 | 14 | STORY-097–108 | **Uncovered: "recover legacy invoice"** in the purchase workbench. The Saved bills "Retry invoices" error state is not walked. |
| Reports & admin | 11 | 11 | STORY-003, 005, 109–120 | None. |
| **Total** | **120** | **118 (98.3%)** | | 2 uncovered, 4 partial |

<details>
<summary>Feature-by-feature checklist (120 rows)</summary>

| Area | Feature | Stories |
|---|---|---|
| Auth | Sign in with phone or email | 001, 002, 012, 109 |
| Auth | `?next` return after login | 002, 004 |
| Auth | Admin-issued reset code → `/reset-password` | 003, 109 |
| Auth | Logout; 401 → login | 004, 012 |
| Auth | Branded mode (login + header) | 009 |
| Auth | Global header search (patients / appointments / users) | 007, 013, 021 |
| Auth | Notifications bell per role | 008, 012, 005 |
| Auth | Database backup (admin dashboard) | 011 |
| Auth | Role-filtered sidebar (10 roles) | 005, 024, 119, 120 |
| Auth | Mobile drawer | 006, 096 |
| Auth | Quick Guides, Receptionist tour, Doctor tour | 010, 012 |
| Auth | Dashboard variants (admin stats, alerts, today's appts, doctor panels) | 011, 012 |
| Auth | Legacy redirect routes and 404 | 002, 096 |
| Patients | List search, "Did you mean", filters, paging | 013, 020 |
| Patients | Create Patient (non-walk-in) | 014 |
| Patients | Walk-in auto-booking | 015, 023 |
| Patients | Edit Patient | 016 |
| Patients | Archive + Undo | 017 |
| Patients | Link / Unlink portal | 018 |
| Patients | WhatsApp reminder | 019 |
| Patients | Export CSV | 020, 023 |
| Patients | Patient detail Info / History / Uploads | 021, 041 |
| Patients | PatientProgressTracker | 022, 071 |
| Appointments | Doctor + date selectors, Calendar vs Slots, filters | 025, 027, 036 |
| Appointments | Book Appointment dialog (type, procedure name, duration, room) | 025, 027 |
| Appointments | Drag-select custom range | 025 (variation), 027, 036 |
| Appointments | Inline quick-create patient | 026 |
| Appointments | Conflict handling | 025 (edge), 036 |
| Appointments | Reschedule | 029, 036 |
| Appointments | Appointment Details + Cancel / Keep | 030, 036 |
| Appointments | Start / Continue Visit handoff | 036, 037 |
| Appointments | Loading / failed / refreshing states | 036 (edge only, partial) |
| Appointments | Google Calendar connect / callback / denied | 031 |
| Appointments | Doctor working hours + leave | 032, 114 |
| Appointments | Clinic holidays | 033, 113 |
| Rooms | Room Calendar & Occupancy | 034 |
| Rooms | Manage Rooms CRUD + activation | 035 |
| Visits | Start New Visit + URL params | 037, 038 |
| Visits | Form tabs per role | 039, 040, 060 |
| Visits | Vitals | 037, 039 |
| Visits | Photos, draft photos, position tagging | 037, 040 |
| Visits | Photo compare across visits + delete | 041 |
| Visits | Voice dictation | 042 |
| Visits | Lab Tests + AI autofill + compare | 043 |
| Visits | Customization tab / doctor defaults | 037 (variation), 052 |
| Visits | Tele-video consent gate | 044 |
| Visits | Autosave + conflict states | 045, 046 |
| Visits | Save Draft / Complete Visit | 037 |
| Visits | Patient Context + Patient History panel + Prescription Details | 037, 059 |
| Visits | Keyboard Shortcuts dialog | 038 (edge only, partial) |
| Visits | Procedures page (machines, save, history, analytics placeholder) | 047 |
| Visits | `/test-transcribe` bench | 048 |
| Rx | Drug search / regimen defaults / dosing | 049 |
| Rx | Custom frequency/timing + add drug to master | 058 |
| Rx | Treatment suggestions, learned plan, previous meds | 057 |
| Rx | ClinicInvestigations saved lists | 051, 043 (partial) |
| Rx | Templates (create, fields-only, delete) | 055 |
| Rx | Hindi / Telugu translation | 050 |
| Rx | Paged.js Print Preview options | 049, 051 |
| Rx | PDF download | 054 |
| Rx | Email share | 053 |
| Rx | WhatsApp share | 054 |
| Rx | Print-event logging | 054 (partial) |
| Rx | "Go to Pharmacy" handoff | 049, 056, 070 |
| Rx | Doctor signature + letterhead | 052 |
| Pharmacy | Desk metrics + quick actions | 073, 074, 084 |
| Pharmacy | Pharmacy AI assistant dock | 082, 083, 084 |
| Pharmacy | Partner Daily Sync | 080, 081 |
| Pharmacy | Treatment Packages browse / create | 078, 079 |
| Pharmacy | Counter cockpit review / pause / ready / dispense | 061, 062, 063 |
| Pharmacy | Walk-in bill, Pull visits, Daily close, Shelf locations | 065, 072, 080 |
| Pharmacy | Prescription Queue table | 072 |
| Pharmacy | Billing invoice builder (drugs, packages, substitutes, preview, confirm) | 063, 065 |
| Pharmacy | Link Rx line to inventory | 064 |
| Pharmacy | Checkout recovery | 066 |
| Pharmacy | Pharmacy Invoices list | 067, 068, 071 |
| Pharmacy | Drug Management CRUD | 075, 076, 077 |
| Pharmacy | RECEPTION 403 paths | 069, 074 |
| Inventory | Today queues | 085 |
| Inventory | Stock list search / filters / edit stock / edit price | 086, 087 |
| Inventory | Approve corrections | 086 |
| Inventory | Counts & audit | 090 |
| Inventory | Blocked stock / Loss & breakage / Supplier returns | 091 |
| Inventory | **Corrections view (linked correction, product identity)** | **none** |
| Inventory | Manual opening stock / Add batch | 088 |
| Inventory | Opening stock Excel import | 089 |
| Inventory | Add Inventory Item dialog | 088 |
| Inventory | Counter sales + quotations | 092 |
| Inventory | Customer returns | 093 |
| Inventory | Patient invoice history | 067, 068, 087 |
| Inventory | Shortbook → PO → receive / cancel | 094 |
| Inventory | Target proposals, manual targets, automation, monitor | 095 |
| Inventory | Workflow document states + history | 090, 094 |
| Inventory | Legacy redirects + mobile task select | 096 |
| Purchases | OCR workbench end to end | 097 |
| Purchases | "Import & Add Stock" automatic path | 098 |
| Purchases | Duplicate bill detection | 099 |
| Purchases | Reject / reopen review / manual re-entry | 100 |
| Purchases | **Recover legacy invoice** | **none** |
| Purchases | Saved bills register | 099, 100 |
| Purchases | Import CSV | 101 |
| Purchases | Gmail intake | 102 |
| Purchases | Suppliers | 103 |
| Purchases | Payments & dues ledger | 104 |
| Purchases | Credits & vouchers | 104 |
| Purchases | Inward challans + gate passes | 105 |
| Purchases | GST & monthly reports, expiry returns | 106 |
| Purchases | Purchase costs analytics | 107 |
| Purchases | Role boundaries on the Purchases menu | 108 |
| Admin | Users create / edit / delete | 110, 112 |
| Admin | User status change | 112 |
| Admin | Role & Permissions | 111, 120 |
| Admin | Reset-code issuance | 003, 109 |
| Admin | Working Hours (admin) | 114 |
| Admin | Clinic Holidays | 113 |
| Admin | WhatsApp settings (Users + header) | 115 |
| Admin | WhatsApp Template Editor (AI generate, Send Test) | 116 |
| Admin | Reports: six types + date ranges | 117 |
| Admin | Report export (JSON / CSV / PDF / Excel) | 118 |
| Admin | MANAGER / ACCOUNTANT edge cases | 119, 005 |

</details>

**Excluded from the denominator** because no UI reaches them (discovery item 8). They are listed under Gaps: clinic billing (`/billing/*`, BillingManagement orphaned), Branch CRUD, the audit-logs API, the 1mg API, prescription refills, template version approval, appointment bulk-update, printer-profile creation, `PATCH /users/:id/status`, change-own-password, package update/delete, partner CSV upload, the StockPrediction dashboard and the server-side prescription share (`POST /prescriptions/:id/share`).

## Story Dependency Graph

Run parents before children. The trees describe data and setup dependencies. Most stories can also run alone against the seed, as long as their Preconditions are met.

```text
SEED (admin, 2 doctors, reception, John Doe, 6 rooms) ── STORY-001 Sign in
│
├── STORY-110 Create users (NURSE / PHARMACIST / MANAGER / ACCOUNTANT)      [admin]
│   ├── STORY-005 Sidebar per role ── STORY-024 Patient role boundaries
│   ├── STORY-111 Role & Permissions ── STORY-120 Quarterly access audit
│   ├── STORY-112 Suspend / delete user
│   ├── STORY-119 MANAGER on Users / Reports
│   ├── STORY-039 Nurse vitals (403 wall)
│   └── Pharmacist stories: STORY-061, 062, 063, 064, 065, 066, 067, 068, 072, 076, 081, 100
│
├── STORY-003 / STORY-109 Reset code ── STORY-004 Session expiry + logout
├── STORY-002 Deep link + legacy bookmarks + 404 ── STORY-096 Inventory bookmarks / mobile
├── STORY-006 Mobile drawer;  STORY-009 Branded;  STORY-010 Help + tours ── STORY-012 Receptionist first morning
├── STORY-011 Dashboard backup + doctor panels (needs ≥1 visit from STORY-037 for "Recent Visits")
│
├── CLINIC SETUP
│   ├── STORY-035 Manage rooms ── STORY-034 Room free check ── STORY-027 Procedure booking
│   ├── STORY-032 / STORY-114 Doctor hours + leave ── STORY-033 / STORY-113 Clinic holidays
│   ├── STORY-031 Google Calendar connect
│   ├── STORY-052 Signature + letterhead  (before any Rx print: 049, 050, 051, 059)
│   └── STORY-115 WhatsApp settings ── STORY-116 Template editor ── STORY-019 WhatsApp reminder
│
├── PATIENT → APPOINTMENT → VISIT → RX → PHARMACY  (core clinical chain)
│   ├── STORY-014 Create patient ── STORY-016 Edit ── STORY-017 Archive/undo ── STORY-018 Portal link
│   ├── STORY-013 Find patient ── STORY-007 Header search ── STORY-020 Filter + CSV
│   ├── STORY-015 Walk-in auto-book / STORY-026 Quick-create in scheduler
│   │   └── STORY-025 Book OPD ── STORY-028 Book from chart
│   │       ├── STORY-029 Reschedule ── STORY-030 Cancel
│   │       └── STORY-036 Full clinic day (long)
│   │           └── STORY-037 Document visit end to end (long)
│   │               ├── STORY-038 Walk-in from Visits;  STORY-040 Reception photos;  STORY-041 Compare photos
│   │               ├── STORY-042 Dictation;  STORY-043 Lab autofill;  STORY-044 Tele consent
│   │               ├── STORY-045 Autosave conflict;  STORY-046 Draft lost after refresh
│   │               ├── STORY-021 Chart review ── STORY-022 Progress tracker
│   │               └── STORY-049 Write + print + hand off Rx (long)
│   │                   ├── STORY-050 Telugu;  STORY-051 One-page fit;  STORY-055 Templates
│   │                   ├── STORY-053 Email;  STORY-054 WhatsApp;  STORY-059 Reprint old Rx;  STORY-060 Non-doctor roles
│   │                   ├── STORY-057 Reuse last meds (needs a prior Rx);  STORY-058 New brand + custom frequency
│   │                   ├── STORY-070 Doctor bills directly;  STORY-056 Reception picks up the Rx
│   │                   └── STORY-061 Counter accept ── STORY-062 Pause (OOS)
│   │                       └── STORY-063 Prescribe → review → bill → pay → dispense (long)
│   │                           ├── STORY-064 Link Rx line to inventory;  STORY-066 Checkout recovery
│   │                           ├── STORY-067 Reprint invoice ── STORY-068 Evening reconciliation
│   │                           ├── STORY-071 Was it billed? (tracker);  STORY-072 Queue triage
│   │                           └── STORY-069 Reception covers counter (403)
│   ├── STORY-023 Front desk → doctor → admin (long, patient side of the chain)
│   └── STORY-047 Procedures page;  STORY-048 /test-transcribe (independent)
│
├── CATALOG & PHARMACY DESK
│   ├── STORY-075 Add drug ── STORY-076 Edit / retire ── STORY-077 Find by manufacturer
│   ├── STORY-078 Create package ── STORY-079 Review package ── STORY-065 Walk-in sale with package
│   ├── STORY-073 Desk metrics ── STORY-074 Reception on Desk (403)
│   ├── STORY-080 Partner sale ── STORY-081 Partner batch reconcile
│   ├── STORY-082 AI low-stock proposal ── STORY-083 AI threads
│   └── STORY-084 Weekly catalog clean-up (long; reuses 075, 078, 080, 082)
│
├── INVENTORY
│   ├── STORY-089 Excel opening stock / STORY-088 Add batch + opening balance
│   │   ├── STORY-085 Today triage ── STORY-087 Reception permission walls
│   │   ├── STORY-086 Stock correction → doctor approval
│   │   ├── STORY-090 Expiry count → manager approval (needs MANAGER from STORY-110, or admin)
│   │   ├── STORY-091 Hold → loss → supplier return (needs a supplier from STORY-103/097)
│   │   ├── STORY-092 Counter sale + quotation ── STORY-093 Customer return
│   │   └── STORY-095 Automation + target proposal ── STORY-094 Shortbook → PO → part receipt (long)
│   │       └── STORY-105 Inward challan → linked bill
│
├── PURCHASES
│   ├── STORY-103 Add supplier
│   │   └── STORY-097 OCR bill end to end (long)
│   │       ├── STORY-098 Import & Add Stock;  STORY-099 Duplicate bill;  STORY-100 Reject + re-enter
│   │       ├── STORY-101 CSV import;  STORY-102 Gmail intake
│   │       ├── STORY-104 Supplier payables (long) ── STORY-106 GST + monthly reports ── STORY-107 Purchase costs
│   │       └── STORY-108 Role boundaries (reception vs doctor)
│
└── REPORTING (run last, after billing data exists)
    ├── STORY-117 Revenue report (needs invoices from 063/065/068) ── STORY-118 Report export
    └── STORY-008 Bell per role (needs low stock / overdue data from 085 / 104)
```

### Cross-topic overlaps (near-duplicate stories)

These pairs exercise substantially the same flow from different topics. All are kept because walk reports are keyed by original ID. When time is short, walk the **primary** and run the other only for its distinct variation.

| Primary | Overlaps with | Shared flow | What the secondary adds |
|---|---|---|---|
| STORY-003 (auth) | STORY-109 (admin) | Admin issues a reset code, receptionist sets a new password | 109: no change-my-password screen; operator script path |
| STORY-114 (admin) | STORY-032 (appts) | Doctor split shift + leave via `DoctorAvailabilitySettings` | 032: doctor's own header My Settings route |
| STORY-113 (admin) | STORY-033 (appts) | Clinic holidays from Users → Clinic Holidays | 033: also edits a doctor's Saturday hours; holiday delete from a doctor dialog |
| STORY-007 (auth) | STORY-013 (patients) | Finding a patient; header search patient result dead-ends | 013: phone-prefix search and "Did you mean" |
| STORY-049 (rx) | STORY-063 (counter), STORY-070 (counter), STORY-056 (rx) | Rx create → "Go to Pharmacy" → billing | 063: counter review, payment, dispense; 070: doctor bills alone; 056: reception picks up |
| STORY-063 (counter) | STORY-065 (counter), STORY-092 (inventory) | Selling medicines | 065: walk-in with package in the builder; 092: COUNTER_SALE workflow in Inventory |
| STORY-069 (counter) | STORY-074 (desk), STORY-087 (inventory), STORY-108 (purchases) | RECEPTION sees pharmacy/inventory nav but gets 403s | Each covers a different screen: counter/billing, desk/drugs, stock/sales, purchases menu |
| STORY-005 (auth) | STORY-024 (patients), STORY-120 (admin), STORY-119 (admin) | Role-by-role check of what the UI shows vs what the backend allows | 024: patient endpoints; 120: role assignment and escalation; 119: MANAGER on Users |
| STORY-037 (visits) | STORY-036 (appts), STORY-023 (patients) | Calendar tile → Start Visit → documentation | 036: front-desk side; 023: walk-in registration side |
| STORY-086 (inventory) | STORY-076 (desk) | Price/stock edit requests and approval | 076: Drug Management edit + price-change rule for PHARMACIST |
| STORY-082 (desk) | STORY-085 (inventory) | Low-stock review | 082: AI proposal path; 085: Today queue path |
| STORY-094 (inventory) | STORY-105 (purchases) | PO receiving via inward challan | 105: linking the later bill without double-counting |
| STORY-011 (auth) | STORY-117 (admin) | Dashboard / report numbers | 117: revenue from the wrong table; 011: backup + doctor panels |
| STORY-008 (auth) | STORY-085 (inventory) | Low stock / expiry alerts and their deep links | 085: correct Today links vs broken bell links |
| STORY-115 (admin) | STORY-019 (patients) | WhatsApp configuration and sending | 019: reminder from the patient row with false success |
| STORY-021 (patients) | STORY-059 (rx), STORY-041 (visits) | Reviewing past visits / photos / prescriptions | 059: reprint; 041: photo compare |

## All Stories

Each entry links to the full story in its topic file. Story numbers in the "Alternate paths" text keep the topic file's own numbering (for example "see STORY-004" inside an appointments story means appointments STORY-004, which is catalog STORY-028). Use the mapping table to translate.

### Authentication, Shell & Navigation

Source: [`topics/auth-shell-navigation.md`](topics/auth-shell-navigation.md) · STORY-001–STORY-012

#### STORY-001: Front-desk sign-in with a phone number

- **Source**: [`auth-shell-navigation` STORY-001](topics/auth-shell-navigation.md#story-001-front-desk-sign-in-with-a-phone-number) · **Type**: short · **Steps**: 5
- **Persona**: Riya Sharma, receptionist at the Banjara Hills clinic. She opens the clinic at 8:45 am and prefers typing her mobile number to her email.
- **Ideal path**: 3 steps. Type the identifier, type the password, press Enter. The form autofocuses the identifier field, so no extra click is needed.
- **Alternate paths**: Email instead of phone in the same "Phone or email" field. Visiting `/` redirects to `/dashboard`, and middleware then sends you to `/login?next=/dashboard`, which ends on the same page.

#### STORY-002: Following a shared deep link while signed out, plus old bookmarks and a 404

- **Source**: [`auth-shell-navigation` STORY-002](topics/auth-shell-navigation.md#story-002-following-a-shared-deep-link-while-signed-out-plus-old-bookmarks-and-a-404) · **Type**: medium · **Steps**: 9
- **Persona**: Dr. Praneeta Jain, dermatologist. A colleague sent her a WhatsApp link to a patient record…
- **Ideal path**: 3 steps. Click the link, sign in (identifier + password + Enter counted as one form submit), and see the patient. The `?next` round-trip makes this possible today.
- **Alternate paths**: Global search → Patients list → View (see STORY-007). Sidebar "Patients" → search → View. Dashboard "My Patients" panel (doctor only, see STORY-011).

#### STORY-003: Admin issues a reset code and the receptionist sets a new password

- **Source**: [`auth-shell-navigation` STORY-003](topics/auth-shell-navigation.md#story-003-admin-issues-a-reset-code-and-the-receptionist-sets-a-new-password) · **Type**: medium · **Steps**: 10
- **Persona**: Admin User (clinic administrator) and Riya Sharma (receptionist, locked out after a long Diwali break).
- **Ideal path**: 7 steps. Admin: Users, then Reset password on Riya's row, confirm, then read the code aloud (4). Riya: enter the reset code, enter the new password twice and submit (2), then sign in (1). The confirmation step is deliberate friction.
- **Alternate paths**: The server operator can run the issue-reset-code script (`PasswordResetService.issueResetCodeAsOperator`), which has no UI. There is no self-service "forgot password" email or SMS.

#### STORY-004: The session expires overnight, then she logs out on purpose

- **Source**: [`auth-shell-navigation` STORY-004](topics/auth-shell-navigation.md#story-004-the-session-expires-overnight-then-she-logs-out-on-purpose) · **Type**: medium · **Steps**: 6
- **Persona**: Dr. Shravya Dermatologist. She left the Appointments tab open on the consult-room PC overnight.
- **Ideal path**: 2 steps to resume (sign in again, then land back on Appointments) and 1 step to log out (sidebar "Log out" icon).
- **Alternate paths**: To end the session, there is no other UI. The only control is the sidebar footer icon (`aria-label="Log out"`), which also appears inside the mobile drawer. There is no header user menu with Log out: the header's name/avatar block cannot be clicked.

#### STORY-005: Admin checks what each new hire will see in the sidebar

- **Source**: [`auth-shell-navigation` STORY-005](topics/auth-shell-navigation.md#story-005-admin-checks-what-each-new-hire-will-see-in-the-sidebar) · **Type**: long · **Steps**: 17
- **Persona**: Admin User, setting up accounts for three new hires at the Jubilee Hills branch: pharmacist Farhana Begum…
- **Ideal path**: 4 steps per role checked (log out, sign in as the role, scan the sidebar, try one key action). A "view as role" preview would make it 1 step per role, but none exists.
- **Alternate paths**: The sidebar is the only role-aware navigation. Quick Guides, tours and the notification bell partly duplicate it, and direct URLs reach every page whatever the nav shows.

#### STORY-006: Receptionist on a phone uses the mobile drawer

- **Source**: [`auth-shell-navigation` STORY-006](topics/auth-shell-navigation.md#story-006-receptionist-on-a-phone-uses-the-mobile-drawer) · **Type**: short · **Steps**: 5
- **Persona**: Riya Sharma, checking the day's patients on her phone in the auto-rickshaw to the clinic.
- **Ideal path**: 2 steps. Open the drawer, tap Appointments.
- **Alternate paths**: The Dashboard "Today's Appointments" card has a "View All Appointments" button (shown only when there are appointments today). You can also type the URL directly.

#### STORY-007: Finding a patient from the header search

- **Source**: [`auth-shell-navigation` STORY-007](topics/auth-shell-navigation.md#story-007-finding-a-patient-from-the-header-search) · **Type**: medium · **Steps**: 8
- **Persona**: Riya Sharma, at the front desk. Sai Kiran Goud calls to ask about his follow-up for a chemical peel.
- **Ideal path**: 3 steps. Type "sai k", pick the patient result, and land on his record or detail page.
- **Alternate paths**: Sidebar "Patients" → "Search by name, phone, ABHA, or email (min 2 chars)". Appointments page patient search "Search patient by name/phone". Dashboard "My Patients" search (doctors only).

#### STORY-008: The notifications bell for each role

- **Source**: [`auth-shell-navigation` STORY-008](topics/auth-shell-navigation.md#story-008-the-notifications-bell-for-each-role) · **Type**: medium · **Steps**: 7
- **Persona**: Farhana Begum (pharmacist) at 10 am, and Dr. Shravya between consults.
- **Ideal path**: 2 steps. Open the bell, click an item, and land on a filtered view of exactly that problem.
- **Alternate paths**: The same alert data appears as Dashboard "System Alerts" summary cards (Overdue Invoices, Low Stock Alert, Expiring Items, Pending Payments). The Inventory "Today" queues ("Low stock", "Expiring in the next 3 months") use correct deep links. The bell polls every 60 s and the dashboard loads the same `/reports/alerts` once (redundancy candidate).

#### STORY-009: Switching on Branded mode

- **Source**: [`auth-shell-navigation` STORY-009](topics/auth-shell-navigation.md#story-009-switching-on-branded-mode) · **Type**: short · **Steps**: 4
- **Persona**: Dr. Praneeta Jain, showing the system to the clinic's owner, who wants it to "look like Linaé".
- **Ideal path**: 1 step. Flip the "Branded" switch.
- **Alternate paths**: The same "Branded" switch (`aria-label="Toggle branded mode"`) sits top-right on `/login` and in the dashboard header. Both write localStorage `cms_branded_mode`.

#### STORY-010: Learning from the Quick Guides and the Visit Workflow Tour

- **Source**: [`auth-shell-navigation` STORY-010](topics/auth-shell-navigation.md#story-010-learning-from-the-quick-guides-and-the-visit-workflow-tour) · **Type**: medium · **Steps**: 8
- **Persona**: Dr. Shravya Dermatologist, new to ClinicMS, who reads every help text before trying a feature. She is cautious.
- **Ideal path**: 2 steps per help surface: open it, then read and close it. The tour is 1 click plus "Next →" through its 19 steps.
- **Alternate paths**: Help is spread across three systems. **QuickGuide** dialogs: "Dashboard Guide", "Patients Management Guide", "Visit Documentation Guide", "Procedures Management Guide", "Room Management Guide", "Pharmacy Management Guide", "Reports & Analytics Guide", "Users Management Guide". Appointments has its own separate "Quick Guide" dialog. There are two intro.js tours (Receptionist "Start Tour" in the header, Doctor "Visit Workflow Tour" inside the visit form) and the visit form's "Shortcuts" dialog.

#### STORY-011: Morning dashboard check — Admin backup and doctor panels

- **Source**: [`auth-shell-navigation` STORY-011](topics/auth-shell-navigation.md#story-011-morning-dashboard-check--admin-backup-and-doctor-panels) · **Type**: medium · **Steps**: 11
- **Persona**: Admin User (8:30 am, before OPD opens), then Dr. Praneeta Jain (between patients).
- **Ideal path**: Admin, 2 steps: Dashboard, then "Create Backup" with a clear result. Doctor, 2 steps: Dashboard, then click the visit in "Recent Visits".
- **Alternate paths**: Backup has no other UI path (the server API `POST /auth/backup` / `GET /auth/backup/:jobId` only). Recent visits are also reachable via Visits → history tab, and the patient detail History tab. "My Patients" duplicates the Patients list filtered by primary doctor (redundancy candidate).

#### STORY-012: A new receptionist's first morning, end to end

- **Source**: [`auth-shell-navigation` STORY-012](topics/auth-shell-navigation.md#story-012-a-new-receptionists-first-morning-end-to-end) · **Type**: long · **Steps**: 20
- **Persona**: Riya Sharma on her first day at the Kondapur branch. She is nervous, follows the guided tour, and expects the app to hold her hand.
- **Ideal path**: About 12 steps for the core work: sign in, run the tour on 4 pages, search a caller, open a notification and log out. The tour does not navigate between pages by itself, so each page needs its own "Start Tour" click.
- **Alternate paths**: Help comes from both the "Start Tour" button and the page Quick Guides (Dashboard Guide, Patients Management Guide, Room Management Guide, Pharmacy Management Guide, Appointments "Quick Guide"). Navigation is through the sidebar, the header search or notification links.


### Patients & Records

Source: [`topics/patients-records.md`](topics/patients-records.md) · STORY-013–STORY-024

#### STORY-013: Receptionist finds a returning patient by phone prefix and opens her record

- **Source**: [`patients-records` STORY-201](topics/patients-records.md#story-201-receptionist-finds-a-returning-patient-by-phone-prefix-and-opens-her-record) · **Type**: short · **Steps**: 4
- **Persona**: Riya Sharma, front-desk receptionist (`reception@clinic.test`), with a queue at the desk
- **Ideal path**: 3 — open Patients, type the phone prefix, click the matching row.
- **Alternate paths**: (a) Header global search "Search patients, appointments, doctors..." → patient result → `/dashboard/patients?search=<patient UUID>`. This lands on the list with the UUID in the search box and **no match** (see Defects). (b) Row click and the row's "View" button do the same thing. (c) Doctors also have Dashboard → "My Patients" panel → patient link → `/dashboard/patients/[id]`.

#### STORY-014: Registering a new non-walk-in patient, recovering from a phone-format error

- **Source**: [`patients-records` STORY-202](topics/patients-records.md#story-202-registering-a-new-non-walk-in-patient-recovering-from-a-phone-format-error) · **Type**: medium · **Steps**: 9
- **Persona**: Riya (RECEPTION), registering a patient who booked by phone for later in the week
- **Ideal path**: 4 — click New Patient, fill the required fields (name, phone), fill the optional fields, click Create.
- **Alternate paths**: (a) Appointments page patient search → "Add New Patient" (PatientQuickCreateDialog: names, age, gender, phone, email, ABHA, Consultation Type; it has no address, emergency contact, referral or primary doctor). (b) Walk-in variant of this same dialog (STORY-203). The Quick Guide tells users to click "Add Patient", but no button has that label.

#### STORY-015: Walk-in patient registered and auto-booked into the next free slot

- **Source**: [`patients-records` STORY-203](topics/patients-records.md#story-203-walk-in-patient-registered-and-auto-booked-into-the-next-free-slot) · **Type**: medium · **Steps**: 9
- **Persona**: Riya (RECEPTION) on a busy Saturday morning
- **Ideal path**: 5 — New Patient, enter name and phone, set Patient Type Walk-in, choose the doctor, click Create (room and type use defaults).
- **Alternate paths**: (a) Create a non-walk-in patient, then use the detail page "Book appointment" or tracker "Book" → `/dashboard/appointments?patientId=` → pick a slot. (b) Appointments → Calendar or Slots tab → click a free slot → "Book Appointment" dialog → "Add New Patient". That makes four ways to book in total (discovery item 5).

#### STORY-016: Correcting a patient's details with Edit Patient

- **Source**: [`patients-records` STORY-204](topics/patients-records.md#story-204-correcting-a-patients-details-with-edit-patient) · **Type**: short · **Steps**: 5
- **Persona**: Riya (RECEPTION). Anjali Rao has moved and her husband is now the emergency contact.
- **Ideal path**: 3 — Edit on the row, change the fields, click Save Changes.
- **Alternate paths**: none found. The detail page has no Edit button, so editing works only from the list row.

#### STORY-017: Archiving a duplicate record, then undoing a mistaken archive

- **Source**: [`patients-records` STORY-205](topics/patients-records.md#story-205-archiving-a-duplicate-record-then-undoing-a-mistaken-archive) · **Type**: short · **Steps**: 5
- **Persona**: Admin User (`admin@clinic.test`) cleaning up duplicate registrations
- **Ideal path**: 2 — click Archive, and click Undo if it was a mistake.
- **Alternate paths**: none found. There is no archived-patients view and no Unarchive button, so the toast's Undo is the only restore path in the UI.

#### STORY-018: Linking (and later unlinking) patient-portal access

- **Source**: [`patients-records` STORY-206](topics/patients-records.md#story-206-linking-and-later-unlinking-patient-portal-access) · **Type**: short · **Steps**: 3
- **Persona**: Admin User setting up portal access for a long-term isotretinoin patient, Keerthi Naidu
- **Ideal path**: 3 — click Link Portal, confirm the email, click Link.
- **Alternate paths**: none found. No patient-facing UI exists, so a linked PATIENT user would see an empty sidebar.

#### STORY-019: Sending a WhatsApp appointment reminder from the patient list

- **Source**: [`patients-records` STORY-207](topics/patients-records.md#story-207-sending-a-whatsapp-appointment-reminder-from-the-patient-list) · **Type**: short · **Steps**: 2
- **Persona**: Riya (RECEPTION) doing the 5 pm reminder round for tomorrow's patients
- **Ideal path**: 2 — find the patient, click WhatsApp.
- **Alternate paths**: Appointment-creation WhatsApp is sent automatically when the doctor's "Send WhatsApp on appointment creation" setting is on (header My Settings), but that is a confirmation, not a reminder. There is no reminder action on the Appointments page or the patient detail page.

#### STORY-020: Admin filters recent female online patients and exports them to CSV

- **Source**: [`patients-records` STORY-208](topics/patients-records.md#story-208-admin-filters-recent-female-online-patients-and-exports-them-to-csv) · **Type**: medium · **Steps**: 9
- **Persona**: Admin User preparing a list for the clinic's Instagram tele-consult campaign review
- **Ideal path**: 4 — set three filters, click Export CSV.
- **Alternate paths**: Reports & Analytics → "Patient Analytics" → Export (JSON/CSV/PDF/Excel) gives aggregates, not a patient roster. The header "Export CSV" here is the only roster export.

#### STORY-021: Doctor reviews a patient's chart on the detail page before consultation

- **Source**: [`patients-records` STORY-209](topics/patients-records.md#story-209-doctor-reviews-a-patients-chart-on-the-detail-page-before-consultation) · **Type**: medium · **Steps**: 10
- **Persona**: Dr. Shravya (`shravya@clinic.test`) between patients, reviewing John Doe's history before his follow-up for eczema
- **Ideal path**: 4 — open the patient, History tab, filter by doctor, click Resume session.
- **Alternate paths**: To reach the patient: Dashboard → "My Patients" panel link, Patients list row or View, or header global search (broken, see STORY-201). To reach his last visit there are **four** buttons on one page: header "Resume last visit", tracker "Continue", tracker "Prescribe"/"View", and each History card's "Resume session". All except the last open the same `/dashboard/visits?visitId=<latest>&patientId=` URL.

#### STORY-022: Using the progress tracker to move a patient from booking to billing

- **Source**: [`patients-records` STORY-210](topics/patients-records.md#story-210-using-the-progress-tracker-to-move-a-patient-from-booking-to-billing) · **Type**: medium · **Steps**: 9
- **Persona**: Dr. Praneeta (`praneeta@clinic.test`) handling a first-time patient, Harika Kondapalli, referred by a GP in Madhapur
- **Ideal path**: 4 — Book, Start Visit, Prescribe, Bill (one click per stage, plus the work done on each target page).
- **Alternate paths**: Every tracker button duplicates a header button. "Book" = header "Book appointment", "Start Visit" = header "Start new visit" = list row "Start Visit", "Continue"/"Prescribe" = header "Resume last visit". For Bill there is Pharmacy Billing in the sidebar (DOCTOR has no Pharmacy sidebar links, so the tracker is her only shortcut).

#### STORY-023: Front-desk morning to doctor follow-through (end-to-end)

- **Source**: [`patients-records` STORY-211](topics/patients-records.md#story-211-front-desk-morning-to-doctor-follow-through-end-to-end) · **Type**: long · **Steps**: 18
- **Persona**: Riya (RECEPTION) opening the clinic, then Dr. Shravya, then the Admin at day end
- **Ideal path**: 18 — about 6 actions for reception, 8 for the doctor and 4 for the admin, across three logins.
- **Alternate paths**: Walk-in booking could go through Appointments "Add New Patient" instead. The doctor can reach patients through the dashboard "My Patients", the Patients list, or Appointments tiles → Start Visit. The admin could use Reports → Patient Analytics, which gives aggregates rather than a roster.

#### STORY-024: Role boundaries on patient records (nurse, manager, pharmacist by URL)

- **Source**: [`patients-records` STORY-212](topics/patients-records.md#story-212-role-boundaries-on-patient-records-nurse-manager-pharmacist-by-url) · **Type**: medium · **Steps**: 4
- **Persona**: QA lead checking which roles can change patient records
- **Ideal path**: 3 per role — log in, open Patients (or type its URL), try one write action.
- **Alternate paths**: The sidebar Patients link is shown to OWNER, ADMIN, MANAGER, DOCTOR, NURSE and RECEPTION. Any role can reach the page by typing `/dashboard/patients`, because the middleware checks only for the auth cookie.


### Appointments, Scheduling & Rooms

Source: [`topics/appointments-scheduling-rooms.md`](topics/appointments-scheduling-rooms.md) · STORY-025–STORY-036

#### STORY-025: Receptionist books a routine OPD consultation for a returning patient

- **Source**: [`appointments-scheduling-rooms` STORY-001](topics/appointments-scheduling-rooms.md#story-001-receptionist-books-a-routine-opd-consultation-for-a-returning-patient) · **Type**: medium · **Steps**: 11
- **Persona**: Riya Sharma, front-desk receptionist (RECEPTION), uses the app all day
- **Ideal path**: 5 — choose the doctor, type a few letters of the patient's name, pick the match, click the free 11:30 tile, confirm. The date already defaults to today, and OPD and 30 minutes should be the defaults.
- **Alternate paths**: (a) Slots tab: same grid and dialog under a different header. (b) Patients → patient detail "Book appointment" or PatientProgressTracker "Book" → `/dashboard/appointments?patientId=` (broken, see STORY-004). (c) Patients → "New Patient" with Patient Type "Walk-in" auto-books the next free 30-minute slot (new patients only). (d) Dashboard "Today's Appointments" button and header global-search appointment results both open `/dashboard/appointments` without any context.

#### STORY-026: Walk-in first-time patient created inline while booking

- **Source**: [`appointments-scheduling-rooms` STORY-002](topics/appointments-scheduling-rooms.md#story-002-walk-in-first-time-patient-created-inline-while-booking) · **Type**: medium · **Steps**: 7
- **Persona**: Riya (RECEPTION) at a busy morning desk. A first-time walk-in, Mohammed Imran, wants to see Dr. Praneeta about hair fall.
- **Ideal path**: 6 — type the name, open quick-create, add the phone, save, click the slot, confirm
- **Alternate paths**: (a) Patients → "New Patient" → "Create Patient" with Patient Type "Walk-in" auto-books the next available 30-minute slot (no slot choice) → toast "Walk-in appointment booked". (b) Slots tab offers the same inline "+ Add … as a new patient" button.

#### STORY-027: Book a 60-minute Chemical Peel in a procedure room

- **Source**: [`appointments-scheduling-rooms` STORY-003](topics/appointments-scheduling-rooms.md#story-003-book-a-60-minute-chemical-peel-in-a-procedure-room) · **Type**: medium · **Steps**: 9
- **Persona**: Riya (RECEPTION) booking an aesthetic procedure that needs a room
- **Ideal path**: 7 — set the date, pick the patient, click 15:00, choose Procedure, type the procedure name, set 60 minutes, pick the room and confirm (8 actions; the type and room choices could reasonably be merged)
- **Alternate paths**: Slots tab (the procedure name is silently dropped there, see Defects). The Procedures page ("Save Procedure") records a procedure session as a visit, not a booking, so it is not an alternative.

#### STORY-028: Doctor clicks "Book appointment" from a patient's chart for a follow-up

- **Source**: [`appointments-scheduling-rooms` STORY-004](topics/appointments-scheduling-rooms.md#story-004-doctor-clicks-book-appointment-from-a-patients-chart-for-a-follow-up) · **Type**: short · **Steps**: 5
- **Persona**: Dr. Praneeta Jain (DOCTOR) finishing a review and wanting a two-week follow-up for Arjun Varma
- **Ideal path**: 4 — click "Book appointment", set the date, click a slot, confirm (the patient is already known)
- **Alternate paths**: PatientProgressTracker "Book" button (same `?patientId=` link). Appointments page with a manual patient search (STORY-001).

#### STORY-029: Patient calls to move her appointment to the afternoon (reschedule)

- **Source**: [`appointments-scheduling-rooms` STORY-005](topics/appointments-scheduling-rooms.md#story-005-patient-calls-to-move-her-appointment-to-the-afternoon-reschedule) · **Type**: medium · **Steps**: 5
- **Persona**: Riya (RECEPTION) on the phone with Fatima Begum, who can't make 10:00
- **Ideal path**: 3 — choose reschedule on the appointment, click the new slot, confirm
- **Alternate paths**: none found in the UI. RESCHED is the only entry. The Slots tab's own `startReschedule` and `handleRescheduleSlotSelect` are never wired to the grid. There is no reschedule button in "Appointment Details". `PATCH /appointments/:id` has no UI.

#### STORY-030: Cancel a no-show appointment, with a "Keep" change of mind

- **Source**: [`appointments-scheduling-rooms` STORY-006](topics/appointments-scheduling-rooms.md#story-006-cancel-a-no-show-appointment-with-a-keep-change-of-mind) · **Type**: short · **Steps**: 4
- **Persona**: Riya (RECEPTION), careful about destructive actions
- **Ideal path**: 3 — open the appointment, choose cancel, confirm
- **Alternate paths**: none that work. Long-press on a tile is meant to open details but is unreachable on both desktop and touch. The Quick Guide's "double-click appointment to view/edit/cancel" has no handler. The inline X cancel button exists in the code but is disabled (`showInlineActions = false`).

#### STORY-031: Doctor connects her Google Calendar

- **Source**: [`appointments-scheduling-rooms` STORY-007](topics/appointments-scheduling-rooms.md#story-007-doctor-connects-her-google-calendar) · **Type**: medium · **Steps**: 7
- **Persona**: Dr. Shravya (DOCTOR), wants clinic bookings on her phone's Google Calendar
- **Ideal path**: 3 — click connect, approve on Google, return
- **Alternate paths**: none found. The button exists only in the Calendar tab header. The header "My Settings" dialog has no Google section, and the Slots tab has none.

#### STORY-032: Doctor sets a split weekly schedule and marks a CME leave

- **Source**: [`appointments-scheduling-rooms` STORY-008](topics/appointments-scheduling-rooms.md#story-008-doctor-sets-a-split-weekly-schedule-and-marks-a-cme-leave) · **Type**: medium · **Steps**: 8
- **Persona**: Dr. Praneeta Jain (DOCTOR), works 10:00–13:00 and 16:00–20:00 on weekdays and attends a dermatology CME in Hyderabad next Friday morning
- **Ideal path**: 7 — open settings, set Monday's two shifts (2), copy to Tue–Fri, save, then add the leave with dates and times (about 3)
- **Alternate paths**: An Admin or Owner can do the same from Users → doctor row **Working Hours** → dialog "Availability: Dr. Praneeta Jain" (STORY-009). Same component, two entry points, a redundancy candidate.

#### STORY-033: Admin declares Sankranti a clinic holiday and fixes a doctor's hours

- **Source**: [`appointments-scheduling-rooms` STORY-009](topics/appointments-scheduling-rooms.md#story-009-admin-declares-sankranti-a-clinic-holiday-and-fixes-a-doctors-hours) · **Type**: medium · **Steps**: 5
- **Persona**: Clinic admin (`admin@clinic.test`) planning the January calendar
- **Ideal path**: 6 — open holidays, set dates and reason, add; open the doctor's hours, add Saturday, save
- **Alternate paths**: Holidays can only be added from Users → **Clinic Holidays**. They can also be deleted from a doctor's **Working Hours** dialog, which shows holiday rows with a trash icon for admins. Doctor hours can also be edited by the doctor in header **My Settings** (STORY-008).

#### STORY-034: Receptionist checks which procedure room is free for a walk-in laser touch-up

- **Source**: [`appointments-scheduling-rooms` STORY-010](topics/appointments-scheduling-rooms.md#story-010-receptionist-checks-which-procedure-room-is-free-for-a-walk-in-laser-touch-up) · **Type**: short · **Steps**: 5
- **Persona**: Riya (RECEPTION), needs a room at a glance
- **Ideal path**: 3 — open Rooms, filter to Procedure, read the 14:00 row
- **Alternate paths**: The "Book Appointment" dialog's room cards show the same per-room availability for the chosen slot. The Appointments **Room** filter shows one doctor's bookings in a room, not room occupancy.

#### STORY-035: Admin adds a new laser room, then retires an old one

- **Source**: [`appointments-scheduling-rooms` STORY-011](topics/appointments-scheduling-rooms.md#story-011-admin-adds-a-new-laser-room-then-retires-an-old-one) · **Type**: medium · **Steps**: 8
- **Persona**: Clinic admin setting up the new Kondapur branch wing
- **Ideal path**: 8 — open the tab (1), add the room with name, type and capacity and save (4), rename and save (2), deactivate (1)
- **Alternate paths**: Activation can be toggled from the row **Switch** or from the **Room is active** checkbox in the Edit dialog. Two controls do the same thing, a redundancy candidate.

#### STORY-036: A full clinic day — from morning schedule check to the doctor starting visits

- **Source**: [`appointments-scheduling-rooms` STORY-012](topics/appointments-scheduling-rooms.md#story-012-a-full-clinic-day--from-morning-schedule-check-to-the-doctor-starting-visits) · **Type**: long · **Steps**: 18
- **Persona**: Riya (RECEPTION) running the front desk, with Dr. Shravya (DOCTOR) in Consultation Room 1
- **Ideal path**: 30 — the five booking and admin tasks at about 4 to 5 actions each (about 24), plus about 6 actions for the doctor's handoff
- **Alternate paths**: Booking via the Slots tab or Patients walk-in. Starting a visit from Patients row "Start Visit", patient detail, PatientProgressTracker "Start Visit", Visits page "Start New Visit", or the doctor's notification bell (whose `visits?appointmentId=` link ignores the appointment, see Defects).


### Visit Documentation

Source: [`topics/visit-documentation.md`](topics/visit-documentation.md) · STORY-037–STORY-048

#### STORY-037: Dr. Shravya documents an acne follow-up end to end, from a calendar tile to Complete Visit

- **Source**: [`visit-documentation` STORY-401](topics/visit-documentation.md#story-401-dr-shravya-documents-an-acne-follow-up-end-to-end-from-a-calendar-tile-to-complete-visit) · **Type**: long · **Steps**: 23
- **Persona**: Dr. Shravya (DOCTOR), a consultant dermatologist running a busy Saturday OPD
- **Ideal path**: 8 steps. Open the visit from the appointment, enter vitals, add photos, fill complaints, diagnosis and Rx, then press Complete. The code adds a mandatory "Save Labs" and photo step just to reach the 80% gate.
- **Alternate paths**: The same visit form opens from: - The Calendar tile "Start Visit" / "Continue Visit" (`DoctorDayCalendar` → `?patientId&appointmentId&autoStart=true` or `&visitId`). - The double-click "Appointment Details" dialog → "Start Visit". - The Slots tab (`AppointmentScheduler`, which creates the visit on the server before navigating). - Patients row "Start Visit" (`?patientId&autoStart=true`). - The patient detail page "Start visit" / open-last-visit buttons. - PatientProgressTracker "Start Visit" / "Continue". - The Dashboard "Recent Visits" link (`?patientId&visitId`). - The History tab "Resume session". - Visits → "Start New Visit" → "Start Visit Documentation". - The doctor notifications bell item (`?appointmentId=` only; see Defects).

#### STORY-038: Dr. Praneeta starts a walk-in visit from the Visits setup screen

- **Source**: [`visit-documentation` STORY-402](topics/visit-documentation.md#story-402-dr-praneeta-starts-a-walk-in-visit-from-the-visits-setup-screen) · **Type**: medium · **Steps**: 10
- **Persona**: Dr. Praneeta Jain (DOCTOR), seeing an unscheduled walk-in between appointments
- **Ideal path**: 4 steps. Visits → type patient name → pick patient (doctor defaults to the signed-in doctor) → Start Visit Documentation.
- **Alternate paths**: - Patients row "Start Visit". - Patient detail page "Start visit" button. - PatientProgressTracker "Start Visit". - Create the patient as Walk-in in "Create Patient" (auto-books an appointment), then Calendar tile "Start Visit".

#### STORY-039: Nurse Swathi records pre-consult vitals and hits a backend wall

- **Source**: [`visit-documentation` STORY-403](topics/visit-documentation.md#story-403-nurse-swathi-records-pre-consult-vitals-and-hits-a-backend-wall) · **Type**: medium · **Steps**: 12
- **Persona**: Swathi Kumari (NURSE, created by admin), who takes vitals in triage before the doctor sees the patient
- **Ideal path**: 4 steps. Open the appointment's visit → Vitals → enter values → save. The doctor then sees them.
- **Alternate paths**: - Sidebar Visits → Start New Visit. - Appointments tile "Start Visit". - Patients row "Start Visit".

#### STORY-040: Receptionist Riya captures "before" photos for a laser-hair-reduction patient

- **Source**: [`visit-documentation` STORY-404](topics/visit-documentation.md#story-404-receptionist-riya-captures-before-photos-for-a-laser-hair-reduction-patient) · **Type**: short · **Steps**: 5
- **Persona**: Riya Sharma (RECEPTION), front desk, who often takes intake photos while the doctor is busy
- **Ideal path**: 4 steps. Find patient → open photo capture → upload with positions → confirm the photos are attached to today's visit.
- **Alternate paths**: - Patients row "Start Visit" (the only reception route). - The patient detail "Uploads" tab shows the archive read-only.

#### STORY-041: Dr. Shravya compares melasma photos across visits and removes a blurry shot

- **Source**: [`visit-documentation` STORY-405](topics/visit-documentation.md#story-405-dr-shravya-compares-melasma-photos-across-visits-and-removes-a-blurry-shot) · **Type**: medium · **Steps**: 10
- **Persona**: Dr. Shravya, reviewing treatment response
- **Ideal path**: 5 steps. Photos tab → Compare: On → choose the earlier visit → step through position pairs → delete the bad photo.
- **Alternate paths**: - The patient detail page "Uploads" tab (PatientPhotoArchive, read-only). - The form's "Other saved photos" section under the Photos card. - PatientHistoryVisitCard photo counts in History.

#### STORY-042: Dictating chief complaints and examination by voice

- **Source**: [`visit-documentation` STORY-406](topics/visit-documentation.md#story-406-dictating-chief-complaints-and-examination-by-voice) · **Type**: short · **Steps**: 4
- **Persona**: Dr. Praneeta, who prefers dictating in a mix of English and Telugu terms while examining
- **Ideal path**: 3 steps. Tap mic → speak → tap again; the text is appended to the field.
- **Alternate paths**: `/test-transcribe` (a diagnostic bench, not wired to a visit). No mic exists on the Subjective/Objective/Assessment/Plan fields: their `VoiceButton` in MedicalVisitForm is never rendered.

#### STORY-043: AI-autofilling pre-methotrexate labs from a diagnostic-centre PDF

- **Source**: [`visit-documentation` STORY-407](topics/visit-documentation.md#story-407-ai-autofilling-pre-methotrexate-labs-from-a-diagnostic-centre-pdf) · **Type**: medium · **Steps**: 7
- **Persona**: Dr. Shravya, starting a patient on methotrexate who needs baseline LFT/CBC/RFT
- **Ideal path**: 3 steps. Lab Tests → choose file → review the auto-ticked tests and values → Save Labs.
- **Alternate paths**: - Manual checkbox selection and entry in the same tab. - Investigations can also be listed in the Prescription tab's investigations section (ClinicInvestigations), which is a separate list from Lab Tests.

#### STORY-044: Tele-video follow-up blocked until consent is recorded

- **Source**: [`visit-documentation` STORY-408](topics/visit-documentation.md#story-408-tele-video-follow-up-blocked-until-consent-is-recorded) · **Type**: short · **Steps**: 6
- **Persona**: Dr. Praneeta, doing a video follow-up with Harika Chowdary (31F, now in Vizag) for chronic urticaria
- **Ideal path**: 3 steps. Consultation type Tele-video → tick consent → Save Draft. Ideally a Telemedicine appointment would preselect Tele-video; the code does not.
- **Alternate paths**: none found. Consent can only be set in the form header card.

#### STORY-045: Two doctors edit the same visit; autosave conflict and recovery

- **Source**: [`visit-documentation` STORY-409](topics/visit-documentation.md#story-409-two-doctors-edit-the-same-visit-autosave-conflict-and-recovery) · **Type**: medium · **Steps**: 6
- **Persona**: Dr. Shravya, on the consultation room PC. - Dr. Praneeta, covering on a laptop. She opens the same visit to add a procedure plan.
- **Ideal path**: 3 steps. See the conflict notice → choose keep or discard → reload the saved visit.
- **Alternate paths**: - The same visit opens in two browser tabs of one user (this triggers the "Draft changed in another tab" toast instead).

#### STORY-046: Walk-in documentation lost after a refresh, and session expiry mid-visit

- **Source**: [`visit-documentation` STORY-410](topics/visit-documentation.md#story-410-walk-in-documentation-lost-after-a-refresh-and-session-expiry-mid-visit) · **Type**: short · **Steps**: 4
- **Persona**: Dr. Praneeta, whose laptop browser restarts for an update mid-consult
- **Ideal path**: 2 steps. Reopen the visit → the draft is restored automatically.
- **Alternate paths**: none found. There is no "recover drafts" UI.

#### STORY-047: Recording a Soprano laser hair reduction session on the Procedures page

- **Source**: [`visit-documentation` STORY-411](topics/visit-documentation.md#story-411-recording-a-soprano-laser-hair-reduction-session-on-the-procedures-page) · **Type**: medium · **Steps**: 11
- **Persona**: Dr. Shravya, running the procedure room, with nurse Swathi assisting
- **Ideal path**: 6 steps. Pick patient/doctor/nurse → session no. → body part → machine → fill pass grid → Save.
- **Alternate paths**: - The visit form's Prescription → "Procedures" section and the visit-level procedure fields (procType/fluence/spotSize/passes) record a procedure inside a normal visit. - Procedure History reads visits filtered by `plan.dermatology.procedures`.

#### STORY-048: Admin sanity-checks speech transcription on /test-transcribe

- **Source**: [`visit-documentation` STORY-412](topics/visit-documentation.md#story-412-admin-sanity-checks-speech-transcription-on-test-transcribe) · **Type**: short · **Steps**: 6
- **Persona**: Clinic admin (`admin@clinic.test`), checking that Whisper/OpenAI works before doctors rely on dictation
- **Ideal path**: 3 steps. Start Recording → Stop → Transcribe.
- **Alternate paths**: Sidebar Admin → "Test Transcribe" (OWNER/ADMIN/DOCTOR). A direct URL works for anyone, because the page is outside the middleware matcher.


### Prescriptions, Print & Share

Source: [`topics/prescriptions-print-share.md`](topics/prescriptions-print-share.md) · STORY-049–STORY-060

#### STORY-049: Dr. Shravya writes, prints and hands off an acne prescription for a walk-in college student

- **Source**: [`prescriptions-print-share` STORY-001](topics/prescriptions-print-share.md#story-001-dr-shravya-writes-prints-and-hands-off-an-acne-prescription-for-a-walk-in-college-student) · **Type**: long · **Steps**: 18
- **Persona**: Dr. Shravya (DOCTOR, `shravya@clinic.test`), running a busy Saturday OPD at the Jubilee Hills clinic
- **Ideal path**: 8 — open the visit, pick a template, add one drug, set dose/duration, create, preview, print, hand off; everything else (vitals, notes) is optional
- **Alternate paths**: Visit can be opened from ≥6 places (appointment tile "Start Visit", Appointment Details dialog, Patients row "Start Visit", patient detail, PatientProgressTracker, Visits "Start New Visit"). Handoff has two routes: footer "Go to Pharmacy" button (no confirm, passes `visitId`) and the post-create "Go to Pharmacy?" dialog "Yes, go to Pharmacy" (passes `prescriptionId`). Reception can also pick the Rx up independently from Pharmacy Billing's prescription queue ("Load").

#### STORY-050: Printing a Telugu prescription for an elderly patient

- **Source**: [`prescriptions-print-share` STORY-002](topics/prescriptions-print-share.md#story-002-printing-a-telugu-prescription-for-an-elderly-patient) · **Type**: medium · **Steps**: 7
- **Persona**: Dr. Praneeta (DOCTOR, `praneeta@clinic.test`), whose patients from Kukatpally often read only Telugu
- **Ideal path**: 4 — choose Telugu, open preview (translation happens automatically), check, print
- **Alternate paths**: none found (Language select exists only under the builder's "Basic Information" section; the backend translation-memory endpoints `GET/POST /prescriptions/translations` have no UI)

#### STORY-051: Fitting a long acne-scar + melasma regimen onto one page

- **Source**: [`prescriptions-print-share` STORY-003](topics/prescriptions-print-share.md#story-003-fitting-a-long-acne-scar--melasma-regimen-onto-one-page) · **Type**: medium · **Steps**: 7
- **Persona**: Dr. Praneeta, fussy about one-page printouts because patients lose page 2
- **Ideal path**: 3 — open preview, switch to a compact layout, print
- **Alternate paths**: Margins can be changed in three places — preview "Top margin"/"Bottom margin" sliders, Customization tab "Top/Bottom/Left/Right Margin (px)", and the "Printer profile" select (profiles cannot be created from the UI). Print format exists twice — footer "Print" select (Table/Text) and preview "Print Format". Page breaks only in the preview.

#### STORY-052: New doctor sets up signature and letterhead before her first OPD

- **Source**: [`prescriptions-print-share` STORY-004](topics/prescriptions-print-share.md#story-004-new-doctor-sets-up-signature-and-letterhead-before-her-first-opd) · **Type**: short · **Steps**: 5
- **Persona**: Dr. Shravya on her first day, not technical
- **Ideal path**: 3 — open settings, upload signature, upload letterhead (both save immediately)
- **Alternate paths**: Customization tab in a visit → "Print Background Image URL (optional)" + "Choose File" → "Save Doctor Default" / "Load Doctor Default" (stores `rxPrintProfile` in the user's metadata). This is a second, differently-behaving letterhead mechanism; a custom background URL overrides the uploaded letterhead (`prescription-letterhead.ts:12`). Signature has no alternate route (generic `POST /prescriptions/assets` refuses SIGNATURE).

#### STORY-053: Emailing the prescription PDF to a patient who left without the printout

- **Source**: [`prescriptions-print-share` STORY-005](topics/prescriptions-print-share.md#story-005-emailing-the-prescription-pdf-to-a-patient-who-left-without-the-printout) · **Type**: medium · **Steps**: 4
- **Persona**: Dr. Shravya between patients
- **Ideal path**: 2 — open preview, click Email
- **Alternate paths**: "PDF via WhatsApp" (STORY-006); "Download PDF" then attach manually from Gmail. Backend `POST /prescriptions/:id/share` (server-rendered pdfkit PDF) exists but no UI calls it.

#### STORY-054: Sending the prescription on WhatsApp from the desktop

- **Source**: [`prescriptions-print-share` STORY-006](topics/prescriptions-print-share.md#story-006-sending-the-prescription-on-whatsapp-from-the-desktop) · **Type**: medium · **Steps**: 4
- **Persona**: Dr. Praneeta, whose patients prefer WhatsApp
- **Ideal path**: 2 — open preview, click "PDF via WhatsApp" (a configured provider could send directly)
- **Alternate paths**: Patients row "WhatsApp" action sends only an appointment reminder, not the Rx. Backend `sharePrescription` WhatsApp channel (Cloud API) has no UI.

#### STORY-055: Building a reusable melasma template and cleaning up old ones

- **Source**: [`prescriptions-print-share` STORY-007](topics/prescriptions-print-share.md#story-007-building-a-reusable-melasma-template-and-cleaning-up-old-ones) · **Type**: medium · **Steps**: 6
- **Persona**: Dr. Praneeta, who sees 15 melasma follow-ups a week
- **Ideal path**: 3 for save (Save current → name → Save Template); 2 for delete
- **Alternate paths**: Three creation routes — "Save current" (→ "Save as Template"), "Save fields" (→ "Save Fields as Template", items excluded), "New template" (→ "Create New Template" dialog with its own drug search, morphology/distribution/skin-concern chips). Backend template versioning/approval endpoints have no UI.

#### STORY-056: Reception bills the medicines after the doctor's handoff

- **Source**: [`prescriptions-print-share` STORY-008](topics/prescriptions-print-share.md#story-008-reception-bills-the-medicines-after-the-doctors-handoff) · **Type**: short · **Steps**: 3
- **Persona**: Reception (`reception@clinic.test`) at the front desk, which doubles as the pharmacy till
- **Ideal path**: 3 — open Pharmacy Billing, Load the queued Rx, review
- **Alternate paths**: Doctor-side handoff ("Yes, go to Pharmacy" / footer "Go to Pharmacy") lands on the same Billing panel on the doctor's screen; Pharmacy Counter "Rx queue" → "Open bill"/"Start billing"; Inventory → Sales → "Counter sales".

#### STORY-057: Quick follow-up using last visit's medicines and treatment suggestions

- **Source**: [`prescriptions-print-share` STORY-009](topics/prescriptions-print-share.md#story-009-quick-follow-up-using-last-visits-medicines-and-treatment-suggestions) · **Type**: short · **Steps**: 3
- **Persona**: Dr. Shravya at Arjun's 4-week review, wants to be done in under a minute
- **Ideal path**: 3 — reuse last meds, edit one row, create
- **Alternate paths**: "Reuse last meds" button; "Treatment suggestions" → "Reapply learned plan" / "Fill missing only"; selecting the saved template; "Recent meds:" chips (per patient, else global).

#### STORY-058: Prescribing a brand that is not in the drug master, with a custom dosing pattern

- **Source**: [`prescriptions-print-share` STORY-010](topics/prescriptions-print-share.md#story-010-prescribing-a-brand-that-is-not-in-the-drug-master-with-a-custom-dosing-pattern) · **Type**: short · **Steps**: 4
- **Persona**: Dr. Praneeta prescribing a new isotretinoin brand a rep left samples of
- **Ideal path**: 4 — open add-drug dialog, fill name+manufacturer, save, pick custom frequency
- **Alternate paths**: Pharmacy Desk → "Drug Management" → "Add New Drug" (`/dashboard/pharmacy/drugs`, not reachable from DOCTOR's sidebar); or simply type the free-text name in the row without adding to the master.

#### STORY-059: Reprinting an old prescription from the visit history

- **Source**: [`prescriptions-print-share` STORY-011](topics/prescriptions-print-share.md#story-011-reprinting-an-old-prescription-from-the-visit-history) · **Type**: short · **Steps**: 3
- **Persona**: Dr. Shravya, asked by a patient for a copy of last month's prescription for insurance
- **Ideal path**: 3 — find the visit, open its prescription, print
- **Alternate paths**: Visits page right panel "Patient History" → "View Prescription" → "Prescription Details" → "Print"; or open that past visit (resume) → Prescription tab → "Print Preview" → "Print" (re-saves the visit first). Patient detail History tab and MedicalVisitForm History tab show "n Rx Items" but no print action.

#### STORY-060: Non-doctor roles look for the prescription controls

- **Source**: [`prescriptions-print-share` STORY-012](topics/prescriptions-print-share.md#story-012-non-doctor-roles-look-for-the-prescription-controls) · **Type**: short · **Steps**: 2
- **Persona**: Nurse or Reception staff asked by a patient to "print my prescription again"
- **Ideal path**: 2 — open the visit, reach a print action (if role allowed)
- **Alternate paths**: Pharmacy Billing loads the Rx lines (RECEPTION) but has no prescription print; "Prescription Details" Print on Visits page (no Visits sidebar link for RECEPTION).


### Pharmacy Counter & Billing

Source: [`topics/pharmacy-counter-billing.md`](topics/pharmacy-counter-billing.md) · STORY-061–STORY-072

#### STORY-061: Accept every line of a morning acne prescription and mark it ready to bill

- **Source**: [`pharmacy-counter-billing` STORY-601](topics/pharmacy-counter-billing.md#story-601-accept-every-line-of-a-morning-acne-prescription-and-mark-it-ready-to-bill) · **Type**: short · **Steps**: 6
- **Persona**: Suresh Goud, pharmacist. At 10:15 on a busy Saturday he wants to clear the oldest waiting prescription before the next consult batch arrives…
- **Ideal path**: 5 steps. Open Counter, select the prescription, Accept ×3, Ready. Review needs one click per line, but selecting and opening could be a single step.
- **Alternate paths**: Sidebar "Pharmacy Counter", or Pharmacy Desk quick action "Pharmacy Counter" ("Review and pick"). Line review exists only in the cockpit's "Active Dispense" column. The Prescription Queue table below it and the Billing tab queue have no review actions.

#### STORY-062: Pause a prescription because the antifungal is out of stock, with a note to the doctor

- **Source**: [`pharmacy-counter-billing` STORY-602](topics/pharmacy-counter-billing.md#story-602-pause-a-prescription-because-the-antifungal-is-out-of-stock-with-a-note-to-the-doctor) · **Type**: medium · **Steps**: 10
- **Persona**: Suresh, pharmacist. Lulifin cream ran out yesterday and he does not want to hand over a partial bag without asking Dr. Praneeta.
- **Ideal path**: 5 steps. Select the entry, NA on Lulifin, Accept Forcan, choose a reason and type a note, Pause.
- **Alternate paths**: None. Pause, reason and note exist only in the Counter cockpit. The Billing tab has no pause concept. A pharmacist there would just remove the line from the bill ("Remove Lulifin…").

#### STORY-063: Doctor prescribes, then the pharmacist reviews, bills, prints, collects and dispenses (end to end)

- **Source**: [`pharmacy-counter-billing` STORY-603](topics/pharmacy-counter-billing.md#story-603-doctor-prescribes-then-the-pharmacist-reviews-bills-prints-collects-and-dispenses-end-to-end) · **Type**: long · **Steps**: 23
- **Persona**: Dr. Shravya Dermatologist finishes a follow-up for Ananya Varma (98660 77889, Banjara Hills). Suresh Goud, pharmacist…
- **Ideal path**: 12 steps. Prescribe, hand off, select at counter, accept ×3, Ready, open bill, confirm quantity reviews, Print Preview, Confirm & Print, record payment, Dispense. A UI that recorded payment at checkout would need about 10.
- **Alternate paths**: Hand-off from the visit: "Go to Pharmacy" in PrescriptionBuilder (before create, prefill by visitId) or "Yes, go to Pharmacy" in the post-create confirm dialog (prefill by prescriptionId). A pharmacist can also skip the Counter entirely: Pharmacy Billing → queue row "Load". From the Counter, billing opens through the header "Bill", "Open bill" (Active Dispense), "Collect payment" (Pick + Pay), or a Prescription Queue table row "Bill". All four do the same thing. Payment can be recorded only from Pharmacy Invoices ("Mark as Paid"), reachable from the Desk "Invoices" button or Inventory → Sales → "Patient invoice history".

#### STORY-064: Load a prescription whose cream is not linked to inventory and link it once for all patients

- **Source**: [`pharmacy-counter-billing` STORY-604](topics/pharmacy-counter-billing.md#story-604-load-a-prescription-whose-cream-is-not-linked-to-inventory-and-link-it-once-for-all-patients) · **Type**: medium · **Steps**: 7
- **Persona**: Suresh, pharmacist. Dr. Praneeta writes "Momate-S ointment" free-text and it never matches stock automatically.
- **Ideal path**: 5 steps. Load, Link item, search, select, confirm. The bill re-fills automatically.
- **Alternate paths**: "Link item" appears in the Stock column of the Prescription Queue table (both the Counter and Billing tabs) and in the builder's "Linked Prescription" box ("… link inventory before billing. Link item"). The builder also offers "Substitute", which replaces the product for this bill only and does not remember the match.

#### STORY-065: Walk-in customer buys a sunscreen and an acne care package without a prescription

- **Source**: [`pharmacy-counter-billing` STORY-605](topics/pharmacy-counter-billing.md#story-605-walk-in-customer-buys-a-sunscreen-and-an-acne-care-package-without-a-prescription) · **Type**: medium · **Steps**: 9
- **Persona**: Suresh, pharmacist. Priya Menon (97010 55667, Madhapur), a returning patient…
- **Ideal path**: 6 steps. Open billing, pick the patient, add the drug, add the package, preview, confirm.
- **Alternate paths**: Pharmacy Counter empty-queue "Walk-in bill" (shown only when the queue is empty), Counter header "Bill" with nothing selected, Active Dispense "Start billing", and Inventory → Sales → "Counter sales" (separate COUNTER_SALE workflow). Sidebar "Pharmacy Billing" and `/dashboard/billing` (redirect) open the same builder.

#### STORY-066: Wi-Fi drops while confirming; recover the pending checkout without double billing

- **Source**: [`pharmacy-counter-billing` STORY-606](topics/pharmacy-counter-billing.md#story-606-wi-fi-drops-while-confirming-recover-the-pending-checkout-without-double-billing) · **Type**: medium · **Steps**: 5
- **Persona**: Suresh, pharmacist. The clinic's ACT Fibernet line flickers during the monsoon. He clicked Confirm and the spinner just hung.
- **Ideal path**: 3 steps. Reload, Retry pending checkout, print. The idempotent request key makes the retry safe.
- **Alternate paths**: Check Pharmacy Invoices (search "Venkat") to see whether PHI-… exists. The banner's own "Retry pending checkout" is the intended path.

#### STORY-067: Re-print a duplicate copy of yesterday's invoice for an insurance claim

- **Source**: [`pharmacy-counter-billing` STORY-607](topics/pharmacy-counter-billing.md#story-607-re-print-a-duplicate-copy-of-yesterdays-invoice-for-an-insurance-claim) · **Type**: short · **Steps**: 4
- **Persona**: Suresh, pharmacist. Ravi Teja (98490 11223) returns and needs a copy of yesterday's bill for his employer's medical reimbursement.
- **Ideal path**: 3 steps. Open invoices, search, print.
- **Alternate paths**: Pharmacy Desk "Invoices" → `/dashboard/pharmacy/invoices`; Inventory → Sales → "Patient invoice history" (same component). The billing builder's "Reopen confirmed invoice" works only for the last checkout in this tab. A true "Duplicate" copy-type print exists only in the builder preview. The list's print has no copy type.

#### STORY-068: Evening reconciliation in Pharmacy Invoices: filter unpaid UPI bills, collect, and try to delete a mistake

- **Source**: [`pharmacy-counter-billing` STORY-608](topics/pharmacy-counter-billing.md#story-608-evening-reconciliation-in-pharmacy-invoices-filter-unpaid-upi-bills-collect-and-try-to-delete-a-mistake) · **Type**: medium · **Steps**: 8
- **Persona**: Suresh at 8:30 pm, before handing over the cash drawer. He wants every UPI invoice from today marked paid and a wrong bill removed.
- **Ideal path**: 6 steps. Filter Payment Status=Pending, Payment Method=UPI, then Mark as Paid ×2, then cancel the wrong invoice. The last needs a "Cancel/Void" action that the UI lacks.
- **Alternate paths**: Inventory → Sales → "Patient invoice history" renders the same list. Admin and Accountant notification-bell items "N pending payments" link to `/dashboard/pharmacy?section=billing`, which is the builder, not this list.

#### STORY-069: Receptionist covers the pharmacy counter during the pharmacist's lunch

- **Source**: [`pharmacy-counter-billing` STORY-609](topics/pharmacy-counter-billing.md#story-609-receptionist-covers-the-pharmacy-counter-during-the-pharmacists-lunch) · **Type**: medium · **Steps**: 7
- **Persona**: Riya Sharma, receptionist (reception@clinic.test). Suresh is at lunch and a patient is waiting for medicines…
- **Ideal path**: Not applicable. The UI should either hide these actions from RECEPTION or the backend should allow them. Today the goal cannot be reached.
- **Alternate paths**: None that succeed. Inventory → Sales → "Counter sales" is a separate workflow and was not verified for RECEPTION here.

#### STORY-070: Doctor sends the patient straight to Pharmacy from the prescription

- **Source**: [`pharmacy-counter-billing` STORY-610](topics/pharmacy-counter-billing.md#story-610-doctor-sends-the-patient-straight-to-pharmacy-from-the-prescription) · **Type**: short · **Steps**: 4
- **Persona**: Dr. Praneeta Jain (praneeta@clinic.test). It is a small Sunday clinic with no pharmacist on duty, so she bills medicines herself.
- **Ideal path**: 3 steps. Create Prescription, "Yes, go to Pharmacy", Print Preview/Confirm.
- **Alternate paths**: "Go to Pharmacy" button beside "Create Prescription" (prefills by visitId and may load the visit's existing prescription). "Yes, go to Pharmacy" in the post-create dialog (prefills by prescriptionId). The patient profile and visit progress tracker show a "Bill" button (prefills by visitId). The doctor's sidebar has no Pharmacy links, so no navigation path exists for her.

#### STORY-071: Front desk checks whether a patient's medicines are already billed from the patient profile

- **Source**: [`pharmacy-counter-billing` STORY-611](topics/pharmacy-counter-billing.md#story-611-front-desk-checks-whether-a-patients-medicines-are-already-billed-from-the-patient-profile) · **Type**: short · **Steps**: 3
- **Persona**: Admin (admin@clinic.test) at the front desk. Lakshmi Reddy's husband asks whether her medicines from this morning were billed.
- **Ideal path**: 2 steps. Open the patient, read the billing step or open invoices filtered to her.
- **Alternate paths**: Pharmacy Invoices → Search "Lakshmi". Inventory → Sales → "Patient invoice history". The PatientProgressTracker "Bill"/"Invoices" button appears on the patient detail page, the appointment scheduler and day calendar, and the Visits page.

#### STORY-072: Triage a long Saturday queue: filters, overdue items and the second queue table

- **Source**: [`pharmacy-counter-billing` STORY-612](topics/pharmacy-counter-billing.md#story-612-triage-a-long-saturday-queue-filters-overdue-items-and-the-second-queue-table) · **Type**: medium · **Steps**: 7
- **Persona**: Suresh, pharmacist. At noon 15 prescriptions are waiting and several are flagged "over 2h". He wants to see everything that is stuck.
- **Ideal path**: 2 steps. Open Counter, choose "Exceptions". This is achievable only if the cockpit pages or loads the full list.
- **Alternate paths**: The cockpit Queue column (filters All/Queue/Review/Exceptions/Done, first 8 only). The "Prescription Queue" table directly below it (status filter All/Pending/Partial/Dispensed/Expired, 20 per page, Previous/Next). The same table on Pharmacy Billing (button "Load" instead of "Bill"). The cockpit header "Rx queue" button looks like a third path but does nothing.


### Pharmacy Desk, Catalog & AI

Source: [`topics/pharmacy-desk-catalog-ai.md`](topics/pharmacy-desk-catalog-ai.md) · STORY-073–STORY-084

#### STORY-073: Morning glance at the Pharmacy Desk metric strip

- **Source**: [`pharmacy-desk-catalog-ai` STORY-701](topics/pharmacy-desk-catalog-ai.md#story-701-morning-glance-at-the-pharmacy-desk-metric-strip) · **Type**: short · **Steps**: 5
- **Persona**: Admin User (admin@clinic.test). He runs the clinic's attached pharmacy in Jubilee Hills and checks the counter numbers before the 10 a.m…
- **Ideal path**: 1. Click the sidebar "Pharmacy Desk" and every metric is visible above the fold, with no further clicks.
- **Alternate paths**: - The Dashboard home "System Alerts" card ("Low Stock Alert", "Overdue Invoices", "Pending Payments") shows overlapping stock and invoice signals. - Inventory → Today "Low stock" queue gives a third low-stock count. - The Pharmacy Invoices list (`/dashboard/pharmacy/invoices`, also Inventory → Sales → "Patient invoice history") shows "Total Invoices / Completed / Pending Amount". - Drug Management shows "Total Drugs", the same number as the Desk "Stock" tile. The same facts therefore appear on 3–4 surfaces, with different definitions on each.

#### STORY-074: Receptionist opens the Pharmacy Desk and finds that most of it doesn't work for her

- **Source**: [`pharmacy-desk-catalog-ai` STORY-702](topics/pharmacy-desk-catalog-ai.md#story-702-receptionist-opens-the-pharmacy-desk-and-finds-that-most-of-it-doesnt-work-for-her) · **Type**: short · **Steps**: 5
- **Persona**: Riya Sharma, receptionist (reception@clinic.test). She covers the pharmacy counter during lunch and assumes that a sidebar link means she ca…
- **Ideal path**: 1. The sidebar link should either open a Desk scoped to what RECEPTION can do, or not appear at all; one click with no dead widgets.
- **Alternate paths**: - "Pharmacy Counter" and "Pharmacy Billing" sidebar links (other topic). - The Desk "Drugs" button and the direct URL `/dashboard/pharmacy/drugs` both reach the same blocked catalog.

#### STORY-075: Add a new depigmentation cream to the drug master

- **Source**: [`pharmacy-desk-catalog-ai` STORY-703](topics/pharmacy-desk-catalog-ai.md#story-703-add-a-new-depigmentation-cream-to-the-drug-master) · **Type**: medium · **Steps**: 8
- **Persona**: Admin User. Dr. Shravya started prescribing a new triple-combination cream…
- **Ideal path**: 3. Open Drug Management, click "Add New Drug", then fill the required fields and save.
- **Alternate paths**: - Prescription tab "Add drug" dialog inside a visit (PrescriptionBuilder → `POST /drugs`). - Pharmacy AI assistant: ask "Add Melaglow-T Cream 15g by Ajanta Pharma at ₹289" → `create_drug` proposal → "Apply" (see STORY-710). - Three creation paths therefore exist, each with different validation.

#### STORY-076: Correct a drug's details, try a price change, and retire an old SKU

- **Source**: [`pharmacy-desk-catalog-ai` STORY-704](topics/pharmacy-desk-catalog-ai.md#story-704-correct-a-drugs-details-try-a-price-change-and-retire-an-old-sku) · **Type**: medium · **Steps**: 6
- **Persona**: Farhana Begum, pharmacist. She has a PHARMACIST account created by the admin via Users → "New User", with explicit `pharmacy:drug:read`…
- **Ideal path**: 3 per edit. Search, click edit, then change and save. Retiring a drug should be 2 steps (find, then discontinue with confirm).
- **Alternate paths**: - Price/stock edit requests from Inventory → Stock → "Edit price" (approval workflow; other topic). - AI `update_drug` proposal from the assistant dock. - There is no "Discontinue" toggle in the UI, even though `isDiscontinued` exists on the DTO. Delete is the only retirement path.

#### STORY-077: Find all Glenmark dermatology products in the catalog

- **Source**: [`pharmacy-desk-catalog-ai` STORY-705](topics/pharmacy-desk-catalog-ai.md#story-705-find-all-glenmark-dermatology-products-in-the-catalog) · **Type**: short · **Steps**: 5
- **Persona**: Dr. Praneeta Jain (praneeta@clinic.test). She wants to see which Glenmark topical products the pharmacy stocks before a medical-rep visit.
- **Ideal path**: 3. Open the catalog, pick a manufacturer, and read the results.
- **Alternate paths**: - Typing in the prescription drug autocomplete (`/drugs/autocomplete`). - Asking the AI assistant "List Glenmark drugs by price" (`drug_catalog` data request). - With no sidebar link, a DOCTOR must type `/dashboard/pharmacy/drugs` or go via `/dashboard/pharmacy` → "Drugs".

#### STORY-078: Dr. Shravya builds a melasma night-care treatment package

- **Source**: [`pharmacy-desk-catalog-ai` STORY-706](topics/pharmacy-desk-catalog-ai.md#story-706-dr-shravya-builds-a-melasma-night-care-treatment-package) · **Type**: medium · **Steps**: 10
- **Persona**: Dr. Shravya (shravya@clinic.test), dermatologist. She wants a bundled ₹1,499 "Melasma Night Care Kit" the pharmacy can sell to patients on h…
- **Ideal path**: 5. Open "Create Package", name it and set the price, add 3 drugs, set visibility, then click "Create Package".
- **Alternate paths**: - None in the UI. `PharmacyPackageManager` (with edit and delete) is orphaned. - Packages can't be edited or deleted from any reachable screen. The backend PATCH/DELETE exist, creator-only.

#### STORY-079: Review a pre-built acne package before recommending it

- **Source**: [`pharmacy-desk-catalog-ai` STORY-707](topics/pharmacy-desk-catalog-ai.md#story-707-review-a-pre-built-acne-package-before-recommending-it) · **Type**: short · **Steps**: 4
- **Persona**: Admin User, answering a patient's phone query about the "Complete Acne Treatment Kit - Mild".
- **Ideal path**: 2. Search the package and open its details.
- **Alternate paths**: - Pharmacy Billing → invoice builder "Treatment Packages" tab lists packages again, with "Add to Invoice" (other topic). Package name, prices and discount appear on both surfaces plus the Desk "Packages" count, which is a redundancy candidate.

#### STORY-080: Record the partner pharmacy's daily sale before the 10 p.m. cut-off

- **Source**: [`pharmacy-desk-catalog-ai` STORY-708](topics/pharmacy-desk-catalog-ai.md#story-708-record-the-partner-pharmacys-daily-sale-before-the-10-pm-cut-off) · **Type**: medium · **Steps**: 10
- **Persona**: Admin User, closing the day. The clinic supplies stock to a partner counter, "Sri Sai Medicals, Kondapur"…
- **Ideal path**: 5. Enter the partner, add 3 lines, Submit, then Commit. Partner selection should be a picker, not free text.
- **Alternate paths**: - Pharmacy Counter "Daily close" button → switches to the Desk (`section=desk`), where this card lives. - `source: 'CSV'` is accepted by the API, but no CSV upload UI exists.

#### STORY-081: Reconcile a partner sale whose batch doesn't match clinic stock

- **Source**: [`pharmacy-desk-catalog-ai` STORY-709](topics/pharmacy-desk-catalog-ai.md#story-709-reconcile-a-partner-sale-whose-batch-doesnt-match-clinic-stock) · **Type**: long · **Steps**: 12
- **Persona**: Farhana Begum, pharmacist (PHARMACIST with working pharmacy permissions). She is reconciling yesterday's partner sheet…
- **Ideal path**: 7. Commit, open the unmatched line, search, pick the batch, give a reason, save, and retry.
- **Alternate paths**: - Inventory workspace stock corrections (other topic) can fix stock but not the partner line match. - No other surface lists partner sales.

#### STORY-082: Ask the Pharmacy AI assistant about low stock and act on its proposal

- **Source**: [`pharmacy-desk-catalog-ai` STORY-710](topics/pharmacy-desk-catalog-ai.md#story-710-ask-the-pharmacy-ai-assistant-about-low-stock-and-act-on-its-proposal) · **Type**: medium · **Steps**: 9
- **Persona**: Admin User, preparing Saturday's distributor order for "Sri Venkateswara Pharma Distributors, Koti".
- **Ideal path**: 4. Open the assistant, ask, review the proposal diff, then Apply.
- **Alternate paths**: - Low-stock data also appears in the Desk "Stock … low" tile, Dashboard "Low Stock Alert", Inventory → Today "Low stock" and Reorder → Shortbook. - The drug create path also exists in Drug Management "Add New Drug" (STORY-703) and the visit Prescription add-drug dialog.

#### STORY-083: Manage AI chat threads — new chat, archive, restore

- **Source**: [`pharmacy-desk-catalog-ai` STORY-711](topics/pharmacy-desk-catalog-ai.md#story-711-manage-ai-chat-threads--new-chat-archive-restore) · **Type**: medium · **Steps**: 7
- **Persona**: Admin User. He has collected a dozen assistant threads over the week and wants a clean slate for the monthly GST discussion.
- **Ideal path**: 2 per action. Select the thread, then click Archive or Restore.
- **Alternate paths**: - The Archive button in the dock header (current thread) and the per-thread archive icon in the "Active" rail both archive. That's two controls for the same action.

#### STORY-084: Admin's end-of-week pharmacy catalog clean-up, end to end

- **Source**: [`pharmacy-desk-catalog-ai` STORY-712](topics/pharmacy-desk-catalog-ai.md#story-712-admins-end-of-week-pharmacy-catalog-clean-up-end-to-end) · **Type**: long · **Steps**: 16
- **Persona**: Admin User, Saturday 6 p.m., alone at the clinic. He wants the catalog, packages and partner records tidy before Monday.
- **Ideal path**: 14. Desk (1), AI ask plus apply (3), verify drug (2), create package (5), check billing tab (2), partner entry plus commit (3) ≈ 16. A Desk whose packages browser could add to an invoice and whose drug link opened inline would trim this.
- **Alternate paths**: Every sub-goal has the duplicates listed in STORY-701, 703, 707 and 708. The Desk "Inventory Control" quick action is meant to be a shortcut to stock but lands on Inventory → Today (dead `?tab=pharmacy-control`).


### Inventory: Stock, Sales & Reorder

Source: [`topics/inventory-stock-sales-reorder.md`](topics/inventory-stock-sales-reorder.md) · STORY-085–STORY-096

#### STORY-085: Morning triage from the Inventory "Today" queues

- **Source**: [`inventory-stock-sales-reorder` STORY-801](topics/inventory-stock-sales-reorder.md#story-801-morning-triage-from-the-inventory-today-queues) · **Type**: short · **Steps**: 5
- **Persona**: Admin User (admin@clinic.test), who runs the pharmacy back office and opens Inventory first thing each day
- **Ideal path**: 2. Open Inventory, then click the "Low stock" queue row. The queue is the landing view, so one click reaches the filtered list.
- **Alternate paths**: (a) the **"Check low stock"** button under the queue list on Today does the same navigation; (b) Stock → Stock list → "Stock level" select → "Low stock"; (c) header notifications bell "N low-stock items" links to `?tab=low-stock` (known broken: lands on Today). For expiry: the "Expiring in the next 3 months" row, the **"Check next 3 months’ expiry"** button, or Stock list → "Expiry" → "Within 3 months".

#### STORY-086: Pharmacist-side stock correction approved by a doctor

- **Source**: [`inventory-stock-sales-reorder` STORY-802](topics/inventory-stock-sales-reorder.md#story-802-pharmacist-side-stock-correction-approved-by-a-doctor) · **Type**: medium · **Steps**: 11
- **Persona**: Admin User submits; Dr. Shravya (shravya@clinic.test) approves between consultations
- **Ideal path**: 6. Find the batch → Edit stock → enter 9 + reason → submit; the doctor then opens the queue → Approve → confirm. That is two people, each needing about 3 actions.
- **Alternate paths**: (a) the **Edit stock** button is available both in the stock list row ("Edit" column) and on the batch detail page; (b) the doctor reaches the queue from the Today row "Price/stock edits awaiting approval (n)", from Stock → **Approve corrections**, from the old bookmark `/dashboard/inventory-updates` (redirects to `?area=stock&view=approvals`), or from the submitter's notice link **"Open approval queue"**; (c) a physical discrepancy can instead be fixed through a stock count (STORY-806), which uses the workflow-approval track (managers) instead of the doctor track.

#### STORY-087: Receptionist explores Inventory and runs into permission walls

- **Source**: [`inventory-stock-sales-reorder` STORY-803](topics/inventory-stock-sales-reorder.md#story-803-receptionist-explores-inventory-and-runs-into-permission-walls) · **Type**: short · **Steps**: 5
- **Persona**: Riya Sharma (reception@clinic.test), covering the pharmacy counter while the pharmacist is on leave
- **Ideal path**: 3. Inventory → search "keto" → read Available. The sale lookup cannot complete for this role.
- **Alternate paths**: The stock check can also go through Pharmacy Counter/Billing drug search (out of topic). For sale history: Inventory → Sales → Patient invoice history, `/dashboard/pharmacy/invoices`, or Pharmacy Billing. All of them call ADMIN/PHARMACIST/DOCTOR-only invoice endpoints.

#### STORY-088: Add a new batch and post its opening balance manually

- **Source**: [`inventory-stock-sales-reorder` STORY-804](topics/inventory-stock-sales-reorder.md#story-804-add-a-new-batch-and-post-its-opening-balance-manually) · **Type**: medium · **Steps**: 12
- **Persona**: Admin User setting up a newly stocked product
- **Ideal path**: 5. Add batch (one form that includes the opening quantity) → save. Today it takes two separate flows because **Add Inventory Item** has no quantity field, which raises the real count to about 12 actions.
- **Alternate paths**: (a) Stock → **Opening stock import** (Excel, STORY-805); (b) Purchases → Inward challans "Receive stock" or Scan or enter bill → commit stock, which is the normal supplier route (purchases topic); (c) Counts & audit cannot set opening stock on a new batch, and the backend steers to a reviewed count or correction only for existing batches.

#### STORY-089: First-day setup from the old pharmacy's Excel stock sheet

- **Source**: [`inventory-stock-sales-reorder` STORY-805](topics/inventory-stock-sales-reorder.md#story-805-first-day-setup-from-the-old-pharmacys-excel-stock-sheet) · **Type**: medium · **Steps**: 9
- **Persona**: Admin User migrating from a Marg-style Excel export on go-live day
- **Ideal path**: 4. Open import → choose file → review preview → confirm.
- **Alternate paths**: Manual opening stock one batch at a time (STORY-804). The compact "Start Inventory From Excel" card inside the orphaned PharmacyInventoryControl is not reachable.

#### STORY-090: Doctor-led expiry count with variance that needs manager approval

- **Source**: [`inventory-stock-sales-reorder` STORY-806](topics/inventory-stock-sales-reorder.md#story-806-doctor-led-expiry-count-with-variance-that-needs-manager-approval) · **Type**: long · **Steps**: 15
- **Persona**: Dr. Praneeta Jain (praneeta@clinic.test), who checks the cosmeceutical shelf every month; Admin User approves
- **Ideal path**: 8. Filter by expiry → count matching → enter counts → submit; the admin then opens the count → approve → apply.
- **Alternate paths**: (a) Stock → **Counts & audit** → **Start stock count** (counts every batch in the branch, with no filter); (b) batch detail → **Count this batch**; (c) select rows in the Stock list → **Count selected batches**; (d) Automation settings "Daily stock count" generates counts automatically; (e) links named "Open Counts & audit" in the purchase workbench, the Compliance Center and the workflow editor outcome panel; (f) for a single batch, **Edit stock** through the doctor/admin approval track (STORY-802).

#### STORY-091: Hold a suspected batch, then return it to the distributor for credit

- **Source**: [`inventory-stock-sales-reorder` STORY-807](topics/inventory-stock-sales-reorder.md#story-807-hold-a-suspected-batch-then-return-it-to-the-distributor-for-credit) · **Type**: long · **Steps**: 11
- **Persona**: Admin User handling a manufacturer recall notice for "Mintop 5% Solution 60ml" batch MT2408
- **Ideal path**: 9. Find the batch → Blocked stock → post; Loss & breakage from the hold → post; Supplier returns from the hold → challan → finalise.
- **Alternate paths**: Each document can also be started from its register: Stock → More tasks → "Blocked stock" / "Loss & breakage" / "Supplier returns" → **New document**, then search the batch manually. The batch-detail buttons prefill the line instead. The Today row "Supplier returns in progress" reopens an unfinished return.

#### STORY-092: Walk-in counter sale from Inventory, including a quotation and FEFO override

- **Source**: [`inventory-stock-sales-reorder` STORY-808](topics/inventory-stock-sales-reorder.md#story-808-walk-in-counter-sale-from-inventory-including-a-quotation-and-fefo-override) · **Type**: medium · **Steps**: 8
- **Persona**: Dr. Shravya (DOCTOR, has `*` workflow access) covering the counter on a Saturday evening
- **Ideal path**: 5. Sales → New document → add batch → enter payment → Post sale. The quotation step is optional and adds 3.
- **Alternate paths**: Selling is reachable in 3 places: (a) Pharmacy Billing invoice builder (`/dashboard/pharmacy?section=billing`); (b) Pharmacy Counter "Walk-in bill"; (c) Inventory → Sales → Counter sales (this story). A quotation converts to a counter-sale draft through "Create sale draft".

#### STORY-093: Customer returns an unopened product: quarantine, inspect, release

- **Source**: [`inventory-stock-sales-reorder` STORY-809](topics/inventory-stock-sales-reorder.md#story-809-customer-returns-an-unopened-product-quarantine-inspect-release) · **Type**: medium · **Steps**: 6
- **Persona**: Admin User handling a return at the counter
- **Ideal path**: 6. Customer returns → New → pick the sold batch → disposition → post; later Release held stock.
- **Alternate paths**: none found for returns of workflow counter sales. PharmacyInvoice returns are not handled here.

#### STORY-094: Low stock to shortbook to purchase order to partial receipt

- **Source**: [`inventory-stock-sales-reorder` STORY-810](topics/inventory-stock-sales-reorder.md#story-810-low-stock-to-shortbook-to-purchase-order-to-partial-receipt) · **Type**: long · **Steps**: 18
- **Persona**: Admin User doing the weekly reorder for the acne line
- **Ideal path**: 12. Sync shortages → open request → choose supplier → create PO → submit → approve → receive → post receipt → cancel the remainder. Each request is a separate shortbook document, so the count grows per item.
- **Alternate paths**: (a) Reorder → Purchase orders → **Add purchase order** (manual order without shortbook); (b) Shortbook **Add manual request**; (c) receiving: PO detail **Receive remaining stock**, Purchases → **Inward challans** → New document → "Purchase order" select, or the PO editor link **Review linked receipts**; (d) Today **Low stock** row → Stock list (inspection only, there is no "add to shortbook" action there); (e) target proposals with "Sync accepted targets to Shortbook" (STORY-811); (f) "Automatic PO drafts" in Automation settings.

#### STORY-095: Configure replenishment automation and review a target proposal

- **Source**: [`inventory-stock-sales-reorder` STORY-811](topics/inventory-stock-sales-reorder.md#story-811-configure-replenishment-automation-and-review-a-target-proposal) · **Type**: medium · **Steps**: 9
- **Persona**: Admin User, with Dr. Shravya giving input on seasonal demand
- **Ideal path**: 7. Settings → set owner and toggles → Save → Run → open generated proposal → select → Accept.
- **Alternate paths**: (a) Reorder → **Target proposals** → **Generate target proposal** (manual run without saving settings); (b) the "Open generated document" link in **Saved run outcomes**; (c) Monitor → "Demand & stock coverage" → **Review proposal**; (d) minimum/maximum can also be changed directly in **Manual targets & exclusions** or in batch detail **Edit product details** (Minimum stock / Maximum stock / Reorder at); (e) `/dashboard/stock-predictions` redirects to Manual targets & exclusions.

#### STORY-096: Old bookmarks and phone-width task switching

- **Source**: [`inventory-stock-sales-reorder` STORY-812](topics/inventory-stock-sales-reorder.md#story-812-old-bookmarks-and-phone-width-task-switching) · **Type**: short · **Steps**: 4
- **Persona**: Admin User returning after months away, now on a phone
- **Ideal path**: 2. Open the bookmark → land on the target view.
- **Alternate paths**: The sidebar Inventory → Stock → Approve corrections; Reorder → More tasks → Manual targets & exclusions.


### Purchases, Suppliers & Compliance

Source: [`topics/purchases-suppliers-compliance.md`](topics/purchases-suppliers-compliance.md) · STORY-097–STORY-108

#### STORY-097: Scan a three-line distributor bill, match products and add stock (OCR end to end)

- **Source**: [`purchases-suppliers-compliance` STORY-901](topics/purchases-suppliers-compliance.md#story-901-scan-a-three-line-distributor-bill-match-products-and-add-stock-ocr-end-to-end) · **Type**: long · **Steps**: 19
- **Persona**: Kavitha Rao, clinic admin who runs pharmacy purchasing (`admin@clinic.test`)…
- **Ideal path**: 6. Open the scan task, choose the file and received date, scan, confirm the supplier, confirm the one new product, add stock. The supplier and matches should be pre-filled when exact.
- **Alternate paths**: (a) Today → "Scan or enter bill" button (top of "What needs attention"). (b) Purchases → "Scan or enter bill" task button. (c) Today → "Original files awaiting intake" row, which lands on the same intake view. (d) "Automatic import" → "Import & Add Stock" for a one-click save-and-post (STORY-902). (e) "Type instead" for manual entry. (f) Mobile "Task" select → "Scan or enter bill".

#### STORY-098: Receptionist tries one-click "Import & Add Stock" and finishes the review manually

- **Source**: [`purchases-suppliers-compliance` STORY-902](topics/purchases-suppliers-compliance.md#story-902-receptionist-tries-one-click-import--add-stock-and-finishes-the-review-manually) · **Type**: medium · **Steps**: 7
- **Persona**: Riya Sharma, receptionist (`reception@clinic.test`), receiving a carton from Mahalaxmi Medical Agencies (GSTIN 36AAJFM2290Q1ZT) while the ph…
- **Ideal path**: 4. Open the scan task, choose the photo and received date, click Import & Add Stock, done (when all checks pass).
- **Alternate paths**: (a) "Scan bill" followed by manual confirmation (STORY-901). (b) After a manual save, "More options" → **Save & Process** runs the same automatic check on a saved draft.

#### STORY-099: The same bill is uploaded twice — exact duplicate blocked, near-duplicate is not

- **Source**: [`purchases-suppliers-compliance` STORY-903](topics/purchases-suppliers-compliance.md#story-903-the-same-bill-is-uploaded-twice--exact-duplicate-blocked-near-duplicate-is-not) · **Type**: short · **Steps**: 3
- **Persona**: Kavitha Rao (admin). Sri Venkateswara emailed the bill, and the delivery boy also handed over the same bill on paper.
- **Ideal path**: 2. Upload the file; the system says it is already saved and opens it.
- **Alternate paths**: (a) Saved bills → Search "04417" to check first. (b) Supplier → **Bills** button → register filtered by GSTIN.

#### STORY-100: Reject a badly misread bill, then try to enter it again

- **Source**: [`purchases-suppliers-compliance` STORY-904](topics/purchases-suppliers-compliance.md#story-904-reject-a-badly-misread-bill-then-try-to-enter-it-again) · **Type**: medium · **Steps**: 6
- **Persona**: Suresh Goud, pharmacist (assume admin created him; admin login works the same)
- **Ideal path**: 3. Open the draft, choose Enter complete invoice manually, fix and save. If rejecting is chosen, re-entry should still be allowed.
- **Alternate paths**: (a) "Finish this purchase" panel → **Enter complete invoice manually** (edits the same draft, so there is no reject). (b) **Reject invoice** / **Reject this upload** → prompt. (c) Saved bills → Status "OCR checks needed" → open the row.

#### STORY-101: Import a distributor's Marg ERP CSV export with line discounts

- **Source**: [`purchases-suppliers-compliance` STORY-905](topics/purchases-suppliers-compliance.md#story-905-import-a-distributors-marg-erp-csv-export-with-line-discounts) · **Type**: medium · **Steps**: 7
- **Persona**: Kavitha Rao (admin). Sri Venkateswara emails a CSV export alongside the PDF.
- **Ideal path**: 4. Open Import CSV, choose the file, open the review draft, confirm and add stock.
- **Alternate paths**: (a) Scan the PDF (STORY-901). (b) "Type instead" manual entry. (c) The Gmail intake attachment (PDF/image only, so CSV attachments are not offered).

#### STORY-102: Connect Gmail and pull this week's supplier invoice attachments

- **Source**: [`purchases-suppliers-compliance` STORY-906](topics/purchases-suppliers-compliance.md#story-906-connect-gmail-and-pull-this-weeks-supplier-invoice-attachments) · **Type**: medium · **Steps**: 9
- **Persona**: Riya Sharma, receptionist. The clinic's orders inbox (`pharmacy.linae@gmail.com`) receives bills from four distributors.
- **Ideal path**: 5. Open Gmail intake, connect, search, click Review on an attachment, confirm in the workbench.
- **Alternate paths**: (a) Download the attachment and use Scan or enter bill (STORY-901). (b) Import CSV, if the distributor also sends CSV.

#### STORY-103: Add a new Bengaluru supplier, then fix its GSTIN two different ways

- **Source**: [`purchases-suppliers-compliance` STORY-907](topics/purchases-suppliers-compliance.md#story-907-add-a-new-bengaluru-supplier-then-fix-its-gstin-two-different-ways) · **Type**: medium · **Steps**: 7
- **Persona**: Kavitha Rao (admin), onboarding Karnataka Derma Agencies for a branded sunscreen range
- **Ideal path**: 3. Open Suppliers, Add supplier, Save.
- **Alternate paths**: (a) Workbench supplier section → **Save verified supplier** (from a bill, with GSTIN format and duplicate checks). (b) Correcting a GSTIN: Suppliers list pencil "Edit supplier …" (free edit, no reason, no audit) **or** workbench "Supplier GSTIN differs" → **Correct saved GSTIN** (reason + verification + audit). Two paths with different safeguards.

#### STORY-104: Month-end supplier payables: pay, misallocate, reallocate, reverse and apply a credit

- **Source**: [`purchases-suppliers-compliance` STORY-908](topics/purchases-suppliers-compliance.md#story-908-month-end-supplier-payables-pay-misallocate-reallocate-reverse-and-apply-a-credit) · **Type**: long · **Steps**: 13
- **Persona**: Kavitha Rao (admin) settling November dues on 30-11-2026 before the CA's visit
- **Ideal path**: 5. Open the supplier account, allocate to bills (Max), enter the reference, Record Payment, apply credit.
- **Alternate paths**: (a) Today → "Overdue supplier bills" row. (b) Today → **Check overdue supplier balances** button (same target). (c) Purchases → More tasks… → Payments & dues. (d) Suppliers → **Account & dues** (pre-selects GSTIN). (e) Credits are reachable both in Payments & dues (embedded SupplierCreditPanel) and in Purchases → **Credits & vouchers**.

#### STORY-105: Receive stock on an inward challan, then post the later bill without double-counting

- **Source**: [`purchases-suppliers-compliance` STORY-909](topics/purchases-suppliers-compliance.md#story-909-receive-stock-on-an-inward-challan-then-post-the-later-bill-without-double-counting) · **Type**: medium · **Steps**: 6
- **Persona**: Riya Sharma (reception) receives a challan delivery. Kavitha posts the bill a week later.
- **Ideal path**: 5. Open the PO, choose Receive against order, set the batch/expiry, Receive stock. Later: Create linked purchase bill → Confirm & post bill.
- **Alternate paths**: (a) Purchases → More tasks… → **Inward challans** → **New document**. (b) Reorder → Purchase orders → **Receive against order** (pre-fills lines from the PO). (c) Reorder replenishment → "Receive remaining stock". (d) PO document → **Review linked receipts** → `view=INWARD_CHALLAN&sourceId=…`.

#### STORY-106: Pull October GST figures and the monthly report for the CA

- **Source**: [`purchases-suppliers-compliance` STORY-910](topics/purchases-suppliers-compliance.md#story-910-pull-october-gst-figures-and-the-monthly-report-for-the-ca) · **Type**: medium · **Steps**: 7
- **Persona**: Kavitha Rao (admin) preparing figures for the clinic's chartered accountant, who files GSTR-3B
- **Ideal path**: 4. Open GST & monthly reports, set the date range, Refresh, Export all source rows.
- **Alternate paths**: (a) Purchases → More tasks… → **GST & monthly reports** (the only nav route). (b) Orphaned `PharmacyInventoryControl` also embeds ComplianceCenter but is unreachable. (c) The Monthly Report "Top distributors" table duplicates Purchase costs → "Distributor Ranking". (d) Reports & Analytics (`/dashboard/reports`) "Inventory Report" is a separate, non-GST report.

#### STORY-107: Compare effective cost of Adapalene gel across distributors

- **Source**: [`purchases-suppliers-compliance` STORY-911](topics/purchases-suppliers-compliance.md#story-911-compare-effective-cost-of-adapalene-gel-across-distributors) · **Type**: short · **Steps**: 4
- **Persona**: Kavitha Rao (admin) deciding whom to order the next 100 tubes from
- **Ideal path**: 3. Open Purchase costs, filter by product, read the effective cost.
- **Alternate paths**: (a) Purchases → More tasks… → **Purchase costs**. (b) The Monthly Report distributor table (top 10 by net payable only).

#### STORY-108: Role boundaries on the Purchases menu (reception vs doctor)

- **Source**: [`purchases-suppliers-compliance` STORY-912](topics/purchases-suppliers-compliance.md#story-912-role-boundaries-on-the-purchases-menu-reception-vs-doctor) · **Type**: short · **Steps**: 7
- **Persona**: Riya Sharma (reception), then Dr. Shravya (`shravya@clinic.test`)
- **Ideal path**: 1 per task. A well-designed UI would hide tasks the role cannot use.
- **Alternate paths**: none found. The menu is not filtered by capability except "Approve corrections" in Stock.


### Admin: Users, Reports & Messaging

Source: [`topics/admin-users-reports-messaging.md`](topics/admin-users-reports-messaging.md) · STORY-109–STORY-120

#### STORY-109: Riya is locked out before the Saturday rush and the admin gives her a reset code

- **Source**: [`admin-users-reports-messaging` STORY-001](topics/admin-users-reports-messaging.md#story-001-riya-is-locked-out-before-the-saturday-rush-and-the-admin-gives-her-a-reset-code) · **Type**: short · **Steps**: 7
- **Persona**: Admin (front-desk lead covering IT), then the receptionist who is locked out
- **Ideal path**: 6. Admin: open Users, click Reset password on Riya's row, confirm, read out the code (3 to 4 actions). Riya: open the reset page, type the code and new password twice, submit (2 actions). No shorter path is safe because the code has to be handed over in person.
- **Alternate paths**: Login page link "enter your reset code" and the direct URL `/reset-password` reach the same reset form. The server operator script (`PasswordResetService.issueResetCodeAsOperator`) can issue a code without the UI. No self-service "forgot password" email exists, and no "change my password" screen exists for a signed-in user (`POST /users/:id/change-password` has no UI).

#### STORY-110: Onboarding Sowmya, the new nurse, and tripping over the Create User dialog

- **Source**: [`admin-users-reports-messaging` STORY-002](topics/admin-users-reports-messaging.md#story-002-onboarding-sowmya-the-new-nurse-and-tripping-over-the-create-user-dialog) · **Type**: medium · **Steps**: 7
- **Persona**: Admin onboarding new staff on a Saturday
- **Ideal path**: 4. Open Users, click New User, fill name/email/phone/role/password, click Create.
- **Alternate paths**: none found in the UI. `POST /users` is the only create path. Users cannot be invited, and there is no CSV import.

#### STORY-111: Promoting Mohammed from Pharmacist to Manager through "Role & Permissions"

- **Source**: [`admin-users-reports-messaging` STORY-003](topics/admin-users-reports-messaging.md#story-003-promoting-mohammed-from-pharmacist-to-manager-through-role--permissions) · **Type**: medium · **Steps**: 7
- **Persona**: Admin, cautious, wants to see exactly which permissions change
- **Ideal path**: 4. Open Users, open Role & Permissions on his row, pick Manager, tick any extra permissions, save once. A good UI would apply role and permissions with one Save.
- **Alternate paths**: (a) **Edit** → Role select → **Save** (`PATCH /users/:id`) changes the role but keeps his existing explicit permissions. (b) **Role & Permissions** → **Apply Role** (`PATCH /users/:id/role`) changes the role and overwrites his permissions with the role defaults. The two routes to the same goal leave different results.

#### STORY-112: Kiran resigned. Suspend his login, then try to delete Dr. Praneeta's duplicate account

- **Source**: [`admin-users-reports-messaging` STORY-004](topics/admin-users-reports-messaging.md#story-004-kiran-resigned-suspend-his-login-then-try-to-delete-dr-praneetas-duplicate-account) · **Type**: short · **Steps**: 5
- **Persona**: Admin handling a resignation on the same day
- **Ideal path**: 3. Open Users, change Kiran's status to Suspended (one control), confirm. Delete is one more click plus a confirm.
- **Alternate paths**: `PATCH /users/:id/status` exists in the backend, but no UI calls it. The Edit dialog's Status select is the only visible control, and it does nothing (see Edge Cases).

#### STORY-113: Closing the clinic for Diwali tomorrow and Sankranti in January

- **Source**: [`admin-users-reports-messaging` STORY-005](topics/admin-users-reports-messaging.md#story-005-closing-the-clinic-for-diwali-tomorrow-and-sankranti-in-january) · **Type**: medium · **Steps**: 7
- **Persona**: Admin, a little panicked because Diwali is tomorrow
- **Ideal path**: 5. Open Users, click Clinic Holidays, set From/To and reason, click Add clinic holiday, repeat for the second holiday (2 + 3 actions, the second reusing the open dialog).
- **Alternate paths**: **Create**: only Users → **Clinic Holidays** (`BranchHolidaySettings`). **Delete**: Users → Clinic Holidays (trash icon) and also Users → **Working Hours** on any doctor. That dialog runs with `canManageHolidays`, and branch holidays show in each doctor's "Leave and blocked time" list with a trash icon. A doctor's own My Settings lists the holiday read-only.

#### STORY-114: Setting Dr. Praneeta's split shifts and a conference leave

- **Source**: [`admin-users-reports-messaging` STORY-006](topics/admin-users-reports-messaging.md#story-006-setting-dr-praneetas-split-shifts-and-a-conference-leave) · **Type**: medium · **Steps**: 8
- **Persona**: Admin entering a new doctor roster. Dr. Praneeta, who later checks her own settings
- **Ideal path**: 7. Open Users, Working Hours, add Monday's two shifts, copy to Tue–Fri, add Saturday, Save hours, add the leave (date range + Add leave).
- **Alternate paths**: Dr. Praneeta can do the same from the header settings icon → **My Settings** (same `DoctorAvailabilitySettings` component, without holiday deletion). This duplicates Users → Working Hours.

#### STORY-115: Turning on WhatsApp confirmations for Dr. Shravya, from both settings screens

- **Source**: [`admin-users-reports-messaging` STORY-007](topics/admin-users-reports-messaging.md#story-007-turning-on-whatsapp-confirmations-for-dr-shravya-from-both-settings-screens) · **Type**: medium · **Steps**: 8
- **Persona**: Admin with the clinic's Meta WhatsApp Business credentials. Dr. Shravya, who wants her patients to get confirmations
- **Ideal path**: 5. Open Users, WhatsApp Settings on her row, toggle auto-confirm, enter phone ID and token, toggle template and pick it, Save.
- **Alternate paths**: Dr. Shravya's header settings icon → **My Settings** has the same "Send WhatsApp on appointment creation" and "Use WhatsApp Template" toggles, an "Approved Templates" picker, Template Name and Language Code, but **no** Phone Number ID or Access Token fields. Users → WhatsApp Settings has phone ID and token but only free-text template name/language, no picker. The two surfaces overlap but neither covers everything.

#### STORY-116: Writing Telugu and English appointment templates with the AI generator and sending a test

- **Source**: [`admin-users-reports-messaging` STORY-008](topics/admin-users-reports-messaging.md#story-008-writing-telugu-and-english-appointment-templates-with-the-ai-generator-and-sending-a-test) · **Type**: long · **Steps**: 14
- **Persona**: Admin who also runs the clinic's Instagram and patient communication, comfortable with tools
- **Ideal path**: 12. Open the template editor (3), generate English (2), save (1), switch to New and generate Telugu (3), save (1), send a test (2). Opening it should take one click from Users, not three.
- **Alternate paths**: The **WhatsApp Template Editor** is reached only from Users → a DOCTOR row → **WhatsApp Settings** → Templates **Manage**. There is no top-level entry, and a clinic without a doctor row can't open it. Doctors can't open the editor at all: their My Settings only *selects* existing templates.

#### STORY-117: Month-end revenue review: the Revenue Report says ₹0 while the pharmacy took ₹3.4 lakh

- **Source**: [`admin-users-reports-messaging` STORY-009](topics/admin-users-reports-messaging.md#story-009-month-end-revenue-review-the-revenue-report-says-0-while-the-pharmacy-took-34-lakh) · **Type**: medium · **Steps**: 8
- **Persona**: Clinic owner-partner (ADMIN login) doing the October close with the accountant on the phone
- **Ideal path**: 3. Open Reports, set the date range to October, read the Revenue Report. Generation already runs automatically on every change.
- **Alternate paths**: Pharmacy Invoices list (`/dashboard/pharmacy/invoices` "Total Amount", or Inventory → Sales → Patient invoice history) shows pharmacy totals. Dashboard/system statistics use `NewPayment`. Inventory → Purchases → GST & monthly reports (ComplianceCenter) shows GST. Four places report "money", each from a different table.

#### STORY-118: Exporting the Patient Analytics report for the auditor, in CSV, then PDF, then Excel

- **Source**: [`admin-users-reports-messaging` STORY-010](topics/admin-users-reports-messaging.md#story-010-exporting-the-patient-analytics-report-for-the-auditor-in-csv-then-pdf-then-excel) · **Type**: short · **Steps**: 5
- **Persona**: Admin preparing a file for the clinic's CA
- **Ideal path**: 2. Open the Export select, pick CSV, and the file downloads (repeat once for PDF).
- **Alternate paths**: none found. Patients → **Export CSV** exports the patient list, not the analytics. Pharmacy and compliance have their own exports ("Export all source rows").

#### STORY-119: Lakshmi, the new MANAGER, finds most of the Users page is for show

- **Source**: [`admin-users-reports-messaging` STORY-011](topics/admin-users-reports-messaging.md#story-011-lakshmi-the-new-manager-finds-most-of-the-users-page-is-for-show) · **Type**: medium · **Steps**: 8
- **Persona**: Lakshmi Narayana, clinic operations manager (MANAGER role), first week
- **Ideal path**: 6. Reports (2) plus Users edit (3) plus Clinic Holidays (1), if MANAGER were allowed to manage users.
- **Alternate paths**: none. MANAGER has no other route to user management. Reports is fully available to her.

#### STORY-120: Quarterly access audit: who can do what, and the doctor who made himself Owner

- **Source**: [`admin-users-reports-messaging` STORY-012](topics/admin-users-reports-messaging.md#story-012-quarterly-access-audit-who-can-do-what-and-the-doctor-who-made-himself-owner) · **Type**: long · **Steps**: 11
- **Persona**: Clinic owner/admin doing a quarterly access review after an NABH mock audit flagged "excess privileges"
- **Ideal path**: 10. Users list review (1), open each suspicious user's role (n×2), fix roles (n), confirm sessions are ended (1). A real audit UI would add an audit-log view, which doesn't exist (the `audit-logs` API is unused).
- **Alternate paths**: none in the UI for audit history. Role changes go through Edit (Role select) or Role & Permissions (Apply Role), and the two give different permission results (see STORY-003).

## Redundancy Candidates

This section is built from every story's **Alternate paths** field, the multi-surface notes inside the stories, and the topic files' own redundancy sections. It is the main input to `/ux-flow`. Each item is tagged **same** when the routes give the same result, or **divergent** when they behave differently. Divergent items are the priority, because a user who takes the "wrong" route gets a different outcome. Story numbers are catalog IDs.

### Duplicate paths (same goal, multiple routes)

**Clinical front office**

- **RC-P01 Open or start a visit (≥10 routes): divergent.** Calendar tile START/CONT; "Appointment Details" → "Start Visit"; Slots-tab start (pre-creates a server visit with the placeholder complaint "General consultation"); Patients row "Start Visit"; patient detail "Start new visit" / "Resume last visit"; PatientProgressTracker "Start Visit" / "Continue" / "Prescribe"; Dashboard "Recent Visits"; History tab "Resume session"; Visits → "Start New Visit" → "Start Visit Documentation"; doctor notification bell (`?appointmentId=` only, so it lands on an empty setup screen). `autoStart` deep links also assign the visit to the first doctor in a one-item list instead of the signed-in doctor. Stories: 037, 038, 039, 040, 021, 022, 036, 049.
- **RC-P02 Reopen the last visit from the patient detail page (4 buttons on one page): mostly same.** Header "Resume last visit", tracker "Continue", tracker "Prescribe"/"View" and the History card "Resume session". The first three open the same `?visitId=<latest>` URL. Stories: 021, 022.
- **RC-P03 Book an appointment (5 routes): divergent.** Calendar tab; Slots tab (same grid and dialog, but drops the procedure name); Patients "New Patient" as Walk-in (auto-books the next free 30 minutes with no slot choice, and swallows errors); patient detail "Book appointment" and tracker "Book" (`?patientId=` prefill, which cannot complete: "Patient information is missing"); and in-scheduler "Add New Patient". Dashboard "Today's Appointments" and global-search appointment results open `/dashboard/appointments` with no context. Stories: 025, 026, 027, 028, 015, 022, 036.
- **RC-P04 Create a patient (3 dialogs): divergent.** "Create Patient" (full fields, Walk-in option) vs PatientQuickCreateDialog in the scheduler (no address, emergency contact, referral, primary doctor or walk-in flag) vs the walk-in variant. Stories: 014, 015, 026.
- **RC-P05 Find a patient (5 search boxes): divergent.** Header global search (the patient result dead-ends on an empty list via `?search=<id>`); Patients list search; Appointments "Search patient by name/phone"; Visits "Search name, phone, or email"; Dashboard "My Patients" (doctors only). Stories: 007, 013, 021, 038, 002.
- **RC-P06 Reschedule / cancel an appointment: a single working route each, plus dead ones.** RESCHED is the only reschedule entry; the Slots tab's own reschedule handlers are unwired and "Appointment Details" has no reschedule button. Cancel works only via INFO → "Appointment Details" → "Cancel Appointment"; long-press, the Quick Guide's "double-click" and the inline X are all dead. Stories: 029, 030.
- **RC-P07 Doctor availability (2 entry points, same component): divergent.** Header "My Settings" (doctor) vs Users → "Working Hours" (admin). Only the admin dialog can delete clinic holidays. Stories: 032, 114, 033.
- **RC-P08 Delete a clinic holiday (2 routes): divergent and dangerous.** Users → "Clinic Holidays" trash icon vs the trash icon on the holiday row inside any doctor's "Working Hours" dialog. The second has no confirm, and it deletes the holiday for every doctor. Creation exists only in Clinic Holidays. Stories: 033, 113.
- **RC-P09 Room availability (2 views): divergent.** Rooms → Calendar View (hard-coded 09:00–18:00) vs the room cards in the "Book Appointment" dialog. The Appointments Room filter shows one doctor's bookings, not occupancy. Stories: 034, 027.
- **RC-P10 Activate / deactivate a room (2 controls): same.** Row Switch vs "Room is active" in the Edit dialog. A deactivated room then vanishes, so neither control can bring it back. Story: 035.
- **RC-P11 Record a procedure (2 places): divergent.** The Procedures page "Save Procedure" (always fails) vs the visit form Prescription → "Procedures" section and visit-level procType/fluence/spotSize/passes. Procedure History reads the visit-level fields, so sessions saved from the page would not show their parameters. Story: 047.
- **RC-P12 Order lab investigations (2 lists): divergent.** The Lab Tests tab vs the Prescription tab's ClinicInvestigations list. They are separate data. Stories: 043, 051.
- **RC-P13 Enter vitals (2 forms): same, kept in sync.** The Vitals tab vs Prescription → "Clinical Details & Vitals". Story: 037.
- **RC-P14 Dictation (2 places): divergent.** Prescription-tab mics (Chief Complaints, Detailed Examination) vs `/test-transcribe`, a bench that isn't wired to a visit. The SOAP-field mics are built but never rendered. Stories: 042, 048.

**Prescriptions**

- **RC-P15 Hand off a prescription to pharmacy (4 routes): divergent.** Footer "Go to Pharmacy" (no confirm, passes `visitId`, does not save, so an unsaved Rx gives an empty bill) vs post-create dialog "Yes, go to Pharmacy" (passes `prescriptionId`, no `visitId`) vs tracker "Bill" (`visitId`) vs reception picking it up in the Billing queue ("Load") or Counter "Rx queue". Stories: 049, 056, 063, 070.
- **RC-P16 Reprint a prescription (2 routes): divergent.** Visits → Patient History → "View Prescription" → "Prescription Details" → "Print" (prints the whole dashboard) vs resume the visit → Prescription tab → "Print Preview" → "Print" (re-saves the visit first). The patient detail History and form History tabs show "n Rx Items" with no print. Stories: 059, 060.
- **RC-P17 Re-issue last regimen (5 mechanisms): overlapping.** "Reuse last meds", "Treatment suggestions" → "Reapply learned plan" / "Fill missing only", pick a saved template, "Recent meds:" chips. Story: 057.
- **RC-P18 Create a prescription template (3 dialogs): divergent.** "Save current" → "Save as Template", "Save fields" → "Save Fields as Template" (says "on this device" but saves a public server template), "New template" → "Create New Template" (its own drug search and chips). Story: 055.
- **RC-P19 Set print layout (format ×2, margins ×3, letterhead ×2): divergent.** Print format: footer "Print" select (Table/Text) and preview "Print Format". Margins: preview sliders, Customization tab px fields, "Printer profile" (always empty). Letterhead: header My Settings upload vs Customization "Print Background Image URL" + "Save Doctor Default" (a custom URL overrides the upload). Stories: 051, 052.
- **RC-P20 Share a prescription (3 routes, 1 unused): divergent.** "Email" (server, false success when SMTP is unset), "PDF via WhatsApp" (downloads the PDF and opens wa.me without +91), "Download PDF" then attach by hand. The server `POST /prescriptions/:id/share` (pdfkit, Cloud API) has no UI. The Patients-row "WhatsApp" sends only an appointment reminder. Stories: 053, 054, 019.

**Pharmacy**

- **RC-P21 Sell medicines (≥8 entry points, 2 back-ends): divergent.** Sidebar "Pharmacy Billing", `/dashboard/billing` redirect, Desk quick action "Pharmacy Billing", Counter "Walk-in bill" (only when the queue is empty), Counter header "Bill" with nothing selected, Active Dispense "Start billing", the "Go to Pharmacy" handoffs, tracker "Bill". All of these open PharmacyInvoiceBuilderFixed. Inventory → Sales → "Counter sales" is a separate COUNTER_SALE workflow whose sales never appear in Pharmacy Invoices or Patient invoice history. Stories: 063, 065, 092, 070, 056.
- **RC-P22 Open the bill from the Counter (4 buttons): same.** Header "Bill", Active Dispense "Open bill", "Collect payment" (does not collect), Prescription Queue row "Bill". Story: 063.
- **RC-P23 Prescription queue (3 lists + 1 dead button): divergent.** Cockpit Queue column (first 8 only, filters All/Queue/Review/Exceptions/Done), the "Prescription Queue" table below it (20 per page, paged), the same table on Billing ("Load" instead of "Bill"). The cockpit "Rx queue" header button does nothing. Review, pause and notes exist only in the cockpit. Stories: 061, 062, 072.
- **RC-P24 Link an Rx line to inventory (3 spots + 1 lookalike): divergent.** "Link item" in the Prescription Queue Stock column (Counter and Billing) and in the builder's "Linked Prescription" box. "Substitute" looks similar but replaces the product for this bill only and remembers nothing. Story: 064.
- **RC-P25 Invoice list (2 routes + 1 misroute): same component.** Desk "Invoices" → `/dashboard/pharmacy/invoices` vs Inventory → Sales → "Patient invoice history". The bell's "N pending payments" goes to the billing builder, not the list. Stories: 067, 068, 071, 087.
- **RC-P26 Record payment (1 real route, 2 that look like it): divergent.** Only Invoices list "Mark as Paid" records payment. Checkout stores the method but leaves status PENDING, and Counter "Collect payment" only opens the builder. Stories: 063, 068.
- **RC-P27 Reprint an invoice (2 routes, 2 formats): divergent.** Invoice list View/Download (simple layout: no HSN, batch, GSTIN or copy type) vs builder "Reopen confirmed invoice" (only the last checkout in this tab; it has the "Duplicate" copy type). Story: 067.
- **RC-P28 Was this patient billed? (3 routes): divergent.** Tracker "Bill"/"Invoices" (reads the orphaned clinic `/billing/invoices`, so it always says "Bill"), Pharmacy Invoices search, Inventory → Sales → Patient invoice history. Story: 071.
- **RC-P29 Create a drug (3 routes, 3 validations): divergent.** Drug Management "Add New Drug" (writes `""` into unique barcode/sku), PrescriptionBuilder add-drug dialog (loses the new id), AI `create_drug` proposal. Stories: 075, 058, 082.
- **RC-P30 Change a drug's price or details (3 routes, 2 approval rules): divergent.** Drug Management edit (PHARMACIST price change needs approval), Inventory Stock → "Edit price" (doctor/admin approval track), AI `update_drug` (skips the approval check). Stories: 076, 086, 082.
- **RC-P31 Reach Drug Management (1 button + URL): gap.** Desk "Drugs" button or the typed URL. There's no sidebar entry, and DOCTOR and OWNER have no Desk link either. Stories: 077, 074.
- **RC-P32 Partner daily sync (2 entries): same.** Desk "Partner Daily Sync" card vs Counter "Daily close", which just switches to the Desk. Story: 080.
- **RC-P33 Archive an AI thread (2 controls): same.** Dock header "Archive" vs the per-thread archive icon in the "Active" rail. Story: 083.

**Inventory & purchases**

- **RC-P34 Check low stock (≥6 routes, 3 definitions): divergent.** Today "Low stock" row, Today "Check low stock" button, Stock list "Stock level" → "Low stock", bell "N low-stock items" (dead `?tab=low-stock`, lands on Today), Desk "Stock … low" tile, Dashboard "Low Stock Alert" (counts only `currentStock <= 0`), AI `low_stock`, Reorder → Shortbook. Stories: 085, 073, 082, 008.
- **RC-P35 Check expiring stock (4 routes): divergent.** Today "Expiring in the next 3 months" row, the "Check next 3 months' expiry" button, Stock list "Expiry" → "Within 3 months", bell `?tab=expiry` (dead). Stories: 085, 008.
- **RC-P36 Reach the price/stock approval queue (4 routes): same.** Today "Price/stock edits awaiting approval (n)", Stock → "Approve corrections", `/dashboard/inventory-updates` redirect, the submitter's "Open approval queue" link. Story: 086.
- **RC-P37 Edit stock (2 buttons): same.** Stock list row "Edit" vs batch detail "Edit stock". Story: 086.
- **RC-P38 Correct a stock quantity (2 approval tracks): divergent.** "Edit stock" (DrugInventoryChangeRequest, approved by OWNER/ADMIN/DOCTOR) vs a stock count (workflow document, approved by OWNER/ADMIN/MANAGER). DOCTOR can approve the first but not the second. Stories: 086, 090.
- **RC-P39 Start a stock count (≥6 routes): mostly same.** Counts & audit "Start stock count" (whole branch, no filter), batch "Count this batch", Stock list "Count selected batches", Automation "Daily stock count", "Open Counts & audit" links in the purchase workbench, the Compliance Center and the workflow editor outcome panel. Story: 090.
- **RC-P40 Hold / loss / supplier return (2 routes each): divergent.** Batch detail buttons (prefill the line) vs register "New document" (search the batch by hand). The Today row "Supplier returns in progress" reopens unfinished returns. Story: 091.
- **RC-P41 Put opening stock in (3 routes): divergent.** "Add batch" + "Manual opening stock" (Add Inventory Item has no quantity field, so it takes two flows), "Opening stock import" from Excel (no preview in this layout), Purchases inward/commit. Stories: 088, 089.
- **RC-P42 Create a purchase order (4 routes): overlapping.** Shortbook → PO, Purchase orders → "Add purchase order", Shortbook "Add manual request", Automation "Automatic PO drafts". Target proposals → "Sync accepted targets to Shortbook" feeds the same list. Stories: 094, 095.
- **RC-P43 Receive stock against a PO (4 routes): overlapping.** PO detail "Receive remaining stock", Purchases → Inward challans → New document (choose PO), Purchase orders → "Receive against order" (prefilled), PO → "Review linked receipts". Stories: 094, 105.
- **RC-P44 Cancel the rest of a part-received PO (2 controls, 1 dead label): divergent.** ReplenishmentCenter "Cancel remaining units" works. WorkflowDocumentEditor's "Cancel remaining order" label can never show. Story: 094.
- **RC-P45 Change min/max/reorder targets (4 routes, 2 permission rules): divergent.** Target proposals, Automation run, Monitor "Review proposal", Manual targets & exclusions (manager-only) vs batch "Edit product details" (any `inventory:item:update`, which bypasses the manager rule). `/dashboard/stock-predictions` redirects to Manual targets. Story: 095.
- **RC-P46 Bring in a supplier bill (≥8 routes): divergent.** Today "Scan or enter bill", Purchases task button, Today "Original files awaiting intake", "Import & Add Stock" (one-click post), "Type instead" (manual), "Save & Process" on a saved draft, Import CSV (fails on line discounts), Gmail intake (PDF/image only), and the mobile "Task" select. Stories: 097, 098, 101, 102.
- **RC-P47 Fix a misread bill (2 routes, 1 trap): divergent.** "Enter complete invoice manually" (edits the same draft) vs "Reject invoice" (permanently blocks re-entry under the real number). Story: 100.
- **RC-P48 Check whether a bill is already saved (3 routes): same.** Upload (SHA-256 match), Saved bills search, Supplier → "Bills" (filtered by GSTIN). Near-duplicate numbers pass all three. Story: 099.
- **RC-P49 Create or correct a supplier (2 routes, different safeguards): divergent.** Suppliers → "Add supplier" / pencil edit (free GSTIN edit, no reason, no audit) vs workbench "Save verified supplier" / "Correct saved GSTIN" (format check, duplicate check, reason, audit). Story: 103.
- **RC-P50 Pay a supplier (4 routes): same, except one edge.** Today "Overdue supplier bills" row, Today "Check overdue supplier balances", Purchases → Payments & dues, Suppliers → "Account & dues" (errors for a supplier with no posted bills). Story: 104.
- **RC-P51 Apply a supplier credit (2 places): same.** The SupplierCreditPanel embedded in Payments & dues vs Purchases → "Credits & vouchers". Story: 104.
- **RC-P52 Distributor ranking (2 places): divergent.** Purchase costs → "Distributor Ranking" vs Monthly Report "Top distributors" (top 10 by net payable only). Stories: 106, 107.

**Admin, help & shell**

- **RC-P53 Change a user's role (2 routes): divergent.** Edit → Role select → Save (keeps explicit permissions) vs Role & Permissions → "Apply Role" (overwrites them with role defaults, then shows a false "Failed to update role"). Stories: 111, 120.
- **RC-P54 WhatsApp settings (2 surfaces, neither complete): divergent.** Header My Settings (toggles, "Approved Templates" picker, template name/language; no phone ID or token) vs Users → "WhatsApp Settings" (phone ID and token; free-text template only, no picker). Story: 115.
- **RC-P55 Open the WhatsApp Template Editor (1 deep route): gap.** Reached only via Users → a DOCTOR row → "WhatsApp Settings" → Templates "Manage". There's no top-level entry, and doctors can't open it. Story: 116.
- **RC-P56 Reset-code entry (2 routes): same.** The login link "enter your reset code" vs the direct `/reset-password` URL. Issuance is only Users → "Reset password" (or the operator script). Stories: 003, 109.
- **RC-P57 Help (3 systems, ~12 surfaces): divergent and stale.** 8 QuickGuide dialogs plus the Appointments "Quick Guide", the Receptionist intro.js tour (one page per click), the Doctor "Visit Workflow Tour" (19 floating steps that anchor to nothing), and the visit "Shortcuts" dialog. The Visits page has two different guides with the same title, "Visit Documentation Guide". Several guides describe UI that doesn't exist. Stories: 010, 012, 038.
- **RC-P58 Export data (3 unrelated exports): divergent.** Patients "Export CSV" (patient roster), Reports export (aggregates, always fails), Compliance "Export all source rows". Stories: 020, 118, 106.
- **RC-P59 Branded mode (2 switches): same.** `/login` and the header write the same localStorage key. Story: 009.
- **RC-P60 Reach a patient record after login (4 routes): mostly same.** The `?next` deep link, global search (broken), sidebar Patients → search → View, Dashboard "My Patients" (doctor). Story: 002.

### Duplicate information (same fact, multiple surfaces)

- **RC-I01 Appointment details: 7 surfaces.** Day grid, Dashboard "Today's Appointments", patient detail "Next appointment" (always "Not scheduled"), tracker "Upcoming appt" (misses later-today appointments after 05:30 IST), Room Calendar tooltip, header notifications, global search results. The two patient-page surfaces contradict each other. Stories: 025, 021, 022.
- **RC-I02 Patient demographics: 4 surfaces on one page, plus the list.** List row, detail header badges (ID / Code / ABHA / gender / age), summary card, Info tab. The search dropdown shows name and phone again. Stories: 013, 021, 007.
- **RC-I03 Patient and doctor names on the Visits page: 3 times.** Page sub-heading, the Ready-to-start line and the Patient Context card. Story: 038.
- **RC-I04 Visit progress: 4 times.** Header card "Progress: x%", the header progress bar, Overview → "Overall Progress", footer "Progress: x% • n of 5 sections complete". Story: 037.
- **RC-I05 Patient visit history: 4 surfaces.** Visits setup "Patient History" tab, form History tab, Patient Context "Recent Visits", patient detail History tab. Stories: 037, 021, 059.
- **RC-I06 Appointment link badged twice.** "From Appointment" on the page and "Linked to Appointment" on the form card. Story: 037.
- **RC-I07 Current role: 3 times.** Setup "Your Role & Permissions" card (which misstates access for MANAGER/ADMIN), header "Role: DOCTOR", Overview "Captured By". Stories: 037, 039.
- **RC-I08 Visit photos: 3 surfaces + 2 counts that disagree.** Photos tab, "Other saved photos" (same tab), patient detail "Uploads". Overview "Photos Captured" is hard-coded to 0 while the header badge shows the real count. Stories: 041, 040.
- **RC-I09 Prescription content: ~8 surfaces.** Builder medicine table, Print Preview, downloaded/emailed PDF, Visits "Prescription Details" dialog, form History cards, patient detail History, Pharmacy Billing prefill / "Prescription directions", Counter "Rx queue". Stories: 049, 056, 059.
- **RC-I10 System alerts (`/reports/alerts`): 3 surfaces.** Dashboard "System Alerts" (with a fake "All systems operational"), the header bell (polls every 60 s), the Reports page strip. Stories: 008, 011, 117.
- **RC-I11 Low-stock count: 5 surfaces, 3 definitions.** Desk "Stock … low" (inventory batches), Dashboard "Low Stock Alert" (stock ≤ 0, labelled "below reorder level"), Today "Low stock", AI `low_stock`, Reorder. Stories: 073, 082, 085.
- **RC-I12 Drug count: 2 surfaces, 2 labels.** Desk "Stock" tile = Drug Management "Total Drugs", which becomes the filtered count once a filter is set. Stories: 073, 077.
- **RC-I13 Package data: 3 surfaces, 3 filters.** Desk "Packages" tile (all active, including others' private ones), Desk browser (Dermatology only, own or public), Billing "Treatment Packages" tab (all own or public). Stories: 079, 078, 084.
- **RC-I14 Sales and revenue: 4–5 surfaces, 4 tables.** Desk "Sales" (includes unpaid, draft and cancelled invoices), Invoices list stat cards (current page only, labelled totals), Invoices header (server total), Reports Revenue (legacy `Payment`, ₹0), dashboard statistics (`NewPayment`), Compliance monthly report. Stories: 073, 068, 117, 106.
- **RC-I15 User counts: 2 surfaces, different numbers.** Dashboard "Total Users" = "Active Users" (both `isActive` count) vs the Users table (includes inactive users). Stories: 011, 110.
- **RC-I16 Role labels: 2 spellings.** The Users table shows the raw enum (`RECEPTION`); the dialog says "Receptionist". Story: 110.
- **RC-I17 Counter stock figure: 4 places on one screen.** Review row "Qty", Pick Assist "Pick N · M available", "Scan next" stock, Prescription Queue Stock column. Story: 062.
- **RC-I18 Invoice grand total: 5 places on one screen.** Invoice Summary card, footer under "Print Preview", preview header badge, "Invoice Controls", printed invoice. Story: 063.
- **RC-I19 Supplier payables: 6 places, 2 definitions of "due soon".** Today, the 4 ledger cards, Distributor Summary, Aging, Alerts, Bulk Payment table. "Due Soon" (card) excludes bills due today; Distributor Summary includes them. Story: 104.
- **RC-I20 A saved purchase bill: 5 places.** Workbench "Recent invoices", Saved bills, Today count, Supplier "Bills", GST source rows. Story: 097.
- **RC-I21 Batch quantities: 3 places.** Stock list "Show cost & stock details", batch detail, CSV export. Story: 090.
- **RC-I22 Approval count twice in one row.** Today shows "1" in the count column and "(1)" in the label. Story: 085.
- **RC-I23 Procedure name: 3 places.** Day-grid tile, Room Calendar block, room tooltip "Notes:". It is dropped entirely when booked from Slots. Story: 027.
- **RC-I24 Booking success: 2 messages.** Slots tab shows both a toast and a green banner. Story: 025.
- **RC-I25 Duplicate page headings: 5 pages.** Patients ("Patients Management" + "Patients"), Pharmacy Invoices (h2 + PageHeader), Pharmacy Counter (PageHeader + cockpit h3), Pharmacy Billing (PageHeader + WorkbenchHeader), Drug Management ("Drug Management" + "Drug Database"). Stories: 013, 067, 061, 063, 075.
- **RC-I26 The same invoice in 2 print formats.** List print vs builder preview. Story: 067.
- **RC-I27 Patient name + phone: 3 places.** Search dropdown, list row, detail header. Story: 007.
- **RC-I28 Holiday rows: 3 places with different powers.** Users → Clinic Holidays (create/delete), each doctor's admin "Working Hours" list (delete for all), doctor's own My Settings (read-only). Stories: 113, 033.

### Overlapping features/tools

- **RC-F01 Calendar tab vs Slots tab.** The same `DoctorDayCalendar` grid and the same booking dialog under two headers. Slots drops the procedure name and has dead reschedule/start handlers, and switching tabs resets the doctor. **Merge into one tab** with a duration control. Stories: 025, 027, 036.
- **RC-F02 Pharmacy Billing builder vs Counter cockpit vs Inventory "Counter sales".** Three selling surfaces on two back-ends (PharmacyInvoice vs COUNTER_SALE workflow). Counter sales never reach the invoice list or revenue. **Consolidate** to one sale model; keep the cockpit for review and dispensing only. Stories: 063, 065, 092.
- **RC-F03 Pharmacy Desk metrics vs Dashboard System Alerts vs Inventory Today vs the bell.** Four "what needs attention" surfaces with different definitions and links (the bell's are dead). **Pick one source of truth** (Today has the correct deep links). Stories: 073, 011, 085, 008.
- **RC-F04 Procedures page vs visit-form procedure section.** Two procedure recorders with different data shapes. The page cannot save at all. **Keep one.** Story: 047.
- **RC-F05 Lab Tests tab vs Prescription investigations.** Two investigation lists for the same visit. Stories: 043, 051.
- **RC-F06 Two stock-correction approval tracks (+ an AI bypass + a metadata bypass).** DrugInventoryChangeRequest (doctor/admin) vs workflow documents (manager), with AI `update_drug`/`adjust_stock` and the batch-details PATCH skipping both. **Unify the approval rules** and route every writer through them. Stories: 086, 090, 082, 095.
- **RC-F07 Money reporting in four places.** Reports & Analytics (legacy table), Pharmacy Invoices totals, Desk Sales, Compliance monthly report / Purchase costs. They do not reconcile. Stories: 117, 068, 073, 106, 107.
- **RC-F08 Header "My Settings" vs Users-page per-doctor dialogs.** Availability and WhatsApp each have two partial editors. **Make one settings surface per doctor** that admins open on the doctor's behalf. Stories: 032, 114, 115.
- **RC-F09 Users "Edit" role vs "Role & Permissions".** Two role editors with different permission side-effects (and the second can't load its data). **Merge.** Stories: 111, 120.
- **RC-F10 QuickGuides vs intro.js tours vs Shortcuts.** Three help systems that contradict each other and the UI. Stories: 010, 012.
- **RC-F11 Drug Management (drug master) vs Inventory stock list (inventory items).** Overlapping catalogs: the Desk "Stock" tile counts drugs, not stock, and price edits live in both. Stories: 073, 076, 086.
- **RC-F12 Pharmacy AI assistant vs direct screens.** The AI creates drugs, updates prices, adjusts stock and reads low stock and invoices. Every one duplicates a screen action, without that screen's validation or approval, and with blind "Apply". Stories: 082, 075, 076.
- **RC-F13 Prescription share via the browser vs via the server.** Frontend email/wa.me flows are used; the backend `sharePrescription` (pdfkit + WhatsApp Cloud API) is unused. **Keep one.** Stories: 053, 054.
- **RC-F14 Patient "WhatsApp" reminder vs appointment-creation confirmation vs template "Send Test".** Three WhatsApp senders sharing the same silent-failure path, none reachable from the Appointments page. Stories: 019, 115, 116.
- **RC-F15 `/test-transcribe` vs in-form dictation.** A diagnostic bench in the production Admin nav. Stories: 048, 042.
- **RC-F16 Visits page history vs patient detail page.** Two "patient chart" hubs (history, photos, Rx) with different actions (print only on Visits, edit only on the list row). Stories: 021, 059, 041.
- **RC-F17 Orphaned parallel implementations.** BillingManagement (clinic billing) vs pharmacy billing (the tracker still reads clinic billing); PharmacyInvoiceBuilder vs …Fixed ("Edit Invoice" still targets the old one); PharmacyInventoryControl / ShelfIntelligence vs the Inventory workspace (dead `?tab=` links still point there); StockPredictionDashboard vs Reorder targets; PharmacyPackageManager (edit/delete) vs PharmacyPackageCreator (create only). **Delete the orphans** and fix the links. Stories: 071, 067, 084, 095, 078.
- **RC-F18 Partner Daily Sync vs inventory corrections.** Partner batch mismatches can be fixed only in the partner card; stock corrections cannot fix partner lines. Story: 081.

### Dead or broken alternate routes (look like a path, aren't)

These matter to /ux-flow because they inflate the apparent number of routes:
- Bell inventory links `?tab=low-stock` / `?tab=expiry`, Desk "Inventory Control" and Counter "Shelf locations" / "Inventory control" (`?tab=pharmacy-control`) all land on Inventory → Today (008, 073, 084, 096).
- Global search patient result (`?search=<id>`), staff result (`users?search=`), and appointment result (bare `/dashboard/appointments`) (007, 013).
- Doctor bell `visits?appointmentId=` without `patientId` (008, 036).
- Patient detail / tracker "Book appointment" (`?patientId=` cannot complete) (028).
- Counter "Rx queue" header button (no-op) and "Pull visits" (re-reads only) (072).
- Long-press, "double-click" and the inline X on appointment tiles (030).
- Invoices "Edit Invoice" and "Delete" (never succeeds for builder invoices) (068).
- Procedures "View Details" and "Load & Edit" (047).
- Prescription "Printer profile" select (always empty) (051).

## Gaps & Recommendations

**Features not covered by any story**
- **Inventory → Stock → Corrections** ("Post linked correction", "Resolve product identity", the held-stock view). These are the main tools for duplicate-product cleanup; STORY-064 hit "multiple product links. Review duplicate products first" with no path to fix it. *Suggested story:* Admin resolves a product that is linked to two drug records, then posts a linked correction, and confirms Billing matching works afterwards.
- **Purchases → recover legacy invoice** (reopening a pre-workbench purchase invoice). *Suggested story:* Admin recovers a legacy bill, reviews it and commits stock without double-counting.
- **Saved bills "Retry invoices"** and the other register error/retry states ("Retry records", "Retry suppliers", "Retry queue", "Retry product check"). *Suggested story:* a network failure on each register, then retry.

**Partially covered (edge case or variation only)**
- Appointment schedule loading / failure / "Refreshing schedule…" states (STORY-036 edge cases only). The per-appointment N+1 fetch that causes the long refresh deserves a performance-focused story.
- The visit "Keyboard Shortcuts" dialog (STORY-038); the listed keys work only on the setup screen.
- ClinicInvestigations saved lists (create / rename / delete a saved investigation set) and print-event logging for Print / PDF.
- Pharmacy Invoices row "Confirm" and the Payment Method / Date Range filters beyond UPI-Pending (STORY-068).

**Personas and environments under-represented**
- **OWNER** is never the main persona. It has a distinct sidebar (no Pharmacy links) and is the target of the privilege-escalation defect. *Suggested story:* the owner's morning (dashboard, reports, approve an inventory workflow document, find the pharmacy without a sidebar link).
- **ACCOUNTANT** appears only as a sidebar check. *Suggested story:* the accountant tries to record a supplier payment and pull GST reports. The backend allows it, but no nav route exists.
- **LAB_TECH / PATIENT** appear only as sidebar checks. A story should confirm what a portal-linked PATIENT token can reach through the API (patients, reports, prescriptions share), because several endpoints are unguarded.
- **Mobile** is covered only by STORY-006 and STORY-096. No story walks the visit form, Counter, Billing or the booking grid at phone width, and the mobile shell hides the whole header (search, bell, My Settings).
- **Keyboard-only and screen-reader use** is not walked anywhere (the AI dock icon buttons have no accessible names; the booking grid relies on hover-only buttons).
- **Multi-branch**: every story assumes one branch, and Branch has no UI.
- **Concurrency**: covered for visit autosave (STORY-045) and booking 409s, but not for two pharmacists checking out the same Rx, or two tabs with a pending checkout (sessionStorage is per tab).

**Backend capabilities with no UI (cannot be walked; product decisions needed)**
- Clinic billing (`/billing/*`, Service, Invoice, NewPayment). The tracker's "Bill" step still reads it.
- Audit-log viewer (the `audit-logs` API is unused). STORY-120 needs it for an access review.
- User status change (`PATCH /users/:id/status`) and change-my-password (`POST /users/:id/change-password`).
- Prescription refills, template version approval, printer-profile creation, translation-memory editing.
- Package edit/delete (PharmacyPackageManager orphaned), partner-sale CSV upload, appointment bulk-update, Branch CRUD, the 1mg product lookup, the StockPrediction dashboard, the backup job-status poll (`GET /auth/backup/:jobId`).

**Recommendations for the next steps**
1. **Before /ux-walker:** run STORY-110 first to create NURSE, PHARMACIST, MANAGER and ACCOUNTANT users. Note that a PHARMACIST or MANAGER provisioned with the seeded RBAC gets 403s because wildcard permissions never match (see `defects.md`). Walk those personas both with the seeded role and with explicit permissions.
2. **For /ux-flow:** start with the divergent duplicate paths RC-P01, P03, P15, P21, P26, P30, P38, P45, P47, P49 and P53, and the overlapping tools RC-F01, F02, F06 and F07. These are where the extra routes cause wrong outcomes, not just extra clicks.
3. **Fix the critical and high defects in `defects.md` before walking**, especially the ones that make whole stories impossible: STORY-028 (Book from chart), 047 (Save Procedure), 018 (Link Portal), 111 (Role & Permissions), 112 (Suspend), 116 (templates), 118 (exports), and 038 (the Visits setup lists only one patient and one doctor). Otherwise the walk will mostly re-confirm known breakage.
4. **Add the five suggested stories above** (Stock Corrections, legacy invoice recovery, register retries, OWNER morning, ACCOUNTANT payables). Add a phone-width pass over the visit form and Counter.
