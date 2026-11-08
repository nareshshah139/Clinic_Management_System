import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn().mockResolvedValue({}), getPatient: jest.fn().mockResolvedValue({}),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getAllPatientVisitHistory: jest.fn().mockResolvedValue([]), getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
  getPrescriptions: jest.fn().mockResolvedValue({ prescriptions: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }),
  getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]),
  createPrescription: jest.fn().mockResolvedValue({ id: 'rx-1' }),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
beforeEach(() => localStorage.clear());

it('keeps the doctor on the visit after saving and says the prescription went to the pharmacy queue', async () => {
  localStorage.setItem('rxDraft:patient-1:visit-1', JSON.stringify({
    items: [{ drugName: 'Doxycycline 100 mg', dosage: 100, dosageUnit: 'MG', frequency: 'ONCE_DAILY', duration: 28, durationUnit: 'DAYS' }],
  }));
  render(<PrescriptionBuilder patientId="patient-1" visitId="visit-1" doctorId="doctor-1" />);

  const save = await screen.findByRole('button', { name: 'Create Prescription' });
  await waitFor(() => expect(save).toBeEnabled());
  expect(screen.queryByText('Sent to pharmacy queue')).toBeNull();

  fireEvent.click(save);

  expect(await screen.findByText('Sent to pharmacy queue')).toBeInTheDocument();
  expect((apiClient.createPrescription as jest.Mock).mock.calls[0][0]).toMatchObject({ visitId: 'visit-1', patientId: 'patient-1' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('button', { name: /go to pharmacy/i })).toBeNull();
});
