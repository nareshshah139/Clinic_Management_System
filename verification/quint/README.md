# Quint on the clinic repo: 1-hour demo

In 60 minutes, developers watch one 98-line Quint spec do three jobs on the partner daily sale (`PartnerDailySaleStatus`):

1. It finds a design bug before any code exists.
2. It tests the coded state machine with 200 generated runs, against the real NestJS service on Postgres.
3. It checks a recorded browser run against the spec.

Each act points the same spec at a different thing: nothing yet, the coded service, or a recording. The audience leaves with three names and when each one pays off. The names are design-time model checking, model-based testing and trace validation.

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

`npm run check` runs every act and asserts the outcome this script expects: a violation where the script expects one, and a pass where it expects a pass. It takes about 22 seconds. The first `quint verify` downloads Apalache into `~/.quint`, so run the check once on a good network.

To also replay Act 2 against the real service and its mutants, start Postgres and install the repo's dependencies first:

```bash
(cd ../.. && npm ci && .claude/skills/verify-clinic/scripts/ensure-postgres.sh)
```

```bash
SERVICE=1 npm run check
```

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

## Run of show

The three acts take 40 of the 60 minutes. Each act ends on one sentence the audience should repeat later.

| Time | Segment | On screen | The sentence to land |
| --- | --- | --- | --- |
| 0:00 to 0:05 | Hook | The partner sales screen, then `grep -n CANCELLED` on the service | "The status exists, the UI shows it, and nothing writes it." |
| 0:05 to 0:10 | The spec in five minutes | `spec/partnerSale.qnt` beside the service | "Each action is one service method, including its refusals." |
| 0:10 to 0:25 | Act 1. Spec before code | `npm run act1:*` | "The checker found the stock bug before we wrote cancel." |
| 0:25 to 0:40 | Act 2. Model-based testing | `npm run act2:*`, then the mutants | "200 runs nobody wrote by hand, and every broken guard got caught." |
| 0:40 to 0:50 | Act 3. Trace validation | `npm run act3:*` | "A recorded run is either allowed by the spec, or one of them is wrong." |
| 0:50 to 0:55 | When to use which | The table in the close | "Same spec, three jobs, three different costs." |
| 0:55 to 1:00 | Questions | The expected questions below | |

Keep three windows open:

- An editor with `spec/partnerSale.qnt`, `act2/replay.mjs` and `act3/traces/e2e-partner.json` in tabs.
- A terminal at `verification/quint`.
- The GitHub view of the service at commit `bc29d1e`.

## Hook

Run this from the repo root:

```bash
grep -n CANCELLED backend/src/modules/pharmacy/pharmacy-partner-sales.service.ts
```

```text
23:  | 'CANCELLED';
307:          if (sale.status === 'CANCELLED')
564:      sale.status === 'CANCELLED' ||
```

Line 23 declares it. Line 307 refuses a commit and line 564 refuses a re-match. Nothing assigns it.

## Act 1. Spec before code (0:10 to 0:25)

The checker finds that cancel, as nobody has designed it yet, can lose 5 units of stock. The audience sees the bug, a decision that fixes it, and a pass that means something.

1. Frame the gap. Say: "Cancel is in the enum, the screen renders it, two guards refuse it. Nobody wrote it. Before we write it, we write down what it must never break."
2. Open `cancel(v, compensate)` in the spec. `compensate` is a `nondet` in `stepOpen`, so the checker tries both answers to "does cancel write committed units back?"
3. Read `stockConserved` out loud: every unit that left a shelf is held by a live sale.
4. Run the simulator with `npm run act1:open`. It ends with this output, joined here to fit:

   ```text
   [State 0] { committed: 0, onHand: 5, reply: Ok, status: Submitted, version: 0 }
   [State 1] { committed: 5, onHand: 0, reply: Ok, status: PartialStockCommitted, version: 1 }
   [State 2] { committed: 5, onHand: 0, reply: Ok, status: PartialStockCommitted, version: 2 }
   [State 3] { committed: 5, onHand: 0, reply: Ok, status: PartialStockCommitted, version: 3 }
   [State 4] { committed: 5, onHand: 0, reply: Ok, status: Cancelled, version: 4 }
   [violation] Found an issue (17ms at 235 traces/second).
     ❌ stockConserved
   ```

   Point at state 1, where the first commit takes 5 units. States 2 and 3 are commit retries against an empty shelf. The version moves and no stock moves, which is what line 335 does today. State 4 cancels the sale, and the 5 units are gone.
