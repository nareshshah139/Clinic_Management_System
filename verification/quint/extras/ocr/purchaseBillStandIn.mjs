// In-memory port of the PharmacyPurchaseInvoiceService guards at 09d2709, one bill with one line.
// Line numbers are in backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts.
// MUTANT removes one guard, to show the replay catches it.
const MUTANT = process.env.MUTANT;
const has = (...names) => names.includes(MUTANT);
class Refused extends Error {}
const refuse = () => { throw new Refused(); };
const EDITABLE = ['DRAFT', 'OCR_REVIEW_REQUIRED', 'RECONCILIATION_FAILED'];

export async function open(content) {
  let clock = 0;
  const bill = { status: 'DRAFT', stockCommittedAt: null, updatedAt: 0, unresolvedOcrFlags: 0, hasIssues: false, lowConf: false, posts: 0 };
  const touch = () => { bill.updatedAt = ++clock; };  // @updatedAt moves on every write
  const posted = () => bill.status === 'STOCK_COMMITTED' || bill.stockCommittedAt;
  const save = ({ ocr, issues, lowConf }) => {  // draftData :1020 and validatePurchaseInvoice :2959
    Object.assign(bill, { unresolvedOcrFlags: ocr ? 1 : 0, hasIssues: issues, lowConf, status: ocr ? 'OCR_REVIEW_REQUIRED' : issues ? 'RECONCILIATION_FAILED' : 'DRAFT' });
    touch();
  };
  save(content);

  const commit = () => {  // commitStockInTransaction :1448
    if (posted() && !has('no-commit-idempotent')) return;                                                    // :1463
    if (bill.status !== 'REVIEWED' && !has('no-commit-status', 'no-commit-precheck')) refuse();              // :1666
    if (bill.unresolvedOcrFlags > 0 || bill.hasIssues) refuse();                                              // :1676, :1682
    if (bill.stockCommittedAt || (bill.status !== 'REVIEWED' && !has('no-commit-status', 'no-claim-status'))) refuse(); // claim :1471-1477, then :1502
    bill.status = 'STOCK_COMMITTED'; bill.stockCommittedAt = clock + 1; touch(); bill.posts += 1;             // :1478-1483
  };
  const calls = {
    edit({ content }) {  // updateDraft :1082
      if (!EDITABLE.includes(bill.status) && !has('no-edit-guard')) refuse();                                // :1089, :1093
      save(content);                                                                                          // :1091, :1099
    },
    review({ expected }) {  // markReviewed :1308
      if (expected !== undefined && expected !== bill.updatedAt && !has('no-review-revision')) refuse();     // :1323
      if (posted()) refuse();                                                                                 // :1326
      if (bill.status === 'CANCELLED') refuse();                                                              // :1329
      if (bill.unresolvedOcrFlags > 0 && !has('no-review-flag-check')) refuse();                              // :1343
      if (bill.hasIssues) refuse();                                                                           // :1347
      Object.assign(bill, { status: 'REVIEWED', unresolvedOcrFlags: 0, hasIssues: false }); touch();          // :1357-1368
    },
    reopen({ expected }) {  // reopenReview :1389
      if ((bill.status !== 'REVIEWED' && !has('reopen-any-status')) || bill.stockCommittedAt) refuse();      // :1402
      if (bill.stockCommittedAt || (bill.status !== 'REVIEWED' && !has('reopen-any-status')) ||
          (expected !== bill.updatedAt && !has('no-reopen-revision'))) refuse();                              // claim :1405-1411
      bill.status = 'DRAFT'; touch();                                                                         // :1407
    },
    reject({ expected }) {  // rejectUnpostedInvoice :449
      if (posted() && !has('reject-posted', 'no-reject-precheck')) refuse();                                  // :455
      const claimable = [...EDITABLE, 'REVIEWED', ...(has('reject-posted') ? ['STOCK_COMMITTED'] : [])];     // :457
      if ((bill.stockCommittedAt && !has('reject-posted')) || (expected !== bill.updatedAt && !has('no-reject-revision')) ||
          !claimable.includes(bill.status)) refuse();                                                         // claim :456-458
      bill.status = 'CANCELLED'; touch();
    },
    commit,
    process() {  // processInvoiceAttempt :555, one transaction that rolls back on a throw
      if (posted() || bill.status === 'CANCELLED') return;                                                    // :564, :567
      const before = { ...bill };
      try {
        touch();                                                                                              // claim :572
        if (bill.unresolvedOcrFlags > 0 || bill.hasIssues || (bill.lowConf && !has('no-lowconf-check'))) {   // :584-613, confidence at :594
          Object.assign(bill, { status: bill.unresolvedOcrFlags > 0 ? 'OCR_REVIEW_REQUIRED' : 'RECONCILIATION_FAILED', hasIssues: true }); touch(); // :616-629
          return;
        }
        Object.assign(bill, { status: 'REVIEWED', unresolvedOcrFlags: 0, hasIssues: false }); touch();       // :632-634
        commit();                                                                                             // :638
      } catch (e) {
        if (!(e instanceof Refused)) throw e;
        Object.assign(bill, before);                                                                          // :641-651 answers SAVED_FOR_REVIEW
      }
    },
  };
  return {
    async apply(action, picks) {
      try { calls[action](picks); return 'Ok'; } catch (e) { if (e instanceof Refused) return 'Refused'; throw e; }
    },
    async view() {
      return {
        status: bill.status, committed: !!bill.stockCommittedAt, ocr: bill.unresolvedOcrFlags > 0, issues: bill.hasIssues,
        posts: bill.posts, updatedAt: bill.updatedAt,
      };
    },
  };
}
