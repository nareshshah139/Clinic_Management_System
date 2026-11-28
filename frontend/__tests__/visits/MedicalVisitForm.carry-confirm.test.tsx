import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn(), getPatient: jest.fn().mockResolvedValue({ id: 'p', name: 'Synthetic patient' }),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getAllPatientVisitHistory: jest.fn(), getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
  getVisits: jest.fn().mockResolvedValue({ visits: [] }), getPrescriptions: jest.fn().mockResolvedValue({ prescriptions: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }), getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]), updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn(), createPrescription: jest.fn(), updatePrescription: jest.fn(),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/components/visits/VisitPhotos', () => function Photos() { return null; });
jest.mock('@/components/tours/DoctorTour', () => ({ DoctorTour: () => null }));

jest.setTimeout(60_000);

const lastVisit = {
  id: 'last',
  entryType: 'visit',
  status: 'COMPLETED',
  encounterDate: '2026-10-10T05:00:00.000Z',
  doctor: { firstName: 'Asha', lastName: 'Rao', name: 'Asha Rao' },
  complaints: [{ complaint: 'Acne on cheeks for 3 months' }],
  diagnosis: [{ diagnosis: 'Acne vulgaris' }],
  history: {
    pastHistory: 'Eczema as a child',
    medicationHistory: 'Isotretinoin in 2024',
    familyHistory: { dm: true, htn: false, others: 'Father: hypertension' },
  },
  prescriptionItems: [
    { drugName: 'Tab Doxycycline 100mg', dosePattern: '1-0-1', frequency: 'TWICE_DAILY', timing: 'AFTER_FOOD', duration: 14, durationUnit: 'DAYS', quantity: 28 },
    { drugName: 'Adapalene 0.1% Gel', frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS', quantity: 1 },
  ],
};
const draftVisit = { ...lastVisit, status: 'IN_PROGRESS', encounterDate: '2026-11-12T05:00:00.000Z' };
const openVisit = { id: 'v', patientId: 'p', doctorId: 'd', version: 1, status: 'IN_PROGRESS', complaints: [], diagnosis: [], history: {}, plan: {}, exam: {} };

let history: unknown[] = [];
let visit: Record<string, unknown> = openVisit;
const scrollIntoView = jest.fn();

beforeEach(() => {
  localStorage.clear(); jest.clearAllMocks();
  history = [lastVisit];
  visit = openVisit;
  Element.prototype.scrollIntoView = scrollIntoView;
  (apiClient.getAllPatientVisitHistory as jest.Mock).mockImplementation(async () => history);
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => url === '/visits/v' ? visit : url.includes('autocomplete') ? [] : {});
  (apiClient.updateVisit as jest.Mock).mockResolvedValue({ id: 'v', version: 2, status: 'IN_PROGRESS' });
  (apiClient.createPrescription as jest.Mock).mockResolvedValue({ id: 'rx', visit: { id: 'v', version: 3, status: 'IN_PROGRESS' } });
  (apiClient.completeVisit as jest.Mock).mockResolvedValue({ id: 'v', status: 'COMPLETED', version: 4 });
});

const field = (name: string) => screen.getByRole('textbox', { name }) as HTMLTextAreaElement | HTMLInputElement;
const completeButton = () => screen.getByRole('button', { name: 'Complete Visit' });
const dialog = () => screen.findByRole('alertdialog');
const noDialog = () => expect(screen.queryByRole('alertdialog')).toBeNull();
const instructionsFor = (drug: string) => screen.getByRole('textbox', { name: `Instructions for ${drug}` });

async function openVisitForm() {
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />);
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Consultation' }), { button: 0, ctrlKey: false });
  await screen.findByRole('textbox', { name: 'Diagnosis' });
}

async function carryLastVisit() {
  await openVisitForm();
  const offer = await screen.findByRole('region', { name: 'Last visit' });
  fireEvent.click(within(offer).getByRole('button', { name: 'Start from last visit' }));
  await screen.findByRole('region', { name: 'Carried forward' });
  await screen.findByDisplayValue('Adapalene 0.1% Gel');
  await waitFor(() => expect(completeButton()).toBeEnabled());
}

const pressComplete = async () => { await act(async () => { fireEvent.click(completeButton()); }); };
const completeAnyway = async () => {
  await pressComplete();
  const confirm = screen.queryByRole('alertdialog');
  if (confirm) await act(async () => { fireEvent.click(within(confirm).getByRole('button', { name: 'Complete visit' })); });
  await screen.findByText('Completed. Read only.');
};

