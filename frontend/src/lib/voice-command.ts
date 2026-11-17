import { AppointmentStatus, UserRole } from '@cms/shared-types';
import { apiClient } from '@/lib/api';
import { addDays } from '@/lib/date-ranges';
import type { VisitType } from '@/lib/types';
import type { VoiceFillFields } from '@/lib/voice-fill';

/**
 * @cc [owner:nareshshah139,label:product] voice-command-confirms-before-writing
 * A spoken command MUST only produce a plan. Nothing is written until the user confirms a plan whose every choice is
 * resolved, and a choice the speech left ambiguous MUST be offered as options, never picked for the user.
 */
export type VoiceCommandAction =
  | 'schedule_appointment'
  | 'reschedule_appointment'
  | 'cancel_appointment'
  | 'check_in'
  | 'open_patient'
  | 'start_visit';
export type PartOfDay = 'morning' | 'afternoon' | 'evening';

export interface VoiceCommand {
  action: VoiceCommandAction | 'unknown';
  patientName?: string;
  patientPhone?: string;
  doctorName?: string;
  date?: string;
  time?: string;
  partOfDay?: PartOfDay;
  visitType?: VisitType;
  fromDate?: string;
  notes?: string;
}

/** A command as heard, ready for the confirm card; `id` keys one card and its idempotency key. */
export interface HeardCommand {
  id: number;
  transcript: string;
  command: VoiceCommand;
}

export type Choice<T> =
  | { kind: 'resolved'; value: T }
  | { kind: 'choose'; options: T[]; note?: string }
  | { kind: 'missing'; reason: string };

export interface PatientOption { id: string; name: string; phone?: string }
export interface DoctorOption { id: string; name: string }
export interface ExistingAppointment { id: string; date: string; slot: string; status: string; doctorId: string; doctorName: string }

type ScheduleWhen = { date: Choice<string>; slot: Choice<string> };

export type VoiceCommandPlan =
  | ({ action: 'schedule_appointment'; patient: Choice<PatientOption>; doctor: Choice<DoctorOption>; visitType: VisitType; notes?: string } & ScheduleWhen)
  | ({ action: 'reschedule_appointment'; patient: Choice<PatientOption>; appointment: Choice<ExistingAppointment> } & ScheduleWhen)
  | { action: 'cancel_appointment' | 'check_in'; patient: Choice<PatientOption>; appointment: Choice<ExistingAppointment> }
  | { action: 'open_patient'; patient: Choice<PatientOption> }
  | { action: 'start_visit'; patient: Choice<PatientOption>; appointment: ExistingAppointment | null }
  | { action: 'unavailable'; reason: string };

/** What the user tapped in the card; each pick overrides what the speech resolved to. */
export interface VoiceCommandPicks {
  patient?: PatientOption;
  doctor?: DoctorOption;
  appointment?: ExistingAppointment;
  date?: string;
  slot?: string;
}

/** A later choice was made against an earlier one, so changing the earlier one clears it. */
const DEPENDENT_PICKS: Record<keyof VoiceCommandPicks, Array<keyof VoiceCommandPicks>> = {
  patient: ['appointment', 'slot'],
  doctor: ['slot'],
  appointment: ['slot'],
  date: ['slot'],
  slot: [],
};

export function withPick<K extends keyof VoiceCommandPicks>(picks: VoiceCommandPicks, key: K, value: VoiceCommandPicks[K]): VoiceCommandPicks {
  const next: VoiceCommandPicks = { ...picks, [key]: value };
  for (const dependent of DEPENDENT_PICKS[key]) delete next[dependent];
  return next;
}

export type VoiceCommandStep =
  | { kind: 'create'; body: { patientId: string; doctorId: string; date: string; slot: string; visitType: VisitType; notes?: string } }
  | { kind: 'reschedule'; appointmentId: string; doctorId: string; body: { date: string; slot: string } }
  | { kind: 'cancel' | 'check_in'; appointmentId: string; doctorId: string; date: string }
  | { kind: 'navigate'; href: string };

