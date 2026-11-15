import { AppointmentStatus, UserRole } from '@cms/shared-types';
import {
  blockedReason,
  chooseDate,
  chooseSlot,
  confirmedStep,
  matchAppointment,
  matchDoctors,
  matchPatients,
  parseVoiceCommand,
  resolveVoiceCommand,
  type ExistingAppointment,
  type PatientOption,
  type VoiceCommandSource,
} from '@/lib/voice-command';

jest.mock('@/lib/api', () => ({ apiClient: {} }));

const ramesh = { id: 'p1', name: 'Ramesh Kumar', phone: '9848022338' };
const rameshToo = { id: 'p2', name: 'Ramesh Kumar', phone: '9123456789' };
const rameshwar = { id: 'p3', name: 'Rameshwar Rao', phone: '9000000001' };
const shravya = { id: 'd1', name: 'Dr Shravya Rao' };
const anil = { id: 'd2', name: 'Dr Anil Rao' };
// Sunday 15 Nov 2026, 11:00 in India.
const clock = { today: '2026-11-15', minutes: 11 * 60 };

describe('matchPatients', () => {
  it('resolves the one patient whose name matches exactly', () => {
    expect(matchPatients([ramesh, rameshwar], { name: 'Ramesh Kumar' })).toEqual({ kind: 'resolved', value: ramesh });
  });

  it('offers every equally good candidate instead of guessing', () => {
    expect(matchPatients([ramesh, rameshToo, rameshwar], { name: 'Mr Ramesh Kumar' })).toEqual({ kind: 'choose', options: [ramesh, rameshToo] });
  });

  it('offers a lone partial match as a choice rather than resolving it', () => {
    expect(matchPatients([rameshwar], { name: 'Ramesh' })).toEqual({ kind: 'choose', options: [rameshwar] });
  });

  it('says so when nobody matches or nothing was heard', () => {
    expect(matchPatients([], { name: 'Suresh Babu' })).toEqual({ kind: 'missing', reason: 'No patient matches "Suresh Babu".' });
    expect(matchPatients([ramesh], {})).toEqual({ kind: 'missing', reason: 'No patient name was heard.' });
  });

  it('lets a spoken phone number settle two patients with the same name', () => {
    expect(matchPatients([ramesh, rameshToo], { name: 'Ramesh Kumar', phone: '+919123456789' })).toEqual({ kind: 'resolved', value: rameshToo });
  });
});

describe('matchDoctors', () => {
  it('ignores the Dr title and resolves a unique first name', () => {
    expect(matchDoctors('Dr Shravya', [shravya, anil])).toEqual({ kind: 'resolved', value: shravya });
  });

  it('offers both doctors who share a surname', () => {
    expect(matchDoctors('Rao', [shravya, anil])).toEqual({ kind: 'choose', options: [shravya, anil] });
  });

  it('offers a near miss from transcription as a choice', () => {
    expect(matchDoctors('Sravya', [shravya, anil])).toEqual({ kind: 'choose', options: [shravya] });
  });

  it('lists every doctor when the name matches nobody or none was said', () => {
    expect(matchDoctors('Meena', [shravya, anil])).toEqual({ kind: 'choose', options: [shravya, anil], note: 'No doctor named "Meena".' });
    expect(matchDoctors(undefined, [shravya, anil])).toEqual({ kind: 'choose', options: [shravya, anil], note: 'No doctor was heard.' });
    expect(matchDoctors(undefined, [anil])).toEqual({ kind: 'resolved', value: anil });
  });
});