const editEveryCarriedItem = () => {
  fireEvent.change(field('Chief complaints'), { target: { value: 'Acne on cheeks, worse this month' } });
  fireEvent.change(field('Diagnosis'), { target: { value: 'Acne vulgaris, grade 3' } });
  fireEvent.change(field('Past history'), { target: { value: 'Eczema as a child, resolved' } });
  fireEvent.change(field('Medication history'), { target: { value: 'Isotretinoin in 2024, stopped' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Diabetes' }));
  fireEvent.change(screen.getByPlaceholderText('Others'), { target: { value: 'Father: hypertension, on treatment' } });
  fireEvent.change(instructionsFor('Tab Doxycycline 100mg'), { target: { value: 'Take with water' } });
  fireEvent.change(instructionsFor('Adapalene 0.1% Gel'), { target: { value: 'Apply on forehead only' } });
};

describe('completing a visit that still has items carried from the last visit', () => {
  it('asks first, lists what is still carried and from which visit, and does not complete', async () => {
    await carryLastVisit();
    await pressComplete();

    const confirm = await dialog();
    expect(within(confirm).getByText("Some items from the last visit haven't been reviewed")).toBeTruthy();
    expect(confirm.textContent).toContain('10 Oct 2026 visit by Dr. Asha Rao');
    expect(within(confirm).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Chief complaints', 'Diagnosis', 'Past history', 'Medication history', 'Family history', '2 medicines',
    ]);
    expect(apiClient.completeVisit).not.toHaveBeenCalled();
    expect(apiClient.updateVisit).not.toHaveBeenCalled();
  });

  it('asks the same way from the keyboard shortcut', async () => {
    await carryLastVisit();
    await act(async () => { fireEvent.keyDown(document, { key: 's', ctrlKey: true, shiftKey: true }); });

    await dialog();
    expect(apiClient.completeVisit).not.toHaveBeenCalled();
  });

  it('names a draft as the source when the last visit was never completed', async () => {
    history = [draftVisit];
    await carryLastVisit();
    await pressComplete();

    expect((await dialog()).textContent).toContain('12 Nov 2026 visit by Dr. Asha Rao (draft, not completed)');
  });

  it('completes once when the doctor chooses Complete visit', async () => {
    await carryLastVisit();
    await pressComplete();

    await act(async () => { fireEvent.click(within(await dialog()).getByRole('button', { name: 'Complete visit' })); });

    await waitFor(() => expect(apiClient.completeVisit).toHaveBeenCalledTimes(1));
    noDialog();
  });

  it('does not complete when the doctor chooses Review items, and takes them to the first item to review', async () => {
    await carryLastVisit();
    await pressComplete();

    await act(async () => { fireEvent.click(within(await dialog()).getByRole('button', { name: 'Review items' })); });

    await waitFor(() => noDialog());
    await waitFor(() => expect(field('Chief complaints')).toHaveFocus());
    expect(scrollIntoView.mock.instances.map((node: Element) => node.id)).toContain('consult-chief-complaints');
    expect(apiClient.completeVisit).not.toHaveBeenCalled();
    expect(apiClient.updateVisit).not.toHaveBeenCalled();
  });

  it('takes the doctor to the first section that is still carried, and lists only what is still carried', async () => {
    await carryLastVisit();
    fireEvent.change(field('Chief complaints'), { target: { value: 'Acne on cheeks, worse this month' } });
    fireEvent.change(field('Diagnosis'), { target: { value: 'Acne vulgaris, grade 3' } });
    await pressComplete();

    const confirm = await dialog();
    expect(within(confirm).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Past history', 'Medication history', 'Family history', '2 medicines',
    ]);
    await act(async () => { fireEvent.click(within(confirm).getByRole('button', { name: 'Review items' })); });

    await waitFor(() => expect(field('Past history')).toHaveFocus());
  });

  it('counts a carried medicine out once the doctor edits it', async () => {
    await carryLastVisit();
    fireEvent.change(instructionsFor('Tab Doxycycline 100mg'), { target: { value: 'Take with water' } });
    await pressComplete();

    expect(within(await dialog()).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Chief complaints', 'Diagnosis', 'Past history', 'Medication history', 'Family history', '1 medicine',
    ]);
  });

  it('opens the dialog on its safe choice, and Escape closes it without completing and returns to Complete Visit', async () => {
    await carryLastVisit();
    completeButton().focus();
    await pressComplete();

    const confirm = await dialog();
    await waitFor(() => expect(within(confirm).getByRole('button', { name: 'Review items' })).toHaveFocus());
    await act(async () => { fireEvent.keyDown(confirm, { key: 'Escape' }); });

    await waitFor(() => noDialog());
    await waitFor(() => expect(completeButton()).toHaveFocus());
    expect(apiClient.completeVisit).not.toHaveBeenCalled();
  });

  it('shows the Consultation tab before it scrolls, when the doctor was on another tab', async () => {
    await carryLastVisit();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'History' }), { button: 0, ctrlKey: false });
    await pressComplete();

    await act(async () => { fireEvent.click(within(await dialog()).getByRole('button', { name: 'Review items' })); });

    await waitFor(() => expect(field('Chief complaints')).toHaveFocus());
    expect(screen.getByRole('tab', { name: 'Consultation' })).toHaveAttribute('aria-selected', 'true');
  });

  it('asks once and completes once when Complete Visit is double-clicked', async () => {
    await carryLastVisit();
    await act(async () => { fireEvent.click(completeButton()); fireEvent.click(completeButton()); });

    expect(await screen.findAllByRole('alertdialog')).toHaveLength(1);
    expect(apiClient.completeVisit).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(within(await dialog()).getByRole('button', { name: 'Complete visit' })); });
    await waitFor(() => expect(apiClient.completeVisit).toHaveBeenCalledTimes(1));
  });

  it('keeps no carry notice or marks on the completed visit', async () => {
    await carryLastVisit();
    expect(screen.getAllByText(/from 10 Oct 2026 visit/i).length).toBeGreaterThan(0);
    await completeAnyway();

    expect(screen.queryByRole('region', { name: 'Carried forward' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.queryAllByText(/from 10 Oct 2026 visit/i)).toEqual([]);
    expect(screen.queryByRole('region', { name: 'Last visit' })).toBeNull();
  });

  it('does not ask again when the completed visit is edited and saved', async () => {
    await carryLastVisit();
    await completeAnyway();

    fireEvent.click(screen.getByRole('button', { name: 'Edit visit' }));
    fireEvent.change(field('Diagnosis'), { target: { value: 'Acne vulgaris, grade 3' } });
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Save changes' })); });

    noDialog();
    await waitFor(() => expect(apiClient.completeVisit).toHaveBeenCalledTimes(2));
  });
});

