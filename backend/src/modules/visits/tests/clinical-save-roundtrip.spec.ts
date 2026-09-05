import { ValidationPipe } from '@nestjs/common';
import { CreateVisitDto, UpdateVisitDto } from '../dto/create-visit.dto';
import { VisitsService } from '../visits.service';

it('round-trips every clinical document through validation, create, update and history without losing saved fields', async () => {
  const documents = {
    complaints: [{ complaint: 'Rash', duration: 'Two weeks', severity: 'Mild', notes: 'Complaint note' }],
    history: { subjective: 'Subjective', pastHistory: 'Past', medicationHistory: 'Medication', menstrualHistory: 'Menstrual', triggers: 'Sun', priorTreatments: 'Prior', familyHistory: { dm: false, htn: true, thyroid: false, others: 'Family' } },
    vitals: { systolicBP: 120, diastolicBP: 80, heartRate: 72, temperature: 37, weight: 60, height: 160, oxygenSaturation: 99, respiratoryRate: 16, notes: 'Vitals note' },
    examination: { generalAppearance: 'Objective', dermatology: { diagnoses: ['Acne'], skinType: 'III', morphology: ['Papules'], distribution: ['Face'], acneSeverity: 'Mild', itchScore: 0, painScore: 0, skinConcerns: ['Dryness'], triggers: 'Heat', priorTreatments: 'Cream' } },
    diagnosis: [{ diagnosis: 'Acne', icd10Code: 'L70', type: 'Primary', notes: 'Diagnosis note' }],
    treatmentPlan: { notes: 'Plan', investigations: ['CBC'], procedurePlanned: 'Review procedure', followUpDate: '2026-10-01', followUpInstructions: 'Review advice', dermatology: { procedures: [{ type: 'Laser', fluence: 12, spotSize: 4, passes: 2 }], medications: { topicals: 'Cream', systemics: 'Tablet' }, medicationPlan: [{ drugName: 'Medicine', applicationAmount: 'Thin layer', leaveOn: false }], counseling: 'Advice', investigations: ['CBC'], labResults: { CBC: { value: '12', unit: 'g/dL', notes: 'Result note' } } } },
    scribeJson: { assessment: 'Assessment', procedureMetrics: { wavelengthNm: 1064, passes: 0 }, customSections: [{ title: 'Custom section', content: 'Custom content' }] },
  };
  let stored: any;
  const db: any = {
    patient: { findFirst: jest.fn().mockResolvedValue({ id: 'p' }) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'd' }) },
    visit: {
      create: jest.fn(async ({ data }) => (stored = { ...data, id: 'v', createdAt: new Date('2026-09-06'), appointment: null })),
      update: jest.fn(async ({ data }) => (stored = { ...stored, ...data })),
      findFirst: jest.fn(async () => stored),
      findMany: jest.fn(async () => [stored]),
    },
    visitAttachment: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async fn => fn(db)),
  };
  const service = new VisitsService(db);
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const create = await pipe.transform({ patientId: 'p', doctorId: 'd', ...documents }, { type: 'body', metatype: CreateVisitDto });
  await service.create(create, 'branch');
  const loaded = await service.findOne('v', 'branch');
  for (const [input, output] of Object.entries({ complaints: 'complaints', history: 'history', vitals: 'vitals', examination: 'exam', diagnosis: 'diagnosis', treatmentPlan: 'plan', scribeJson: 'scribeJson' })) {
    expect(loaded[output]).toEqual(documents[input]);
  }
  const patch = await pipe.transform({ history: { pastHistory: 'Updated past' }, treatmentPlan: { dermatology: { counseling: 'Updated advice' } } }, { type: 'body', metatype: UpdateVisitDto });
  await service.update('v', patch, 'branch');
  const history = await service.getPatientVisitHistory({ patientId: 'p' }, 'branch');
  expect(history.visits[0]).toMatchObject({
    history: { ...documents.history, pastHistory: 'Updated past' },
    plan: { ...documents.treatmentPlan, dermatology: { ...documents.treatmentPlan.dermatology, counseling: 'Updated advice' } },
    vitals: documents.vitals, complaints: documents.complaints, exam: documents.examination, diagnosis: documents.diagnosis, scribeJson: documents.scribeJson,
  });
});
