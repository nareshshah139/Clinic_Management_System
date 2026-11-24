# Automated WhatsApp care message, before mode

TLC explored 1224 states and 8340 steps. The chart has 9 states and 24 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| NoSendToUnconfirmedNumber | invariant | breaks |
| OptOutSticks | invariant | breaks |
| SubjectCurrentAtSend | invariant | breaks |
| FailureReachesStaff | invariant | breaks |
| AtMostOneSend | invariant | holds |

Holds: TypeOK, AtMostOneSend.

## NoSendToUnconfirmedNumber breaks

A care message is sent only while consent is OPTED_IN, the number is confirmed and the portal is on.

1. Queued
2. the scheduler leases the row: Sending
3. the scheduler sends or settles it: Sent to a number that has not agreed

## OptOutSticks breaks

After STOP, nothing is sent until the number confirms again, even after a merge with an opted-out duplicate.

1. Queued
2. the patient sends STOP: Queued
3. the scheduler leases the row: Sending
4. the scheduler sends or settles it: Sent to a number that has not agreed

## SubjectCurrentAtSend breaks

A message is sent only while its appointment or check-in is still current.

1. Queued
2. the subject closes: Queued
3. the scheduler leases the row: Sending
4. the scheduler sends or settles it: Sent to a number that has not agreed

## FailureReachesStaff breaks

A failed message about a current subject opens an attention item.

1. Queued
2. the scheduler leases the row: Sending
3. the provider rejects it: Failed with nobody told
