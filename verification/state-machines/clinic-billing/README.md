# Clinic bill payments

A clinic bill (`NewInvoice`) is paid at the desk, by card or UPI through a gateway, and sometimes refunded. An admin can edit its items or discount after it is created. `ClinicBilling.tla` models one bill and its payment rows with the desk, one admin and two confirmation requests acting at once. It checks that the bill's numbers stay true.

## Domain

The bill has no paid or unpaid status that billing code writes. Its state is three numbers, `total`, `received` and `balance` (`backend/prisma/schema.prisma:871`, `:872`, `:884`). Unpaid, part paid and paid are implied by them. The code depends on `balance` being `total` less `received`, because `receive` checks a payment against the `balance` column, not against `total - received`.

Each payment row (`NewPayment`) has a free-text `reconStatus`. Desk payments and refunds are born `COMPLETED`. A gateway payment is born `PENDING` and becomes `COMPLETED` only through `confirmPayment`. A refund is a negative row whose `refundOfId` names the payment it refunds. Refunds stored before that column existed carry no link.

| Model variable | Code |
| --- | --- |
| `total`, `received`, `balance` | the same columns on `NewInvoice` |
| `pays[i]` `kind`, `amt`, `st` | a `NewPayment` row: `gateway` set or not, or a negative `amount` for a refund, and `reconStatus` |
| `pays[i].of` | which payment a refund refunds, `refundOfId` |
| `edit` | an admin's `PATCH /billing/invoices/:id` between its read and its write |
| `confirm[c]` | a `POST /billing/payments/:id/confirm` between its read and its transaction |

Amounts are in hundreds of rupees. The bill starts at 4. Payments and refunds are 2. An edit sets the total to 2 or 4.

## Model to code

| Model | Code |
| --- | --- |
| `DeskTakesPayment` | `processPayment` without a gateway, `billing.service.ts:350`, runs `payAtDesk`, `:365`, which calls `receive` and creates a `COMPLETED` row in one transaction |
| `Receive` | `receive`, `:436`. It reads the bill under its row lock (`lockedMoney`, `SELECT ... FOR UPDATE`, `:454`), refuses an amount above `balance`, and adds to `received` and takes off `balance`. |
| `DeskStartsGatewayPayment` | `processPayment` with a gateway checks the balance and creates a `PENDING` row, `:355` to `:358`. The bill is unchanged. |
| `DeskOpensConfirm` | `confirmPayment`'s `findFirst`, `:380` |
| `DeskConfirms` | the transaction at `:392`. `updateMany` where `reconStatus` is `PENDING`, `:394`, then `receive` once, `:397`. When `receive` refuses, the whole transaction rolls back. |
| `DeskRefunds` | `processRefund`, `:482`. The payment must be `COMPLETED`, `:499`, and at least the refund, `:508`. Under the bill's row lock, `:514`, the refunds linked to the payment plus this one must stay within it, `:516`, and the bill must still hold the refund as `received`. The refund row copies the payment's mode and links to it, `:531`. |
| `AdminOpensEdit` | `updateInvoice` reads the bill, `:287`, and computes the new `total` from that read, `:308`. In `code` the read's `received` is not used. |
| `AdminSavesEdit` | the transaction at `:320`. Its first `newInvoice.update`, `:322`, writes `total` and takes the bill's row lock, so the `received` it returns is current. A total below it is refused, `:326`, and the transaction rolls back. Otherwise `balance` is written as `total - received`, `:331`. In `before`, the transaction wrote `total` and `balance = max(total - received, 0)` from the read before it, with no condition. |
| `GatewayPaymentExpires` | `fixed` only. No code writes anything but `PENDING` or `COMPLETED`. |
| `GatewayPaymentSettles` | `AnyPending` stands for every row, because rows are only appended and never return to `PENDING`. |

## Rules

| Rule | Kind | Before | Code | Fixed |
| --- | --- | --- | --- | --- |
| `TypeOK` | invariant | holds | holds | holds |
| `BalanceMatches`. The balance due is the total less what the bill has received, as `billing.service.ts` computes it. | invariant | breaks | holds | holds |
| `ReceivedWithinTotal`. A bill never holds more money than its total. | invariant | breaks | holds | holds |
| `RefundsWithinPayment`. The refunds of one payment never add up to more than that payment. | invariant | breaks | holds | holds |
| `ReceivedMatchesPayments`. What the bill has received equals its completed payments less its refunds. | invariant | holds | holds | holds |
| `GatewayPaymentSettles`. A gateway payment nobody confirms does not stay pending forever. | property | breaks | breaks | holds |

`before` is the code before the fix below, kept as a regression control. `results/before.md` has its paths.

