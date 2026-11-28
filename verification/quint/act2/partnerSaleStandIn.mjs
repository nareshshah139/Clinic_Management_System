// In-memory port of PharmacyPartnerSalesService.commitStock and reconcileLine at bc29d1e,
// one sale with one line. MUTANT removes one guard, to show the replay catches it.
const MUTANT = process.env.MUTANT;
class Refused extends Error {}

export async function open({ onHand }) {
  const batches = [{ currentStock: onHand, heldStock: 0 }];
  const sale = { status: 'SUBMITTED', version: 0 };
  const item = { quantitySold: 7, committedQuantity: 0, batch: 0 };
  const requireVersion = (v) => { if (!Number.isSafeInteger(v) || v < 0) throw new Refused(); }; // :554
  const derive = (sold, committed, discrepancy) => {                                            // :709
    if (committed >= sold && sold > 0) return 'STOCK_COMMITTED';
    if (committed > 0) return 'PARTIAL_STOCK_COMMITTED';
    if (MUTANT === 'drop-discrepancy') return 'STOCK_COMMITTED';
    return discrepancy ? 'RECONCILIATION_REQUIRED' : 'STOCK_COMMITTED';                          // :716
  };
  const calls = {
    commitStock({ v }) {
      requireVersion(v);
      if (sale.status === 'CANCELLED') throw new Refused();                                         // :307
      if (MUTANT !== 'no-done-shortcut' && item.committedQuantity >= item.quantitySold) return;     // :325
      if (MUTANT !== 'no-version-check' && sale.version !== v) throw new Refused();                 // :332 and the claim at :335
      sale.version += 1;
      const batch = batches[item.batch];
      const take = Math.min(item.quantitySold - item.committedQuantity, Math.max(0, batch.currentStock - batch.heldStock)); // :604
      batch.currentStock -= take;
      item.committedQuantity += take;
      sale.status = derive(item.quantitySold, item.committedQuantity, item.committedQuantity < item.quantitySold);
    },
    matchBatch({ v, available }) {
      requireVersion(v);
      if (sale.status === 'CANCELLED' || item.committedQuantity >= item.quantitySold) throw new Refused(); // :564
      if (sale.version !== v) throw new Refused();                                                          // :489
      sale.version += 1;
      item.batch = batches.push({ currentStock: available, heldStock: 0 }) - 1;
    },
  };
  return {
    async apply(action, picks) {
      try { calls[action](picks); return 'Ok'; } catch (e) { if (e instanceof Refused) return 'Refused'; throw e; }
    },
    async view() {
      const b = batches[item.batch];
      return { status: sale.status, version: sale.version, committed: item.committedQuantity, onHand: b.currentStock - b.heldStock };
    },
  };
}
