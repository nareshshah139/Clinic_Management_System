// Scanned purchase bill (PharmacyPurchaseInvoiceStatus): one bill, one line.
// Every coded action cites backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts at 09d2709.
module purchaseBill {
  type Status = Draft | OcrReviewRequired | ReconciliationFailed | Reviewed | StockCommitted | Cancelled
  type Reply = Ok | Refused
  type Option[a] = Some(a) | None

  type Bill = {
    status: Status,
    committed: bool,  // stockCommittedAt is set
    rev: int,         // updatedAt: every write moves it
    ocr: bool,        // unresolvedOcrFlags > 0
    issues: bool,     // reconciliationIssues is not empty
    lowConf: bool,    // an OCR line under 98% confidence: process refuses the bill, review does not (:594)
    posts: int,       // stock postings for this bill
    // ghosts, not in the code
    content: int,     // edits so far
    editRev: int,     // the rev the last edit produced
    approved: int,    // the content version on the screen of whoever last approved the bill
    reopened: bool,
  }
  var bill: Bill
  var reply: Reply

  // What a save leaves on the bill: 0-3 nothing, 4 an OCR flag, 5 a reconciliation issue,
  // 6 a line under 98% confidence, 7 all three. The status follows the flags (validatePurchaseInvoice :2959).
  pure def withFlags(b: Bill, k: int): Bill = {
    val o = k == 4 or k == 7
    { ...b, ocr: o, issues: k == 5 or k == 7, lowConf: k == 6 or k == 7,
      status: if (o) OcrReviewRequired else if (k == 5) ReconciliationFailed else Draft }
  }

  action init = {
    nondet flags = 0.to(7).oneOf()  // createDraft (:991) saves the same way
    all {
      bill' = withFlags({ status: Draft, committed: false, rev: 0, ocr: false, issues: false, lowConf: false, posts: 0,
                          content: 0, editRev: 0, approved: 0, reopened: false }, flags),
      reply' = Ok,
    }
  }

  action answer(r: Reply, b: Bill): bool = all { reply' = r, bill' = b }
  action refuse: bool = answer(Refused, bill)

  pure def posted(b: Bill): bool = b.status == StockCommitted or b.committed  // :564, :1326, :1463
  pure def editable(s: Status): bool = s == Draft or s == OcrReviewRequired or s == ReconciliationFailed  // :1089

  // updateDraft (:1082). Not modelled: its optional expectedUpdatedAt (:1090), so every edit lands.
  action edit(flags: int): bool =
    if (not(editable(bill.status))) refuse  // :1089, :1093
    else answer(Ok, { ...withFlags(bill, flags), rev: bill.rev + 1, content: bill.content + 1, editRev: bill.rev + 1 })  // :1091, :1099

  // markReviewed (:1308). `expected` is the optional expectedUpdatedAt (dto :608), `seen` the revision on the reviewer's screen.
  // A bill already REVIEWED may be reviewed again: nothing at :1326-:1331 refuses it.
  action review(expected: Option[int], seen: int): bool = {
    val stale = match expected { | Some(e) => e != bill.rev | None => false }  // :1323
    if (stale or posted(bill) or bill.status == Cancelled or bill.ocr or bill.issues) refuse  // :1326, :1329, :1343, :1347
    else answer(Ok, { ...bill, status: Reviewed, rev: bill.rev + 1,  // :1357-1368
      approved: if (seen >= bill.editRev) bill.content else bill.content - 1 })
  }

  // reopenReview (:1389). The expectedUpdatedAt is required (dto :595).
  action reopen(expected: int): bool =
    if (bill.status != Reviewed or bill.committed) refuse  // :1402
    else if (expected != bill.rev) refuse                  // claim on updatedAt, :1405-1411
    else answer(Ok, { ...bill, status: Draft, rev: bill.rev + 1, reopened: true })  // :1407

  // rejectUnpostedInvoice (:449). The expectedUpdatedAt is required (dto :700).
  action reject(expected: int): bool =
    if (posted(bill)) refuse                                          // :455
    else if (expected != bill.rev or bill.status == Cancelled) refuse // claim on updatedAt and status, :456-458
    else answer(Ok, { ...bill, status: Cancelled, rev: bill.rev + 1 })

  // commitStock (:1429), commitStockInTransaction (:1448)
  action commit: bool =
    if (posted(bill)) answer(Ok, bill)            // returned as is, :1463
    else if (bill.status != Reviewed) refuse      // :1666, and the claim at :1475
    else answer(Ok, { ...bill, status: StockCommitted, committed: true, posts: bill.posts + 1, rev: bill.rev + 1 })  // :1471-1484

  // processInvoice (:551) never refuses. It answers SAVED_FOR_REVIEW and goes on.
  action process: bool =
    if (posted(bill) or bill.status == Cancelled) answer(Ok, bill)  // :564, :567
    else if (bill.ocr or bill.issues or bill.lowConf)               // any check fails, :584-613
      answer(Ok, { ...bill, status: if (bill.ocr) OcrReviewRequired else ReconciliationFailed, issues: true, rev: bill.rev + 1 })  // :616-629
    else answer(Ok, { ...bill, status: StockCommitted, committed: true, posts: bill.posts + 1, rev: bill.rev + 1,
      approved: bill.content })  // reviews and commits the row it claimed, :632-639

  // A screen shows the current revision, the one before it, or the first one the client loaded.
  action stepOf(sends: Set[bool]): bool = {
    nondet seen = Set(0, bill.rev - 1, bill.rev).filter(r => r >= 0).oneOf()
    nondet send = sends.oneOf()
    nondet flags = 0.to(7).oneOf()
    any {
      edit(flags),
      review(if (send) Some(seen) else None, seen),
      reopen(seen),
      reject(seen),
      commit,
      process,
    }
  }
  action stepCoded = stepOf(Set(true, false))  // the API lets a review omit expectedUpdatedAt
  action stepClient = stepOf(Set(true))        // PurchaseInvoiceWorkbench.tsx:2584 and :3052 always send it
  action step = stepCoded

  invariant postsAtMostOnce = bill.posts <= 1
  invariant postedIffCommitted = (bill.status == StockCommitted) == bill.committed
  invariant cancelledNeverPosted = bill.status == Cancelled implies bill.posts == 0

  // Design question: a bill that posts stock was approved on the content it posts.
  invariant postedWhatWasSeen = bill.posts == 1 implies bill.approved == bill.content

  // States we expect to reach, so the passes above are not vacuous.
  observation reopenedThenPosted = bill.reopened and bill.posts == 1
  observation lowConfPostedByHand = bill.posts == 1 and bill.lowConf  // review accepts what process refuses
  observation approvedUnseen = bill.status == Reviewed and bill.approved != bill.content
}
