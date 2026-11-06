'use client';

import { useId, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { requestKey } from '@/components/inventory/workspace-model';
import { ActionDialog, DialogClose } from '@/components/inventory/purchase/ActionDialog';
import { BatchLine, Difference, SummaryLine } from './count-parts';
import { countPath, countSummary, failureMessage, failureOf, type CountDetail, type CountLine } from './count-model';

/**
 * @cc [owner:nareshshah139,label:product] count-sign-off-dialog
 * Signing off MUST show the summary of what is being signed, list every differing batch, require
 * a note when anything differs, and send one request key per dialog so a double click signs once.
 */
export function SignOffDialog({
  anchor,
  detail,
  version,
  lines,
  signer,
  onClose,
  onSigned,
  onIncomplete,
  onStale,
}: {
  anchor: HTMLElement;
  detail: CountDetail;
  version: number;
  lines: CountLine[];
  signer: string;
  onClose: () => void;
  onSigned: (detail: CountDetail) => void;
  onIncomplete: (lineIds: string[], message: string) => void;
  onStale: (message: string) => void;
}) {
  const [key] = useState(requestKey);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const noteId = useId();
  const figures = countSummary(lines);
  const differing = lines.filter((line) => line.physicalStock !== line.systemStock);
  const needsNote = differing.length > 0;

  const submit = async () => {
    if (needsNote && !note.trim()) {
      setError('Say why these differ, for the approver.');
      noteRef.current?.focus();
      return 'stay' as const;
    }
    setSaving(true);
    setError('');
    try {
      const signed = await apiClient.post<CountDetail>(`${countPath(detail.id)}/sign-off`, {
        version,
        requestKey: key,
        note: note.trim(),
        lines: lines.map((line) => ({ id: line.id, physicalStock: line.physicalStock, note: line.note })),
      });
      onSigned(signed);
      return 'done' as const;
    } catch (failure) {
      const { status, body } = failureOf(failure);
      if (body?.code === 'COUNT_INCOMPLETE') onIncomplete(body.lineIds ?? [], failureMessage(failure));
      else if (status === 409) onStale(failureMessage(failure));
      else {
        setError(failureMessage(failure));
        noteRef.current?.focus();
      }
      return 'stay' as const;
    } finally {
      setSaving(false);
    }
  };

  return (
    <ActionDialog
      anchor={anchor}
      width={460}
      title="Sign off this count"
      description={<SummaryLine figures={figures} />}
      saving={saving}
      initialFocus={noteRef}
      onClose={onClose}
      onSubmit={submit}
      footer={() => (
        <>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={saving}>
              Keep counting
            </Button>
          </DialogClose>
          <Button type="submit" disabled={saving}>
            {saving ? 'Signing…' : needsNote ? 'Sign off and send for approval' : 'Sign off'}
          </Button>
        </>
      )}
    >
      {needsNote && (
        <ul aria-label="Batches that differ" className="flex max-h-56 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
          {differing.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <BatchLine line={line} />
                <span className="block">
                  System {line.systemStock} · counted {line.physicalStock}
                </span>
              </span>
              <Difference line={line} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={noteId} className="text-sm font-medium">
          {needsNote ? 'Why do these differ? (required)' : 'Note (optional)'}
        </label>
        <Textarea
          id={noteId}
          ref={noteRef}
          value={note}
          maxLength={1000}
          rows={3}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${noteId}-error` : undefined}
          onChange={(event) => {
            setNote(event.target.value);
            if (error) setError('');
          }}
          className="text-base md:text-sm"
        />
        {error && (
          <p id={`${noteId}-error`} role="alert" className="text-sm text-destructive-text">
            {error}
          </p>
        )}
      </div>
      <p className="text-sm">
        Signing records {signer ? <strong>{signer}</strong> : 'your name'} and the time. The count is then locked; only a fresh count can replace it.
        {needsNote && ' Stock changes only after a doctor or administrator approves.'}
      </p>
    </ActionDialog>
  );
}
