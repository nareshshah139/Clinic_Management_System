import { render, screen } from '@testing-library/react';
import LastVisitPanel from '@/components/patients/LastVisitPanel';

const visit = (day: string, extra: Record<string, unknown> = {}) => ({
  id: `visit-${day}`,
  entryType: 'visit',
  createdAt: `${day}T05:00:00.000Z`,
  doctor: { firstName: 'Priya', lastName: 'Menon' },
  complaints: [{ complaint: 'Follow-up for chemical peel' }],
  diagnosis: [{ diagnosis: 'Post-inflammatory hyperpigmentation' }],
  plan: { notes: 'Review in 3 weeks. Sun protection advised.' },
  ...extra,
});
const rx = [{ drugName: 'Adapalene Gel 0.1% 15g' }, { drugName: 'Cetirizine 10mg Tablet' }];

describe('LastVisitPanel', () => {
  it('shows date, complaint, diagnosis, medicines and review advice without a click', () => {
    render(<LastVisitPanel loading={false} error={null} entries={[visit('2026-11-13', { prescriptionItems: rx })]} />);
    expect(screen.getByText('13 Nov 2026 · Dr. Priya Menon')).toBeInTheDocument();
    expect(screen.getByText('Follow-up for chemical peel')).toBeInTheDocument();
    expect(screen.getByText('Post-inflammatory hyperpigmentation')).toBeInTheDocument();
    expect(screen.getByText('Adapalene Gel 0.1% 15g, Cetirizine 10mg Tablet')).toBeInTheDocument();
    expect(screen.getByText('Review in 3 weeks. Sun protection advised.')).toBeInTheDocument();
    expect(screen.queryByText('Last prescription')).not.toBeInTheDocument();
  });

  it('says no medicines were prescribed and shows the last prescription from an earlier visit under it', () => {
    render(<LastVisitPanel loading={false} error={null} entries={[visit('2026-11-13'), visit('2026-09-29', { prescriptionItems: rx })]} />);
    expect(screen.getByText('No medicines prescribed')).toBeInTheDocument();
    expect(screen.getByText('Last prescription')).toBeInTheDocument();
    expect(screen.getByText('29 Sep 2026: Adapalene Gel 0.1% 15g, Cetirizine 10mg Tablet')).toBeInTheDocument();
  });

  it('says no medicines were prescribed when no visit has any', () => {
    render(<LastVisitPanel loading={false} error={null} entries={[visit('2026-11-13')]} />);
    expect(screen.getByText('No medicines prescribed')).toBeInTheDocument();
    expect(screen.queryByText('Last prescription')).not.toBeInTheDocument();
  });

  it('skips appointments that have no visit record', () => {
    const appointment = { id: 'appointment:a1', entryType: 'appointment', createdAt: '2026-11-20T05:00:00.000Z', complaints: [], diagnosis: [] };
    render(<LastVisitPanel loading={false} error={null} entries={[appointment, visit('2026-11-13')]} />);
    expect(screen.getByText(/^13 Nov 2026/)).toBeInTheDocument();
  });

  it('says there are no visits yet', () => {
    render(<LastVisitPanel loading={false} error={null} entries={[]} />);
    expect(screen.getByText('No visits yet.')).toBeInTheDocument();
  });

  it('shows the error instead of a blank panel', () => {
    render(<LastVisitPanel loading={false} error="Network down" entries={[]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the last visit. Network down');
  });
});
