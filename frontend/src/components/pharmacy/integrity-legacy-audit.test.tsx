import { render, screen, waitFor } from '@testing-library/react';
import { ComplianceCenter } from './ComplianceCenter';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn().mockResolvedValue(null), post: jest.fn() } }));

it('routes old audit users to versioned Counts without exposing or submitting retired adjustments', async () => {
  render(<ComplianceCenter />);
  const link = screen.getByRole('link', { name: 'Open Counts & audit' });
  expect(link).toHaveAttribute('href', '/dashboard/inventory?area=stock&view=COUNT');
  expect(screen.queryByRole('button', { name: 'Apply Adjustments' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create Audit' })).not.toBeInTheDocument();
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(3));
  expect(apiClient.post).not.toHaveBeenCalled();
});
