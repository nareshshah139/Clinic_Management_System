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
  createPrescription: jest.fn().mockResolvedValue({ id: 'saved-rx' }),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

beforeEach(() => { localStorage.clear(); jest.clearAllMocks(); });

it('saves a medicine whose duration was left blank without sending an invalid zero', async () => {
  localStorage.setItem('rxDraft:synthetic:visit', JSON.stringify({
    items: [{ drugName: 'Synthetic moisturiser', dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: '', durationUnit: 'DAYS' }],
  }));
  render(<PrescriptionBuilder patientId="synthetic" visitId="visit" doctorId="doctor" />);
  await screen.findByRole('spinbutton', { name: 'Duration for Synthetic moisturiser' });
  fireEvent.click(screen.getByRole('button', { name: 'Create Prescription' }));
  await waitFor(() => expect(apiClient.createPrescription).toHaveBeenCalledTimes(1));
  const [payload] = (apiClient.createPrescription as jest.Mock).mock.calls[0];
  expect(payload.items).toHaveLength(1);
  expect(payload.items[0]).toMatchObject({ drugName: 'Synthetic moisturiser', frequency: 'ONCE_DAILY' });
  expect(payload.items[0].duration).toBeUndefined();
});

it('still sends the duration the doctor entered', async () => {
  localStorage.setItem('rxDraft:synthetic:visit', JSON.stringify({
    items: [{ drugName: 'Synthetic tablet', dosageUnit: 'MG', frequency: 'ONCE_DAILY', duration: 7, durationUnit: 'DAYS' }],
  }));
  render(<PrescriptionBuilder patientId="synthetic" visitId="visit" doctorId="doctor" />);
  await screen.findByRole('spinbutton', { name: 'Duration for Synthetic tablet' });
  fireEvent.click(screen.getByRole('button', { name: 'Create Prescription' }));
  await waitFor(() => expect(apiClient.createPrescription).toHaveBeenCalledTimes(1));
  expect((apiClient.createPrescription as jest.Mock).mock.calls[0][0].items[0]).toMatchObject({ duration: 7, durationUnit: 'DAYS' });
});