describe('chooseSlot', () => {
  const morning = ['09:00-09:30', '09:30-10:00', '10:30-11:00', '11:00-11:30', '16:00-16:30'];

  it('resolves a spoken time that is free', () => {
    expect(chooseSlot({ time: '10:30' }, morning, '2026-11-16', clock)).toEqual({ kind: 'resolved', value: '10:30-11:00' });
  });

  it('offers the three nearest free slots when the time is taken', () => {
    expect(chooseSlot({ time: '10:00' }, morning, '2026-11-16', clock)).toEqual({
      kind: 'choose', options: ['09:00-09:30', '09:30-10:00', '10:30-11:00'], note: '10:00 is not free. Nearest free times:',
    });
  });

  it('says a time earlier today has passed', () => {
    expect(chooseSlot({ time: '09:00' }, ['11:30-12:00', '12:00-12:30', '12:30-13:00', '13:00-13:30'], '2026-11-15', clock)).toEqual({
      kind: 'choose', options: ['11:30-12:00', '12:00-12:30', '12:30-13:00'], note: '09:00 has already passed. Nearest free times:',
    });
  });

  it('offers up to three evening slots, from 16:00', () => {
    const day = ['11:00-11:30', '15:30-16:00', '16:00-16:30', '16:30-17:00', '17:00-17:30', '17:30-18:00'];
    expect(chooseSlot({ partOfDay: 'evening' }, day, '2026-11-19', clock)).toEqual({
      kind: 'choose', options: ['16:00-16:30', '16:30-17:00', '17:00-17:30'],
    });
    expect(chooseSlot({ partOfDay: 'evening' }, ['11:00-11:30'], '2026-11-19', clock)).toEqual({
      kind: 'missing', reason: 'No free evening slots on Thu 19 Nov.',
    });
  });

  it('says when the doctor has nothing free', () => {
    expect(chooseSlot({ time: '10:00' }, [], '2026-11-16', clock)).toEqual({ kind: 'missing', reason: 'No free slots tomorrow.' });
  });
});

describe('chooseDate', () => {
  it('refuses a day that has passed and offers today or tomorrow when none was said', () => {
    expect(chooseDate('2026-11-14', '2026-11-15')).toEqual({ kind: 'missing', reason: 'Sat 14 Nov 2026 has already passed.' });
    expect(chooseDate(undefined, '2026-11-15')).toEqual({ kind: 'choose', options: ['2026-11-15', '2026-11-16'], note: 'No day was heard.' });
    expect(chooseDate('2026-11-17', '2026-11-15')).toEqual({ kind: 'resolved', value: '2026-11-17' });
  });
});

describe('matchAppointment', () => {
  const at = (id: string, date: string, slot: string, status: string = AppointmentStatus.SCHEDULED): ExistingAppointment =>
    ({ id, date, slot, status, doctorId: 'd1', doctorName: 'Dr Shravya Rao' });

  it('checks in only today’s waiting appointment', () => {
    const list = [at('a1', '2026-11-15', '10:00-10:30', 'CHECKED_IN'), at('a2', '2026-11-15', '12:00-12:30'), at('a3', '2026-11-16', '10:00-10:30')];
    expect(matchAppointment(list, 'check_in', undefined, '2026-11-15')).toEqual({ kind: 'resolved', value: list[1] });
  });

  it('narrows a cancel to the day said, and offers several in time order', () => {
    const list = [at('a3', '2026-11-18', '10:00-10:30'), at('a1', '2026-11-16', '12:00-12:30'), at('a2', '2026-11-16', '09:00-09:30')];
    expect(matchAppointment(list, 'cancel_appointment', '2026-11-18', '2026-11-15')).toEqual({ kind: 'resolved', value: list[0] });
    expect(matchAppointment(list, 'cancel_appointment', '2026-11-16', '2026-11-15')).toEqual({ kind: 'choose', options: [list[2], list[1]] });
    expect(matchAppointment(list, 'reschedule_appointment', '2026-11-17', '2026-11-15'))
      .toEqual({ kind: 'missing', reason: 'No upcoming appointment on Tue 17 Nov.' });
  });
});

describe('blockedReason', () => {
  it('gates each action to the roles the server admits', () => {
    expect(blockedReason('start_visit', 'RECEPTION')).toBe("Reception accounts can't start visits.");
    expect(blockedReason('start_visit', UserRole.DOCTOR)).toBeNull();
    expect(blockedReason('reschedule_appointment', 'NURSE')).toBe("Nurse accounts can't reschedule appointments.");
    expect(blockedReason('schedule_appointment', 'MANAGER')).toBe("Manager accounts can't book appointments.");
    expect(blockedReason('open_patient', 'MANAGER')).toBeNull();
  });
});

