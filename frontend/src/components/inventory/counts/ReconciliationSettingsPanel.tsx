'use client';

import { useId, useState } from 'react';
import { apiClient } from '@/lib/api';
import { formatDisplayDay } from '@/lib/date-ranges';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { batchCount, failureMessage, failureOf, forecastMessage, type ReconciliationSummary } from './count-model';

const ROLE_LABELS: Record<string, string> = { OWNER: 'Owner', ADMIN: 'Admin', DOCTOR: 'Doctor', PHARMACIST: 'Pharmacist', MANAGER: 'Manager' };
const LIMITS = { cycleDays: [1, 60], itemsPerPersonPerDay: [1, 200] } as const;
type NumberField = keyof typeof LIMITS;

const whole = (text: string, [min, max]: readonly [number, number]) => (/^\d+$/.test(text.trim()) && Number(text) >= min && Number(text) <= max ? Number(text) : null);

/**
 * @cc [owner:nareshshah139,label:product] reconciliation-settings
 * Settings MUST show the cycle length, items per person per day and who counts, with a plain
 * forecast of whether the cycle covers every batch in stock, updated as the values change, and the
 * current cycle's progress. Only people with stock reconciliation access can be chosen.
 */
export function ReconciliationSettingsPanel({ summary, onSaved }: { summary: ReconciliationSummary; onSaved: () => void }) {
  const saved = summary.settings;
  const staff = summary.staff ?? [];
  const [enabled, setEnabled] = useState(saved.enabled);
  const [text, setText] = useState<Record<NumberField, string>>({ cycleDays: String(saved.cycleDays), itemsPerPersonPerDay: String(saved.itemsPerPersonPerDay) });
  const [assignees, setAssignees] = useState(saved.assigneeIds.filter((id) => staff.some((person) => person.id === id)));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const id = useId();
  const dropped = saved.assigneeIds.filter((person) => !staff.some((candidate) => candidate.id === person)).length;
  const values = { cycleDays: whole(text.cycleDays, LIMITS.cycleDays), itemsPerPersonPerDay: whole(text.itemsPerPersonPerDay, LIMITS.itemsPerPersonPerDay) };
  const preview = values.cycleDays && values.itemsPerPersonPerDay ? forecastMessage({ cycleDays: values.cycleDays, itemsPerPersonPerDay: values.itemsPerPersonPerDay, assigneeIds: assignees }, summary.forecast.batches) : null;
  const changed =
    enabled !== saved.enabled ||
    values.cycleDays !== saved.cycleDays ||
    values.itemsPerPersonPerDay !== saved.itemsPerPersonPerDay ||
    assignees.length !== saved.assigneeIds.length ||
    assignees.some((person) => !saved.assigneeIds.includes(person));
  const restarts = (enabled && !saved.enabled) || (values.cycleDays !== null && values.cycleDays !== saved.cycleDays && enabled);
  const { cycle, forecast } = summary;
  const progress = forecast.batches ? Math.round((100 * forecast.covered) / forecast.batches) : 0;

  const save = async () => {
    if (values.cycleDays === null || values.itemsPerPersonPerDay === null) {
      setError('Check the highlighted numbers.');
      return;
    }
    if (enabled && !assignees.length) {
      setError('Choose at least one person to count before turning reconciliation on.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.patch('/inventory/workspace/settings', {
        version: summary.settingsVersion,
        reconciliation: { enabled, cycleDays: values.cycleDays, itemsPerPersonPerDay: values.itemsPerPersonPerDay, assigneeIds: assignees },
      });
      toast({ title: 'Stock count settings saved', description: restarts ? 'A new cycle starts today.' : undefined });
      onSaved();
    } catch (failure) {
      if (failureOf(failure).status === 409) {
        toast({ variant: 'warning', title: 'Someone else changed these settings', description: 'Showing the latest saved settings. Make your change again.' });
        onSaved();
      } else setError(failureMessage(failure));
    } finally {
      setSaving(false);
    }
  };

  const numberField = (field: NumberField, label: string, hint: string) => {
    const invalid = values[field] === null;
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-${field}`} className="text-sm font-medium">{label}</label>
        <Input
          id={`${id}-${field}`}
          inputMode="numeric"
          value={text[field]}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-${field}-hint`}
          onChange={(event) => setText((current) => ({ ...current, [field]: event.target.value }))}
          className="h-10 w-28 text-base tabular-nums md:text-base"
        />
        <span id={`${id}-${field}-hint`} className={cn('text-sm', invalid && 'text-destructive-text')}>
          {invalid ? `Whole number from ${LIMITS[field][0]} to ${LIMITS[field][1]}` : hint}
        </span>
      </div>
    );
  };

  return (
    <form
      className="flex max-w-3xl flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      noValidate
    >
      <div className="flex items-center gap-3">
        <Switch id={`${id}-enabled`} checked={enabled} onCheckedChange={setEnabled} aria-labelledby={`${id}-enabled-label`} />
        <span id={`${id}-enabled-label`} className="text-base font-medium">
          Stock reconciliation is {enabled ? 'on' : 'off'}
        </span>
      </div>
      <div className="flex flex-wrap gap-6">
        {numberField('cycleDays', 'Cycle length (days)', 'Every batch in stock is counted once per cycle.')}
        {numberField('itemsPerPersonPerDay', 'Items per person per day', 'Each counter gets at most this many a day.')}
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">People who count</legend>
        {staff.length ? (
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {staff.map((person) => (
              <label key={person.id} className="flex min-h-10 items-center gap-2 text-base">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={assignees.includes(person.id)}
                  onChange={(event) => setAssignees((current) => (event.target.checked ? [...current, person.id] : current.filter((value) => value !== person.id)))}
                />
                {person.name} <span className="text-sm">· {ROLE_LABELS[person.role] ?? person.role}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm">Nobody in this branch has stock reconciliation access yet.</p>
        )}
        {dropped > 0 && <p className="text-sm">{dropped === 1 ? 'One person' : `${dropped} people`} saved earlier can no longer count and will be removed when you save.</p>}
      </fieldset>
      {preview && (
        <p role="status" className={cn('rounded-lg border p-3 text-base', preview.short ? 'border-warning-border bg-warning-soft text-warning-text' : 'border-border bg-muted')}>
          {preview.message}
        </p>
      )}
      {restarts && <p className="text-sm">Saving starts a new cycle today.</p>}
      <section aria-label="Current cycle" className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
        {saved.enabled ? (
          <>
            <p className="text-base">
              <strong>Current cycle</strong> {formatDisplayDay(cycle.start)} to {formatDisplayDay(cycle.end)} · day {cycle.day} of {cycle.days}
            </p>
            <p className="text-base tabular-nums">
              {forecast.covered} of {batchCount(forecast.batches)} counted ({progress}%) · {cycle.daysLeft} {cycle.daysLeft === 1 ? 'day' : 'days'} left
            </p>
            <div aria-hidden="true" className="h-2 w-full max-w-md overflow-hidden rounded-full bg-muted">
              <div className={cn('h-full rounded-full', forecast.behind ? 'bg-warning-text' : 'bg-primary')} style={{ width: `${progress}%` }} />
            </div>
            {forecast.behind && <p className="text-sm text-warning-text">Behind: {batchCount(forecast.remaining)} still to count with {cycle.daysLeft} {cycle.daysLeft === 1 ? 'day' : 'days'} left.</p>}
          </>
        ) : (
          <p className="text-base">Reconciliation is off, so no counts are assigned. {batchCount(forecast.batches)} are in stock.</p>
        )}
      </section>
      {error && <p role="alert" className="text-sm font-medium text-destructive-text">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !changed}>{saving ? 'Saving…' : 'Save settings'}</Button>
        {changed && (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              setEnabled(saved.enabled);
              setText({ cycleDays: String(saved.cycleDays), itemsPerPersonPerDay: String(saved.itemsPerPersonPerDay) });
              setAssignees(saved.assigneeIds.filter((person) => staff.some((candidate) => candidate.id === person)));
              setError('');
            }}
          >
            Undo changes
          </Button>
        )}
      </div>
    </form>
  );
}
