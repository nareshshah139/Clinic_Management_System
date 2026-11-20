# Clinic bill payments, code mode

TLC explored 24673 states and 71718 steps. The chart has 4 states and 7 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| BalanceMatches | invariant | holds |
| ReceivedWithinTotal | invariant | holds |
| RefundsWithinPayment | invariant | breaks |
| ReceivedMatchesPayments | invariant | holds |
| GatewayPaymentSettles | property | breaks |

Holds: TypeOK, BalanceMatches, ReceivedWithinTotal, ReceivedMatchesPayments.

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
6. the desk confirms the card or UPI payment: Card or UPI payment waiting for confirmation
7. the desk starts a card or UPI payment: Card or UPI payment waiting for confirmation
8. the desk takes a payment: Card or UPI payment waiting for confirmation
9. the desk confirms the card or UPI payment: Card or UPI payment waiting for confirmation
10. the admin opens the bill to edit: Card or UPI payment waiting for confirmation
11. the admin saves an edited bill: Card or UPI payment waiting for confirmation
12. the admin opens the bill to edit: Card or UPI payment waiting for confirmation
13. the admin saves an edited bill: Card or UPI payment waiting for confirmation
14. the admin opens the bill to edit: Card or UPI payment waiting for confirmation
From step 11 the system can repeat these steps, or stop here, forever.
