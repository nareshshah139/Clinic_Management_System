# Topic: purchases-suppliers-compliance

Story agent output for the ux-paths Phase 2 swarm. Scope: the **Purchases** area of `/dashboard/inventory` (`InventoryWorkspace`, `?area=purchases&view=…`). That covers the supplier bill workbench (`PurchaseInvoiceWorkbench`: OCR scan, manual entry, supplier review, product matching, review, stock commit, reject, reopen and recovery), Saved bills (`PurchaseRegister`), Import CSV and Gmail intake (`AlternateInvoiceIntake`), Suppliers (`SupplierWorkspace`), Payments & dues (`PurchaseLedger` + `SupplierCreditPanel` + `SupplierPaymentRecovery`), Credits & vouchers, Inward challans and Gate passes (`WorkflowRegister` / `WorkflowDocumentEditor`), GST & monthly reports (`ComplianceCenter reportsOnly`) and Purchase costs (`DistributorAnalytics`). Backend: `pharmacy/purchase-invoices`, `pharmacy/purchase-ledger`, `pharmacy/compliance`, `inventory/workspace/*`, `inventory/suppliers`.

Story numbers use the 9xx block (topic 9 in discovery).

**Personas and access, verified in code:**
- `admin@clinic.test` (ADMIN) passes every role and permission check (`roles.guard.ts:29`, `permissions.guard.ts:47`, `inventory-workflow.service.ts:74`). Most end-to-end stories use this login, which plays "Kavitha Rao", the admin who also runs pharmacy purchasing.
- `reception@clinic.test` (RECEPTION, "Riya Sharma") holds `inventory:po:create/read/update`, `inventory:transaction:create` and `inventory:supplier:*` (each listed separately). Her purchase capabilities are therefore read/create/review/commit/automate, plus adding and saving suppliers. She has **no** `pharmacy:purchase-ledger:*` and is not in the compliance controller's roles. She sees "Payments & dues", "Credits & vouchers" and "GST & monthly reports" in the menu, but they are blocked.
- `shravya@clinic.test` / `praneeta@clinic.test` (DOCTOR) can do everything, including recording supplier payments, through the global DOCTOR bypass.
- The seed has **no PHARMACIST**. Pharmacist variations assume admin created "Suresh Goud" (`suresh.pharma@clinic.test`). With the seeded RBAC role he gets **no** ledger, compliance or supplier-create access (see Defects).

**Navigation facts:** The Inventory header reads "Inventory" / "Receive, review and manage pharmacy stock." with a "Refresh inventory" icon. The area buttons are Today / Purchases / Stock / Sales / Reorder. On desktop, only the first three Purchases tasks are buttons ("Scan or enter bill", "Saved bills", "Import CSV"). The other eight are in a "More tasks…" select: Gmail intake, Suppliers, Payments & dues, Credits & vouchers, Inward challans, Gate passes, GST & monthly reports, Purchase costs. On a phone, all tasks are in a single "Task" select.

**Data conventions:** The clinic is in Hyderabad (Telangana, GSTIN state code 36). The intra-state distributor is "Sri Venkateswara Pharma Distributors, Koti" (GSTIN `36ABCFS4821K1Z3`, DL `TS/HYD/2023-114587`). The inter-state distributor is "Karnataka Derma Agencies, Bengaluru" (GSTIN `29AAGCM7310P1ZK`). The reference bill is `SVPD/25-26/04417`, dated 03-11-2026, a credit bill due 03-12-2026, with these lines:

| # | Product (seed catalogue where noted) | Qty + free | PTR | Disc | Taxable | GST | Line total |
|---|---|---|---|---|---|---|---|
| 1 | Adapalene 0.1% Gel 15g (seeded) · batch ADG2611 · exp 08/2028 | 20 + 2 | ₹150.00 | 10% | ₹2,700.00 | 5% (2.5+2.5) ₹135.00 | ₹2,835.00 |
| 2 | Clindamycin 1% Gel 20g (seeded) · batch CLG5520 · exp 03/2028 | 12 + 0 | ₹180.00 | 0 | ₹2,160.00 | 5% ₹108.00 | ₹2,268.00 |
| 3 | Sunscreen Gel SPF 50 50g (new product) · batch SPF0926 · exp 09/2028 | 10 + 0 | ₹320.00 | 0 | ₹3,200.00 | 18% (9+9) ₹576.00 | ₹3,776.00 |

Bill totals: taxable ₹8,060.00, GST ₹819.00, net payable **₹8,879.00**.

---

## STORY-901: Scan a three-line distributor bill, match products and add stock (OCR end to end)

**Type**: long
**Topic**: purchases-suppliers-compliance
**Persona**: Kavitha Rao, clinic admin who runs pharmacy purchasing (`admin@clinic.test`). The Sri Venkateswara delivery boy is waiting for a signed copy.
**Goal**: Turn the 2-page PDF of bill `SVPD/25-26/04417` into posted stock and a payable, without re-typing it
**Preconditions**: Logged in as ADMIN. The Codex OCR backend is configured. The seed catalogue has Adapalene 0.1% Gel 15g and Clindamycin 1% Gel 20g. No supplier record exists for GSTIN 36ABCFS4821K1Z3. The PDF `SVPD-04417.pdf` (2 pages) is on the desktop. Goods arrived today, 07-11-2026.
**Ideal path**: 6. Open the scan task, choose the file and received date, scan, confirm the supplier, confirm the one new product, add stock. The supplier and matches should be pre-filled when exact.
**Alternate paths**: (a) Today → "Scan or enter bill" button (top of "What needs attention"). (b) Purchases → "Scan or enter bill" task button. (c) Today → "Original files awaiting intake" row, which lands on the same intake view. (d) "Automatic import" → "Import & Add Stock" for a one-click save-and-post (STORY-902). (e) "Type instead" for manual entry. (f) Mobile "Task" select → "Scan or enter bill".

