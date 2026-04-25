import { buildLearnedPrescriptionPlan } from '@/lib/prescription-learning';

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
});
