import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn(), getPatient: jest.fn().mockResolvedValue({}),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getAllPatientVisitHistory: jest.fn().mockResolvedValue([]), getPatientVisitHistory: jest.fn(),
  getPrescriptions: jest.fn().mockResolvedValue({ prescriptions: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }),
  getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
const mockGet = apiClient.get as jest.Mock;
const mockHistory = apiClient.getPatientVisitHistory as jest.Mock;
const records = [{ id: 'old-rx', diagnosis: 'Acne vulgaris', items: [{ drugName: 'Synthetic cream', dosePattern: '0-0-1', duration: 7, durationUnit: 'DAYS' }] }];
beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  mockGet.mockImplementation((url: string) => Promise.resolve(url.startsWith('/prescriptions/doctor/') ? { prescriptions: records } : {}));
  mockHistory.mockResolvedValue({ visits: [] });
});
function mount() { return render(<PrescriptionBuilder patientId="synthetic" visitId={null} doctorId="doctor" />); }

it('uses examination diagnosis shortcuts and keeps Undo paused across source refresh until resumed', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'On Examination' }));
  fireEvent.click(screen.getByRole('button', { name: /^Acne vulgaris$/ }));
  await screen.findByText('Treatment assembled from live practice patterns.');
  fireEvent.click(screen.getByRole('button', { name: 'Undo autofill' }));
  await screen.findByText('Autofill paused for this diagnosis.');
  // A changed regimen must not silently undo the clinician’s pause decision.
  mockGet.mockImplementation((url: string) => Promise.resolve(url.startsWith('/prescriptions/doctor/') ? { prescriptions: [{ ...records[0], items: [{ ...records[0].items[0], duration: 14 }] }] } : {}));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh patterns' }));
  await waitFor(() => expect(mockHistory).toHaveBeenCalledTimes(2));
  await screen.findByText('Autofill paused for this diagnosis.');
  expect(screen.queryByRole('button', { name: 'Undo autofill' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Resume autofill' }));
  await screen.findByText('Treatment assembled from live practice patterns.');
});

it('can retry failed learning sources without leaving the editor', async () => {
  mockHistory.mockRejectedValue(new Error('offline'));
  mockGet.mockImplementation((url: string) => url.startsWith('/prescriptions/doctor/') ? Promise.reject(new Error('offline')) : Promise.resolve({}));
  mount();
  fireEvent.change(screen.getByPlaceholderText('e.g., Acne vulgaris'), { target: { value: 'Acne vulgaris' } });
  await screen.findAllByText('Could not load practice patterns right now.');
  mockHistory.mockResolvedValue({ visits: [] });
  mockGet.mockImplementation((url: string) => Promise.resolve(url.startsWith('/prescriptions/doctor/') ? { prescriptions: records } : {}));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh patterns' }));
  await screen.findByText('Treatment assembled from live practice patterns.');
});

it('offers partial matches for review without automatically adding medicines', async () => {
  mockGet.mockImplementation((url: string) => Promise.resolve(url.startsWith('/prescriptions/doctor/') ? { prescriptions: [{ ...records[0], diagnosis: 'Acne vulgaris, Psoriasis' }] } : {}));
  mount();
  fireEvent.change(screen.getByPlaceholderText('e.g., Acne vulgaris'), { target: { value: 'Acne vulgaris' } });
  await screen.findByText('Similar plan found. Review before applying.');
  expect(screen.getByText('Review suggested plan')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Undo autofill' })).not.toBeInTheDocument();
});

it('preserves a clinician-entered treatment when a matching plan arrives', async () => {
  localStorage.setItem('rxDraft:synthetic:standalone', JSON.stringify({ diagnosis: 'Acne vulgaris', items: [{ drugName: 'Doctor-entered medicine', frequency: 'ONCE_DAILY', duration: 3, durationUnit: 'DAYS' }] }));
  mount();
  await screen.findByText('Learned plan ready. Your manual edits were preserved.');
  expect(screen.queryByRole('button', { name: 'Undo autofill' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Fill missing only' })).toBeInTheDocument();
});

it('retains uncertainty markers from the actual diagnosis input', async () => {
  mount();
  fireEvent.change(screen.getByPlaceholderText('e.g., Acne vulgaris'), { target: { value: 'Acne?' } });
  await waitFor(() => expect(mockHistory).toHaveBeenCalled());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)); });
  expect(screen.queryByRole('button', { name: 'Undo autofill' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Apply learned plan' })).not.toBeInTheDocument();
});
