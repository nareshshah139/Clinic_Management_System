import { act, fireEvent, render, screen } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), getPatient: jest.fn(), getPatientVisitHistory: jest.fn(), getAllPatientVisitHistory: jest.fn(), getVisits: jest.fn(), updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn() } }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/components/visits/PrescriptionBuilder', () => function Editor({ onClinicalDataChange }: any) {
  return <input aria-label="Clinical note" onChange={(e) => onClinicalDataChange({ history: { pastHistory: e.target.value } })} />;
});
jest.mock('@/components/visits/VisitPhotos', () => function Photos() { return null; });
jest.mock('@/components/tours/DoctorTour', () => ({ DoctorTour: () => null }));

const DRAFT_KEY = 'clinic:visit-draft:d:p:visit-v';
const NOTE = 'Itching on both forearms for three weeks.';
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
let draftWrites: string[] = [];

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); localStorage.clear();
  (apiClient.get as jest.Mock).mockResolvedValue({ id: 'v', patientId: 'p', complaints: [], history: {}, plan: {}, exam: {} });
  (apiClient.getPatient as jest.Mock).mockResolvedValue({ id: 'p', name: 'Synthetic Patient' });
  (apiClient.getPatientVisitHistory as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.getAllPatientVisitHistory as jest.Mock).mockResolvedValue([]);
  (apiClient.getVisits as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.updateVisit as jest.Mock).mockResolvedValue({ id: 'v' });
  draftWrites = [];
  const setItem = Storage.prototype.setItem;
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    if (key === DRAFT_KEY) draftWrites.push(value);
    return setItem.call(this, key, value);
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

async function openFormAndType() {
  const view = render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />);
  await flush();
  draftWrites = [];
  const field = screen.getByLabelText('Clinical note');
  for (let i = 1; i <= NOTE.length; i++) {
    await act(async () => { fireEvent.change(field, { target: { value: NOTE.slice(0, i) } }); });
  }
  return view;
}

const savedNote = () => JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')?.data?.prescriptionClinical?.history?.pastHistory;

it('writes the local draft once for a burst of typing, with every character in it', async () => {
  await openFormAndType();
  await act(async () => { jest.advanceTimersByTime(500); });

  expect(draftWrites.length).toBe(1);
  expect(savedNote()).toBe(NOTE);
});

it.each([
  ['the page is closed', () => window.dispatchEvent(new Event('pagehide'))],
  ['the tab is hidden', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }],
])('writes a pending draft at once when %s', async (_when, leave) => {
  await openFormAndType();
  expect(savedNote()).not.toBe(NOTE);

  await act(async () => { leave(); });

  expect(savedNote()).toBe(NOTE);
});

it('writes a pending draft when the form closes', async () => {
  const { unmount } = await openFormAndType();

  unmount();

  expect(savedNote()).toBe(NOTE);
});

it('keeps an edit still waiting to be written when the attending doctor changes', async () => {
  const view = render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />);
  await flush();
  const field = screen.getByLabelText('Clinical note');
  await act(async () => { fireEvent.change(field, { target: { value: 'Review on Friday' } }); });
  await act(async () => { jest.advanceTimersByTime(500); });
  await act(async () => { fireEvent.change(field, { target: { value: 'Review on Monday' } }); });

  view.rerender(<MedicalVisitForm patientId="p" doctorId="d2" initialVisitId="v" userRole="ADMIN" />);
  await flush();
  await act(async () => { jest.advanceTimersByTime(500); });

  const moved = JSON.parse(localStorage.getItem('clinic:visit-draft:d2:p:visit-v') ?? '{}');
  expect(moved?.data?.prescriptionClinical?.history?.pastHistory).toBe('Review on Monday');
});
