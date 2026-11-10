import {
  CATEGORIES,
  REPORTS,
  apiParams,
  commonReports,
  defaultRange,
  exportHref,
  monthRange,
  periodPresets,
  presetFor,
  quarterRange,
  readParams,
  reportById,
  reportHref,
  searchReports,
} from '@/components/pharmacy/reports/report-catalog';
import { formatCell, frozenOffsets, headerBands, nextSort, sortRows } from '@/components/pharmacy/reports/report-format';
import { countPayload, draftChanged, initialDraft, parseAmount, previewCount, statusMessage } from '@/components/pharmacy/reports/collection-model';
import type { DailyCollection, ReportColumn, ReportRow } from '@/components/pharmacy/reports/report-types';

const TODAY = '2026-11-09';
const titles = (reports: { title: string }[]) => reports.map((r) => r.title);

describe('the Pharmacy Report menu', () => {
  it('holds the full GST set of eleven, in the order the clinic listed them', () => {
    expect(titles(REPORTS.filter((r) => r.category === 'GST Reports'))).toEqual([
      'Purchase Register', 'Purchase Bills', 'Sales Register', 'Sales Bills', 'Day wise Summary',
      'GSTR-1', 'GSTR-3B', 'GSTR-2A', 'GSTR-2B', 'HSN wise GST', 'Composition GST Report',
    ]);
  });

  it('files every report under one of the five categories and gives each a unique id', () => {
    expect(CATEGORIES).toEqual(['GST Reports', 'Margin Reports', 'Stock Reports', 'Accounting Reports', 'Others']);
    for (const report of REPORTS) expect(CATEGORIES).toContain(report.category);
    expect(new Set(REPORTS.map((r) => r.id)).size).toBe(REPORTS.length);
    expect(reportById('daily-collection')!.category).toBe('Accounting Reports');
    expect(reportById('item-margin')!.category).toBe('Margin Reports');
  });

  it('surfaces the daily collection and the most-used GST reports on the landing page', () => {
    expect(titles(commonReports())).toEqual(['Sales Register', 'Day wise Summary', 'GSTR-1', 'GSTR-3B', 'Item Wise Margin Report', 'Daily Collection']);
  });

  it('finds all four GST returns when searching "GSTR", ignoring case and hyphens', () => {
    expect(titles(searchReports('GSTR'))).toEqual(['GSTR-1', 'GSTR-3B', 'GSTR-2A', 'GSTR-2B']);
    expect(titles(searchReports('gstr3b'))).toEqual(['GSTR-3B']);
    expect(titles(searchReports('gstr 2b'))).toEqual(['GSTR-2B']);
  });

  it('finds reports by what they are about, and nothing for nonsense', () => {
    expect(titles(searchReports('cash'))).toEqual(['Daily Collection']);
    expect(titles(searchReports('doctor'))).toContain('Daily Sales Summary – Doctorwise');
    expect(titles(searchReports('expiry'))).toEqual(['Expiring Stock']);
    expect(searchReports('zzz')).toEqual([]);
    expect(searchReports('   ')).toBe(REPORTS);
  });
});

