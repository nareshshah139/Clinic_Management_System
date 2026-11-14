'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserRole } from '@cms/shared-types';
import { apiClient } from '@/lib/api';
import { track } from '@/lib/analytics';
import { calculateAge, filterRoomsByVisitType } from '@/lib/utils';
import { displayCalendarDate } from '@/lib/date-display';
import { overbookFlag } from '@/lib/overbooking';
import { useOverbookConfirm } from '@/components/appointments/useOverbookConfirm';
import type { Room, VisitType } from '@/lib/types';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export function normalizeGender(g: unknown): Gender | 'UNKNOWN' {
  const s = String(g || '').trim().toUpperCase();
  if (s === 'M' || s === 'MALE') return 'MALE';
  if (s === 'F' || s === 'FEMALE') return 'FEMALE';
  if (s === 'O' || s === 'OTHER') return 'OTHER';
  return 'UNKNOWN';
}

interface Fields {
  name: string;
  age: string;
  gender: Gender | '';
  phone: string;
  abhaId: string;
  email: string;
  address: string;
  emergencyContact: string;
  referralSource: string;
  consultationType: 'ONLINE' | 'OFFLINE';
  /** 'DEFAULT' leaves the choice to the server, 'NONE' clears it. */
  primaryDoctor: string;
}

const EMPTY: Fields = {
  name: '', age: '', gender: '', phone: '', abhaId: '', email: '', address: '', emergencyContact: '',
  referralSource: '', consultationType: 'OFFLINE', primaryDoctor: 'DEFAULT',
};

type Doctor = { id: string; firstName?: string; lastName?: string };

type Outcome =
  | { kind: 'booked'; name: string; doctor: string; date: string; today: boolean; slot: string; token?: number }
  | { kind: 'not-booked'; patientId: string; reason: string };

const DOCTOR_KEY = 'appointments.doctorId';
const DAYS_AHEAD = 7;

const doctorLabel = (d: Doctor) => `Dr. ${`${d.firstName || ''} ${d.lastName || ''}`.trim().replace(/^dr\.?\s+/i, '')}`;

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function fieldsFromPatient(p: Record<string, any>): Fields {
  const gender = normalizeGender(p.gender);
  const age = calculateAge(p);
  return {
    name: String(p.name || `${p.firstName || ''} ${p.lastName || ''}`).trim(),
    age: age != null ? String(age) : '',
    gender: gender === 'UNKNOWN' ? '' : gender,
    phone: p.phone || '',
    abhaId: p.abhaId || '',
    email: p.email || '',
    address: p.address || '',
    emergencyContact: p.emergencyContact || '',
    referralSource: p.referralSource || '',
    consultationType: p.consultationType === 'ONLINE' ? 'ONLINE' : 'OFFLINE',
    primaryDoctor: p.primaryDoctorId || 'NONE',
  };
}

/** Edits send only what the person changed, so an untouched age never rebuilds the date of birth. */
function changedFields(form: Fields, initial: Fields): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (form.name.trim() !== initial.name) payload.name = form.name.trim();
  if (form.phone.trim() !== initial.phone) payload.phone = form.phone.trim();
  if (form.gender && form.gender !== initial.gender) payload.gender = form.gender;
  if (form.age !== initial.age && form.age !== '' && !isNaN(parseInt(form.age, 10))) payload.age = parseInt(form.age, 10);
  for (const key of ['abhaId', 'email', 'address', 'emergencyContact', 'referralSource'] as const) {
    if (form[key] !== initial[key]) payload[key] = form[key].trim() || null;
  }
  if (form.consultationType !== initial.consultationType) payload.consultationType = form.consultationType;
  if (form.primaryDoctor !== initial.primaryDoctor) payload.primaryDoctorId = form.primaryDoctor === 'NONE' ? null : form.primaryDoctor;
  return payload;
}

