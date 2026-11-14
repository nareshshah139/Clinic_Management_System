export type LabelKind = 'gender' | 'role' | 'visitType' | 'appointmentAction';

const labels: Record<LabelKind, Readonly<Record<string, string>>> = {
  gender: { MALE: 'Male', M: 'Male', FEMALE: 'Female', F: 'Female', OTHER: 'Other', O: 'Other' },
  role: {
    OWNER: 'Owner', ADMIN: 'Admin', MANAGER: 'Manager', DOCTOR: 'Doctor', NURSE: 'Nurse', RECEPTION: 'Receptionist',
    RECEPTIONIST: 'Receptionist', PHARMACIST: 'Pharmacist', ACCOUNTANT: 'Accountant', LAB_TECH: 'Lab technician', PATIENT: 'Patient',
  },
  visitType: { OPD: 'OPD', TELEMED: 'Telemedicine', TELEMEDICINE: 'Telemedicine', PROCEDURE: 'Procedure' },
  appointmentAction: { DETAILS: 'Details', RESCHEDULE: 'Reschedule', START_VISIT: 'Start visit', CONTINUE_VISIT: 'Continue visit' },
};

export const normalizeEnum = (value: string | null | undefined) => value?.trim().toUpperCase().replace(/[\s-]+/g, '_') ?? '';

/** Sentence-case words for an enum the tables do not name, so a raw value such as LOW_STOCK never reaches the screen. */
export function humanizeEnum(value: string | null | undefined): string {
  const words = normalizeEnum(value).replace(/_/g, ' ').trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Unknown';
}

/**
 * @cc [owner:nareshshah139,label:product] enum-label
 * Gender, role, visit type and appointment action text MUST come from this table. An unknown value
 * MUST read as sentence-case words, never as a raw enum such as FEMALE or DOCTOR.
 */
export function enumLabel(kind: LabelKind, value: string | null | undefined): string {
  const key = normalizeEnum(value);
  return Object.hasOwn(labels[kind], key) ? labels[kind][key] : humanizeEnum(value);
}
