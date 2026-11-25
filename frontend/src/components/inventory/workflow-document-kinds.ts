export type LineColumn = 'quantity' | 'freeQuantity' | 'unitPrice' | 'discountPercent' | 'schemeAmount' | 'gstRate' | 'minStockLevel' | 'maxStockLevel';

export const LINE_COLUMNS: Record<LineColumn, { label: string; step: number; required: boolean }> = {
  quantity: { label: 'Quantity', step: 1, required: true },
  freeQuantity: { label: 'Free quantity', step: 1, required: false },
  unitPrice: { label: 'Rate excl. GST', step: 0.01, required: true },
  discountPercent: { label: 'Discount %', step: 0.01, required: false },
  schemeAmount: { label: 'Scheme ₹', step: 0.01, required: false },
  gstRate: { label: 'GST %', step: 0.01, required: true },
  minStockLevel: { label: 'Minimum stock', step: 1, required: true },
  maxStockLevel: { label: 'Maximum stock', step: 1, required: true },
};

type Line = { name?: string; [field: string]: unknown };
export type ConfirmSummary = { items: number; units: number; status?: string };
export type IrreversibleAction = { title: string; confirmLabel: string; effect: (summary: ConfirmSummary) => string };
export type WorkflowKindSpec = {
  columns: readonly LineColumn[];
  commercial: boolean;
  irreversibleActions: Partial<Record<string, IrreversibleAction>>;
  outcomeSummary: string;
};

const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
const units = (n: number) => `${n} ${n === 1 ? 'unit' : 'units'}`;
const MANAGER_REVERSAL = 'You cannot undo this from here; only a manager’s reversal can correct it.';

const stockOut = (title: string, confirmLabel: string, effect: string): IrreversibleAction => ({
  title, confirmLabel, effect: (s) => `Stock for ${items(s.items)} drops by ${units(s.units)}${effect}. ${MANAGER_REVERSAL}`,
});
const stockIn = (title: string, confirmLabel: string): IrreversibleAction => ({
  title, confirmLabel, effect: (s) => `Stock for ${items(s.items)} rises by ${units(s.units)}. ${MANAGER_REVERSAL}`,
});

const CANCEL: IrreversibleAction = {
  title: 'Cancel this document?',
  confirmLabel: 'Yes, cancel it',
  effect: (s) => s.status === 'CHALLAN'
    ? 'The goods already sent on the challan are recorded as coming back. The document cannot be used again.'
    : 'It will be closed and cannot be posted afterwards. Create a new document if you still need one.',
};
const REJECT: IrreversibleAction = {
  title: 'Reject this proposal?',
  confirmLabel: 'Yes, reject it',
  effect: () => 'It is closed without changing stock. The person who submitted it has to create a new document.',
};

const ALL: readonly LineColumn[] = ['quantity', 'freeQuantity', 'unitPrice', 'discountPercent', 'schemeAmount', 'gstRate'];
const QUANTITY_ONLY: readonly LineColumn[] = ['quantity'];
const common = { CANCEL, REJECT };

