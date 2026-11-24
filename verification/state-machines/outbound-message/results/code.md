# Automated WhatsApp care message, code mode

TLC explored 1302 states and 8512 steps. The chart has 8 states and 14 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| NoSendToUnconfirmedNumber | invariant | holds |
| OptOutSticks | invariant | holds |
| SubjectCurrentAtSend | invariant | holds |
| FailureReachesStaff | invariant | holds |
| AtMostOneSend | invariant | holds |

Holds: TypeOK, NoSendToUnconfirmedNumber, OptOutSticks, SubjectCurrentAtSend, FailureReachesStaff, AtMostOneSend.
