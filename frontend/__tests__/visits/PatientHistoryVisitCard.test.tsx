import { render, screen } from '@testing-library/react';
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

    expect(screen.getByText('Vitals')).toBeInTheDocument();
    expect(screen.getByText('Prescription Items')).toBeInTheDocument();

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
  expect(screen.getByText('September 2, 2026')).toBeInTheDocument();
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
  expect(screen.getByText('Diabetes').parentElement).toHaveTextContent('No');
  expect(screen.getByText('Hypertension').parentElement).toHaveTextContent('Yes');
  expect(screen.getByText('Itch Score').parentElement).toHaveTextContent('0');
  expect(screen.getByText('Custom Observation').parentElement).toHaveTextContent('Complete multiline detail');
  for (const text of ['Selected diagnosis', 'Lab annotation', 'Saved drug', 'Thin layer', 'Saved instructions', 'Prescription valid until']) expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open visit photo 2' })).toHaveAttribute('href', '/api/visits/v/photos/two');
});
