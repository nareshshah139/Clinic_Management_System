import { cleanup, render, screen } from '@testing-library/react';
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

it('renders every clinical field when expanded and uses the appointment day', () => {
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
  const rxVisit = {
    id: 'v1',
    createdAt: '2026-09-01T13:00:00Z',
    complaints: [{ complaint: 'Itchy scalp' }],
    diagnosis: [{ diagnosis: 'Dandruff' }],
    history: { personalHistory: 'Vegetarian diet', familyHistory: { dm: false, htn: true, others: 'Psoriasis' } },
    plan: { dermatology: { medicationPlan: [
      { drugName: 'Ketoconazole', dosePattern: '1-0-1', regimenState: { touched: ['frequency'] } },
      { drugName: 'Minoxidil', frequency: 'TWICE_DAILY' },
    ] } },
    prescriptionItems: [
      { drugName: 'Ketoconazole', dosePattern: '1-0-1', frequency: 'TWICE_DAILY', gstRate: 12, regimenState: { touched: ['frequency'] }, instructions: 'timing duration instructions' },
      { drugName: 'Minoxidil', dosePattern: '1-0-1', frequency: 'TWICE_DAILY', gstRate: 5 },
    ],
    prescriptionMeta: { language: 'en', followUpInstructions: 'Review in 2 weeks' },
  };
  const open = async (visit: Record<string, unknown>) => {
    const user = userEvent.setup();
    render(<PatientHistoryVisitCard visit={visit} footerActions={<button type="button">Edit visit</button>} />);
    await user.click(screen.getByRole('button', { name: /show details/i }));
    return user;
  };

  it('keeps history and medicines hidden until details are opened', () => {
    render(<PatientHistoryVisitCard visit={rxVisit} />);
    expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Medicines' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show details/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('compact view lists complaint, history and each medicine name once without regimen detail', async () => {
    await open(rxVisit);
    expect(screen.getByText('Itchy scalp')).toBeInTheDocument();
    expect(screen.getByText('Vegetarian diet')).toBeInTheDocument();
    expect(screen.getByText('Hypertension; Psoriasis')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ketoconazole', 'Minoxidil']);
    for (const text of ['1-0-1', 'TWICE_DAILY', 'Regimen State', 'Touched', 'Gst Rate', 'Language', 'Treatment plan']) {
      expect(screen.queryByText(new RegExp(text, 'i'))).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/timing/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit visit' })).toBeInTheDocument();
  });

  it('full details shows the prescription once with regimen and no internal fields', async () => {
    const user = await open(rxVisit);
    const toggle = screen.getByRole('button', { name: 'Full details' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(screen.getAllByText('1-0-1').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('heading', { name: 'Prescription' })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Prescription Items' })).not.toBeInTheDocument();
    expect(screen.queryByText('Saved medication plan')).not.toBeInTheDocument();
    expect(screen.getAllByText('Ketoconazole')).toHaveLength(1);
    for (const text of ['Regimen State', 'Touched', 'Gst Rate', 'Language']) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Edit visit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compact view' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('lists names for a draft visit that only has a medication plan', async () => {
    await open({ id: 'd', plan: { dermatology: { medicationPlan: [{ drugName: 'Adapalene' }, { name: 'Clindamycin' }] } } });
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Adapalene', 'Clindamycin']);
  });

  it('lists names from a legacy prescription.items JSON string', async () => {
    await open({ id: 'l', prescription: { items: JSON.stringify([{ drugName: 'Isotretinoin' }]) } });
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Isotretinoin']);
  });

  it('shows legacy string history under History', async () => {
    await open({ id: 'h', history: 'Longstanding eczema since childhood' });
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByText('Longstanding eczema since childhood')).toBeInTheDocument();
  });

  it('shows neither heading when there is no history and no medicines', async () => {
    render(<PatientHistoryVisitCard visit={{ id: 'e', complaints: [{ complaint: 'Rash' }] }} footerActions={<span>Actions</span>} />);
    await userEvent.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Medicines' })).not.toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('hiding from full details returns to summary and reopens compact', async () => {
    const user = await open(rxVisit);
    await user.click(screen.getByRole('button', { name: 'Full details' }));
    await user.click(screen.getByRole('button', { name: /hide details/i }));
    expect(screen.queryByRole('button', { name: 'Compact view' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Medicines' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.getByRole('heading', { name: 'Medicines' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full details' })).toBeInTheDocument();
  });

  it('lists a medicine once when names differ only by case or spacing', async () => {
    await open({ id: 'dup', prescriptionItems: [{ drugName: 'Cetirizine' }, { drugName: ' cetirizine ' }, { drugName: 'CETIRIZINE' }] });
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Cetirizine']);
  });

  it('offers Full details only when it would reveal more than the compact view', async () => {
    await open({ id: 'meds-only', prescriptionItems: [{ drugName: 'Cetirizine', dosePattern: '0-0-1' }] });
    expect(screen.getByRole('button', { name: 'Full details' })).toBeInTheDocument();
    cleanup();
    await open({ id: 'actions-only' });
    expect(screen.getByRole('button', { name: 'Edit visit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Full details' })).not.toBeInTheDocument();
  });
});
