import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import UsersManagement from './UsersManagement';
import { apiClient } from '@/lib/api';

jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getUsers: jest.fn(), getPermissions: jest.fn(), getUserPermissions: jest.fn(), assignRole: jest.fn(),
    createUser: jest.fn(), updateUser: jest.fn(), updateUserPermissions: jest.fn(),
  },
}));
jest.mock('@/components/users/DoctorAvailabilitySettings', () => ({ BranchHolidaySettings: () => null, DoctorAvailabilitySettings: () => null }));
jest.mock('@/components/users/ResetCodeButton', () => ({ ResetCodeButton: () => null }));

const api = apiClient as unknown as Record<string, jest.Mock>;
const USERS = [
  { id: 'u-asha', firstName: 'Asha', lastName: 'Rao', email: 'asha@example.test', phone: '9000000001', role: 'NURSE', status: 'ACTIVE', permissions: null },
  { id: 'u-vikram', firstName: 'Vikram', lastName: 'Iyer', email: 'vikram@example.test', phone: '9000000002', role: 'RECEPTION', status: 'ACTIVE' },
];

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
const press = (scope: HTMLElement, name: string | RegExp) => fireEvent.click(within(scope).getByRole('button', { name }));
const fieldValues = () => within(screen.getByRole('dialog')).getAllByRole('textbox').map((input) => (input as HTMLInputElement).value);

describe('UsersManagement', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    api.getUsers.mockResolvedValue({ users: USERS });
    api.getUserPermissions.mockResolvedValue({ permissions: [], always: [] });
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

  it('lists every permission, page by page, ticks the set the server says the user holds, and saves exactly the ticked set', async () => {
    api.getPermissions.mockImplementation(async ({ page }: { page: number }) => ({
      permissions: page === 1 ? [{ name: 'appointments:read' }, { name: 'appointments:create' }] : [{ name: 'billing:read' }],
      pagination: { totalPages: 2 },
    }));
    api.getUserPermissions.mockResolvedValue({ permissions: ['appointments:read', 'appointments:create'], always: [] });
    render(<UsersManagement />);
    await screen.findByText('Asha Rao');

    press(rowOf('Asha Rao'), /Role & Permissions/);
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByRole('checkbox', { name: 'billing:read' });
    expect(within(dialog).getAllByRole('checkbox').map((box) => [box.getAttribute('aria-label'), (box as HTMLInputElement).checked])).toEqual([
      ['appointments:read', true], ['appointments:create', true], ['billing:read', false],
    ]);
    expect(api.getUserPermissions.mock.calls).toEqual([['u-asha']]);
    // The API refuses a page larger than 100, so the list must be read in pages.
    expect(api.getPermissions.mock.calls.map(([params]) => params)).toEqual([{ page: 1, limit: 100 }, { page: 2, limit: 100 }]);
    expect(within(dialog).queryByText(/always has/)).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'appointments:read' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'billing:read' }));
    press(dialog, 'Save Permissions');
    await waitFor(() => expect(api.updateUserPermissions.mock.calls).toEqual([['u-asha', ['appointments:create', 'billing:read']]]));
  });

  it.each([
    ['a custom set', ['billing:read']],
    ['an emptied set', []],
  ])('ticks %s held on the server, and saves it back unchanged', async (_label, held) => {
    api.getUserPermissions.mockResolvedValue({ permissions: held, always: [] });
    api.getPermissions.mockResolvedValue({
      permissions: [{ name: 'appointments:read' }, { name: 'billing:read' }],
      pagination: { totalPages: 1 },
    });
    render(<UsersManagement />);
    await screen.findByText('Asha Rao');

    press(rowOf('Asha Rao'), /Role & Permissions/);
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByRole('checkbox', { name: 'billing:read' });
    const ticked = within(dialog).getAllByRole('checkbox').filter((box) => (box as HTMLInputElement).checked).map((box) => box.getAttribute('aria-label'));
    expect(ticked).toEqual(held);

    press(dialog, 'Save Permissions');
    await waitFor(() => expect(api.updateUserPermissions).toHaveBeenCalledWith('u-asha', held));
  });

  it.each([
    [['*'], 'This role always has every permission; unticking cannot remove them.'],
    [['pharmacy:*', 'inventory:*'], 'This role always has pharmacy:*, inventory:*; unticking cannot remove them.'],
  ])('says the role always has %j', async (always, line) => {
    api.getUserPermissions.mockResolvedValue({ permissions: [], always });
    api.getPermissions.mockResolvedValue({ permissions: [{ name: 'billing:read' }], pagination: { totalPages: 1 } });
    render(<UsersManagement />);
    await screen.findByText('Asha Rao');

    press(rowOf('Asha Rao'), /Role & Permissions/);
    expect(await within(screen.getByRole('dialog')).findByText(line)).toBeInTheDocument();
  });

  it('ticks the held set the server returns after Apply Role', async () => {
    api.getPermissions.mockResolvedValue({
      permissions: [{ name: 'appointments:read' }, { name: 'billing:read' }],
      pagination: { totalPages: 1 },
    });
    api.getUserPermissions
      .mockResolvedValueOnce({ permissions: ['appointments:read'], always: [] })
      .mockResolvedValueOnce({ permissions: ['billing:read'], always: [] });
    api.assignRole.mockResolvedValue({});
    render(<UsersManagement />);
    await screen.findByText('Asha Rao');

    press(rowOf('Asha Rao'), /Role & Permissions/);
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'appointments:read' })).toBeChecked());
    press(dialog, 'Apply Role');
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'billing:read' })).toBeChecked());
    expect(within(dialog).getByRole('checkbox', { name: 'appointments:read' })).not.toBeChecked();
    expect(api.assignRole.mock.calls).toEqual([['u-asha', { role: 'NURSE' }]]);
  });

  it.each([
    ['the permission names', () => api.getPermissions.mockRejectedValue(new Error('Not Found'))],
    ['the held set', () => {
      api.getPermissions.mockResolvedValue({ permissions: [{ name: 'billing:read' }], pagination: { totalPages: 1 } });
      api.getUserPermissions.mockRejectedValue(new Error('Forbidden'));
    }],
  ])('does not let a list be saved when %s failed to load', async (_label, fail) => {
    fail();
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
