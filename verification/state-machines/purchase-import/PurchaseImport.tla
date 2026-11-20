---------------------------- MODULE PurchaseImport ----------------------------
(* One OCR purchase import attempt, PharmacyPurchaseImportAttempt, and the draft
   bill its worker may save.

   Two requests carry the same attempt id: the first upload and the client's
   retry. Each registers the attempt, reads the bill with OCR, saves a draft bill
   in the claim-and-bind transaction, adds its stock, and records the outcome.
   The pharmacist may stop the import, a manager may recover it, and the
   pharmacist may press Add to stock on the saved draft. A worker process may
   die at any point after registering.

   MODE "code" is the code today. "fixed" adds the one guard the model asks
   for. Every other mode is "fixed" with one guard removed. *)
EXTENDS Naturals

CONSTANTS Workers, MODE

ASSUME MODE \in {"code", "fixed", "typeProbe", "noClaim", "bindOutsideTx",
                 "finalizeByIdOnly", "checkOutsideTx", "retryReregisters",
                 "resolveRefusesRunning", "noFinalizeOnError"}

Statuses == {"ABSENT", "RUNNING", "INVOICE_SAVED", "NO_STOCK_WRITTEN", "RETRY_REJECTED"}
Terminal == {"NO_STOCK_WRITTEN", "RETRY_REJECTED"}
Links == {"none", "mine", "other"}
Pcs == {"idle", "extracting", "saving", "binding", "checking", "posting",
        "finishing", "done", "crashed"}
Live == {"extracting", "saving", "binding", "checking", "posting", "finishing"}
Results == {"none", "fail", "mine", "other"}
DeskPcs == {"idle", "checking", "posting", "done"}

(* status        PharmacyPurchaseImportAttempt.status, ABSENT before the row exists
   link          purchaseInvoiceId: none, the bill this attempt's worker saved
                 (mine), or a bill that already existed (other)
   saved         bills this attempt's workers created
   committed     the saved bill's stockCommittedAt is set
   posts         stock postings of the saved bill
   pc, result    each request's position and what run() returned
   seen          what each poster read about committed before it wrote
   desk          the pharmacist's Add to stock click on the saved draft
   history       every status the attempt has held *)
VARIABLES status, link, saved, committed, posts, pc, result, seen, desk, deskSeen, history

vars == <<status, link, saved, committed, posts, pc, result, seen, desk, deskSeen, history>>

KeepsSaved == MODE # "code"

\* CHECK purchase_import_outcome, migration 20261024150000. A write that breaks it fails.
CheckOK(s, l) ==
  /\ s \in {"RUNNING", "NO_STOCK_WRITTEN"} => l = "none"
  /\ s = "INVOICE_SAVED" => l # "none"

\* Trigger purchase_recovery_commit refuses stock for a bill a rejected attempt names.
Blocked == status = "RETRY_REJECTED" /\ link = "mine"

Write(s, l) ==
  /\ status' = s
  /\ link' = l
  /\ history' = history \cup {s}

Init ==
  /\ status = "ABSENT"
  /\ link = IF MODE = "typeProbe" THEN "unbound" ELSE "none"
  /\ saved = 0
  /\ committed = FALSE
  /\ posts = 0
  /\ pc = [w \in Workers |-> "idle"]
  /\ result = [w \in Workers |-> "none"]
  /\ seen = [w \in Workers |-> FALSE]
  /\ desk = "idle"
  /\ deskSeen = FALSE
  /\ history = {"ABSENT"}

\* execute(): create the RUNNING row. A second request gets P2002 and only reads.
WorkerRegisters(w) ==
  /\ pc[w] = "idle"
  /\ IF status = "ABSENT"
       THEN Write("RUNNING", "none") /\ pc' = [pc EXCEPT ![w] = "extracting"]
     ELSE IF MODE = "retryReregisters" /\ CheckOK("RUNNING", link)
       THEN Write("RUNNING", link) /\ pc' = [pc EXCEPT ![w] = "extracting"]
     ELSE UNCHANGED <<status, link, history>> /\ pc' = [pc EXCEPT ![w] = "done"]
  /\ UNCHANGED <<saved, committed, posts, result, seen, desk, deskSeen>>