describe('parseVoiceCommand', () => {
  it('keeps known values and drops the rest', () => {
    expect(parseVoiceCommand({ action: 'drop_tables', patientName: ' Asha ', time: '4 pm', partOfDay: 'evening', visitType: 'OPD', date: 'tomorrow' }))
      .toEqual({ action: 'unknown', patientName: 'Asha', partOfDay: 'evening', visitType: 'OPD' });
  });
});

describe('confirmedStep', () => {
  it('builds the booking body only once every choice is resolved', () => {
    const plan = {
      action: 'schedule_appointment' as const,
      patient: { kind: 'resolved' as const, value: ramesh },
      doctor: { kind: 'choose' as const, options: [shravya, anil] },
      date: { kind: 'resolved' as const, value: '2026-11-16' },
      slot: { kind: 'resolved' as const, value: '10:00-10:30' },
      visitType: 'PROCEDURE' as const,
      notes: 'laser',
    };
    expect(confirmedStep(plan)).toBeNull();
    expect(confirmedStep({ ...plan, doctor: { kind: 'resolved', value: shravya } })).toEqual({
      kind: 'create',
      body: { patientId: 'p1', doctorId: 'd1', date: '2026-11-16', slot: '10:00-10:30', visitType: 'PROCEDURE', notes: 'laser' },
    });
  });

  it('opens the visits page with the patient and today’s appointment', () => {
    const appointment = { id: 'a9', date: '2026-11-15', slot: '10:00-10:30', status: 'CHECKED_IN', doctorId: 'd1', doctorName: 'Dr Shravya Rao' };
    expect(confirmedStep({ action: 'start_visit', patient: { kind: 'resolved', value: ramesh }, appointment }))
      .toEqual({ kind: 'navigate', href: '/dashboard/visits?patientId=p1&appointmentId=a9&autoStart=true' });
  });
});

describe('resolveVoiceCommand', () => {
  const now = new Date('2026-11-15T05:30:00Z');
  const sourceWith = (patientsByTerm: Record<string, PatientOption[]>) => {
    const searched: string[] = [];
    const source: VoiceCommandSource = {
      searchPatients: async (term) => { searched.push(term); return patientsByTerm[term] ?? []; },
      doctors: async () => [shravya, anil],
      availableSlots: async () => ['10:00-10:30', '16:00-16:30'],
      appointments: async () => [],
    };
    return { source, searched };
  };

  it('returns an unavailable plan for a role the action is closed to, before any lookup', async () => {
    const { source, searched } = sourceWith({});
    expect(await resolveVoiceCommand({ action: 'start_visit', patientName: 'Ramesh Kumar' }, {}, { role: 'RECEPTION', now }, source))
      .toEqual({ action: 'unavailable', reason: "Reception accounts can't start visits." });
    expect(searched).toEqual([]);
  });

  it('falls back from the full name to its first word and resolves the doctor and slot', async () => {
    const { source, searched } = sourceWith({ ramesh: [ramesh, rameshwar] });
    const plan = await resolveVoiceCommand(
      { action: 'schedule_appointment', patientName: 'Ramesh ji Kumar', doctorName: 'Shravya', date: '2026-11-16', time: '16:00' },
      {}, { role: 'RECEPTION', now }, source,
    );
    expect(searched).toEqual(['ramesh kumar', 'ramesh']);
    expect(plan).toEqual({
      action: 'schedule_appointment',
      patient: { kind: 'resolved', value: ramesh },
      doctor: { kind: 'resolved', value: shravya },
      date: { kind: 'resolved', value: '2026-11-16' },
      slot: { kind: 'resolved', value: '16:00-16:30' },
      visitType: 'OPD',
      notes: undefined,
    });
  });
});
