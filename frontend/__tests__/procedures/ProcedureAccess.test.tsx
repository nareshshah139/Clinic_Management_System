import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ProceduresPage from '@/app/dashboard/procedures/page';
import { apiClient } from '@/lib/api';

let mockSignedIn: { id: string; role: string } = { id: 'd1', role: 'DOCTOR' };
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: mockSignedIn, loading: false }) }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getPatients: jest.fn(),
    getUsers: jest.fn(),
    get: jest.fn(),
    getVisits: jest.fn(),
    getMyProcedureAccess: jest.fn(),
    getProcedureAccess: jest.fn(),
    updateProcedureAccess: jest.fn(),
    createProcedure: jest.fn(),
    updateProcedure: jest.fn(),
  },
}));
jest.mock('@/components/common/QuickGuide', () => ({ QuickGuide: () => null }));
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

const READ_ONLY_NOTE = 'Your role can view procedures but not record them. A doctor or admin can change this.';

const savedVisit = {
  id: 'v9', version: 4, patientId: 'p1', doctorId: 'd1', createdAt: '2026-11-20T10:00:00.000Z',
  patient: { id: 'p1', name: 'Asha Rao' }, doctor: { firstName: 'Meera', lastName: 'Iyer' },
  plan: JSON.stringify({ dermatology: { procedures: [{ type: 'Hydrafacial', machine: 'hydrafacial', sessionNo: 1 }] }, notes: '' }),
};

const signedInAs = (role: string, access: { canRecord: boolean; canConfigure: boolean }) => {
  mockSignedIn = { id: `${role}-user`, role };
  jest.mocked(apiClient.getMyProcedureAccess).mockResolvedValue(access);
};

beforeEach(() => {
  jest.clearAllMocks();
  HTMLElement.prototype.scrollIntoView = jest.fn();
  jest.mocked(apiClient.getPatients).mockResolvedValue({ data: [{ id: 'p1', name: 'Asha Rao' }] } as any);
  jest.mocked(apiClient.getUsers).mockImplementation(async (query: any) => ({
    users: query.role === 'DOCTOR' ? [{ id: 'd1', firstName: 'Meera', lastName: 'Iyer' }] : [{ id: 'n1', firstName: 'Ann', lastName: 'Nurse' }],
  }) as any);
  jest.mocked(apiClient.getVisits).mockResolvedValue({ visits: [savedVisit] } as any);
  jest.mocked(apiClient.getProcedureAccess).mockResolvedValue({ recordRoles: ['OWNER', 'ADMIN', 'DOCTOR'] });
  jest.mocked(apiClient.updateProcedureAccess).mockImplementation(async (body) => body);
  jest.mocked(apiClient.createProcedure).mockResolvedValue({} as any);
});

const renderReady = async () => {
  render(<ProceduresPage />);
  await screen.findByRole('combobox', { name: 'Doctor *' });
};

describe('who can record procedures', () => {
  it.each(['MANAGER', 'NURSE'])('hides the setting from %s', async (role) => {
    signedInAs(role, { canRecord: false, canConfigure: false });
    await renderReady();
    expect(screen.queryByRole('button', { name: 'Who can record' })).toBeNull();
  });

  it('lets a doctor allow nurses to record, with doctors always on', async () => {
    signedInAs('DOCTOR', { canRecord: true, canConfigure: true });
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Who can record' }));
    const dialog = await screen.findByRole('dialog', { name: 'Who can record procedures' });

    const doctor = await within(dialog).findByRole('checkbox', { name: 'Doctor' });
    expect(doctor).toBeChecked();
    expect(doctor).toBeDisabled();
    expect(within(dialog).getByRole('checkbox', { name: 'Nurse' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Manager' })).not.toBeChecked();

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Nurse' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ variant: 'success', title: 'Saved who can record procedures' }));
    expect(apiClient.updateProcedureAccess).toHaveBeenCalledTimes(1);
    expect(apiClient.updateProcedureAccess).toHaveBeenCalledWith({ recordRoles: ['NURSE'] });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('lets an allowed nurse record a procedure, saved once through the procedures endpoint', async () => {
    signedInAs('NURSE', { canRecord: true, canConfigure: false });
    await renderReady();
    expect(screen.queryByText(READ_ONLY_NOTE)).toBeNull();

    fireEvent.change(screen.getByLabelText('Patient *'), { target: { value: 'Asha' } });
    fireEvent.click(await screen.findByRole('button', { name: /Asha Rao/ }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Doctor *' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Dr. Meera Iyer' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Nurse/Therapist' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Ann Nurse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Face' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hydrafacial' }));
    fireEvent.change(screen.getByLabelText('Actives Used, pass 1'), { target: { value: 'Salicylic' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Procedure/ }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ variant: 'success', title: 'Procedure saved' }));
    expect(apiClient.createProcedure).toHaveBeenCalledTimes(1);
    expect(apiClient.createProcedure).toHaveBeenCalledWith({
      patientId: 'p1',
      doctorId: 'd1',
      treatmentPlan: {
        dermatology: {
          procedures: [{
            type: 'Hydrafacial',
            machine: 'hydrafacial',
            therapistId: 'n1',
            sessionNo: 1,
            bodyPart: ['Face'],
            indications: '',
            skinTypes: { fitzpatrick: '', robert: '', scar: '', herpes: '' },
            shotCounts: { begin: 0, end: 0 },
            parameters: { 'Actives Used': { 1: 'Salicylic' } },
          }],
        },
        notes: '',
      },
    });
  });

  it('shows a nurse who may not record a read-only form that says why', async () => {
    signedInAs('NURSE', { canRecord: false, canConfigure: false });
    await renderReady();

    expect(screen.getByText(READ_ONLY_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save Procedure/ })).toBeNull();
    expect(screen.getByLabelText('Patient *')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Doctor *' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hydrafacial' })).toBeDisabled();
    expect(screen.getByLabelText('Indications')).toBeDisabled();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Procedure History' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Procedure History' }));
    expect(await screen.findByRole('button', { name: 'View Details' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load & Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Repeat as new session' })).toBeNull();
    expect(apiClient.createProcedure).not.toHaveBeenCalled();
  });
});
