import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import UsersManagement from './UsersManagement';
import { apiClient } from '@/lib/api';

jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getUsers: jest.fn(), getRoles: jest.fn(), getPermissions: jest.fn(),
    createUser: jest.fn(), updateUser: jest.fn(), updateUserPermissions: jest.fn(),
  },
}));
jest.mock('@/components/users/DoctorAvailabilitySettings', () => ({ BranchHolidaySettings: () => null, DoctorAvailabilitySettings: () => null }));
jest.mock('@/components/users/ResetCodeButton', () => ({ ResetCodeButton: () => null }));

const api = apiClient as unknown as Record<string, jest.Mock>;
const USERS = [
  { id: 'u-asha', firstName: 'Asha', lastName: 'Rao', email: 'asha@example.test', phone: '9000000001', role: 'NURSE', status: 'ACTIVE' },
  { id: 'u-vikram', firstName: 'Vikram', lastName: 'Iyer', email: 'vikram@example.test', phone: '9000000002', role: 'RECEPTION', status: 'ACTIVE' },
];
const ROLES = { roles: [{ name: 'NURSE', permissions: JSON.stringify(['appointments:read']) }], pagination: { totalPages: 1 } };

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
const press = (scope: HTMLElement, name: string | RegExp) => fireEvent.click(within(scope).getByRole('button', { name }));
const fieldValues = () => within(screen.getByRole('dialog')).getAllByRole('textbox').map((input) => (input as HTMLInputElement).value);

describe('UsersManagement', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    api.getUsers.mockResolvedValue({ users: USERS });
    api.getRoles.mockResolvedValue(ROLES);
    api.updateUserPermissions.mockResolvedValue({});
  });

  it('opens a blank Create User form after an edit was cancelled', async () => {
    render(<UsersManagement />);
    await screen.findByText('Asha Rao');

    press(rowOf('Asha Rao'), /Edit/);
    expect(within(screen.getByRole('dialog')).getByRole('heading')).toHaveTextContent('Edit User');
    expect(fieldValues()).toEqual(['Asha', 'Rao', 'asha@example.test', '9000000001']);
    press(screen.getByRole('dialog'), 'Cancel');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /New User/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Create User');
    expect(fieldValues()).toEqual(['', '', '', '']);
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('lists every permission, page by page, with the role defaults ticked', async () => {
    api.getPermissions.mockImplementation(async ({ page }: { page: number }) => ({
      permissions: page === 1 ? [{ name: 'appointments:read' }, { name: 'appointments:create' }] : [{ name: 'billing:read' }],
      pagination: { totalPages: 2 },
    }));
    render(<UsersManagement />);
    await screen.findByText('Asha Rao');

    press(rowOf('Asha Rao'), /Role & Permissions/);
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByRole('checkbox', { name: 'billing:read' });
    expect(within(dialog).getAllByRole('checkbox').map((box) => [box.getAttribute('aria-label'), (box as HTMLInputElement).checked])).toEqual([
      ['appointments:read', true], ['appointments:create', false], ['billing:read', false],
    ]);
    // The API refuses a page larger than 100, so the list must be read in pages.
    expect(api.getPermissions.mock.calls.map(([params]) => params)).toEqual([{ page: 1, limit: 100 }, { page: 2, limit: 100 }]);

    press(dialog, 'Save Permissions');
    await waitFor(() => expect(api.updateUserPermissions).toHaveBeenCalledWith('u-asha', ['appointments:read']));
  });

  it('does not let an unloaded permission list be saved', async () => {
    api.getPermissions.mockRejectedValue(new Error('Not Found'));
    render(<UsersManagement />);
    await screen.findByText('Asha Rao');

    press(rowOf('Asha Rao'), /Role & Permissions/);
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not load roles and permissions');
    const save = within(dialog).getByRole('button', { name: 'Save Permissions' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(api.updateUserPermissions).not.toHaveBeenCalled();
  });
});
