# Inbound WhatsApp message, before mode

TLC explored 347 states and 1906 steps. The chart has 4 states and 7 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| EveryPatientMessageLands | invariant | breaks |
| OneOpenItemPerSubject | invariant | holds |
| OneAckADay | invariant | breaks |
| NoAckAfterStop | invariant | breaks |
| ExactOnlyWhenUnique | invariant | breaks |

Holds: TypeOK, OneOpenItemPerSubject.

## EveryPatientMessageLands breaks

Each inbound message lands under an unresolved PATIENT_MESSAGE item for its patient or number.

1. Nothing open
2. a message arrives: Message with no open item

## OneAckADay breaks

A number gets at most one acknowledgement in a day.

1. Nothing open
2. a message arrives: Message with no open item
3. a message arrives: Message with no open item

## NoAckAfterStop breaks

No acknowledgement goes to a number after it sent STOP, until it confirms again.

1. Nothing open
2. a message arrives: Message with no open item

## ExactOnlyWhenUnique breaks

A message is assigned EXACT only when exactly one portal-enabled patient has the number.

1. Nothing open
2. a message arrives: Message with no open item
