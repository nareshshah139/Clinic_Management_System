'use client';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { displayClinicDate } from '@/lib/date-display';
import type { LastVisit } from '@/lib/last-visit';

export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export type PendingCarry = { source: string; items: { section: string; label: string }[] };

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

export function useUnreviewedCarryPrompt(goToSection: (section: string) => void): [(pending: PendingCarry) => Promise<boolean>, ReactNode] {
  const [pending, setPending] = useState<PendingCarry | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((complete: boolean) => void) | null>(null);
  const review = useRef<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const ask = useCallback((next: PendingCarry) => {
    if (resolver.current) return Promise.resolve(false);
    review.current = null;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPending(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const settle = (complete: boolean, section: string | null = null) => {
    review.current = section;
    resolver.current?.(complete);
    resolver.current = null;
    setOpen(false);
  };

  const dialog = (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) settle(false); }}>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        className="sm:max-w-md"
        onCloseAutoFocus={(event: Event) => {
          event.preventDefault();
          const section = review.current;
          review.current = null;
          if (section) goToSection(section);
          else if (opener.current?.isConnected) opener.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{"Some items from the last visit haven't been reviewed"}</DialogTitle>
          <DialogDescription>{`Carried forward from the ${pending?.source ?? ''} and not edited since:`}</DialogDescription>
        </DialogHeader>
        <ul aria-label="Items not reviewed" className="list-disc space-y-1 pl-5 text-sm">
          {pending?.items.map((item) => <li key={item.label}>{item.label}</li>)}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => settle(false, pending?.items[0]?.section ?? null)}>Review items</Button>
          <Button onClick={() => settle(true)}>Complete visit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return [ask, dialog];
}
