# CR-31: Stock reconciliation with staff sign-off

Inventory › Stock › Stock counts replaces the old daily count. Every batch in stock is counted once per cycle (10 days by default). The system deals each counter a short list every day, the counter signs off what they found, and stock changes only when a doctor or an administrator approves the difference.

## What the clinic sees

### My counts and the counting sheet

- My counts opens on today's list, then any list left over from an earlier day. Each list shows how many items it has and how many are counted. Today shows "Stock count due today · 20 items" for the person it is assigned to.
- The sheet shows Item (with batch and expiry under the name), Location, System, Counted, Difference and Note. Every Counted field starts empty. Nothing is filled in for the counter, not even the system figure.
- Typing a number shows the difference straight away, in units and rupees: "Matches" in green, "−2 · −₹30.00" in red, "+1 · +₹12.50" in amber.
- Enter and the down arrow move to the next Counted field, the up arrow to the previous one. Enter on the last field moves to Sign off. Opening a list puts the cursor on the first batch not yet counted.
- Counts save as they are typed. A reload or a lost connection keeps what was typed, and the bar at the bottom says "Saved", "Saving…" or "Not saved".
- The system figure is taken when a quantity is entered. A sale an hour later does not make the count wrong.
- Count an item starts a count at any time for the batches someone picks. It follows the same sign-off and approval.

### Sign-off

- Sign off count refuses while anything is uncounted, says how many are left and puts the cursor on the first one. Enter 0 for a batch that is not on the shelf.
- The sign-off dialog says what is being signed ("20 items, 3 differ: net −4 units, −₹612.00"), lists each differing batch with its system and counted figures, and needs a note when anything differs. It names the person signing and says the count is then locked.
- A count with no difference posts at once. The audit rows are written, the ledger baseline is recorded and stock does not move. A count with a difference waits for approval.
- After sign-off the count is a locked record: "Signed by Anil Deshmukh on 07/11/2026, 04:29 pm", the note, and every batch's system, counted and difference figures. Nobody can edit it. Only a fresh count replaces it.

### Approvals

- Approvals lists signed counts with differences: Date, Counted by, Signed at, Items, Differences and Net variance. Today shows "Counts awaiting your approval · −₹612.00" to approvers.
- An approval opens with the differing batches first. A batch that differed in two or more of its last four counts says so, for example "3 of the last 4 counts differed".
- Approve and adjust stock shows each batch's stock now and after, for example "18 now → 17 (−1)", and says when stock has moved since the count. The reason starts as "Physical count signed by Kavya Joshi on 07/11/2026" and can be changed. The difference is added to the stock on record now, so a sale between the count and the approval does not block it.
- Reject needs a typed reason. Stock does not change and the batches go back into the cycle.
- The person who signed a count cannot decide it while another approver is active. The record names who can ("Ask Asha Rao or Rajesh Iyer"). When nobody else is active, the signer decides it after ticking a confirmation, and the record says it was their own count.
- An approval that would take stock below zero is refused in plain words: "the count found 6 fewer than the system had, but only 5 strips are left now. The count cannot be right."

### History and settings

- History lists every count with Date, Assigned to, Signed by, Signed at, Items, Differences, Net variance, Status and Decided by. It filters by period (financial year by default), status and person, and searches item, batch and person names. The footer totals the counts, differences and net value.
- Settings has the on/off switch, Cycle length (1 to 60 days), Items per person per day (1 to 200) and the people who count. Only people with stock reconciliation access are listed.
- The forecast updates as the numbers change: "At 10 per person per day with 2 people, a 10-day cycle covers 200 of 340 batches in stock. Raise items per day to 17 or add 2 people." The current cycle shows its dates, the day, how many batches are counted and the days left.
- When the cycle is short or behind, Today shows "Reconciliation behind: 140 batches not counted this cycle" with the same forecast, to whoever can change the settings. It is a reminder, never a lockout.
- The old Daily stock count, Batches per daily count, Count policy, Approval threshold and negative-variance settings are gone from Reorder › Automation settings, which now points to Stock counts.
- On a phone, History and Approvals are card lists, the counting sheet is one card per batch and the dialogs open as bottom sheets. Nothing scrolls sideways.

