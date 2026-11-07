# CR-31: Stock reconciliation with staff sign-off

Inventory › Stock › Stock counts replaces the old daily count. Every batch in stock is counted once per cycle (10 days by default). The system deals each counter a short list every day, the counter signs off what they found, and stock changes only when a doctor or an administrator approves the difference.

## What the clinic sees

### My counts and the counting sheet

- My counts opens on today's list, then any list left over from an earlier day. Each list shows how many items it has and how many are counted. Today shows "Stock count due today" with the number of batches still to count to the person it is assigned to. With one list due, the card opens it directly.
- An approver with nothing to count lands on Approvals when counts are waiting.
- The sheet shows Item (with batch and expiry under the name), Location, System, Counted, Difference and Note. Every Counted field starts empty. Nothing is filled in for the counter, not even the system figure.
- Typing a number shows the difference straight away, in units and rupees: "Matches" in green, "−2 · −₹30.00" in red, "+1 · +₹12.50" in amber. Screen readers hear the difference as the field's description.
- The note box opens on a row that differs. Other rows show "+ Note".
- Enter and the down arrow move to the next Counted field, the up arrow to the previous one. Enter on the last field moves to Sign off. Opening a list puts the cursor on the first batch not yet counted.
- Counts save as they are typed. A reload or a lost connection keeps what was typed, and the bar at the bottom says "Saved", "Saving…" (only while a save is on its way) or "Not saved". The bar also says what is short and what is extra, on a phone too.
- The system figure is taken when a quantity is entered. A sale an hour later does not make the count wrong.
- Count an item starts a count at any time. It follows the same sign-off and approval. It has two ways to pick:
  - Item or batch. The search matches item name, batch or rack, finds batches at zero stock so a found box can be recorded, and says "Showing 20 of 57" when it shows fewer than it found. A matching rack is offered as "Count shelf Rack A2 · 14 batches".
  - Shelf / location. Every batch in stock on the shelf is listed and ticked, with "Select all".
  - A batch already on someone's unsigned or unapproved count cannot be ticked. It says whose count it is on and from which day.

### Sign-off

- Sign off count refuses while anything is uncounted, says how many are left and puts the cursor on the first one. Enter 0 for a batch that is not on the shelf.
- The sign-off dialog says what is being signed ("20 items, 3 differ · Short −5 (−₹662.00) · Extra +1 (+₹50.00)"), lists each differing batch with its system and counted figures, and needs a note when anything differs. It names the person signing and says the count is then locked.
- Shortages and surpluses are always shown apart, never only as a net, because one can hide the other. Money has a true minus sign, a plus for a surplus, and the same red and amber as the difference.
- A count with no difference posts at once. The audit rows are written, the ledger baseline is recorded and stock does not move. A count with a difference waits for approval.
- After sign-off the count is a locked record: "Signed by Anil Deshmukh on 07/11/2026, 04:29 pm", the note, and every batch's system, counted and difference figures. Nobody can edit it. Only a fresh count replaces it.

### Approvals

- Approvals lists signed counts with differences: Date (as "07 Nov"), Counted by, Signed at, Items, Differences, Short ₹, Net ₹ and a Review button. Phone cards carry a chevron. Today shows "Counts awaiting your approval" with "Short −₹662.00 · Extra +₹50.00" to approvers.
- An approval opens with the differing batches first. A batch that differed in two or more of its last four counts says so, for example "3 of the last 4 counts differed".
- Approve and Reject sit in a bar fixed to the bottom of the screen, under the lines, with the short and extra figures.
- Approve and adjust stock shows each batch's stock now and after, for example "18 now → 17", with its difference and value, and says when stock has moved since the count. Above the reason it says "Stock value changes by −₹5.00". The reason starts as "Physical count signed by Kavya Joshi on 07/11/2026" and can be changed. Each difference is applied to today's stock, so sales made since the count are kept.
- Reject names what it rejects ("Rejecting 4 batches, short −₹17.50, extra +₹12.50") and needs a typed reason. Stock does not change and the batches go back into the cycle.
- Count differences are decided by a doctor, the owner or an admin. Managers approve other inventory documents but not counts.
- The person who signed a count cannot decide it while another approver is active. The record names who can ("Ask Asha Rao or Rajesh Iyer"). When nobody else is active, the signer decides it after ticking a confirmation, and the record and History say it was their own count.
- After signing, the locked record offers "Next count" when the person has another list waiting.
- An approval that would take stock below zero is refused in plain words: "the count found 6 fewer than the system had, but only 5 strips are left now. The count cannot be right."

### History and settings

