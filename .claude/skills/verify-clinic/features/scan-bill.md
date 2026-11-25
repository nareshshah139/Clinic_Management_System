# Scan a bill (OCR)

A pharmacist uploads a bill as a PDF or up to 10 photos, in page order, sets "Received on" and chooses "Scan bill". The backend extracts the bill with an external vision model and opens a prefilled review with per-field confidence checks. "Scan only" never changes stock. Stock is added only by the same final action as manual entry. The original upload is archived either way.

## Sub-features

- `scan-upload`: the file input accepts PDF or images; "Scan bill" stays disabled until a file and a received date are set.
- `scan-review`: a successful extraction opens review with OCR flags, "Previous" and "Next check" navigation, and a source-page viewer.
- `scan-failure`: a failed extraction keeps the upload ("The original upload is saved; retry or enter the invoice details manually"), offers "Enter complete invoice manually" and "Reject this upload", and adds no stock.
- `scan-automatic`: under "Automatic import", "Import & Add Stock" posts only if every automatic check passes. Shown only to users with automate permission.
- `scan-recover`: "Recover interrupted import" resumes an import whose response was lost.

## How to get to it (user POV)

- Inventory → **Purchases** → **Bill intake** (method tab **Scan or enter**) → "Scan a bill" panel.
- Inventory → **Today** → "Original files awaiting intake" (archived uploads not yet turned into bills).
- Direct route: `/dashboard/inventory?area=purchases&view=intake`.

## Driving it with Playwright

Preconditions:

- `doctor.cjs` OK; logged in as `pharmacist`.
- **Extraction cannot succeed in this stack.** `boot.cjs` starts the API with a fixed environment that has no OpenAI or Codex credentials, so `POST /api/pharmacy/purchase-invoices/ocr/extract` returns 500. Only `scan-upload` and `scan-failure` can be verified here. Report `scan-review` and `scan-automatic` as **not verified** unless you run a stack with real OCR credentials, which spends money on a real model and is outside this skill.

- **Upload.** `page.locator('#purchase-invoice-upload').setInputFiles('<bill>.pdf')`; `#import-received-date` defaults to today. `getByRole('button', { name: 'Scan bill' })` becomes enabled and reads "Reading bill…" while busy.
- **Failure UX.** `[role="alert"]` shows "Invoice extraction failed. The original upload is saved; retry or enter the invoice details manually." Check that `Enter complete invoice manually` and `Reject this upload` are offered, and that `inventory_items` and `stock_transactions` are unchanged.
- **Reject.** Click `Reject this upload` and confirm in the dialog ("Reject upload"). The notice reads "Upload rejected. No stock was added; the original remains in Saved uploads."
- **Proof artifacts.** Screenshot after upload and after the failure, plus `recorder` failures (expect the 500 on `ocr/extract`), under `output/verify-clinic/evidence/<stamp>-scan-bill/`.

## Gotchas

- A failed scan of an invalid file stacks three alerts: "Request Failed / Invoice extraction failed…", "Internal server error (Reference: <uuid>)" with "Retry source locations", and "Could not load this invoice page". The source-map and page endpoints also return 500 for that document. Judge the failure UX on that whole stack, not on the first alert alone. A raw "Internal server error" reaching the user is worth reporting.
- The backend log line for the failed extract carries only `errorCode: server_error`. The cause is not logged.
- Upload limits come from `PHARMACY_PURCHASE_OCR_MAX_FILE_MB` (default 25) and `PHARMACY_PURCHASE_OCR_MAX_PAGES` (at most 5).
