------------------------------ MODULE Dictation ------------------------------
(* Voice capture in the browser, on two surfaces.

   bar    the dashboard voice bar dictates into its box, then sends the text
          to voice fill and shows "Working it out..." until the reply.
   field  a form field's mic button dictates straight into the field with the
          patient-preferred setting, so a live transcript goes through the
          speaker split before it is inserted.

   bar and field share one dictation session (dictation-session.ts). The voice
   fill button on intake forms (useVoiceFill.ts) runs the same session with
   the full-transcript setting and then sends one fill request, as bar does.
   It is not a separate surface here. Its real
   state is the closure variables phase, ended, live, uploading, stopSent, the
   data channel, the armed timers and the module-level microphoneHolder. The
   record ds holds those variables under their code names. A live transcript
   has one item, so ds.item is that item's state in live-transcript.ts.

   The server, OpenAI and the browser's permission prompt answer whenever they
   like, or never. Only timers carry fairness.

   MODE "before" is the code before the fix, kept as a regression control.
   "fixed" adds a timeout on the upload and speaker-split requests and ignores
   a completed event for a failed item. "code" is the code today, which takes the same branches
   as "fixed". Every other mode is "fixed" with one guard removed. *)
EXTENDS Naturals

CONSTANTS MODE

ASSUME MODE \in {"before", "code", "fixed", "typeProbe", "noRequestTimeout", "noMaxTimer",
                 "noFillTimeout", "noReleaseOnFinish", "noStopCapture",
                 "noLeaveLiveOnSettle", "completedOverwritesFailure"}

Surfaces == {"bar", "field"}
Outcomes == {"none", "live", "recorded", "empty", "error", "cancelled"}
Texts == {"live", "recorded"}

RequestTimeout == MODE \notin {"before", "noRequestTimeout"}
FailedItemSticks == MODE \notin {"before", "completedOverwritesFailure"}
FillTimeout == MODE # "noFillTimeout"
MaxTimer == MODE # "noMaxTimer"

VARIABLES surface, ds, bar, tFill

vars == <<surface, ds, bar, tFill>>

Pref == IF surface = "field" THEN "patient" ELSE "full"

-----------------------------------------------------------------------------
(* The session as startDictationSession returns it: the microphone granted,
   the recorder started, connect() under way and the lock held. *)
Started ==
  [phase |-> "connecting", ended |-> FALSE, live |-> TRUE, uploading |-> FALSE,
   stopSent |-> FALSE, dc |-> "connecting", sdp |-> "pending",
   speakers |-> "none", upload |-> "none",
   tConnect |-> TRUE, tTail |-> FALSE, tFinish |-> FALSE, tMax |-> MaxTimer,
   tReq |-> FALSE,
   item |-> "none", acked |-> FALSE, failedOnce |-> FALSE,
   outcome |-> IF MODE = "typeProbe" THEN "bogus" ELSE "none",
   lock |-> "held", mic |-> TRUE]

\* leaveLive
LeaveLive(d) ==
  [d EXCEPT !.live = FALSE, !.tConnect = FALSE, !.tFinish = FALSE, !.dc = "none"]

\* finish: clears every timer, leaves live, stops capture, releases the lock.
Finish(d, r) ==
  IF d.ended THEN d
  ELSE [LeaveLive(d) EXCEPT
          !.ended = TRUE, !.outcome = r,
          !.tTail = FALSE, !.tMax = FALSE, !.tReq = FALSE,
          !.mic = IF MODE = "noStopCapture" THEN @ ELSE FALSE,
          !.lock = IF MODE = "noReleaseOnFinish" THEN @ ELSE "free",
          !.speakers = IF @ = "inflight" THEN "done" ELSE @,
          !.upload = IF @ = "inflight" THEN "done" ELSE @]

\* upload: leaves live, stops capture and posts the recording.
Upload(d) ==
  IF d.ended \/ d.uploading THEN d
  ELSE [LeaveLive(d) EXCEPT !.uploading = TRUE, !.mic = FALSE,
                            !.upload = "inflight", !.tReq = RequestTimeout]

\* demote: drop to recorded-only, or straight to the upload once stop was pressed.
Demote(d) ==
  IF d.ended \/ ~d.live THEN d
  ELSE IF d.phase = "finishing" THEN Upload(LeaveLive(d))
  ELSE [LeaveLive(d) EXCEPT !.phase = "listening"]

\* finishLive: full-transcript resolves at once, patient-preferred asks for the speaker split.
FinishLive(d) ==
  IF Pref = "full" THEN Finish(d, "live")
  ELSE [d EXCEPT !.speakers = "inflight", !.tReq = RequestTimeout]

