----------------------------- MODULE InvoiceRecovery -----------------------------
EXTENDS Naturals, FiniteSets, TLC

CONSTANT Mutant
Slots == {1, 2}
Phases == {"unchecked", "checking", "blocked", "editing", "saving", "saveFailed",
           "savedChecking", "checkFailed", "savedCheckFailed", "ready", "reviewing",
           "reviewFailed", "committing", "stockUnknown", "readingBack", "committed", "handoff"}
Kinds == {"none", "check", "save", "saveDraft", "review", "reviewError", "reviewCleanup", "focus", "commit", "readback"}
Results == {"unchecked", "ready", "incomplete", "missing", "ambiguous", "malformed"}
Empty == [kind |-> "none", current |-> FALSE, invoice |-> "A"]

VARIABLES s, staleSafe, reviewSafe, stockSafe, savedSafe
vars == <<s, staleSafe, reviewSafe, stockSafe, savedSafe>>
Ui(x) == <<x.phase, x.saved, x.exact, x.approved, x.result, x.busy, x.focus, x.typed>>
Stocks(x) == <<x.stockA, x.stockB>>
Available(i) == s.ops[i].kind = "none"
Current(i) == s.ops[i].current
Operation(kind) == [kind |-> kind, current |-> TRUE, invoice |-> s.invoice]
Retire(x, i) == [x EXCEPT !.ops[i] = Empty]
HasCurrent == \E i \in Slots : s.ops[i].kind # "none" /\ Current(i)
FreeOfWork == ~HasCurrent /\ ~s.busy
StockOf(x, invoice) == IF invoice = "A" THEN x.stockA ELSE x.stockB
SetStock(x, invoice) == IF invoice = "A" THEN [x EXCEPT !.stockA = 1] ELSE [x EXCEPT !.stockB = 1]

Apply(next, stale, startsReview, recovery, preservesSaved) ==
    /\ s' = next
    /\ staleSafe' = (staleSafe /\ (~stale \/ Ui(next) = Ui(s)))
    /\ reviewSafe' = (reviewSafe /\ (~startsReview \/ (s.exact /\ s.approved /\ s.result = "ready")))
    /\ stockSafe' = (stockSafe /\ (~recovery \/ Stocks(next) = Stocks(s)))
    /\ savedSafe' = (savedSafe /\ (~preservesSaved \/ ~s.saved \/ next.saved))

Init ==
    /\ s \in [invoice : {"A"}, phase : {"unchecked"}, saved : {FALSE}, exact : {FALSE},
              approved : {FALSE}, result : {"unchecked"}, busy : {FALSE}, focus : {FALSE},
              typed : {FALSE}, canEdit : BOOLEAN, complete : BOOLEAN, stockA : {0}, stockB : {0},
              ops : [Slots -> {Empty}]]
    /\ staleSafe = TRUE /\ reviewSafe = TRUE /\ stockSafe = TRUE /\ savedSafe = TRUE

BeginCheck(i) ==
    /\ Available(i) /\ FreeOfWork
    /\ s.phase \in {"unchecked", "blocked", "checkFailed", "savedCheckFailed", "reviewFailed", "ready"}
    /\ LET next == [s EXCEPT !.phase = IF s.saved THEN "savedChecking" ELSE "checking",
                              !.approved = FALSE, !.exact = FALSE, !.ops[i] = Operation("check")]
       IN Apply(IF Mutant = "retryStock" THEN SetStock(next, s.invoice) ELSE next,
                FALSE, FALSE, TRUE, TRUE)

CheckReady(i) ==
    /\ s.ops[i].kind = "check"
    /\ ~Current(i) \/ s.complete
    /\ LET next == IF Current(i) THEN [Retire(s, i) EXCEPT !.phase = "ready", !.exact = TRUE, !.result = "ready"]
                   ELSE Retire(s, i)
       IN Apply(next, ~Current(i), FALSE, TRUE, TRUE)

CheckBlocked(i, result) ==
    /\ s.ops[i].kind = "check"
    /\ result \in {"incomplete", "missing", "ambiguous", "malformed"}
    /\ LET next == IF Current(i) THEN [Retire(s, i) EXCEPT !.phase = "blocked", !.exact = FALSE, !.result = result]
                   ELSE Retire(s, i)
       IN Apply(next, ~Current(i), FALSE, TRUE, TRUE)

CheckFailure(i) ==
    /\ s.ops[i].kind = "check"
    /\ LET next == IF Current(i) THEN [Retire(s, i) EXCEPT
                       !.phase = IF s.saved THEN "savedCheckFailed" ELSE "checkFailed",
                       !.saved = IF Mutant = "loseSaved" THEN FALSE ELSE @,
                       !.exact = FALSE]
                   ELSE Retire(s, i)
       IN Apply(next, ~Current(i), FALSE, TRUE, TRUE)

EditProduct ==
    /\ FreeOfWork /\ s.canEdit /\ s.phase \in {"blocked", "saveFailed"}
    /\ Apply([s EXCEPT !.phase = "editing", !.typed = TRUE, !.approved = FALSE], FALSE, FALSE, TRUE, TRUE)