### Steps
1. Sidebar **Inventory** → lands on **Today** ("What needs attention", "As of … · current branch"). Kavitha notes "Original files awaiting intake 0" and "Purchase invoices to review 0".
2. Click **Scan or enter bill** → URL `?area=purchases&view=intake`. The heading "Scan or enter bill" reads "Upload every page. Check the reading. Add stock when ready." The "Scan a bill" panel is open with the cue "Scan only · stock stays unchanged".
3. In **Upload invoice PDF or image**, choose `SVPD-04417.pdf` → the hint reads "PDF or photos · Up to 10 files · One invoice, in page order". **Scan bill** stays disabled.
4. She realises **Received on** is empty. She sets it to 07-11-2026 → **Scan bill** enables.
5. Click **Scan bill** → the button reads "Reading bill…". After about 30–90 s (two OCR reads plus a source-location pass), "Original file saved" appears with a download link, plus "SVPD-04417.pdf extracted from 2 pages." Any header flags show as red badges (e.g. "independent read disagrees invoiceDate").
6. The **Distributor Bill** card fills: Distributor "Sri Venkateswara Pharma Distributors", GSTIN 36ABCFS4821K1Z3, DL No. TS/HYD/2023-114587, Invoice No. SVPD/25-26/04417, Invoice Date 03-11-2026, Goods Received 07-11-2026, Bill Type "Credit", Due Date 03-12-2026, "Doctor / Reg. No. (optional)" blank.
7. **Supplier** section ("Match the supplier by name and GSTIN, or save verified details here.") → no saved supplier matches. Kavitha compares the name and GSTIN against the paper and ticks "I checked the supplier name and GSTIN against the original invoice." → **Save verified supplier** ("Saving supplier…") → the saved supplier is selected.
8. **Product matching and catalogue details** → line 1 shows a proposed match "Adapalene 0.1% Gel 15g". Kavitha checks the invoice product against the saved product, which has the same pack, and clicks **Confirm this match**. She does the same for line 2.
9. Line 3 "Sunscreen Gel SPF 50 50g" reports "No exact active product matches this name and pack…". She first tries **Search saved products manually** with "sunscreen" → "No saved products found." So she creates the product from the invoice: **Product kind** "Cosmetic / skin care", and **Prescription required** left at "Choose after checking the product" → set to No.
10. **Products on this bill**: she checks line 1's free quantity (2) and discount (10%). She opens **Apply GST or discount to selected rows**, selects lines 1–2, Change "GST", GST mode "CGST + SGST", rate 5. The preview lists "Adapalene…: CGST 2.5% → 2.5%" and so on, all unchanged. She clicks **Clear selection**.
11. **Check bill total** → calculated net ₹8,879.00 matches the printed net payable. She opens "Reported discounts, TCS & rounding": everything is 0.
12. Click **Save draft** → the status line changes from "Not saved · stock not added" to "Stock not added". The invoice now shows in **Recent invoices (1)** ("Latest branch purchase invoices").
13. Click the **Review checks** link → the checklist shows no remaining stops. The guidance reads "Confirm values against the original. Adds the received quantities to stock."
14. Click **Confirm reviewed values & add stock** → the invoice is saved, reviewed and committed in one transaction. The status reads "Stock added". The summary shows Bill total ₹8,879.00 / Calculated total ₹8,879.00 / Difference ₹0.00, plus "Committed Items" for 3 lines (Adapalene 22 units = 20 paid + 2 free).
15. In "Purchase documents & history" she checks "Retained originals" (the PDF) and "Logs".
16. Navigate **Purchases → Saved bills** → "Purchase register" lists "1 invoices": SVPD/25-26/04417, the supplier with its GSTIN, 03 Nov 2026, status Stock committed, ₹8,879.00, and the original file link.
17. **Stock → Stock list** → search "Adapalene" → a new batch ADG2611 with 22 units.
18. **Purchases → More tasks… → Payments & dues** → "Purchase Ledger": Outstanding ₹8,879.00. Distributor Summary row "Sri Venkateswara Pharma Distributors · Pending 1".
19. Back on **Today** → "Purchase invoices to review 0" and "Original files awaiting intake 0".

### Variations
- **Photos instead of PDF**: she picks two phone photos (page 1, page 2) in order. They are assembled into one PDF server-side via `ocr/pages/extract`. If either photo is already linked to a saved invoice, the scan fails with "A selected original is already linked to an invoice. Open that invoice from the register."
- **Inter-state supplier** (Karnataka Derma Agencies, 29…): she should apply GST mode "IGST" to all rows. If OCR read only a single "GST %" column, the draft arrives split as CGST+SGST (see Defects).
- **Pharmacist "Suresh Goud"**: same flow, but "Save verified supplier" is hidden because seeded `inventory:supplier:*` is never expanded. He must ask admin to add the supplier first.
- **Reception "Riya"**: the full flow works, including Add stock (she holds commit via `inventory:transaction:create`).

### Edge Cases
- The OCR service is down or times out: the original is still archived ("Originals stay saved even when extraction fails"). It appears under "Saved uploads (n)" → "Uploads awaiting invoice details" and on Today as "Original files awaiting intake 1".
- A batch is already expired (expiry 10/2026): the review adds "Line n: batch is already expired" and stock commit is refused.
- The line taxable differs from qty × PTR × (1 − disc%) by more than ₹1 → "Line n: quantity, rate and discounts do not reconcile with the taxable amount." The reconciliation tolerance is exactly ₹1 on both ends (`PurchaseReviewSummary.tsx:8`, service `tolerance = 1`).
- Credit bill with no due date → "Due date is required for credit purchase bills before review".
- A browser refresh mid-review restores the local draft. "Saved invoice changed" plus **Compare with saved version** appears if another tab saved first.
- The same information appears on several surfaces: the saved bill appears in the workbench "Recent invoices", Saved bills register, the Today count, the Supplier "Bills" button and the GST source records. The new payable appears on Today, in the Ledger cards and Distributor Summary, in Aging and in Bulk Payment Allocation.

---

## STORY-902: Receptionist tries one-click "Import & Add Stock" and finishes the review manually

**Type**: medium
**Topic**: purchases-suppliers-compliance
**Persona**: Riya Sharma, receptionist (`reception@clinic.test`), receiving a carton from Mahalaxmi Medical Agencies (GSTIN 36AAJFM2290Q1ZT) while the pharmacist is away
**Goal**: Get a 1-page photo bill into stock with the least effort
**Preconditions**: Logged in as RECEPTION. OCR is configured. Supplier Mahalaxmi is saved. All products exist in the catalogue. The bill photo is `IMG_20261107_1012.jpg`.
**Ideal path**: 4. Open the scan task, choose the photo and received date, click Import & Add Stock, done (when all checks pass).
**Alternate paths**: (a) "Scan bill" followed by manual confirmation (STORY-901). (b) After a manual save, "More options" → **Save & Process** runs the same automatic check on a saved draft.

