import { render, screen, waitFor } from '@testing-library/react';
import ProceduresPage from '@/app/dashboard/procedures/page';
import { apiClient } from '@/lib/api';
import { resolveDefaultDoctorId } from '@/lib/default-visit-doctor';

jest.mock('@/lib/api', () => ({
  apiClient: {
    getPatients: jest.fn(),
    getUsers: jest.fn(),
    get: jest.fn(),
  },
}));
jest.mock('@/components/common/QuickGuide', () => ({ QuickGuide: () => null }));

describe('ProceduresPage defaults', () => {
  beforeEach(() => {
    jest.mocked(apiClient.getPatients).mockResolvedValue({ data: [{ id: 'p1', name: 'First Patient' }] } as any);
    jest.mocked(apiClient.getUsers).mockResolvedValue({ users: [{ id: 'u1', firstName: 'Ann', lastName: 'Nurse' }] } as any);
    jest.mocked(apiClient.get).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' } as any);
  });

  it('opens with no patient selected', async () => {
    render(<ProceduresPage />);
    await waitFor(() => expect(apiClient.getPatients).toHaveBeenCalled());
    const patient = screen.getAllByRole('combobox')[0];
    expect(patient).toHaveTextContent('Select patient');
    expect(patient).not.toHaveTextContent('First Patient');
  });
});

describe('resolveDefaultDoctorId', () => {
  it('uses the signed-in user when they are a doctor', () => {
    expect(resolveDefaultDoctorId({ role: 'DOCTOR', userId: 'me', current: '' })).toBe('me');
  });
  it('keeps an explicit choice', () => {
    expect(resolveDefaultDoctorId({ role: 'DOCTOR', userId: 'me', current: 'other' })).toBe('other');
  });
  it('stays empty for non-doctors', () => {
    expect(resolveDefaultDoctorId({ role: 'ADMIN', userId: 'a', current: '' })).toBe('');
  });
});