5. Run the model checker with `npm run act1:verify-open`. It takes about 6 seconds. Apalache logs scroll first. The shortest bad run, 3 states long, prints at the end:

   ```text
   [State 0] { committed: 0, deducted: 0, onHand: 5, reply: Ok, returned: 0, status: Submitted, version: 0 }
   [State 1] { committed: 5, deducted: 5, onHand: 0, reply: Ok, returned: 0, status: PartialStockCommitted, version: 1 }
   [State 2] { committed: 5, deducted: 5, onHand: 0, reply: Ok, returned: 0, status: Cancelled, version: 2 }
   [violation] Found an issue (5560ms).
     ❌ stockConserved
   ```

   Say: "The simulator samples runs. `quint verify` hands the spec to Apalache, which checks every run up to 6 steps and gives you the shortest one."
6. Make the decision. Say: "Cancel writes committed units back." Show `stepDecided`, which calls `cancel(v, true)`. Run `npm run act1:decided`:

   ```text
   [ok] No violation found (2485ms at 2012 traces/second).
   Checked invariants: stockConserved, committedNeverExceedsSold
   cancelledPartially was observed in 1848 trace(s) out of 5000 explored (36.96%)
   ```

   Then run `npm run act1:verify-decided`, which checks every run up to 8 steps:

   ```text
   [ok] No violation found (7761ms).
   ```

7. Prove the pass is not empty. Ask the room: "What if no run ever cancels a part-committed sale? Then the rule passes for free." Run `npm run act1:observe`:

   ```text
   [State 3] { committed: 5, onHand: 5, reply: Ok, status: PartialStockCommitted, version: 2 }
   [State 4] { committed: 5, onHand: 10, reply: Ok, status: Cancelled, version: 3 }
   [observed] Observed cancelledPartially, which stopped the run (12ms at 83 traces/second).
   ```

   Say: "An observation is a state we expect to reach. Quint fails the run if it never gets there."
8. Hand off. Say: "This spec is now the ticket for cancel." Point at state 4 above. In state 3 staff re-matched the line to a batch with 5 units. Then cancel wrote the 5 units from batch A back to that batch, which now shows 10. The spec makes the open product question visible. Which batch gets the units back, the first batch or the re-matched one? The second open question is whether a fully committed sale can be cancelled. The spec refuses it today.

If you are short of time, skip step 4 and go straight to step 5.

## Act 2. Model-based testing (0:25 to 0:40)

The spec generates 200 runs with 2,400 steps. Each run drives the coded state machine, and the driver compares state after every step. Then you break one guard at a time, and the replay names the first step where code and spec disagree.

1. Frame it. Say: "Now the half that exists. Does the code do what the spec says, in runs nobody wrote by hand?"
2. Open `stepCoded`. It offers only `commitStock` and `matchBatch`. It picks the expected version from the current version or the one before it, so stale retries happen.
3. Point at `type Reply = Ok | Refused`. Say: "A refusal the spec does not model is a refusal the tests never check."
4. Run `npm run act2:traces`. It writes 200 files to `act2/traces/`. Open `t_0.itf.json` and find state 2. Each step names the action and the choices behind it:

   ```json
   "mbt::actionTaken": "commitStock",
   "mbt::nondetPicks": { "available": { "tag": "Some", "value": { "#bigint": "1" } }, "v": { "tag": "Some", "value": { "#bigint": "0" } } }
   ```

5. Open `act2/replay.mjs`. `specView` reads a spec state into the same five fields the code reports: status, version, committed, onHand and reply. Each adapter maps an action to a call and turns a refusal into `Refused`.
6. Run the replay against the real service with `npm run act2:replay:service`. It boots the API alone on a fresh Postgres schema. For each trace it creates a partner, a sale of 7 units and a batch, then sends `commit-stock` and `reconcile` over HTTP:

   ```text
   OK 200 traces, 2400 steps, code matched the spec after every step
   ```

   It takes about 64 seconds, boot included. Without Postgres, `npm run act2:replay` runs the same traces against the in-memory stand-in in under a second, with the same result.