describe('periods', () => {
  it('works out months and financial-year quarters across year ends', () => {
    expect(monthRange('2026-01-15', -1)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(monthRange('2028-03-10', -1)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(quarterRange('2026-11-09')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(quarterRange('2027-02-01')).toEqual({ from: '2027-01-01', to: '2027-03-31' });
    expect(quarterRange('2026-11-09', -1)).toEqual({ from: '2026-07-01', to: '2026-09-30' });
  });

  it('opens GST returns on the month just ended and other reports on this month to date', () => {
    expect(defaultRange(reportById('gstr-3b')!, TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(defaultRange(reportById('doctor-wise-sales')!, TODAY)).toEqual({ from: '2026-11-01', to: TODAY });
    expect(defaultRange(reportById('daily-collection')!, TODAY)).toEqual({ from: TODAY, to: TODAY });
  });

  it('names the preset a range matches, or custom', () => {
    const presets = periodPresets(TODAY);
    expect(presets[1].label).toBe('Last month (October 2026)');
    expect(presetFor({ from: '2026-10-01', to: '2026-10-31' }, TODAY)).toBe('last-month');
    expect(presetFor({ from: '2026-10-03', to: '2026-10-31' }, TODAY)).toBe('custom');
  });
});

describe('filters in the address bar', () => {
  const sales = reportById('sales-register')!;

  it('reads valid filters and falls back to defaults for anything missing or invalid', () => {
    expect(readParams(sales, new URLSearchParams('from=2026-09-01&to=2026-09-30&type=RETURNS&q=Meera'), TODAY)).toEqual({
      from: '2026-09-01', to: '2026-09-30', type: 'RETURNS', q: 'Meera', gst: undefined, window: undefined, rate: undefined,
    });
    expect(readParams(sales, new URLSearchParams('from=2026-02-30&type=BOGUS'), TODAY)).toMatchObject({ from: '2026-10-01', to: '2026-10-31', type: 'SALES' });
    expect(readParams(sales, new URLSearchParams('from=2026-10-20&to=2026-10-01'), TODAY)).toMatchObject({ from: '2026-10-20', to: '2026-10-31' });
  });

  it('keeps a single day for the daily collection', () => {
    expect(readParams(reportById('daily-collection')!, new URLSearchParams('from=2026-11-05&to=2026-11-30'), TODAY)).toMatchObject({ from: '2026-11-05', to: '2026-11-05' });
  });

  it('builds the page link, the API query and every download from the same filters', () => {
    const params = readParams(sales, new URLSearchParams('from=2026-09-01&to=2026-09-30&q=Meera Shah'), TODAY);
    expect(reportHref('sales-register', params)).toBe('/dashboard/pharmacy/reports?report=sales-register&from=2026-09-01&to=2026-09-30&type=SALES&q=Meera+Shah');
    expect(apiParams(sales, params)).toEqual({ from: '2026-09-01', to: '2026-09-30', type: 'SALES', q: 'Meera Shah' });
    expect(exportHref(sales, params, 'xlsx')).toBe('/api/pharmacy/reports/sales-register?from=2026-09-01&to=2026-09-30&type=SALES&q=Meera+Shah&format=xlsx');
    expect(apiParams(reportById('daily-collection')!, { from: '2026-11-05', to: '2026-11-05' })).toEqual({ from: '2026-11-05' });
  });
});

describe('table formatting and sorting', () => {
  const columns: ReportColumn[] = [
    { key: 'billNo', label: 'Bill No.', kind: 'text', frozen: true },
    { key: 'date', label: 'Bill Date', kind: 'date', frozen: true },
    { key: 'b5', label: 'Base', kind: 'money', group: '5%' },
    { key: 's5', label: 'SGST', kind: 'money', group: '5%' },
    { key: 'b12', label: 'Base', kind: 'money', group: '12%' },
  ];
  const rows: ReportRow[] = [
    { key: '1', cells: { billNo: 'PHI-2026-10', date: '2026-11-03', b5: 50 } },
    { key: '2', cells: { billNo: 'PHI-2026-9', date: '2026-11-01', b5: null } },
    { key: '3', cells: { billNo: 'PHI-2026-11', date: '2026-11-02', b5: 1200 } },
  ];

  it('formats rupees with Indian grouping, dates as dd/mm/yyyy and leaves empty cells blank', () => {
    expect(formatCell(159656.74, 'money')).toBe('1,59,656.74');
    expect(formatCell(-27.1, 'money')).toBe('-27.10');
    expect(formatCell('2026-11-03', 'date')).toBe('03/11/2026');
    expect(formatCell(null, 'money')).toBe('');
  });

  it('sorts bill numbers by their numbers, money high first, and keeps empty cells last', () => {
    expect(sortRows(rows, columns, { key: 'billNo', direction: 'asc' }).map((r) => r.key)).toEqual(['2', '1', '3']);
    expect(sortRows(rows, columns, { key: 'b5', direction: 'desc' }).map((r) => r.key)).toEqual(['3', '1', '2']);
    expect(sortRows(rows, columns, { key: 'b5', direction: 'asc' }).map((r) => r.key)).toEqual(['1', '3', '2']);
    expect(sortRows(rows, columns, null)).toBe(rows);
  });

  it('cycles a heading through its natural direction, the other, then the server order', () => {
    const money = columns[2];
    expect(nextSort(null, money)).toEqual({ key: 'b5', direction: 'desc' });
    expect(nextSort({ key: 'b5', direction: 'desc' }, money)).toEqual({ key: 'b5', direction: 'asc' });
    expect(nextSort({ key: 'b5', direction: 'asc' }, money)).toBeNull();
    expect(nextSort(null, columns[0])).toEqual({ key: 'billNo', direction: 'asc' });
  });

  it('stacks frozen columns from the left and merges each GST band into one heading', () => {
    expect([...frozenOffsets(columns)]).toEqual([['billNo', 0], ['date', 168]]);
    // On a 390 px phone only the bill number stays put; the date scrolls with the figures.
    expect([...frozenOffsets(columns, 390)]).toEqual([['billNo', 0]]);
    expect([...frozenOffsets(columns, 800)]).toEqual([['billNo', 0], ['date', 168]]);
    const withSrNo: ReportColumn[] = [{ key: 'srNo', label: 'Sr No.', kind: 'number', frozen: true }, ...columns];
    expect([...frozenOffsets(withSrNo, 390)].map(([key]) => key)).toEqual(['srNo', 'billNo']);
    expect(headerBands(columns).map((b) => [b.label, b.span])).toEqual([[null, 1], [null, 1], ['5%', 2], ['12%', 1]]);
  });
});

describe('counting the day', () => {
  const collection = {
    day: '2026-11-05',
    modes: [
      { mode: 'CASH', label: 'Cash', onTodaysBills: 1000, onEarlierBills: 0, counterSales: 240, refunds: 100, expected: 1140, counted: null, difference: null },
      { mode: 'UPI', label: 'UPI', onTodaysBills: 500, onEarlierBills: 0, counterSales: 0, refunds: 0, expected: 500, counted: null, difference: null },
      { mode: 'CARD', label: 'Card', onTodaysBills: 0, onEarlierBills: 0, counterSales: 0, refunds: 0, expected: 0, counted: null, difference: null },
    ],
    expectedTotal: 1640,
    count: null,
    history: [],
  } as unknown as DailyCollection;

  it('reads money the way people type it', () => {
    expect(parseAmount('18250')).toBe(18250);
    expect(parseAmount('18,250.50')).toBe(18250.5);
    expect(parseAmount('₹ 1,82,500')).toBe(182500);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('12.345')).toBeNaN();
    expect(parseAmount('-5')).toBeNaN();
    expect(parseAmount('abc')).toBeNaN();
  });

  it('previews the difference as the count is typed, treating a blank mode as nothing in hand once anything is entered', () => {
    expect(previewCount(collection.modes, {}).counted).toBeNull();
    const preview = previewCount(collection.modes, { CASH: '1,100', UPI: '500' });
    expect(preview.lines.map((l) => l.difference)).toEqual([-40, 0, null]);
    expect(preview).toMatchObject({ counted: 1600, difference: -40, entered: 2, anyInvalid: false });
    expect(previewCount(collection.modes, { CASH: 'x' }).anyInvalid).toBe(true);
  });

  it('sends only readable amounts, and knows when a recount changes nothing', () => {
    expect(countPayload({ CASH: '1,100', UPI: '', CARD: 'x' })).toEqual({ CASH: 1100 });
    const counted = { ...collection, count: { id: 'c', sequence: 1, counted: { CASH: 1140, UPI: 500 }, note: null, countedBy: null, countedAt: '' } } as DailyCollection;
    const draft = initialDraft(counted);
    expect(draft).toEqual({ CASH: '1140', UPI: '500', CARD: '' });
    expect(draftChanged(counted, draft, '')).toBe(false);
    expect(draftChanged(counted, { ...draft, CASH: '1,140.00' }, '')).toBe(false);
    expect(draftChanged(counted, { ...draft, CASH: '1139' }, '')).toBe(true);
    expect(draftChanged(counted, draft, 'Recounted')).toBe(true);
  });

  it('says what a short or over day means in rupees', () => {
    expect(statusMessage('SHORT', -40).text).toMatch(/^Short by ₹40\.00/);
    expect(statusMessage('OVER', 12.5)).toMatchObject({ tone: 'warning' });
    expect(statusMessage('BALANCED', 0).tone).toBe('good');
  });
});
