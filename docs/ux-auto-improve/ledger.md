# UX auto-improve ledger

One row per reviewed section. Videos are kept outside the repository; ask the round's author for them.

| Section | Date | Branch / commits | Videos |
| --- | --- | --- | --- |
| Inventory intake and inventory management | 2026-11-13 | `claude/loving-feynman-2ilq1n`: packages A to E (below) | typed-bill-entry, supplier-license-and-reader, today-first-actions, stock-add-item-csv |

## Round 1: inventory intake and inventory management (2026-11-13)

Process: one reviewer used the section in a browser on the demo stack (8 proposals), a second reviewer judged them
against the code, the `@cc` contracts and the earlier `docs/qa` decisions (4 packages approved, the rest changed,
rejected or deferred), five implementers built the packages with a failing test first, and the lead read every diff,
merged, ran the checks and hand tested the merged build.

Seed for reproducing every before and after state: `scripts/stack/scenarios/inv-r1-seed.cjs`
(smoke: `scripts/stack/scenarios/inv-r1-smoke.cjs`).

### Merged

| Package | What the user sees | Main files |
| --- | --- | --- |
| A. Typed bill entry | A typed line no longer starts as "Strip" with expiry 12 / next year. Missing details are one list in plain words ("Line 1: HSN is missing."). No product-check panel before a product is typed. An optional "Total on the bill (₹)" shows the difference as you type and blocks posting when it is over ₹1. | `PurchaseInvoiceWorkbench.tsx` |
| B. Saved facts at intake | Confirming a product match fills a blank stock unit from that product's latest batch. A matched supplier's drug license is offered with "Use this drug license". Bill reader failures say what to do instead of naming a server setting. | `pharmacy-purchase-invoice.service.ts`, `PurchaseSupplierReview.tsx`, `codex-oauth.ts` |
| C. Today | Main buttons first. The price/stock approvals row opens the Price / stock tab; new items have their own row. Queues with nothing waiting are one "Nothing waiting:" line of links. Three repeat buttons and the empty "Recent activity" heading are gone. Data quality sits below the queues. | `InventoryWorkspace.tsx`, `InventoryApprovals.tsx` |
| D. Stock and CSV wording | "Add batch" is "Add item" and says the new item has no stock yet. Phone stock rows show quantity, expiry and location. The CSV help lists the template's columns. | `WorkspaceStock.tsx`, `AddInventoryItemDialog.tsx`, `AlternateInvoiceIntake.tsx` |
| E. Unit from saved stock | When the typed name is exactly a saved product, a blank stock unit is filled from that product's own stock, with a notice. A typed unit is never replaced. (Found in the lead's hand test of A + B: the common repeat purchase otherwise needed the unit typed on every line.) | `pharmacy-purchase-invoice.service.ts`, `PurchaseInvoiceWorkbench.tsx` |

New contracts: `purchase-line-no-silent-defaults`, `typed-bill-printed-total`, `purchase-match-fills-blank-unit`,
`purchase-check-suggests-stock-unit`, `today-quiet-zero-queues`, `approvals-open-requested-tab`;
`supplier-directory-revision` extended.

### Rejected (with the reason)

- Offer a same-name saved product whose pack differs, or show it as a one-click button: contradicts
  `ocr-shared-search-suggestions-only`, `search-pack-not-equivalence` and `purchase-match-labels-and-fallback`, chosen in
  CR-15 after a real wrong-product posting. The reviewer's evidence came from a seed that labels every pack "1 tube".
- Remove the "Verified" chips on a posted bill: contradicts `invoice-field-color-evidence`.
- A visible text label on the CSV template button: icon actions with accessible names are a recorded readability decision.
- Remove the nested `<main>`: five stack scenarios select `main.inventory-surface`.

### Deferred (candidates for later rounds)

- Persist the printed total on the invoice so the post-add summary can say "Not entered" instead of "Totals match".
- Suspected, unverified: after "Save draft" on a typed bill the calculated totals may be treated as printed totals, so a
  later rate fix raises several "Printed ... differs" errors. Write a failing test first.
- The match confirmation and product check send a placeholder expiry (12 / next year) while the typed expiry is blank,
  because the item DTO requires one; the confirmation's audit row therefore records that placeholder, as it recorded the
  old default. Let the match DTO accept a blank expiry.
- Every field edit on a bill re-runs the product check (one request per edit, and the footer briefly reads "Resolve the
  product checks"). Older than this round; only re-check when name, pack, unit or kind changes.
- "Use suggestion" for form and strength on a new medicine at intake.
- Merge "Invoice product kind" with the new-product kind select.
- Due date from supplier credit terms; remember bill type per supplier.
- Add item form: core fields first, the rest under More details; optional opening quantity.
- Reorder action from a low-stock row (the shortbook is fed by targets, not by low stock).
- Supplier CSV column mapping.
- Scroll to the receipt after posting.
- Lazy-load the heavy Inventory panels; remove duplicate overview and gap fetches.
- Phone stock rows: the new line wraps to two or three lines; a card layout would read better.

### Owner questions (nothing in this round depends on them)

1. Where does a newly received batch sit, and with which limits? Today: location "Not set", minimum 10.
   Options: (a) keep; (b) copy shelf and limits from the product's previous batch; (c) copy them, marked "from earlier
   batch" until confirmed. Judge's recommendation: (a) now, (c) later.
2. What should "Low stock" count? Today: each batch at or below its own minimum, including empty old batches of a product
   that has stock in a newer batch. Options: (a) per batch; (b) per product; (c) per batch, skipping empty batches when the
   product has stock elsewhere. Judge's recommendation: (b), as its own package (it also changes the Stock filter and the
   shortbook generator).

### User stories still open

- A brand-new product with a starting quantity in one step.
- Low stock, then order it.
- A supplier's own CSV or Excel export.
- Fix a stock unit that was entered wrongly (blocked by design; needs a linked correction flow).

### Not exercised in this round

Real bill scanning (no reader on the demo stack; only the failure path), Gmail intake, the starter import, opening-stock
CSV, inward challans, purchase-order receiving, keyboard-only and screen-reader use, tablet widths.
