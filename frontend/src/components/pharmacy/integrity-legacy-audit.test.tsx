import { render, screen, waitFor } from '@testing-library/react';
import { ComplianceCenter } from './ComplianceCenter';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn().mockResolvedValue(null), post: jest.fn() } }));

it('routes old audit users to versioned Counts without exposing or submitting retired adjustments', async () => {
  render(<ComplianceCenter />);
  const link = screen.getByRole('link', { name: 'Open Stock counts' });
  expect(link).toHaveAttribute('href', '/dashboard/inventory?area=stock&view=COUNT');
  expect(screen.queryByRole('button', { name: 'Apply Adjustments' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create Audit' })).not.toBeInTheDocument();
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(3));
  expect(apiClient.post).not.toHaveBeenCalled();
});

it.each([
  ['gst-summary', 'GST Summary', '/pharmacy/compliance/gst-summary'],
  ['monthly-report', 'Monthly Report', '/pharmacy/compliance/monthly-report'],
] as const)('renders and loads only the %s report when asked for one', async (report, title, endpoint) => {
  jest.mocked(apiClient.get).mockClear();
  render(<ComplianceCenter report={report} />);
  expect(await screen.findByText(title)).toBeInTheDocument();
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));
  expect(jest.mocked(apiClient.get).mock.calls[0][0]).toBe(endpoint);
  expect(screen.queryByText('Expiry Returns')).not.toBeInTheDocument();
  expect(screen.queryByText('Pharmacy Compliance')).not.toBeInTheDocument();
});
