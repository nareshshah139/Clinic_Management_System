import { appendOnNewLine, valueEntry, type VoiceFillRegistry, type VoiceFillValue } from '@/lib/voice-fill';

/** A field's current value and its setter, in the order `useClinicalState` returns them. `restore` overrides the setter on undo. */
type Binding<T> = readonly [T, (next: T) => void, ((next: T) => void)?];

export interface ExtraVitalsPatch {
  temperatureF?: number;
  respiratoryRate?: number;
  painScore?: number;
}

export interface VisitVoiceBindings {
  heightCm: Binding<number | ''>;
  weightKg: Binding<number | ''>;
  bpSystolic: Binding<number | ''>;
  bpDiastolic: Binding<number | ''>;
  pulse: Binding<number | ''>;
  chiefComplaints: Binding<string>;
  skinConcerns: Binding<Set<string>>;
  diagnosis: Binding<string>;
  pastHistory: Binding<string>;
  medicationHistory: Binding<string>;
  menstrualHistory: Binding<string>;
  familyHistoryDiabetes: Binding<boolean>;
  familyHistoryHypertension: Binding<boolean>;
  familyHistoryThyroid: Binding<boolean>;
  familyHistoryOthers: Binding<string>;
  examination: Binding<string>;
  fitzpatrickSkinType: Binding<string>;
  acneSeverity: Binding<string>;
  itchScore: Binding<string>;
  procedures: Binding<string>;
  procedurePlanned: Binding<string>;
  investigations: Binding<string[]>;
  followUpInstructions: Binding<string>;
  /** Vitals owned by the parent form; returns the undo. */
  applyExtraVitals?: (patch: ExtraVitalsPatch) => () => void;
}

export function mergeCaseInsensitive(existing: readonly string[], additions: readonly string[]): string[] {
  const seen = new Set(existing.map((entry) => entry.trim().toLowerCase()));
  const merged = [...existing];
  for (const raw of additions) {
    const entry = raw.trim();
    if (entry && !seen.has(entry.toLowerCase())) {
      seen.add(entry.toLowerCase());
      merged.push(entry);
    }
  }
  return merged;
}

const text = (value: VoiceFillValue) => (typeof value === 'string' ? value : null);
const appended = (value: VoiceFillValue, previous: string) => (typeof value === 'string' ? appendOnNewLine(previous, value) : null);
const numeric = (value: VoiceFillValue) => (typeof value === 'number' ? value : null);
const flag = (value: VoiceFillValue) => (typeof value === 'boolean' ? value : null);
const numberText = (value: VoiceFillValue) => (typeof value === 'number' ? String(value) : null);

export function visitVoiceRegistry(b: VisitVoiceBindings): VoiceFillRegistry {
  const extraVital = (label: string, elementId: string, key: keyof ExtraVitalsPatch): VoiceFillRegistry[string] => ({
    label,
    elementId,
    apply: (value) => (typeof value === 'number' && b.applyExtraVitals ? b.applyExtraVitals({ [key]: value }) : null),
  });

  return {
    heightCm: valueEntry('Height', 'visit-vitals-height', b.heightCm, numeric),
    weightKg: valueEntry('Weight', 'visit-vitals-weight', b.weightKg, numeric),
    bpSystolic: valueEntry('BP systolic', 'visit-vitals-bp-sys', b.bpSystolic, numeric),
    bpDiastolic: valueEntry('BP diastolic', 'visit-vitals-bp-dia', b.bpDiastolic, numeric),
    pulse: valueEntry('Pulse', 'visit-vitals-pulse', b.pulse, numeric),
    temperatureF: extraVital('Temperature', 'visit-vitals-temp', 'temperatureF'),
    respiratoryRate: extraVital('Respiratory rate', 'visit-vitals-rr', 'respiratoryRate'),
    painScore: extraVital('Pain score', 'visit-pain-score', 'painScore'),
    chiefComplaints: valueEntry('Chief complaints', 'visit-chief-complaints', b.chiefComplaints, appended),
    skinConcerns: valueEntry('Skin concerns', undefined, b.skinConcerns, (value, previous) => {
      const union = Array.isArray(value) ? new Set([...previous, ...value]) : null;
      return union && union.size > previous.size ? union : null;
    }),
    diagnosis: valueEntry('Diagnosis', 'visit-diagnosis', b.diagnosis, text),
    pastHistory: valueEntry('Past history', 'visit-past-history', b.pastHistory, appended),
    medicationHistory: valueEntry('Medication history', 'visit-medication-history', b.medicationHistory, appended),
    menstrualHistory: valueEntry('Menstrual history', 'visit-menstrual-history', b.menstrualHistory, appended),
    familyHistoryDiabetes: valueEntry('Family history: diabetes', undefined, b.familyHistoryDiabetes, flag),
    familyHistoryHypertension: valueEntry('Family history: hypertension', undefined, b.familyHistoryHypertension, flag),
    familyHistoryThyroid: valueEntry('Family history: thyroid', undefined, b.familyHistoryThyroid, flag),
    familyHistoryOthers: valueEntry('Family history: others', 'visit-family-history-others', b.familyHistoryOthers, text),
    examination: valueEntry('Examination', 'visit-examination', b.examination, appended),
    fitzpatrickSkinType: valueEntry('Skin type', undefined, b.fitzpatrickSkinType, text),
    acneSeverity: valueEntry('Acne severity', 'visit-acne-severity', b.acneSeverity, text),
    itchScore: valueEntry('Itch score', 'visit-itch-score', b.itchScore, numberText),
    procedures: valueEntry('Procedures', 'visit-procedures', b.procedures, appended),
    procedurePlanned: valueEntry('Procedure planned', 'visit-procedure-planned', b.procedurePlanned, text),
    investigations: valueEntry('Investigations', undefined, b.investigations, (value, previous) => {
      const merged = Array.isArray(value) ? mergeCaseInsensitive(previous, value) : null;
      return merged && merged.length > previous.length ? merged : null;
    }),
    followUpInstructions: valueEntry('Follow-up', 'visit-followup-instructions', b.followUpInstructions, text),
  };
}
