'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';
import { downloadReportPdf, reportCsv, reportExportMatrix } from './report-export';

type Line = { itemId: string | null; name: string; quantity: number; rate: number | null; taxable: number | null; tax: number | null; total: number | null; cost: number | null };
type Document = { kind: string; date: string; entry: string; number: string; party: string; phone: string; gross: number | null; discount: number | null; taxable: number | null; tax: number | null; cgst: number | null; sgst: number | null; igst: number | null; total: number; lines: Line[] };
type Data = { items: { id: string; category: string | null; manufacturer: string | null; unit: string; packSize: number | null; packUnit: string | null; currentStock: number; mrp: number | null; tags: string | null }[]; sales: Document[]; purchases: Document[]; payments: { date: string; number: string; method: string; amount: number; invoiceStatus: string }[]; paymentGaps: string[]; reversedDocuments: string[] };
type Report = 'collection' | 'purchase' | 'sales' | 'day' | 'margin';
type Cell = string | number | null;
type Row = Record<string, Cell>;
const reports: { id: Report; title: string; category: string }[] = [
  { id: 'collection', title: 'Daily collection', category: 'Accounting Reports' },
  { id: 'purchase', title: 'Purchase Bills', category: 'GST Reports' },
  { id: 'sales', title: 'Sales Register', category: 'GST Reports' },
  { id: 'day', title: 'Day wise Summary', category: 'GST Reports' },
  { id: 'margin', title: 'Item Wise Margin', category: 'Margin Reports' },
];
const money = (value: number) => value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sum = (rows: Row[], key: string): number | null => rows.some(row => row[key] === null || typeof row[key] !== 'number') ? null : Math.round(rows.reduce((n, row) => n + (row[key] as number), 0) * 100) / 100;
const itemTags = (value: string | null | undefined): string[] => { try { const parsed: unknown = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : []; } catch { return []; } };
const entryTime = (value: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
const indiaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/**
 * @cc [owner:nareshshah139,label:product] pharmacy-report-screen
 * The pharmacy report screen displays the same filtered rows and totals in its table, CSV download and print view, and labels unavailable figures as unknown.
 */
export default function PharmacyReportPage() {
  const [report, setReport] = useState<Report>('collection');
  const [from, setFrom] = useState(indiaToday);
  const [to, setTo] = useState(indiaToday);
  const [loadedRange, setLoadedRange] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [dayType, setDayType] = useState<'sales' | 'purchases'>('sales');
  const [purchaseType, setPurchaseType] = useState<'purchases' | 'sales'>('purchases');
  const [gstFilter, setGstFilter] = useState<'all' | 'with' | 'without' | 'unknown'>('all');
  const [marginType, setMarginType] = useState<'net' | 'sales'>('net');
  const [tag, setTag] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [marginSort, setMarginSort] = useState<'profit' | 'sales' | 'name'>('profit');
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const filteredReports = reports.filter(item => `${item.category} ${item.title}`.toLowerCase().includes(reportSearch.toLowerCase()));
  const load = async () => {
    setLoading(true); setError(''); setData(null);
    try {
      const response = await apiClient.get<Data>('/reports/pharmacy', { start: from, end: to });
      setData(response); setLoadedRange(`${from} to ${to}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load reports. Try again.'); }
    finally { setLoading(false); }
  };
  const rawView = useMemo(() => {
    const docs = data ? ((report === 'purchase' && purchaseType === 'purchases') || (report === 'day' && dayType === 'purchases') ? data.purchases : data.sales) : [];
    const matches = (doc: Document) => `${doc.party} ${doc.number} ${doc.kind}`.toLowerCase().includes(search.toLowerCase());
    const selected = docs.filter(doc => {
      if (report === 'margin') return marginType === 'net' || doc.kind !== 'Sales return';
      if (!matches(doc)) return false;
      if (report !== 'purchase' || gstFilter === 'all') return true;
      if (doc.tax === null) return gstFilter === 'unknown';
      return gstFilter === (doc.tax === 0 ? 'without' : 'with');
    });
    let columns: string[] = [], numeric: string[] = [], rows: Row[] = [];
    if (report === 'sales') {
      columns = ['Bill No.', 'Date', 'Type', 'Customer', 'Mobile', 'Gross', 'Discount', 'Taxable', 'GST', 'CESS', 'SGST', 'CGST', 'IGST', 'Total'];
      numeric = columns.slice(5);
      rows = selected.map(d => ({ 'Bill No.': d.number, Date: d.date, Type: d.kind, Customer: d.party, Mobile: d.phone, Gross: d.gross, Discount: d.discount, Taxable: d.taxable, GST: d.tax, CESS: null, SGST: null, CGST: null, IGST: null, Total: d.total }));
    } else if (report === 'purchase' || report === 'day') {
      const rates = Array.from(new Set(selected.flatMap(d => d.lines.map(l => l.rate === null ? 'Unknown' : `${l.rate}%`)))).sort((a, b) => a === 'Unknown' ? 1 : b === 'Unknown' ? -1 : parseFloat(a) - parseFloat(b));
      const slabColumns = rates.flatMap(rate => [`${rate} Base`, `${rate} GST`, `${rate} SGST`, `${rate} CGST`, `${rate} IGST`]);
      columns = report === 'day' ? ['Date', 'Bill numbers', 'CESS', ...slabColumns, 'Total'] : ['Bill No.', 'Entry date / time', 'Date', 'Type', 'Supplier', 'CESS', ...slabColumns, 'Bill SGST', 'Bill CGST', 'Bill IGST', 'Total'];
      numeric = ['CESS', ...slabColumns, ...(report === 'purchase' ? ['Bill SGST', 'Bill CGST', 'Bill IGST'] : []), 'Total'];
      const groups = report === 'day' ? Array.from(new Set(selected.map(d => d.date))).sort().map(date => selected.filter(d => d.date === date)) : selected.map(d => [d]);
      rows = groups.map(group => {
        const row: Row = { CESS: null, 'Entry date / time': entryTime(group[0].entry), Date: group[0].date, 'Bill numbers': group.map(d => d.number).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', '), 'Bill No.': group[0].number, Type: group[0].kind, Supplier: group[0].party, 'Bill SGST': group[0].sgst, 'Bill CGST': group[0].cgst, 'Bill IGST': group[0].igst, Total: Math.round(group.reduce((n, d) => n + d.total, 0) * 100) / 100 };
        for (const rate of rates) {
          const lines = group.flatMap(d => d.lines.filter(l => (l.rate === null ? 'Unknown' : `${l.rate}%`) === rate));
          row[`${rate} Base`] = group.some(d => !d.lines.length) || lines.some(l => l.taxable === null) ? null : Math.round(lines.reduce((n, l) => n + (l.taxable ?? 0), 0) * 100) / 100;
          row[`${rate} GST`] = group.some(d => !d.lines.length) || lines.some(l => l.tax === null) ? null : Math.round(lines.reduce((n, l) => n + (l.tax ?? 0), 0) * 100) / 100;
          row[`${rate} SGST`] = null; row[`${rate} CGST`] = null; row[`${rate} IGST`] = null;
        }
        return row;
      });
    } else if (report === 'margin') {
      const items = new Map<string, Row>();
      selected.forEach((d, di) => d.lines.forEach((line, li) => {
        const key = line.itemId || `unidentified-${di}-${li}`;
        const metadata = data?.items.find(item => item.id === line.itemId);
        const prior = items.get(key) || { Item: line.name, 'Item ID': line.itemId || 'Unknown', Category: metadata?.category || 'Unknown', Unit: metadata ? (metadata.packSize && metadata.packUnit ? `${metadata.packSize} ${metadata.packUnit}` : metadata.unit) : 'Unknown', Manufacturer: metadata?.manufacturer || 'Unknown', Stock: metadata?.currentStock ?? null, MRP: metadata?.mrp ?? null, Quantity: 0, 'Sales amount': 0, 'Recorded cost estimate': 0, 'Net GST': null, Profit: null };
        prior.Quantity = (prior.Quantity as number) + line.quantity;
        prior['Recorded cost estimate'] = prior['Recorded cost estimate'] === null || line.cost === null ? null : Math.round(((prior['Recorded cost estimate'] as number) + line.cost) * 100) / 100;
        prior['Sales amount'] = prior['Sales amount'] === null || line.total === null ? null : Math.round(((prior['Sales amount'] as number) + line.total) * 100) / 100;
        items.set(key, prior);
      }));
      columns = ['Item', 'Item ID', 'Category', 'Unit', 'Manufacturer', 'Quantity', 'Stock', 'MRP', 'Sales amount', 'Recorded cost estimate', 'Net GST', 'Profit']; numeric = columns.slice(5);
      rows = [...items.values()].filter(row => {
        const metadata = data?.items.find(item => item.id === row['Item ID']);
        return `${row.Item} ${row['Item ID']}`.toLowerCase().includes(search.toLowerCase()) && (!tag || itemTags(metadata?.tags).includes(tag)) && (!manufacturer || String(row.Manufacturer).toLowerCase().includes(manufacturer.toLowerCase()));
      }).sort((a, b) => {
        const key = marginSort === 'profit' ? 'Profit' : 'Sales amount';
        if (marginSort !== 'name' && (typeof a[key] === 'number' || typeof b[key] === 'number')) {
          if (typeof a[key] !== 'number') return 1;
          if (typeof b[key] !== 'number') return -1;
          const difference = (b[key] as number) - (a[key] as number);
          if (difference) return difference;
        }
        return String(a.Item).localeCompare(String(b.Item));
      });
    } else {
      const dates = Array.from(new Set([...(data?.sales || []).map(d => d.date), ...(data?.payments || []).map(p => p.date)])).sort();
      columns = ['Date', 'Billed including returns', 'Cash events', 'UPI events', 'Card events', 'Other payment events', 'Recorded payments', 'Unverified settlement']; numeric = columns.slice(1, 7);
      rows = dates.map(date => {
        const daySales = (data?.sales || []).filter(d => d.date === date);
        const p = (data?.payments || []).filter(event => event.date === date);
        const paymentSum = (method: string) => Math.round(p.filter(event => method === 'OTHER' ? !['CASH', 'UPI', 'CARD'].includes(event.method) : event.method === method).reduce((n, event) => n + event.amount, 0) * 100) / 100;
        return { Date: date, 'Billed including returns': Math.round(daySales.reduce((n, d) => n + d.total, 0) * 100) / 100, 'Cash events': paymentSum('CASH'), 'UPI events': paymentSum('UPI'), 'Card events': paymentSum('CARD'), 'Other payment events': paymentSum('OTHER'), 'Recorded payments': Math.round(p.reduce((n, event) => n + event.amount, 0) * 100) / 100, 'Unverified settlement': daySales.some(d => d.kind !== 'Sale') ? 'Counter sales or returns' : 'See payment warning' };
      });
    }
    const totals: Row = {};
    if (rows.length) { totals[columns[0]] = 'Total'; for (const key of numeric.filter(key => key !== 'Stock' && key !== 'MRP')) totals[key] = sum(rows, key); }
    return { columns, numeric, rows, totals };
  }, [data, report, search, dayType, purchaseType, gstFilter, marginType, tag, manufacturer, marginSort]);
  const view = { ...rawView, columns: rawView.columns.filter((column, index) => index === 0 || !hiddenColumns.includes(column)) };
  const tags = Array.from(new Set((data?.items || []).flatMap(item => itemTags(item.tags)))).sort();
  const help: Record<string, string> = { Item: 'Inventory name from the sale record.', 'Item ID': 'Inventory batch identity. Duplicate records are not merged.', Category: 'Current inventory category.', Unit: 'Current inventory pack size or stock unit.', Manufacturer: 'Current inventory manufacturer.', Quantity: 'Net sale quantity after returns.', Stock: 'Current stock for this inventory record, not stock at the end of the selected period.', MRP: 'Current recorded maximum retail price.', 'Sales amount': 'Sum of recorded sale line totals less returns.', 'Recorded cost estimate': 'Quantity multiplied by linked movement cost snapshots where the quantities match. Discounts and free units may be missing.', 'Net GST': 'Unknown because linked purchase input GST is unavailable.', Profit: 'Unknown until tax-exclusive landed cost and input GST can be linked to each sale.' };
  const exportNotice = `PARTIAL AND UNVERIFIED: Stock and purchases require cleanup. Workflow reversals, missing payment events, returns, costs and tax splits may make totals incomplete. Only period invoices and invoices with payment events in this period are checked for payment gaps. Unknown values are not zero. Reversed or reversal-period documents: ${data?.reversedDocuments.join(', ') || 'none detected'}. Invoice payment gaps: ${data?.paymentGaps.join(', ') || 'none detected among checked invoices'}.`;
  const matrix = () => reportExportMatrix(view.columns, view.rows, view.totals);
  const download = () => {
    const csv = reportCsv(exportNotice, loadedRange, matrix());
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `pharmacy-${report}-${loadedRange.replaceAll(' ', '-')}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const downloadExcel = async () => {
    try {
      const xlsx = await import('xlsx');
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([[exportNotice], [`Period ${loadedRange}`], ...matrix()]), 'Report');
      xlsx.writeFile(workbook, `pharmacy-${report}-${loadedRange.replaceAll(' ', '-')}.xlsx`);
    } catch { setError('Could not create the Excel file. Try the CSV download.'); }
  };
  const downloadPdf = async () => {
    try { await downloadReportPdf(title, loadedRange, exportNotice, matrix(), `pharmacy-${report}-${loadedRange.replaceAll(' ', '-')}.pdf`); }
    catch { setError('Could not create the PDF. Try printing the report instead.'); }
  };
  const title = reports.find(item => item.id === report)!.title;
  return <div className="space-y-6 p-4 md:p-6">
    <PageHeader title="Pharmacy Report" description="Pharmacy-only reports. Clinical reports remain under Admin." />
    <div role="alert" className="rounded-md border border-amber-500 bg-amber-50 p-4 text-amber-950">Inventory and purchase records require cleanup and a physical stock take. Figures may be wrong. Do not rely on these reports until the data is reconciled.</div>
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="space-y-3 print:hidden"><label className="block text-sm font-medium" htmlFor="report-search">Find a report</label><Input id="report-search" value={reportSearch} onChange={e => setReportSearch(e.target.value)} placeholder="Search reports" />
        {['GST Reports', 'Margin Reports', 'Stock Reports', 'Accounting Reports', 'Others'].map(category => <div key={category}><h2 className="mt-4 font-semibold">{category}</h2>{filteredReports.filter(item => item.category === category).map(item => <button type="button" key={item.id} onClick={() => { setReport(item.id); setSearch(''); }} aria-current={report === item.id ? 'page' : undefined} className={`block w-full rounded px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 ${report === item.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{item.title}</button>)}</div>)}
        <p className="text-sm text-muted-foreground">GSTR reports are unavailable until the accountant confirms requirements.</p>
      </aside>
      <main className="min-w-0 space-y-4"><h2 className="text-xl font-semibold">{title}</h2><div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="grid gap-1 text-sm font-medium">From<Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="grid gap-1 text-sm font-medium">To<Input type="date" value={to} onChange={e => setTo(e.target.value)} /></label><Button disabled={loading} onClick={load}>{loading ? 'Loading…' : 'Go'}</Button>
        {report === 'purchase' && <><label className="grid gap-1 text-sm font-medium">Type<select className="h-10 rounded-md border bg-background px-3" value={purchaseType} onChange={e => setPurchaseType(e.target.value as 'purchases' | 'sales')}><option value="purchases">Purchase</option><option value="sales">Sales</option></select></label><label className="grid gap-1 text-sm font-medium">GST filter<select className="h-10 rounded-md border bg-background px-3" value={gstFilter} onChange={e => setGstFilter(e.target.value as typeof gstFilter)}><option value="all">All</option><option value="with">With GST</option><option value="without">Without GST</option><option value="unknown">Unknown GST</option></select></label></>}
        {report === 'margin' && <><label className="grid gap-1 text-sm font-medium">Type<select className="h-10 rounded-md border bg-background px-3" value={marginType} onChange={e => setMarginType(e.target.value as typeof marginType)}><option value="net">Sales and returns</option><option value="sales">Sales only</option></select></label><label className="grid gap-1 text-sm font-medium">Tags<select className="h-10 rounded-md border bg-background px-3" value={tag} onChange={e => setTag(e.target.value)}><option value="">All tags</option>{tags.map(value => <option value={value} key={value}>{value}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">Sort by<select className="h-10 rounded-md border bg-background px-3" value={marginSort} onChange={e => setMarginSort(e.target.value as typeof marginSort)}><option value="profit">Highest profit (when known)</option><option value="sales">Highest sales</option><option value="name">Item name</option></select></label><details><summary className="cursor-pointer text-sm font-medium">More filters ({manufacturer ? 1 : 0})</summary><label className="grid gap-1 text-sm font-medium">Manufacturer<Input value={manufacturer} onChange={e => setManufacturer(e.target.value)} /></label></details></>}
        {report === 'day' && <label className="grid gap-1 text-sm font-medium">Type<select className="h-10 rounded-md border bg-background px-3" value={dayType} onChange={e => setDayType(e.target.value as 'sales' | 'purchases')}><option value="sales">Sales</option><option value="purchases">Purchases</option></select></label>}
        {report !== 'collection' && <label className="grid gap-1 text-sm font-medium">Search rows<Input value={search} onChange={e => setSearch(e.target.value)} placeholder={report === 'margin' ? 'Item name or ID' : 'Name or bill number'} /></label>}
        {data && <details><summary className="cursor-pointer text-sm font-medium">Show columns</summary><div className="max-h-64 overflow-auto rounded-md border bg-background p-3">{rawView.columns.map((column, index) => <label key={column} className="flex gap-2 whitespace-nowrap text-sm"><input type="checkbox" checked={index === 0 || !hiddenColumns.includes(column)} disabled={index === 0} onChange={event => setHiddenColumns(current => event.target.checked ? current.filter(value => value !== column) : [...current, column])} />{column}</label>)}</div></details>}
        <Button variant="outline" disabled={!data} onClick={download}>Download CSV</Button><Button variant="outline" disabled={!data} onClick={() => void downloadExcel()}>Download Excel</Button><Button variant="outline" disabled={!data} onClick={() => void downloadPdf()}>Download PDF</Button><Button variant="outline" disabled={!data} onClick={() => window.print()}>Print</Button>
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {!data && !error && <p>{loading ? 'Loading report…' : 'Choose a date range and select Go.'}</p>}
      {data && <><p className="text-sm font-semibold">Partial and unverified totals. Period {loadedRange}. Amounts are in rupees. Unknown means the underlying record does not support a reliable value.</p>
        <div className="space-y-1 rounded-md border p-3 text-sm"><p>Tax components and cess are unknown where the underlying transaction does not record them. GST totals are not GST returns.</p>
          {report === 'collection' && <p>Recorded payments are payment events, not cash counted. Payments without events, counter-sale settlements and return refunds cannot be reconciled here. Payments for earlier bills can appear in this period. Only bills dated in this period or with recorded payments in this period are checked for gaps; other historical gaps may be missed.</p>}
          {report === 'margin' && <p>Recorded cost is an estimate from linked stock-cost snapshots when quantities match. The snapshot may omit discounts or free units. Tax-exclusive landed cost and linked input GST are unavailable, so net GST and profit are unknown. Items are grouped by inventory ID; duplicate records remain separate.</p>}
          {data.paymentGaps.length > 0 && <p>Checked invoices with paid amounts that do not match recorded payments: {data.paymentGaps.join(', ')}.</p>}
          {data.reversedDocuments.length > 0 && <p>These documents were reversed or have a reversal in this period. Reversed documents are excluded pending a historical reversal audit: {data.reversedDocuments.join(', ')}. Totals may be incomplete.</p>}
        </div>
        {report === 'margin' && view.rows.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Sales amount', 'Sales amount'], ['Recorded cost estimate', 'Recorded cost estimate'], ['Net GST', 'Net GST'], ['Profit', 'Profit']].map(([label, key]) => <div key={key} className="rounded-md border p-3"><p className="text-sm text-muted-foreground">{label}</p><p className="text-lg font-semibold tabular-nums">{typeof view.totals[key] === 'number' ? `₹${money(view.totals[key] as number)}` : 'Unknown'}</p></div>)}</div>}
        {!view.rows.length ? <p>No matching records for this range.</p> : <div className="overflow-auto rounded-md border"><table className="w-full border-collapse text-sm tabular-nums">
          <thead><tr>{view.columns.map((col, index) => <th key={col} title={report === 'margin' ? help[col] : undefined} className={`border-b bg-muted px-3 py-2 whitespace-nowrap ${view.numeric.includes(col) ? 'text-right' : 'text-left'} ${(report === 'purchase' || report === 'day') && index === 0 ? 'sticky left-0 z-20 w-36 min-w-36 max-w-36 overflow-hidden text-ellipsis' : (report === 'purchase' || report === 'day') && index === 1 ? 'sticky left-36 z-20 w-36 min-w-36 max-w-36 overflow-hidden text-ellipsis' : ''}`}>{col}{report === 'margin' && help[col] && <span aria-label={help[col]} className="ml-1">ⓘ</span>}</th>)}</tr>
          <tr className="font-semibold">{view.columns.map((col, index) => <td key={col} className={`border-b bg-muted px-3 py-2 whitespace-nowrap ${view.numeric.includes(col) ? 'text-right' : 'text-left'} ${(report === 'purchase' || report === 'day') && index === 0 ? 'sticky left-0 z-20 w-36 min-w-36 max-w-36 overflow-hidden text-ellipsis' : (report === 'purchase' || report === 'day') && index === 1 ? 'sticky left-36 z-20 w-36 min-w-36 max-w-36 overflow-hidden text-ellipsis' : ''}`}>{view.totals[col] === null ? 'Unknown' : typeof view.totals[col] === 'number' ? money(view.totals[col] as number) : view.totals[col] || ''}</td>)}</tr></thead>
          <tbody>{view.rows.map((row, index) => <tr key={index} className="border-b">{view.columns.map((col, cellIndex) => <td key={col} title={String(row[col] ?? 'Unknown')} className={`px-3 py-2 whitespace-nowrap ${view.numeric.includes(col) ? 'text-right' : 'text-left'} ${(report === 'purchase' || report === 'day') && cellIndex === 0 ? 'sticky left-0 z-10 w-36 min-w-36 max-w-36 overflow-hidden text-ellipsis bg-background' : (report === 'purchase' || report === 'day') && cellIndex === 1 ? 'sticky left-36 z-10 w-36 min-w-36 max-w-36 overflow-hidden text-ellipsis bg-background' : ''}`}>{report === 'margin' && col === 'Item' && row['Item ID'] !== 'Unknown' ? <Link className="underline" href={`/dashboard/inventory?area=stock&view=list&item=${encodeURIComponent(String(row['Item ID']))}`}>{row[col]}</Link> : row[col] == null ? 'Unknown' : typeof row[col] === 'number' ? money(row[col] as number) : row[col]}</td>)}</tr>)}</tbody></table></div>}
      </>}
      </main>
    </div>
  </div>;
}
