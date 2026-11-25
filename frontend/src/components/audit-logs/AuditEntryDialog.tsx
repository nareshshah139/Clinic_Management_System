'use client';

import { displayClinicDateTime } from '@/lib/date-display';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fieldChanges, recordNoun, summary, type AuditEntry } from './audit-log-model';

function Change({ label, before, after }: { label: string; before: string | null; after: string | null }) {
  return (
    <li className="flex flex-col gap-0.5 border-b border-border py-2 last:border-b-0">
      <span className="font-medium">{label}</span>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
        {before !== null && (
          <>
            <dt className="text-muted-foreground">{after === null ? 'Was' : 'Before'}</dt>
            <dd className="break-words">{before}</dd>
          </>
        )}
        {after !== null && (
          <>
            <dt className="text-muted-foreground">{before === null ? 'Set to' : 'After'}</dt>
            <dd className="break-words">{after}</dd>
          </>
        )}
      </dl>
    </li>
  );
}

export function AuditEntryDialog({ entry, who, onClose }: { entry: AuditEntry | null; who: string; onClose: () => void }) {
  const changes = entry ? fieldChanges(entry) : [];
  return (
    <Dialog open={entry !== null} onOpenChange={(open: boolean) => !open && onClose()}>
      {entry && (
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{summary(entry)}</DialogTitle>
            <DialogDescription>
              {who} · {displayClinicDateTime(entry.timestamp)}
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Record</dt>
            <dd className="min-w-0 break-all">
              {recordNoun(entry.entity)} <span className="text-muted-foreground">· {entry.entityId}</span>
            </dd>
            {entry.ipAddress && (
              <>
                <dt className="text-muted-foreground">Network address</dt>
                <dd className="break-all">{entry.ipAddress}</dd>
              </>
            )}
          </dl>
          <section aria-labelledby={`changes-${entry.id}`}>
            <h3 id={`changes-${entry.id}`} className="font-semibold">
              What changed
            </h3>
            {changes.length ? (
              <ul className="mt-1">
                {changes.map((change) => (
                  <Change key={change.field} {...change} />
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                {entry.oldValues || entry.newValues ? 'No field took a new value.' : 'No field details were recorded for this entry.'}
              </p>
            )}
          </section>
        </DialogContent>
      )}
    </Dialog>
  );
}