### Steps
1. **Inventory → Purchases → Scan or enter bill** → the "Scan a bill" panel opens.
2. Choose the photo and set **Received on** to today.
3. Expand **Automatic import** ("Adds stock if every automatic check passes.") → click **Import & Add Stock**.
4. The result reads "SAVED_FOR_REVIEW": the invoice is saved but stock is not added. The notice reads "Invoice … saved. Automatic intake needs a human review; check the original, confirm the review below, then choose Confirm reviewed values & add stock." The issues listed include "Line 2: OCR confidence must be at least 98% for automatic stock intake; review this line manually."
5. Riya clicks the highlighted field on line 2. **Original invoice** preview (PurchaseSourcePreview) zooms to the batch box. She corrects batch "KT0B12" to "KTOB12" (the OCR read a zero for the letter O).
6. Click **Confirm reviewed values & add stock** → status "Stock added".
7. Open **Saved bills** with Source "OCR" → the bill is listed with status Stock committed.

### Variations
- All lines ≥ 98% confidence and every check passes → step 4 ends directly with stock added, so the ideal path is met.
- A product is not in the catalogue → the issue "…No exact active product matches…" appears. Reception can confirm a match, but "Correct invoice name" or editing catalogue details needs `pharmacy:drug:update`, which she lacks (`editProduct` false).

### Edge Cases
- Browser closes during import → on reopen, "Recover interrupted import" / "Recover import outcome" with **Check saved status** and **Copy recovery handoff**. The import attempt id is kept in the URL (`attempt`, `actor`, `sources`).
- Network drops after the server committed → "Stock status unknown" plus **Refresh stock status**. All edits stay locked until it is resolved.

---

## STORY-903: The same bill is uploaded twice — exact duplicate blocked, near-duplicate is not

**Type**: short
**Topic**: purchases-suppliers-compliance
**Persona**: Kavitha Rao (admin). Sri Venkateswara emailed the bill, and the delivery boy also handed over the same bill on paper.
**Goal**: Make sure SVPD/25-26/04417 is not posted twice
**Preconditions**: STORY-901 completed (bill posted).
**Ideal path**: 2. Upload the file; the system says it is already saved and opens it.
**Alternate paths**: (a) Saved bills → Search "04417" to check first. (b) Supplier → **Bills** button → register filtered by GSTIN.

### Steps
1. **Scan or enter bill** → choose the identical `SVPD-04417.pdf` (same bytes) → **Scan bill**. The original is matched by SHA-256 (`@@unique([branchId, sha256])`). Because it is already linked, the import returns DUPLICATE.
2. The notice reads "Invoice SVPD/25-26/04417 is already saved. Opened the existing invoice; its values and stock were not changed." → the posted invoice opens.
3. Next she photographs the paper copy (different bytes) → Scan bill → the OCR draft fills. **Save draft** → 409 "An invoice with this supplier GSTIN and invoice number is already saved. Open the existing invoice to continue." Then **Open existing invoice** → compare.

### Variations
- She retypes the bill by hand (**Type instead**) and enters the invoice number as `SVPD-25-26-04417` or `svpd/25-26/04417`. **The draft saves as a new invoice and can be posted, so stock and the payable are doubled** (see Defects: duplicate identity is case- and punctuation-sensitive).
- Through CSV: an identical CSV file returns `duplicateInvoiceId` and opens the saved bill. An Excel re-save (different bytes) falls through to the GSTIN+number check.

### Edge Cases
- RECEPTION without read access would see "An authorized colleague must locate the existing invoice. Your attempted entry is kept here." plus **Copy handoff details** (Reception does have read, so this is a pharmacist-with-custom-permissions case).

---

## STORY-904: Reject a badly misread bill, then try to enter it again

**Type**: medium
**Topic**: purchases-suppliers-compliance
**Persona**: Suresh Goud, pharmacist (assume admin created him; admin login works the same)
**Goal**: Discard an OCR draft whose quantities are wrong throughout, then enter Karnataka Derma Agencies bill `KDA/2611/0093` manually
**Preconditions**: The draft for KDA/2611/0093 (GSTIN 29AAGCM7310P1ZK) was scanned and saved with status "OCR checks needed".
**Ideal path**: 3. Open the draft, choose Enter complete invoice manually, fix and save. If rejecting is chosen, re-entry should still be allowed.
**Alternate paths**: (a) "Finish this purchase" panel → **Enter complete invoice manually** (edits the same draft, so there is no reject). (b) **Reject invoice** / **Reject this upload** → prompt. (c) Saved bills → Status "OCR checks needed" → open the row.

### Steps
1. **Saved bills** → Status "OCR checks needed" → click `KDA/2611/0093` → the workbench opens with the invoice and **Review issues**.
2. The "Finish this purchase" panel lists the checks. Suresh decides the scan is unusable and clicks **Reject invoice**.
3. Browser prompt "Why is this invoice being rejected? Its original and history will be retained." → he types "Photo blurred, all quantities misread" → status Cancelled ("This invoice is cancelled and cannot add stock.").
4. **Scan or enter bill** → **Type instead** → he enters the same supplier, GSTIN and invoice number with corrected lines → **Save draft**.
5. The save fails with 409 "An invoice with this supplier GSTIN and invoice number is already saved. Open the existing invoice to continue." → **Open existing invoice** opens the *cancelled* bill. It cannot be edited (updateDraft accepts only Draft / OCR / Reconciliation statuses), and "Reopen review" only applies to Reviewed bills.
6. Dead end: the bill cannot be entered under its real number (see Defects). He has to go back to the panel's **Enter complete invoice manually**, which no longer applies to a cancelled bill.

### Variations
- Correct path: at step 2 choose **Enter complete invoice manually** instead of rejecting. The same draft becomes editable, and the original stays linked.
- After review (status Reviewed, stock not added): "Reason to reopen review" + **Reopen review and fix products** returns the bill to editable.

