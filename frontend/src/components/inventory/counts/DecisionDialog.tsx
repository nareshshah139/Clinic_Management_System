'use client';

import { useId, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import { formatDisplayDay } from '@/lib/date-ranges';
import { getISTDateString } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { requestKey } from '@/components/inventory/workspace-model';
import { ActionDialog, DialogClose } from '@/components/inventory/purchase/ActionDialog';
import { countPath, failureMessage, failureOf, signedUnits, type CountDetail } from './count-model';

export type Decision = 'approve' | 'reject';

export const defaultApprovalReason = (detail: Pick<CountDetail, 'signedBy' | 'signedAt'>) =>
  detail.signedBy && detail.signedAt ? `Physical count signed by ${detail.signedBy.name} on ${formatDisplayDay(getISTDateString(new Date(detail.signedAt)))}` : '';

/**
 * @cc [owner:nareshshah139,label:product] count-decision-dialog
 * Approving MUST show, per differing batch, the stock now and the stock after the counted
 * difference is applied, and needs a reason (prefilled with who signed and when). Rejecting needs
 * a typed reason and says stock will not change. The sole approver deciding their own count must
 * tick an explicit confirmation.
 */
export function DecisionDialog({
  anchor,
  detail,
  decision,
  onClose,
  onDecided,
  onStale,
}: {
  anchor: HTMLElement;
  detail: CountDetail;
  decision: Decision;
  onClose: () => void;
  onDecided: (detail: CountDetail) => void;
  onStale: (message: string) => void;
}) {
  const approve = decision === 'approve';
  const [key] = useState(requestKey);
  const [reason, setReason] = useState(() => (approve ? defaultApprovalReason(detail) : ''));
  const [own, setOwn] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const ownRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const changes = detail.lines.filter((line) => line.difference);
  const self = detail.can.decideOwn;

  const submit = async () => {
    if (!reason.trim()) {
      setError(approve ? 'Give a reason for the stock change.' : 'Say why this count is rejected, so the next count can fix it.');
      reasonRef.current?.focus();
      return 'stay' as const;
    }
    if (self && !own) {
      setError('Tick the box to confirm you are deciding your own count.');
      ownRef.current?.focus();
      return 'stay' as const;
    }
    setSaving(true);
    setError('');
    try {
      const decided = await apiClient.post<CountDetail>(`${countPath(detail.id)}/${decision}`, {
        version: detail.version,
        requestKey: key,
        reason: reason.trim(),
        ...(self ? { selfApproval: true } : {}),
      });
      onDecided(decided);
      return 'done' as const;
    } catch (failure) {
      const { status, body } = failureOf(failure);
      if (status === 409 && body?.code !== 'COUNT_DELTA_BELOW_STOCK' && body?.code !== 'COUNT_REQUEST_KEY_REUSED') onStale(failureMessage(failure));
      else setError(failureMessage(failure));
      return 'stay' as const;
    } finally {
      setSaving(false);
    }
  };

  return (
    <ActionDialog
      anchor={anchor}
      width={480}
      title={approve ? 'Approve and adjust stock' : 'Reject this count'}
      description={
        approve
          ? `Each difference is added to the stock on record now, so sales since the count still count.`
          : 'Stock does not change. These batches go back into the cycle to be counted again.'
      }
      saving={saving}
      initialFocus={reasonRef}
      onClose={onClose}
      onSubmit={submit}
      footer={() => (
        <>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={saving}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" variant={approve ? 'default' : 'destructive'} disabled={saving}>
            {saving ? (approve ? 'Approving…' : 'Rejecting…') : approve ? 'Approve and adjust stock' : 'Reject count'}
          </Button>
        </>
      )}
    >
      {approve && (
        <ul aria-label="Stock changes" className="flex max-h-56 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border text-sm">
          {changes.map((line) => {
            const now = line.currentStock ?? line.systemStock ?? 0;
            const diff = line.difference ?? 0;
            return (
              <li key={line.id} className="flex flex-col gap-0.5 px-3 py-2">
                <span className="font-semibold">
                  {line.name} <span className="font-normal">· {line.batchNumber}</span>
                </span>
                <span className="tabular-nums">
                  {now} now <span aria-hidden="true">→</span>
                  <span className="sr-only">becomes</span> <strong>{now + diff}</strong> ({signedUnits(diff)})
                </span>
                {line.currentStock !== null && line.currentStock !== line.systemStock && (
                  <span className="text-xs">It was {line.systemStock} when counted; stock has moved since.</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          Reason (required)
        </label>
        <Textarea
          id={id}
          ref={reasonRef}
          value={reason}
          maxLength={500}
          rows={2}
          aria-invalid={(!!error && !reason.trim()) || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setReason(event.target.value);
            if (error) setError('');
          }}
          className="text-base md:text-sm"
        />
      </div>
      {self && (
        <label className="flex items-start gap-2 text-sm">
          <input ref={ownRef} type="checkbox" className="mt-1 size-4" checked={own} onChange={(event) => setOwn(event.target.checked)} />
          <span>I signed this count and no other approver is active in this branch. I am deciding it myself; this is recorded.</span>
        </label>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive-text">
          {error}
        </p>
      )}
    </ActionDialog>
  );
}