function newPatientPayload(form: Fields): Record<string, unknown> {
  const age = form.age ? parseInt(form.age, 10) : NaN;
  return {
    name: form.name.trim(),
    gender: form.gender,
    phone: form.phone.trim(),
    age: isNaN(age) ? undefined : age,
    abhaId: form.abhaId.trim() || undefined,
    email: form.email.trim() || undefined,
    address: form.address.trim() || undefined,
    emergencyContact: form.emergencyContact.trim() || undefined,
    referralSource: form.referralSource || undefined,
    consultationType: form.consultationType,
    ...(form.primaryDoctor === 'DEFAULT' ? {} : { primaryDoctorId: form.primaryDoctor === 'NONE' ? null : form.primaryDoctor }),
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edits this patient. Without it the dialog registers a new patient. */
  patientId?: string;
  onSaved: () => void;
}

export default function PatientFormDialog({ open, onOpenChange, patientId, onSaved }: Props) {
  const editing = Boolean(patientId);
  const { sendWithOverbookConfirm, overbookDialog } = useOverbookConfirm();
  const [form, setForm] = useState<Fields>(EMPTY);
  const [initial, setInitial] = useState<Fields>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [bookToday, setBookToday] = useState(true);
  const [doctorId, setDoctorId] = useState('');
  const [visitType, setVisitType] = useState<VisitType>('OPD');
  const [roomId, setRoomId] = useState('');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setOutcome(null);
    setShowMore(false);
    setBookToday(true);
    setVisitType('OPD');
    setRoomId('');
    setBusy(false);
    setLoaded(false);
    setForm(EMPTY);
    setInitial(EMPTY);
    setDoctorId('');
    (async () => {
      const [users, roomList, patient] = await Promise.all([
        apiClient.getUsers({ role: UserRole.DOCTOR, limit: 100 }).catch(() => null),
        editing ? Promise.resolve(null) : apiClient.getRooms().catch(() => null),
        patientId ? apiClient.getPatient(patientId).catch((e: unknown) => e) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      const list: Doctor[] = (((users as any)?.data || (users as any)?.users || []) as any[]).map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName }));
      setDoctors(list);
      setRooms(((roomList as any)?.rooms || []) as Room[]);
      let saved = '';
      try { saved = localStorage.getItem(DOCTOR_KEY) || ''; } catch {}
      setDoctorId(list.length === 1 ? list[0].id : list.some((d) => d.id === saved) ? saved : '');
      if (patient instanceof Error) {
        setError(patient.message || 'Could not load this patient.');
        return;
      }
      if (patient) {
        const loadedFields = fieldsFromPatient(patient as Record<string, any>);
        setForm(loadedFields);
        setInitial(loadedFields);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [open, patientId, editing]);

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const bookNextFreeTime = async (id: string, name: string): Promise<Outcome> => {
    const today = isoDate(new Date());
    for (let i = 0; i <= DAYS_AHEAD; i++) {
      const day = new Date();
      day.setDate(day.getDate() + i);
      const date = isoDate(day);
      const res = (await apiClient.getAvailableSlots({ doctorId, date, durationMinutes: 30, calendar: 'CONFIRMED' })) as any;
      let slots: string[] = res?.availableSlots || [];
      if (roomId) {
        try {
          const schedule = await apiClient.getRoomSchedule(roomId, date);
          const occupied = new Set(((schedule as any)?.appointments || []).map((a: any) => a.slot));
          slots = slots.filter((s) => !occupied.has(s));
        } catch {
          // The room schedule is a refinement; the doctor's free time still decides.
        }
      }
      if (slots.length === 0) continue;
      const slot = slots[0];
      const booked = await sendWithOverbookConfirm((allowOverbook) => apiClient.createAppointment({
        patientId: id,
        doctorId,
        date,
        slot,
        visitType,
        source: 'WALK_IN',
        calendar: 'CONFIRMED',
        notes: 'Auto-booked next available slot for walk-in',
        ...(roomId ? { roomId } : {}),
        ...overbookFlag(allowOverbook),
      }));
      if (!booked) return { kind: 'not-booked', patientId: id, reason: 'that time was taken and you chose not to overbook it.' };
      track('appointment_booked', { source: 'walk_in' });
      const doctor = doctors.find((d) => d.id === doctorId);
      return { kind: 'booked', name, doctor: doctor ? doctorLabel(doctor) : 'the doctor', date, today: date === today, slot, token: (booked as { tokenNumber?: number }).tokenNumber };
    }
    return { kind: 'not-booked', patientId: id, reason: `no free time in the next ${DAYS_AHEAD} days.` };
  };

  const submit = async () => {
    const missing = [!form.name.trim() && 'name', !form.phone.trim() && 'phone', !editing && !form.gender && 'gender'].filter(Boolean);
    if (missing.length) { setError(`Required: ${missing.join(', ')}.`); return; }
    if (form.abhaId.trim() && !/^\d{14}$/.test(form.abhaId.trim())) { setError('ABHA ID must be 14 digits.'); return; }
    const booking = !editing && bookToday;
    if (booking && !doctorId) { setError('Choose a doctor, or switch to Register only.'); return; }
    setBusy(true);
    setError(null);
    let id = patientId;
    try {
      if (patientId) {
        const changes = changedFields(form, initial);
        if (Object.keys(changes).length > 0) await apiClient.updatePatient(patientId, changes);
      } else {
        const created = (await apiClient.createPatient(newPatientPayload(form))) as any;
        id = created?.id || created?.data?.id;
        track('patient_registered', { source: 'patients_page' });
      }
    } catch (err: any) {
      setError(err?.message || 'Could not save the patient. Check the details and try again.');
      setBusy(false);
      return;
    }
    let result: Outcome | null = null;
    if (booking && id) {
      try { localStorage.setItem(DOCTOR_KEY, doctorId); } catch {}
      try {
        result = await bookNextFreeTime(id, form.name.trim());
      } catch (err: any) {
        result = { kind: 'not-booked', patientId: id, reason: err?.message || 'the booking failed.' };
      }
    }
    onSaved();
    setBusy(false);
    if (result) setOutcome(result);
    else onOpenChange(false);
  };

  const moreFields = (
    <>
      <div className="md:col-span-2">
        <Label htmlFor="abhaId">ABHA ID</Label>
        <Input id="abhaId" value={form.abhaId} onChange={(e) => set('abhaId', e.target.value)} placeholder="14 digits" />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="address">Address</Label>
        <Input id="address" value={form.address} onChange={(e) => set('address', e.target.value)} />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="emergencyContact">Emergency contact</Label>
        <Input id="emergencyContact" value={form.emergencyContact} onChange={(e) => set('emergencyContact', e.target.value)} />
      </div>
      <div>
        <Label id="consultationType-label" htmlFor="consultationType">Consultation type</Label>
        <Select value={form.consultationType} onValueChange={(v: 'ONLINE' | 'OFFLINE') => set('consultationType', v)}>
          <SelectTrigger id="consultationType" aria-labelledby="consultationType-label"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ONLINE">Online</SelectItem>
            <SelectItem value="OFFLINE">In clinic</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label id="primaryDoctor-label" htmlFor="primaryDoctor">Primary doctor</Label>
        <Select value={form.primaryDoctor} onValueChange={(v: string) => set('primaryDoctor', v)}>
          <SelectTrigger id="primaryDoctor" aria-labelledby="primaryDoctor-label"><SelectValue /></SelectTrigger>
          <SelectContent>
            {!editing && <SelectItem value="DEFAULT">Automatic</SelectItem>}
            <SelectItem value="NONE">Not assigned</SelectItem>
            {doctors.map((d) => <SelectItem key={d.id} value={d.id}>{doctorLabel(d)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Label id="referralSource-label" htmlFor="referralSource">How did the patient hear about us?</Label>
        <Select value={form.referralSource} onValueChange={(v: string) => set('referralSource', v)}>
          <SelectTrigger id="referralSource" aria-labelledby="referralSource-label"><SelectValue placeholder="Select source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="INSTAGRAM">Instagram</SelectItem>
            <SelectItem value="TWITTER">Twitter</SelectItem>
            <SelectItem value="GOOGLE">Google</SelectItem>
            <SelectItem value="DOCTOR">Doctor</SelectItem>
            <SelectItem value="FRIENDS_FAMILY">Friends & Family</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {!editing && bookToday && (
        <>
          <div>
            <Label id="walkinVisitType-label" htmlFor="walkinVisitType">Appointment type</Label>
            <Select value={visitType} onValueChange={(v: VisitType) => { setVisitType(v); setRoomId(''); }}>
              <SelectTrigger id="walkinVisitType" aria-labelledby="walkinVisitType-label"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="OPD">Consultation</SelectItem>
                <SelectItem value="PROCEDURE">Procedure</SelectItem>
                <SelectItem value="TELEMED">Video call</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {visitType !== 'TELEMED' && (
            <div>
              <Label id="walkinRoomId-label" htmlFor="walkinRoomId">Room (optional)</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger id="walkinRoomId" aria-labelledby="walkinRoomId-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {filterRoomsByVisitType(rooms.filter((r) => r.isActive), visitType).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name} — {r.type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}
    </>
  );

  const resultView = outcome && (
    <div className="space-y-4">
      {outcome.kind === 'booked' ? (
        <p role="status" className="text-sm text-gray-900">
          {outcome.name} is booked with {outcome.doctor} {outcome.today ? 'today' : `on ${displayCalendarDate(outcome.date)}`} at {outcome.slot}
          {outcome.token != null ? `, token ${outcome.token}` : ''}.{outcome.today ? '' : ' Today had no free time.'}
        </p>
      ) : (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Patient saved, not booked: {outcome.reason}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        {outcome.kind === 'booked' ? (
          <Button asChild><Link href={`/dashboard/appointments?date=${outcome.date}`}>{outcome.today ? "Open today's list" : 'Open that day’s list'}</Link></Button>
        ) : (
          <Button asChild><Link href={`/dashboard/appointments?patientId=${encodeURIComponent(outcome.patientId)}`}>Open Appointments</Link></Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit patient' : 'New patient'}</DialogTitle>
          </DialogHeader>
          {resultView || (
            <>
              {error && (
                <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>
              )}
              {!loaded ? (
                error ? null : <p className="text-sm text-gray-500">Loading…</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone *</Label>
                    <Input id="phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="age">Age (years)</Label>
                    <Input id="age" type="number" min="0" max="150" value={form.age} onChange={(e) => set('age', e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label id="gender-label">Gender {editing ? '' : '*'}</Label>
                    <div role="radiogroup" aria-labelledby="gender-label" className="mt-2 flex gap-2">
                      {([['MALE', 'Male'], ['FEMALE', 'Female'], ['OTHER', 'Other']] as const).map(([value, label]) => (
                        <Button key={value} type="button" role="radio" aria-checked={form.gender === value} variant={form.gender === value ? 'default' : 'outline'} className="flex-1" onClick={() => set('gender', value)}>
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {!editing && (
                    <div className="md:col-span-2 space-y-3 rounded-md border border-gray-200 p-3">
                      <div className="flex gap-2">
                        <Button type="button" size="sm" aria-pressed={bookToday} variant={bookToday ? 'default' : 'outline'} onClick={() => setBookToday(true)}>Book for today</Button>
                        <Button type="button" size="sm" aria-pressed={!bookToday} variant={!bookToday ? 'default' : 'outline'} onClick={() => setBookToday(false)}>Register only</Button>
                      </div>
                      {bookToday && (
                        <div>
                          <Label id="walkinDoctorId-label" htmlFor="walkinDoctorId">Doctor *</Label>
                          <Select value={doctorId} onValueChange={setDoctorId}>
                            <SelectTrigger id="walkinDoctorId" aria-labelledby="walkinDoctorId-label"><SelectValue placeholder="Select doctor" /></SelectTrigger>
                            <SelectContent>
                              {doctors.map((d) => <SelectItem key={d.id} value={d.id}>{doctorLabel(d)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}
                  {editing ? moreFields : (
                    <>
                      <div className="md:col-span-2">
                        <Button type="button" variant="ghost" size="sm" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}>
                          More details
                        </Button>
                      </div>
                      {showMore && moreFields}
                    </>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={submit} disabled={busy || !loaded}>
                  {editing ? 'Save changes' : bookToday ? 'Register and book' : 'Register'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {overbookDialog}
    </>
  );
}
