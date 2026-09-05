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
  for (const text of ['Second complaint', 'Two weeks', 'Second diagnosis', 'Trigger detail', 'Prior treatment', 'Exam detail', 'Final note', 'Follow-up instruction', 'Procedure detail', 'Topical detail', '1-0-1', 'Application detail', 'Prescription guidance', 'Temperature (°C): 37', 'SpO₂ (%): 98']) {
    expect(screen.getAllByText(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length).toBeGreaterThan(0);
  }
  expect(screen.getByText('September 2, 2026')).toBeInTheDocument();
});

it('labels an appointment without a visit and never offers to resume it as a visit', () => {
  render(<PatientHistoryVisitCard visit={{ id: 'appointment:a', entryType: 'appointment', appointment: { date: '2026-09-02' }, status: 'CANCELLED' }} onResume={() => {}} />);
  expect(screen.getByText(/no visit documentation recorded/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
});