const ACTIONS: readonly VoiceCommandAction[] = [
  'schedule_appointment', 'reschedule_appointment', 'cancel_appointment', 'check_in', 'open_patient', 'start_visit',
];
const PARTS_OF_DAY: readonly PartOfDay[] = ['morning', 'afternoon', 'evening'];
const VISIT_TYPES: readonly VisitType[] = ['OPD', 'TELEMED', 'PROCEDURE'];

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const member = <T extends string>(values: readonly T[], value: unknown) =>
  values.find((candidate) => candidate === value);
const isoDay = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);

/** The server validated these fields; this narrows the wire record to the command shape. */
export function parseVoiceCommand(fields: VoiceFillFields): VoiceCommand {
  const time = text(fields.time);
  return {
    action: member(ACTIONS, fields.action) ?? 'unknown',
    patientName: text(fields.patientName),
    patientPhone: text(fields.patientPhone),
    doctorName: text(fields.doctorName),
    date: isoDay(fields.date),
    time: time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : undefined,
    partOfDay: member(PARTS_OF_DAY, fields.partOfDay),
    visitType: member(VISIT_TYPES, fields.visitType),
    fromDate: isoDay(fields.fromDate),
    notes: text(fields.notes),
  };
}

const { OWNER, ADMIN, MANAGER, DOCTOR, NURSE, RECEPTION } = UserRole;

// Mirrors the server's role and permission gates (OWNER, ADMIN and DOCTOR pass every route).
const ACTION_ROLES: Record<VoiceCommandAction, readonly string[]> = {
  schedule_appointment: [OWNER, ADMIN, DOCTOR, NURSE, RECEPTION],
  reschedule_appointment: [OWNER, ADMIN, DOCTOR, RECEPTION],
  cancel_appointment: [OWNER, ADMIN, DOCTOR, RECEPTION],
  check_in: [OWNER, ADMIN, DOCTOR, NURSE, RECEPTION],
  open_patient: [OWNER, ADMIN, MANAGER, DOCTOR, NURSE, RECEPTION],
  start_visit: [OWNER, ADMIN, DOCTOR],
};

const ACTION_VERB: Record<VoiceCommandAction, string> = {
  schedule_appointment: 'book appointments',
  reschedule_appointment: 'reschedule appointments',
  cancel_appointment: 'cancel appointments',
  check_in: 'check patients in',
  open_patient: 'open patient charts',
  start_visit: 'start visits',
};

export const COMMAND_EXAMPLE = 'Book Ramesh Kumar with Dr Shravya tomorrow at 10';
const UNKNOWN_COMMAND = `That isn't a command the app can do yet. Try "${COMMAND_EXAMPLE}".`;

/** Why this role cannot run the command, or null when it can. */
export function blockedReason(action: VoiceCommandAction, role: string): string | null {
  if (ACTION_ROLES[action].includes(role.toUpperCase())) return null;
  const roleName = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  return `${roleName} accounts can't ${ACTION_VERB[action]}.`;
}

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'smt', 'shri', 'sri', 'ji', 'dr', 'doctor']);

export function nameTokens(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((token) => token && !HONORIFICS.has(token));
}

function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}

const EXACT = 3;
const ALL_TOKENS = 2;
const PARTIAL = 1;

function nameTier(spoken: string[], candidate: string[], fuzzy: boolean): number {
  if (!spoken.length) return 0;
  if (spoken.join(' ') === candidate.join(' ')) return EXACT;
  if (spoken.every((token) => candidate.includes(token))) return ALL_TOKENS;
  const near = (s: string, c: string) => c.startsWith(s) || s.startsWith(c) || (fuzzy && withinOneEdit(s, c));
  return spoken.some((s) => candidate.some((c) => near(s, c))) ? PARTIAL : 0;
}

