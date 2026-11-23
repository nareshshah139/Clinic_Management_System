# Dictation and voice capture, before mode

TLC explored 300 states and 505 steps. The chart has 12 states and 23 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| LockAgrees | invariant | holds |
| MicOffWhenEnded | invariant | holds |
| LiveAgrees | invariant | holds |
| OneTranscription | invariant | holds |
| ItemFailureSticks | invariant | breaks |
| ClipShownWhileRecording | invariant | breaks |
| LeavesFinishing | property | breaks |
| LockReleased | property | breaks |
| MicReleased | property | holds |
| BarLeavesWorking | property | holds |

Holds: TypeOK, LockAgrees, MicOffWhenEnded, LiveAgrees, OneTranscription, MicReleased, BarLeavesWorking.

## ItemFailureSticks breaks

A transcript piece the server reported as failed stays failed, so the recording is transcribed instead.

1. Opening the live preview
2. the server answers the live offer: Opening the live preview
3. the live channel opens: Listening with live preview
4. OpenAI hears words: Listening with live preview
5. OpenAI fails a piece: Listening with live preview
6. OpenAI completes a piece: Live preview kept a failed piece

## ClipShownWhileRecording breaks

Whenever a voice fill clip is recording, its button shows that it is recording.

1. Voice fill button idle
2. you press the voice fill button: Asking for the microphone
3. you press Escape: Voice fill button idle
4. you press the voice fill button: Asking for the microphone
5. the browser denies an old request: Voice fill button idle
6. the browser grants the microphone: Recording while the button shows idle

## LeavesFinishing breaks

A dictation that shows Finishing ends with no user action, even if the server never answers.

1. Opening the live preview
2. you press stop: Waiting for the server's transcript
From step 2 the system can repeat these steps, or stop here, forever.

## LockReleased breaks

The one-dictation lock is released with no user action, so the next dictation can start.

1. Opening the live preview
2. you press stop: Waiting for the server's transcript
From step 2 the system can repeat these steps, or stop here, forever.