## How the cycle is planned

- Settings live in the settings JSON as `reconciliation: { enabled, cycleDays, itemsPerPersonPerDay, assigneeIds, cycleStart }`. Old settings are read on load: `auditEnabled` becomes enabled, `auditDailyCount` becomes items per day and the automation owner becomes the one counter. The old keys are dropped on the next save.
- Each IST clinic day, for each counter without a list for that day, the planner takes in-stock batches that nobody has counted this cycle and that are not on an open list of this cycle. It orders them by the last accepted count (never counted first), then name, and deals them one at a time to each counter up to the daily limit.
- Each list has the request key `cycle:<cycle start>:<day>:<person>`. Reruns, the 30-minute scheduler and concurrent page loads create nothing new.
- A batch is covered once a count of it is signed in the cycle and not rejected. Turning reconciliation on or changing the cycle length starts a new cycle that day.

## Server changes

- `GET /inventory/workspace/reconciliation` returns the cycle, forecast, the signed-in person's open counts, the approval queue and what the person may do.
- `GET /inventory/workspace/reconciliation/counts` lists history (`view=history`) or approvals (`view=approvals`). `GET` and `PATCH .../counts/:id` read a count and save counted quantities. `POST .../sign-off`, `.../approve` and `.../reject` take a request key.
- A sign-off or decision replayed with the same key returns the recorded result. The same key with other figures, or a key already used on another count, gets 409.
- The old submit, approve and post actions refuse counts. The generic document save refuses them too.
- Approvers are the existing inventory approver roles: owner, admin, manager and doctor. Counting needs `pharmacy:compliance:audit`, which pharmacists hold by role.
- No schema change. Counts are `COUNT` workflow documents, and sign-off and decision live in their payload.

## Verification, 07/11/2026

- `scripts/stack/scenarios/cr31-reconciliation.cjs` runs 22 scenarios on the real stack (124 checks), mostly as the seeded pharmacist with the default permission set. All 22 pass.
  - **Planning and settings.** Old daily-count settings read and dropped, round-robin dealing with six concurrent reruns, empty batches left out, rejected batches dealt to the next counter, and the short-cycle forecast with its Today card.
  - **Counting and sign-off.** Counting by keyboard alone with autosave across a reload, zero variance posting at once, the locked record, and a double click signing once.
  - **Approval.** The doctor approving after a sale, rejection uncovering the batches, the admin approving the owner's count, the signer kept off their own count, the sole approver's confirmation, a double click approving once, and an approval refused because the count cannot be right.
  - **Screens and access.** History filters and search, every column visible at 1280 and 1440, five rows at 1280 x 800, cards and bottom sheets at 390 px with no sideways scroll, money on one line, reception getting the access message, and pharmacist, doctor and admin reaching Stock counts.
- The access-roles suite passes 93 of 93 checks.
- Backend: 106 suites and 1406 tests pass in `src`. That includes 16 planner tests, 15 sign-off and approval tests, and the reconciliation database spec (8 tests, `RECONCILIATION_TEST_DATABASE_URL`) on a real schema.
- Frontend: 93 suites and 978 tests pass. Four suites outside inventory timed out under machine load in the parallel run and pass when run alone. Both production TypeScript checks pass.
- The suite found and fixed these before they shipped: history rows took two lines and only two fitted at 1280 x 800, phone tabs broke mid-word, phone card badges were clipped, a summary broke "+" away from "₹520.00", the phone sign-off bar took three rows, and approvers were named in no fixed order.

## Open questions for the clinic

- Should everything be counted every 10 days, or fast-moving and high-value items more often and the rest on a longer cycle?
- Counting is a reminder on Today. Should a counter be stopped from billing until their count is signed off?
- Managers can approve counts, as they approve other inventory documents. Should count differences be for doctors and administrators only?
- The counting sheet shows the system quantity, as CR-31 asks. A blind count, hiding it until sign-off, catches more errors. Is that wanted?
