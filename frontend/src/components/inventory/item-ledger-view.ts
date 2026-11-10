export type LedgerKind = 'SALE' | 'PURCHASE' | 'RETURN' | 'ADJUSTMENT';

export const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  SALE: 'Sale',
  PURCHASE: 'Purchase',
  RETURN: 'Return',
  ADJUSTMENT: 'Adjustment',
};

export type LedgerDocument =
  | { type: 'PURCHASE_INVOICE'; id: string; number: string; status: string }
  | { type: 'PHARMACY_INVOICE'; id: string; number: string; status: string; prescriptionId: string | null }
  | { type: 'WORKFLOW'; id: string; kind: string; number: string; status: string }
  | { type: 'IMPORT'; id: string; row: string | null }
  | { type: 'APPROVAL'; id: string }
  | { type: 'PARTNER_SALE'; id: string };

export type MovementOwner =
  | { type: 'workflow'; kind: string; id: string; status: string }
  | { type: 'purchase'; kind: 'PURCHASE_INVOICE'; id: string; status: string }
  | { type: 'sale'; kind: 'PHARMACY_INVOICE'; id: string; status: string };

export type ChainBreak = { expected: number; recorded: number };

export type ItemLedgerRow = {
  id: string;
  at: string;
  batchId: string;
  batchNumber: string | null;
  kind: LedgerKind;
  channel: string;
  channelLabel: string;
  reference: string | null;
  document: LedgerDocument | null;
  counterparty: string | null;
  actor: { id: string; name: string } | null;
  reason: string | null;
  delta: number | null;
  in: number | null;
  out: number | null;
  batchClosing: number | null;
  itemClosing: number | null;
  chainBreak: ChainBreak | null;
  owner: MovementOwner | null;
  correctionAllowed: boolean;
};

export type ItemLedger = {
  rows: ItemLedgerRow[];
  closing: number | null;
  currentStock: number;
  matches: boolean | null;
  batches: { batchId: string; closing: number | null; currentStock: number; matches: boolean | null }[];
};

export type LedgerFilter = { from: string; to: string; kind: LedgerKind | '' };

const clinicDayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
export const clinicDay = (at: string) => clinicDayFormat.format(new Date(at));

/**
 * @cc [owner:nareshshah139,label:product] item-ledger-filter-hides-only
 * Ledger filters MUST only hide rows: the remaining rows keep their order and the batch and item
 * closings computed over the full history. From and To are inclusive Asia/Kolkata calendar days.
 */
export function filterLedgerRows(rows: ItemLedgerRow[], filter: LedgerFilter): ItemLedgerRow[] {
  return rows.filter(row => {
    const day = clinicDay(row.at);
    return (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to) && (!filter.kind || row.kind === filter.kind);
  });
}

export function chainBreakNote({ expected, recorded }: ChainBreak) {
  const units = Math.abs(recorded - expected);
  return `Stock was ${recorded} before this entry; the ledger expected ${expected}. ${units} ${units === 1 ? 'unit' : 'units'} changed without a ledger entry.`;
}

export function documentLabel(row: Pick<ItemLedgerRow, 'document' | 'reference'>) {
  const doc = row.document;
  return doc && 'number' in doc ? doc.number : row.reference;
}

const clinicDateTime = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' });

export function ledgerCsvRows(rows: ItemLedgerRow[]) {
  return rows.map(row => ({
    Document: documentLabel(row) ?? '',
    Reference: row.reference ?? '',
    'Entry date (IST)': clinicDateTime.format(new Date(row.at)),
    Type: LEDGER_KIND_LABEL[row.kind],
    Channel: row.channelLabel,
    Batch: row.batchNumber ?? '',
    In: row.in ?? '',
    Out: row.out ?? '',
    BatchClosing: row.batchClosing ?? 'Unknown',
    ItemClosing: row.itemClosing ?? 'Unknown',
    CustomerOrDistributor: row.counterparty ?? '',
    By: row.actor?.name ?? '',
    ChainBreak: row.chainBreak ? chainBreakNote(row.chainBreak) : '',
  }));
}
