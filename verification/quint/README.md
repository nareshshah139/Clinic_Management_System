# Quint on the clinic repo

This kit shows one 98-line Quint spec doing three jobs on the partner daily sale (`PartnerDailySaleStatus`):

1. It finds a design bug before any code exists.
2. It tests the coded state machine with 200 generated runs, against the real NestJS service on Postgres.
3. It checks a recorded browser run against the spec.

Each job points the same spec at a different thing: nothing yet, the coded service, or a recording. The three jobs are design-time model checking, model-based testing and trace validation.

The partner daily sale is the one pharmacy lifecycle with no model in the TLA+ suite under `verification/state-machines/`. Half of it is coded: `commitStock` and `reconcileLine`. The other half is not. `CANCELLED` is in the enum, two guards refuse it, and `PartnerDailySync.tsx` renders it, but no backend code writes it.

Every line number below is in `backend/src/modules/pharmacy/pharmacy-partner-sales.service.ts` at commit `bc29d1e`, unless the line says otherwise.

## Run it

You need Node 18 or later and a Java runtime, because Apalache runs on the JVM. The kit was measured on Node 22.23.5 with Quint 0.35.0 and Apalache 0.62.4.

```bash
cd verification/quint
```

```bash
npm ci
```

```bash
npm run check
```

`npm run check` runs every act of the demo and both extra subjects. It asserts the outcome this script expects: a violation where the script expects one, and a pass where it expects a pass. It takes about 2 minutes, most of it in Apalache. `SKIP_APALACHE=1` skips `quint verify`. The first `quint verify` downloads Apalache into `~/.quint`, so run the check once on a good network.

To also replay Act 2 against the real service and its mutants, start Postgres and install the repo's dependencies first:

```bash
(cd ../.. && npm ci && .claude/skills/verify-clinic/scripts/ensure-postgres.sh)
```

```bash
SERVICE=1 npm run check
```

`SERVICE=1` adds the partner sale and purchase bill replays against the real services, with every mutant patched into the real source and restored afterwards. It adds about 10 minutes.

## Split it into its own repository

The kit is a self-contained npm package. To publish it as a separate repository with its history, run this from the clinic repo root, then push the new branch to an empty repository:

```bash
git subtree split --prefix=verification/quint -b clinic-quint-demo
```

On its own, every Act 1, Act 2 stand-in and Act 3 script works, along with the OCR spec and its stand-in replay. Three replays read clinic source: the voice replay, and both service replays. Point them at a clinic checkout:

```bash
CLINIC_REPO=/path/to/Clinic_Management_System npm run check
```

Without `CLINIC_REPO`, `npm run check` skips the voice replay and says so.

## Files

| File | Lines | Job |
| --- | --- | --- |
| `spec/partnerSale.qnt` | 98 | The spec. Each coded action cites its service line. |
| `act2/replay.mjs` | 53 | Replays generated traces and compares state after every step. |
| `act2/partnerSaleStandIn.mjs` | 47 | In-memory port of `commitStock` and `reconcileLine`, with mutants. |
| `act2/serviceAdapter.mjs` | 92 | Drives the real API on an isolated Postgres schema, with mutants patched into the real source. |
| `act3/convert.mjs` | 16 | Turns a recorded run into a `quint test` run. |
| `act3/traces/*.json` | | The e2e recording and a tampered copy. |
| `check.sh` | | The rehearsal check behind `npm run check`. |
| `clinic.mjs` | | Finds the clinic checkout for the replays that read its source. |
| `spec/purchaseBill.qnt`, `extras/ocr/` | 117 | The scanned purchase bill subject. See [the OCR README](extras/ocr/README.md). |
| `spec/voiceBar.qnt`, `extras/voice/` | 122 | The voice bar subject. See [the voice README](extras/voice/README.md). |

## Present it

