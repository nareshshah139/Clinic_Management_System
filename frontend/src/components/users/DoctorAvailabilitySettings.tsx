'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/utils';
import {
  type DoctorAvailability,
  type HoursSource,
  type TimeOff,
  type TimeOffKind,
  type WeeklyShift,
  TIME_OFF_LABELS,
  WEEKDAYS,
  addDays,
  formatIst,
  hhmmToMinutes,
  istInstant,
  todayIst,
} from '@/lib/doctor-availability';

type Shift = { start: string; end: string };
type Week = Shift[][];

const SOURCE_NOTES: Record<HoursSource, string> = {
  configured: '',
  legacy: 'These hours come from the old working-hours setting. Save to keep them as the weekly schedule.',
  default: 'No hours set yet; the clinic default 09:00-18:00 applies every day. Save to set a schedule.',
};

const selectClass = 'h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900';

function toWeek(hours: WeeklyShift[]): Week {
  const week: Week = WEEKDAYS.map(() => []);
  for (const h of hours) week[h.weekday]?.push({ start: h.start, end: h.end });
  return week;
}

function weekError(week: Week): string {
  for (let day = 0; day < 7; day++) {
    const sorted = [...week[day]].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 0; i < sorted.length; i++) {
      const { start, end } = sorted[i];
      if (!start || !end) return `${WEEKDAYS[day]}: fill in both times`;
      if (hhmmToMinutes(start) >= hhmmToMinutes(end)) return `${WEEKDAYS[day]}: ${start}-${end} must end after it starts`;
      if (i > 0 && hhmmToMinutes(start) < hhmmToMinutes(sorted[i - 1].end)) return `${WEEKDAYS[day]}: shifts overlap`;
    }
  }
  if (week.every((d) => d.length === 0)) return 'Add at least one shift';
  return '';
}

function timeOffSpan(t: TimeOff): string {
  return `${formatIst(t.startsAt)} – ${formatIst(t.endsAt)}`;
}

