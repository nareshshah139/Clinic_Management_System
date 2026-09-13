# Purchase invoice OCR

Invoice extraction runs a real Codex model through ChatGPT OAuth, using the same
environment as the embedded pharmacy agent. It does not use `OPENAI_API_KEY`,
`OPENAI_VISION_MODEL`, canned invoice results, or an API-key fallback.

The backend host must have Codex 0.153.4 or newer installed and logged in using ChatGPT. The server
process must have access to that login through its `HOME` / `CODEX_HOME` or existing
`CODEX_ACCESS_TOKEN` configuration. Credentials are never returned to the browser.

- `PHARMACY_AGENT_CODEX_PATH`: executable path (default: `codex`).
- OCR defaults to `gpt-6-astra` with `model_reasoning_effort="medium"`.
- `PHARMACY_PURCHASE_OCR_CODEX_MODEL`: optional OCR-specific model override.
  `PHARMACY_AGENT_CODEX_MODEL` continues to control the embedded agent only.
- `PHARMACY_AGENT_CODEX_TIMEOUT_MS`: timeout per OCR read (default: 120 seconds).
- The UI proxy allows 300 seconds for two OCR reads and persistence. Any deployment proxy must also accommodate this request duration.

OCR working images and rendered PDF pages are staged in a private temporary
directory and removed after success or failure. The exact original upload is
archived in PostgreSQL before OCR starts. Login, process, timeout, and malformed-output
failures return errors rather than synthetic results. **Extract Draft** saves the
original and previews extracted details without creating an invoice or stock.
**Import & Add Stock** saves an invoice and
automatically receives stock only when the checks below pass.
Excel import and manual stock approvals use application/database logic, not LLMs.

## Extraction and independent verification prompts

`purchase-invoice-ocr.prompts.ts` contains both prompts and their version, returned
as `extraction.promptVersion`. Each read receives the original images; the second
read never receives the first read's answers. The prompts traverse pages and every
visible batch row, including 20+ rows, retain repeated products as separate rows,
distinguish free packs from pack size, and exclude headers and carry-forward totals.
They reread ambiguous GSTIN/batch characters without guessing from identifier format
or product knowledge, preserve printed amounts, and flag incomplete page sets.

The backend compares product name, pack size and HSN as well as supplier/invoice
identity, batch, expiry, paid/free quantities, MRP, rate, row count and payable total
across the reads. Disagreements remain review issues; neither answer silently wins.
Unknown payment terms are blocked even if the model omits its uncertainty flag.
The form's existing bill-type default is for display and cannot clear that flag.
These changes require a backend deployment, with no database migration.

## Original documents

`pharmacy_purchase_invoice_documents` stores the original binary bytes (`BYTEA`),
filename, detected MIME type, byte count, SHA-256, branch, uploader and upload time.
No resizing, rotation, compression or PDF page truncation is applied to the stored
original. Storage is in the application's configured PostgreSQL database, so it
survives application restarts and does not depend on a server filesystem volume.
The existing upload limit applies (25 MB by default).

Both OCR upload routes archive first and return `sourceDocument` metadata. If OCR
fails, the error response also includes that metadata; no invoice or stock is
created. If archiving fails, OCR and automatic stock processing do not start.
`sourceDocumentId` on draft create/update links an archived upload to the invoice
in the same transaction. An original cannot be reassigned to another invoice or
linked across branches. Identical bytes are deduplicated within a branch; distinct
scans of a duplicate invoice are retained without replacing its existing originals.

Invoice responses contain document metadata, never binary contents. Authorized
users download the original through `GET /pharmacy/purchase-invoices/documents/:id`,
which checks invoice read permission and branch ownership and returns private,
non-cacheable attachment responses. `GET /pharmacy/purchase-invoices/documents`
lists the latest 20 unlinked uploads. The UI exposes **Download original** on saved
invoices and **Uploads awaiting invoice details** for extraction failures or
unsaved previews; **Use for this draft** links one when the draft is next saved.

Deploy migration `20260912_add_purchase_invoice_documents` before this code and
regenerate Prisma Client. This additive migration creates one table; it does not
rewrite existing invoices, stock or permissions. Older invoices have no original
unless it is attached/re-uploaded; previously discarded files cannot be recovered.

## Automatic intake

`POST /pharmacy/purchase-invoices/ocr/import` accepts an invoice file and the
operator-confirmed `goodsReceivedDate`. The date records physical receipt; it is
not inferred from the invoice date. It returns the extracted draft, a saved
`invoice` when available, and `automation: { status, issues }`:

- `STOCK_COMMITTED`: invoice and stock are saved.
- `SAVED_FOR_REVIEW`: invoice details are saved; specific issues need correction.
- `NOT_SAVED`: required identity, expiry or numeric values cannot be saved, or
  saving failed. The extracted form and archived original remain available for correction and retry.