[`SHOWCASE.md`](SHOWCASE.md) is the step-by-step runbook for a 60-minute session: preparation, the run of show, each live command with its measured output, the expected questions and the fallbacks. It follows the slide deck [One spec, three jobs](https://claude.ai/artifact/AfLEbGtFmeVJC3fkM9MCDG), which explains the problem and the method from first principles in its speaker notes.

## What was measured

Every output quoted here and in `SHOWCASE.md` came from this kit on 2026-11-28, with Quint 0.35.0, Apalache 0.62.4 and Node 22.23.5. Act 2 ran against the NestJS service at `bc29d1e` on PostgreSQL 16, and against the stand-in. Both gave identical results for all four mutants. `npm run check` and `SERVICE=1 npm run check` reproduce each claim.

The spec makes four simplifications the audience may ask about.

1. The spec has one sale with one line of 7 units.
2. `onHand` is the available units in the batch the line draws from. Held stock is folded in, so batch B shows 4, not 5.
3. Late entries, their `LATE_ENTRY` flag and the `UNMATCHED_BATCH` path are left out. With one line and one candidate batch, a short commit always carries `INSUFFICIENT_STOCK`.
4. The decided cancel writes units back to the current batch. That is an open product question, not a finding.

## Two more subjects: scanned bills and the voice bar

The kit has two more specs that use the same three jobs. Neither lifecycle has a model in the TLA+ suite. Use them for a longer session, or to answer "does this only work on one service?"

### Scanned purchase bill (OCR intake)

`spec/purchaseBill.qnt` models `PharmacyPurchaseInvoiceStatus` for one bill: edit, review, reopen, reject, commit and the OCR `process` path. Lines below are in `backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts`.

- `ocr:run` and `ocr:verify` show that stock posts at most once, that a cancelled bill never posts, and that `STOCK_COMMITTED` agrees with `stockCommittedAt`.
- `ocr:replay:service` replays 200 traces against the real service on Postgres and matches after all 2,400 steps. Ten guard mutants diverge at a named step. Three survive, and each one removes half of a redundant pair of guards.
- `ocr:design` is a design-time finding about code that already exists. A review that omits `expectedUpdatedAt` approves content the reviewer never saw. The field is optional in `ReviewPharmacyPurchaseInvoiceDto` (`dto/pharmacy-purchase-invoice.dto.ts:607`). The stale check at line 1323 runs only when the field is present. `ocr:design-verify` finds the shortest bad run in 3 steps: an edit, a review without the revision, then a commit. A one-off probe on the real service posted 15 units after the reviewer had seen 12.
- Who can reach it: the browser cannot, because `PurchaseInvoiceWorkbench.tsx:2584` and `:3052` always send the field. Any API client can. By reading the code, not by running it, the pharmacy agent's `review_purchase_invoice` action can too (`pharmacy-agent.service.ts:1539-1545`). `ocr:client` shows the rule holds when every review sends the revision.
- A second finding came from the replay probe. A lost race inside `markReviewed` answers HTTP 500, not 409. Line 1357 uses `update` with a non-unique `where`, and Prisma's P2025 reaches the exception filter as a 500.

### Voice bar

`spec/voiceBar.qnt` models `voiceBarReducer` in `frontend/src/lib/voice-bar.ts`: the draft, applied and confirming states that the TLA+ dictation model leaves out.

- Act 2 here runs the real reducer, not a stand-in. `extras/voice/replay.mjs` bundles `voice-bar.ts` with esbuild in memory and replays 200 traces, 4,000 steps, with a match after every step.
- `draftIsLatest` says a stale transcription answer never lands. `ownerIsActive` says a draft never outlives its page (`@cc voice-bar-draft-bound-to-scope`). Both hold in `voice:run` and `voice:verify`.
- Three mutants, each patched into the source text in memory, diverge: the attempt check at line 121, the registration check at line 149, and the page-change reset at line 104.
- No guard is broken. One product question came out of the work: `send` and `listen` replace an applied draft and its live Undo, and a user can reach this from the bar. It breaks no `@cc` rule. The details are in [the voice README](extras/voice/README.md).
