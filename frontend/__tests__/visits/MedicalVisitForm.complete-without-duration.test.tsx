import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn(), getPatient: jest.fn().mockResolvedValue({ id: 'p', name: 'Synthetic patient' }),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getAllPatientVisitHistory: jest.fn().mockResolvedValue([]), getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
  getVisits: jest.fn().mockResolvedValue({ visits: [] }), getPrescriptions: jest.fn().mockResolvedValue({ prescriptions: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }), getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]), updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn(), createPrescription: jest.fn(), updatePrescription: jest.fn(),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/components/visits/VisitPhotos', () => function Photos() { return null; });
jest.mock('@/components/tours/DoctorTour', () => ({ DoctorTour: () => null }));

jest.setTimeout(60_000);
beforeEach(() => {
  localStorage.clear(); jest.clearAllMocks();
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => url === '/visits/v'
    ? { id: 'v', patientId: 'p', doctorId: 'd', version: 1, status: 'IN_PROGRESS', complaints: [], diagnosis: [], history: {}, plan: {}, exam: {} }
    : url.includes('autocomplete') ? [] : {});
  (apiClient.updateVisit as jest.Mock).mockResolvedValue({ id: 'v', version: 2, status: 'IN_PROGRESS' });
  (apiClient.createPrescription as jest.Mock).mockResolvedValue({ id: 'rx', visit: { id: 'v', version: 3, status: 'IN_PROGRESS' } });
  (apiClient.completeVisit as jest.Mock).mockResolvedValue({ id: 'v', status: 'COMPLETED', version: 4 });
});

it('completes a visit whose medicine has no duration, saving the prescription without an invalid duration', async () => {
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />);
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Consultation' }), { button: 0, ctrlKey: false });
  await screen.findByRole('textbox', { name: 'Diagnosis' });
  fireEvent.click(await screen.findByRole('button', { name: 'Add Row' }));
  fireEvent.change((await screen.findAllByPlaceholderText('Search medicine name...'))[0], { target: { value: 'ZYTEE GEL' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Chief complaints' }), { target: { value: 'Itchy rash on forearms' } });
  const complete = screen.getByRole('button', { name: 'Complete Visit' });
  await waitFor(() => expect(complete).toBeEnabled());

  await act(async () => { fireEvent.click(complete); });

  await waitFor(() => expect(apiClient.completeVisit).toHaveBeenCalledWith('v', expect.anything(), expect.anything()));
  const [payload] = (apiClient.createPrescription as jest.Mock).mock.calls[0];
  expect(payload.items).toHaveLength(1);
  expect(payload.items[0]).toMatchObject({ drugName: 'ZYTEE GEL' });
  expect(payload.items[0].duration).toBeUndefined();
});