- `DUPLICATE`: the same branch, supplier GSTIN and invoice number already exist.
  The existing invoice is returned without overwriting it or committing its stock.
  Reuploading identical already-linked bytes returns that invoice immediately, without rerunning OCR.

Automatic stock intake requires all existing reconciliation checks, no OCR flags,
at least 98% OCR confidence on every OCR line, a valid receipt date, whole stock
quantities, unexpired batches, positive MRP, and quantity/rate/discount agreement
with the taxable amount. A second independent read must agree on supplier GSTIN,
invoice identity/total, row count, batch, expiry, quantities, MRP and purchase rate,
and confirm page completeness. Disagreement or failure adds blocking flags; the
first read is not silently replaced. Confidence alone is insufficient. Automatic
intake also requires one active branch supplier with matching name and GSTIN.
Products must resolve
to exactly one active, complete master record by name, manufacturer and canonical pack size;
a unique exact name/pack match can fill a missing manufacturer from the master.
fuzzy suggestions and new master creation require human review. OCR does not
invent missing expiry dates or round confidence upward.

The invoice is saved first. Automatic review and every stock write then occur in
one serializable database transaction. Failed stock writes roll back review and
stock changes while retaining the draft. Serialization conflicts retry up to
three times. Already committed invoices cannot add stock again.

After corrections, **Save & Process** saves the edited invoice and calls
`POST /pharmacy/purchase-invoices/:id/process` to recheck it. Reported amounts remain
independent of calculations, including after rate, quantity, discount or row changes;
only an explicit reported-amount correction changes them. Quantity precision is
preserved until whole-number validation. A doctor reference is optional for
supplier invoices. Low model confidence still blocks automatic stock intake, but
staff can correct the fields, resolve flags, save and use **Mark Reviewed** followed
by **Commit Stock** without editing the model's confidence score. Expand **Amounts read from invoice** on a line or the invoice
totals to correct a reading error against the source document. Matching controls
also remain accessible for reopened drafts.

### Reviewer workflow for saved exceptions

The **Finish invoice review** section stays above the editor on desktop and mobile.
Open **Review issues** on the selected saved invoice (imported exceptions open for
editing immediately), then use this sequence:

1. Open the original invoice. Choose verified Cash/Credit terms; “APPROVAL BILLS”
   alone does not determine them. For Credit, enter the due date. Select the matching
   saved supplier or enter its verified name/GSTIN; check the supplier, not buyer, GSTIN.
2. Follow each **Go to…** link, correct the value and use **Confirm … checked**.
   A confirmation for a missing manufacturer/unit stays disabled until the field
   is filled. **Refresh Matches** can fill verified product/manufacturer/pack details;
   the stock unit can also be entered after checking the product packaging.
   Missing-page issues direct the reviewer to upload a complete document.
3. Use **Save corrections**. This updates the same invoice and recalculates its
   validation issues without adding stock. Duplicate AUTO/OCR messages from older
   records are combined for display; new automatic checks store header flags once.
4. Confirm **Goods Received Date**, then **Mark Reviewed**. This is the human review
   path for checked low-confidence OCR; it does not increase the confidence score.
5. Use **Commit Stock**, then confirm the existing stock confirmation dialog.
   Stock changes only at this final step. A committed invoice cannot be posted again.

The guide explains why review/commit are disabled and which permission is missing.
It does not grant permissions or bypass saved validation, expiry, quantity, product
matching or stock idempotency checks. Repeated **Save & Process** attempts still use
the stricter automatic criteria, including 98% confidence. They are not the manual
review path. Both backend and frontend deployment are needed for this UI and the
duplicate-message fix; no new migration is required.

Both automatic endpoints require **all three** permissions: purchase-invoice
create, review, and commit-stock. The corresponding Inventory alternatives are
`inventory:po:create`, `inventory:po:update`, and `inventory:transaction:create`.
Reception is allowed with those permissions; each operation is still checked
independently. `GET /pharmacy/purchase-invoices/capabilities` returns effective
actions; the UI disables unauthorized actions and avoids forbidden list requests.
The saved-supplier selector uses branch-scoped `GET /pharmacy/purchase-invoices/suppliers`
and fills the selected name/GSTIN after the operator checks the original.
Invoice reads accept `inventory:po:read`. Existing role and user
permissions are combined without rewriting role records. Original-file storage
requires the additive migration described above.

## Railway deployment

Deploy both backend and frontend for the new endpoints, permission controls and
300-second frontend proxy timeout. With GitHub autodeploy enabled, a push to each
service's connected branch triggers its deployment, subject to watch paths and CI
settings. The repository's backend startup script (`start.sh`) and Docker
entrypoint already run `prisma migrate deploy` when `DATABASE_URL` is set; the
build generates Prisma Client. The new document migration is additive and does
not populate, delete or rewrite existing invoices or stock.

