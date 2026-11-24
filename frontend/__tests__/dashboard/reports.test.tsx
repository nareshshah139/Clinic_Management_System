import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportsPage from '@/app/dashboard/reports/page';
import { apiClient } from '@/lib/api';
import { REPORT_EXPORT_TYPE, averageAgeFromBrackets } from '@/lib/reports-model';

const toast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

jest.mock('@/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    getRevenueReport: jest.fn(),
    getPatientReport: jest.fn(),
    getDoctorReport: jest.fn(),
  },
}));

const api = apiClient as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({});
  api.getRevenueReport.mockResolvedValue({ totalRevenue: 1000, totalGst: 0, netRevenue: 1000, totalInvoices: 2 });
  api.getPatientReport.mockResolvedValue({ totalPatients: 0, newPatients: 0, returningPatients: 0, ageGroupBreakdown: [] });
  api.getDoctorReport.mockResolvedValue({ totalDoctors: 0, activeDoctors: 0 });
  api.post.mockResolvedValue({});
});

describe('report export type mapping', () => {
  it('maps every tab to the singular backend enum', () => {
    expect(REPORT_EXPORT_TYPE).toEqual({
      revenue: 'REVENUE',
      patients: 'PATIENT',
      doctors: 'DOCTOR',
      appointments: 'APPOINTMENT',
      inventory: 'INVENTORY',
      payments: 'PAYMENT',
    });
  });

  it('exports the Patients tab as PATIENT and can pick CSV repeatedly', async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);
    await user.click(screen.getByRole('tab', { name: /Patients/ }));
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getAllByRole('button', { name: 'Export report' })[0]);
      await user.click(await screen.findByRole('menuitem', { name: 'CSV' }));
    }
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post).toHaveBeenLastCalledWith('/reports/export', expect.objectContaining({ reportType: 'PATIENT', exportFormat: 'CSV' }));
  });

  it('shows a message when the export fails', async () => {
    api.post.mockRejectedValue(new Error('Boom'));
    const user = userEvent.setup();
    render(<ReportsPage />);
    await user.click(screen.getAllByRole('button', { name: 'Export report' })[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'PDF' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not export the report', description: 'Boom' })));
  });
});

describe('patient average age', () => {
  it('shows a dash with no patients', async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);
    await user.click(screen.getByRole('tab', { name: /Patients/ }));
    await screen.findByText('Avg Age');
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('NaN')).not.toBeInTheDocument();
  });

  it('uses bracket midpoints over only the patients with a known age', () => {
    expect(averageAgeFromBrackets([{ ageGroup: '18-30', count: 2 }, { ageGroup: '46-60', count: 2 }])).toBe(39);
    expect(averageAgeFromBrackets([])).toBeNull();
    expect(averageAgeFromBrackets(undefined)).toBeNull();
  });
});

describe('load failures', () => {
  it('shows an error with Retry, not stale numbers, when the range changes and loading fails', async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);
    expect((await screen.findAllByText(/1,000/)).length).toBeGreaterThan(0);
    api.getRevenueReport.mockRejectedValue(Object.assign(new Error('down'), { status: 500 }));
    const from = screen.getAllByLabelText('From date')[0];
    await user.clear(from);
    await user.type(from, '2026-01-01');
    expect(await screen.findByText('Could not load this report')).toBeInTheDocument();
    expect(screen.queryByText(/1,000/)).not.toBeInTheDocument();
    api.getRevenueReport.mockResolvedValue({ totalRevenue: 1000, totalGst: 0, netRevenue: 1000, totalInvoices: 2 });
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect((await screen.findAllByText(/1,000/)).length).toBeGreaterThan(0);
  });

  it('explains a 403', async () => {
    api.getRevenueReport.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    render(<ReportsPage />);
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });
});