BeginSave(i) ==
    /\ Available(i) /\ FreeOfWork /\ s.canEdit /\ s.phase = "editing"
    /\ Apply([s EXCEPT !.phase = "saving", !.approved = FALSE, !.exact = FALSE,
                        !.ops[i] = Operation("save")], FALSE, FALSE, TRUE, TRUE)

SaveSuccess(i) ==
    /\ s.ops[i].kind = "save"
    /\ LET next == IF Current(i) THEN [s EXCEPT !.phase = "savedChecking", !.saved = TRUE,
                       !.complete = TRUE, !.ops[i] = Operation("check")]
                   ELSE Retire(s, i)
       IN Apply(next, ~Current(i), FALSE, TRUE, TRUE)

SaveFailure(i) ==
    /\ s.ops[i].kind = "save"
    /\ LET next == IF Current(i) THEN [Retire(s, i) EXCEPT !.phase = "saveFailed"] ELSE Retire(s, i)
       IN Apply(next, ~Current(i), FALSE, TRUE, TRUE)

AskColleague ==
    /\ FreeOfWork /\ ~s.canEdit /\ s.phase \in {"blocked", "saveFailed"}
    /\ Apply([s EXCEPT !.phase = "handoff"], FALSE, FALSE, TRUE, TRUE)

ColleagueCorrects ==
    /\ FreeOfWork /\ s.phase = "handoff"
    /\ Apply([s EXCEPT !.phase = "unchecked", !.complete = TRUE], FALSE, FALSE, TRUE, TRUE)

CorrectInvoice ==
    /\ FreeOfWork /\ s.phase = "blocked" /\ s.result \in {"missing", "ambiguous", "malformed"}
    /\ Apply([s EXCEPT !.phase = "unchecked", !.complete = TRUE, !.result = "unchecked",
                        !.approved = FALSE, !.exact = FALSE, !.saved = FALSE], FALSE, FALSE, TRUE, FALSE)

Approve ==
    /\ FreeOfWork /\ s.phase = "ready" /\ s.exact /\ ~s.approved
    /\ Apply([s EXCEPT !.approved = TRUE], FALSE, FALSE, TRUE, TRUE)

BeginReview(i) ==
    /\ Available(i) /\ FreeOfWork
    /\ IF Mutant = "prematureReview" THEN s.phase \in {"unchecked", "blocked", "ready"}
       ELSE s.phase = "ready" /\ s.exact /\ s.approved
    /\ Apply([s EXCEPT !.phase = "reviewing", !.busy = TRUE, !.ops[i] = Operation("saveDraft")],
             FALSE, FALSE, FALSE, TRUE)

DraftSaved(i) ==
    /\ s.ops[i].kind = "saveDraft"
    /\ LET next == IF Current(i) THEN [s EXCEPT !.ops[i].kind = "review"] ELSE Retire(s, i)
       IN Apply(next, ~Current(i), Current(i), FALSE, TRUE)

DraftFailure(i) ==
    /\ s.ops[i].kind = "saveDraft"
    /\ Apply([s EXCEPT !.ops[i].kind = "reviewError"], ~Current(i), FALSE, FALSE, TRUE)

ReviewReject(i) ==
    /\ s.ops[i].kind = "review"
    /\ Apply([s EXCEPT !.ops[i].kind = "reviewError"], ~Current(i), FALSE, FALSE, TRUE)

ReviewCatch(i) ==
    /\ s.ops[i].kind = "reviewError"
    /\ LET next == [s EXCEPT !.ops[i].kind = "reviewCleanup"]
           published == IF Current(i) \/ Mutant = "stalePublish"
                        THEN [next EXCEPT !.phase = "reviewFailed", !.exact = FALSE, !.approved = FALSE]
                        ELSE next
       IN Apply(published, ~Current(i), FALSE, FALSE, TRUE)

ReviewCleanup(i) ==
    /\ s.ops[i].kind = "reviewCleanup"
    /\ LET next == IF Current(i) THEN [s EXCEPT !.busy = FALSE, !.ops[i].kind = "focus"] ELSE Retire(s, i)
       IN Apply(next, ~Current(i), FALSE, FALSE, TRUE)

FocusCallback(i) ==
    /\ s.ops[i].kind = "focus"
    /\ LET next == IF Current(i) THEN [Retire(s, i) EXCEPT !.focus = ~@] ELSE Retire(s, i)
       IN Apply(next, ~Current(i), FALSE, FALSE, TRUE)

ReviewSuccess(i) ==
    /\ s.ops[i].kind = "review"
    /\ LET next == IF Current(i) THEN [s EXCEPT !.phase = "committing", !.ops[i].kind = "commit"]
                   ELSE Retire(s, i)
       IN Apply(next, ~Current(i), FALSE, FALSE, TRUE)

CommitSuccess(i) ==
    /\ s.ops[i].kind = "commit"
    /\ LET written == SetStock(s, s.ops[i].invoice)
           next == IF Current(i) THEN [written EXCEPT !.phase = "readingBack", !.ops[i].kind = "readback"]
                   ELSE Retire(written, i)
       IN Apply(next, ~Current(i), FALSE, FALSE, TRUE)

