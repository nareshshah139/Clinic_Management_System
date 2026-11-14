# Unit `purchase`: typing in a supplier bill and getting the stock added

- Worktree `/home/user/wt/purchase`, branch `ux/purchase`.
- Read in full: `docs/ux-flow/journeys/j10.md`; naming table 4.4 in `docs/ux-flow/redundancy.md`.
- Journey you own: `j10` (baseline 21; the app already knows 6 of the 14 fields it asks for).
- Main files: `frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx` (5,600 lines), `PurchaseSupplierReview.tsx`, `PurchaseProductDetails.tsx`, `PurchaseFieldReview.tsx`, `backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts` (only where an item names it), and their tests.
- This module has the densest product rules in the app and its own recovery proofs (`docs/qa/invoice-*`, `verification/`, `.github/workflows/invoice-recovery-formal.yml`, `e2e/recovery`). Read every `@cc` rule in each file before editing it, and the `CONTRACTS` files in the directories you touch. Stock commit, matching, approval and recovery rules do not change. If an item cannot be built without bending one, skip it and report which rule stops it. A smaller safe result is the right result here.

## Build, most valuable first
1. **Choosing a saved supplier fills that supplier's drug licence number**, and the "licence missing" check clears. Typing stays possible when the saved supplier has none.
2. **A product typed exactly as a saved product's name is matched without the extra steps** (today: Refresh Matches, search again, Match, "Confirm this match"). Fill HSN, MRP, GST and manufacturer from the saved item. Keep the pack and unit the user typed: measured, a typed pack of `20g` is silently overwritten with `1 unit` after matching. Only an exact, unambiguous name match takes this path; anything fuzzy keeps today's review steps. Check the false "different products" panel and the "Not in inventory" label the critique measured for an item that is in inventory; fix them if they share the cause.
3. **Stock unit and pack prefill from the matched item** when blank, not from the global default "Strip".
4. **One expiry field accepting `10/2028`** (keep the two internal values the draft payload uses).
5. **"Enter bill by hand" is a real button** beside "Choose files". Collapse "Recent invoices", "Review status guide", "Recover interrupted import" and "Automatic import" under one closed "More" control; remove none of them.
6. **A blank form does not open with errors.** Show the checks once the user has typed something. The checks and what they block do not change.
7. **After the stock is added**, say what was added in plain words ("Tretinoin Cream 0.025% 20g: 20 added") with "Enter another bill" as the next step.
8. **Guides stay** (owner decision): rewrite any guide step on these screens to match. Apply the rest of j10's Subtext table (grep the tests for each string first). "Supplier" where staff-facing labels say "Distributor", display text only.

## Do not build
- Removing or merging the other five ways of receiving stock.
- Inventory workspace menu order, the Today screen, the data-quality strip.
- Dashboard or sidebar changes.

## Expected
- `j10`: 21 to 14 or fewer; 11 if items 1 to 4 all land. Goal unchanged (stock up by 20, bill AMA/2026/1187 with stock committed) plus: the saved batch keeps the pack and unit as typed, batch TR2611 and expiry 10/2028.
- Run the purchase tests early and often (grep `__tests__` and `src` for `PurchaseInvoiceWorkbench` and `purchase`), and the backend purchase specs with the test database URL from the brief.
