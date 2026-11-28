import { StrictMode } from 'react';
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
jest.mock('pagedjs', () => ({
  Previewer: class {
    async preview(content: string, _css: unknown, container: HTMLElement) {
      container.innerHTML = `<div class="pagedjs_page"><div class="pagedjs_page_content">${content}</div></div>`;
      return { pages: 1 };
    }
  },
}));

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
  Element.prototype.scrollBy = jest.fn();
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

async function openVisitForm(strict = false) {
  const form = <MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />;
  const view = render(strict ? <StrictMode>{form}</StrictMode> : form);
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Consultation' }), { button: 0, ctrlKey: false });
  await screen.findByRole('textbox', { name: 'Diagnosis' });
  return view;
}

async function carryLastVisit() {
  const view = await openVisitForm();
  const offer = await screen.findByRole('region', { name: 'Last visit' });
  fireEvent.click(within(offer).getByRole('button', { name: 'Start from last visit' }));
  await screen.findByRole('region', { name: 'Carried forward' });
  await screen.findByDisplayValue('Adapalene 0.1% Gel');
  await waitFor(() => expect(completeButton()).toBeEnabled());
  return view;
}

const pressComplete = async () => { await act(async () => { fireEvent.click(completeButton()); }); };
const completeAnyway = async () => {
  await pressComplete();
  const confirm = screen.queryByRole('alertdialog');
  if (confirm) await act(async () => { fireEvent.click(within(confirm).getByRole('button', { name: 'Complete visit' })); });
  await screen.findByText('Completed. Read only.');
};