export const workflowKindSpecs: Record<string, WorkflowKindSpec> = {
  OPENING_STOCK: {
    columns: ['quantity', 'unitPrice', 'gstRate'], commercial: true,
    irreversibleActions: { ...common, POST: stockIn('Post opening stock?', 'Post opening stock') },
    outcomeSummary: 'Posting adds these quantities as opening stock. No supplier payable is created.',
  },
  SUPPLIER_RETURN: {
    columns: ALL, commercial: true,
    irreversibleActions: { ...common, CHALLAN: stockOut('Send this return challan?', 'Create return challan', ' as the goods go back to the supplier') },
    outcomeSummary: 'The challan takes these units out of stock. Record the distributor’s credit note when it arrives.',
  },
  SALES_RETURN: {
    columns: ALL, commercial: true,
    irreversibleActions: {
      ...common,
      POST: { title: 'Post this return?', confirmLabel: 'Post return', effect: (s) => `${units(s.units)} across ${items(s.items)} go back as you chose on each line: restock, quarantine or loss. ${MANAGER_REVERSAL}` },
    },
    outcomeSummary: 'Posting restocks, quarantines or writes off each returned batch, as chosen on its line.',
  },
  LOSS: {
    columns: QUANTITY_ONLY, commercial: false,
    irreversibleActions: { ...common, POST: stockOut('Post this loss?', 'Post stock loss', '') },
    outcomeSummary: 'Posting removes these units from available stock as lost or broken.',
  },
  HOLD: {
    columns: QUANTITY_ONLY, commercial: false, irreversibleActions: common,
    outcomeSummary: 'Blocking keeps these units in stock but stops them being sold. Release them from this record.',
  },
  COUNT: {
    columns: QUANTITY_ONLY, commercial: false, irreversibleActions: common,
    outcomeSummary: 'Signing off records the quantities you counted.',
  },
  CORRECTION: {
    columns: QUANTITY_ONLY, commercial: false, irreversibleActions: common,
    outcomeSummary: 'A correction adjusts the original stock movement and keeps the reason.',
  },
  SHORTBOOK: {
    columns: ['quantity', 'unitPrice'], commercial: true, irreversibleActions: common,
    outcomeSummary: 'Creating the purchase order orders these items. Stock does not change.',
  },
  PURCHASE_ORDER: {
    columns: ALL, commercial: true, irreversibleActions: common,
    outcomeSummary: 'Submitting asks a manager to approve this order. Stock changes only when goods are received.',
  },
  INWARD_CHALLAN: {
    columns: ALL, commercial: true,
    irreversibleActions: { ...common, POST: stockIn('Receive this stock?', 'Receive stock') },
    outcomeSummary: 'Receiving adds these units to stock. Link the supplier bill afterwards.',
  },
  GATE_PASS: {
    columns: QUANTITY_ONLY, commercial: false, irreversibleActions: common,
    outcomeSummary: 'Records a delivery at the gate. Stock and payables do not change.',
  },
  QUOTATION: {
    columns: ALL, commercial: true, irreversibleActions: common,
    outcomeSummary: 'A quotation reserves and sells nothing. Convert it to a sale draft once.',
  },
  COUNTER_SALE: {
    columns: ALL, commercial: true,
    irreversibleActions: { ...common, POST: stockOut('Post this sale?', 'Post sale', ' and the sale is recorded') },
    outcomeSummary: 'A draft reserves nothing. Posting the sale removes these units from stock.',
  },
  CREDIT_NOTE: {
    columns: ['quantity', 'unitPrice', 'gstRate'], commercial: true, irreversibleActions: common,
    outcomeSummary: 'Posting records the distributor’s credit. Stock does not change.',
  },
  TARGET_REVIEW: {
    columns: ['minStockLevel', 'maxStockLevel'], commercial: false, irreversibleActions: common,
    outcomeSummary: 'Accepting saves the chosen reorder levels. Stock does not change.',
  },
};

export function workflowKindSpec(kind: string): WorkflowKindSpec {
  return workflowKindSpecs[kind] ?? { columns: ALL, commercial: true, irreversibleActions: common, outcomeSummary: '' };
}

export function summariseLines(lines: Line[]): ConfirmSummary {
  return {
    items: lines.length,
    units: lines.reduce((total, line) => total + (Number(line.quantity) || 0) + (Number(line.freeQuantity) || 0), 0),
  };
}

export function firstLineProblem(kind: string, lines: Line[]): string | null {
  const { columns } = workflowKindSpec(kind);
  for (const [index, line] of lines.entries()) {
    for (const column of columns) {
      const { label, required } = LINE_COLUMNS[column];
      const value = line[column];
      const where = `Row ${index + 1}${line.name ? ` (${line.name})` : ''}`;
      if (value === '' && required) return `${where}: ${label} is required.`;
      if (typeof value === 'number' && value < 0) return `${where}: ${label} cannot be negative.`;
    }
  }
  return null;
}

export function blankOptionalCellsToZero<T extends Line>(kind: string, lines: T[]): T[] {
  const optional = workflowKindSpec(kind).columns.filter((column) => !LINE_COLUMNS[column].required);
  return lines.map((line) => optional.reduce((next, column) => (next[column] === '' ? { ...next, [column]: 0 } : next), line));
}
