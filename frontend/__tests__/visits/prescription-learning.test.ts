import { buildLearnedMedicationSuggestion, buildLearnedPrescriptionPlan } from '@/lib/prescription-learning';

describe('buildLearnedPrescriptionPlan', () => {
  it('prefers this patient’s last similar plan over generic doctor patterns', () => {
    const suggestion = buildLearnedPrescriptionPlan({
      diagnosis: 'Acne vulgaris',
      doctorId: 'doc-1',
      currentVisitId: 'visit-current',
      patientVisits: [
        {
          id: 'visit-history-1',
          createdAt: '2026-04-01T00:00:00.000Z',
          doctor: { id: 'doc-1' },
          diagnosis: [{ diagnosis: 'Acne vulgaris' }],
          prescriptionItems: [
            { drugName: 'Isotretinoin 20 mg' },
            { drugName: 'Sunscreen SPF 50' },
          ],
          planSummary: {
            investigations: ['LFT', 'Fasting lipid profile'],
            followUpInstructions: 'Follow up in 30 days',
          },
          prescriptionMeta: {
            validUntil: '2026-05-01T00:00:00.000Z',
          },
        },
      ],
      doctorPrescriptions: [
        {
          createdAt: '2026-03-20T00:00:00.000Z',
          pharmacistNotes: 'Dx: Acne vulgaris',
          items: [
            { drugName: 'Doxycycline 100 mg' },
            { drugName: 'Benzoyl Peroxide 2.5%' },
          ],
          metadata: {
            investigations: ['CBC'],
            followUpInstructions: 'Review in 14 days',
          },
        },
        {
          createdAt: '2026-03-10T00:00:00.000Z',
          diagnosis: 'Acne vulgaris',
          items: [
            { drugName: 'Doxycycline 100 mg' },
            { drugName: 'Benzoyl Peroxide 2.5%' },
          ],
          metadata: {
            investigations: ['CBC'],
            followUpInstructions: 'Review in 2 weeks',
          },
        },
      ],
      templates: [
        {
          id: 'tpl-acne',
          name: 'Acne control set',
          items: [{ drugName: 'Adapalene 0.1% gel' }],
          metadata: {
            diagnosis: 'Acne vulgaris',
            investigations: ['LFT'],
            followUpInstructions: 'Review in 4 weeks',
          },
        },
      ],
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion?.sourceKind).toBe('patient-last-plan');
    expect(suggestion?.comboDrugNames).toEqual(['Isotretinoin 20 mg', 'Sunscreen SPF 50']);
    expect(suggestion?.investigations).toEqual(['LFT', 'Fasting lipid profile']);
    expect(suggestion?.reviewDays).toBe(30);
  });

  it('learns the most common doctor combo when patient history is sparse', () => {
    const suggestion = buildLearnedPrescriptionPlan({
      diagnosis: 'Rosacea',
      doctorId: 'doc-7',
      doctorPrescriptions: [
        {
          createdAt: '2026-04-20T00:00:00.000Z',
          pharmacistNotes: 'Dx: Rosacea',
          items: [
            { drugName: 'Doxycycline 40 mg' },
            { drugName: 'Azelaic Acid Gel' },
          ],
          metadata: {
            investigations: ['CBC'],
            followUpInstructions: 'Review in 21 days',
          },
        },
        {
          createdAt: '2026-04-01T00:00:00.000Z',
          diagnosis: 'Rosacea flare',
          items: [
            { drugName: 'Doxycycline 40 mg' },
            { drugName: 'Azelaic Acid Gel' },
          ],
          metadata: {
            investigations: ['CBC'],
            followUpInstructions: 'Review in 3 weeks',
          },
        },
        {
          createdAt: '2026-03-15T00:00:00.000Z',
          diagnosis: 'Rosacea',
          items: [{ drugName: 'Metronidazole Gel' }],
          metadata: {
            followUpInstructions: 'Review in 2 weeks',
          },
        },
      ],
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion?.sourceKind).toBe('doctor-pattern');
    expect(suggestion?.evidenceCount).toBe(2);
    expect(suggestion?.comboDrugNames).toEqual(['Doxycycline 40 mg', 'Azelaic Acid Gel']);
    expect(suggestion?.reviewDays).toBe(21);
    expect(suggestion?.investigations).toEqual(['CBC']);
  });

  it('falls back to a saved server order set when live history is thin', () => {
    const suggestion = buildLearnedPrescriptionPlan({
      diagnosis: 'Melasma',
      templates: [
        {
          id: 'tpl-melasma',
          name: 'Melasma core regimen',
          items: [{ drugName: 'Triple Combination Cream' }],
          metadata: {
            diagnosis: 'Melasma',
            investigations: ['TSH'],
            followUpInstructions: 'Review in 6 weeks',
          },
        },
      ],
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion?.sourceKind).toBe('doctor-template');
    expect(suggestion?.comboDrugNames).toEqual(['Triple Combination Cream']);
    expect(suggestion?.investigations).toEqual(['TSH']);
    expect(suggestion?.reviewDays).toBe(42);
  });

  it('matches dermatology shorthand so diagnosis autopilot still fires', () => {
    const suggestion = buildLearnedPrescriptionPlan({
      diagnosis: 'PIH',
      doctorPrescriptions: [
        {
          createdAt: '2026-04-12T00:00:00.000Z',
          diagnosis: 'Post-inflammatory hyperpigmentation',
          items: [{ drugName: 'Azelaic Acid 20% Cream' }],
          metadata: {
            followUpInstructions: 'Review in 6 weeks',
          },
        },
      ],
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion?.comboDrugNames).toEqual(['Azelaic Acid 20% Cream']);
    expect(suggestion?.reviewDays).toBe(42);
  });
});

describe('buildLearnedMedicationSuggestion', () => {
  it('prefills the usual sig from this patient’s last similar plan', () => {
    const suggestion = buildLearnedMedicationSuggestion({
      drugName: 'Doxycycline 40 mg',
      diagnosis: 'Rosacea',
      doctorId: 'doc-7',
      patientVisits: [
        {
          id: 'visit-history-1',
          createdAt: '2026-04-20T00:00:00.000Z',
          doctor: { id: 'doc-7' },
          diagnosis: [{ diagnosis: 'Rosacea flare' }],
          prescriptionItems: [
            {
              drugName: 'Doxycycline 40 mg',
              frequency: 'ONCE_DAILY',
              dosePattern: '1-0-0',
              duration: 21,
              durationUnit: 'DAYS',
              timing: 'After Breakfast',
              instructions: 'Take after breakfast',
            },
          ],
        },
      ],
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion?.sourceKind).toBe('patient-last-plan');
    expect(suggestion?.item.frequency).toBe('ONCE_DAILY');
    expect(suggestion?.item.duration).toBe(21);
    expect(suggestion?.item.instructions).toBe('Take after breakfast');
  });

  it('learns the most common doctor sig for the selected drug', () => {
    const suggestion = buildLearnedMedicationSuggestion({
      drugName: 'Triple Combination Cream',
      diagnosis: 'Melasma',
      doctorPrescriptions: [
        {
          createdAt: '2026-04-18T00:00:00.000Z',
          diagnosis: 'Melasma',
          items: [
            {
              drugName: 'Triple Combination Cream',
              frequency: 'ONCE_DAILY',
              duration: 8,
              durationUnit: 'WEEKS',
              timing: 'Bedtime',
              instructions: 'Apply a thin layer at night',
            },
          ],
        },
        {
          createdAt: '2026-03-29T00:00:00.000Z',
          pharmacistNotes: 'Dx: Melasma',
          items: [
            {
              drugName: 'Triple Combination Cream',
              frequency: 'ONCE_DAILY',
              duration: 8,
              durationUnit: 'WEEKS',
              timing: 'Bedtime',
              instructions: 'Apply a thin layer at night',
            },
          ],
        },
      ],
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion?.sourceKind).toBe('doctor-pattern');
    expect(suggestion?.evidenceCount).toBe(2);
    expect(suggestion?.item.timing).toBe('Bedtime');
    expect(suggestion?.item.durationUnit).toBe('WEEKS');
  });
});
