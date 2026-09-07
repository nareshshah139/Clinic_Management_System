import { VisitsService } from '../../visits/visits.service';
import { PrescriptionsService } from '../prescriptions.service';
import { ValidationPipe } from '@nestjs/common';
import { CreatePrescriptionDto, UpdatePrescriptionDto } from '../dto/prescription.dto';

function database(fail = false) {
  let committed: any = { visit: { id: 'v', patientId: 'p', doctorId: 'd', history: JSON.stringify({ pastHistory: 'Preserve existing' }), exam: JSON.stringify({ dermatology: { morphology: ['Keep morphology'] } }), plan: JSON.stringify({ dermatology: { labResults: { CBC: 'Keep result' } } }), diagnosis: '[]', complaints: '[]' }, prescriptions: [] };
  const client = (state: any): any => ({
    patient: { findFirst: jest.fn().mockResolvedValue({ id: 'p' }) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'd' }) },
    visit: { findFirst: jest.fn(async () => state.visit), update: jest.fn(async ({ data }) => (state.visit = { ...state.visit, ...data })) },
    prescription: { findFirst: jest.fn(async () => state.prescriptions[0] || null), update: jest.fn(async ({ data }) => { if (fail) throw new Error('Synthetic update failure'); state.prescriptions[0] = { ...state.prescriptions[0], ...data }; return state.prescriptions[0]; }), create: jest.fn(async ({ data }) => { if (fail) throw new Error('Synthetic insert failure'); const rx = { id: 'rx', ...data }; state.prescriptions.push(rx); return rx; }) },
  });
  const db = client(committed);
  db.$transaction = jest.fn(async (callback: any) => { const draft = structuredClone(committed); const result = await callback(client(draft)); committed = draft; return result; });
  return { db, state: () => committed };
}
const payload = { patientId: 'p', doctorId: 'd', visitId: 'v', items: [{ drugName: 'Synthetic', dosage: 1, dosageUnit: 'TABLET', frequency: 'DAILY', duration: 1, durationUnit: 'DAYS' }], clinicalData: { history: { triggers: 'New trigger' }, examination: { dermatology: { skinType: 'III' } }, diagnosis: [{ diagnosis: 'Recorded diagnosis' }], treatmentPlan: { investigations: ['Investigation'], followUpDate: '2026-10-01' } } };

