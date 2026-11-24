# Inbound WhatsApp message, code mode

TLC explored 1418 states and 10193 steps. The chart has 4 states and 8 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| EveryPatientMessageLands | invariant | holds |
| OneOpenItemPerSubject | invariant | holds |
| OneAckADay | invariant | holds |
| NoAckAfterStop | invariant | holds |
| ExactOnlyWhenUnique | invariant | holds |

Holds: TypeOK, EveryPatientMessageLands, OneOpenItemPerSubject, OneAckADay, NoAckAfterStop, ExactOnlyWhenUnique.
