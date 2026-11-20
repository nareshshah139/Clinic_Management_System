# Clinic bill payments

A clinic bill (`NewInvoice`) is paid at the desk, by card or UPI through a gateway, and sometimes refunded. An admin can edit its items or discount after it is created. `ClinicBilling.tla` models one bill and its payment rows with the desk, one admin and two confirmation requests acting at once. It checks that the bill's numbers stay true.

## Domain

The bill has no paid or unpaid status that billing code writes. Its state is three numbers, `total`, `received` and `balance` (`backend/prisma/schema.prisma:871`, `:872`, `:884`). Unpaid, part paid and paid are implied by them. The code depends on `balance` being `total` less `received`, because `receive` checks a payment against the `balance` column, not against `total - received`.

Each payment row (`NewPayment`) has a free-text `reconStatus`. Desk payments and refunds are born `COMPLETED`. A gateway payment is born `PENDING` and becomes `COMPLETED` only through `confirmPayment`. Refunds are negative rows with no link to the payment they refund.

| Model variable | Code |
| --- | --- |
| `total`, `received`, `balance` | the same columns on `NewInvoice` |
| `pays[i]` `kind`, `amt`, `st` | a `NewPayment` row: `gateway` set or not, or a negative `amount` for a refund, and `reconStatus` |
| `pays[i].of` | which payment a refund refunds. The code does not store this. The model keeps it so the rule can name the payment. |
| `edit` | an admin's `PATCH /billing/invoices/:id` between its read and its write |
| `confirm[c]` | a `POST /billing/payments/:id/confirm` between its read and its transaction |

Amounts are in hundreds of rupees. The bill starts at 4. Payments and refunds are 2. An edit sets the total to 2 or 4.

## Model to code

| Model | Code |
| --- | --- |
| `DeskTakesPayment` | `processPayment` without a gateway, `billing.service.ts:344`, runs `payAtDesk`, `:359`, which calls `receive` and creates a `COMPLETED` row in one transaction |
| `Receive` | `receive`, `:400`. One `updateMany` where `balance >= amount` adds to `received` and takes off `balance`, `:407`. |
| `DeskStartsGatewayPayment` | `processPayment` with a gateway checks the balance and creates a `PENDING` row, `:349` to `:352`. The bill is unchanged. |
| `DeskOpensConfirm` | `confirmPayment`'s `findFirst`, `:374` |
| `DeskConfirms` | the transaction at `:386`. `updateMany` where `reconStatus` is `PENDING`, `:388`, then `receive` once, `:391`. When `receive` refuses, the whole transaction rolls back. |
| `DeskRefunds` | `processRefund`, `:435`. The payment must be `COMPLETED`, `:452`, and at least the refund, `:460`. One `updateMany` where `received >= amount` moves the money, `:467`. The refund row copies the payment's mode, `:475`. |
| `AdminOpensEdit` | `updateInvoice` reads the bill, `:287`, and computes `balance = max(total - invoice.received, 0)` from that read, `:309` |
| `AdminSavesEdit` | the transaction at `:315` writes `total` and `balance` as absolute values with no condition, `:317` |
| `GatewayPaymentExpires` | `fixed` only. No code writes anything but `PENDING` or `COMPLETED`. |
| `GatewayPaymentSettles` | `AnyPending` stands for every row, because rows are only appended and never return to `PENDING`. |

## Rules

| Rule | Kind | Code | Fixed |
| --- | --- | --- | --- |
| `TypeOK` | invariant | holds | holds |
| `BalanceMatches`. The balance due is the total less what the bill has received, as `billing.service.ts` computes it. | invariant | breaks | holds |
| `ReceivedWithinTotal`. A bill never holds more money than its total. | invariant | breaks | holds |
| `RefundsWithinPayment`. The refunds of one payment never add up to more than that payment. | invariant | breaks | holds |
| `ReceivedMatchesPayments`. What the bill has received equals its completed payments less its refunds. | invariant | holds | holds |
| `GatewayPaymentSettles`. A gateway payment nobody confirms does not stay pending forever. | property | breaks | holds |

### BalanceMatches breaks

The admin opens a bill of 400 to change the discount. The desk takes 200. The admin saves. `updateInvoice` writes a balance of 400 from the `received` of 0 it read before the payment. The bill now shows 400 due on a 400 bill that has received 200.

Because `receive` trusts the `balance` column, the desk can then take money the bill does not owe. A second replay walks the race with a full payment of 400. After the edit the bill shows 400 due again, and the desk takes 400 a second time. The bill holds 800 on a total of 400.

### ReceivedWithinTotal breaks

TLC's shortest path needs no race. The desk takes 200 twice and the bill is paid. The admin sets a 50 percent discount. `updateInvoice` writes a total of 200 and clamps the balance to 0. The bill holds 400 on a total of 200, shows nothing due, and nothing records that 200 is owed back to the patient.

### RefundsWithinPayment breaks

