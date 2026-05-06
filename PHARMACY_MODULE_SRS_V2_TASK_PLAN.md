# Pharmacy Module SRS v2 Implementation Plan

Source: `/Users/nshah/Downloads/Pharmacy_Module_SRS_v2_For_Development.docx`
SRS version/date: v2.0, 1 March 2026
Plan created: 3 May 2026

## Delivery Strategy

The current codebase already has pharmacy drugs, packages, invoices, inventory, prescriptions, and stock prediction. The SRS v2 should be delivered in defensive phases so that stock, billing, GST, and payment behavior are never silently wrong.

Primary defensive principles:

- Validate at API boundaries and reject ambiguous payloads.
- Keep inventory mutations centralized and idempotent.
- Never deduct stock silently when product, batch, expiry, or quantity cannot be verified.
- Preserve branch isolation on every prescription, inventory, invoice, and partner record.
- Treat OCR and partner uploads as draft/review data until reconciliation passes.

## Phase 0: Immediate Guardrails

Backend:

- Harden pharmacy invoice DTOs: non-empty item arrays, sane pagination limits, whitelisted sorting, strict item type/id rules.
- Reject prescription-to-invoice links that do not belong to the same branch and patient.
- On invoice confirmation, block expired stock and insufficient stock instead of clamping inventory to zero.
- Allocate invoice stock through batch inventory in FEFO order where multiple inventory items are linked to a drug.
- Write stock transactions with batch, expiry, reference, and user data for every deduction.
- Replace mock dashboard/alert stock values with real inventory data.

Frontend:

- Surface backend stock/expiry validation errors clearly during invoice creation or confirmation.
- Prevent product master submissions without salt/composition, therapeutic category, dosage form, and strength for new medicines.

Verification:

- Add or update tests for invoice validation, status transitions, insufficient stock, expired stock, and dashboard alert data.
- Run backend build and targeted pharmacy/inventory tests.

## Phase 1: Product Master and Alternative Medicine Engine

Schema:

- Add explicit product master fields missing from the current model: generic/salt name, therapeutic category, route of administration, product type, HSN/GST defaults, and optional aliases.
- Add product alias mapping for partner pharmacy and distributor invoice naming differences.

Backend:

- Add alternative search endpoints:
  - exact substitute by generic/salt + strength + dosage form + route
  - ingredient/category search with stock-aware ranking
  - brand autocomplete with stock status
- Ensure alternatives never cross route, strength, or dosage form.
- Add product completeness checks before purchase stock entry.

Frontend:

- Add prescription-time stock panel with total stock, batch details, low-stock/near-expiry warnings, and alternatives.
- Add product master UI for mandatory fields and alias management.

## Phase 2: Purchase Invoice Entry, OCR Review, and Distributor Analytics

Schema:

- Add distributor purchase invoices, purchase invoice line items, OCR review drafts, invoice-level discounts, notes, credit/debit notes, and payment lifecycle tables.
- Enforce unique distributor invoice key: distributor GSTIN + invoice number.

Backend:

- Implement manual purchase entry and OCR draft APIs.
- Require all low-confidence OCR fields to be reviewed before commit.
- Validate GSTIN, drug license, due date for credit bills, and purchase reconciliation:
  - gross minus discounts equals taxable amount
  - taxable plus GST plus rounding equals net payable
  - rounding tolerance capped at +/- Rs. 1
- Commit stock only after goods received date is present.
- Track free stock separately for cost/P&L while making it available for dispensing.
- Add distributor discount ranking, product-level effective price, and discount-drop alerts.

Frontend:

- Build invoice capture/upload, OCR correction, reconciliation, and purchase confirmation screens.
- Build distributor analytics dashboards with period/product/GST filters.

## Phase 3: Standardized Patient Bill Output

Backend:

- Generate A5 and thermal bill data with batch-specific MRP, GST slab summary, payment mode, amount in words, doctor registration number, branch GSTIN, and drug license.
- Support original/duplicate copy and reprint by bill number.
- Add optional QR verification payload.

Frontend:

- Replace ad hoc invoice print HTML with the SRS layout:
  - clinic identity
  - bill information
  - medicine line items
  - totals and GST summary
  - slab-wise GST breakup
  - payment/footer
- Add A5 and 80mm thermal print profiles.

## Phase 4: Payment Ledger and Compliance

Schema:

- Add purchase invoice payment allocations with many-to-many payment-to-invoice mapping.
- Add distributor ledger, aging buckets, supplier annual totals, TCS tracking, and drug license expiry.

Backend:

- Implement pending/partial/paid lifecycle.
- Support bulk payments and running balances.
- Add due-soon/overdue alerts.
- Add GST input/output reporting, slab summaries, and GSTR-compatible exports.

Frontend:

- Ledger, aging, payment entry, bulk allocation, and compliance export screens.

## Phase 5: Partner Pharmacy Daily Sync

Schema:

- Add partner organizations/users, daily sale uploads, partner sale items, discrepancy flags, source tagging, and sync status.

Backend:

- Partner-scoped sale entry and CSV/Excel upload.
- Apply partner sale deductions in real time with discrepancy flags if reported sale exceeds available stock.
- Daily missing-entry reminder and owner escalation after repeated misses.
- Month-end consolidated in-house + partner reports.

Frontend:

- Partner portal/mobile-friendly daily entry.
- Owner dashboard widgets: partner sales today, last synced, threshold breaches, discrepancies.

## Phase 6: Audit, Expiry Returns, and Monthly Reporting

Backend:

- On-demand physical audit sessions with adjustment locks during active audit.
- Post-audit corrections requiring owner/supervisor approval and mandatory reasons.
- Expiry quarantine and return lists at 3 months and 1 month.
- Monthly procurement, sales, GST, P&L, stock value at cost/MRP, expired/damaged write-off, and distributor performance reports.

Frontend:

- Audit sheets, mobile count entry, discrepancy reports, expiry return queues, and monthly report exports.

## Acceptance Gates

- No invoice confirmation can reduce stock below zero.
- Expired batches are blocked from dispensing.
- Every inventory deduction has a transaction record and reference.
- Alternatives match exact salt/generic, strength, dosage form, and route once route is modeled.
- Purchase invoice commits are blocked on unresolved OCR flags or reconciliation errors.
- Partner oversell entries are allowed only as flagged discrepancies, never as silent negative stock.
- Product master completeness is enforced for new stock-bearing medicines.
