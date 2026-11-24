import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsersManagement from '@/components/users/UsersManagement';
import { apiClient } from '@/lib/api';

let mockViewer = { id: 'me', role: 'ADMIN' };
const mockToast = jest.fn();

jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: mockViewer, loading: false }) }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/components/users/DoctorAvailabilitySettings', () => ({ BranchHolidaySettings: () => null, DoctorAvailabilitySettings: () => null }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getUsers: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    getWhatsAppTemplates: jest.fn(),
    createWhatsAppTemplate: jest.fn(),
    updateWhatsAppTemplate: jest.fn(),
    deleteWhatsAppTemplate: jest.fn(),
    getPermissions: jest.fn(),
    getUserPermissions: jest.fn(),
  },
}));
const api = apiClient as jest.Mocked<typeof apiClient>;

const person = (id: string, firstName: string, role: string, status = 'ACTIVE') => ({ id, firstName, lastName: 'Test', email: `${id}@x.com`, phone: '1', role, status });

beforeAll(() => {
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
});

beforeEach(() => {
  jest.clearAllMocks();
  mockViewer = { id: 'me', role: 'ADMIN' };
  api.getUsers.mockResolvedValue({ users: [person('me', 'Mina', 'ADMIN'), person('o1', 'Olga', 'OWNER'), person('a1', 'Alan', 'ACCOUNTANT')] } as any);
  api.getWhatsAppTemplates.mockResolvedValue([]);
});

async function openMenu(name: RegExp) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name }));
  return user;
}

describe('role options', () => {
  it('shows an Owner their own role instead of a blank select, and offers every assignable role', async () => {
    render(<UsersManagement />);
    const row = (await screen.findByText('Olga Test')).closest('tr')!;
    const user = userEvent.setup();
    await user.click(within(row).getByRole('button', { name: /Edit/ }));
    const role = await screen.findByRole('combobox', { name: 'Role' });
    expect(role).toHaveTextContent('Owner');
    await user.click(role);
    const labels = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(labels).toEqual(['Owner', 'Admin', 'Manager', 'Doctor', 'Nurse', 'Receptionist', 'Pharmacist', 'Accountant', 'Lab technician']);
  });
});

describe('self and last-admin protection', () => {
  it('locks role and status and explains why when editing your own account', async () => {
    render(<UsersManagement />);
    const row = (await screen.findByText('Mina Test')).closest('tr')!;
    await userEvent.setup().click(within(row).getByRole('button', { name: /Edit/ }));
    expect(await screen.findByRole('combobox', { name: 'Role' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeDisabled();
    expect(screen.getByText(/This is your own account/)).toBeInTheDocument();
  });

  it('disables Delete for your own row with an explanation, but not for other users', async () => {
    render(<UsersManagement />);
    await openMenu(/More actions for Mina Test/);
    const own = await screen.findByRole('menuitem', { name: /Delete/ });
    expect(own).toHaveAttribute('aria-disabled', 'true');
    expect(own).toHaveTextContent('your own account');
  });

  it('keeps Delete available for another user', async () => {
    render(<UsersManagement />);
    await openMenu(/More actions for Alan Test/);
    expect(await screen.findByRole('menuitem', { name: /Delete/ })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('disables deleting the only active Owner or Admin', async () => {
    mockViewer = { id: 'o1', role: 'OWNER' };
    api.getUsers.mockResolvedValue({ users: [person('o1', 'Olga', 'OWNER'), person('s1', 'Sam', 'ADMIN', 'SUSPENDED'), person('a1', 'Alan', 'NURSE')] } as any);
    render(<UsersManagement />);
    await openMenu(/More actions for Olga Test/);
    expect(await screen.findByRole('menuitem', { name: /Delete/ })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('read-only for non-admin roles', () => {
  it('shows the list to a Manager without any write actions', async () => {
    mockViewer = { id: 'm1', role: 'MANAGER' };
    render(<UsersManagement />);
    expect(await screen.findByText('Olga Test')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New User/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Only Owners and Admins can add or change them/)).toBeInTheDocument();
  });
});

describe('error toasts', () => {
  it('tells the user when the list cannot be loaded', async () => {
    api.getUsers.mockRejectedValue(new Error('Server down'));
    render(<UsersManagement />);
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', title: 'Could not load users' })));
  });
});

describe('WhatsApp template editor', () => {
  const doctor = person('d1', 'Dora', 'DOCTOR');

  async function openEditor() {
    mockViewer = { id: 'o1', role: 'OWNER' };
    api.getUsers.mockResolvedValue({ users: [doctor, person('o1', 'Olga', 'OWNER')] } as any);
    render(<UsersManagement />);
    const user = await openMenu(/More actions for Dora Test/);
    await user.click(await screen.findByRole('menuitem', { name: /WhatsApp Settings/ }));
    await user.click(await screen.findByRole('button', { name: 'Manage' }));
    return { user, editor: await screen.findByRole('textbox', { name: 'Template designer' }) };
  }

  it('adds a typed variable when the Add button is pressed', async () => {
    const { user } = await openEditor();
    await user.type(screen.getByLabelText('New variable'), 'clinic_name');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: '{{clinic_name}}' })).toBeInTheDocument();
    expect(screen.getByLabelText('New variable')).toHaveValue('');
  });

  it('keeps typed text and caret order, and inserts a variable at the caret', async () => {
    const { user, editor } = await openEditor();
    editor.innerHTML = 'Hello  see you';
    const text = editor.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 6);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent.keyUp(editor);
    fireEvent.input(editor);
    expect(editor.innerHTML).toBe('Hello  see you');
    await user.click(screen.getByRole('button', { name: '{{patient_name}}' }));
    expect(editor.textContent).toBe('Hello {{patient_name}} see you');
    expect(screen.getByLabelText('Plain Text (fallback)')).toHaveValue('Hello {{patient_name}} see you');
  });

  it('shows an error toast when saving a template fails', async () => {
    const { user } = await openEditor();
    api.createWhatsAppTemplate.mockRejectedValue(new Error('Name already used'));
    await user.type(screen.getByLabelText('Name'), 'Reminder');
    await user.type(screen.getByLabelText('Plain Text (fallback)'), 'Hi');
    await user.click(screen.getByRole('button', { name: 'Save Template' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not save the template', description: 'Name already used' })));
  });
});
