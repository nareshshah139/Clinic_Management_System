# Showcase formal verification to engineers

This runbook takes you through a 60-minute session for engineers. You present a 27-slide deck and run the kit live in a terminal between slides. The audience sees one Quint spec do three jobs on the clinic's own code, and leaves knowing when each job pays off.

- The deck: [One spec, three jobs](https://claude.ai/artifact/AfLEbGtFmeVJC3fkM9MCDG). It is private until you share it from its **Share** menu. Every slide has speaker notes that explain the slide from first principles.
- The kit: this folder. `README.md` describes the files and how to run them.

Every output quoted below was measured on 2026-11-28 with Quint 0.35.0, Apalache 0.62.4 and Node 22.23.5. Line numbers are in `backend/src/modules/pharmacy/pharmacy-partner-sales.service.ts` at commit `bc29d1e`, unless a step names another file.

## The day before

1. Install the kit on the laptop you will present from. You need Node 18 or later and a Java runtime.

   ```bash
   cd verification/quint
   ```

   ```bash
   npm ci
   ```

2. Run the full check on a good network. The first `quint verify` downloads Apalache into `~/.quint`, and later runs work offline.

   ```bash
   npm run check
   ```

   You should see 42 `PASS` lines and no `FAIL` line, in about 2 minutes.

3. If you will run Act 2 against the real service, set up Postgres and the repo's dependencies, then run the service checks.

   ```bash
   (cd ../.. && npm ci && .claude/skills/verify-clinic/scripts/ensure-postgres.sh)
   ```

   ```bash
   SERVICE=1 npm run check
   ```

   This adds about 10 minutes. If Postgres is not available on the day, use the stand-in. The fallbacks table at the end says how.

4. Open the deck and read every slide's speaker notes once. They hold what to say on each slide.
5. Take a screenshot of each live output in this runbook. Use them if the laptop fails.
6. Rehearse once against a timer.

## 30 minutes before

1. Set the terminal font to 18 pt or larger.
2. Open three windows:
   - The deck, in present mode.
   - A terminal at `verification/quint`.
   - An editor with `spec/partnerSale.qnt`, `act2/replay.mjs` and `act3/traces/e2e-partner.json` in tabs.
3. Run the quick check. It skips Apalache and confirms the laptop is ready.

   ```bash
   SKIP_APALACHE=1 npm run check
   ```

4. Generate the Act 2 traces now, so step 4.1 is instant on stage.

   ```bash
   npm run act2:traces
   ```

## Run of show

| Time | Slides | Segment | Live in the terminal | The sentence to land |
| --- | --- | --- | --- | --- |
| 0:00 to 0:05 | 1 to 3 | The problem | `grep -n CANCELLED` | "The status exists, the UI shows it, and nothing writes it." |
| 0:05 to 0:15 | 4 to 8 | First principles | None | "A test checks one run. An invariant is checked after every step of every run." |
| 0:15 to 0:27 | 9 to 12 | Job 1. Design-time model checking | `npm run act1:*` | "The checker found the stock bug before we wrote cancel." |
| 0:27 to 0:40 | 13 to 18 | Job 2. Model-based testing | `npm run act2:*` and one mutant | "200 runs nobody wrote by hand, and every broken guard got caught." |
| 0:40 to 0:46 | 19 to 21 | Job 3. Trace validation | `npm run act3:*` | "A recorded run is either allowed by the spec, or one of them is wrong." |
| 0:46 to 0:51 | 22 to 24 | The same method elsewhere | `npm run ocr:design`, optional | "The method found a gap in code that already ships." |
| 0:51 to 0:55 | 25 to 27 | Close | None | "Same spec, three jobs, three different costs." |
| 0:55 to 1:00 | 27 | Questions | None | |

If you run late, skip step 3.2 and slide 18. Keep all three jobs.

## Step 1. Open with the problem (slides 1 to 3)

1. Show slide 1 and state the promise: one 98-line spec, three jobs, on code we ship.
2. Show slide 2. Run this from the repo root:

   ```bash
   grep -n CANCELLED backend/src/modules/pharmacy/pharmacy-partner-sales.service.ts
   ```

   You should see:

   ```text
   23:  | 'CANCELLED';
   307:          if (sale.status === 'CANCELLED')
   564:      sale.status === 'CANCELLED' ||
   ```

   Line 23 declares the status. Lines 307 and 564 refuse it. `PartnerDailySync.tsx:692` displays it. Nothing writes it.
3. Show slide 3. Explain the count. Each step offers up to 18 choices: a commit with the current or a stale version, a re-match with either version to a batch holding 0 to 5 units, or a cancel with either version and either design. Six steps give up to 34,012,224 sequences. A test checks one of them.

## Step 2. Teach the first principles (slides 4 to 8)

This step has no live commands. It gives the audience the words the rest of the session uses.

1. Slide 4: the state is a few values, and an action is a guard plus an update. Map each line of the pseudo-code to the service: the cancelled check at line 307, the early return at line 325, the version check at line 332, and the take at line 604.
2. Slide 5: the whole lifecycle fits on one slide. Point at the dashed `Cancelled` box.
3. Slide 6: read `stockConserved` out loud. Every unit that left a shelf is held by a live sale. Explain that `deducted` and `returned` are bookkeeping variables the spec adds so the rule can be written down.
4. Slide 7: switch to the editor and show `commitStock` in `spec/partnerSale.qnt` beside the service. Say: "Each action is one service method, including its refusals."
5. Slide 8: name the three ways to search. Simulation samples random runs. Model checking checks every run up to N steps and returns the shortest bad one. An observation fails the run if an expected state is never reached.

## Step 3. Job 1, design-time model checking (slides 9 to 12)

1. Show slides 9 and 10. In the editor, open `cancel(v, compensate)` and `stepOpen`. `compensate` is a `nondet`, so every run tries both answers to "does cancel write committed units back?"
2. Run the simulator:

   ```bash
   npm run act1:open
   ```

   It ends with this output, joined here to fit:

   ```text
   [State 0] { committed: 0, onHand: 5, reply: Ok, status: Submitted, version: 0 }
   [State 1] { committed: 5, onHand: 0, reply: Ok, status: PartialStockCommitted, version: 1 }
   [State 2] { committed: 5, onHand: 0, reply: Ok, status: PartialStockCommitted, version: 2 }
   [State 3] { committed: 5, onHand: 0, reply: Ok, status: PartialStockCommitted, version: 3 }
   [State 4] { committed: 5, onHand: 0, reply: Ok, status: Cancelled, version: 4 }
   [violation] Found an issue (17ms at 235 traces/second).
     ❌ stockConserved
   ```

   State 1 commits 5 units. States 2 and 3 are commit retries against an empty shelf: the version moves and no stock moves. State 4 cancels, and the 5 units are gone.
3. Show slide 11 and run the model checker:

   ```bash
   npm run act1:verify-open
   ```

   Apalache logs scroll for about 6 seconds. The shortest bad run prints at the end, joined here to fit:

   ```text
   [State 0] { committed: 0, deducted: 0, onHand: 5, reply: Ok, returned: 0, status: Submitted, version: 0 }
   [State 1] { committed: 5, deducted: 5, onHand: 0, reply: Ok, returned: 0, status: PartialStockCommitted, version: 1 }
   [State 2] { committed: 5, deducted: 5, onHand: 0, reply: Ok, returned: 0, status: Cancelled, version: 2 }
   [violation] Found an issue (5560ms).
     ❌ stockConserved
   ```

4. Show slide 12. Make the decision out loud: cancel writes committed units back. Show `stepDecided` in the editor, then run:

   ```bash
   npm run act1:decided
   ```

   ```text
   [ok] No violation found (2485ms at 2012 traces/second).
   Checked invariants: stockConserved, committedNeverExceedsSold
   cancelledPartially was observed in 1848 trace(s) out of 5000 explored (36.96%)
   ```

5. Run the model checker on the decided design. It checks every run up to 8 steps.

   ```bash
   npm run act1:verify-decided
   ```

   ```text
   [ok] No violation found (7761ms).
   ```

6. Ask the room: "What if no run ever cancels a part-committed sale? Then the rule passes for free." Run:

   ```bash
   npm run act1:observe
   ```

   ```text
   [State 3] { committed: 5, onHand: 5, reply: Ok, status: PartialStockCommitted, version: 2 }
   [State 4] { committed: 5, onHand: 10, reply: Ok, status: Cancelled, version: 3 }
   [observed] Observed cancelledPartially, which stopped the run (12ms at 83 traces/second).
   ```

7. Point at state 4. Staff re-matched the line to a batch with 5 units, then cancel wrote batch A's 5 units back to that batch, which now shows 10. Say: "This spec is now the ticket for cancel." Name the two open product questions: which batch gets the units back, and whether a fully committed sale may be cancelled.

## Step 4. Job 2, model-based testing (slides 13 to 18)

1. Show slides 13 and 14. Open `act2/traces/t_0.itf.json` and find state 2. Each step names the action and the choices behind it:

   ```json
   "mbt::actionTaken": "commitStock",
   "mbt::nondetPicks": { "available": { "tag": "Some", "value": { "#bigint": "1" } }, "v": { "tag": "Some", "value": { "#bigint": "0" } } }
   ```

   If you skipped the preparation, run `npm run act2:traces` first. It writes 200 files.
2. Show slide 15. Open `act2/replay.mjs`. `specView` reads a spec state into five fields: status, version, committed, onHand and reply. The adapter turns each step into an HTTP call and a 4xx response into `Refused`.
3. Show slide 16 and replay the traces against the real service:

   ```bash
   npm run act2:replay:service
   ```

   ```text
   OK 200 traces, 2400 steps, code matched the spec after every step
   ```

   It takes about 64 seconds, boot included. Without Postgres, run `npm run act2:replay` instead. It drives the in-memory stand-in in under a second and prints the same line. Say which one you ran.
4. Show slide 17. Run one mutant live. `MUTANT` patches the real service source before boot and restores the file on exit.

   ```bash
   MUTANT=no-done-shortcut npm run act2:replay:service
   ```

   ```text
   DIVERGED t_1.itf.json step 8: commitStock(available=1 v=4), reply: spec Ok, code Refused
   ```

   Without the early return at line 325, a stale replay against a finished sale reaches the version check and gets HTTP 409. The browser e2e at `e2e/recovery/scenarios.cjs:225` asserts that this request returns 201. The other mutants print:

   | Mutant | Guard removed | Output |
   | --- | --- | --- |
   | `no-version-check` | Lines 332 and 335 | `DIVERGED t_0.itf.json step 2: commitStock(available=1 v=0), status: spec SUBMITTED, code PARTIAL_STOCK_COMMITTED, version: spec 1, code 2, committed: spec 0, code 3, onHand: spec 3, code 0, reply: spec Refused, code Ok` |
   | `drop-discrepancy` | Line 716 | `DIVERGED t_7.itf.json step 5: commitStock(available=4 v=2), status: spec RECONCILIATION_REQUIRED, code STOCK_COMMITTED` |
   | `no-precheck` | Line 332 only | `OK 200 traces, 2400 steps, code matched the spec after every step` |

5. Show slide 18. Explain the survivor. The `updateMany` claim at line 335 filters on the expected version, so a stale request still updates zero rows and gets a conflict. Say: "A surviving mutant means a second guard covers it, or the spec is not looking. Here it is the first."

## Step 5. Job 3, trace validation (slides 19 to 21)

1. Show slides 19 and 20. Open `act3/traces/e2e-partner.json`. Its five events come from the browser e2e at `e2e/recovery/scenarios.cjs:95-236`.
2. Convert the recording:

   ```bash
   npm run act3:convert
   ```

   Open `act3/recorded.qnt`. Each event became a step plus an `expect` on what the recording saw.
3. Show slide 21 and check both recordings:

   ```bash
   npm run act3:check
   ```

   ```text
   ok e2ePartnerTest passed 1 test(s)
   1) tamperedDoubleDeductTest failed after 1 test(s)
   Error [QNT508]: Expect condition does not hold true
   ```

   Open `act3/traces/tampered-double-deduct.json`. Its last row claims that a stale replay after completion deducted 2 more units. The spec says that request takes nothing.
4. Name the logging gap. Each commit writes a `stock_transactions` row (line 621), but no row records the version or the status, and a refused request writes nothing.

## Step 6. The same method elsewhere (slides 22 to 24)

1. Show slide 22. If time allows, run the design check on the purchase bill spec:

   ```bash
   npm run ocr:design
   ```

   It ends with `❌ postedWhatWasSeen`. A review sent without `expectedUpdatedAt` approves content the reviewer never saw. The check at `pharmacy-purchase-invoice.service.ts:1323` runs only when the field is present. Be exact about who can reach it. The browser always sends the field. Any API client can omit it.
2. Show slide 23. The bill replay matched the real service on 2,400 of 2,400 steps. Ten mutants were caught, and three survived because a second guard covers each. A lost race in `markReviewed` answers 500 instead of 409.
3. Show slide 24. The voice bar replay runs the real `voiceBarReducer`, bundled from `frontend/src/lib/voice-bar.ts`, and matched on 4,000 of 4,000 steps.

## Step 7. Close and take questions (slides 25 to 27)

1. Show slide 25 and read the last column of the table.
2. Show slide 26. Say what the method does not prove before anyone asks.
3. Show slide 27 and leave it up during questions.

## Expected questions

**Why Quint, when the repo already has 14 TLA+ models?** Quint uses the same logic as TLA+, in a syntax close to TypeScript. Its simulator writes traces that name each action and its inputs, which model-based testing needs. `quint test` turns a recording into a check. `quint verify` hands the spec to Apalache.

**Does model-based testing prove the code correct?** No. It checks the runs the spec generated. The `drop-discrepancy` mutant first appears in trace 7, so a rarer bug needs more traces. Mutants and observations measure coverage.

**What about "every sale eventually settles"?** That is a rule about where runs end, not about each state. It needs a temporal property, `quint verify` and fairness assumptions, as in the TLA+ READMEs under `verification/state-machines/`.

**How much work was this?** The spec is 98 lines, the replay driver 53, the service adapter 92 and the converter 16. Writing the spec is most of the thinking.

**Can an AI agent write the spec?** It can draft one. A person still checks each action against the line it cites. Every coded action in these specs names its line for that reason.

## If something goes wrong

| If this happens | Do this |
| --- | --- |
| No network | Every script except `act1:verify-*`, `ocr:*verify` and `voice:verify*` runs offline after `npm ci`. Apalache must already be in `~/.quint`. |
| Apalache is slow or fails | Skip steps 3.3 and 3.5. Show the quoted output in this runbook. |
| `quint verify` prints `Connection dropped` | An earlier Apalache server still holds port 8822. Wait 10 seconds and rerun. |
| A seed prints a different trace | Check that `npx quint --version` prints `0.35.0`. `package-lock.json` pins it. |
| Postgres is not available | Run `npm run act2:replay` and `MUTANT=<name> npm run act2:replay` against the stand-in, and say so. |
| The service replay fails at boot | Read `output/stack/quint-act2/backend.log` in the repo root. |
| You present after 22:00 UTC | A new sale is a late entry and starts in `RECONCILIATION_REQUIRED`. The service adapter stops with that message. Use the stand-in. |
