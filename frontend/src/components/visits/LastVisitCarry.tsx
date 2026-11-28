'use client';
import { Button } from '@/components/ui/button';
import { displayClinicDate } from '@/lib/date-display';
import type { LastVisit } from '@/lib/last-visit';

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export function LastVisitOffer({ visit, medicineCount, onStart }: { visit: LastVisit; medicineCount: number; onStart: () => void }) {
  const summary = [
    displayClinicDate(new Date(visit.date)),
    visit.doctor,
    visit.draft ? 'Draft' : '',
    visit.diagnosis || visit.chiefComplaints,
    medicineCount > 0 ? plural(medicineCount, 'medicine') : '',
  ].filter(Boolean).join(' · ');
  return (
    <section aria-label="Last visit" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1 basis-72 break-words">
        <div className="font-medium">{`Last visit · ${summary}`}</div>
        <div className="text-xs text-muted-foreground">Copies its complaints, diagnosis, history and medicines into this visit. You can change all of it.</div>
      </div>
      <Button type="button" size="sm" className="shrink-0" onClick={onStart}>Start from last visit</Button>
    </section>
  );
}

export const visitSource = (visit: Pick<LastVisit, 'date' | 'doctor' | 'draft'>) =>
  `${displayClinicDate(new Date(visit.date))} visit${visit.doctor ? ` by ${visit.doctor}` : ''}${visit.draft ? ' (draft, not completed)' : ''}`;

export function CarriedForwardNotice({ source, carried, onUndo }: { source: string; carried: string[]; onUndo: () => void }) {
  return (
    <section aria-label="Carried forward" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-sm text-warning-text">
      <div className="min-w-0 flex-1 basis-72 break-words">
        {`Carried forward from the ${source}: ${carried.join(', ')}. Check each one before you complete this visit.`}
      </div>
      <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onUndo}>Undo</Button>
    </section>
  );
}
