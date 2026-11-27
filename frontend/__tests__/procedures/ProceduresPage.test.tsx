import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ProceduresPage from '@/app/dashboard/procedures/page';
import { apiClient } from '@/lib/api';
import { resolveDefaultDoctorId } from '@/lib/default-visit-doctor';

let mockSignedIn: { id: string; role: string } = { id: 'd1', role: 'DOCTOR' };
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: mockSignedIn, loading: false }) }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getPatients: jest.fn(),
    getUsers: jest.fn(),
    get: jest.fn(),
    getVisits: jest.fn(),
    getMyProcedureAccess: jest.fn(),
    createProcedure: jest.fn(),
    updateProcedure: jest.fn(),
  },
}));
jest.mock('@/components/common/QuickGuide', () => ({ QuickGuide: () => null }));
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

const savedFotonaVisit = {
  id: 'v9',
  version: 4,
  patientId: 'p1',
  doctorId: 'd1',
  createdAt: '2026-11-20T10:00:00.000Z',
  patient: { id: 'p1', name: 'Asha Rao' },
  doctor: { id: 'd1', firstName: 'Meera', lastName: 'Iyer' },
  plan: JSON.stringify({
    dermatology: {
      procedures: [{
        type: 'Fotona Starwalker',
        machine: 'fotona-starwalker',
        therapistId: 'n1',
        sessionNo: 3,
        bodyPart: ['Face', 'Neck'],
        indications: 'Melasma',
        skinTypes: { fitzpatrick: 'IV', robert: 'Type 2', scar: '', herpes: 'None' },
        shotCounts: { begin: 100, end: 450 },
        parameters: { Fluence: { 1: '12', 2: '10' }, 'Spot Size': { 1: '7' } },
      }],
    },
    notes: 'Mild erythema',
  }),
};

beforeEach(() => {
  jest.clearAllMocks();
  HTMLElement.prototype.scrollIntoView = jest.fn();
  jest.mocked(apiClient.getPatients).mockResolvedValue({ data: [{ id: 'p1', name: 'Asha Rao', phone: '9800000001' }] } as any);
  jest.mocked(apiClient.getUsers).mockImplementation(async (query: any) => ({
    users: query.role === 'DOCTOR'
      ? [{ id: 'd1', firstName: 'Meera', lastName: 'Iyer' }, { id: 'd2', firstName: 'Second', lastName: 'Doctor' }]
      : [{ id: 'n1', firstName: 'Ann', lastName: 'Nurse' }],
  }) as any);
  mockSignedIn = { id: 'd1', role: 'DOCTOR' };
  jest.mocked(apiClient.getVisits).mockResolvedValue({ visits: [savedFotonaVisit] } as any);
  jest.mocked(apiClient.getMyProcedureAccess).mockResolvedValue({ canRecord: true, canConfigure: true });
  jest.mocked(apiClient.createProcedure).mockResolvedValue({} as any);
  jest.mocked(apiClient.updateProcedure).mockResolvedValue({} as any);
});

const renderReady = async () => {
  render(<ProceduresPage />);
  return screen.findByRole('combobox', { name: 'Doctor *' });
};

const pickPatient = async (label: string, name: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value: 'Asha' } });
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
};

const openHistoryCard = async () => {
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Procedure History' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Procedure History' }));
  return screen.findByRole('button', { name: 'View Details' });
};