### BalanceMatches broke before the fix

The admin opens a bill of 400 to change the discount. The desk takes 200. The admin saves. `updateInvoice` wrote a balance of 400 from the `received` of 0 it read before the payment. The bill then showed 400 due on a 400 bill that had received 200.

Because `receive` trusts the `balance` column, the desk could then take money the bill did not owe. A second replay walks the race with a full payment of 400. After the edit the bill showed 400 due again, and the desk took 400 a second time. The bill held 800 on a total of 400.

### ReceivedWithinTotal broke before the fix

TLC's shortest path needs no race. The desk takes 200 twice and the bill is paid. The admin sets a 50 percent discount. `updateInvoice` wrote a total of 200 and clamped the balance to 0. The bill held 400 on a total of 200, showed nothing due, and nothing recorded that 200 was owed back to the patient.

### RefundsWithinPayment broke before the fix

The patient pays 200 by UPI and 200 in cash. The admin refunds the UPI payment, then refunds the UPI payment again. Both passed, because the only shared limit was the bill's `received`. Both refund rows copied the UPI mode, so 400 went back by UPI when only 200 came in by UPI.

### GatewayPaymentSettles breaks

A gateway payment stays `PENDING` until someone calls `confirmPayment`. Nothing else in the backend writes `reconStatus`. The only scheduled jobs are patient deduplication and the inventory workflow scheduler, and neither touches payments. A payment the gateway never confirms, or one nobody confirms, stays pending forever and the bill stays unpaid.

## Holds in code

`BalanceMatches` and `ReceivedWithinTotal` hold since the fix below. An edit computes the balance from the `received` its own write locked, and refuses a total below it.

`RefundsWithinPayment` holds since the refund fix below. A refund counts the refunds already linked to its payment under the bill's row lock.

`ReceivedMatchesPayments` holds. `receive` and the row write share a transaction in every path. `confirmPayment` applies a payment once however often it is called, because its `updateMany` only matches a `PENDING` row and a second confirmation blocks on the row lock and then matches nothing. The `confirmWithoutCAS` control shows the rule would fail without that condition.

## The fix

`updateInvoice` in `backend/src/modules/billing/billing.service.ts` makes `BalanceMatches` and `ReceivedWithinTotal` hold. It is the `fixed` mode's first guard.

- `billing.service.ts:322`. The transaction's first `newInvoice.update` writes the new `total` and the other edited fields. It takes the bill's row lock, so a payment or refund that arrives later waits for the edit to commit, and the `received` it returns cannot move before the balance is written.
- `billing.service.ts:326`. When that `received` is above the new total, the edit throws `BadRequestException` naming what the bill has received and telling the user to refund the difference first. The transaction rolls back, so neither the total nor the items change.
- `billing.service.ts:331`. Otherwise the balance is written as `total - received` from that same row.

The `fixed` mode does this in one conditional update. Prisma cannot write a column computed from another column, so the code takes the lock with the first write and computes from what it returns. Both are atomic against a payment or refund, and TLC checks the same `AdminSavesEdit` step for `code` and `fixed`.

No other path in `billing.service.ts` writes `total` or `balance` from a stale read. `receive` and `processRefund` read both columns under the bill's row lock and write them in the same transaction, and `generate-samples` writes only bills it has just created.

`processRefund` makes `RefundsWithinPayment` hold. It is the `fixed` mode's second guard.

- A refund row stores the payment it refunds in `refundOfId`, a nullable self-relation on `NewPayment` with an index (migration `20261125130000_payment_refund_link`). `reference` could not carry the link, because `reports.service.ts` reads it as the refund reason, and `gateway` names a payment provider.
- `billing.service.ts:514`. The transaction locks the bill's row before it reads anything, so two refunds of one payment run one after the other and the second sees the first.
- `:515` and `:516`. It sums the refunds linked to the payment and refuses a refund above what is left, saying how much is left or that the payment is already refunded in full.
- The receipt gives each payment's `refundable` amount, what is left of it and never more than the bill still holds, and the bill dialog offers Refund only where that is above 0.

Refunds stored before `refundOfId` existed carry no link, so they do not count against their payment. The bill's `received` still caps them.

### Left broken

`GatewayPaymentSettles` still breaks. The lead deferred it. Closing a stale gateway payment needs an expiry window, which is a business rule nobody has set, and no screen starts a gateway payment today (`AppointmentBillDialog.tsx:163` takes desk payments only).

## Fixed