describe('completing a visit with nothing left to review', () => {
  it('goes straight through once every carried item has been edited', async () => {
    await carryLastVisit();
    editEveryCarriedItem();
    await pressComplete();

    noDialog();
    await waitFor(() => expect(apiClient.completeVisit).toHaveBeenCalledTimes(1));
  });

  it('goes straight through after the carry is undone and the doctor writes the visit', async () => {
    await carryLastVisit();
    fireEvent.click(within(screen.getByRole('region', { name: 'Carried forward' })).getByRole('button', { name: 'Undo' }));
    fireEvent.change(field('Chief complaints'), { target: { value: 'Itchy rash on forearms' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add Row' }));
    fireEvent.change((await screen.findAllByPlaceholderText('Search medicine name...'))[0], { target: { value: 'ZYTEE GEL' } });
    await waitFor(() => expect(completeButton()).toBeEnabled());
    await pressComplete();

    noDialog();
    await waitFor(() => expect(apiClient.completeVisit).toHaveBeenCalledTimes(1));
  });

  it('goes straight through when the doctor never started from the last visit', async () => {
    await openVisitForm();
    await screen.findByRole('region', { name: 'Last visit' });
    fireEvent.change(field('Chief complaints'), { target: { value: 'Itchy rash on forearms' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add Row' }));
    fireEvent.change((await screen.findAllByPlaceholderText('Search medicine name...'))[0], { target: { value: 'ZYTEE GEL' } });
    await waitFor(() => expect(completeButton()).toBeEnabled());
    await pressComplete();

    noDialog();
    await waitFor(() => expect(apiClient.completeVisit).toHaveBeenCalledTimes(1));
  });

  it('completes once when Complete Visit is double-clicked', async () => {
    await openVisitForm();
    fireEvent.change(field('Chief complaints'), { target: { value: 'Itchy rash on forearms' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add Row' }));
    fireEvent.change((await screen.findAllByPlaceholderText('Search medicine name...'))[0], { target: { value: 'ZYTEE GEL' } });
    await waitFor(() => expect(completeButton()).toBeEnabled());
    await act(async () => { fireEvent.click(completeButton()); fireEvent.click(completeButton()); });

    await waitFor(() => expect(apiClient.completeVisit).toHaveBeenCalledTimes(1));
    noDialog();
  });

  it('saves changes to an already completed visit without asking', async () => {
    visit = { ...openVisit, status: 'COMPLETED', complaints: [{ complaint: 'Itchy rash' }], plan: { dermatology: { medicationPlan: [{ drugName: 'ZYTEE GEL', frequency: 'ONCE_DAILY', duration: 7, durationUnit: 'DAYS' }] } } };
    (apiClient.updateVisit as jest.Mock).mockResolvedValue({ id: 'v', version: 2, status: 'COMPLETED' });
    await openVisitForm();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit visit' }));
    fireEvent.change(field('Diagnosis'), { target: { value: 'Contact dermatitis' } });
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Save changes' })); });

    noDialog();
    await waitFor(() => expect(apiClient.completeVisit).toHaveBeenCalledTimes(1));
  });
});
