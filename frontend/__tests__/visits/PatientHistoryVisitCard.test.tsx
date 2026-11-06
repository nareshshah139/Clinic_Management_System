import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';
import PatientHistoryVisitCard from '@/components/visits/PatientHistoryVisitCard';

describe('PatientHistoryVisitCard', () => {
  it('shows a collapsed summary by default and expands into full details', async () => {
    const user = userEvent.setup();
    const onResume = jest.fn();

    render(
      <PatientHistoryVisitCard
        visit={{
          id: 'visit-123',
          createdAt: '2026-04-25T10:30:00.000Z',
          status: 'in-progress',
          visitType: 'Follow-up Consultation',
          doctor: { firstName: 'Asha', lastName: 'Patel' },
          complaints: [{ complaint: 'Seasonal acne flare' }],
          diagnosis: [{ diagnosis: 'Acne vulgaris' }],
          vitals: { bpS: 120, bpD: 80, temp: 98.6 },
          planSummary: { investigations: ['CBC'] },
          prescriptionItems: [
            {
              drugName: 'Doxycycline',
              dosage: '100',
              dosageUnit: 'mg',
              frequency: 'TWICE_DAILY',
            },
          ],
        }}
        visitLabel="Visit #3"
        onResume={onResume}
      />
    );

    expect(screen.getByText('Visit #3')).toBeInTheDocument();
    expect(screen.getByText('Seasonal acne flare')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resume session/i })).toBeInTheDocument();
    expect(screen.queryByText('Vitals')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show details/i }));

    expect(screen.queryByText('Vitals')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /full details/i }));

    expect(screen.getByText('Vitals')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Prescription' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /resume session/i }));

    expect(onResume).toHaveBeenCalledTimes(1);
  });
});

