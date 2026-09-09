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
- `PHARMACY_AGENT_CODEX_TIMEOUT_MS`: extraction timeout (default: 120 seconds).

Images and rendered PDF pages are staged in a private temporary directory and
removed after success or failure. Login, process, timeout, and malformed-output
failures return errors rather than synthetic results. Extracted values still need
review; stock changes occur only through the existing explicit commit operation.
Excel import and manual stock approvals use application/database logic, not LLMs.

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
closing the tab clears that browser backup. No schema migration is required.
