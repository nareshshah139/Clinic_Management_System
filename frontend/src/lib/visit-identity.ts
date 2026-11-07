import { calculateAge, formatPatientName } from '@/lib/utils';

export interface VisitIdentity {
  name: string;
  age: number | null;
  sex: string | null;
  doctorName: string | null;
  slot: string | null;
  visitType: string | null;
}

interface PatientSource {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  age?: number | null;
  dob?: string | null;
  gender?: string | null;
}

interface DoctorSource {
  firstName?: string | null;
  lastName?: string | null;
}

interface AppointmentSource {
  slot?: string | null;
  visitType?: string | null;
}

const SEX_LABELS: Record<string, string> = {
  M: 'Male',
  MALE: 'Male',
  F: 'Female',
  FEMALE: 'Female',
  O: 'Other',
  OTHER: 'Other',
};

const SLOT_RANGE = /^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/;

function formatSex(gender: string | null | undefined): string | null {
  const raw = gender?.trim();
  if (!raw) return null;
  return SEX_LABELS[raw.toUpperCase()] ?? null;
}

function formatSlot(slot: string | null | undefined): string | null {
  const raw = slot?.trim();
  if (!raw) return null;
  const range = SLOT_RANGE.exec(raw);
  return range ? `${range[1]}–${range[2]}` : raw;
}

function formatDoctorName(doctor: DoctorSource | null | undefined): string | null {
  const full = [doctor?.firstName, doctor?.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return full ? `Dr. ${full}` : null;
}

export function visitIdentity(
  patient: PatientSource,
  doctor: DoctorSource | null | undefined,
  appointment: AppointmentSource | null | undefined,
): VisitIdentity {
  return {
    name: formatPatientName(patient),
    age: calculateAge(patient),
    sex: formatSex(patient.gender),
    doctorName: formatDoctorName(doctor),
    slot: formatSlot(appointment?.slot),
    visitType: appointment?.visitType?.trim() || null,
  };
}