/** One clear best match resolves; a tie, or only partial matches, become choices. */
function rank<T>(candidates: T[], tierOf: (candidate: T) => number): { best: number; top: T[] } {
  const tiers = candidates.map(tierOf);
  const best = Math.max(0, ...tiers);
  return { best, top: best ? candidates.filter((_, i) => tiers[i] === best) : [] };
}

const MAX_OPTIONS = 5;
const lastTen = (phone: string) => phone.replace(/\D/g, '').slice(-10);
const PHONE = 4;

export function matchPatients(candidates: PatientOption[], spoken: { name?: string; phone?: string }): Choice<PatientOption> {
  const label = spoken.name ?? spoken.phone;
  if (!label) return { kind: 'missing', reason: 'No patient name was heard.' };
  const tokens = nameTokens(spoken.name ?? '');
  const phone = spoken.phone ? lastTen(spoken.phone) : '';
  const phoneMatches = (candidate: PatientOption) =>
    phone.length >= 4 && !!candidate.phone && (phone.length === 10 ? lastTen(candidate.phone) === phone : candidate.phone.replace(/\D/g, '').includes(phone));
  const { best, top } = rank(candidates, (c) => (phoneMatches(c) ? PHONE : nameTier(tokens, nameTokens(c.name), false)));
  if (!top.length) return { kind: 'missing', reason: `No patient matches "${label}".` };
  if (top.length === 1 && best >= ALL_TOKENS) return { kind: 'resolved', value: top[0] };
  return { kind: 'choose', options: top.slice(0, MAX_OPTIONS) };
}

