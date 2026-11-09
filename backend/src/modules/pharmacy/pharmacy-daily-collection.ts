import { money } from './gst-slabs';
import { entryStamp } from './pharmacy-gst-reports';
import {
  ReportColumn,
  ReportRow,
  ReportSection,
  ReportTile,
  section,
} from './pharmacy-report-table';

/**
 * Daily collection and payment reconciliation (pharmacy CRs 4.2, CR-33 section A, CR-17's Daily
 * Collection). For one clinic day: what was billed, how it was paid, what is still due, and, once
 * someone counts the drawer and the UPI and card settlements, the difference against what the
 * system expected. Money is reconciled per payment mode, so a shortfall is caught the same day.
 */
export const COLLECTION_MODES = [
  'CASH',
  'UPI',
  'CARD',
  'NETBANKING',
  'WALLET',
  'INSURANCE',
  'OTHER',
] as const;
export type CollectionMode = (typeof COLLECTION_MODES)[number];
/** Always shown, so a day with no card sales still asks for the card machine's settlement. */
export const CORE_MODES: CollectionMode[] = ['CASH', 'UPI', 'CARD'];

export const MODE_LABEL: Record<CollectionMode, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  NETBANKING: 'Net banking',
  WALLET: 'Wallet',
  INSURANCE: 'Insurance',
  OTHER: 'Other',
};

export function collectionMode(value: unknown): CollectionMode {
  const mode = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (COLLECTION_MODES as readonly string[]).includes(mode)
    ? (mode as CollectionMode)
    : 'OTHER';
}

export type CollectionBill = {
  id: string;
  number: string;
  /** Clinic day of the bill date. */
  day: string;
  entryAt: string;
  state: 'FINAL' | 'DRAFT' | 'CANCELLED';
  customer: string | null;
  total: number;
  payments: { mode: string; amount: number; day: string }[];
};

export type CollectionCounterSale = {
  id: string;
  number: string;
  day: string;
  entryAt: string;
  customer: string | null;
  total: number;
  mode: string;
};
export type CollectionReturn = {
  id: string;
  number: string;
  day: string;
  entryAt: string;
  customer: string | null;
  total: number;
  refundMode: string;
};

export type CashCount = {
  id: string;
  sequence: number;
  counted: Partial<Record<CollectionMode, number>>;
  note: string | null;
  countedBy: { id: string; name: string } | null;
  countedAt: string;
};

export type ModeLine = {
  mode: CollectionMode;
  label: string;
  onTodaysBills: number;
  onEarlierBills: number;
  counterSales: number;
  refunds: number;
  expected: number;
  counted: number | null;
  difference: number | null;
};

export type CollectionStatus = 'NOT_COUNTED' | 'BALANCED' | 'SHORT' | 'OVER';

export type DailyCollection = {
  day: string;
  modes: ModeLine[];
  billing: {
    billCount: number;
    billed: number;
    counterSaleCount: number;
    counterSales: number;
    counterSalesOnCredit: number;
    collectedOnTodaysBills: number;
    receivedBeforeToday: number;
    dueAtDayEnd: number;
    paidAboveBill: number;
    totalBilled: number;
  };
  refunds: { count: number; paidOut: number; storeCredit: number };
  outsideBills: { count: number; amount: number };
  expectedTotal: number;
  countedTotal: number | null;
  difference: number | null;
  status: CollectionStatus;
  count: CashCount | null;
  history: CashCount[];
};

const add = (
  record: Partial<Record<CollectionMode, number>>,
  mode: CollectionMode,
  amount: number,
) => {
  record[mode] = money((record[mode] ?? 0) + amount);
};

export const BALANCE_TOLERANCE = 0.005;

export function collectionStatus(difference: number | null): CollectionStatus {
  if (difference === null) return 'NOT_COUNTED';
  if (Math.abs(difference) < BALANCE_TOLERANCE) return 'BALANCED';
  return difference < 0 ? 'SHORT' : 'OVER';
}

/**
 * Bills dated `day` are what was billed. Payments dated `day` are what was received, whichever day
 * their bill is from. Counter sales are paid in full at the counter unless sold on credit. Refunds
 * in a payment mode leave that mode; refunds as store credit move no money.
 */
