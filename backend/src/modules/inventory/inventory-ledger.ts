import { jsonObject, movementDelta } from './inventory-stock';

/**
 * @cc [owner:nareshshah139] independently-anchored-ledger
 * Ledger agreement MUST use a recorded physical checkpoint plus subsequent signed movements,
 * never infer its baseline from current stock. Missing checkpoints or unknown subsequent deltas
 * MUST remain unverified; movements covered by the checkpoint retain their original history.
 */
export function reconcileInventoryLedger(item: any, movements: any[]) {
  const checkpoint = jsonObject(item.metadata).ledgerCheckpoint;
  const valid = checkpoint && Number.isSafeInteger(checkpoint.quantity) && checkpoint.quantity >= 0
    && typeof checkpoint.documentId === 'string' && Array.isArray(checkpoint.coveredMovementIds)
    && checkpoint.coveredMovementIds.every((id: unknown) => typeof id === 'string');
  const covered = new Set<string>(valid ? checkpoint.coveredMovementIds : []);
  const present = new Set(movements.map(m => m.id));
  const missingHistory = [...covered].some(id => !present.has(id));
  let closing: number | null = valid && !missingHistory ? checkpoint.quantity : null;
  const rows = movements.map(m => {
    const delta = movementDelta(m), includedInCheckpoint = valid && covered.has(m.id);
    if (!includedInCheckpoint) closing = closing === null || delta === null ? null : closing + delta;
    return { ...m, delta, includedInCheckpoint: !!includedInCheckpoint, closing: includedInCheckpoint ? null : closing };
  });
  const difference = closing === null ? null : item.currentStock - closing;
  return {
    checkpoint: valid ? checkpoint : null,
    status: closing === null ? 'UNVERIFIED' : difference === 0 ? 'RECONCILED' : 'DISCREPANCY',
    expectedStock: closing,
    difference,
    missingHistory,
    movements: rows,
  };
}
