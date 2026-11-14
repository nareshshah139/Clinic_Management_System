export type ClinicalRecordPresence = {
  complaint: boolean;
  diagnosis: boolean;
  plan: boolean;
  prescription: boolean;
  vitals: boolean;
  photos: boolean;
  labs: boolean;
};

export type CompletionStep = { key: 'assessment' | 'plan' | 'vitals' | 'photos' | 'labs'; label: string; done: boolean; required: boolean };

export const COMPLETION_RULE = 'To complete, record a complaint or diagnosis, and a plan or prescription.';

/**
 * @cc [owner:nareshshah139,label:product] visit-completion-minimums
 * A doctor MAY complete a visit once it records a chief complaint or a diagnosis, and a plan or a
 * prescription. Vitals, photos and labs are optional and MUST NOT block completion.
 */
export function completionSteps(record: ClinicalRecordPresence): CompletionStep[] {
  return [
    { key: 'assessment', label: 'Complaint or diagnosis', done: record.complaint || record.diagnosis, required: true },
    { key: 'plan', label: 'Plan or prescription', done: record.plan || record.prescription, required: true },
    { key: 'vitals', label: 'Vitals', done: record.vitals, required: false },
    { key: 'photos', label: 'Photos', done: record.photos, required: false },
    { key: 'labs', label: 'Labs', done: record.labs, required: false },
  ];
}

export const canCompleteVisit = (steps: CompletionStep[]) => steps.every((step) => !step.required || step.done);