export function buildDailyCollection(input: {
  day: string;
  bills: CollectionBill[];
  counterSales: CollectionCounterSale[];
  returns: CollectionReturn[];
  history: CashCount[];
}): DailyCollection {
  const { day } = input;
  const onToday: Partial<Record<CollectionMode, number>> = {};
  const onEarlier: Partial<Record<CollectionMode, number>> = {};
  const counter: Partial<Record<CollectionMode, number>> = {};
  const refunds: Partial<Record<CollectionMode, number>> = {};

  const todays = input.bills.filter(
    (bill) => bill.day === day && bill.state === 'FINAL',
  );
  let collectedOnTodaysBills = 0;
  let receivedBeforeToday = 0;
  let dueAtDayEnd = 0;
  let paidAboveBill = 0;
  for (const bill of todays) {
    const paidByDayEnd = money(
      bill.payments
        .filter((p) => p.day <= day)
        .reduce((sum, p) => sum + p.amount, 0),
    );
    collectedOnTodaysBills = money(collectedOnTodaysBills + paidByDayEnd);
    receivedBeforeToday = money(
      receivedBeforeToday +
        bill.payments
          .filter((p) => p.day < day)
          .reduce((sum, p) => sum + p.amount, 0),
    );
    dueAtDayEnd = money(
      dueAtDayEnd + Math.max(0, money(bill.total - paidByDayEnd)),
    );
    paidAboveBill = money(
      paidAboveBill + Math.max(0, money(paidByDayEnd - bill.total)),
    );
  }

  let outsideCount = 0;
  let outsideAmount = 0;
  for (const bill of input.bills) {
    for (const payment of bill.payments) {
      if (payment.day !== day) continue;
      const mode = collectionMode(payment.mode);
      if (bill.state === 'FINAL' && bill.day === day)
        add(onToday, mode, payment.amount);
      else add(onEarlier, mode, payment.amount);
      if (bill.state !== 'FINAL') {
        outsideCount += 1;
        outsideAmount = money(outsideAmount + payment.amount);
      }
    }
  }

  const sales = input.counterSales.filter((sale) => sale.day === day);
  let counterOnCredit = 0;
  for (const sale of sales) {
    if (String(sale.mode).toUpperCase() === 'CREDIT')
      counterOnCredit = money(counterOnCredit + sale.total);
    else add(counter, collectionMode(sale.mode), sale.total);
  }
  const returns = input.returns.filter((ret) => ret.day === day);
  let storeCredit = 0;
  for (const ret of returns) {
    if (String(ret.refundMode).toUpperCase() === 'CREDIT')
      storeCredit = money(storeCredit + ret.total);
    else add(refunds, collectionMode(ret.refundMode), ret.total);
  }

  const history = [...input.history].sort((a, b) => b.sequence - a.sequence);
  const count = history[0] ?? null;
  const active = COLLECTION_MODES.filter(
    (mode) =>
      CORE_MODES.includes(mode) ||
      onToday[mode] ||
      onEarlier[mode] ||
      counter[mode] ||
      refunds[mode] ||
      count?.counted[mode] != null,
  );
  const modes: ModeLine[] = active.map((mode) => {
    const expected = money(
      (onToday[mode] ?? 0) +
        (onEarlier[mode] ?? 0) +
        (counter[mode] ?? 0) -
        (refunds[mode] ?? 0),
    );
    const counted = count ? money(count.counted[mode] ?? 0) : null;
    return {
      mode,
      label: MODE_LABEL[mode],
      onTodaysBills: onToday[mode] ?? 0,
      onEarlierBills: onEarlier[mode] ?? 0,
      counterSales: counter[mode] ?? 0,
      refunds: refunds[mode] ?? 0,
      expected,
      counted,
      difference: counted === null ? null : money(counted - expected),
    };
  });
  const expectedTotal = money(
    modes.reduce((sum, line) => sum + line.expected, 0),
  );
  const countedTotal = count
    ? money(modes.reduce((sum, line) => sum + (line.counted ?? 0), 0))
    : null;
  const difference =
    countedTotal === null ? null : money(countedTotal - expectedTotal);
  const billed = money(todays.reduce((sum, bill) => sum + bill.total, 0));
  const counterTotal = money(sales.reduce((sum, sale) => sum + sale.total, 0));
  return {
    day,
    modes,
    billing: {
      billCount: todays.length,
      billed,
      counterSaleCount: sales.length,
      counterSales: counterTotal,
      counterSalesOnCredit: counterOnCredit,
      collectedOnTodaysBills,
      receivedBeforeToday,
      dueAtDayEnd,
      paidAboveBill,
      totalBilled: money(billed + counterTotal),
    },
    refunds: {
      count: returns.length,
      paidOut: money(
        returns.reduce((sum, ret) => sum + ret.total, 0) - storeCredit,
      ),
      storeCredit,
    },
    outsideBills: { count: outsideCount, amount: outsideAmount },
    expectedTotal,
    countedTotal,
    difference,
    status: collectionStatus(difference),
    count,
    history,
  };
}

