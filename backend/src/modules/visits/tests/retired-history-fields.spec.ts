import { VisitsService } from '../visits.service';

function serviceHolding(visit: Record<string, unknown>) {
  let stored: any = { id: 'v', patientId: 'p', doctorId: 'd', createdAt: new Date('2026-09-06'), appointment: null, ...visit };
  const db: any = {
    patient: { findFirst: jest.fn().mockResolvedValue({ id: 'p' }), updateMany: jest.fn() },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'd' }) },
    visit: {
      update: jest.fn(async ({ data }) => (stored = { ...stored, ...data })),
      findFirst: jest.fn(async () => stored),
      findMany: jest.fn(async () => [stored]),
    },
    visitAttachment: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async fn => fn(db)),
  };
  return { service: new VisitsService(db), stored: () => stored };
}

describe('Patient History fields retired from the visit form', () => {
  const history = { pastHistory: 'Eczema as a child', personalHistory: 'Night shifts', triggers: 'Heat and stress', priorTreatments: 'Clobetasol cream' };
  const exam = { generalAppearance: 'Calm', dermatology: { skinType: 'III', triggers: 'Sun', priorTreatments: 'Hydroquinone' } };

  it('keeps stored triggers and prior treatments when a visit is saved without them', async () => {
    const { service, stored } = serviceHolding({ history: JSON.stringify(history), exam: JSON.stringify(exam) });
    await service.update('v', { history: { pastHistory: 'Eczema and asthma', personalHistory: 'Night shifts' }, examination: { dermatology: { skinType: 'IV' } } } as any, 'branch');
    expect(JSON.parse(stored().history)).toEqual({ ...history, pastHistory: 'Eczema and asthma' });
    expect(JSON.parse(stored().exam)).toEqual({ generalAppearance: 'Calm', dermatology: { skinType: 'IV', triggers: 'Sun', priorTreatments: 'Hydroquinone' } });
  });

  it('still lists them in the visit history summary for old visits', async () => {
    const { service } = serviceHolding({ history: JSON.stringify(history), exam: JSON.stringify(exam) });
    const result = await service.getPatientVisitHistory({ patientId: 'p' }, 'branch');
    expect(result.visits[0].historySummary).toEqual({ ...history, });
    expect(result.visits[0].examSummary.dermatology).toEqual(exam.dermatology);
  });
});