describe('ProceduresPage', () => {
  it('has one plain "Procedures" heading and two tabs', async () => {
    await renderReady();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Procedures']);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['New Procedure', 'Procedure History']);
  });

  it('selects the signed-in doctor, since procedures have no appointment to defer to', async () => {
    mockSignedIn = { id: 'd2', role: 'DOCTOR' };
    await renderReady();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Doctor *' })).toHaveTextContent('Dr. Second Doctor'));
    expect(apiClient.get).not.toHaveBeenCalledWith('/auth/me');
  });

  it('finds a patient by server search instead of a capped list', async () => {
    await renderReady();
    expect(screen.getByLabelText('Patient *')).toHaveValue('');
    await pickPatient('Patient *', 'Asha Rao');
    expect(apiClient.getPatients).toHaveBeenCalledWith({ search: 'Asha', limit: 10 });
    expect(screen.queryByLabelText('Patient *')).toBeNull();
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
  });

  it('shows the full saved record in View Details', async () => {
    await renderReady();
    fireEvent.click(await openHistoryCard());
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Fotona Starwalker · Session 3' })).toBeInTheDocument();
    for (const [label, value] of [
      ['Patient', 'Asha Rao'],
      ['Nurse/Therapist', 'Ann Nurse'],
      ['Body parts', 'Face, Neck'],
      ['Shot count', '100 → 450 (total 350)'],
      ['Fitzpatrick', 'Type IV'],
      ['Indications', 'Melasma'],
      ['Notes', 'Mild erythema'],
    ]) {
      expect(within(dialog).getByText(label).nextSibling).toHaveTextContent(value);
    }
    expect(within(dialog).getByRole('rowheader', { name: 'Fluence' }).nextSibling).toHaveTextContent('Pass 1: 12 · Pass 2: 10');
  });

  it('history cards show what was saved', async () => {
    await renderReady();
    await openHistoryCard();
    expect(apiClient.getVisits).toHaveBeenCalledWith({ limit: 100 });
    expect(screen.getByText('1 procedure for all patients')).toBeInTheDocument();
    const card = screen.getByText('Asha Rao').closest('[data-slot="card"]') as HTMLElement;
    expect(card).toHaveTextContent('Session: 3');
    expect(card).toHaveTextContent('Total shots: 350');
    expect(card).toHaveTextContent('Areas: Face, Neck');
    expect(card).toHaveTextContent('Mild erythema');
  });

  it('Load & Edit then save updates the same visit instead of creating another', async () => {
    await renderReady();
    await openHistoryCard();
    fireEvent.click(screen.getByRole('button', { name: 'Load & Edit' }));

    expect(await screen.findByLabelText('Session No.')).toHaveValue(3);
    expect(screen.getByLabelText('Indications')).toHaveValue('Melasma');
    expect(screen.getByLabelText('Fluence, pass 2')).toHaveValue('10');
    fireEvent.change(screen.getByLabelText('Additional notes'), { target: { value: 'Settled by day 2' } });
    fireEvent.change(screen.getByLabelText('Shot Count (End)'), { target: { value: '480' } });
    fireEvent.click(screen.getByRole('button', { name: /Update Procedure/ }));

    await waitFor(() => expect(apiClient.updateProcedure).toHaveBeenCalledTimes(1));
    expect(apiClient.createProcedure).not.toHaveBeenCalled();
    expect(jest.mocked(apiClient.updateProcedure).mock.calls[0]).toEqual(['v9', {
      version: 4,
      treatmentPlan: {
        dermatology: {
          procedures: [{
            type: 'Fotona Starwalker',
            machine: 'fotona-starwalker',
            therapistId: 'n1',
            sessionNo: 3,
            bodyPart: ['Face', 'Neck'],
            indications: 'Melasma',
            skinTypes: { fitzpatrick: 'IV', robert: 'Type 2', scar: '', herpes: 'None' },
            shotCounts: { begin: 100, end: 480 },
            parameters: { Fluence: { 1: '12', 2: '10' }, 'Spot Size': { 1: '7' } },
          }],
        },
        notes: 'Settled by day 2',
      },
    }]);
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ variant: 'success', title: 'Procedure updated' }));
    expect(await screen.findByText('1 procedure for Asha Rao')).toBeInTheDocument();
  });

  it('Repeat as new session creates a new visit for the next session', async () => {
    await renderReady();
    await openHistoryCard();
    fireEvent.click(screen.getByRole('button', { name: 'Repeat as new session' }));
    expect(await screen.findByLabelText('Session No.')).toHaveValue(4);
    fireEvent.change(screen.getByLabelText('Shot Count (Begin)'), { target: { value: '480' } });
    fireEvent.change(screen.getByLabelText('Shot Count (End)'), { target: { value: '700' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Procedure/ }));

    await waitFor(() => expect(apiClient.createProcedure).toHaveBeenCalledTimes(1));
    const body = jest.mocked(apiClient.createProcedure).mock.calls[0][0] as any;
    expect([body.patientId, body.doctorId, body.treatmentPlan.dermatology.procedures[0].sessionNo, body.treatmentPlan.dermatology.procedures[0].shotCounts])
      .toEqual(['p1', 'd1', 4, { begin: 480, end: 700 }]);
    expect(apiClient.updateProcedure).not.toHaveBeenCalled();
  });

  it('lists Fotona Starwalker parameters once each, spelled Fluence', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Fotona Starwalker' }));
    const rows = screen.getAllByRole('rowheader').map((h) => h.textContent);
    expect(rows.filter((r) => r === 'Area')).toHaveLength(1);
    expect(rows).toContain('Fluence');
    expect(rows).not.toContain('Fluency');
  });

  it('switching machine starts the new machine with empty parameters', async () => {
    await renderReady();
    await pickPatient('Patient *', 'Asha Rao');
    fireEvent.click(screen.getByRole('button', { name: 'Soprano Platinum LHR' }));
    fireEvent.change(screen.getByLabelText('Fluence, pass 1'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fotona Starwalker' }));
    expect(screen.getByLabelText('Fluence, pass 1')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: /Save Procedure/ }));

    await waitFor(() => expect(apiClient.createProcedure).toHaveBeenCalledTimes(1));
    const entry = (jest.mocked(apiClient.createProcedure).mock.calls[0][0] as any).treatmentPlan.dermatology.procedures[0];
    expect([entry.machine, entry.parameters]).toEqual(['fotona-starwalker', {}]);
  });

  it('refuses an end shot count below the begin count instead of showing a negative total', async () => {
    await renderReady();
    await pickPatient('Patient *', 'Asha Rao');
    fireEvent.click(screen.getByRole('button', { name: 'Hydrafacial' }));
    fireEvent.change(screen.getByLabelText('Shot Count (Begin)'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Shot Count (End)'), { target: { value: '100' } });
    expect(screen.getByLabelText('Total Shots')).toHaveValue('—');
    expect(screen.getByText('End count is lower than the begin count.')).toBeInTheDocument();
    expect(screen.getByLabelText('Shot Count (Begin)')).toHaveAttribute('min', '0');
    fireEvent.click(screen.getByRole('button', { name: /Save Procedure/ }));
    expect(mockToast).toHaveBeenCalledWith({ variant: 'warning', title: 'The end shot count is lower than the begin count.' });
    expect(apiClient.createProcedure).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Shot Count (End)'), { target: { value: '650' } });
    expect(screen.getByLabelText('Total Shots')).toHaveValue('150');
  });

  it('says why the form is missing when staff fail to load, and retries', async () => {
    jest.mocked(apiClient.getUsers).mockRejectedValueOnce(new Error('Network down'));
    render(<ProceduresPage />);
    expect(await screen.findByText('Could not load the procedure form')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('combobox', { name: 'Doctor *' })).toBeInTheDocument();
  });

  it('filters history by patient and names the patient when there is none', async () => {
    jest.mocked(apiClient.getVisits).mockImplementation(async (params: any) => ({ visits: params.patientId ? [] : [savedFotonaVisit] }) as any);
    await renderReady();
    await openHistoryCard();
    await pickPatient('Filter by patient', 'Asha Rao');
    expect(await screen.findByText('No procedures recorded for Asha Rao')).toBeInTheDocument();
    expect(apiClient.getVisits).toHaveBeenLastCalledWith({ patientId: 'p1', limit: 100 });
    fireEvent.click(screen.getByRole('button', { name: 'All patients' }));
    expect(await screen.findByText('1 procedure for all patients')).toBeInTheDocument();
  });
});

describe('resolveDefaultDoctorId', () => {
  it('uses the signed-in user when they are a doctor', () => {
    expect(resolveDefaultDoctorId({ role: 'DOCTOR', userId: 'me', current: '' })).toBe('me');
  });
  it('keeps an explicit choice', () => {
    expect(resolveDefaultDoctorId({ role: 'DOCTOR', userId: 'me', current: 'other' })).toBe('other');
  });
  it('stays empty for non-doctors', () => {
    expect(resolveDefaultDoctorId({ role: 'ADMIN', userId: 'a', current: '' })).toBe('');
  });
});
