SPEC = "Dictation.tla"
CONSTANTS = {}
MODES = {
    "before": {"MODE": '"before"'},
    "code": {"MODE": '"code"'},
    "fixed": {"MODE": '"fixed"'},
    "typeProbe": {"MODE": '"typeProbe"'},
    "noRequestTimeout": {"MODE": '"noRequestTimeout"'},
    "noMaxTimer": {"MODE": '"noMaxTimer"'},
    "noFillTimeout": {"MODE": '"noFillTimeout"'},
    "noReleaseOnFinish": {"MODE": '"noReleaseOnFinish"'},
    "noStopCapture": {"MODE": '"noStopCapture"'},
    "noLeaveLiveOnSettle": {"MODE": '"noLeaveLiveOnSettle"'},
    "completedOverwritesFailure": {"MODE": '"completedOverwritesFailure"'},
}
RULES = {
    "TypeOK": "invariant",
    "LockAgrees": "invariant",
    "MicOffWhenEnded": "invariant",
    "LiveAgrees": "invariant",
    "OneTranscription": "invariant",
    "ItemFailureSticks": "invariant",
    "LeavesFinishing": "property",
    "LockReleased": "property",
    "MicReleased": "property",
    "BarLeavesWorking": "property",
}
RULE_TEXT = {
    "TypeOK": "Every variable stays within its type.",
    "LockAgrees": "The one-dictation lock is held exactly while the session has not ended.",
    "MicOffWhenEnded": "An ended dictation has stopped the microphone.",
    "LiveAgrees": "While the live preview runs, the data channel exists and no transcription request is out.",
    "OneTranscription": "A dictation sends the speaker split or the recording upload, never both.",
    "ItemFailureSticks": "A transcript piece the server reported as failed stays failed, so the recording is transcribed instead.",
    "LeavesFinishing": "A dictation that shows Finishing ends with no user action, even if the server never answers.",
    "LockReleased": "The one-dictation lock is released with no user action, so the next dictation can start.",
    "MicReleased": "The microphone is released with no user action.",
    "BarLeavesWorking": "The voice bar leaves Working it out with no user action, even if the server never answers.",
}
ALL = list(RULES)
EXPECT = {
    "before": {**{r: "holds" for r in ALL}, "ItemFailureSticks": "breaks",
             "LeavesFinishing": "breaks", "LockReleased": "breaks"},
    "code": {r: "holds" for r in ALL},
    "fixed": {r: "holds" for r in ALL},
    "typeProbe": {"TypeOK": "breaks"},
    "noRequestTimeout": {"LeavesFinishing": "breaks", "LockReleased": "breaks"},
    "noMaxTimer": {"MicReleased": "breaks", "LockReleased": "breaks", "LeavesFinishing": "holds"},
    "noFillTimeout": {"BarLeavesWorking": "breaks"},
    "noReleaseOnFinish": {"LockAgrees": "breaks", "LockReleased": "breaks"},
    "noStopCapture": {"MicOffWhenEnded": "breaks", "MicReleased": "breaks"},
    "noLeaveLiveOnSettle": {"LiveAgrees": "breaks", "OneTranscription": "breaks"},
    "completedOverwritesFailure": {"ItemFailureSticks": "breaks"},
}
CHARTS = ["before", "code"]
REPLAYS = {}