export function matchDoctors(spoken: string | undefined, doctors: DoctorOption[]): Choice<DoctorOption> {
  if (!doctors.length) return { kind: 'missing', reason: 'No doctors are set up for this clinic.' };
  if (!spoken) return doctors.length === 1 ? { kind: 'resolved', value: doctors[0] } : { kind: 'choose', options: doctors, note: 'No doctor was heard.' };
  const { best, top } = rank(doctors, (d) => nameTier(nameTokens(spoken), nameTokens(d.name), true));
  if (!top.length) return { kind: 'choose', options: doctors, note: `No doctor named "${spoken}".` };
  if (top.length === 1 && best >= ALL_TOKENS) return { kind: 'resolved', value: top[0] };
  return { kind: 'choose', options: top };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon 16 Nov" for a YYYY-MM-DD day. */
function absoluteDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(year, month - 1, date)).getUTCDay()]} ${date} ${MONTHS[month - 1]}`;
}

/** "Today", "Tomorrow" or "Mon 16 Nov" for a YYYY-MM-DD day. */
export function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  if (day === addDays(today, 1)) return 'Tomorrow';
  return absoluteDay(day);
}

/** Relative and absolute together ("Tomorrow · Mon 16 Nov"); days further out are already absolute. */
export function dayWithDate(day: string, today: string): string {
  const label = dayLabel(day, today);
  return label === absoluteDay(day) ? label : `${label} · ${absoluteDay(day)}`;
}

const clinicClockParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** The clinic's calendar day and minute of day, whatever the browser's timezone. */
export function clinicClock(now: Date): { today: string; minutes: number } {
  const parts = clinicClockParts.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return { today: `${part('year')}-${part('month')}-${part('day')}`, minutes: Number(part('hour')) * 60 + Number(part('minute')) };
}

export function chooseDate(spoken: string | undefined, today: string): Choice<string> {
  if (!spoken) return { kind: 'choose', options: [today, addDays(today, 1)], note: 'No day was heard.' };
  if (spoken < today) return { kind: 'missing', reason: `${dayLabel(spoken, today)} ${spoken.slice(0, 4)} has already passed.` };
  return { kind: 'resolved', value: spoken };
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const WINDOWS: Record<PartOfDay, [number, number]> = { morning: [0, 12 * 60], afternoon: [12 * 60, 16 * 60], evening: [16 * 60, 24 * 60] };
const NEAREST = 3;

/** `available` holds the server's free "HH:MM-HH:MM" slots for the chosen doctor and day, past times already removed. */
export function chooseSlot(
  spoken: { time?: string; partOfDay?: PartOfDay },
  available: string[],
  day: string,
  clock: { today: string; minutes: number },
): Choice<string> {
  const when = dayLabel(day, clock.today);
  if (!available.length) return { kind: 'missing', reason: `No free slots ${when === 'Today' || when === 'Tomorrow' ? when.toLowerCase() : `on ${when}`}.` };
  if (spoken.time) {
    const exact = available.find((slot) => slot.startsWith(`${spoken.time}-`));
    if (exact) return { kind: 'resolved', value: exact };
    const target = minutesOf(spoken.time);
    const nearest = [...available]
      .sort((a, b) => Math.abs(minutesOf(a) - target) - Math.abs(minutesOf(b) - target) || minutesOf(a) - minutesOf(b))
      .slice(0, NEAREST)
      .sort((a, b) => minutesOf(a) - minutesOf(b));
    const passed = day === clock.today && target < clock.minutes;
    return { kind: 'choose', options: nearest, note: `${spoken.time} ${passed ? 'has already passed' : 'is not free'}. Nearest free times:` };
  }
  if (spoken.partOfDay) {
    const [from, to] = WINDOWS[spoken.partOfDay];
    const inWindow = available.filter((slot) => minutesOf(slot) >= from && minutesOf(slot) < to).slice(0, NEAREST);
    return inWindow.length
      ? { kind: 'choose', options: inWindow }
      : { kind: 'missing', reason: `No free ${spoken.partOfDay} slots ${when === 'Today' || when === 'Tomorrow' ? when.toLowerCase() : `on ${when}`}.` };
  }
  return { kind: 'choose', options: available, note: 'No time was heard.' };
}

const WAITING: readonly string[] = [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED];
const ACTIVE: readonly string[] = [...WAITING, AppointmentStatus.CHECKED_IN];
const byTime = (a: ExistingAppointment, b: ExistingAppointment) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot);

/** The patient's appointment the command acts on, from their appointments today onwards. */
export function matchAppointment(
  appointments: ExistingAppointment[],
  action: 'reschedule_appointment' | 'cancel_appointment' | 'check_in',
  fromDate: string | undefined,
  today: string,
): Choice<ExistingAppointment> {
  const candidates = appointments
    .filter((a) => a.date >= today && (action === 'check_in' ? a.date === today && WAITING.includes(a.status) : ACTIVE.includes(a.status)))
    .filter((a) => !fromDate || a.date === fromDate)
    .sort(byTime);
  if (candidates.length === 1) return { kind: 'resolved', value: candidates[0] };
  if (candidates.length > 1) return { kind: 'choose', options: candidates };
  if (action === 'check_in') return { kind: 'missing', reason: 'No appointment today is waiting for check-in.' };
  return { kind: 'missing', reason: fromDate ? `No upcoming appointment ${dayLabel(fromDate, today) === 'Today' ? 'today' : `on ${dayLabel(fromDate, today)}`}.` : 'No upcoming appointment.' };
}

const resolved = <T,>(value: T): Choice<T> => ({ kind: 'resolved', value });
const resolvedValue = <T,>(choice: Choice<T>): T | undefined => (choice.kind === 'resolved' ? choice.value : undefined);

/** The write or navigation a fully resolved plan performs, or null while anything is unresolved. */
export function confirmedStep(plan: VoiceCommandPlan): VoiceCommandStep | null {
  if (plan.action === 'unavailable') return null;
  const patient = resolvedValue(plan.patient);
  if (!patient) return null;
  switch (plan.action) {
    case 'schedule_appointment': {
      const doctor = resolvedValue(plan.doctor);
      const date = resolvedValue(plan.date);
      const slot = resolvedValue(plan.slot);
      if (!doctor || !date || !slot) return null;
      const body = { patientId: patient.id, doctorId: doctor.id, date, slot, visitType: plan.visitType };
      return { kind: 'create', body: plan.notes ? { ...body, notes: plan.notes } : body };
    }
    case 'reschedule_appointment': {
      const appointment = resolvedValue(plan.appointment);
      const date = resolvedValue(plan.date);
      const slot = resolvedValue(plan.slot);
      return appointment && date && slot
        ? { kind: 'reschedule', appointmentId: appointment.id, doctorId: appointment.doctorId, body: { date, slot } }
        : null;
    }
    case 'cancel_appointment':
    case 'check_in': {
      const appointment = resolvedValue(plan.appointment);
      if (!appointment) return null;
      return { kind: plan.action === 'check_in' ? 'check_in' : 'cancel', appointmentId: appointment.id, doctorId: appointment.doctorId, date: appointment.date };
    }
    case 'open_patient':
      return { kind: 'navigate', href: `/dashboard/patients/${encodeURIComponent(patient.id)}` };
    case 'start_visit': {
      const params = new URLSearchParams({ patientId: patient.id });
      if (plan.appointment) params.set('appointmentId', plan.appointment.id);
      params.set('autoStart', 'true');
      return { kind: 'navigate', href: `/dashboard/visits?${params}` };
    }
  }
}

export interface VoiceCommandSource {
  searchPatients(term: string): Promise<PatientOption[]>;
  doctors(): Promise<DoctorOption[]>;
  availableSlots(doctorId: string, date: string): Promise<string[]>;
  appointments(patientId: string, from: string): Promise<ExistingAppointment[]>;
}

/** Patient search is substring-only, so try the whole name, then each end of it, then the phone. */
async function findPatients(command: VoiceCommand, source: VoiceCommandSource): Promise<PatientOption[]> {
  const tokens = nameTokens(command.patientName ?? '');
  const terms = [...new Set([tokens.join(' '), tokens[0], tokens[tokens.length - 1]])].filter((term) => term && term.length >= 2);
  let byName: PatientOption[] = [];
  for (const term of terms) {
    byName = await source.searchPatients(term);
    if (byName.length) break;
  }
  const phone = command.patientPhone ? command.patientPhone.replace(/^\+?91(?=\d{10}$)/, '') : '';
  const byPhone = phone.length >= 4 ? await source.searchPatients(phone) : [];
  return [...new Map([...byPhone, ...byName].map((p) => [p.id, p])).values()];
}

async function slotChoice(
  command: VoiceCommand,
  doctorId: string | undefined,
  date: Choice<string>,
  clock: { today: string; minutes: number },
  source: VoiceCommandSource,
): Promise<Choice<string>> {
  const day = resolvedValue(date);
  if (!doctorId) return { kind: 'missing', reason: 'Pick a doctor first.' };
  if (!day) return { kind: 'missing', reason: 'Pick a day first.' };
  return chooseSlot(command, await source.availableSlots(doctorId, day), day, clock);
}

export async function resolveVoiceCommand(
  command: VoiceCommand,
  picks: VoiceCommandPicks,
  context: { role: string; now: Date },
  source: VoiceCommandSource,
): Promise<VoiceCommandPlan> {
  if (command.action === 'unknown') return { action: 'unavailable', reason: UNKNOWN_COMMAND };
  const action = command.action;
  const blocked = blockedReason(action, context.role);
  if (blocked) return { action: 'unavailable', reason: blocked };
  const clock = clinicClock(context.now);
  const patient = picks.patient
    ? resolved(picks.patient)
    : matchPatients(await findPatients(command, source), { name: command.patientName, phone: command.patientPhone });
  const patientId = resolvedValue(patient)?.id;
  const date = picks.date ? resolved(picks.date) : chooseDate(command.date, clock.today);

  switch (action) {
    case 'open_patient':
      return { action, patient };
    case 'start_visit': {
      const today = patientId ? (await source.appointments(patientId, clock.today))
        .filter((a) => a.date === clock.today && ACTIVE.includes(a.status)) : [];
      return { action, patient, appointment: today.length === 1 ? today[0] : null };
    }
    case 'schedule_appointment': {
      const doctor = picks.doctor ? resolved(picks.doctor) : matchDoctors(command.doctorName, await source.doctors());
      const slot = picks.slot ? resolved(picks.slot) : await slotChoice(command, resolvedValue(doctor)?.id, date, clock, source);
      return { action, patient, doctor, date, slot, visitType: command.visitType ?? 'OPD', notes: command.notes };
    }
    case 'reschedule_appointment':
    case 'cancel_appointment':
    case 'check_in': {
      const appointment: Choice<ExistingAppointment> = picks.appointment
        ? resolved(picks.appointment)
        : patientId
          ? matchAppointment(await source.appointments(patientId, clock.today), action, command.fromDate, clock.today)
          : { kind: 'missing', reason: 'Pick the patient first.' };
      if (action !== 'reschedule_appointment') return { action, patient, appointment };
      const doctorId = resolvedValue(appointment)?.doctorId;
      const slot: Choice<string> = !doctorId
        ? { kind: 'missing', reason: 'Pick the appointment first.' }
        : picks.slot ? resolved(picks.slot) : await slotChoice(command, doctorId, date, clock, source);
      return { action, patient, appointment, date, slot };
    }
  }
}

const doctorName = (doctor?: { firstName?: string | null; lastName?: string | null } | null) =>
  `Dr ${[doctor?.firstName, doctor?.lastName].filter(Boolean).join(' ')}`.trim();

type AppointmentRow = { id: string; date: string; slot: string; status: string; doctorId: string; doctor?: { firstName?: string; lastName?: string } | null };

/** The live API, with each lookup cached for the life of one command so picks do not refetch. */
export function createVoiceCommandSource(): VoiceCommandSource & { forgetSlots(): void } {
  const cache = new Map<string, Promise<unknown>>();
  const once = <T,>(key: string, load: () => Promise<T>): Promise<T> => {
    if (!cache.has(key)) cache.set(key, load().catch((error) => { cache.delete(key); throw error; }));
    return cache.get(key) as Promise<T>;
  };
  return {
    searchPatients: (term) => once(`patients:${term}`, async () => {
      const res = await apiClient.getPatients({ search: term, limit: 10 });
      return (res?.data ?? res?.patients ?? []).map((p) => ({ id: p.id, name: p.name || `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(), phone: p.phone || undefined }));
    }),
    doctors: () => once('doctors', async () => {
      const res = await apiClient.getUsers({ role: DOCTOR, limit: 100 });
      return (res?.users ?? []).filter((u) => u.role === DOCTOR).map((u) => ({ id: u.id, name: doctorName(u) }));
    }),
    availableSlots: (doctorId, date) => once(`slots:${doctorId}:${date}`, async () => {
      const res = await apiClient.getAvailableSlots({ doctorId, date, durationMinutes: 30 });
      return Array.isArray(res?.availableSlots) ? res.availableSlots : [];
    }),
    appointments: (patientId, from) => once(`appointments:${patientId}:${from}`, async () => {
      const res = await apiClient.getAppointments({ patientId, startDate: from, sortBy: 'date', sortOrder: 'asc', limit: 50 }) as { appointments?: AppointmentRow[] };
      return (res?.appointments ?? []).map((a) => ({
        id: a.id, date: a.date.slice(0, 10), slot: a.slot, status: a.status, doctorId: a.doctorId, doctorName: doctorName(a.doctor),
      }));
    }),
    forgetSlots: () => {
      for (const key of [...cache.keys()]) if (key.startsWith('slots:')) cache.delete(key);
    },
  };
}
