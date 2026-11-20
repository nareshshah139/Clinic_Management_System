# Clinic bill payments, fixed mode

TLC explored 137286 states and 526124 steps. The chart has 3 states and 5 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| BalanceMatches | invariant | holds |
| ReceivedWithinTotal | invariant | holds |
| RefundsWithinPayment | invariant | holds |
| ReceivedMatchesPayments | invariant | holds |
| GatewayPaymentSettles | property | holds |

Holds: TypeOK, BalanceMatches, ReceivedWithinTotal, RefundsWithinPayment, ReceivedMatchesPayments, GatewayPaymentSettles.