\* settleIfDone, with settlement() from live-transcript.ts.
SettleIfDone(d) ==
  IF d.item = "failed" THEN Demote(d)
  ELSE IF ~(d.acked /\ d.item # "partial") THEN d
  ELSE LET left == IF MODE = "noLeaveLiveOnSettle" THEN d ELSE LeaveLive(d) IN
       IF d.item = "final" THEN FinishLive(left) ELSE Upload(left)

AfterMessage(d) == IF d.phase = "finishing" THEN SettleIfDone(d) ELSE d

\* stop: also what the maximum-duration timer calls.
Stop(d) ==
  LET d1 == [d EXCEPT !.phase = "finishing", !.tMax = FALSE] IN
  IF ~d1.live THEN Upload(d1)
  ELSE IF d1.dc # "open" THEN Demote(d1)
  ELSE [d1 EXCEPT !.tTail = TRUE]

(* One step of the session. When the voice bar is listening and the session
   ends, the bar sends the text or shows the failure in the same step. *)
SessionStep(nd) ==
  /\ ds' = nd
  /\ IF surface = "bar" /\ bar = "listening" /\ nd.ended
       THEN /\ bar' = IF nd.outcome \in Texts THEN "working" ELSE "done"
            /\ tFill' = (nd.outcome \in Texts /\ FillTimeout)
       ELSE UNCHANGED <<bar, tFill>>
  /\ UNCHANGED <<surface>>

Open == ~ds.ended

-----------------------------------------------------------------------------
\* The doctor or receptionist.

YouStop == Open /\ ds.phase # "finishing" /\ SessionStep(Stop(ds))

\* dispose(): Escape, the page changing, or the component unmounting.
YouDiscard == Open /\ SessionStep(Finish(ds, "cancelled"))

\* The server and the WebRTC peer.

ServerAnswersOffer ==
  /\ Open /\ ds.live /\ ds.sdp = "pending"
  /\ \/ SessionStep([ds EXCEPT !.sdp = "answered"])
     \/ SessionStep(Finish([ds EXCEPT !.sdp = "refused"], "error"))
     \/ SessionStep(Demote([ds EXCEPT !.sdp = "refused"]))

ChannelOpens ==
  /\ Open /\ ds.live /\ ds.sdp = "answered" /\ ds.dc = "connecting" /\ ds.phase = "connecting"
  /\ SessionStep([ds EXCEPT !.dc = "open", !.tConnect = FALSE, !.phase = "listening"])

ChannelDrops == Open /\ ds.live /\ ds.dc # "none" /\ SessionStep(Demote(ds))

Hearing == Open /\ ds.live /\ ds.dc = "open"

ServerHearsWords ==
  /\ Hearing /\ ds.item = "none"
  /\ SessionStep(AfterMessage([ds EXCEPT !.item = "partial"]))

\* committed or commit_empty after the commit stop() sent.
ServerAcksCommit ==
  /\ Hearing /\ ds.stopSent /\ ~ds.acked
  /\ \E it \in IF ds.item = "none" THEN {"none", "partial"} ELSE {ds.item} :
       SessionStep(AfterMessage([ds EXCEPT !.acked = TRUE, !.item = it]))

ServerCompletesItem ==
  /\ Hearing
  /\ ds.item \in IF FailedItemSticks THEN {"partial"} ELSE {"partial", "failed"}
  /\ SessionStep(AfterMessage([ds EXCEPT !.item = "final"]))

ServerFailsItem ==
  /\ Hearing /\ ds.item = "partial"
  /\ SessionStep(AfterMessage([ds EXCEPT !.item = "failed", !.failedOnce = TRUE]))

ServerSendsFatal == Hearing /\ SessionStep(Demote(ds))

ServerAnswersUpload ==
  /\ Open /\ ds.upload = "inflight"
  /\ \E r \in {"recorded", "empty", "error"} : SessionStep(Finish(ds, r))

\* A failed or odd speaker split falls back to the raw live text, so every answer is live text.
ServerAnswersSpeakers ==
  /\ Open /\ ds.speakers = "inflight"
  /\ SessionStep(Finish(ds, "live"))

\* Timers.

ConnectTimerFires == Open /\ ds.tConnect /\ SessionStep(Demote([ds EXCEPT !.tConnect = FALSE]))

TailTimerFires ==
  /\ Open /\ ds.tTail
  /\ LET d1 == [ds EXCEPT !.tTail = FALSE] IN
     SessionStep(IF ~d1.live THEN d1
                 ELSE IF d1.dc # "open" THEN Demote(d1)
                 ELSE [d1 EXCEPT !.stopSent = TRUE, !.mic = FALSE, !.tFinish = TRUE])

FinishTimerFires == Open /\ ds.tFinish /\ SessionStep(Demote([ds EXCEPT !.tFinish = FALSE]))

MaxTimerFires == Open /\ ds.tMax /\ SessionStep(Stop(ds))

\* limitRequest: the abort that ends a stalled upload or speaker split. Never enabled in "before".
RequestTimerFires ==
  /\ Open /\ ds.tReq
  /\ SessionStep(Finish(ds, IF ds.upload = "inflight" THEN "error" ELSE "live"))

\* The voice bar's request to voice fill.

ServerAnswersFill ==
  /\ bar = "working"
  /\ bar' = "done" /\ tFill' = FALSE
  /\ UNCHANGED <<surface, ds>>

FillTimerFires ==
  /\ bar = "working" /\ tFill
  /\ bar' = "done" /\ tFill' = FALSE
  /\ UNCHANGED <<surface, ds>>

-----------------------------------------------------------------------------
Init ==
  /\ surface \in Surfaces
  /\ ds = Started
  /\ bar = IF surface = "bar" THEN "listening" ELSE "none"
  /\ tFill = FALSE

Next ==
  \/ YouStop \/ YouDiscard
  \/ ServerAnswersOffer \/ ChannelOpens \/ ChannelDrops
  \/ ServerHearsWords \/ ServerAcksCommit \/ ServerCompletesItem \/ ServerFailsItem
  \/ ServerSendsFatal \/ ServerAnswersUpload \/ ServerAnswersSpeakers
  \/ ConnectTimerFires \/ TailTimerFires \/ FinishTimerFires \/ MaxTimerFires
  \/ RequestTimerFires
  \/ ServerAnswersFill \/ FillTimerFires

\* Fairness only on timers. No server, peer, browser prompt or user is assumed to act.
Spec ==
  /\ Init /\ [][Next]_vars
  /\ WF_vars(ConnectTimerFires) /\ WF_vars(TailTimerFires)
  /\ WF_vars(FinishTimerFires) /\ WF_vars(MaxTimerFires)
  /\ WF_vars(RequestTimerFires) /\ WF_vars(FillTimerFires)

-----------------------------------------------------------------------------
TypeOK ==
  /\ surface \in Surfaces
  /\ ds.phase \in {"connecting", "listening", "finishing"}
  /\ ds.ended \in BOOLEAN /\ ds.live \in BOOLEAN /\ ds.uploading \in BOOLEAN
  /\ ds.stopSent \in BOOLEAN /\ ds.acked \in BOOLEAN /\ ds.failedOnce \in BOOLEAN
  /\ ds.dc \in {"none", "connecting", "open"}
  /\ ds.sdp \in {"none", "pending", "answered", "refused"}
  /\ ds.speakers \in {"none", "inflight", "done"}
  /\ ds.upload \in {"none", "inflight", "done"}
  /\ {ds.tConnect, ds.tTail, ds.tFinish, ds.tMax, ds.tReq} \subseteq BOOLEAN
  /\ ds.item \in {"none", "partial", "final", "failed"}
  /\ ds.outcome \in Outcomes
  /\ ds.lock \in {"held", "free"}
  /\ ds.mic \in BOOLEAN
  /\ bar \in {"none", "listening", "working", "done"}
  /\ tFill \in BOOLEAN

\* The one-dictation lock is held exactly while the session has not ended.
LockAgrees == (ds.lock = "held") <=> ~ds.ended

\* An ended session has stopped the microphone tracks.
MicOffWhenEnded == ds.ended => ~ds.mic

\* While live, the data channel exists and no transcription request is out.
LiveAgrees ==
  ds.live => (ds.dc # "none" /\ ~ds.ended /\ ~ds.uploading
              /\ ds.speakers = "none" /\ ds.upload = "none")

\* A dictation sends the speaker split or the upload, never both.
OneTranscription == ~(ds.speakers # "none" /\ ds.upload # "none")

\* A transcript item the server reported as failed stays failed.
ItemFailureSticks == ds.failedOnce => ds.item = "failed"

\* Liveness.

LeavesFinishing == [](ds.phase = "finishing" /\ ~ds.ended => <>ds.ended)

LockReleased == [](ds.lock = "held" => <>(ds.lock = "free"))

MicReleased == [](ds.mic => <>~ds.mic)

BarLeavesWorking == [](bar = "working" => <>(bar # "working"))
=============================================================================
