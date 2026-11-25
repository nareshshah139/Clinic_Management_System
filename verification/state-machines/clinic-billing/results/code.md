# Clinic bill payments, code mode

TLC explored 23623 states and 68596 steps. The chart has 3 states and 5 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| BalanceMatches | invariant | holds |
| ReceivedWithinTotal | invariant | holds |
| RefundsWithinPayment | invariant | holds |
| ReceivedMatchesPayments | invariant | holds |
| GatewayPaymentSettles | property | breaks |

Holds: TypeOK, BalanceMatches, ReceivedWithinTotal, RefundsWithinPayment, ReceivedMatchesPayments.

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
