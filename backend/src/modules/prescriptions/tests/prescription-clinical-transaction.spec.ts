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
