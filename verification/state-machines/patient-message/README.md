# Inbound WhatsApp message

Release 1a of the patient portal spec stores every message a patient sends to the clinic number and puts it in front of staff. This model checks that each message lands under one open item, is assigned to a patient only when that is unambiguous, and that the clinic's acknowledgement goes out at most once a day and never after STOP.

## What the model covers

`PatientMessage.tla` has one WhatsApp number, 0 to 2 portal-enabled patients on it, up to three inbound messages (each may quote an outbound message, and may be STOP), staff who claim and resolve items, days passing and the number confirming again.

| Model state | Code |
| --- | --- |
| `live` | `PatientPortalProfile` rows with that `phoneE164`, `portalEnabled` and not archived |
| `items` | unresolved `PATIENT_MESSAGE` `AttentionItem` per `subjectKey` (`patient:<id>` or `phone:<e164>`) |
| `lastAssign` | `PatientMessage.assignment` of the last message |
| `stopped` | every profile on the number is `OPTED_OUT` after STOP |
| `acks` | `ACKNOWLEDGEMENT` `OutboundMessage` rows for the number in the last 24 hours |

## Rules

| Rule | Before (no inbound handling) | Code |
| --- | --- | --- |
| `EveryPatientMessageLands` | breaks | holds |
| `OneOpenItemPerSubject` | holds | holds |
| `OneAckADay` | breaks | holds |
| `NoAckAfterStop` | breaks | holds |
| `ExactOnlyWhenUnique` | breaks | holds |

Negative controls: `noUpsert` (insert a new item instead of using the partial unique index), `noItem`, `noThrottle`, `ackAfterStop`, `assignAny` (assign EXACT when any patient has the number), `typeProbe`.

No rule breaks in code mode, so there are no replay tests. The database tests in `backend/src/modules/messaging/tests/inbound.database.spec.ts` drive the same rules through the real webhook.

```
python3 verification/state-machines/verify.py --jar tla2tools.jar patient-message
python3 verification/state-machines/chart.py --jar tla2tools.jar patient-message
```