const editCarriedText = () => {
  fireEvent.change(field('Chief complaints'), { target: { value: 'Acne on cheeks, worse this month' } });
  fireEvent.change(field('Diagnosis'), { target: { value: 'Acne vulgaris, grade 3' } });
  fireEvent.change(field('Past history'), { target: { value: 'Eczema as a child, resolved' } });
  fireEvent.change(field('Medication history'), { target: { value: 'Isotretinoin in 2024, stopped' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Diabetes' }));
  fireEvent.change(screen.getByPlaceholderText('Others'), { target: { value: 'Father: hypertension, on treatment' } });
};
const editEveryCarriedItem = () => {
  editCarriedText();
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

  it('saves changes to a completed visit without asking, even when the last visit was carried in while editing it', async () => {
    visit = { ...openVisit, status: 'COMPLETED' };
    (apiClient.updateVisit as jest.Mock).mockResolvedValue({ id: 'v', version: 2, status: 'COMPLETED' });
    await openVisitForm();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit visit' }));
    fireEvent.click(within(await screen.findByRole('region', { name: 'Last visit' })).getByRole('button', { name: 'Start from last visit' }));
    await screen.findByRole('region', { name: 'Carried forward' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled());
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save changes' })); });

    noDialog();
    await waitFor(() => expect(apiClient.completeVisit).toHaveBeenCalledTimes(1));
  });
});

const olderAcneVisit = {
  id: 'older-acne',
  entryType: 'visit',
  status: 'COMPLETED',
  encounterDate: '2026-09-01T05:00:00.000Z',
  createdAt: '2026-09-01T05:00:00.000Z',
  doctorId: 'd',
  diagnosis: [{ diagnosis: 'Acne vulgaris' }],
  prescriptionItems: [{ drugName: 'Tab Minocycline 50mg', frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS' }],
};
const settled = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });

describe('a completed visit stays as the doctor left it', () => {
  it('shows no learned-plan medicines in the locked treatment or the preview after the carried medicines were removed and a procedure plan was entered', async () => {
    history = [lastVisit, olderAcneVisit];
    await carryLastVisit();
    fireEvent.click(screen.getByRole('button', { name: /^Remove Tab Doxycycline/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Remove Adapalene/ }));
    fireEvent.change(field('Procedures planned'), { target: { value: 'Chemical peel, 3 sessions' } });
    await settled();
    expect(screen.queryByDisplayValue('Tab Minocycline 50mg')).toBeNull();
    await waitFor(() => expect(completeButton()).toBeEnabled());
    await completeAnyway();
    await settled();

    expect(screen.queryByDisplayValue(/Minocycline|Doxycycline|Adapalene/)).toBeNull();
    expect(apiClient.createPrescription).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Print Preview' })[0]);
    const printed = await waitFor(() => {
      const root = document.getElementById('prescription-print-root');
      expect(root?.textContent).toContain('Chemical peel');
      return root as HTMLElement;
    });
    expect(printed.textContent).not.toMatch(/Minocycline|Doxycycline|Adapalene/);
  });

  it('does not fill medicines into the editor when that completed visit is then amended', async () => {
    history = [lastVisit, olderAcneVisit];
    await carryLastVisit();
    fireEvent.click(screen.getByRole('button', { name: /^Remove Tab Doxycycline/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Remove Adapalene/ }));
    fireEvent.change(field('Procedures planned'), { target: { value: 'Chemical peel, 3 sessions' } });
    await waitFor(() => expect(completeButton()).toBeEnabled());
    await completeAnyway();

    fireEvent.click(screen.getByRole('button', { name: 'Edit visit' }));
    await settled();

    expect(screen.queryByDisplayValue(/Minocycline|Doxycycline|Adapalene/)).toBeNull();
  });
});

describe('resuming a saved draft', () => {
  const reopenAfterSavingDraft = async (view: { unmount: () => void }, saved: Record<string, unknown>, strict = false) => {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })); });
    await waitFor(() => expect(apiClient.updateVisit).toHaveBeenCalled());
    view.unmount();
    visit = { ...openVisit, version: 2, history: lastVisit.history, ...saved };
    await openVisitForm(strict);
    await waitFor(() => expect(completeButton()).toBeEnabled());
  };
  const savedComplaints = [{ complaint: 'Acne on cheeks for 3 months' }];

  it('still asks before completing, and still names the visit the items came from', async () => {
    const view = await carryLastVisit();
    await reopenAfterSavingDraft(view, { complaints: savedComplaints, diagnosis: [{ diagnosis: 'Acne vulgaris' }] });
    await pressComplete();

    const confirm = await dialog();
    expect(confirm.textContent).toContain('10 Oct 2026 visit by Dr. Asha Rao');
    expect(within(confirm).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Chief complaints', 'Diagnosis', 'Past history', 'Medication history', 'Family history', '2 medicines',
    ]);
    expect(apiClient.completeVisit).not.toHaveBeenCalled();
  });

  it('still asks when the visit is resumed under React strict mode, which runs every effect twice as the development server does', async () => {
    const view = await carryLastVisit();
    await reopenAfterSavingDraft(view, { complaints: savedComplaints, diagnosis: [{ diagnosis: 'Acne vulgaris' }] }, true);
    await pressComplete();

    expect(within(await dialog()).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Chief complaints', 'Diagnosis', 'Past history', 'Medication history', 'Family history', '2 medicines',
    ]);
  });

  it('leaves out what the doctor edited before saving', async () => {
    const view = await carryLastVisit();
    fireEvent.change(field('Diagnosis'), { target: { value: 'Acne vulgaris, grade 3' } });
    fireEvent.change(instructionsFor('Adapalene 0.1% Gel'), { target: { value: 'Apply on forehead only' } });
    await reopenAfterSavingDraft(view, { complaints: savedComplaints, diagnosis: [{ diagnosis: 'Acne vulgaris, grade 3' }] });
    await pressComplete();

    expect(within(await dialog()).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Chief complaints', 'Past history', 'Medication history', 'Family history', '1 medicine',
    ]);
  });

  it('does not ask after the carry was undone before the draft was saved', async () => {
    const view = await carryLastVisit();
    fireEvent.click(within(screen.getByRole('region', { name: 'Carried forward' })).getByRole('button', { name: 'Undo' }));
    fireEvent.change(field('Chief complaints'), { target: { value: 'Itchy rash on forearms' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add Row' }));
    fireEvent.change((await screen.findAllByPlaceholderText('Search medicine name...'))[0], { target: { value: 'ZYTEE GEL' } });
    await reopenAfterSavingDraft(view, { complaints: [{ complaint: 'Itchy rash on forearms' }] });

    expect(screen.queryByRole('region', { name: 'Carried forward' })).toBeNull();
    await pressComplete();
    noDialog();
    await waitFor(() => expect(apiClient.completeVisit).toHaveBeenCalledTimes(1));
  });

  it('shows no carry notice when the visit is reopened after it was completed', async () => {
    const view = await carryLastVisit();
    await completeAnyway();
    await settled();
    view.unmount();
    visit = { ...openVisit, status: 'COMPLETED', complaints: savedComplaints, diagnosis: [{ diagnosis: 'Acne vulgaris' }], history: lastVisit.history };
    await openVisitForm();
    await settled();

    expect(screen.queryByRole('region', { name: 'Carried forward' })).toBeNull();
    expect(screen.queryAllByText(/from 10 Oct 2026 visit/i)).toEqual([]);
  });
});

describe('a learned plan never fills a completed visit', () => {
  const acneNoMedicines = { ...lastVisit, prescriptionItems: [] };
  const olderAcneWithMedicines = {
    ...olderAcneVisit,
    prescriptionItems: [
      { drugName: 'Doxycycline 100mg Capsule', frequency: 'TWICE_DAILY', duration: 30, durationUnit: 'DAYS' },
      { drugName: 'Adapalene 0.1% Gel', frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS' },
    ],
  };
  const completedProcedureVisit = { ...openVisit, status: 'COMPLETED', version: 3, complaints: [{ complaint: 'Acne scars' }], diagnosis: [{ diagnosis: 'Acne vulgaris' }], plan: { dermatology: { procedurePlanned: 'Chemical peel next visit' } } };
  const planNames = () => Array.from(document.querySelectorAll<HTMLInputElement>('#consult-treatment input[id^="rx-row-"][id$="-drug"]')).map((input) => input.value).filter(Boolean);

  it('leaves the locked treatment empty after completing a copied acne visit that had no medicines, with a procedure plan', async () => {
    history = [acneNoMedicines, olderAcneWithMedicines];
    await openVisitForm();
    fireEvent.click(within(await screen.findByRole('region', { name: 'Last visit' })).getByRole('button', { name: 'Start from last visit' }));
    await screen.findByRole('region', { name: 'Carried forward' });
    fireEvent.change(field('Procedures planned'), { target: { value: 'Chemical peel next visit' } });
    await waitFor(() => expect(completeButton()).toBeEnabled());
    await completeAnyway();
    await settled();

    expect(planNames()).toEqual([]);
    expect(apiClient.createPrescription).not.toHaveBeenCalled();
  });

  it('leaves the table empty when a completed visit is reloaded, and saves no medicines when it is then amended', async () => {
    history = [olderAcneWithMedicines];
    visit = completedProcedureVisit;
    (apiClient.updateVisit as jest.Mock).mockResolvedValue({ id: 'v', version: 4, status: 'COMPLETED' });
    await openVisitForm();
    await settled();
    expect(planNames()).toEqual([]);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit visit' }));
    await settled();
    expect(planNames()).toEqual([]);
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Save changes' })); });
    await waitFor(() => expect(apiClient.completeVisit).toHaveBeenCalledTimes(1));
    expect(apiClient.createPrescription).not.toHaveBeenCalled();
  });
});

describe('Review items', () => {
  it('leaves the card under no part of the sticky visit bar, however tall the bar is', async () => {
    let cardTop = 700;
    const barBottom = 420;
    Element.prototype.scrollIntoView = jest.fn(() => { cardTop = 216; });
    Element.prototype.scrollBy = jest.fn((options?: ScrollToOptions | number) => { cardTop -= typeof options === 'object' ? (options.top ?? 0) : 0; }) as typeof Element.prototype.scrollBy;
    const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.hasAttribute('data-visit-bar')) return rect(0, barBottom);
      if (this.id === 'consult-chief-complaints') return rect(cardTop, 200);
      return original.call(this);
    };
    try {
      await carryLastVisit();
      await pressComplete();
      await act(async () => { fireEvent.click(within(await dialog()).getByRole('button', { name: 'Review items' })); });
      await waitFor(() => expect(field('Chief complaints')).toHaveFocus());

      expect(cardTop).toBeGreaterThanOrEqual(barBottom);
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });

  it('brings the first carried medicine fully into view below the sticky bar, even when it sits far down the Treatment card', async () => {
    let scroll = 0;
    const barBottom = 420;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    Element.prototype.scrollIntoView = jest.fn(function (this: Element) { if (this.id === 'consult-treatment') scroll = 700 - 216; });
    Element.prototype.scrollBy = jest.fn((options?: ScrollToOptions | number) => { scroll += typeof options === 'object' ? (options.top ?? 0) : 0; }) as typeof Element.prototype.scrollBy;
    const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 0, width: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.hasAttribute('data-visit-bar')) return rect(0, barBottom);
      if (this.id === 'consult-treatment') return rect(700 - scroll, 900);
      if (this.id === 'rx-row-0-drug') return rect(1300 - scroll, 40);
      return original.call(this);
    };
    try {
      history = [lastVisit, olderAcneVisit];
      await carryLastVisit();
      editCarriedText();
      await pressComplete();
      await act(async () => { fireEvent.click(within(await dialog()).getByRole('button', { name: 'Review items' })); });
      const row = await waitFor(() => { const input = screen.getByDisplayValue('Tab Doxycycline 100mg'); expect(input).toHaveFocus(); return input; });

      const { top, bottom } = row.getBoundingClientRect();
      expect(top).toBeGreaterThanOrEqual(barBottom);
      expect(bottom).toBeLessThanOrEqual(window.innerHeight);
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });

  it('focuses the first carried medicine, not a button in the Treatment card, when only medicines are left', async () => {
    history = [lastVisit, olderAcneVisit];
    await carryLastVisit();
    editCarriedText();
    await pressComplete();
    expect(within(await dialog()).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['2 medicines']);
    await act(async () => { fireEvent.click(within(await dialog()).getByRole('button', { name: 'Review items' })); });

    await waitFor(() => expect(screen.getByDisplayValue('Tab Doxycycline 100mg')).toHaveFocus());
  });

  it('keeps the first opener when Ctrl+Shift+S is pressed again while the dialog is open', async () => {
    await carryLastVisit();
    completeButton().focus();
    await pressComplete();
    const confirm = await dialog();
    await act(async () => { fireEvent.keyDown(document, { key: 's', ctrlKey: true, shiftKey: true }); });
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);

    await act(async () => { fireEvent.keyDown(confirm, { key: 'Escape' }); });

    await waitFor(() => noDialog());
    await waitFor(() => expect(completeButton()).toHaveFocus());
    expect(apiClient.completeVisit).not.toHaveBeenCalled();
  });
});