### Edge Cases
- Rejecting a posted bill → "Posted stock cannot be rejected. Use a linked correction or physical reconciliation." The workbench offers "Correct this posted purchase" → **Start linked return** / **Record linked supplier credit** (PurchaseDocumentActions).
- Two tabs: rejecting from a stale tab → "Invoice changed or is already cancelled. Reload its saved status."

---

## STORY-905: Import a distributor's Marg ERP CSV export with line discounts

**Type**: medium
**Topic**: purchases-suppliers-compliance
**Persona**: Kavitha Rao (admin). Sri Venkateswara emails a CSV export alongside the PDF.
**Goal**: Load bill `SVPD/25-26/04588` (14 lines, 10% trade discount on 9 lines) from CSV instead of OCR
**Preconditions**: The supplier is saved. The CSV was built from **Download purchase CSV template** with one row per item and the header repeated on each row.
**Ideal path**: 4. Open Import CSV, choose the file, open the review draft, confirm and add stock.
**Alternate paths**: (a) Scan the PDF (STORY-901). (b) "Type instead" manual entry. (c) The Gmail intake attachment (PDF/image only, so CSV attachments are not offered).

### Steps
1. **Purchases → Import CSV** → "Import purchase CSV" / "Review imported lines before adding stock."
2. She clicks the download icon ("Download purchase CSV template") and checks the column list: there is no `tcsAmount` and there are no header discount columns. She opens "CSV format and required columns" to read the rules.
3. Choose `SVPD-04588.csv` in **Purchase invoice CSV** → **Open review draft** ("Reading CSV…").
4. The workbench opens with 14 lines and source CSV. The printed gross is Σ(qty × PTR) = ₹41,250.00. The calculated gross is taxable + header discounts = ₹38,940.00.
5. **Confirm reviewed values & add stock** → validation reads "Printed Gross differs from the calculated amount. Correct the printed value or line entries against the original." Confirmation is blocked.
6. Kavitha has no idea which "printed gross" is meant, since a CSV has no printed bill. She opens "Reported discounts, TCS & rounding" and enters trade discount ₹2,310.00 to force the totals to agree.
7. Confirm again → stock is added.

### Variations
- CSV without line discounts → step 5 passes on the first try.
- A row whose `invoiceNumber` differs from row 1 → issue "Row 7: invoiceNumber identifies a different invoice" (shown as a header OCR flag).
- A bill with TCS (₹41 on a large annual purchase): the CSV netPayable includes TCS, but the draft has no `tcsAmount` → "Header net payable mismatch".

### Edge Cases
- File is .xlsx renamed .csv or contains NUL bytes → "Choose a UTF-8 CSV invoice".
- More than 1,000 rows → "CSV must contain 1–1,000 invoice lines".
- A negative or blank quantity → "Row n: quantityPurchased is missing" / "must be nonnegative".
- See Defects: the CSV parser computes gross pre-discount and sets no header discount, so every discounted CSV fails reconciliation.

---

## STORY-906: Connect Gmail and pull this week's supplier invoice attachments

**Type**: medium
**Topic**: purchases-suppliers-compliance
**Persona**: Riya Sharma, receptionist. The clinic's orders inbox (`pharmacy.linae@gmail.com`) receives bills from four distributors.
**Goal**: Open review drafts for the PDF bills emailed by orders@svpharma.in in the last 7 days
**Preconditions**: The server has `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` and a 32-byte `INVENTORY_TOKEN_KEY`. Riya knows the inbox password. Each Gmail connection is per user and per branch.
**Ideal path**: 5. Open Gmail intake, connect, search, click Review on an attachment, confirm in the workbench.
**Alternate paths**: (a) Download the attachment and use Scan or enter bill (STORY-901). (b) Import CSV, if the distributor also sends CSV.

### Steps
1. **Purchases → More tasks… → Gmail intake** → "Invoice attachments from Gmail" / "Choose an invoice attachment to open a review draft." → "Checking Gmail connection…".
2. Not connected → **Connect Gmail** → redirect to Google consent (gmail.readonly, offline) → back to `?area=purchases&view=gmail&code=…&state=…`. The code is exchanged and stripped from the URL.
3. The status line reads "Connected: pharmacy.linae@gmail.com", "Last attachment search: Not searched yet · current account and search query".
4. Replace the default query `newer_than:30d` with `from:orders@svpharma.in newer_than:7d` → **Find invoice attachments** ("Loading…").
5. The list shows "Invoice SVPD/25-26/04602" from "SV Pharma <orders@svpharma.in>" dated 06 Nov, with button **Review SVPD-04602.pdf**.
6. Click it → OCR runs → the workbench opens the draft with source GMAIL and the original saved.
7. She confirms and adds stock as in STORY-901. **Saved bills** → Source "GMAIL" filters to it.
8. Back in Gmail intake → **Load more messages** (when more than 20 messages matched) → older results are appended.
9. At shift end → **Disconnect Gmail** → the status returns to the Connect button.

### Variations
- Server not configured → "Gmail is not configured. Ask your administrator to connect it. Photo/PDF and CSV intake are available." plus "Administrator setup" details listing the four env vars.
- Search with no hits → "No invoice attachments match this search."
- Status check fails → **Retry connection check**.

### Edge Cases
- Consent completed after 10 minutes → "Gmail connection expired. Start Connect Gmail again."
- Google returns no refresh token (account was previously authorised) → "Google did not return offline access. Reconnect and approve access."
- Attachment over 25 MB or not PDF/image → "Choose a PDF or photo attachment under 25 MB". Gmail can also issue a new attachment id each time the message is fetched, which would produce the same error (suspected; see Defects).
- Riya's connection does not carry over to Kavitha: each user must connect separately (`branchId_userId` key).

---

## STORY-907: Add a new Bengaluru supplier, then fix its GSTIN two different ways