\* run(): OCR reads the bill. It finds a new bill, an existing bill, or throws.
OcrReadsBill(w) ==
  /\ pc[w] = "extracting"
  /\ \E r \in {"save", "other", "fail"} :
       /\ pc' = [pc EXCEPT ![w] = IF r = "save" THEN "saving" ELSE "finishing"]
       /\ result' = [result EXCEPT ![w] = IF r = "save" THEN "none" ELSE r]
  /\ UNCHANGED <<status, link, saved, committed, posts, seen, desk, deskSeen, history>>

\* createDraft: claimPurchaseImport, create the bill, bindPurchaseImport, one transaction.
WorkerSavesDraft(w) ==
  /\ pc[w] = "saving"
  /\ IF MODE = "bindOutsideTx"
       THEN IF status = "RUNNING"
              THEN /\ saved' = saved + 1
                   /\ result' = [result EXCEPT ![w] = "mine"]
                   /\ pc' = [pc EXCEPT ![w] = "binding"]
                   /\ UNCHANGED <<status, link, history>>
              ELSE /\ pc' = [pc EXCEPT ![w] = "finishing"]
                   /\ UNCHANGED <<status, link, history, saved, result>>
     ELSE IF status = "RUNNING" \/ MODE = "noClaim"
       THEN /\ saved' = saved + 1
            /\ Write("INVOICE_SAVED", "mine")
            /\ result' = [result EXCEPT ![w] = "mine"]
            /\ pc' = [pc EXCEPT ![w] = "checking"]
       ELSE /\ pc' = [pc EXCEPT ![w] = "finishing"]
            /\ UNCHANGED <<status, link, history, saved, result>>
  /\ UNCHANGED <<committed, posts, seen, desk, deskSeen>>

\* Only in bindOutsideTx: the bind runs after the bill's transaction committed.
WorkerBindsDraft(w) ==
  /\ pc[w] = "binding"
  /\ Write("INVOICE_SAVED", "mine")
  /\ pc' = [pc EXCEPT ![w] = "checking"]
  /\ UNCHANGED <<saved, committed, posts, result, seen, desk, deskSeen>>

\* processInvoice reads the bill; commitStockInTransaction claims it and adds stock.
WorkerReadsBill(w) ==
  /\ pc[w] = "checking"
  /\ seen' = [seen EXCEPT ![w] = committed]
  /\ pc' = [pc EXCEPT ![w] = "posting"]
  /\ UNCHANGED <<status, link, saved, committed, posts, result, desk, deskSeen, history>>

Post(already) ==
  IF ~already /\ ~Blocked
    THEN committed' = TRUE /\ posts' = posts + 1
    ELSE UNCHANGED <<committed, posts>>

Already(read) == IF MODE = "checkOutsideTx" THEN read ELSE committed

WorkerAddsStock(w) ==
  /\ pc[w] = "posting"
  /\ Post(Already(seen[w]))
  /\ pc' = [pc EXCEPT ![w] = "finishing"]
  /\ UNCHANGED <<status, link, saved, result, seen, desk, deskSeen, history>>

\* execute(): updateMany where status RUNNING records what run() returned.
WorkerRecordsOutcome(w) ==
  /\ pc[w] = "finishing"
  /\ LET s == IF result[w] \in {"mine", "other"} THEN "INVOICE_SAVED" ELSE "NO_STOCK_WRITTEN"
         l == IF result[w] \in {"mine", "other"} THEN result[w] ELSE "none"
     IN IF /\ status = "RUNNING" \/ MODE = "finalizeByIdOnly"
           /\ ~(MODE = "noFinalizeOnError" /\ result[w] = "fail")
           /\ CheckOK(s, l)
          THEN Write(s, l)
          ELSE UNCHANGED <<status, link, history>>
  /\ pc' = [pc EXCEPT ![w] = "done"]
  /\ UNCHANGED <<saved, committed, posts, result, seen, desk, deskSeen>>

WorkerDies(w) ==
  /\ pc[w] \in Live
  /\ pc' = [pc EXCEPT ![w] = "crashed"]
  /\ UNCHANGED <<status, link, saved, committed, posts, result, seen, desk, deskSeen, history>>