describe('Prescription clinical transaction', () => {
  it('saves a manually entered medicine with a dose pattern and no numeric dosage', async () => {
    const { dosage, ...item } = payload.items[0];
    const input = await new ValidationPipe({ transform: true, whitelist: true }).transform({
      ...payload, items: [{ ...item, dosePattern: '1-0-1', instructions: 'Recorded instructions' }],
    }, { type: 'body', metatype: CreatePrescriptionDto });
    const { db, state } = database();
    await new PrescriptionsService(db, {} as any).createPrescription(input, 'branch');
    const saved = JSON.parse(state().prescriptions[0].items)[0];
    expect(saved).toMatchObject({ dosePattern: '1-0-1', instructions: 'Recorded instructions' });
    expect(saved).not.toHaveProperty('dosage');
    const update = await new ValidationPipe({ transform: true, whitelist: true }).transform({ items: [saved] }, { type: 'body', metatype: UpdatePrescriptionDto });
    expect(update.items[0].dosage).toBeUndefined();
  });
  it.each([0, -1, 'invalid'])('still rejects an explicit invalid dosage: %s', async dosage => {
    await expect(new ValidationPipe({ transform: true, whitelist: true }).transform({
      ...payload, items: [{ ...payload.items[0], dosage }],
    }, { type: 'body', metatype: CreatePrescriptionDto })).rejects.toThrow();
  });
  it('validates and commits prescription plus clinical details without dropping prior fields', async () => {
    const input = await new ValidationPipe({ transform: true, whitelist: true }).transform(payload, { type: 'body', metatype: CreatePrescriptionDto });
    const { db, state } = database();
    await new PrescriptionsService(db, {} as any).createPrescription(input, 'branch');
    expect(state().prescriptions).toHaveLength(1);
    expect(JSON.parse(state().visit.history)).toEqual({ pastHistory: 'Preserve existing', triggers: 'New trigger' });
    expect(JSON.parse(state().visit.exam)).toEqual({ dermatology: { morphology: ['Keep morphology'], skinType: 'III' } });
    expect(JSON.parse(state().visit.plan)).toMatchObject({ dermatology: { labResults: { CBC: 'Keep result' } }, investigations: ['Investigation'] });
    expect(state().visit.followUp).toEqual(new Date('2026-10-01'));
  });
  it('rolls back the clinical update if prescription insertion fails', async () => {
    const { db, state } = database(true);
    const before = structuredClone(state());
    await expect(new PrescriptionsService(db, {} as any).createPrescription(payload as any, 'branch')).rejects.toThrow('Synthetic insert failure');
    expect(state()).toEqual(before);
  });
  it('rejects cross-patient linkage before any write', async () => {
    const { db, state } = database();
    await expect(new PrescriptionsService(db, {} as any).createPrescription({ ...payload, patientId: 'other' } as any, 'branch')).rejects.toThrow('does not match');
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(state().prescriptions).toHaveLength(0);
  });
  it('updates an existing prescription using real schema fields and retains visit history', async () => {
    const { db, state } = database();
    state().prescriptions.push({ id: 'rx', visitId: 'v', items: '[]', visit: { id: 'v', patient: { id: 'p' }, doctor: { id: 'd' } } });
    const input = await new ValidationPipe({ transform: true, whitelist: true }).transform({ clinicalData: payload.clinicalData, notes: 'New note', followUpInstructions: 'New guidance', items: payload.items }, { type: 'body', metatype: UpdatePrescriptionDto });
    const result = await new PrescriptionsService(db, {} as any).updatePrescription('rx', input, 'branch');
    expect(result.pharmacistNotes).toBe('New note');
    expect(result.instructions).toBe('New guidance');
    expect(result.items).toHaveLength(1);
    expect(JSON.parse(state().visit.history)).toMatchObject({ pastHistory: 'Preserve existing', triggers: 'New trigger' });
    expect(state().prescriptions[0]).not.toHaveProperty('validUntil');
  });

});

describe('Saved clinical details in history', () => {
  it('returns the complete validated prescription snapshot through the history service', async () => {
    const { db, state } = database();
    const full = { ...payload, followUpInstructions: 'Full guidance', clinicalData: {
      ...payload.clinicalData,
      complaints: [{ complaint: 'First complaint' }, { complaint: 'Second complaint' }],
      history: { pastHistory: 'Detailed past history', medicationHistory: 'Prior medicines', menstrualHistory: 'Recorded detail', triggers: 'New trigger', priorTreatments: 'Prior treatment' },
      examination: { generalAppearance: 'Observed finding', dermatology: { skinType: 'III', morphology: ['Finding'] } },
      treatmentPlan: { investigations: ['Investigation'], finalNotes: 'Final detail', followUpDate: '2026-10-01', dermatology: { medicationPlan: [{ drugName: 'Draft medicine' }] } },
      scribeJson: { customSections: [{ title: 'Additional note', content: 'Full custom detail' }] },
    } };
    const input = await new ValidationPipe({ transform: true, whitelist: true }).transform(full, { type: 'body', metatype: CreatePrescriptionDto });
    await new PrescriptionsService(db, {} as any).createPrescription(input, 'branch');
    db.visit.findMany = jest.fn(async () => [{ ...state().visit, createdAt: new Date('2026-09-05'), prescription: state().prescriptions[0] }]);
    db.visitAttachment = { findMany: jest.fn().mockResolvedValue([]) };
    const history = await new VisitsService(db).getPatientVisitHistory({ patientId: 'p' }, 'branch');
    expect(history.visits[0]).toMatchObject({ history: full.clinicalData.history, complaints: full.clinicalData.complaints, exam: full.clinicalData.examination, plan: full.clinicalData.treatmentPlan, scribeJson: full.clinicalData.scribeJson, prescriptionMeta: { followUpInstructions: 'Full guidance' } });
  });
});
