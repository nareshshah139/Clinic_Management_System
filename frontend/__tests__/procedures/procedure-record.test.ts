import { parseVisitProcedure, repeatAsNewSession, toVisitRequest, type ProcedureRecord } from '@/components/procedures/procedure-record';

const filled: ProcedureRecord = {
  visit: null,
  patient: { id: 'p1', name: 'Asha Rao' },
  doctorId: 'd1',
  therapistId: 'n1',
  machine: 'fotona-starwalker',
  sessionNo: 3,
  bodyParts: ['Face', 'Neck'],
  indications: 'Melasma',
  skinTypes: { fitzpatrick: 'IV', robert: 'Type 2', scar: 'Rolling', herpes: 'None' },
  shotCounts: { begin: 100, end: 450 },
  parameters: { Fluence: { 1: '12', 2: '10' }, 'Spot Size': { 1: '7', 2: '' } },
  notes: 'Mild erythema',
};

const storedVisit = (plan: unknown, extra: Record<string, unknown> = {}) => ({
  id: 'v9',
  version: 4,
  patientId: 'p1',
  doctorId: 'd1',
  createdAt: '2026-11-20T10:00:00.000Z',
  patient: { id: 'p1', name: 'Asha Rao' },
  doctor: { firstName: 'Meera', lastName: 'Iyer' },
  plan: JSON.stringify(plan),
  ...extra,
});

describe('procedure record serializer and parser', () => {
  it('round-trips every field through a saved visit', () => {
    const request = toVisitRequest(filled);
    expect(request.kind).toBe('create');
    const body = request.body as { treatmentPlan: unknown; patientId: string; doctorId: string; complaints: unknown[] };
    expect([body.patientId, body.doctorId, body.complaints]).toEqual(['p1', 'd1', []]);

    const parsed = parseVisitProcedure(storedVisit(body.treatmentPlan));

    expect(parsed).toEqual({
      editable: true,
      label: 'Fotona Starwalker',
      doctorName: 'Dr. Meera Iyer',
      record: {
        visit: { id: 'v9', version: 4, createdAt: '2026-11-20T10:00:00.000Z' },
        patient: { id: 'p1', name: 'Asha Rao' },
        doctorId: 'd1',
        therapistId: 'n1',
        machine: 'fotona-starwalker',
        sessionNo: 3,
        bodyParts: ['Face', 'Neck'],
        indications: 'Melasma',
        skinTypes: { fitzpatrick: 'IV', robert: 'Type 2', scar: 'Rolling', herpes: 'None' },
        shotCounts: { begin: 100, end: 450 },
        parameters: { Fluence: { 1: '12', 2: '10' }, 'Spot Size': { 1: '7' } },
        notes: 'Mild erythema',
      },
    });
  });

  it('turns a loaded record into an update of the same visit without touching patient, doctor or complaints', () => {
    const loaded = parseVisitProcedure(storedVisit(toVisitRequest(filled).body.treatmentPlan))!;
    const request = toVisitRequest({ ...loaded.record, notes: 'Settled' });
    expect(request).toEqual({
      kind: 'update',
      visitId: 'v9',
      body: {
        version: 4,
        treatmentPlan: {
          dermatology: {
            procedures: [{
              type: 'Fotona Starwalker',
              machine: 'fotona-starwalker',
              therapistId: 'n1',
              sessionNo: 3,
              bodyPart: ['Face', 'Neck'],
              indications: 'Melasma',
              skinTypes: { fitzpatrick: 'IV', robert: 'Type 2', scar: 'Rolling', herpes: 'None' },
              shotCounts: { begin: 100, end: 450 },
              parameters: { Fluence: { 1: '12', 2: '10' }, 'Spot Size': { 1: '7' } },
            }],
          },
          notes: 'Settled',
        },
      },
    });
  });

  it('reads Fotona values saved under the old "Fluency" name as Fluence', () => {
    const parsed = parseVisitProcedure(storedVisit({
      dermatology: { procedures: [{ machine: 'fotona-starwalker', parameters: { Fluency: { '1': '14' }, Area: { '1': 'Cheeks' } } }] },
    }));
    expect(parsed?.record.parameters).toEqual({ Fluence: { 1: '14' }, Area: { 1: 'Cheeks' } });
  });

  it('shows visit-form procedures read-only with their recorded settings', () => {
    const parsed = parseVisitProcedure(storedVisit({
      dermatology: { procedures: [{ type: 'Soprano hair reduction', fluence: '10', spotSize: '12', passes: 2 }] },
    }));
    expect([parsed?.editable, parsed?.label, parsed?.record.machine, parsed?.record.parameters]).toEqual([
      false,
      'Soprano hair reduction',
      'soprano-platinum-lhr',
      { Fluence: { 1: '10' }, 'Spot Size': { 1: '12' }, Passes: { 1: '2' } },
    ]);
  });

  it('returns null only for a visit without a procedure', () => {
    expect(parseVisitProcedure(storedVisit({ notes: 'Consult only' }))).toBeNull();
    expect(parseVisitProcedure(storedVisit({ dermatology: { procedures: [] } }))).toBeNull();
    expect(parseVisitProcedure(storedVisit({ dermatology: { procedures: [{ type: 'Peel' }] } }))?.label).toBe('Peel');
  });

  it('repeats a session as a new visit with the next session number and fresh counts', () => {
    const loaded = parseVisitProcedure(storedVisit(toVisitRequest(filled).body.treatmentPlan))!;
    const next = repeatAsNewSession(loaded);
    expect([next.visit, next.sessionNo, next.shotCounts, next.notes, next.parameters, next.patient]).toEqual([
      null, 4, { begin: 0, end: 0 }, '', { Fluence: { 1: '12', 2: '10' }, 'Spot Size': { 1: '7' } }, { id: 'p1', name: 'Asha Rao' },
    ]);
    expect(toVisitRequest(next).kind).toBe('create');
  });
});