\* commitStock from the Add to stock button, once, on the saved draft.
PharmacistOpensDraft ==
  /\ desk = "idle"
  /\ saved > 0
  /\ deskSeen' = committed
  /\ desk' = "checking"
  /\ UNCHANGED <<status, link, saved, committed, posts, pc, result, seen, history>>

PharmacistAddsStock ==
  /\ desk = "checking"
  /\ Post(Already(deskSeen))
  /\ desk' = "done"
  /\ UNCHANGED <<status, link, saved, pc, result, seen, deskSeen, history>>

OnlyAttemptChanges == UNCHANGED <<saved, committed, posts, pc, result, seen, desk, deskSeen>>

\* resolve(): create a tombstone, or updateMany where status RUNNING.
PharmacistStopsImport ==
  /\ \/ status = "ABSENT"
     \/ status = "RUNNING" /\ MODE # "resolveRefusesRunning"
  /\ Write("NO_STOCK_WRITTEN", "none")
  /\ OnlyAttemptChanges

(* recoverDelegated under the branch lock and the row lock. stray: the request
   names an original that is linked to another, already saved bill. The
   workbench adds the original it has open to sourceDocumentIds. *)
ManagerRecovers ==
  /\ \E stray \in BOOLEAN :
    \/ /\ status \in {"ABSENT", "RUNNING"}
       /\ IF stray THEN Write("INVOICE_SAVED", "other") ELSE Write("NO_STOCK_WRITTEN", "none")
    \/ /\ status = "INVOICE_SAVED" /\ link = "mine" /\ stray
       /\ ~KeepsSaved
       /\ Write("RETRY_REJECTED", "mine")
  /\ OnlyAttemptChanges

Server(w) ==
  OcrReadsBill(w) \/ WorkerSavesDraft(w) \/ WorkerBindsDraft(w) \/ WorkerReadsBill(w)
  \/ WorkerAddsStock(w) \/ WorkerRecordsOutcome(w)

Next ==
  \/ \E w \in Workers : WorkerRegisters(w) \/ Server(w) \/ WorkerDies(w)
  \/ PharmacistOpensDraft \/ PharmacistAddsStock
  \/ PharmacistStopsImport
  \/ ManagerRecovers

\* Weak fairness on the worker's own steps only: the server process, the database
\* and the OCR provider eventually answer. No fairness on any person's action.
Spec == Init /\ [][Next]_vars /\ \A w \in Workers : WF_vars(Server(w))

TypeOK ==
  /\ status \in Statuses
  /\ link \in Links
  /\ saved \in 0..1
  /\ committed \in BOOLEAN
  /\ posts \in 0..2
  /\ pc \in [Workers -> Pcs]
  /\ result \in [Workers -> Results]
  /\ seen \in [Workers -> BOOLEAN]
  /\ desk \in DeskPcs
  /\ deskSeen \in BOOLEAN
  /\ history \subseteq Statuses

\* Once the attempt leaves RUNNING it never returns to RUNNING.
NeverRunningAgain == status = "RUNNING" => history \subseteq {"ABSENT", "RUNNING"}

\* Stopped and rejected attempts keep their outcome. A late worker cannot overwrite it.
TerminalStaysTerminal == \A t \in Terminal : t \in history => status = t

\* An attempt that saved a bill keeps saying so.
SavedStaysSaved == "INVOICE_SAVED" \in history => status = "INVOICE_SAVED"

\* A bill the worker saved is always recorded on the attempt, so the attempt never
\* says no stock while that bill exists.
InvoiceRecorded == saved > 0 => link = "mine"

\* The saved bill adds stock at most once.
StockOnce == posts <= 1

\* While the attempt is RUNNING, the pharmacist can always stop it.
ResolveAlwaysPossible == status = "RUNNING" => ENABLED PharmacistStopsImport

\* Unless a worker process dies, a RUNNING attempt leaves RUNNING with nobody acting.
RunningSettles ==
  [](status = "RUNNING" => <>(status # "RUNNING" \/ \E w \in Workers : pc[w] = "crashed"))
=============================================================================
