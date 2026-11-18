# Manual purchase bill

A pharmacist types a distributor's bill: supplier, bill number and one or more product lines with batch, expiry, paid and free quantity, rate and MRP. They resolve any product the catalogue doesn't know, then choose "Confirm reviewed values & add stock". The bill becomes `STOCK_COMMITTED` and the received units (paid + free) are added to stock for each line's batch.

## Sub-features

- `bill-new-product`: a line whose product isn't in the catalogue needs a product kind and "Create new item" before posting.
- `bill-known-product`: a line that exactly matches a saved product and pack needs no product step; a new batch adds stock to that product.
- `bill-multi-line`: "Add Line" adds lines; each line posts its own `PURCHASE` ledger row.
- `bill-post-once`: the final action saves, reviews and commits exactly once, even when double-clicked.
- `bill-duplicate`: re-posting the same GSTIN and bill number is refused with "Open existing invoice"; stock is unchanged.
- `bill-phone`: the whole flow works at 390px, with no horizontal scroll and the final action fully on screen.
- `bill-readback`: posted bills appear under Purchase bills and their products under Stock list.
- `bill-save-draft`: "Save draft" saves without changing stock ("Not saved · stock not added" becomes a saved status). Not scripted yet.

## How to get to it (user POV)

- Sidebar **Inventory** → **Purchases** tab → **Scan or enter bill** → link **Type instead**.
- Purchases → **Purchase bills** register → **New** bill action (opens the same form with `new=<key>`).
- Inventory → **Today** → "Scan or enter bill" button.
- Direct route: `/dashboard/inventory?area=purchases&view=intake`, then **Type instead**.

## Driving it with Playwright

Preconditions:

- `doctor.cjs` reports `DOCTOR OK`; logged in as `pharmacist`.
- The bill number is unused for GSTIN `27AABCS1234F1Z5` in this schema (the driver tags it per run).

- **Run the whole proof.** Run `node .claude/skills/verify-clinic/scripts/drive-manual-bill.cjs`. It prints a PASS or FAIL line per check, then `PASS n/n checks · evidence <dir>`, and exits 0 only if all checks pass. Use `--only new,duplicate` to rerun a subset; `duplicate` needs `new` in the same run.
- **Open the form.** Go to the intake route and click `getByRole('link', { name: 'Type instead' })`. `#distributor-name` takes focus, and the badge under "Check before adding stock" counts the open checks.
- **Enter the bill.** Fill `#distributor-name`, `#distributor-gstin`, `#distributor-dl` and `#invoice-number`. For line N, scope to `[aria-label="Product line N"]` and fill `input[id$="-product"]`, `-pack-size`, `-unit`, `-batch`, `-expiry-month`, `-expiry-year`, `-qty`, `-free-qty`, `-rate`, `-mrp` and `-hsn`. Totals update live (Net Payable, Received stock units).
- **Resolve products.** After typing, the app POSTs `/master-matches`. For an unknown product, a `select[id="product-<i>-new-kind"]` appears. Choose `Medicine`, `Cosmetic / skin care` or `Other consumable`, then click `Create new item`, which POSTs `/master-confirmations`. Repeat until the text "Ready for your final check" is visible.
- **Post.** Click `getByRole('button', { name: 'Confirm reviewed values & add stock' })`. Within about 1s, `[aria-label="Stock status"]` reads "Stock added" with `Reference: PINV-<bill>-<suffix>`, the fields lock with "Verified" chips, and "Back to list" and "New invoice" appear.
- **Prove side effects.** `L.sql(state, ...)`: `pharmacy_purchase_invoices.status = 'STOCK_COMMITTED'`; `inventory_items.currentStock` per product name rose by paid + free; `stock_transactions` has one `PURCHASE` row per line with `reference LIKE 'PINV-<bill>-%'`.
- **Proof artifacts.** In `output/verify-clinic/evidence/<stamp>-manual-bill/`: `summary.md`, `result.json`, `<run>-1..4-*.png`, `duplicate-refused-as-seen.png`, `duplicate-refused-message.png` and `readback-*.png`.

## Gotchas

- **Known open UX failure (2026-11-18):** the check `[duplicate] refusal is on screen where the user clicked` fails. After a duplicate post, the "Finish this purchase … already saved … Open existing invoice" panel renders about 1,800px above the sticky action bar. At the click site the button stays enabled and the footer still says "Not saved · stock not added". The panel's copy also says to choose "Confirm reviewed values & add stock" again, which would hit the same refusal. Expect `36/37` until this is fixed. Don't weaken the check.
- Product matching is asynchronous and re-renders the matching panel. Hold element ids, not live locators, across a confirmation, or `getAttribute` waits 60s on a node that is gone.
- Once a product exists, the matching panel also renders an "Edit saved product details" `Product kind` select. `getByLabel('Product kind')` then matches two elements, so use the `-new-kind` id.
- A product created with "Create new item" persists even if the bill is never posted. A rerun with the same name takes the known-product path, so use per-run names.
- The round **"N"** badge at the bottom-left (over "Save draft" on a phone) is the Next.js dev-mode indicator, not app UI. Ignore it in UX review.
- `page.screenshot({ fullPage: true })` captures only the viewport: the workspace scrolls inside its own container. Scroll the target into view and take several shots instead.
- After posting, the URL keeps `#distributor-name` and gains no `invoice=` id. To reopen a posted bill, go through Purchase bills (`Open bill <no>`), not the current URL.