**Type**: medium
**Topic**: purchases-suppliers-compliance
**Persona**: Kavitha Rao (admin), onboarding Karnataka Derma Agencies for a branded sunscreen range
**Goal**: Create the supplier record, see its bills and account, and correct a GSTIN typo
**Preconditions**: No supplier with GSTIN 29AAGCM7310P1ZK exists. No bills from them have been posted yet.
**Ideal path**: 3. Open Suppliers, Add supplier, Save.
**Alternate paths**: (a) Workbench supplier section → **Save verified supplier** (from a bill, with GSTIN format and duplicate checks). (b) Correcting a GSTIN: Suppliers list pencil "Edit supplier …" (free edit, no reason, no audit) **or** workbench "Supplier GSTIN differs" → **Correct saved GSTIN** (reason + verification + audit). Two paths with different safeguards.

### Steps
1. **Purchases → More tasks… → Suppliers** → "Suppliers" list, or "No suppliers yet. Add a supplier to start recording purchases."
2. **Add supplier** → form: Supplier name "Karnataka Derma Agencies", GSTIN typed by mistake as `29AAGCM7130P1ZK`, Drug licence "KA-B-21B/2024-55120", Contact person "Manjunath H", Phone 9845011223, Email accounts@kdagencies.in, Payment terms "45 days", "Active supplier" checked → **Save supplier**.
3. The list row reads "Karnataka Derma Agencies · 29AAGCM7130P1ZK · 9845011223 · Active", with **Bills**, **Account & dues** and the pencil icon.
4. She clicks **Account & dues** → jumps to Payments & dues with `gstin=29AAGCM7130P1ZK` → "Ledger error: Distributor ledger not found", because the supplier has no posted bills (see Defects).
5. Later the first bill is scanned. The supplier section shows "Supplier GSTIN differs" — On this invoice: 29AAGCM7310P1ZK; Saved supplier: 29AAGCM7130P1ZK.
6. **Correct saved GSTIN** → "Reason for correction" "Typo at onboarding: digits 7130/7310 swapped". She ticks the verification against the original → **Update saved GSTIN** ("Updating saved GSTIN…") → the supplier is updated with an audit entry `GSTIN_CORRECTED`. Past invoices are left unchanged.
7. Compare: had she used the Suppliers page pencil instead, she could change the GSTIN to anything (even an invalid 14-character value or another supplier's GSTIN) with no reason and no audit trail.

### Variations
- Supplier page **Bills** → Saved bills filtered by Supplier GSTIN.
- Deactivate: untick "Active supplier" → the supplier drops out of the invoice "Saved supplier" choices and the workflow Supplier select (`isActive` filter).
- Pharmacist Suresh: no **Add supplier** button and no pencil (seeded wildcards not expanded). The empty state reads "Ask an administrator to add a supplier."

### Edge Cases
- Workbench correction to a GSTIN another supplier uses → "Another supplier already uses this GSTIN. Select the correct supplier or resolve the duplicate before correcting it."
- Stale correction (someone edited meanwhile) → "The saved supplier changed. Reload the supplier list and verify the correction again." → **Reload saved suppliers**.
- Saving a supplier from the workbench with a name or GSTIN that already exists → "A supplier with this name or GSTIN already exists. Select the matching active supplier here…".

---

## STORY-908: Month-end supplier payables: pay, misallocate, reallocate, reverse and apply a credit

**Type**: long
**Topic**: purchases-suppliers-compliance
**Persona**: Kavitha Rao (admin) settling November dues on 30-11-2026 before the CA's visit
**Goal**: Pay Sri Venkateswara ₹20,000 by NEFT across two overdue bills, fix a wrong allocation, and use a ₹1,180 expiry-return credit
**Preconditions**: Three posted Sri Venkateswara bills: 04417 (₹8,879.00, due 03-12), 03980 (₹12,450.00, due 20-11, overdue), 03712 (₹6,300.00, due 05-11, overdue). A posted Supplier return `SR-2611-004` of ₹1,180.00 exists for the same GSTIN (STORY-909 variation).
**Ideal path**: 5. Open the supplier account, allocate to bills (Max), enter the reference, Record Payment, apply credit.
**Alternate paths**: (a) Today → "Overdue supplier bills" row. (b) Today → **Check overdue supplier balances** button (same target). (c) Purchases → More tasks… → Payments & dues. (d) Suppliers → **Account & dues** (pre-selects GSTIN). (e) Credits are reachable both in Payments & dues (embedded SupplierCreditPanel) and in Purchases → **Credits & vouchers**.

### Steps
1. **Inventory → Today** → row "2 Overdue supplier bills" (tooltip "Outstanding ₹18,750.00. Open the supplier account to review and allocate payment.") → click.
2. "Purchase Ledger" cards: Outstanding ₹27,629.00, Overdue ₹18,750.00, Due Soon 0 (a count, not an amount), TCS Watch 0.
3. **Distributor Summary** row "Sri Venkateswara Pharma Distributors · Pending 3 · Partial 0 · Paid 0", Invoices 3, Outstanding ₹27,629.00. Click the row → the ledger loads.
4. Side cards: **Aging** (0-30 ₹27,629.00 / 3 invoices, which also includes the not-yet-due 04417) and **Alerts** (Due in 7 days 1, Due today 0, Overdue 2, TCS approaching 0).
5. Scroll to **Supplier credits & vouchers** (embedded) → "SR-2611-004 · 36ABCFS4821K1Z3 · Available ₹1,180.00 of ₹1,180.00" → **Allocate to bill** → **Select a bill** "03712" → amount 1180 → **Allocate credit** → "Credit allocated. The posted bill balance has been updated."
6. **Bulk Payment Allocation**: Distributor pre-selected, Payment Date 30-11-2026, Mode NEFT, Reference No "UTR SBIN526334109871", Notes "Nov settlement".
7. Click **Max** on 03712 → Allocated ₹5,120.00 / Payment amount ₹5,120.00 (auto-fills). Click **Max** on 03980 → ₹17,570.00 total. She meant to pay only ₹20,000, so she overwrites 03980 with 14,880 and sets Amount 20000 → "Allocated total ₹20,000.00 / Payment amount ₹20,000.00".
8. **Record Payment** → "Saved: Payment recorded and allocated." 03712 becomes Paid and 03980 Partial. Outstanding is ₹6,449.00.
9. She notices the CA wanted 04417 cleared first. **Recorded payments** → the NEFT payment → **Reallocate payment** → per-invoice inputs ("03712 · up to ₹…") → she reallocates ₹5,120 to 03712, ₹8,879 to 04417 and ₹6,001 to 03980 → "Allocated ₹20,000.00 of ₹20,000.00" → "Reason for correction" "CA priority: clear Nov invoice first" → confirm. The original is marked "Reversed · CA priority…" and a "Replacement payment" row appears.
10. The supplier then says the UTR bounced. Kavitha clicks **Reverse payment** on the replacement → reason "NEFT returned by bank 01-12" → balances are restored.
11. The running ledger now shows INVOICE / CREDIT_ALLOCATION / PAYMENT / PAYMENT_REVERSAL events with running balances.
12. **Credits & vouchers** (Purchases menu) → the same SR-2611-004 shows "Available ₹0.00 of ₹1,180.00" with its allocation row and **View bill** / **Reverse allocation**.
13. **Reverse allocation** → browser prompt "Reason for reversing this credit allocation" → "Applied to wrong bill" → credit available again.

### Variations
- Pay by UPI or CHEQUE: mode list is CASH, CHEQUE, NEFT, UPI, CARD.
- Record a post-dated cheque dated 15-12-2026. It is saved, but it does not appear in Recorded payments or reduce Outstanding until that date. Meanwhile **Max** still offers the full balance and **Record Payment** fails with "Allocation exceeds outstanding balance for invoice …" (see Defects).
- Dr. Shravya (DOCTOR) can do all of the above (global bypass), although the ledger controller lists only ADMIN/PHARMACIST/ACCOUNTANT for writes.
- **Record credit note** (from the credits panel) → opens a CREDIT_NOTE document → Supplier, lines, amount → **Post supplier credit** → a new credit appears.

### Edge Cases
- Allocated total ≠ amount (by more than ₹0.01) → **Record Payment** stays disabled. There is no inline message.
- Double-click / retry: the same request key is reused for an unchanged form, so no duplicate payment is created. Changed details with the same key → "This payment request key was used for different details. Reload the recorded payment."
- Reallocating from a stale screen → "This payment has changed. Reload before correcting it."
- Credit and bill from different GSTINs → "Select a posted bill for the same supplier GSTIN".
- The same information appears on several surfaces: the outstanding amount is shown on Today, the 4 ledger cards, Distributor Summary, Aging, Alerts and the Bulk Payment table. Supplier credits show in both the ledger and Credits & vouchers. Due Soon (card, from alerts) excludes due-today bills, while Distributor Summary "dueSoon" includes them.

---

## STORY-909: Receive stock on an inward challan, then post the later bill without double-counting

**Type**: medium
**Topic**: purchases-suppliers-compliance
**Persona**: Riya Sharma (reception) receives a challan delivery. Kavitha posts the bill a week later.
**Goal**: Get stock on the shelf the same day, and later link the bill so stock is not added twice
**Preconditions**: An approved purchase order `PO-2611-012` to Sri Venkateswara for 30 × Tretinoin 0.05% Cream 20g exists (Reorder → Purchase orders). Delivery challan DC-7781 arrives on 08-11-2026 without a tax invoice.
**Ideal path**: 5. Open the PO, choose Receive against order, set the batch/expiry, Receive stock. Later: Create linked purchase bill → Confirm & post bill.
**Alternate paths**: (a) Purchases → More tasks… → **Inward challans** → **New document**. (b) Reorder → Purchase orders → **Receive against order** (pre-fills lines from the PO). (c) Reorder replenishment → "Receive remaining stock". (d) PO document → **Review linked receipts** → `view=INWARD_CHALLAN&sourceId=…`.

### Steps
1. **Reorder → Purchase orders** → row PO-2611-012 (Approved) → **Receive against order** → opens a new Inward challan with the reason "Purchase order receipt" and the PO lines.
2. "Inward challans" help: "Receive physical stock before the supplier bill. Link the later bill to this receipt to avoid receiving twice." Supplier is pre-selected. Purchase order: PO-2611-012.
3. Riya fills the batch TRC2604, expiry 04/2028, quantity 30 → **Save draft** ("Draft • no stock change") → **Receive stock** → status Posted; stock +30.
4. A week later Kavitha opens **Inward challans** → status filter Posted → opens the challan → **Create linked purchase bill**.
5. The workbench opens with "Current receipt" shown. The status line reads "Stock received earlier · 0 added again". She scans bill SVPD/25-26/04650.
6. The button reads **Confirm & post bill**, and the guidance reads "Posts bill; no stock added again." → posted. The ledger gains ₹… payable, and stock stays at +30.

### Variations
- **Gate pass**: Purchases → **Gate passes** → **New document** → Supplier, link to "No order linked" or to the PO, delivery reference "LR 55821 / VRL Logistics" → **Record gate pass** (no stock or payable effect).
- Wrong receipt linked: **Remove incorrect receipt link** → confirm "Remove the receipt link only if these goods have not already been added to inventory. Posting this bill will add stock. Continue?"
- Supplier return of expiring stock: Stock → Supplier returns → **Create return challan** → posting the return creates a supplier credit (used in STORY-908).

### Edge Cases
- A second bill linked to the same receipt → "This inward receipt is already linked to a purchase invoice. Open that bill to check it; stock must not be received again." (unique `branchId+workflowReceiptId`).
- No saved supplier with a GSTIN → posting fails with "Select a saved supplier with a verified GSTIN".
- Document date in the future → "Document date cannot be in the future".

---

## STORY-910: Pull October GST figures and the monthly report for the CA

**Type**: medium
**Topic**: purchases-suppliers-compliance
**Persona**: Kavitha Rao (admin) preparing figures for the clinic's chartered accountant, who files GSTR-3B
**Goal**: Get October 2026 input GST, output GST, slab-wise breakup and source rows as CSV
**Preconditions**: October has posted purchase bills (including one inter-state Karnataka Derma bill with IGST 18%), counter sales, and one posted credit note from Karnataka Derma.
**Ideal path**: 4. Open GST & monthly reports, set the date range, Refresh, Export all source rows.
**Alternate paths**: (a) Purchases → More tasks… → **GST & monthly reports** (the only nav route). (b) Orphaned `PharmacyInventoryControl` also embeds ComplianceCenter but is unreachable. (c) The Monthly Report "Top distributors" table duplicates Purchase costs → "Distributor Ranking". (d) Reports & Analytics (`/dashboard/reports`) "Inventory Report" is a separate, non-GST report.

### Steps
1. **Purchases → More tasks… → GST & monthly reports** → the page heading reads "Pharmacy Compliance" (not the menu label), with "Posted GST and monthly reports for the current branch".
2. **GST Summary** card loads with the default range. Kavitha sets Start date 01-10-2026, End date 31-10-2026 → the values do not reload until she clicks **Refresh**.
3. Cards: Input GST ₹…, Output GST ₹…, Net payable ₹… (amber when ≥ 0).
4. **Purchase Slabs** / **Sales Slabs** tables by 5 / 18%: she checks that the IGST column carries the Karnataka bill.
5. **GST source records**: "Posted records only; drafts excluded. … · current branch · 46 records". Each row links to the bill, sale or workflow document.
6. **Export all source rows** → `GST source records.csv` (one row per line with scope columns; formula-leading cells are escaped).
7. **Monthly Report** → Month `2026-10` → **Refresh** → Procurement, Sales, Gross profit, Stock at cost, Write-off, Stock at MRP, Margin. The note reads "Stock valuation is the current snapshot. Historical cost is unknown for n movements / adjustments…". It also shows the distributor table and **Monthly source records** with its own export.

### Variations
- RECEPTION opens the same view → all three report calls return 403 → the banner reads "… Use the report Refresh button to retry." Every metric shows "Unavailable" (STORY-912).
- Pharmacist Suresh with the seeded role → 403 as well (no `pharmacy:compliance:read`).

### Edge Cases
- Start after end → "Invalid date range".
- A month with no posted data → "No posted records in this date range."
- The CA spots that, in the purchase slab table, CGST + SGST + IGST does not equal "Total GST" by a few paise per line. The Karnataka credit note also appears as CGST/SGST rather than IGST. "Stock at cost" is higher than the purchase ledger implies. See Defects for all three.

---

## STORY-911: Compare effective cost of Adapalene gel across distributors

**Type**: short
**Topic**: purchases-suppliers-compliance
**Persona**: Kavitha Rao (admin) deciding whom to order the next 100 tubes from
**Goal**: See which distributor gives the lowest effective cost (after free goods) and whether any discount dropped
**Preconditions**: At least two posted bills for Adapalene 0.1% Gel 15g from different distributors.
**Ideal path**: 3. Open Purchase costs, filter by product, read the effective cost.
**Alternate paths**: (a) Purchases → More tasks… → **Purchase costs**. (b) The Monthly Report distributor table (top 10 by net payable only).

### Steps
1. **Purchases → More tasks… → Purchase costs** → heading "Distributor Analytics" with "Reviewed purchase invoices only. Drafts with OCR or reconciliation issues are excluded."
2. Type "Adapalene" in **Product** → nothing happens until **Refresh** (filters are not auto-applied; "Reset" restores the defaults).
3. **Product Effective Cost** → rows per distributor: Latest Rate, Discount, Free Qty, Effective Cost. Sri Venkateswara shows ₹122.73 effective (2,700 ÷ 22) against a PTR of ₹150.
4. **Discount Drop Alerts** with Drop % 5 → "Mahalaxmi: Previous 12% → Latest 6%".

### Variations
- Filter by HSN `3004` or by GSTIN.
- RECEPTION can open Purchase costs (the analytics endpoint allows RECEPTION with `inventory:po:read`), even though she cannot see dues.

### Edge Cases
- No data → "No reviewed purchase data found" / "No product analytics available" / "No discount-drop alerts".
- The copy says "Reviewed", but bills that are Reviewed and not yet posted are excluded. Only Stock committed bills count (`includedStatuses: ['STOCK_COMMITTED']`).

---

## STORY-912: Role boundaries on the Purchases menu (reception vs doctor)

**Type**: short
**Topic**: purchases-suppliers-compliance
**Persona**: Riya Sharma (reception), then Dr. Shravya (`shravya@clinic.test`)
**Goal**: Check what each role can actually do from the same eleven Purchases tasks
**Preconditions**: Posted bills exist (STORY-901).
**Ideal path**: 1 per task. A well-designed UI would hide tasks the role cannot use.
**Alternate paths**: none found. The menu is not filtered by capability except "Approve corrections" in Stock.

### Steps
1. Log in as Riya → **Inventory → Purchases** → all 11 tasks are listed.
2. **Payments & dues** → plain text "Supplier payments require purchase-ledger permission."
3. **Credits & vouchers** → "Supplier credits require purchase-ledger permission."
4. **GST & monthly reports** → error banner (403) and "Unavailable" in every metric.
5. **Scan or enter bill**, **Saved bills**, **Import CSV**, **Gmail intake**, **Suppliers** (with **Add supplier**), **Inward challans**, **Gate passes**, **Purchase costs** → all work, including **Add stock**.
6. On Today, the "Overdue supplier bills" row is absent (no ledger read), but **Check overdue supplier balances** is still shown and leads to the permission text.
7. Log out → log in as Dr. Shravya → sidebar **Inventory** → Payments & dues → full ledger with an enabled **Record Payment**. She can record and reverse supplier payments.

### Variations
- Pharmacist Suresh (seeded role): purchases work. Ledger, credits and GST reports are blocked, and Add supplier is hidden (see Defects).

### Edge Cases
- Capability load fails → "Inventory permissions could not be loaded…" → **Retry permissions**.

---

## Defects noticed while mapping

Each defect was verified by reading both the frontend and the backend code. Line numbers refer to the current tree.

1. **Duplicate-bill protection is exact-string only.** The invoice number is stored as `dto.invoiceNumber.trim()` with case and punctuation kept (`backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:957`). Uniqueness is the plain composite `@@unique([branchId, distributorGstin, invoiceNumber])` (`backend/prisma/schema.prisma:1564`), and no normalised pre-check exists (`normalizedIdentity` is used only for suppliers/products, `:196-237`). `SVPD/25-26/04417` vs `svpd/25-26/04417` or `SVPD-25-26-04417` saves twice, which double-counts stock and the payable.
2. **A rejected bill permanently blocks re-entry under its real number.** Reject sets status CANCELLED but keeps the unique key (`pharmacy-purchase-invoice.service.ts:414-415`). Edits allow only DRAFT/OCR_REVIEW_REQUIRED/RECONCILIATION_FAILED (`:1013-1014`), and reopen allows only REVIEWED. The re-save conflict points at the cancelled invoice (`:3112-3115`).
3. **CSV import fails reconciliation whenever lines carry discounts and cannot carry TCS.** The CSV draft sets `grossAmount = Σ qty×rate` (pre-discount) with no header discounts and no `tcsAmount` (`backend/src/modules/inventory/inventory-intake.service.ts:132-155`; the template has no such columns, `frontend/src/components/inventory/AlternateInvoiceIntake.tsx:10-41`). The workbench computes gross as taxable + header adjustments (`frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:539`) and blocks on "Printed Gross differs" (`:2361-2365`). The backend also flags "Header taxable mismatch" (`pharmacy-purchase-invoice.service.ts:2807-2812`).
4. **No backend place-of-supply or mixed-tax check, and OCR defaults to CGST+SGST.** A single OCR "GST %" is split into CGST/SGST regardless of the supplier's state code (`pharmacy-purchase-invoice.service.ts:2536-2547`). The IGST-vs-CGST/SGST exclusivity check exists only in the frontend (`PurchaseInvoiceWorkbench.tsx:679`, `lib/purchase-invoice-batch.ts:31`). `validateLineItem` checks only the summed rate (`pharmacy-purchase-invoice.service.ts:2903-2913`), so an inter-state (29…) bill can auto-post as CGST/SGST through "Import & Add Stock".
5. **GST summary purchase slabs do not add up.** CGST/SGST/IGST are recomputed as taxable × % per line, while `totalGst` uses the bill's `gstAmount` (`backend/src/modules/pharmacy/pharmacy-compliance.service.ts:76-80`). Component columns can therefore differ from Total GST by paise per line.
6. **Credit notes and supplier returns are always reported as CGST/SGST.** Workflow rows hard-code `cgstPercent: gstRate/2, sgstPercent: gstRate/2, igstPercent: 0` (`pharmacy-compliance.service.ts:135`), so ITC reversals from inter-state suppliers land in the wrong tax head.
7. **"Stock at cost" and expiry "valueAtCost" are overstated.** On commit, the inventory batch `costPrice` is set to the undiscounted PTR (`pharmacy-purchase-invoice.service.ts:1961`, `:1991`, `:1460`), while the stock transaction records the effective cost taxable ÷ (paid+free) (`:2033-2036`). The reports multiply stock by `costPrice` (`pharmacy-compliance.service.ts:230-233`, `:341`, `:363`). In STORY-901, Adapalene is valued at ₹150 rather than ₹122.73.
8. **Post-dated supplier payments create an inconsistent balance.** `paymentDate` has no future check (`backend/src/modules/pharmacy/dto/pharmacy-purchase-ledger.dto.ts:61-62`). Allocation validation counts all non-reversed allocations (`pharmacy-purchase-ledger.service.ts:100`, `:598-601`), but displayed balances drop payments dated after now (`:633`). The UI shows the bill as outstanding and offers **Max**, but posting more fails with "Allocation exceeds outstanding balance".
9. **"Account & dues" on a supplier without posted bills shows an error.** `PurchaseLedger` loads the pre-selected GSTIN (`frontend/src/components/pharmacy/PurchaseLedger.tsx:221-228`), and the backend throws `NotFoundException('Distributor ledger not found')` for zero posted invoices (`pharmacy-purchase-ledger.service.ts:311-312`). The result is the banner "Ledger error: Distributor ledger not found".
10. **Supplier GSTIN can be changed with no validation or audit from the Suppliers page.** The page PATCHes `/inventory/suppliers/:id` (`frontend/src/components/inventory/InventoryWorkspace.tsx:1192-1196`). That endpoint writes the DTO directly (`backend/src/modules/inventory/inventory.service.ts:694-706`), and `gstNumber` is only `@IsString @IsOptional` (`dto/inventory.dto.ts:656`). This bypasses the verified, audited, duplicate-checked correction path (`pharmacy-purchase-invoice.service.ts:146-180`).
11. **Seeded PHARMACIST cannot use ledger, compliance or supplier-create, despite the controllers listing PHARMACIST.** Role permissions use wildcards `inventory:po:*` and `inventory:supplier:*` (`backend/scripts/seed_rbac.ts:92-93`), but checks are exact-match (`backend/src/shared/guards/permissions.guard.ts:94-95`, `inventory-workflow.service.ts:107`). The role also lacks `pharmacy:purchase-ledger:*` and `pharmacy:compliance:read` (`seed_rbac.ts:87-114`), against `pharmacy-purchase-ledger.controller.ts:32-33` and `pharmacy-compliance.controller.ts:37-38`.
12. **DOCTOR can record and reverse supplier payments, against the controller's intent.** Ledger write `@Roles(ADMIN, PHARMACIST, ACCOUNTANT)` (`pharmacy-purchase-ledger.controller.ts:32,49,56`) is overridden by the DOCTOR bypass in `roles.guard.ts:29-31`, `permissions.guard.ts:47-49` and `inventory-workflow.service.ts:74` (`creditWrite` true).
13. **The menu shows tasks the role cannot use.** RECEPTION sees Payments & dues / Credits / GST reports (`InventoryWorkspace.tsx:44-57`, filtered only for `approvals` at `:225`) and gets dead-end text or a 403. ComplianceCenter in `reportsOnly` mode still calls `/expiry-returns` (`frontend/src/components/pharmacy/ComplianceCenter.tsx:256`) and shares one error banner, so an endpoint the user cannot even see can blank the page with an error.
14. **Copy mismatch in Purchase costs.** "Reviewed purchase invoices only" (`frontend/src/components/pharmacy/DistributorAnalytics.tsx:237`), but the backend includes only `STOCK_COMMITTED` (`pharmacy-purchase-invoice.service.ts:1141-1143`).
15. **Suspected (external API, not verifiable offline): Gmail attachment ids may not be stable.** Import re-fetches the message and requires `a.id === input.attachmentId` (`backend/src/modules/inventory/inventory-intake.service.ts:362-376`). Gmail can return a different `attachmentId` on each `messages.get`, which would make every **Review …** click fail with "Choose a PDF or photo attachment under 25 MB". It should match on part id or filename.
