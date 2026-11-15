import { applyVoiceFillRegistry, stateRegistry, type StateFieldSpec, type VoiceFillFields } from '@/lib/voice-fill';

export interface PatientVoiceState {
  firstName: string;
  lastName: string;
  age: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  emergencyContact: string;
  abhaId: string;
  consultationType: string;
  referralSource: string;
  patientType: string;
}

type PatientVoiceKey = keyof PatientVoiceState;

const PATIENT_FIELDS: Record<PatientVoiceKey, Omit<StateFieldSpec, 'elementId'>> = {
  firstName: { label: 'First name', kind: 'text' },
  lastName: { label: 'Last name', kind: 'text' },
  age: { label: 'Age', kind: 'number' },
  gender: { label: 'Gender', kind: 'text' },
  phone: { label: 'Phone', kind: 'text' },
  email: { label: 'Email', kind: 'text' },
  address: { label: 'Address', kind: 'text' },
  emergencyContact: { label: 'Emergency contact', kind: 'text' },
  abhaId: { label: 'ABHA ID', kind: 'text' },
  consultationType: { label: 'Consultation type', kind: 'text' },
  referralSource: { label: 'Referral source', kind: 'text' },
  patientType: { label: 'Patient type', kind: 'text' },
};

/** `elementIds` lists exactly the fields the calling dialog has, mapped to their input ids. */
export function applyPatientVoiceFill(
  fields: VoiceFillFields,
  elementIds: Partial<Record<PatientVoiceKey, string>>,
  current: Partial<PatientVoiceState>,
  update: (patch: Partial<PatientVoiceState>) => void,
) {
  const spec = Object.fromEntries(
    (Object.keys(elementIds) as PatientVoiceKey[]).map((key) => [key, { ...PATIENT_FIELDS[key], elementId: elementIds[key] }]),
  );
  return applyVoiceFillRegistry(stateRegistry<Partial<PatientVoiceState>>(spec, current, update), fields);
}