export function DoctorAvailabilitySettings({ doctorId, canManageHolidays = false }: { doctorId: string; canManageHolidays?: boolean }) {
  const [data, setData] = useState<DoctorAvailability | null>(null);
  const [week, setWeek] = useState<Week>(() => WEEKDAYS.map(() => []));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.getDoctorAvailability(doctorId);
      setData(res);
      setWeek(toWeek(res.hours));
    } catch (e) {
      setError(getErrorMessage(e) || 'Could not load availability.');
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => { void load(); }, [load]);

  const updateDay = (day: number, shifts: Shift[]) => setWeek((prev) => prev.map((d, i) => (i === day ? shifts : d)));

  const copyMondayToWeekdays = () => setWeek((prev) => prev.map((d, i) => (i >= 2 && i <= 5 ? prev[1].map((s) => ({ ...s })) : d)));

  const saveHours = async () => {
    const problem = weekError(week);
    setStatus('');
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError('');
    try {
      const hours = week.flatMap((shifts, weekday) => shifts.map((s) => ({ weekday, ...s })));
      const res = await apiClient.replaceDoctorHours(doctorId, hours);
      setData(res);
      setWeek(toWeek(res.hours));
      setStatus('Working hours saved.');
    } catch (e) {
      setError(getErrorMessage(e) || 'Could not save working hours.');
    } finally {
      setSaving(false);
    }
  };

  const removeTimeOff = async (id: string) => {
    setError('');
    try {
      await apiClient.deleteTimeOff(id);
      await load();
    } catch (e) {
      setError(getErrorMessage(e) || 'Could not remove time off.');
    }
  };

  if (loading && !data) return <p role="status" className="text-sm text-gray-600">Loading availability…</p>;

  return (
    <div className="space-y-4">
      <section aria-labelledby={`hours-${doctorId}`} className="border rounded-md p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`hours-${doctorId}`} className="font-medium text-gray-900">Weekly working hours (IST)</h3>
          <Button type="button" variant="outline" size="sm" onClick={copyMondayToWeekdays}>Copy Monday to Tue–Fri</Button>
        </div>
        {data && SOURCE_NOTES[data.source] && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">{SOURCE_NOTES[data.source]}</p>}
        <div className="divide-y">
          {WEEKDAYS.map((name, day) => (
            <div key={name} className="flex flex-wrap items-start gap-3 py-2">
              <div className="w-24 pt-2 text-sm font-medium text-gray-700">{name}</div>
              <div className="flex-1 space-y-2">
                {week[day].length === 0 && <p className="pt-2 text-sm text-gray-500">Day off</p>}
                {week[day].map((shift, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input type="time" aria-label={`${name} shift ${i + 1} start`} className="w-32" value={shift.start}
                      onChange={(e) => updateDay(day, week[day].map((s, j) => (j === i ? { ...s, start: e.target.value } : s)))} />
                    <span className="text-gray-500">to</span>
                    <Input type="time" aria-label={`${name} shift ${i + 1} end`} className="w-32" value={shift.end}
                      onChange={(e) => updateDay(day, week[day].map((s, j) => (j === i ? { ...s, end: e.target.value } : s)))} />
                    <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${name} shift ${i + 1}`}
                      onClick={() => updateDay(day, week[day].filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" aria-label={`Add ${name} shift`}
                onClick={() => updateDay(day, [...week[day], week[day].length ? { start: '14:00', end: '18:00' } : { start: '09:00', end: '13:00' }])}>
                <Plus className="h-3 w-3 mr-1" /> Shift
              </Button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" disabled={saving} onClick={() => void saveHours()}>{saving ? 'Saving…' : 'Save hours'}</Button>
          <p role="status" className="text-sm text-gray-600">{status}</p>
        </div>
      </section>

      <section aria-labelledby={`timeoff-${doctorId}`} className="border rounded-md p-3 space-y-3">
        <h3 id={`timeoff-${doctorId}`} className="font-medium text-gray-900">Leave and blocked time</h3>
        <p className="text-xs text-gray-500">Appointments cannot be booked during leave, blocked time, or clinic holidays.</p>
        {data && data.timeOff.length === 0 && <p className="text-sm text-gray-500">No upcoming time off.</p>}
        <ul className="space-y-2">
          {data?.timeOff.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <div>
                <span className="font-medium text-gray-900">{TIME_OFF_LABELS[t.kind]}</span>
                <span className="text-gray-700"> · {timeOffSpan(t)}</span>
                {t.reason && <span className="text-gray-500"> · {t.reason}</span>}
              </div>
              {(t.doctorId || canManageHolidays) && (
                <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${TIME_OFF_LABELS[t.kind]} ${timeOffSpan(t)}`} onClick={() => void removeTimeOff(t.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        <TimeOffForm kinds={['LEAVE', 'BLOCKED']} doctorId={doctorId} onSaved={load} />
      </section>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

function TimeOffForm({ kinds, doctorId, onSaved }: { kinds: TimeOffKind[]; doctorId?: string; onSaved: () => Promise<void> | void }) {
  const [kind, setKind] = useState<TimeOffKind>(kinds[0]);
  const [from, setFrom] = useState(todayIst());
  const [to, setTo] = useState(todayIst());
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('13:00');
  const [endTime, setEndTime] = useState('14:00');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!from || !to || to < from) { setError('The end date must be on or after the start date.'); return; }
    const startsAt = istInstant(from, allDay ? '00:00' : startTime);
    const endsAt = allDay ? istInstant(addDays(to, 1), '00:00') : istInstant(to, endTime);
    if (new Date(endsAt) <= new Date(startsAt)) { setError('The end time must be after the start time.'); return; }
    setSaving(true);
    try {
      await apiClient.createTimeOff({ doctorId, kind, startsAt, endsAt, reason: reason.trim() || undefined });
      setReason('');
      await onSaved();
    } catch (e) {
      setError(getErrorMessage(e) || 'Could not save time off.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded border border-dashed border-gray-300 p-3">
      <div className="flex flex-wrap items-end gap-3">
        {kinds.length > 1 && (
          <label className="text-sm text-gray-700 space-y-1">
            <span className="block">Type</span>
            <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as TimeOffKind)}>
              {kinds.map((k) => <option key={k} value={k}>{TIME_OFF_LABELS[k]}</option>)}
            </select>
          </label>
        )}
        <label className="text-sm text-gray-700 space-y-1">
          <span className="block">From</span>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} />
        </label>
        <label className="text-sm text-gray-700 space-y-1">
          <span className="block">To</span>
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
        </label>
        {!allDay && (
          <>
            <label className="text-sm text-gray-700 space-y-1">
              <span className="block">Start time</span>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className="text-sm text-gray-700 space-y-1">
              <span className="block">End time</span>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 text-sm text-gray-700 space-y-1">
          <span className="block">Reason (optional)</span>
          <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </label>
        <Button type="button" disabled={saving} onClick={() => void submit()}>{saving ? 'Adding…' : `Add ${TIME_OFF_LABELS[kind].toLowerCase()}`}</Button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

/** Branch-wide holidays apply to every doctor. Admin and owner only. */
export function BranchHolidaySettings() {
  const [holidays, setHolidays] = useState<TimeOff[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setHolidays(await apiClient.getBranchHolidays());
    } catch (e) {
      setError(getErrorMessage(e) || 'Could not load holidays.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remove = async (id: string) => {
    setError('');
    try {
      await apiClient.deleteTimeOff(id);
      await load();
    } catch (e) {
      setError(getErrorMessage(e) || 'Could not remove holiday.');
    }
  };

  return (
    <section className="space-y-3">
      <p className="text-sm text-gray-600">Holidays close the clinic for all doctors. Appointments cannot be booked on them.</p>
      {holidays.length === 0 && <p className="text-sm text-gray-500">No upcoming holidays.</p>}
      <ul className="space-y-2">
        {holidays.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <div>
              <span className="text-gray-900">{timeOffSpan(t)}</span>
              {t.reason && <span className="text-gray-500"> · {t.reason}</span>}
            </div>
            <Button type="button" variant="ghost" size="sm" aria-label={`Remove holiday ${timeOffSpan(t)}`} onClick={() => void remove(t.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      <TimeOffForm kinds={['HOLIDAY']} onSaved={load} />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