CommitLost(i, didWrite) ==
    /\ s.ops[i].kind = "commit"
    /\ LET written == IF didWrite THEN SetStock(s, s.ops[i].invoice) ELSE s
           next == IF Current(i) THEN [Retire(written, i) EXCEPT !.phase = "stockUnknown", !.busy = FALSE]
                   ELSE Retire(written, i)
       IN Apply(next, ~Current(i), FALSE, FALSE, TRUE)

RetryReadback(i) ==
    /\ Available(i) /\ FreeOfWork /\ s.phase = "stockUnknown"
    /\ Apply([s EXCEPT !.phase = "readingBack", !.busy = TRUE, !.ops[i] = Operation("readback")],
             FALSE, FALSE, TRUE, TRUE)

ReadbackSuccess(i) ==
    /\ s.ops[i].kind = "readback"
    /\ LET next == IF Current(i) THEN [Retire(s, i) EXCEPT
                       !.phase = IF StockOf(s, s.invoice) = 1 THEN "committed" ELSE "ready", !.busy = FALSE]
                   ELSE Retire(s, i)
       IN Apply(next, ~Current(i), FALSE, TRUE, TRUE)

ReadbackFailure(i) ==
    /\ s.ops[i].kind = "readback"
    /\ LET next == IF Current(i) THEN [Retire(s, i) EXCEPT !.phase = "stockUnknown", !.busy = FALSE]
                   ELSE Retire(s, i)
       IN Apply(next, ~Current(i), FALSE, TRUE, TRUE)

ReplaceEditor ==
    /\ s.invoice = "A"
    /\ Apply([s EXCEPT !.invoice = "B", !.phase = "unchecked", !.saved = FALSE, !.exact = FALSE,
                        !.approved = FALSE, !.result = "unchecked", !.busy = FALSE, !.focus = FALSE,
                        !.typed = FALSE, !.complete = FALSE,
                        !.ops = [i \in Slots |-> [s.ops[i] EXCEPT !.current = FALSE]]],
             FALSE, FALSE, TRUE, FALSE)

InvalidateEditor ==
    /\ s.phase \in {"unchecked", "checking", "blocked", "editing", "saving", "saveFailed",
                     "savedChecking", "checkFailed", "savedCheckFailed", "ready", "reviewing", "reviewFailed", "handoff"}
    /\ Apply([s EXCEPT !.phase = "unchecked", !.saved = FALSE, !.exact = FALSE, !.approved = FALSE,
                        !.result = "unchecked", !.typed = FALSE, !.busy = FALSE,
                        !.ops = [i \in Slots |-> [s.ops[i] EXCEPT !.current = FALSE]]],
             FALSE, FALSE, TRUE, FALSE)

Next ==
    \/ \E i \in Slots : BeginCheck(i) \/ CheckReady(i) \/ CheckFailure(i) \/ BeginSave(i)
         \/ SaveSuccess(i) \/ SaveFailure(i) \/ BeginReview(i) \/ DraftSaved(i) \/ DraftFailure(i)
         \/ ReviewReject(i) \/ ReviewCatch(i)
         \/ ReviewCleanup(i) \/ FocusCallback(i) \/ ReviewSuccess(i) \/ CommitSuccess(i) \/ RetryReadback(i)
         \/ ReadbackSuccess(i) \/ ReadbackFailure(i)
    \/ \E i \in Slots, result \in Results \ {"unchecked", "ready"} : CheckBlocked(i, result)
    \/ \E i \in Slots, didWrite \in BOOLEAN : CommitLost(i, didWrite)
    \/ EditProduct \/ AskColleague \/ ColleagueCorrects \/ CorrectInvoice \/ Approve
    \/ ReplaceEditor \/ InvalidateEditor

TypeOK ==
    /\ s.invoice \in {"A", "B"} /\ s.phase \in Phases /\ s.result \in Results
    /\ s.stockA \in 0..1 /\ s.stockB \in 0..1
    /\ s.saved \in BOOLEAN /\ s.exact \in BOOLEAN /\ s.approved \in BOOLEAN
    /\ s.busy \in BOOLEAN /\ s.focus \in BOOLEAN /\ s.typed \in BOOLEAN
    /\ s.canEdit \in BOOLEAN /\ s.complete \in BOOLEAN
    /\ \A i \in Slots : s.ops[i] \in [kind : Kinds, current : BOOLEAN, invoice : {"A", "B"}]
ExactReadiness == (s.phase = "ready" \/ s.approved) => (s.exact /\ s.result = "ready" /\ s.complete)
SavedFailureTruthful == s.phase = "savedCheckFailed" => s.saved
SaveFailureRetainsEntries == s.phase = "saveFailed" => s.typed
Safety == TypeOK /\ ExactReadiness /\ SavedFailureTruthful /\ SaveFailureRetainsEntries
          /\ staleSafe /\ reviewSafe /\ stockSafe /\ savedSafe
Spec == Init /\ [][Next]_vars
=============================================================================
