import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SmartProceduresPage from '@/app/dashboard/procedures/page';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: {
  getPatients: jest.fn(), getUsers: jest.fn(), get: jest.fn(), createVisit: jest.fn(),
} }));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

it('saves a valid visit and retains the selected therapist in the procedure', async () => {
  const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
  jest.mocked(apiClient.getPatients).mockResolvedValue({ patients: [{ id: 'patient', name: 'Patient' }] } as any);
  jest.mocked(apiClient.getUsers).mockImplementation(async (query: any) => ({
    users: query.role === 'DOCTOR' ? [{ id: 'doctor', firstName: 'Doctor' }] : [{ id: 'nurse', firstName: 'Nurse' }],
  }) as any);
  jest.mocked(apiClient.get).mockResolvedValue({ visits: [] } as any);
  jest.mocked(apiClient.createVisit).mockResolvedValue({} as any);

  render(<SmartProceduresPage />);
  await screen.findByText('Patient');
  fireEvent.click(screen.getByRole('button', { name: /Endymed Pro Max/i }));
  fireEvent.click(screen.getByRole('button', { name: /Save Procedure/i }));

  await waitFor(() => expect(apiClient.createVisit).toHaveBeenCalledWith(expect.objectContaining({
    patientId: 'patient', doctorId: 'doctor', complaints: [],
    treatmentPlan: expect.objectContaining({ dermatology: expect.objectContaining({
      procedures: [expect.objectContaining({ therapistId: 'nurse', machine: 'endymed-pro-max' })],
    }) }),
  })));
  alert.mockRestore();
});
