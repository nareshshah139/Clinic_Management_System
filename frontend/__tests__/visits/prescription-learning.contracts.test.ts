import { buildLearnedMedicationSuggestion, buildLearnedPrescriptionPlan } from '@/lib/prescription-learning';

const NOW = new Date().toISOString();

const visit = (over: Record<string, unknown> = {}) => ({
  id: 'visit-1',
  createdAt: NOW,
  doctorId: 'doc-1',
  diagnosis: 'Acne vulgaris',
  prescriptionItems: [{ drugName: 'Doxycycline 100 mg', dosage: '1', frequency: 'ONCE_DAILY' }],
  ...over,
});

const rx = (over: Record<string, unknown> = {}) => ({
  createdAt: NOW,
  diagnosis: 'Acne vulgaris',
  items: [{ drugName: 'Doxycycline 100 mg', dosage: '1', frequency: 'ONCE_DAILY' }],
  ...over,
});

describe('plan-suggested-only-for-a-matching-diagnosis', () => {
  it('suggests the matching record items for the same diagnosis', () => {
    const plan = buildLearnedPrescriptionPlan({ diagnosis: 'acne vulgaris', patientVisits: [visit()] });
    expect(plan?.items.map((i) => i.drugName)).toEqual(['Doxycycline 100 mg']);
  });

  it.each(['', '  ', 'ac'])('returns null for diagnosis %j shorter than 3 characters', (diagnosis) => {
    expect(buildLearnedPrescriptionPlan({ diagnosis, patientVisits: [visit()] })).toBeNull();
  });

  it('returns null when the only history is for an unrelated diagnosis', () => {
    const plan = buildLearnedPrescriptionPlan({
      diagnosis: 'Psoriasis',
      patientVisits: [visit()],
      doctorPrescriptions: [rx()],
      templates: [{ id: 't', name: 'Acne set', items: [{ drugName: 'Adapalene' }], metadata: { diagnosis: 'Acne vulgaris' } }],
    });
    expect(plan).toBeNull();
  });

  it('returns null when there is no history at all', () => {
    expect(buildLearnedPrescriptionPlan({ diagnosis: 'Acne vulgaris' })).toBeNull();
    expect(buildLearnedPrescriptionPlan({ diagnosis: 'Acne vulgaris', patientVisits: [], doctorPrescriptions: [], templates: [] })).toBeNull();
  });

  it('ignores records that have no named drug', () => {
    const plan = buildLearnedPrescriptionPlan({
      diagnosis: 'Acne vulgaris',
      patientVisits: [visit({ prescriptionItems: [{ dosage: '1' }, null, 'junk'] })],
    });
    expect(plan).toBeNull();
  });

  it('survives malformed entries in every source list', () => {
    const plan = buildLearnedPrescriptionPlan({
      diagnosis: 'Acne vulgaris',
      patientVisits: [null, 'x', 42, visit()],
      doctorPrescriptions: [undefined, 'y'],
      templates: [null],
    });
    expect(plan?.items).toHaveLength(1);
  });

  it('draws items only from the supplied sources', () => {
    const plan = buildLearnedPrescriptionPlan({
      diagnosis: 'Acne vulgaris',
      doctorPrescriptions: [rx({ items: [{ drugName: 'Doxycycline 100 mg' }, { drugName: 'Benzoyl Peroxide' }] })],
    });
    expect(plan?.sourceKind).toBe('doctor-pattern');
    expect(plan?.items.map((i) => i.drugName).sort()).toEqual(['Benzoyl Peroxide', 'Doxycycline 100 mg']);
  });
});

describe('patient-history-plans-are-patient-scoped-and-attributed', () => {
  it('never learns from the visit being edited', () => {
    const plan = buildLearnedPrescriptionPlan({
      diagnosis: 'Acne vulgaris',
      currentVisitId: 'visit-1',
      patientVisits: [visit({ id: 'visit-1' })],
    });
    expect(plan).toBeNull();
  });

  it('still learns from the patient’s other visits when one is the current visit', () => {
    const plan = buildLearnedPrescriptionPlan({
      diagnosis: 'Acne vulgaris',
      currentVisitId: 'visit-1',
      doctorId: 'doc-1',
      patientVisits: [visit({ id: 'visit-1' }), visit({ id: 'visit-0', prescriptionItems: [{ drugName: 'Isotretinoin 20 mg' }] })],
    });
    expect(plan?.items.map((i) => i.drugName)).toEqual(['Isotretinoin 20 mg']);
  });

  it('labels the same doctor’s visit as this patient’s last similar plan', () => {
    const plan = buildLearnedPrescriptionPlan({ diagnosis: 'Acne vulgaris', doctorId: 'doc-1', patientVisits: [visit()] });
    expect(plan?.sourceKind).toBe('patient-last-plan');
    expect(plan?.sourceLabel).toBe('Auto-filled from this patient’s last similar plan');
  });

  it('labels another doctor’s visit as patient history, not as the doctor’s own plan', () => {
    const plan = buildLearnedPrescriptionPlan({
      diagnosis: 'Acne vulgaris',
      doctorId: 'doc-2',
      patientVisits: [visit({ doctorId: 'doc-1' })],
    });
    expect(plan?.sourceLabel).toBe('Auto-filled from this patient’s similar visit history');
  });

  it('attributes the doctor from a nested doctor object too', () => {
    const plan = buildLearnedPrescriptionPlan({
      diagnosis: 'Acne vulgaris',
      doctorId: 'doc-1',
      patientVisits: [visit({ doctorId: undefined, doctor: { id: 'doc-1' } })],
    });
    expect(plan?.sourceLabel).toBe('Auto-filled from this patient’s last similar plan');
  });

  it('patient visits never count as doctor-pattern evidence', () => {
    const plan = buildLearnedPrescriptionPlan({ diagnosis: 'Acne vulgaris', doctorId: 'doc-1', patientVisits: [visit(), visit({ id: 'v2' })] });
    expect(plan?.sourceKind).toBe('patient-last-plan');
    expect(plan?.evidenceCount).toBe(1);
  });
});