/** The same figures as table sections, for the screen's detail tables and every export. */
export function dailyCollectionSections(
  collection: DailyCollection,
  documents: {
    bills: CollectionBill[];
    counterSales: CollectionCounterSale[];
    returns: CollectionReturn[];
  },
): { sections: ReportSection[]; tiles: ReportTile[] } {
  const money$ = (
    key: string,
    label: string,
    extra: Partial<ReportColumn> = {},
  ): ReportColumn => ({ key, label, kind: 'money', ...extra });
  const counted = collection.count !== null;
  const modeColumns: ReportColumn[] = [
    { key: 'mode', label: 'Payment mode', kind: 'text', frozen: true },
    money$('onTodaysBills', "On today's bills"),
    money$('onEarlierBills', 'On earlier bills'),
    money$('counterSales', 'Counter sales'),
    money$('refunds', 'Refunds'),
    money$('expected', 'Expected'),
    ...(counted
      ? [money$('counted', 'Counted'), money$('difference', 'Difference')]
      : []),
  ];
  const modeRows: ReportRow[] = collection.modes.map((line) => ({
    key: line.mode,
    tone:
      line.difference !== null && Math.abs(line.difference) >= BALANCE_TOLERANCE
        ? 'warning'
        : undefined,
    cells: {
      mode: line.label,
      onTodaysBills: line.onTodaysBills,
      onEarlierBills: line.onEarlierBills,
      counterSales: line.counterSales,
      refunds: line.refunds,
      expected: line.expected,
      ...(counted
        ? { counted: line.counted, difference: line.difference }
        : {}),
    },
  }));

  const b = collection.billing;
  const billingColumns: ReportColumn[] = [
    { key: 'line', label: 'Bills raised today', kind: 'text', frozen: true },
    money$('amount', 'Amount', { total: false }),
  ];
  const billingRows: ReportRow[] = [
    {
      key: 'billed',
      cells: { line: `Pharmacy bills (${b.billCount})`, amount: b.billed },
    },
    {
      key: 'counter',
      cells: {
        line: `Counter sales (${b.counterSaleCount})`,
        amount: b.counterSales,
      },
    },
    { key: 'total', cells: { line: 'Total billed', amount: b.totalBilled } },
    {
      key: 'collected',
      cells: {
        line: "Collected against today's bills by day end",
        amount: b.collectedOnTodaysBills,
      },
    },
    ...(b.receivedBeforeToday
      ? [
          {
            key: 'before',
            cells: {
              line: '…of which received before today',
              amount: b.receivedBeforeToday,
            },
          },
        ]
      : []),
    {
      key: 'counterPaid',
      cells: {
        line: 'Counter sales paid at the counter',
        amount: money(b.counterSales - b.counterSalesOnCredit),
      },
    },
    {
      key: 'due',
      tone: b.dueAtDayEnd > 0 ? ('warning' as const) : undefined,
      cells: { line: 'Still due on bills', amount: b.dueAtDayEnd },
    },
    ...(b.counterSalesOnCredit
      ? [
          {
            key: 'counterCredit',
            tone: 'warning' as const,
            cells: {
              line: 'Counter sales on credit',
              amount: b.counterSalesOnCredit,
            },
          },
        ]
      : []),
    ...(b.paidAboveBill
      ? [
          {
            key: 'above',
            tone: 'warning' as const,
            cells: {
              line: 'Paid above the bill amount',
              amount: b.paidAboveBill,
            },
          },
        ]
      : []),
  ];

  const docColumns: ReportColumn[] = [
    { key: 'number', label: 'Bill No.', kind: 'text', frozen: true },
    { key: 'type', label: 'Type', kind: 'text' },
    { key: 'entryAt', label: 'Entry', kind: 'text' },
    { key: 'customer', label: 'Patient / customer', kind: 'text' },
    money$('amount', 'Amount'),
    money$('paidToday', 'Received today'),
    { key: 'modes', label: 'Paid by', kind: 'text' },
    money$('due', 'Due'),
  ];
  const day = collection.day;
  const docRows: ReportRow[] = [];
  const billsShown = documents.bills.filter(
    (bill) =>
      (bill.day === day && bill.state === 'FINAL') ||
      bill.payments.some((p) => p.day === day),
  );
  for (const bill of billsShown.sort((x, y) =>
    x.entryAt.localeCompare(y.entryAt),
  )) {
    const today = bill.payments.filter((p) => p.day === day);
    const paid = money(
      bill.payments
        .filter((p) => p.day <= day)
        .reduce((sum, p) => sum + p.amount, 0),
    );
    const raisedToday = bill.day === day && bill.state === 'FINAL';
    docRows.push({
      key: `bill:${bill.id}`,
      tone: bill.state !== 'FINAL' ? 'muted' : undefined,
      cells: {
        number: bill.number,
        type: raisedToday
          ? 'Bill'
          : bill.state === 'FINAL'
            ? `Bill of ${bill.day.split('-').reverse().join('/')}`
            : `Bill (${bill.state.toLowerCase()})`,
        entryAt: entryStamp(bill.entryAt),
        customer: bill.customer,
        amount: raisedToday ? bill.total : 0,
        paidToday: money(today.reduce((sum, p) => sum + p.amount, 0)),
        modes:
          Array.from(
            new Set(today.map((p) => MODE_LABEL[collectionMode(p.mode)])),
          ).join(', ') || '—',
        due: raisedToday ? Math.max(0, money(bill.total - paid)) : 0,
      },
    });
  }
  for (const sale of documents.counterSales.filter((s) => s.day === day)) {
    const credit = String(sale.mode).toUpperCase() === 'CREDIT';
    docRows.push({
      key: `sale:${sale.id}`,
      cells: {
        number: sale.number,
        type: 'Counter sale',
        entryAt: entryStamp(sale.entryAt),
        customer: sale.customer,
        amount: sale.total,
        paidToday: credit ? 0 : sale.total,
        modes: credit ? 'On credit' : MODE_LABEL[collectionMode(sale.mode)],
        due: credit ? sale.total : 0,
      },
    });
  }
  for (const ret of documents.returns.filter((r) => r.day === day)) {
    const credit = String(ret.refundMode).toUpperCase() === 'CREDIT';
    docRows.push({
      key: `return:${ret.id}`,
      tone: 'warning',
      cells: {
        number: ret.number,
        type: 'Customer return',
        entryAt: entryStamp(ret.entryAt),
        customer: ret.customer,
        amount: money(-ret.total),
        paidToday: credit ? 0 : money(-ret.total),
        modes: credit
          ? 'Store credit'
          : `Refund · ${MODE_LABEL[collectionMode(ret.refundMode)]}`,
        due: 0,
      },
    });
  }

  const tiles: ReportTile[] = [
    { label: 'Billed today', value: b.totalBilled, kind: 'money' },
    {
      label: 'Expected in hand',
      value: collection.expectedTotal,
      kind: 'money',
      help: 'Money received today in every mode, less refunds paid out.',
    },
    {
      label: 'Still due',
      value: money(b.dueAtDayEnd + b.counterSalesOnCredit),
      kind: 'money',
      tone: b.dueAtDayEnd + b.counterSalesOnCredit > 0 ? 'warning' : undefined,
    },
    collection.difference === null
      ? {
          label: 'Difference',
          value: 'Not counted',
          kind: 'text',
          tone: 'warning',
        }
      : {
          label: 'Difference',
          value: collection.difference,
          kind: 'money',
          tone: collection.status === 'BALANCED' ? 'good' : 'bad',
        },
  ];
  return {
    tiles,
    sections: [
      section({
        id: 'modes',
        title: 'Reconciliation by payment mode',
        columns: modeColumns,
        rows: modeRows,
      }),
      section({
        id: 'billing',
        title: 'Bills raised today',
        columns: billingColumns,
        rows: billingRows,
        totals: null,
      }),
      section({
        id: 'documents',
        title: 'Bills, counter sales and returns',
        columns: docColumns,
        rows: docRows,
        emptyText: 'Nothing was billed or received on this day.',
      }),
    ],
  };
}
