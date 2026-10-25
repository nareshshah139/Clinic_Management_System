type LedgerEvidence = {
  status?: string;
  checkpoint?: { quantity: number } | null;
  expectedStock?: number | null;
  difference?: number | null;
  missingHistory?: boolean;
};

/**
 * @cc [owner:nareshshah139,label:product] stock-ledger-explanation
 * Missing checkpoints and incomplete movement evidence MUST remain unverified. Agreement
 * describes recorded evidence only; every explanation MUST state that viewing changes no stock.
 */
export function stockLedgerExplanation(ledger: LedgerEvidence | undefined, unit: string) {
  let explanation: string;
  if (!ledger?.checkpoint) {
    explanation = "No verified physical count is available, so the ledger cannot confirm the current balance.";
  } else if (ledger.expectedStock == null || ledger.difference == null) {
    explanation = ledger.missingHistory
      ? "Movement history is incomplete. Some movements covered by the saved count are missing, so the current balance cannot be verified."
      : "A movement after the saved count has no reliable stock change, so the current balance cannot be verified.";
  } else if (ledger.status === "RECONCILED" && ledger.difference === 0) {
    explanation = `Recorded stock agrees with the ledger balance of ${ledger.expectedStock} ${unit}. This confirms agreement with the saved count and recorded movements, not a new physical observation.`;
  } else {
    explanation = `Recorded stock is ${Math.abs(ledger.difference)} ${unit} ${ledger.difference < 0 ? "below" : "above"} the ledger balance of ${ledger.expectedStock} ${unit}. Compare the movements with the physical goods before correcting the balance.`;
  }
  return `${explanation} Viewing this ledger does not change stock. Earlier movements remain historical evidence.`;
}
