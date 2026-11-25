# Manual purchase bill

A pharmacist types a distributor's bill: supplier, bill number and one or more product lines with batch, expiry, paid and free quantity, rate and MRP. They resolve any product the catalogue doesn't know, then choose "Confirm reviewed values & add stock". The bill becomes `STOCK_COMMITTED` and the received units (paid + free) are added to stock for each line's batch.

## Sub-features

- `bill-new-product`: a line whose product isn't in the catalogue needs a product kind and "Create new item" before posting.
- `bill-known-product`: a line that exactly matches a saved product and pack needs no product step; a new batch adds stock to that product.
- `bill-multi-line`: "Add Line" adds lines; each line posts its own `PURCHASE` ledger row.
- `bill-post-once`: the final action saves, reviews and commits exactly once, even when double-clicked.
- `bill-duplicate`: re-posting the same GSTIN and bill number is refused in the sticky action bar with a red "Nothing added" status, "Already on <bill> · <status>" and "Open existing invoice". The posting and Save draft buttons are withdrawn until the user edits the bill. Stock is unchanged, and opening the existing invoice scrolls its comparison into view.
- `bill-phone`: the whole flow works at 390px, with no horizontal scroll and the final action fully on screen.
- `bill-readback`: posted bills appear under Purchase bills and their products under Stock list.
- `bill-save-draft`: "Save draft" saves without changing stock ("Not saved · stock not added" becomes a saved status). Not scripted yet.

## How to get to it (user POV)

- Sidebar **Inventory** → **Purchases** tab → **Bill intake** (method tab **Scan or enter**) → link **Type instead**.
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
- **Duplicate.** After a refused post, read the outcome from `getByRole('region', { name: 'Invoice actions' }).getByRole('alert')`. It contains one `[data-review-state="error"]` pill, and the bar has no `Confirm reviewed values & add stock` or `Save draft` button. `Open existing invoice` in the bar opens `[aria-label="Compare with saved invoice"]`.
- **Proof artifacts.** In `output/verify-clinic/evidence/<stamp>-manual-bill/`: `summary.md`, `result.json`, `<run>-1..4-*.png`, `duplicate-refused-as-seen.png`, `duplicate-open-existing.png` and `readback-*.png`.

## Gotchas

- The workbench smooth-scrolls its feedback block into view after most outcomes. Measure anything above the action bar only after its position stops changing. A reading taken at the moment text appears can be about 2,500px off and is wrong (this skill once reported a false "off-screen refusal" that way). The sticky action bar needs no wait.

- Product matching is asynchronous and re-renders the matching panel. Hold element ids, not live locators, across a confirmation, or `getAttribute` waits 60s on a node that is gone.
- Once a product exists, the matching panel also renders an "Edit saved product details" `Product kind` select. `getByLabel('Product kind')` then matches two elements, so use the `-new-kind` id.
- A product created with "Create new item" persists even if the bill is never posted. A rerun with the same name takes the known-product path, so use per-run names.
- The round **"N"** badge at the bottom-left (over "Save draft" on a phone) is the Next.js dev-mode indicator, not app UI. Ignore it in UX review.
- `page.screenshot({ fullPage: true })` captures only the viewport: the workspace scrolls inside its own container. Scroll the target into view and take several shots instead.
- After posting, the URL keeps `#distributor-name` and gains no `invoice=` id. To reopen a posted bill, go through Purchase bills (`Open bill <no>`), not the current URL.
