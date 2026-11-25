# Import purchase CSV

A pharmacist uploads a purchase CSV (one row per bill line, with the bill header repeated on each row). The app opens the bill in the same review form as manual entry, prefilled, and stock is still unchanged. They resolve products and post exactly as in [manual-bill](./manual-bill.md). If the CSV matches a bill that is already saved, the app opens that bill instead.

## Sub-features

- `csv-template`: "Download purchase CSV template" downloads `purchase-invoice-template.csv` with the required header.
- `csv-draft`: "Open review draft" lands on Scan or enter bill with the supplier, bill number and lines prefilled, and stock unchanged.
- `csv-same-checks`: imported lines go through the same product matching and checks as typed lines ("Products need attention" for unknown products).
- `csv-duplicate`: a CSV for an already saved GSTIN and bill number opens the existing invoice.
- `csv-error`: an unreadable CSV shows a `role="alert"` message and stays on the import page.

## How to get to it (user POV)

- Inventory → **Purchases** → **Bill intake** → method tab **Import CSV**.
- Direct route: `/dashboard/inventory?area=purchases&view=intake&method=csv`. The old `view=csv` link lands there.

## Driving it with Playwright

Preconditions:

- `doctor.cjs` OK; logged in as `pharmacist`; the CSV's bill number is unused.
- A CSV whose header is exactly the template's 31 columns: `distributorName,distributorGstin,distributorDlNo,invoiceNumber,invoiceDate,goodsReceivedDate,billType,dueDate,productName,manufacturer,packSize,packUnitType,hsnCode,batchNumber,expiryMonth,expiryYear,quantityPurchased,freeQuantity,mrp,purchaseRate,discountPercent,specialDiscountPercent,schemeAmount,taxableAmount,cgstPercent,sgstPercent,igstPercent,gstAmount,lineTotal,rounding,netPayable`.

- **Upload.** `page.getByLabel('Purchase invoice CSV').setInputFiles('<file>.csv')`, then click `getByRole('button', { name: 'Open review draft' })`. The button reads "Reading CSV…" while it works.
- **Land in review.** The URL becomes `…&view=intake` with no `method`. `#invoice-number` holds the CSV bill number, `input[id$="-product"]` holds the first product, and the checks badge counts the open checks (for example, "1 check to finish" with "Products need attention" for an unknown product).
- **Prove stock-neutral.** Before posting, `inventory_items.currentStock` for the CSV products is unchanged and no `stock_transactions` row references the bill.
- **Post.** Continue with the manual-bill "Resolve products" and "Post" steps, and prove the same side effects.
- **Proof artifacts.** Screenshot the import page after upload and the prefilled review form, plus `result.json` with the DB before and after, under `output/verify-clinic/evidence/<stamp>-csv-import/`.

## Gotchas

- The upload POSTs `multipart/form-data` straight to `/api/inventory/workspace/intake/csv` through the browser `fetch`, not `apiClient`. A 4xx shows the server `message` in the alert.
- The imported draft lives in client state until saved. Navigating away before "Save draft" or posting loses it, while the CSV source is kept server-side.
- Products created in an earlier run make the import take the known-product path. Use fresh product names.
- No scripted driver yet. Write one from the `SKILL.md` ad-hoc template; the probe on 2026-11-18 confirmed the upload → prefilled-review path.
