import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DailyCollection from '@/components/billing/DailyCollection';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn() } }));
const report = (net: number) => ({ date: '2026-10-25', received: net, refunded: 0, net, paymentCount: 1, methods: [], entries: [{ id: '1', source: 'CLINIC', invoiceNumber: 'C1', patientName: 'Synthetic patient', billType: 'REVIEW', paidAt: '2026-10-25T05:00:00Z', method: 'CASH', amount: net }] });

it('shows only the newest selected day when responses finish out of order', async () => {
  let finishOld!: (value: unknown) => void;
  (apiClient.get as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockResolvedValueOnce(report(200));
  render(<DailyCollection />);
  fireEvent.change(screen.getByLabelText('Collection date'), { target: { value: '2026-10-24' } });
  await screen.findByText('Synthetic patient');
  await act(async () => { finishOld(report(999)); });
  expect(screen.queryByText(/999/)).not.toBeInTheDocument();
  expect(screen.getByText('Review')).toBeInTheDocument();
  expect(screen.getAllByText('₹200.00').length).toBeGreaterThan(0);
});

it('clears an old report and gives an actionable error on load failure', async () => {
  (apiClient.get as jest.Mock).mockResolvedValueOnce(report(200)).mockRejectedValueOnce(new Error('offline'));
  render(<DailyCollection />);
  await screen.findByText('Synthetic patient');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not load collections'));
  expect(screen.queryByText('Synthetic patient')).not.toBeInTheDocument();
});