it('renders every clinical field when expanded and uses the appointment day', async () => {
  render(<PatientHistoryVisitCard defaultCollapsed={false} visit={{
    id: 'v', createdAt: '2026-09-01T13:00:00Z', appointment: { date: '2026-09-02T00:00:00Z' },
    complaints: [{ complaint: 'First complaint', duration: 'Two weeks' }, { complaint: 'Second complaint' }],
    diagnosis: [{ diagnosis: 'First diagnosis' }, { diagnosis: 'Second diagnosis' }],
    history: { pastHistory: 'Prior illness', triggers: 'Trigger detail', priorTreatments: 'Prior treatment' },
    exam: { dermatology: { morphology: ['Exam detail'] } },
    plan: { finalNotes: 'Final note', followUp: 'Follow-up instruction', dermatology: { procedures: [{ type: 'Procedure detail' }], medications: { topicals: 'Topical detail' } } },
    vitals: { temperature: 37, oxygenSaturation: 98 },
    prescriptionItems: [{ drugName: 'Drug', dosePattern: '1-0-1', applicationSite: 'Application detail' }],
    prescriptionMeta: { followUpInstructions: 'Prescription guidance' },
  }} />);
  await userEvent.click(screen.getByRole('button', { name: 'Full details' }));
  for (const text of ['Second complaint', 'Two weeks', 'Second diagnosis', 'Trigger detail', 'Prior treatment', 'Exam detail', 'Final note', 'Follow-up instruction', 'Procedure detail', 'Topical detail', '1-0-1', 'Application detail', 'Prescription guidance', 'Temperature (°C)', 'SpO₂ (%)']) {
    expect(screen.getAllByText(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length).toBeGreaterThan(0);
  }
  expect(screen.getByText('02 Sep 2026')).toBeInTheDocument();
});

it('labels an appointment without a visit and never offers to resume it as a visit', () => {
  render(<PatientHistoryVisitCard visit={{ id: 'appointment:a', entryType: 'appointment', appointment: { date: '2026-09-02' }, status: 'CANCELLED' }} onResume={() => {}} />);
  expect(screen.getByText(/no visit documentation recorded/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
});

it('shows nested clinical fields as labeled rows and links every photo to its full size', async () => {
  render(<PatientHistoryVisitCard visit={{
    history: { familyHistory: { dm: false, htn: true }, customObservation: 'Complete\nmultiline detail' },
    exam: { dermatology: { itchScore: 0, diagnoses: ['Selected diagnosis'] } },
    plan: { dermatology: { labResults: { CBC: { value: '12', unit: 'g/dL', notes: 'Lab annotation' } } } },
    prescription: { items: JSON.stringify([{ drugName: 'Saved drug', applicationAmount: 'Thin layer' }]), instructions: 'Saved instructions', validUntil: '2026-10-01' } as any,
    photoPreviewUrls: ['/visits/v/photos/one', '/visits/v/photos/two'],
  }} />);
  await userEvent.click(screen.getByRole('button', { name: /show details/i }));
  await userEvent.click(screen.getByRole('button', { name: /full details/i }));
  expect(screen.getByText('Diabetes').parentElement).toHaveTextContent('No');
  expect(screen.getByText('Hypertension').parentElement).toHaveTextContent('Yes');
  expect(screen.getByText('Itch Score').parentElement).toHaveTextContent('0');
  expect(screen.getByText('Custom Observation').parentElement).toHaveTextContent('Complete multiline detail');
  for (const text of ['Selected diagnosis', 'Lab annotation', 'Saved drug', 'Thin layer', 'Saved instructions', 'Prescription valid until']) expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open visit photo 2' })).toHaveAttribute('href', '/api/visits/v/photos/two');
});

describe('CR-16 past-visit panel', () => {
  const regimenState = { touched: ['timing', 'duration', 'instructions'], suggested: [], source: 'doctor' };
  const rxVisit = {
    id: 'v1',
    createdAt: '2026-09-01T13:00:00Z',
    complaints: [{ complaint: 'Itchy scalp' }],
    diagnosis: [{ diagnosis: 'Dandruff' }],
    history: { subjective: 'Itching for 3 weeks', pastHistory: 'Seasonal flares', personalHistory: 'Vegetarian diet' },
    plan: { dermatology: { medicationPlan: [
      { drugName: 'Ketoconazole', name: 'Ketoconazole', dosePattern: '1-0-1', regimenState },
      { drugName: 'Minoxidil', frequency: 'TWICE_DAILY' },
    ] } },
    prescriptionItems: [
      { drugName: 'Ketoconazole', name: 'Ketoconazole', dosePattern: '1-0-1', frequency: 'TWICE_DAILY', gstRate: 12, drugId: 'drug-1', inventoryItemId: 'inv-1', regimenState, instructions: 'Apply at night' },
      { drugName: 'Minoxidil', dosePattern: '1-0-1', frequency: 'TWICE_DAILY', gstRate: 5 },
    ],
    prescriptionMeta: { language: 'en', followUpInstructions: 'Review in 2 weeks' },
  };
  const open = async (visit: Record<string, unknown>, props: Record<string, unknown> = {}) => {
    const user = userEvent.setup();
    render(<PatientHistoryVisitCard visit={visit} footerActions={<button type="button">Edit visit</button>} {...props} />);
    await user.click(screen.getByRole('button', { name: /show details/i }));
    return user;
  };
  const medicineList = () => within(screen.getByRole('heading', { name: 'Medicines' }).parentElement as HTMLElement)
    .getAllByRole('listitem').map((li) => li.textContent);

  it('keeps history and medicines hidden until details are opened', () => {
    render(<PatientHistoryVisitCard visit={rxVisit} />);
    expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Medicines' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show details/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('compact view lists each medicine name once without regimen detail', async () => {
    await open(rxVisit);
    expect(medicineList()).toEqual(['Ketoconazole', 'Minoxidil']);
    for (const text of ['1-0-1', 'TWICE_DAILY', 'Apply at night', 'Treatment plan']) {
      expect(screen.queryByText(new RegExp(text, 'i'))).not.toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Edit visit' })).toBeInTheDocument();
  });

  it('compact view shows the saved history including the visit form subjective note', async () => {
    await open(rxVisit);
    expect(screen.getByText('Itching for 3 weeks')).toBeInTheDocument();
    expect(screen.getByText('Vegetarian diet')).toBeInTheDocument();
  });

  it('shows legacy string history under a single History heading', async () => {
    await open({ id: 'h', history: 'Longstanding eczema since childhood' });
    expect(screen.getAllByRole('heading', { name: 'History' })).toHaveLength(1);
    expect(screen.getByText('Longstanding eczema since childhood')).toBeInTheDocument();
  });

  it('full details hides internal medicine fields and keeps real instructions', async () => {
    const user = await open(rxVisit);
    await user.click(screen.getByRole('button', { name: 'Full details' }));
    expect(screen.queryByText(/timing duration instructions/i)).not.toBeInTheDocument();
    for (const text of ['Regimen State', 'Touched', 'Gst Rate', 'Drug Id', 'Inventory Item Id']) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
    expect(screen.getByText('Apply at night')).toBeInTheDocument();
  });

  it('full details shows the prescription once', async () => {
    const user = await open(rxVisit);
    await user.click(screen.getByRole('button', { name: 'Full details' }));
    expect(screen.getAllByRole('heading', { name: 'Prescription' })).toHaveLength(1);
    expect(screen.getAllByText('Ketoconazole')).toHaveLength(1);
    expect(screen.getAllByText('Minoxidil')).toHaveLength(1);
    expect(screen.queryByText('Saved medication plan')).not.toBeInTheDocument();
  });

  it('full details keeps a consent language but hides the prescription language', async () => {
    const user = await open({ ...rxVisit, consents: [{ type: 'Procedure', language: 'Telugu' }] });
    await user.click(screen.getByRole('button', { name: 'Full details' }));
    expect(screen.getByText('Telugu')).toBeInTheDocument();
    expect(screen.queryByText('en')).not.toBeInTheDocument();
  });

  it('the switch is the first control of the expanded panel and carries no aria state', async () => {
    const user = await open(rxVisit);
    const toggle = screen.getByRole('button', { name: 'Full details' });
    expect(toggle).not.toHaveAttribute('aria-expanded');
    expect(toggle).not.toHaveAttribute('aria-pressed');
    expect(toggle).not.toHaveAttribute('aria-controls');
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Compact view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit visit' })).toBeInTheDocument();
  });

  it('draft visit with only a medication plan lists names and no Rx Items count', async () => {
    await open({ id: 'd', plan: { dermatology: { medicationPlan: [{ drugName: 'Adapalene' }, { name: 'Clindamycin' }] } } });
    expect(medicineList()).toEqual(['Adapalene', 'Clindamycin']);
    expect(screen.queryByText(/Rx Items/)).not.toBeInTheDocument();
  });

  it('keeps an edited plan drug visible under Treatment plan when it differs from the issued prescription', async () => {
    const user = await open({
      id: 'edited',
      prescriptionItems: [{ drugName: 'Doxycycline' }],
      plan: { dermatology: { medicationPlan: [{ drugName: 'Azithromycin' }] } },
    });
    await user.click(screen.getByRole('button', { name: 'Full details' }));
    expect(screen.getByRole('heading', { name: 'Treatment plan' })).toBeInTheDocument();
    expect(screen.getByText('Azithromycin')).toBeInTheDocument();
    expect(screen.getByText('Doxycycline')).toBeInTheDocument();
  });

  it('lists a legacy medicine alias in compact view', async () => {
    await open({ id: 'alias', prescriptionItems: [{ medicine: 'Tab Biotin' }] });
    expect(medicineList()).toEqual(['Tab Biotin']);
  });

  it('shows a legacy name-only medicine once in full details', async () => {
    const user = await open({ id: 'legacy', prescriptionItems: [{ name: 'Sunscreen SPF 50' }] });
    await user.click(screen.getByRole('button', { name: 'Full details' }));
    expect(screen.getAllByText('Sunscreen SPF 50')).toHaveLength(1);
  });

  it('lists free-text topicals when there are no structured items', async () => {
    await open({ id: 'free', plan: { dermatology: { medications: { topicals: 'Adapalene gel\nSunscreen' } } } });
    expect(medicineList()).toEqual(['Adapalene gel', 'Sunscreen']);
  });

  it('opens full details directly when the visit has nothing for a compact view', async () => {
    await open({ id: 'vitals', vitals: { weight: 70 } });
    expect(screen.getByText('Vitals')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Full details|Compact view)$/ })).not.toBeInTheDocument();
  });

  it('defaultCollapsed false opens compact view when it has content', () => {
    render(<PatientHistoryVisitCard defaultCollapsed={false} visit={rxVisit} />);
    expect(screen.getByRole('heading', { name: 'Medicines' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full details' })).toBeInTheDocument();
  });

  it('falls through an empty prescriptionItems array to the legacy prescription.items JSON', async () => {
    await open({ id: 'l', prescriptionItems: [], prescription: { items: JSON.stringify([{ drugName: 'Isotretinoin' }]) } });
    expect(medicineList()).toEqual(['Isotretinoin']);
    expect(screen.getByText('1 Rx Items')).toBeInTheDocument();
  });

  it('hiding from full details returns to summary and reopens compact', async () => {
    const user = await open(rxVisit);
    await user.click(screen.getByRole('button', { name: 'Full details' }));
    await user.click(screen.getByRole('button', { name: /hide details/i }));
    expect(screen.queryByRole('heading', { name: 'Medicines' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.getByRole('heading', { name: 'Medicines' })).toBeInTheDocument();
  });

  it('lists a medicine once when names differ only by case or spacing', async () => {
    await open({ id: 'dup', prescriptionItems: [{ drugName: 'Cetirizine' }, { drugName: ' cetirizine ' }, { drugName: 'CETIRIZINE' }] });
    expect(medicineList()).toEqual(['Cetirizine']);
  });
});
