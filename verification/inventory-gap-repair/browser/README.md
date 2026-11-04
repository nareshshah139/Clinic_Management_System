These proofs exercise the inventory frontend against isolated synthetic invoice state. They do not connect to a clinic database or OCR provider. The fixture binds only to loopback. The browser rejects non-loopback targets and blocks off-origin page requests. Every scenario gets its own synthetic state and temporary Chrome profile, which closes and is removed after the run.

Install repository dependencies and start the frontend at `http://127.0.0.1:3126`. Start the fixture in a separate terminal. From the repository root, after placing this directory at `verification/inventory-gap-repair/browser`, run:

```sh
node verification/inventory-gap-repair/browser/fixture.cjs
```

```sh
CMS_REPO="$PWD" INVENTORY_SKIP_VISUAL=1 node verification/inventory-gap-repair/browser/lists.cjs
CMS_REPO="$PWD" INVENTORY_SKIP_VISUAL=1 node verification/inventory-gap-repair/browser/ocr.cjs
```

`CMS_REPO` defaults to three levels above the harness directory. `INVENTORY_PROOF_OUTPUT` defaults to `output` within the harness directory. `INVENTORY_BASE_URL`, `INVENTORY_FIXTURE_URL`, `INVENTORY_FIXTURE_PORT`, and `CHROME_PATH` override the frontend, synthetic API, fixture port, and Chrome executable. Only HTTP loopback URLs are accepted. The frontend's configured backend is bypassed by browser interception.

Pass scenario names to `ocr.cjs` for a bounded rerun, such as `baseline receipt unknown review-only`. Omit `INVENTORY_SKIP_VISUAL=1` to capture the desktop and phone visual batch. Set `INVENTORY_CONFIRM_VISUAL=1` for the confirmation batch's focused-field visibility assertion. Keep visual review to the planned initial batch and at most one correction confirmation.

Each scenario writes compact result JSON, DOM snapshots and optional screenshots. Result files include requests, performed task actions and observed action/status transitions. Diagnostic viewport changes and focus checks are separate from task interaction counts. Counts measure field replacements and control activations on the direct completion path. Reading, scrolling, individual keystrokes and audit-only inspection are excluded. These are deterministic fixture observations, not elapsed-time benchmarks.

`friction.tsv` compares the ten completed baseline cases with the repaired flow. `coverage.tsv` lists the bounded proof matrix. `source-fingerprints.tsv` identifies the tested frontend source. `report.md` records limits and the visual confirmation. Receipt tests prove UI wording and retention of the receipt link; database quantity effects require the separate backend proof.