1. `updateInvoice` writes total and balance in one conditional update that computes the balance from the current `received` and matches only when `received <= total`. A total below `received` is refused.
2. A refund row links to its payment, and the refund's update matches only while that payment's refunds stay within its amount.
3. A reconciliation job closes a gateway payment that stays `PENDING`, with a compare-and-set on `PENDING` so it cannot race a confirmation.

## Negative controls

| Mode | Mistake it reproduces | Breaks |
| --- | --- | --- |
| `staleBalance` | The edit keeps the refusal but computes the balance from the read before its transaction, as `updateInvoice` did before the fix. | `BalanceMatches` |
| `editBelowReceived` | The edit computes the balance from the current row but accepts any total. | `ReceivedWithinTotal` |
| `unlinkedRefund` | Refunds check only the payment's own amount and the bill's `received`, as before `refundOfId`. | `RefundsWithinPayment` |
| `confirmWithoutCAS` | `confirmPayment` decides from the status it read before its transaction. Two confirmations both apply the payment. | `ReceivedMatchesPayments` |
| `noReconciler` | No job closes an unconfirmed gateway payment, as today. | `GatewayPaymentSettles` |
| `typeProbe` | The balance starts outside its type. | `TypeOK` |

## Fairness

`Spec` has one fairness clause per payment row, `WF_vars(GatewayPaymentExpires(p))`. It stands for the reconciliation job's timer and exists only in `fixed` and the controls built on it. No desk, admin or confirmation step has fairness. A person may never confirm a payment.

## Replays

`backend/src/modules/billing/tests/clinic-billing.formal-replay.database.spec.ts` calls the real `BillingService` and `InvoiceNumbersService` with a Prisma client on a private PostgreSQL schema. Bills are created with `createInvoice`.

- `BalanceMatches`. `updateInvoice` is paused with `gate()` at its first `newInvoice.update`, after its read and before its write. A desk payment of 200 runs. The edit is released. The bill reads total 400, received 200, balance 200. Before the fix it read balance 400.
- `ReceivedWithinTotal`, TLC's path. Two payments of 200, then a 50 percent discount. The edit is refused and the bill still reads total 400, received 400, balance 0. Before the fix the edit succeeded and the bill read total 200, received 400, balance 0.
- `ReceivedWithinTotal`, through the race. The same pause with a full payment of 400, then a second payment of 400. The second payment is refused as already paid in full. Before the fix it was accepted and the bill read received 800.
- `RefundsWithinPayment`. A UPI payment and a cash payment of 200, then two refunds of the UPI payment. The second is refused as already refunded in full, and the bill reads total 400, received 200, balance 200. Before the fix both passed, both as UPI.
- `GatewayPaymentSettles`. A gateway payment of 200 is started, then the fake clock runs a week of timers. Today it is still `PENDING`. Its `.failing` and `today:` tests stay. TLC's counterexample in `results/code.md` is not a shortest path, because TLC does not look for a shortest one when it checks a liveness property. `tlc.py` pins TLC's fingerprint index, so the same 14 steps come back on every run. The only step its loop depends on is starting the gateway payment. Starting it and then taking no further step is also a behavior of `Spec` that breaks the rule. The replay drives that minimal path.

The `BalanceMatches`, `ReceivedWithinTotal` and `RefundsWithinPayment` replays are plain tests now. They fail if the edit goes back to its old read or drops its refusal, or if a refund stops counting the refunds linked to its payment.

## Reachability today

No screen sends `PATCH /billing/invoices/:id`, `POST /billing/payments/:id/confirm` or a payment with `gateway`. The appointment bill dialog only takes desk payments (`AppointmentBillDialog.tsx:163`), and the bill dialog at `/dashboard/billing` (`ClinicBillDialog.tsx`) takes desk payments and refunds. `GatewayPaymentSettles`, the break left in code, needs a gateway payment, which only the API starts. It is real behavior of the service, and it becomes reachable from the clinic floor as soon as a screen starts gateway payments.

## What the model leaves out

- `processBulkPayment`. It pays each bill's balance through `payAtDesk`, so it is the same `receive` as a desk payment.
- Item replacement. An edit with new items deletes and recreates the item rows in the same transaction. The model keeps only the total it produces.
- Rounding and GST. Totals are whole numbers. The code compares and writes `received` and `balance` in whole paise (`paise` in `clinic-bill-register.ts`), so they carry no fraction of a paisa and compare exactly, as the model's whole numbers do.
- `generate-samples`, which writes `received` and `balance` directly for demo data, `billing.service.ts:941` and `:956`. It writes a bill it has just created, so no other actor shares it.
- The `status` column on `NewInvoice`. Billing code never writes it, though `reports.service.ts:1079` counts bills by it.
- The legacy `Payment` model, which has no writer.
