'use client';

import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { getISTDateString } from '@/lib/utils';
import { billTypeLabel, clinicMoney } from '@/lib/clinic-billing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type CollectionReport = {
  date: string; received: number; refunded: number; net: number; paymentCount: number;
  methods: { method: string; amount: number }[];
  entries: { id: string; source: string; invoiceNumber: string; patientName: string; billType: string | null; paidAt: string; method: string; amount: number }[];
};

/**
 * @cc [owner:nareshshah139,label:product] collection-current-date-only
 * A selected day's report MUST be hidden while loading or on failure. A late
 * response for a previously selected day MUST NOT replace the current report.
 */
export default function DailyCollection() {
  const [date, setDate] = useState(() => getISTDateString());
  const [report, setReport] = useState<CollectionReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    setReport(null); setError(''); setLoading(true);
    apiClient.get<CollectionReport>('/billing/daily-collection', { date })
      .then(value => { if (current) setReport(value); })
      .catch(() => { if (current) setError('Could not load collections. Try again.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [date, reload]);

  return <main className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <PageHeader title={<>Daily Collection</>} />
      <Link className="underline text-base" href="/dashboard/clinic-billing">Consultation and procedure bills</Link>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-base">Collection date (IST)<Input aria-label="Collection date" type="date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} /></label>
      <Button variant="outline" onClick={() => setReload(n => n + 1)}>Refresh</Button>
    </div>
    <p className="text-base text-muted-foreground">Completed clinic and pharmacy payments by receipt date. Refunds reduce the net collection.</p>
    {loading && <LoadingSkeleton label="Loading collections…" />}
    {error && <p role="alert" className="text-destructive-text">{error}</p>}
    {report && <>
      <dl className="flex flex-wrap gap-x-10 gap-y-4 border-y py-4 text-base">
        {([['Received', report.received], ['Refunded', report.refunded], ['Net collection', report.net]] as const).map(([label, amount]) => <div key={label}><dt>{label}</dt><dd className="text-xl font-semibold">{clinicMoney(amount)}</dd></div>)}
      </dl>
      <div className="flex flex-wrap gap-5">{report.methods.map(method => <span key={method.method}>{method.method} {clinicMoney(method.amount)}</span>)}</div>
      {!report.entries.length ? <EmptyState title="No completed payments for this date." description="Select another collection date to view payments." /> : <div className="overflow-x-auto">
        <table className="w-full text-base text-left">
          <caption className="text-left pb-3">{report.paymentCount} payments</caption>
          <thead><tr>{['Time (IST)', 'Patient', 'Bill', 'Type', 'Method', 'Amount'].map(title => <th key={title} scope="col" className="border-b px-3 py-2 font-semibold">{title}</th>)}</tr></thead>
          <tbody>{report.entries.map(entry => <tr key={entry.id}>
            <td className="border-b px-3 py-3">{new Date(entry.paidAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}</td>
            <td className="border-b px-3 py-3 break-words">{entry.patientName}</td>
            <td className="border-b px-3 py-3 break-words">{entry.invoiceNumber}</td>
            <td className="border-b px-3 py-3">{entry.source === 'PHARMACY' ? 'Pharmacy' : billTypeLabel(entry.billType)}</td>
            <td className="border-b px-3 py-3">{entry.method}</td>
            <td className="border-b px-3 py-3 tabular-nums">{clinicMoney(entry.amount)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
  </main>;
}
