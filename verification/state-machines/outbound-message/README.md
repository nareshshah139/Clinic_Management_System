# Automated WhatsApp care message

Release 1a of the patient portal spec sends automated WhatsApp messages (appointment confirmations now, check-ins in Release 1b) only to numbers that agreed. This model checks that a message cannot reach a patient who has not confirmed, has sent STOP, has the portal switched off, or whose appointment or check-in is no longer current.

## What the model covers

`OutboundMessage.tla` has one patient, the consent of their number, one duplicate patient row that may be merged in, and one `OutboundMessage` row. Reception records agreement, the number confirms, the patient sends STOP, staff change the phone or switch the portal, 12 months pass, and the subject closes. The scheduler leases the row (`SENDING`) and then, in one step, re-reads everything and sends, suppresses or expires it. Receipts move `SENT` forward; a provider rejection moves it to `FAILED`.

| Model state | Code |
| --- | --- |
| `consent`, `confirmed`, `portal` | `PatientPortalProfile.consentState`, `phoneConfirmedAt`, `portalEnabled` |
| `msg`, `sends` | `OutboundMessage.state`, and calls to `WhatsAppSender.send` for that row |
| `open` | the subject is current: a future SCHEDULED/CONFIRMED appointment, or an open check-in |
| `attention` | an open `DELIVERY_FAILURE` `AttentionItem` |
| `dup` | consent on a duplicate patient row the merge job folds in |

## Rules

| Rule | Before (legacy `sendWhatsApp`) | Code |
| --- | --- | --- |
| `NoSendToUnconfirmedNumber` | breaks | holds |
| `OptOutSticks` | breaks | holds |
| `SubjectCurrentAtSend` | breaks | holds |
| `FailureReachesStaff` | breaks | holds |
| `AtMostOneSend` | holds | holds |

Negative controls: `checkAtLease` (checks read at lease time, not send time), `noSubjectCheck`, `keptWins` (merge keeps the kept row's consent), `noFailureItem`, `noLease` (two workers send one row), `typeProbe`.

No rule breaks in code mode, so there are no replay tests. Before mode is the pre-spec code: `PatientsService.sendAppointmentReminder` and appointment confirmation called `NotificationsService.sendWhatsApp` with no consent, confirmation or subject check.
