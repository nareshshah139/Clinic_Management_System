# Purchase bills and unfinished intake

Every bill entered through any intake channel appears in the Purchase bills register, with its status, amount, payment state and an "Open bill <no>" action. Bills that were saved but not posted show under "Recent invoices" on the intake page, where the pharmacist resumes them. This is where a user checks that intake worked and finishes what was interrupted.

## Sub-features

- `register-lists-posted`: a posted bill appears as `Open bill <billNo>` with its supplier and amount.
- `register-not-posted`: drafts and reviewed-but-unposted bills are counted in the register footer ("n not posted … not included") and excluded from totals.
- `intake-recent`: "Recent invoices (n)" on Scan or enter bill lists saved bills; opening one resumes it in the review form.
- `register-new`: the register's new-bill action opens a blank intake form.

## How to get to it (user POV)

- Inventory → **Purchases** → **Purchase bills**, or route `/dashboard/inventory?area=purchases&view=register`.
- Inventory → **Purchases** → **Bill intake** → disclosure **Recent invoices (n)**.
- Payments & dues and Credits & vouchers are tabs of Purchase bills (`tab=payments`, `tab=credits`), shown with ledger access. Old `view=ledger` and `view=credits` links land there.

## Driving it with Playwright

Preconditions:

- `doctor.cjs` OK; logged in as `pharmacist`; at least one posted bill and one saved draft exist (create them with [manual-bill](./manual-bill.md); "Save draft" makes a draft).

- **Posted bill is listed.** Open the register route and wait for `getByRole('button', { name: /Open bill <billNo>/ })`. The `readback` step of `drive-manual-bill.cjs` already proves this for every bill it posts.
- **Open it.** (Read from source; not yet observed.) Click `Open bill <billNo>`. The intake form opens with `invoice=<id>` in the URL, `[aria-label="Stock status"]` reads "Stock added" and the fields are locked.
- **Resume a draft.** On the intake route, expand `Recent invoices`, choose the draft and confirm it opens editable with the saved values. Posting it must produce one review and one commit (no second draft save of a new id).
- **Proof artifacts.** Register screenshot, opened-bill screenshot and resumed-draft screenshot under `output/verify-clinic/evidence/<stamp>-purchase-bills/`.

## Gotchas

- The register defaults to the current financial year (1 Apr–31 Mar, IST). Bills dated outside it are hidden until the period filter changes.
- Register rows load asynchronously. Wait for the footer status "Bills ₹… · Outstanding in …" or "No purchase bills" before reading rows (`scripts/stack/scenarios/cr26-purchase.cjs` has a full `settle()` and row reader to reuse).
- `intake-recent` and draft resume have not been driven by this skill yet; only `register-lists-posted` is scripted.