Confirm deployment logs show the document migration completed and the backend
has a working Codex ChatGPT OAuth login. For OAuth authentication, attach a private
backend volume at `/var/lib/clinic-codex` and set `CODEX_HOME` to that path. Codex
refreshes its credentials during use, so its current `auth.json` must survive
restarts and deployments. `start.sh` preserves an existing nonempty auth cache
instead of replacing refreshed credentials with an older bootstrap secret.
`CODEX_AUTH_JSON_B64` or `CODEX_ACCESS_TOKEN` can initialize an empty cache; after
server device login, these bootstrap variables are unnecessary. Keep credentials
out of source control, terminal output, and browser responses. This auth volume
is separate from invoice storage. Do not enable startup seeding for this feature.
No filesystem volume is required for originals because they live in
PostgreSQL. Uploading invoices after deployment intentionally creates original
documents/drafts, and validated processing intentionally changes stock.

`codex login status` and `/pharmacy/agent/status` inspect cached login state;
neither proves that the model accepts the credentials. If extraction fails and a
minimal model request reports HTTP 401 or token-refresh failure, renew the server
login with `codex login --device-auth` using the same `CODEX_HOME`, then verify a
live model request and an extraction-only upload. Do not keep copying a rejected
auth cache into new deployments. A revoked server session still needs a fresh
sign-in even when its cache is persisted correctly.

## Live verification

From the repository root:

```sh
RUN_CODEX_LIVE_TESTS=1 npm test --workspace=backend -- --runInBand pharmacy-purchase-invoice.live.spec
```

This opt-in test generates a synthetic invoice image, invokes the real OAuth model,
and asserts invoice number, quantities, batch, expiry, price, and total. It contains
no mocks. It verifies image processing, inference, JSON parsing, and normalization;
it does not connect to a database or commit stock. Existing deterministic unit tests
for database operations remain separate and are not evidence of live DB behavior.

For dense 20-row and multiple-page coverage, run from the repository root:

```sh
RUN_CODEX_LIVE_TESTS=1 PHARMACY_AGENT_CODEX_PATH="$PWD/node_modules/.bin/codex" \
  node backend/test/purchase-ocr-evaluate.cjs /tmp/purchase-ocr-20
```

The evaluator generates a sideways 20-row JPEG, a complete two-page PDF with 20
rows, and page 2 alone. Fixtures contain synthetic supplier/buyer identities, 16
distinct products in 20 batch rows, leading-zero batches, paid/free quantities,
old/current MRP, varied rates and GST splits. It uses the real image/PDF processing,
both model reads, parsing and normalization with the production timeout defaults.
It asserts every expected field and row order, no blocking flags for the clear
complete fixtures, and an incomplete-document flag with only visible rows for the
missing-page fixture. Per-line GST/total comparisons allow one paisa of rounding;
identifiers, quantities, rates and header totals must match. Results, timings and
exact discrepancies are written to `results.json` in the output directory, and any
failed case makes the process exit nonzero. It never calls database or stock routes.

`PHARMACY_OCR_FIXTURE_MANIFEST` can point to existing `{path, mimetype, expected,
complete}` fixtures instead of generating them; omit `complete` to compare fields
without requiring a flag-free real-world document. `OCR_CASE_FILTER` selects a
filename substring for a targeted rerun. Keep customer images and raw results
outside source control. These are sampled live model checks, not a guarantee that
every photograph is readable. The workbench component regression also checks that
20 extracted rows render and survive an edit/save of the final row; its API is
mocked, so it does not establish live database persistence.

`pharmacy-purchase-invoice.database.spec.ts` exercises real PostgreSQL persistence,
duplicate uploads, concurrent processing, batch increments, transaction rollback
and branch isolation, with only OCR replaced by synthetic extracted data. Opt in
by setting `PURCHASE_AUTOMATION_TEST_DATABASE_URL` to a local PostgreSQL URL. It
creates and removes its own random schema and rejects non-local database hosts.

To test approved local invoice photos, additionally set
`PHARMACY_OCR_FIXTURE_MANIFEST` when running the live test. The manifest is a JSON
array of `{ path, expected: { invoiceNumber, netPayable, items } }`. Customer photos
and extracted records should remain outside the repository. This test performs
external OCR only; it does not save invoices or stock.

## Saving and recovery

Missing descriptive fields and a missing credit due date can be saved as review
issues. Required invoice identity, valid expiry and numeric fields must still be
corrected before server save. Drafts with outstanding issues cannot be reviewed or
committed to stock. Header OCR flags are retained in the existing reconciliation
issue storage and exposed as `ocrFlags` when reading the invoice.

Save Draft updates the current saved invoice; Edit saved draft reopens an
unreviewed invoice for corrections. Updates atomically replace lines and refuse
reviewed, committed, cancelled, or other-branch invoices. Create requests retain an
idempotency key for retries, and successful saves update the list directly.

Unfinished entries are recovered from session storage in the same browser tab,
scoped to the signed-in user and branch. Recovery is separate from a server save;
closing the tab clears that browser backup. Original files are stored on the server,
and unlinked uploads can be found again after reopening the application.
