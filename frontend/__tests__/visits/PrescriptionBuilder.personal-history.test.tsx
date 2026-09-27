import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn().mockResolvedValue({}),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }),
  getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

beforeEach(() => { localStorage.clear(); jest.mocked(apiClient.get).mockReset().mockResolvedValue({}); });

it('loads saved personal history for a new visit and sends it to the visit saver', async () => {
  jest.mocked(apiClient.get).mockImplementation(async url => url.endsWith('/personal-history') ? { personalHistory: 'Diet, sleep and products' } : {});
  const onClinicalDataChange = jest.fn();
  render(<PrescriptionBuilder patientId="patient" visitId={null} doctorId="doctor" onClinicalDataChange={onClinicalDataChange} />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Personal history' })).toHaveValue('Diet, sleep and products'));
  expect(onClinicalDataChange).toHaveBeenLastCalledWith(expect.objectContaining({ history: { personalHistory: 'Diet, sleep and products' } }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Personal history' }), { target: { value: 'Updated occupation\nNew sunscreen' } });
  expect(onClinicalDataChange).toHaveBeenLastCalledWith(expect.objectContaining({ history: { personalHistory: 'Updated occupation\nNew sunscreen' } }));
  await waitFor(() => expect(JSON.parse(localStorage.getItem('rxDraft:patient:standalone')!).personalHistory).toBe('Updated occupation\nNew sunscreen'));
});

it.each([false, true])('reopens the visit snapshot (legacy string JSON: %j)', async legacy => {
  const history = { personalHistory: 'Saved snapshot', pastHistory: 'Keep past history' };
  jest.mocked(apiClient.get).mockImplementation(async url => url === '/visits/saved' ? { history: legacy ? JSON.stringify(history) : history } : {});
  const onClinicalDataChange = jest.fn();
  render(<PrescriptionBuilder patientId="patient" visitId="saved" doctorId="doctor" onClinicalDataChange={onClinicalDataChange} />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Personal history' })).toHaveValue('Saved snapshot'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Personal history' }), { target: { value: '' } });
  expect(onClinicalDataChange).toHaveBeenLastCalledWith(expect.objectContaining({ history: { personalHistory: '', pastHistory: 'Keep past history' } }));
  expect(jest.mocked(apiClient.get).mock.calls.some(([url]) => url.endsWith('/personal-history'))).toBe(false);
});

it.each(['Recovered draft', ''])('retains the draft value %j over the patient default', async personalHistory => {
  localStorage.setItem('rxDraft:patient:standalone', JSON.stringify({ personalHistory }));
  jest.mocked(apiClient.get).mockImplementation(async url => url.endsWith('/personal-history') ? { personalHistory: 'Previous visit' } : {});
  const onClinicalDataChange = jest.fn();
  render(<PrescriptionBuilder patientId="patient" visitId={null} doctorId="doctor" onClinicalDataChange={onClinicalDataChange} />);
  await act(async () => {});
  expect(screen.getByRole('textbox', { name: 'Personal history' })).toHaveValue(personalHistory);
  expect(onClinicalDataChange).toHaveBeenLastCalledWith(expect.objectContaining({ history: { personalHistory } }));
});

it('does not overwrite typing with a late patient history response', async () => {
  let resolveHistory!: (value: any) => void;
  jest.mocked(apiClient.get).mockImplementation(url => url.endsWith('/personal-history') ? new Promise(resolve => { resolveHistory = resolve; }) : Promise.resolve({}));
  render(<PrescriptionBuilder patientId="patient" visitId={null} doctorId="doctor" />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Personal history' }), { target: { value: 'Doctor is typing' } });
  await act(async () => { resolveHistory({ personalHistory: 'Old value' }); });
  expect(screen.getByRole('textbox', { name: 'Personal history' })).toHaveValue('Doctor is typing');
});

it('keeps each patient and saved visit in its own personal history context', async () => {
  jest.mocked(apiClient.get).mockImplementation(async url => ({ history: { personalHistory: url === '/visits/first' ? 'First patient' : 'Second patient' } }));
  const { rerender } = render(<PrescriptionBuilder patientId="first-patient" visitId="first" doctorId="doctor" />);
  await screen.findByDisplayValue('First patient');
  rerender(<PrescriptionBuilder patientId="second-patient" visitId="second" doctorId="doctor" />);
  await screen.findByDisplayValue('Second patient');
  expect(screen.getByRole('textbox', { name: 'Personal history' })).not.toHaveValue('First patient');
});
