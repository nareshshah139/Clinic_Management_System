# Opening stock

A clinic going live records the stock already on its shelves. Two ways exist: upload an Excel sheet that is previewed and then imported into the drug catalogue and inventory in one step, or create a manual "Opening stock" workflow document line by line. Both add stock without a purchase bill.

## Sub-features

- `opening-import-preview`: "Choose Excel" plus "Preview import" shows what will be created, with no writes.
- `opening-import-confirm`: "Confirm opening import" creates the products and stock; the summary survives a recovery (`opening-recovery-preserves-summary` contract).
- `opening-manual-document`: under Stock → Manual opening stock, "New document" opens a workflow document whose posting adds stock.

## How to get to it (user POV)

- Inventory → **Stock** → **More tasks…** → **Opening stock import**, or route `/dashboard/inventory?area=stock&view=opening`.
- Inventory → **Stock** → **More tasks…** → **Manual opening stock**, or route `/dashboard/inventory?area=stock&view=OPENING_STOCK`.
- Pharmacy Desk also links the starter import ("Upload opening stock without leaving the pharmacy desk").

## Driving it with Playwright

Preconditions:

- `doctor.cjs` OK; logged in as `pharmacist`.
- An `.xlsx` in the starter-import format. Build it with the `xlsx` package from `frontend/node_modules`. Read `frontend/src/components/pharmacy/PharmacyInventoryStarterImport.tsx` for the expected columns before writing one.

- **Preview.** On the opening route, set the file on the input behind `Choose Excel`, then click `getByRole('button', { name: 'Preview import' })`. A preview appears and the button becomes `Confirm opening import`. Prove that `inventory_items` is unchanged.
- **Confirm.** Click `Confirm opening import`. Prove that `inventory_items` gains the rows with `currentStock` equal to the sheet quantities, then read back through Stock → Stock list.
- **Manual document.** On `view=OPENING_STOCK`, click `New document`, then add lines and post. Prove the stock delta in the database and in Stock list.
- **Proof artifacts.** Preview and confirm screenshots plus DB deltas under `output/verify-clinic/evidence/<stamp>-opening-stock/`.

## Gotchas

- Not yet driven end to end by this skill. The 2026-11-18 probe confirmed only the routes and the entry buttons (`Choose Excel`, `Preview import`, `New document`). Treat every other step as unverified until a run proves it, then update this file.
- `scripts/diagnostics/inventory-opening-probes.cjs` and `scripts/verify-opening-import-recovery.cjs` hold earlier opening-import probes against other harnesses. Mine them for file shapes, but don't trust their URLs or ports.