The patient pays 200 by UPI and 200 in cash. The admin refunds the UPI payment, then refunds the UPI payment again. Both pass, because the only shared limit is the bill's `received`. Both refund rows copy the UPI mode, so 400 goes back by UPI when only 200 came in by UPI. The code names this as a target obligation (`refund-total-per-payment`, `billing.service.ts:431`).

### GatewayPaymentSettles breaks

A gateway payment stays `PENDING` until someone calls `confirmPayment`. Nothing else in the backend writes `reconStatus`. The only scheduled jobs are patient deduplication and the inventory workflow scheduler, and neither touches payments. A payment the gateway never confirms, or one nobody confirms, stays pending forever and the bill stays unpaid.

## Holds in code

`ReceivedMatchesPayments` holds. `receive` and the row write share a transaction in every path. `confirmPayment` applies a payment once however often it is called, because its `updateMany` only matches a `PENDING` row and a second confirmation blocks on the row lock and then matches nothing. The `confirmWithoutCAS` control shows the rule would fail without that condition.

## Fixed

1. `updateInvoice` writes total and balance in one conditional update that computes the balance from the current `received` and matches only when `received <= total`. A total below `received` is refused.
2. A refund row links to its payment, and the refund's update matches only while that payment's refunds stay within its amount.
3. A reconciliation job closes a gateway payment that stays `PENDING`, with a compare-and-set on `PENDING` so it cannot race a confirmation.

## Negative controls

| Mode | Mistake it reproduces | Breaks |
| --- | --- | --- |
| `staleBalance` | The edit keeps the refusal but computes the balance from the read before its transaction, as `updateInvoice` does today. | `BalanceMatches` |
| `editBelowReceived` | The edit computes the balance from the current row but accepts any total. | `ReceivedWithinTotal` |
| `unlinkedRefund` | Refunds check only the payment's own amount and the bill's `received`, as today. | `RefundsWithinPayment` |
| `confirmWithoutCAS` | `confirmPayment` decides from the status it read before its transaction. Two confirmations both apply the payment. | `ReceivedMatchesPayments` |
| `noReconciler` | No job closes an unconfirmed gateway payment, as today. | `GatewayPaymentSettles` |
| `typeProbe` | The balance starts outside its type. | `TypeOK` |

## Fairness

`Spec` has one fairness clause per payment row, `WF_vars(GatewayPaymentExpires(p))`. It stands for the reconciliation job's timer and exists only in `fixed` and the controls built on it. No desk, admin or confirmation step has fairness. A person may never confirm a payment.

## Replays

`backend/src/modules/billing/tests/clinic-billing.formal-replay.database.spec.ts` calls the real `BillingService` and `InvoiceNumbersService` with a Prisma client on a private PostgreSQL schema. Bills are created with `createInvoice`.

- `BalanceMatches`. `updateInvoice` is paused with `gate()` at `newInvoice.update`, after its read. A desk payment of 200 runs. The edit is released. Today the bill reads total 400, received 200, balance 400.
- `ReceivedWithinTotal`, TLC's path. Two payments of 200, then a 50 percent discount. Today the edit succeeds and the bill reads total 200, received 400, balance 0.
- `ReceivedWithinTotal`, through the race. The same pause with a full payment of 400, then a second payment of 400. Today the second payment is accepted and the bill reads received 800.
- `RefundsWithinPayment`. A UPI payment and a cash payment of 200, then two refunds of the UPI payment. Today both refunds pass, both as UPI.
- `GatewayPaymentSettles`. A gateway payment of 200 is started, then the fake clock runs a week of timers. Today it is still `PENDING`. TLC's counterexample in `results/code.md` is long, because a liveness counterexample is not a shortest path. `tlc.py` pins TLC's fingerprint index, so the same 15 steps come back on every run. The only step its loop depends on is starting the gateway payment. Starting it and then taking no further step is also a behavior of `Spec` that breaks the rule. The replay drives that minimal path.

## Reachability today

No screen sends `PATCH /billing/invoices/:id`, `POST /billing/payments/:id/confirm`, `POST /billing/refunds` or a payment with `gateway`. The appointment bill dialog only takes desk payments (`AppointmentBillDialog.tsx:163`). Every break above needs the API directly, by an admin for edits and refunds. They are real behavior of the service, and they become reachable from the clinic floor as soon as a screen offers these endpoints.

## What the model leaves out

- `processBulkPayment`. It pays each bill's balance through `payAtDesk`, so it is the same `receive` as a desk payment.
- Item replacement. An edit with new items deletes and recreates the item rows in the same transaction. The model keeps only the total it produces.
- Rounding and GST. Totals are whole numbers.
- `generate-samples`, which writes `received` and `balance` directly for demo data, `billing.service.ts:935` and `:950`.
- The `status` column on `NewInvoice`. Billing code never writes it, though `reports.service.ts:1079` counts bills by it.
- The legacy `Payment` model, which has no writer.
