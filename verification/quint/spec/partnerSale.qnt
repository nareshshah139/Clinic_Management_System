// Partner daily sale (PartnerDailySaleStatus): one sale with one line.
// Every coded action cites backend/src/modules/pharmacy/pharmacy-partner-sales.service.ts at bc29d1e.
module partnerSale {
  type Status = Submitted | StockCommitted | PartialStockCommitted | ReconciliationRequired | Cancelled
  type Reply = Ok | Refused

  pure val SOLD = 7        // line.quantitySold
  pure val INIT_STOCK = 5  // available units in batch A when the sale arrives

  var status: Status
  var version: int
  var committed: int  // line.committedQuantity
  var onHand: int     // available units (currentStock - heldStock) in the batch the line draws from
  var reply: Reply
  var deducted: int   // units ever taken off a shelf for this sale
  var returned: int   // units ever written back to a shelf

  action init = all {
    status' = Submitted, version' = 0, committed' = 0, onHand' = INIT_STOCK,
    reply' = Ok, deducted' = 0, returned' = 0,
  }

  action keep(r: Reply): bool = all {
    reply' = r, status' = status, version' = version, committed' = committed,
    onHand' = onHand, deducted' = deducted, returned' = returned,
  }

  // deriveCommittedStatus (:709). With one line and one candidate batch, a short commit
  // always carries INSUFFICIENT_STOCK, so hasDiscrepancy is committed < SOLD.
  pure def derive(c: int): Status =
    if (c >= SOLD) StockCommitted else if (c > 0) PartialStockCommitted else ReconciliationRequired

  // commitStock (:293), commitSaleItem (:604)
  action commitStock(v: int): bool =
    if (v < 0 or status == Cancelled) keep(Refused)  // requireVersion :297, :307
    else if (committed >= SOLD) keep(Ok)             // fully committed: return as is, :325
    else if (v != version) keep(Refused)             // stale expectedVersion, :332
    else {
      val take = if (SOLD - committed < onHand) SOLD - committed else onHand
      all {
        reply' = Ok, version' = version + 1, committed' = committed + take,
        onHand' = onHand - take, deducted' = deducted + take, returned' = returned,
        status' = derive(committed + take),
      }
    }

  // reconcileLine (:465): staff re-match the line to a batch with `available` units.
  action matchBatch(v: int, available: int): bool =
    if (v < 0 or status == Cancelled or committed >= SOLD) keep(Refused)  // :474, :564
    else if (v != version) keep(Refused)                                   // :489
    else all {
      reply' = Ok, version' = version + 1, onHand' = available,
      status' = status, committed' = committed, deducted' = deducted, returned' = returned,
    }

  // Not coded. CANCELLED is in the enum (:23), refused at :307 and :564, and rendered by
  // PartnerDailySync.tsx:692, but nothing writes it. compensate is the open design question:
  // does cancel write committed units back to the shelf?
  action cancel(v: int, compensate: bool): bool =
    if (v < 0 or status == Cancelled or committed >= SOLD or v != version) keep(Refused)
    else all {
      reply' = Ok, status' = Cancelled, version' = version + 1, committed' = committed,
      onHand' = if (compensate) onHand + committed else onHand,
      returned' = if (compensate) returned + committed else returned,
      deducted' = deducted,
    }

  // The client sends the version it last saw: the current one, or one behind (a stale retry).
  val versions = Set(version - 1, version).filter(x => x >= 0)

  action stepCoded = {
    nondet v = versions.oneOf()
    nondet available = 0.to(INIT_STOCK).oneOf()
    any { commitStock(v), matchBatch(v, available) }
  }

  action stepOpen = {
    nondet v = versions.oneOf()
    nondet available = 0.to(INIT_STOCK).oneOf()
    nondet compensate = Bool.oneOf()
    any { commitStock(v), matchBatch(v, available), cancel(v, compensate) }
  }

  action stepDecided = {
    nondet v = versions.oneOf()
    nondet available = 0.to(INIT_STOCK).oneOf()
    any { commitStock(v), matchBatch(v, available), cancel(v, true) }
  }

  action step = stepOpen

  // Every unit that left a shelf is held by a live sale.
  invariant stockConserved = deducted - returned == (if (status == Cancelled) 0 else committed)
  invariant committedNeverExceedsSold = committed <= SOLD

  // A state we expect to reach, so the pass above is not vacuous.
  observation cancelledPartially = status == Cancelled and committed > 0
}
