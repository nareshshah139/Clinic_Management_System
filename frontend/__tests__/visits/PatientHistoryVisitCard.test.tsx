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
