# Clinic bill payments, code mode

TLC explored 65719 states and 178809 steps. The chart has 8 states and 30 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| BalanceMatches | invariant | breaks |
| ReceivedWithinTotal | invariant | breaks |
| RefundsWithinPayment | invariant | breaks |
| ReceivedMatchesPayments | invariant | holds |
| GatewayPaymentSettles | property | breaks |

Holds: TypeOK, ReceivedMatchesPayments.

## BalanceMatches breaks

The balance due is the total less what the bill has received, as billing.service.ts computes it.

1. Money due
2. the admin opens the bill to edit: Money due
3. the desk takes a payment: Money due
4. the admin saves an edited bill: Bill wrong: the balance due is wrong

## ReceivedWithinTotal breaks

A bill never holds more money than its total.

1. Money due
2. the desk takes a payment: Money due
3. the desk takes a payment: Paid in full
4. the admin opens the bill to edit: Paid in full
5. the admin saves an edited bill: Bill wrong: the bill holds more than its total

## RefundsWithinPayment breaks

The refunds of one payment never add up to more than that payment.

1. Money due
2. the desk takes a payment: Money due
3. the desk takes a payment: Paid in full
4. the admin refunds a payment: Money due
5. the admin refunds a payment: Bill wrong: a payment is refunded twice

## GatewayPaymentSettles breaks

A gateway payment nobody confirms does not stay pending forever.

1. Money due
2. the desk starts a card or UPI payment: Card or UPI payment waiting for confirmation
3. the desk opens a confirmation: Card or UPI payment waiting for confirmation
4. the desk opens a confirmation: Card or UPI payment waiting for confirmation
5. the desk starts a card or UPI payment: Card or UPI payment waiting for confirmation
6. the desk starts a card or UPI payment: Card or UPI payment waiting for confirmation
7. the desk takes a payment: Card or UPI payment waiting for confirmation
8. the admin opens the bill to edit: Card or UPI payment waiting for confirmation
9. the admin saves an edited bill: Card or UPI payment waiting for confirmation
10. the desk confirms the card or UPI payment: Card or UPI payment waiting for confirmation
11. the desk confirms the card or UPI payment: Card or UPI payment waiting for confirmation
12. the admin opens the bill to edit: Card or UPI payment waiting for confirmation
13. the admin saves an edited bill: Card or UPI payment waiting for confirmation
14. the admin opens the bill to edit: Card or UPI payment waiting for confirmation
15. the admin saves an edited bill: Card or UPI payment waiting for confirmation
From step 12 the system can repeat these steps, or stop here, forever.