- History lists every count with Date, Counted by, Signed at, Items, Differences, Short ₹, Net ₹, Status and Decided by ("Own count" when the approver signed it). Only the person a count is assigned to can sign it, so one Counted by column replaces Assigned to and Signed by, and every column fits at 1280. It filters by period (financial year by default), status and person, and searches item, batch and person names. The footer reads "12 counts · Approved −₹102.50 · Awaiting −₹210.00" with "2 rejected counts are not included." under it. On a phone it shows the counts and the awaiting value.
- A count with no difference shows as "Confirmed, no differences" on the record and "Confirmed" in the list.
- Settings has the on/off switch, Cycle length (1 to 60 days), Items per person per day (1 to 200) and the people who count. Only people with stock reconciliation access are listed.
- A save keeps the current cycle and what it has counted. Only turning reconciliation on or changing the cycle length starts a new cycle, and then the screen warns before saving: "Saving starts a new cycle today. The 120 batches counted in this cycle will be counted again. Counts not yet signed or approved stay with the people counting them."
- The forecast plans only with people who can still count. Someone deactivated or without access counts nothing, and their unsigned counts go back to the cycle.
- The forecast updates as the numbers change: "At 10 per person per day with 2 people, a 10-day cycle covers 200 of 340 batches in stock. Raise items per day to 17 or add 2 people." The current cycle shows its dates, the day, how many batches are counted and the days left.
- When the cycle is short or behind, Today shows "Batches not counted this cycle" with the number and the same forecast, to whoever can change the settings. It is a reminder, never a lockout.
- People without access to stock counts do not see the Stock counts task. A direct link explains that they have no access.
- The old Daily stock count, Batches per daily count, Count policy, Approval threshold and negative-variance settings are gone from Reorder › Automation settings, which now points to Stock counts.
- On a phone, History and Approvals are card lists, the counting sheet is one card per batch and the dialogs open as bottom sheets. The tabs wrap into two rows so every label and badge is whole. Nothing scrolls sideways.

## How the cycle is planned

- Settings live in the settings JSON as `reconciliation: { enabled, cycleDays, itemsPerPersonPerDay, assigneeIds, cycleStart }`. Old settings are read on load: `auditEnabled` becomes enabled, `auditDailyCount` becomes items per day and the automation owner becomes the one counter. The old keys are dropped on the next save.
- Each IST clinic day, for each counter without a list for that day, the planner takes in-stock batches that nobody has counted this cycle and that are not on any unsigned or unapproved count, whatever its cycle or origin. It orders them by the sign-off time of the last accepted count (never counted first), then name, and deals them one at a time to each counter. Each counter gets the daily limit less the cycle lines they still have open, never more.
- Planning runs once per branch per IST day and settings revision, not on every page load. It reads only the count dates from item metadata. If planning fails, the failure is logged and Today and Stock counts still load.
- Each list has the request key `cycle:<cycle start>:<day>:<person>`. Reruns, the 30-minute scheduler and concurrent page loads create nothing new.
- A batch is covered once a count of it is signed in the cycle and not rejected. Turning reconciliation on or changing the cycle length starts a new cycle that day.

## One open count per batch

Before this round, two counts of one batch could both be approved. With 100 on record and 90 on the shelf, two counts of 90 left 80. That happened at a cycle boundary, after a mid-day restart, with an on-demand count of a batch already on a list, and with a recount of a signed count.

- A batch is on at most one count that is not yet decided. Starting a count, a shelf count, "Count this batch" or a recount on such a batch is refused, naming the count: "Adapalene Gel 15g, batch B-1, is already on Anil Deshmukh's count of 02/11/2026, not signed yet. Count it there, or ask Anil Deshmukh to sign it off first." We chose refusal over letting a new sign-off replace the older one, because replacing would quietly discard a signed record and two people would count the same shelf. "Count everything matching" on the Stock list leaves those batches out.
- Each counted line records when its system figure was taken. A sign-off whose figure is older than the batch's last posted count asks for that count to be typed again. So does a count saved before this round, which has no time. My counts says "1 to type again" and the field says "Type it again (was 8)".
- Approval refuses with 409 when the batch was counted and posted after this count was taken: "…was counted again after this count and that count is already in the stock. Approving this one would apply the difference twice. Reject it instead."
- A count can be cancelled only while unsigned, by the person it is assigned to or by a doctor, owner or admin.
- Request keys starting with "cycle:" are kept for planned counts.

## Server changes

- `GET /inventory/workspace/reconciliation` returns the cycle, forecast, the signed-in person's open counts, the approval queue and what the person may do.
- `GET /inventory/workspace/reconciliation/counts` lists history (`view=history`) or approvals (`view=approvals`). `GET` and `PATCH .../counts/:id` read a count and save counted quantities. `POST .../sign-off`, `.../approve` and `.../reject` take a request key.
- A sign-off or decision replayed with the same key returns the recorded result. The same key with other figures, or a key already used on another count, gets 409.
- The old submit, approve and post actions refuse counts. The generic document save refuses them too.
- `GET /inventory/workspace/reconciliation/batches` lists shelves with their in-stock batch counts, every in-stock batch on a shelf (`location`), or the first 20 batches matching `q` with the total. Each batch carries the open count it is on.
- Count approvers are `COUNT_APPROVERS` (owner, admin, doctor), separate from the inventory approvers used for other documents. Counting needs `pharmacy:compliance:audit`, which pharmacists hold by role.
- No schema change. Counts are `COUNT` workflow documents, and sign-off and decision live in their payload. Lines gain `capturedAt`. Posting writes `lastSignedCountAt` into item metadata.

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

- Batches at zero stock are not dealt in the cycle. They can be counted on demand when a box turns up. Should the cycle count them too?
- Should everything be counted every 10 days, or fast-moving and high-value items on a shorter cycle and the rest on a longer one?
- Counting is a reminder on Today. Should a counter be stopped from billing until their count is signed off?
- The counting sheet shows the system quantity, as CR-31 asks. A blind count, hiding it until sign-off, catches more errors. Is that wanted?
- Count differences are now for doctors, the owner and admins. Should managers also approve them?
