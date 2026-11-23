# Dictation and voice capture, code mode

TLC explored 255 states and 463 steps. The chart has 10 states and 19 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| LockAgrees | invariant | holds |
| MicOffWhenEnded | invariant | holds |
| LiveAgrees | invariant | holds |
| OneTranscription | invariant | holds |
| ItemFailureSticks | invariant | holds |
| ClipShownWhileRecording | invariant | holds |
| LeavesFinishing | property | holds |
| LockReleased | property | holds |
| MicReleased | property | holds |
| BarLeavesWorking | property | holds |

Holds: TypeOK, LockAgrees, MicOffWhenEnded, LiveAgrees, OneTranscription, ItemFailureSticks, ClipShownWhileRecording, LeavesFinishing, LockReleased, MicReleased, BarLeavesWorking.
