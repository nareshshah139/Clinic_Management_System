import { render, screen, waitFor, within } from '@testing-library/react';
import { Sidebar } from '@/components/layout/sidebar';
import { apiClient } from '@/lib/api';

let mockRole = 'NURSE';
jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ prefetch: jest.fn() }) }));
jest.mock('@/components/layout/dashboard-user-context', () => ({
  useDashboardUser: () => ({ user: { id: 'u', firstName: 'Asha', lastName: 'Rao', role: mockRole }, logout: jest.fn(), loading: false }),
}));
jest.mock('@/lib/api', () => ({
  apiClient: { getMyProcedureAccess: jest.fn(), getInventoryItemRequestPendingCount: jest.fn(async () => ({ count: 0 })) },
}));

const proceduresLink = () =>
  within(screen.getByRole('navigation', { name: 'Main navigation' })).queryByRole('link', { name: 'Procedures' });

beforeEach(() => jest.clearAllMocks());

describe('Procedures in the main menu', () => {
  it.each(['OWNER', 'ADMIN', 'DOCTOR', 'MANAGER'])('is always offered to %s, who can view procedures', (role) => {
    mockRole = role;
    render(<Sidebar />);
    expect(proceduresLink()).toHaveAttribute('href', '/dashboard/procedures');
    expect(apiClient.getMyProcedureAccess).not.toHaveBeenCalled();
  });

  it('is offered to a nurse once nurses may record procedures', async () => {
    mockRole = 'NURSE';
    jest.mocked(apiClient.getMyProcedureAccess).mockResolvedValue({ canRecord: true, canConfigure: false });
    render(<Sidebar />);
    await waitFor(() => expect(proceduresLink()).toHaveAttribute('href', '/dashboard/procedures'));
  });

  it('is not offered to a nurse while only doctors may record', async () => {
    mockRole = 'NURSE';
    jest.mocked(apiClient.getMyProcedureAccess).mockResolvedValue({ canRecord: false, canConfigure: false });
    render(<Sidebar />);
    await waitFor(() => expect(apiClient.getMyProcedureAccess).toHaveBeenCalledTimes(1));
    expect(proceduresLink()).toBeNull();
  });

  it.each(['RECEPTION', 'PHARMACIST', 'ACCOUNTANT'])('is never offered to %s', (role) => {
    mockRole = role;
    render(<Sidebar />);
    expect(proceduresLink()).toBeNull();
    expect(apiClient.getMyProcedureAccess).not.toHaveBeenCalled();
  });
});
