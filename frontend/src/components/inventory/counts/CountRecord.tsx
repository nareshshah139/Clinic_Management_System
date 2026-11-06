'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { Button } from '@/components/ui/button';
import { BatchLine, CountStateBadge, Difference } from './count-parts';
import { DecisionDialog, type Decision } from './DecisionDialog';
import { clinicStamp, countSummary, summarySentence, type CountDetail } from './count-model';

const join = (names: string[]) => (names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`);

/**
 * @cc [owner:nareshshah139,label:product] count-signed-record
 * A signed count MUST read as a locked record: who signed, when, every batch's system and counted
 * quantity, the difference and notes, and the decision with its reason. An approver sees the
 * differing batches first and decides from here; the signer is told who can decide instead.
 */
export function CountRecord({ detail, onDecided, onStale }: { detail: CountDetail; onDecided: (detail: CountDetail) => void; onStale: (message: string) => void }) {
  const [acting, setActing] = useState<{ decision: Decision; anchor: HTMLElement } | null>(null);
  const awaiting = detail.state === 'AWAITING_APPROVAL';
  const differing = detail.lines.filter((line) => line.difference);
  const [all, setAll] = useState(!awaiting || !differing.length);
  const shown = all ? [...differing, ...detail.lines.filter((line) => !line.difference)] : differing;
  const figures = countSummary(detail.lines);

  return (
    <section aria-labelledby="count-record-title" className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="count-record-title" tabIndex={-1} className="text-xl font-semibold">{detail.reference}</h2>
          <CountStateBadge state={detail.state} />
          <span className="text-sm">{detail.origin === 'CYCLE' ? 'Cycle count' : 'On-demand count'}</span>
        </div>
        {detail.signedBy && detail.signedAt ? (
          <p className="flex items-center gap-2 text-base">
            <Lock aria-hidden="true" className="size-4 shrink-0" />
            <span>
              Signed by <strong>{detail.signedBy.name}</strong> on {clinicStamp(detail.signedAt)}
            </span>
          </p>
        ) : (
          <p className="text-base">Assigned to <strong>{detail.assignedTo?.name ?? 'a former staff member'}</strong>. Only they can enter and sign it off.</p>
        )}
        {detail.signOffNote && (
          <blockquote className="border-l-4 border-border pl-3 text-base">
            <span className="sr-only">Sign-off note: </span>“{detail.signOffNote}”
          </blockquote>
        )}
        {detail.decidedBy && detail.decidedAt && (
          <p className="text-base">
            {detail.state === 'REJECTED' ? 'Rejected' : 'Approved'} by <strong>{detail.decidedBy.name}</strong> on {clinicStamp(detail.decidedAt)}
            {detail.selfApproval && ' (their own count; no other approver was active)'}
            {detail.decisionReason && <>: “{detail.decisionReason}”</>}
            {detail.state === 'REJECTED' && '. Stock did not change; these batches will be counted again.'}
          </p>
        )}
        {detail.state === 'POSTED_NO_DIFF' && <p className="text-base">Every batch matched the system, so stock was confirmed without a change.</p>}
        <p className="text-base font-semibold tabular-nums">{summarySentence(figures)}</p>
      </header>

      {awaiting && detail.can.decide && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning-border bg-warning-soft p-3">
          <p className="text-base">
            {detail.can.decideOwn
              ? 'You signed this count and no other approver is active, so you decide it. Your decision is recorded as your own.'
              : 'Stock changes only when you approve. Check the differing batches below.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={(event) => setActing({ decision: 'approve', anchor: event.currentTarget })}>Approve and adjust stock</Button>
            <Button variant="outline" onClick={(event) => setActing({ decision: 'reject', anchor: event.currentTarget })}>Reject</Button>
          </div>
        </div>
      )}
      {awaiting && !detail.can.decide && detail.approvers.length > 0 && (
        <p className="rounded-lg border border-border bg-muted p-3 text-base">You signed this count, so someone else decides it. Ask {join(detail.approvers)}.</p>
      )}

      <div role="list" aria-label="Counted batches" className="flex flex-col rounded-lg border border-border">
        <div aria-hidden="true" className="hidden gap-x-3 rounded-t-lg bg-muted px-3 py-2 text-sm font-semibold sm:grid sm:grid-cols-[minmax(12rem,2.6fr)_4.5rem_4.5rem_minmax(7rem,1fr)_minmax(10rem,2fr)]">
          <span>Item</span>
          <span className="text-right">System</span>
          <span className="text-right">Counted</span>
          <span>Difference</span>
          <span>Note</span>
        </div>
        {shown.map((line) => (
          <div key={line.id} role="listitem" className="grid grid-cols-3 gap-x-3 gap-y-1 border-t border-border px-3 py-2.5 first-of-type:border-t-0 sm:grid-cols-[minmax(12rem,2.6fr)_4.5rem_4.5rem_minmax(7rem,1fr)_minmax(10rem,2fr)] sm:items-center">
            <div className="col-span-3 min-w-0 sm:col-span-1">
              <BatchLine line={line} />
              {line.history && <span className="block text-sm font-medium text-warning-text">{line.history}</span>}
            </div>
            <div className="text-sm sm:text-right">
              <span className="block text-xs sm:hidden">System</span>
              <span className="tabular-nums">{line.systemStock ?? '—'}</span>
            </div>
            <div className="text-sm sm:text-right">
              <span className="block text-xs sm:hidden">Counted</span>
              <span className="font-semibold tabular-nums">{line.physicalStock ?? '—'}</span>
            </div>
            <div className="text-sm">
              <span className="block text-xs sm:hidden">Difference</span>
              <Difference line={line} />
            </div>
            <div className="col-span-3 text-sm [overflow-wrap:anywhere] sm:col-span-1">{line.note}</div>
          </div>
        ))}
      </div>
      {!all && (
        <Button variant="outline" className="self-start" onClick={() => setAll(true)}>
          Show all {detail.lines.length} batches
        </Button>
      )}
      {figures.differences > 0 && (
        <p className="whitespace-nowrap text-sm tabular-nums">Net value of the differences {formatRupees(figures.netValue)}</p>
      )}

      {acting && (
        <DecisionDialog
          anchor={acting.anchor}
          detail={detail}
          decision={acting.decision}
          onClose={() => setActing(null)}
          onStale={(message) => {
            setActing(null);
            onStale(message);
          }}
          onDecided={(decided) => {
            setActing(null);
            toast({
              title: decided.state === 'REJECTED' ? 'Count rejected. Stock unchanged.' : 'Approved. Stock adjusted.',
              description: decided.state === 'REJECTED' ? 'These batches go back into the cycle to be counted again.' : `${decided.differences} ${decided.differences === 1 ? 'batch' : 'batches'} adjusted by the counted difference.`,
            });
            onDecided(decided);
          }}
        />
      )}
    </section>
  );
}