7. Break the code, one guard at a time. With `act2:replay:service`, `MUTANT` patches the real service source before boot and restores the file on exit. With `act2:replay`, it switches a guard off in the stand-in. Both print the same lines:

   | Command | Guard removed | What the replay prints |
   | --- | --- | --- |
   | `MUTANT=no-version-check npm run act2:replay:service` | The `expectedVersion` check at line 332 and the version in the claim at line 335 | `DIVERGED t_0.itf.json step 2: commitStock(available=1 v=0), status: spec SUBMITTED, code PARTIAL_STOCK_COMMITTED, version: spec 1, code 2, committed: spec 0, code 3, onHand: spec 3, code 0, reply: spec Refused, code Ok` |
   | `MUTANT=no-done-shortcut npm run act2:replay:service` | The early return for a fully committed sale at line 325 | `DIVERGED t_1.itf.json step 8: commitStock(available=1 v=4), reply: spec Ok, code Refused` |
   | `MUTANT=drop-discrepancy npm run act2:replay:service` | The `RECONCILIATION_REQUIRED` branch in `deriveCommittedStatus` at line 716 | `DIVERGED t_7.itf.json step 5: commitStock(available=4 v=2), status: spec RECONCILIATION_REQUIRED, code STOCK_COMMITTED` |
   | `MUTANT=no-precheck npm run act2:replay:service` | Only the check at line 332 | `OK 200 traces, 2400 steps, code matched the spec after every step` |

   Read the second row. A stale replay after completion should get the finished sale back. Without the shortcut it reaches the version check and gets HTTP 409. The e2e at `e2e/recovery/scenarios.cjs:225` asserts that very request returns 201.

   Then read the last row. That mutant survives, and the survival is correct. The `updateMany` claim at line 335 still filters on the version, so a stale request still gets a conflict. Say: "A surviving mutant means a second guard covers it, or the spec is not looking. Here it is the first one."

   The third row first shows up in trace 7 of 200. Say: "Random runs find common bugs fast and rare ones more slowly. The trace count is a coverage dial, and observations from Act 1 measure it."
8. Compare with what the repo already has. The TLA+ suite replays one shortest counterexample per broken rule. Model-based testing also drives the ordinary paths, hundreds of times, through the same code.

## Act 3. Trace validation (0:40 to 0:50)

A recorded run of the real app passes the spec, and the same run with one edited row fails. The audience sees that a recording is a test input the spec can judge.

1. Frame it. Say: "Third job. You already record real runs, in e2e tests and in the stock ledger. Is each one a run the spec allows?"
2. Open `act3/traces/e2e-partner.json`. Its five events come from the browser e2e at `e2e/recovery/scenarios.cjs:95-236`.
   1. The first commit takes 5 of 7 units from batch A.
   2. Staff re-match the line to batch B, which has 5 in stock and 1 held, so 4 are available.
   3. A commit with the old version gets HTTP 409.
   4. The retry commits the last 2 units.
   5. A replay with the old version after completion gets HTTP 201 and deducts nothing.
3. Run `npm run act3:convert`, then open `act3/recorded.qnt`. The converter turned each event into a step plus a check on what was seen:

   ```quint
   run e2ePartnerTest =
     init.expect(onHand == 5)
     .then(commitStock(0)).expect(reply == Ok and committed == 5 and onHand == 0 and version == 1)
     .then(matchBatch(1, 4)).expect(reply == Ok and version == 2)
     .then(commitStock(1)).expect(reply == Refused and onHand == 4)
     .then(commitStock(2)).expect(reply == Ok and committed == 7 and onHand == 2)
     .then(commitStock(1)).expect(reply == Ok and onHand == 2)
   ```

