'use client';

import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { summarizeVisit } from '@/components/visits/PatientHistoryVisitCard';

type Entry = Record<string, any>;

const doctorText = (name?: string) => (name ? `Dr. ${name.replace(/^dr\.?\s+/i, '')}` : '');

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3">
      <dt className="w-32 shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words text-gray-900">{children}</dd>
    </div>
  );
}

/** Entries are newest first and already limited to what the history shows the viewer. */
export default function LastVisitPanel({ entries, loading, error }: { entries: Entry[]; loading: boolean; error: string | null }) {
  const visits = entries.filter((entry) => entry.entryType !== 'appointment');
  const last = visits[0];
  const summary = last ? summarizeVisit(last) : null;
  const earlier = summary && summary.medicines.length === 0 ? visits.slice(1).map(summarizeVisit).find((v) => v.medicines.length > 0) : undefined;

  return (
    <Card>
      <CardContent className="space-y-3 text-sm">
        <h2 className="text-base font-semibold text-gray-900">Last visit</h2>
        {loading ? (
          <LoadingSkeleton label="Loading last visit…" />
        ) : error ? (
          <p role="alert" className="text-red-700">Unable to load the last visit. {error}</p>
        ) : !summary ? (
          <p className="text-gray-600">No visits yet.</p>
        ) : (
          <>
            <dl className="space-y-1.5">
              <Row label="Date">{[summary.dateLabel, doctorText(summary.doctorName)].filter(Boolean).join(' · ')}</Row>
              <Row label="Complaint">{summary.chiefComplaint || 'Not recorded'}</Row>
              <Row label="Diagnosis">{summary.primaryDiagnosis || 'Not recorded'}</Row>
              <Row label="Medicines">{summary.medicines.length > 0 ? summary.medicines.join(', ') : 'No medicines prescribed'}</Row>
              {summary.review.length > 0 && <Row label="Review">{summary.review.join('\n')}</Row>}
            </dl>
            {earlier && (
              <dl className="border-t border-gray-200 pt-3">
                <Row label="Last prescription">{earlier.dateLabel}: {earlier.medicines.join(', ')}</Row>
              </dl>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
