import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProceduresPage from '@/app/dashboard/procedures/page';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: {
  getPatients: jest.fn(), getUsers: jest.fn(), get: jest.fn(), createVisit: jest.fn(),
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
  jest.mocked(apiClient.createVisit).mockResolvedValue({} as any);

  render(<ProceduresPage />);
  fireEvent.click((await screen.findAllByRole('combobox'))[0]);
  fireEvent.click(await screen.findByRole('option', { name: 'Patient' }));
  fireEvent.click(screen.getAllByRole('combobox')[1]);
  fireEvent.click(await screen.findByRole('option', { name: /Dr\. Doctor/ }));
  fireEvent.click(screen.getAllByRole('combobox')[2]);
  fireEvent.click(await screen.findByRole('option', { name: /Nurse/ }));
  fireEvent.click(screen.getByRole('button', { name: /Endymed Pro Max/i }));
  fireEvent.click(screen.getByRole('button', { name: /Save Procedure/i }));

  await waitFor(() => expect(apiClient.createVisit).toHaveBeenCalledWith(expect.objectContaining({
    patientId: 'patient', doctorId: 'doctor', complaints: [],
    treatmentPlan: expect.objectContaining({ dermatology: expect.objectContaining({
      procedures: [expect.objectContaining({ therapistId: 'nurse', machine: 'endymed-pro-max' })],
    }) }),
  })));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ variant: 'success', title: 'Procedure saved' }));
});
