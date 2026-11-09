import { render, screen } from '@testing-library/react';
import { VisitIdentityBar } from '@/components/visits/VisitIdentityBar';

const doctor = { status: 'ready', record: { firstName: 'Praneeta', lastName: 'Jain' } } as const;

it('renders the full identity line', () => {
  render(
    <VisitIdentityBar
      patient={{ status: 'ready', record: { name: 'ABHILASH', age: 33, gender: 'FEMALE' } }}
      doctor={doctor}
      appointment={{ slot: '16:00-16:30', visitType: 'OPD' }}
    />,
  );
  expect(screen.getByTestId('visit-identity')).toHaveTextContent(
    'Patient: ABHILASH · 33 · Female · Doctor: Dr. Praneeta Jain · 16:00–16:30 · OPD',
  );
});

it('omits missing parts instead of printing Unknown or undefined', () => {
  render(
    <VisitIdentityBar
      patient={{ status: 'ready', record: { name: 'ABHILASH' } }}
      doctor={{ status: 'missing' }}
    />,
  );
  const text = screen.getByTestId('visit-identity').textContent;
  expect(text).toBe('Patient: ABHILASH');
});

it('shows a skeleton while loading', () => {
  render(<VisitIdentityBar patient={{ status: 'loading' }} doctor={{ status: 'loading' }} />);
  expect(screen.getByRole('status', { name: 'Loading patient' })).toBeInTheDocument();
  expect(screen.queryByTestId('visit-identity')).not.toBeInTheDocument();
});

it('shows a neutral placeholder when the patient has no record', () => {
  render(<VisitIdentityBar patient={{ status: 'missing' }} doctor={doctor} />);
  expect(screen.getByTestId('visit-identity')).toHaveTextContent('Patient: not available');
});