4. Run `npm run act3:check`:

   ```text
   ok e2ePartnerTest passed 1 test(s)
   1) tamperedDoubleDeductTest failed after 1 test(s)
   Error [QNT508]: Expect condition does not hold true
   ```

   Open `act3/traces/tampered-double-deduct.json`. Its last row claims that a replay with the old version deducted 2 more units. Say: "The spec says that request gets nothing. So the code has a bug, or the log is wrong. Both are worth a ticket."
5. Point at production. Each commit writes a `stock_transactions` row with `reference = 'PARTNER-SALE-<id>'` and `previousCommittedQuantity` in its metadata (line 621). The same converter can read an export of those rows. Then name the gap. A commit writes no audit row with the version or the status, and a refused request writes nothing at all. Say: "Trace validation tells you what your logs are missing."

## Close (0:50 to 0:55)

One spec did three jobs, and each job has its own cost and its own kind of bug. Put this table on screen and read the last column.

| Technique | Use it when | Extra code in this kit | What it caught today |
| --- | --- | --- | --- |
| Design-time model checking | The transition is not coded yet | None beyond the spec | Cancel loses 5 units unless it writes stock back |
| Model-based testing | The code exists | A 53-line driver and a 92-line service adapter | Three removed guards in the real service, each at a named step |
| Trace validation | You have recordings of real runs | A 16-line converter | A log row the spec says cannot happen |

## Expected questions

**Why Quint, when the repo already has 14 TLA+ models?** Quint uses the same logic as TLA+, in a syntax close to TypeScript. Its simulator writes traces that name each action and its inputs, which model-based testing needs. Its `run` and `quint test` turn a recording into a check. `quint verify` hands the spec to Apalache, as Act 1 showed.

**Does model-based testing prove the code correct?** No. It checks the runs the spec generated. The `drop-discrepancy` mutant first appears in trace 7. A rarer bug needs more traces. Observations and the trace count are how you measure coverage.

**What about "every sale eventually settles"?** `quint run` checks invariants, which are rules about each state. A rule about where runs end up needs a temporal property, `quint verify` and fairness assumptions, as in the TLA+ READMEs.

**How much work was this?** The spec is 98 lines. The driver is 53 lines, the stand-in 47, the service adapter 92 and the converter 16. Writing the spec is most of the thinking.

**Can an AI agent write the spec?** It can draft one. Someone still checks each action against the service method it claims to model. Here, every coded action names its line in the service.

## Fallbacks

| If this happens | Do this |
| --- | --- |
| No network | Every `act1`, `act2` and `act3` script except `act1:verify-*` uses `--backend=typescript` and runs offline after `npm ci`. `quint verify` needs Apalache cached in `~/.quint`. |
| Apalache is slow or fails | Skip steps 5 and 6 of Act 1 and show the quoted output here. `SKIP_APALACHE=1 npm run check` checks the rest. |
| A seed prints a different trace | Check that `npx quint --version` prints `0.35.0`. `package-lock.json` pins it. |
| Postgres is not available | Run `npm run act2:replay` against the stand-in and say so. |
| The service replay fails at boot | Read `output/stack/quint-act2/backend.log` in the repo root. |
| You run the service replay after 22:00 UTC | The new sale is a late entry and starts in `RECONCILIATION_REQUIRED`. The adapter stops with that message. Run it earlier, or use the stand-in. |
| You are running late | Drop Act 1 step 4 and Act 2 step 8. Keep all three acts. |

## What was measured

Every output quoted here came from this kit on 2026-11-28, with Quint 0.35.0, Apalache 0.62.4 and Node 22.23.5. Act 2 ran against the NestJS service at `bc29d1e` on PostgreSQL 16, and against the stand-in. Both gave identical results for all four mutants. `npm run check` and `SERVICE=1 npm run check` reproduce each claim.

The spec makes four simplifications the audience may ask about.

1. The spec has one sale with one line of 7 units.
2. `onHand` is the available units in the batch the line draws from. Held stock is folded in, so batch B shows 4, not 5.
3. Late entries, their `LATE_ENTRY` flag and the `UNMATCHED_BATCH` path are left out. With one line and one candidate batch, a short commit always carries `INSUFFICIENT_STOCK`.
4. The decided cancel writes units back to the current batch. That is an open product question, not a finding.