describe('suggested-items-never-alias-caller-data', () => {
  it('editing a suggested plan item leaves the source visit unchanged', () => {
    const source = visit();
    const plan = buildLearnedPrescriptionPlan({ diagnosis: 'Acne vulgaris', patientVisits: [source] });
    plan!.items[0].dosage = '99';
    expect(source.prescriptionItems[0].dosage).toBe('1');
  });

  it('editing a suggested doctor-pattern item leaves the prescription unchanged', () => {
    const source = rx();
    const plan = buildLearnedPrescriptionPlan({ diagnosis: 'Acne vulgaris', doctorPrescriptions: [source] });
    plan!.items[0].frequency = 'FOUR_TIMES_DAILY';
    expect(source.items[0].frequency).toBe('ONCE_DAILY');
  });

  it('editing a suggested medication sig leaves the source visit unchanged', () => {
    const source = visit();
    const suggestion = buildLearnedMedicationSuggestion({
      drugName: 'Doxycycline',
      diagnosis: 'Acne vulgaris',
      patientVisits: [source],
    });
    suggestion!.item.dosage = '99';
    expect(source.prescriptionItems[0].dosage).toBe('1');
  });

  it('does not mutate any input while building a suggestion', () => {
    const inputs = {
      diagnosis: 'Acne vulgaris',
      doctorId: 'doc-1',
      patientVisits: [visit()],
      doctorPrescriptions: [rx(), rx()],
      templates: [{ id: 't', items: [{ drugName: 'Adapalene' }], metadata: { diagnosis: 'Acne vulgaris' } }],
    };
    const before = JSON.parse(JSON.stringify(inputs));
    buildLearnedPrescriptionPlan(inputs);
    buildLearnedMedicationSuggestion({ ...inputs, drugName: 'Doxycycline' });
    expect(inputs).toEqual(before);
  });
});

describe('suggested-sig-belongs-to-the-typed-drug', () => {
  const history = (drugName: string) => [visit({ prescriptionItems: [{ drugName, dosage: '5', frequency: 'ONCE_DAILY' }] })];

  it('suggests the sig of the same drug, ignoring case and spacing', () => {
    const suggestion = buildLearnedMedicationSuggestion({
      drugName: '  CETIRIZINE ',
      diagnosis: 'Acne vulgaris',
      patientVisits: history('Cetirizine'),
    });
    expect(suggestion?.item).toMatchObject({ drugName: 'Cetirizine', dosage: '5' });
  });

  it('returns null for a different drug', () => {
    expect(
      buildLearnedMedicationSuggestion({ drugName: 'Isotretinoin', diagnosis: 'Acne vulgaris', patientVisits: history('Cetirizine') }),
    ).toBeNull();
  });

  it('returns null for another diagnosis even when the drug matches', () => {
    expect(
      buildLearnedMedicationSuggestion({ drugName: 'Cetirizine', diagnosis: 'Psoriasis', patientVisits: history('Cetirizine') }),
    ).toBeNull();
  });

  it.each([
    ['x', 'Acne vulgaris'],
    ['Cetirizine', 'ac'],
    ['', 'Acne vulgaris'],
  ])('returns null for drug %j with diagnosis %j too short', (drugName, diagnosis) => {
    expect(buildLearnedMedicationSuggestion({ drugName, diagnosis, patientVisits: history('Cetirizine') })).toBeNull();
  });

  it('prefers the patient’s own sig over the doctor’s pattern for the same drug', () => {
    const suggestion = buildLearnedMedicationSuggestion({
      drugName: 'Cetirizine',
      diagnosis: 'Acne vulgaris',
      patientVisits: history('Cetirizine'),
      doctorPrescriptions: [rx({ items: [{ drugName: 'Cetirizine', dosage: '10' }] })],
    });
    expect(suggestion?.sourceKind).toBe('patient-last-plan');
    expect(suggestion?.item.dosage).toBe('5');
  });

  it.failing('target: Cetirizine does not receive the sig of Levocetirizine', () => {
    expect(
      buildLearnedMedicationSuggestion({ drugName: 'Cetirizine', diagnosis: 'Acne vulgaris', patientVisits: history('Levocetirizine') }),
    ).toBeNull();
  });

  it.failing('target: Metformin does not receive the sig of a Glimepiride + Metformin combination', () => {
    expect(
      buildLearnedMedicationSuggestion({
        drugName: 'Metformin',
        diagnosis: 'Acne vulgaris',
        patientVisits: history('Glimepiride + Metformin'),
      }),
    ).toBeNull();
  });
});
