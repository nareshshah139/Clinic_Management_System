import { render, screen } from '@testing-library/react';
import ReportsPage from './page';
import { apiClient } from '@/lib/api';

jest.mock('@/components/common/QuickGuide', () => ({ QuickGuide: () => null }));
jest.mock('@/lib/api', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), getRevenueReport: jest.fn(), getPatientReport: jest.fn(), getDoctorReport: jest.fn() },
}));

const api = apiClient as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-11T19:00:00.000Z'), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'nextTick', 'setImmediate', 'queueMicrotask'] });
  api.get.mockResolvedValue({ counts: {} });
  api.getRevenueReport.mockResolvedValue({
    totalRevenue: 6000, totalGst: 0, netRevenue: 6000, totalInvoices: 7,
    paymentBreakdown: [
      { mode: 'CASH', amount: 4700, percentage: 78.3, transactionCount: 4 },
      { mode: 'NET_BANKING', amount: 800, percentage: 13.3, transactionCount: 1 },
      { mode: 'CHEQUE', amount: 500, percentage: 8.3, transactionCount: 1 },
    ],
  });
});

afterEach(() => jest.useRealTimers());

it('opens on the 30 clinic days up to today in India, even after midnight IST when UTC is still on the day before', async () => {
  render(<ReportsPage />);

  const total = (await screen.findByText('Total Revenue')).parentElement!.parentElement!;
  expect(total.textContent).toBe('Total Revenue₹6,000.00');
  expect(api.getRevenueReport.mock.calls[0][0]).toEqual({ startDate: '2026-10-13', endDate: '2026-11-12', includePaymentBreakdown: true });
  expect(screen.getByText('Report for 13 Oct 2026 to 12 Nov 2026')).toBeInTheDocument();
});

it('names net banking and cheque payments the way the desk does', async () => {
  render(<ReportsPage />);

  await screen.findByText('Payment Mode Breakdown');
  expect(screen.getAllByText(/^(CASH|NET_BANKING|CHEQUE|Cash|Net banking \/ NEFT|Cheque)$/).map((el) => el.textContent)).toEqual(['Cash', 'Net banking / NEFT', 'Cheque']);
  expect(screen.getAllByText(/^\d+ transactions?$/).map((el) => el.textContent)).toEqual(['4 transactions', '1 transaction', '1 transaction']);
});
