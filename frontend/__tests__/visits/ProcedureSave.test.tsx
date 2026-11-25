import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProceduresPage from '@/app/dashboard/procedures/page';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: {
  getPatients: jest.fn(), getUsers: jest.fn(), get: jest.fn(), getMyProcedureAccess: jest.fn(), createProcedure: jest.fn(),
} }));
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

it('saves a valid visit and retains the selected therapist in the procedure', async () => {
  HTMLElement.prototype.scrollIntoView = jest.fn();
  jest.mocked(apiClient.getPatients).mockResolvedValue({ patients: [{ id: 'patient', name: 'Patient' }] } as any);
  jest.mocked(apiClient.getUsers).mockImplementation(async (query: any) => ({
    users: query.role === 'DOCTOR' ? [{ id: 'doctor', firstName: 'Doctor' }] : [{ id: 'nurse', firstName: 'Nurse' }],
  }) as any);
  jest.mocked(apiClient.get).mockResolvedValue({ visits: [] } as any);
  jest.mocked(apiClient.getMyProcedureAccess).mockResolvedValue({ canRecord: true, canConfigure: true });
  jest.mocked(apiClient.createProcedure).mockResolvedValue({} as any);

  render(<ProceduresPage />);
  fireEvent.change(await screen.findByLabelText('Patient *'), { target: { value: 'Pat' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Patient' }));
  fireEvent.click(screen.getByRole('combobox', { name: 'Doctor *' }));
  fireEvent.click(await screen.findByRole('option', { name: /Dr\. Doctor/ }));
  fireEvent.click(screen.getByRole('combobox', { name: 'Nurse/Therapist' }));
  fireEvent.click(await screen.findByRole('option', { name: /Nurse/ }));
  fireEvent.click(screen.getByRole('button', { name: /Endymed Pro Max/i }));
  fireEvent.click(screen.getByRole('button', { name: /Save Procedure/i }));

  await waitFor(() => expect(apiClient.createProcedure).toHaveBeenCalledWith(expect.objectContaining({
    patientId: 'patient', doctorId: 'doctor',
    treatmentPlan: expect.objectContaining({ dermatology: expect.objectContaining({
      procedures: [expect.objectContaining({ therapistId: 'nurse', machine: 'endymed-pro-max' })],
    }) }),
  })));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ variant: 'success', title: 'Procedure saved' }));
});
