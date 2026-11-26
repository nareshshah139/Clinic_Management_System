import { act, fireEvent, render, screen } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), getPatient: jest.fn(), getPatientVisitHistory: jest.fn(), getAllPatientVisitHistory: jest.fn(), getVisits: jest.fn(), updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn() } }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
let prescriptionNeedsVisit: () => Promise<string>;
let photosNeedVisit: () => Promise<string>;
jest.mock('@/components/visits/PrescriptionBuilder', () => function Editor({ ensureVisitId }: any) { prescriptionNeedsVisit = ensureVisitId; return null; });
jest.mock('@/components/visits/VisitPhotos', () => function Photos({ onVisitNeeded }: any) { photosNeedVisit = onVisitNeeded; return null; });
jest.mock('@/components/tours/DoctorTour', () => ({ DoctorTour: () => null }));

const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const created = { id: 'new-visit', version: 0 };

beforeEach(() => {
  jest.clearAllMocks(); localStorage.clear();
  (apiClient.getPatient as jest.Mock).mockResolvedValue({ id: 'p', name: 'Synthetic Patient' });
  (apiClient.getPatientVisitHistory as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.getAllPatientVisitHistory as jest.Mock).mockResolvedValue([]);
  (apiClient.getVisits as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.updateVisit as jest.Mock).mockResolvedValue({ id: 'new-visit', version: 1 });
});

async function openBlankForm(props: Record<string, unknown> = {}) {
  render(<MedicalVisitForm patientId="p" doctorId="d" userRole="ADMIN" {...props} />);
  await flush();
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Photos' }), { button: 0 });
  await flush();
}

it('creates one visit when a save, a prescription and a photo all need it at once', async () => {
  const finishers: Array<(visit: unknown) => void> = [];
  (apiClient.createVisit as jest.Mock).mockImplementation(() => new Promise((resolve) => { finishers.push(resolve); }));
  await openBlankForm();
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  const prescription = prescriptionNeedsVisit();
  const photo = photosNeedVisit();
  await flush();
  await act(async () => { finishers.forEach((finish) => finish(created)); });
  await expect(prescription).resolves.toBe('new-visit');
  await expect(photo).resolves.toBe('new-visit');
  expect(apiClient.createVisit).toHaveBeenCalledTimes(1);
});

it('creates the visit again on the next save when the first attempt failed', async () => {
  (apiClient.createVisit as jest.Mock).mockRejectedValueOnce(new Error('Synthetic network failure')).mockResolvedValue(created);
  await openBlankForm();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })); });
  expect(apiClient.createVisit).toHaveBeenCalledTimes(2);
});

it('asks the server for a separate visit only when the clinic chose one', async () => {
  (apiClient.createVisit as jest.Mock).mockResolvedValue(created);
  await openBlankForm({ startSeparate: true });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })); });
  expect(apiClient.createVisit).toHaveBeenCalledWith(expect.objectContaining({ startSeparate: true }), expect.anything());
  await act(async () => { await prescriptionNeedsVisit(); });
  expect(apiClient.createVisit).toHaveBeenCalledTimes(1);
});

it.each([
  ['Save Draft', async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })); }); }],
  ['a prescription', async () => { await act(async () => { await prescriptionNeedsVisit(); }); }],
  ['a photo', async () => { await act(async () => { await photosNeedVisit(); }); }],
])('does not ask for a separate visit through %s by default', async (_name, act_) => {
  (apiClient.createVisit as jest.Mock).mockResolvedValue(created);
  await openBlankForm();
  await act_();
  expect(apiClient.createVisit).toHaveBeenCalledTimes(1);
  expect((apiClient.createVisit as jest.Mock).mock.calls[0][0]).not.toHaveProperty('startSeparate');
});
