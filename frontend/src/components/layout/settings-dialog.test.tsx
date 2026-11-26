import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsDialog } from './settings-dialog';
import { apiClient } from '@/lib/api';

let signedIn: { user: Record<string, unknown>; loading: boolean; refresh: jest.Mock };
const toast = jest.fn();

jest.mock('./dashboard-user-context', () => ({ useDashboardUser: () => signedIn }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('./colour-theme-setting', () => ({ ColourThemeSetting: () => <p>Colour theme picker</p> }));
jest.mock('@/components/users/DoctorSignatureSettings', () => ({ DoctorSignatureSettings: () => <p>Signature uploader</p> }));
jest.mock('@/components/users/DoctorLetterheadSettings', () => ({ DoctorLetterheadSettings: () => <p>Letterhead uploader</p> }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getDoctorAvailability: jest.fn(),
    replaceDoctorHours: jest.fn(),
    setDoctorBookingLimit: jest.fn(),
    createTimeOff: jest.fn(),
    deleteTimeOff: jest.fn(),
    getWhatsAppTemplates: jest.fn(),
    updateUserProfile: jest.fn(),
    getClinicDetails: jest.fn(),
    updateClinicDetails: jest.fn(),
    post: jest.fn(),
  },
}));

const api = apiClient as jest.Mocked<typeof apiClient>;
const hours = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '13:00' }));
const clinic = { id: 'branch-1', name: 'Main Dermatology Clinic', address: '1 Road', city: 'Hyderabad', state: 'Telangana', pincode: '500001', phone: '9000000000', gstNumber: null };
const availability = { doctorId: 'u1', source: 'configured' as const, hours, timeOff: [] };

function signInAs(role: string, metadata: Record<string, unknown> = {}) {
  signedIn = { user: { id: 'u1', branchId: 'branch-1', role, firstName: 'Priya', lastName: 'Menon', metadata }, loading: false, refresh: jest.fn().mockResolvedValue(undefined) };
}

beforeEach(() => {
  jest.clearAllMocks();
  api.getDoctorAvailability.mockResolvedValue(availability as never);
  api.replaceDoctorHours.mockImplementation((async (_id: string, saved: typeof hours) => ({ ...availability, hours: saved })) as never);
  api.getWhatsAppTemplates.mockResolvedValue([] as never);
  api.updateUserProfile.mockResolvedValue({} as never);
  api.getClinicDetails.mockResolvedValue(clinic as never);
  api.updateClinicDetails.mockImplementation((async (_id: string, changes: object) => ({ ...clinic, ...changes })) as never);
  api.post.mockResolvedValue({ message: 'Password changed successfully' } as never);
});

async function openSettings() {
  const user = userEvent.setup();
  render(<SettingsDialog />);
  await user.click(screen.getByRole('button', { name: 'Open settings' }));
  const dialog = await screen.findByRole('dialog', { name: 'My Settings' });
  return { user, dialog };
}

const footerClose = (dialog: HTMLElement) => within(dialog).getAllByRole('button', { name: 'Close' }).find((b) => b.dataset.slot === 'button')!;
const tab = (name: RegExp | string) => screen.getByRole('tab', { name });

async function editMondayStart(user: ReturnType<typeof userEvent.setup>, value = '07:00') {
  await user.click(tab(/^Availability/));
  const start = await screen.findByLabelText('Monday shift 1 start');
  await user.clear(start);
  await user.type(start, value);
  return start;
}

describe('My Settings sections', () => {
  it('gives a doctor appearance, signature, availability, WhatsApp and password sections', async () => {
    signInAs('DOCTOR');
    await openSettings();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Appearance', 'Signature & letterhead', 'Availability', 'WhatsApp', 'Password',
    ]);
  });

  it('gives other staff only appearance and password', async () => {
    signInAs('RECEPTION');
    await openSettings();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Appearance', 'Password']);
    expect(api.getDoctorAvailability).not.toHaveBeenCalled();
  });

  it.each(['OWNER', 'ADMIN'])('gives %s a Clinic section after Appearance', async (role) => {
    signInAs(role);
    await openSettings();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Appearance', 'Clinic', 'Password']);
  });

  it('never asks a receptionist for the clinic details', async () => {
    signInAs('RECEPTION');
    await openSettings();
    expect(screen.queryByRole('tab', { name: /Clinic/ })).toBeNull();
    expect(api.getClinicDetails).not.toHaveBeenCalled();
  });

  it('has no footer Save that saves one section and closes the rest', async () => {
    signInAs('DOCTOR');
    const { dialog } = await openSettings();
    expect(within(dialog).queryByRole('button', { name: 'Save' })).toBeNull();
  });
});

describe('closing with unsaved working hours', () => {
  it('asks before discarding, keeps the edit when told to keep editing, and closes when told to discard', async () => {
    signInAs('DOCTOR');
    const { user, dialog } = await openSettings();
    await editMondayStart(user);

    await user.click(footerClose(dialog));
    const ask = await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' });
    expect(ask).toHaveTextContent('Availability');
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'My Settings' })).toBeInTheDocument();
    expect(screen.getByLabelText('Monday shift 1 start')).toHaveValue('07:00');

    await user.click(footerClose(screen.getByRole('dialog', { name: 'My Settings' })));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'My Settings' })).toBeNull());
    expect(api.replaceDoctorHours).not.toHaveBeenCalled();
  });

  it('shows the saved hours again, not the discarded edit, when reopened', async () => {
    signInAs('DOCTOR');
    const { user, dialog } = await openSettings();
    await editMondayStart(user);
    await user.click(footerClose(dialog));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'My Settings' })).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(await screen.findByRole('tab', { name: /^Availability/ }));
    expect(await screen.findByLabelText('Monday shift 1 start')).toHaveValue('09:00');
  });

  it('asks when settings is dismissed with Escape too', async () => {
    signInAs('DOCTOR');
    const { user } = await openSettings();
    await editMondayStart(user);
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    expect(screen.getByLabelText('Monday shift 1 start')).toHaveValue('07:00');
  });

  it('marks the section that holds the unsaved edit and keeps it while another section is open', async () => {
    signInAs('DOCTOR');
    const { user } = await openSettings();
    await editMondayStart(user);
    await user.click(tab('WhatsApp'));
    expect(tab(/^Availability/)).toHaveAccessibleName('Availability (unsaved changes)');
    await user.click(tab(/^Availability/));
    expect(screen.getByLabelText('Monday shift 1 start')).toHaveValue('07:00');
  });

  it('closes without asking once the hours are saved', async () => {
    signInAs('DOCTOR');
    const { user, dialog } = await openSettings();
    await editMondayStart(user);
    await user.click(screen.getByRole('button', { name: 'Save hours' }));
    expect(await screen.findByText('Working hours saved.')).toBeInTheDocument();
    expect(tab(/^Availability/)).toHaveAccessibleName('Availability');
    await user.click(footerClose(dialog));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'My Settings' })).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('closes straight away when nothing was edited', async () => {
    signInAs('DOCTOR');
    const { user, dialog } = await openSettings();
    await user.click(tab(/^Availability/));
    await screen.findByLabelText('Monday shift 1 start');
    await user.click(footerClose(dialog));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'My Settings' })).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('WhatsApp section', () => {
  it('saves its own preferences, stays open, and then closes without asking', async () => {
    signInAs('DOCTOR', { department: 'Skin' });
    const { user, dialog } = await openSettings();
    await user.click(tab('WhatsApp'));
    const save = screen.getByRole('button', { name: 'Save WhatsApp settings' });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole('switch', { name: 'Send WhatsApp on appointment creation' }));
    expect(tab(/^WhatsApp/)).toHaveAccessibleName('WhatsApp (unsaved changes)');
    await user.click(save);

    await waitFor(() => expect(api.updateUserProfile).toHaveBeenCalledTimes(1));
    const [id, body] = api.updateUserProfile.mock.calls[0];
    expect(id).toBe('u1');
    expect(body).toEqual({ metadata: expect.objectContaining({ department: 'Skin', whatsappAutoConfirmAppointments: true, whatsappUseTemplate: false }) });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'WhatsApp settings saved' }));
    expect(signedIn.refresh).toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'My Settings' })).toBeInTheDocument();

    await user.click(footerClose(dialog));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'My Settings' })).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks before discarding an unsaved WhatsApp change', async () => {
    signInAs('DOCTOR');
    const { user, dialog } = await openSettings();
    await user.click(tab('WhatsApp'));
    await user.click(screen.getByRole('switch', { name: 'Use WhatsApp template' }));
    await user.click(footerClose(dialog));
    expect(await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' })).toHaveTextContent('WhatsApp');
    expect(api.updateUserProfile).not.toHaveBeenCalled();
  });

  it('does not save a template choice that names no template', async () => {
    signInAs('DOCTOR');
    const { user } = await openSettings();
    await user.click(tab('WhatsApp'));
    await user.click(screen.getByRole('switch', { name: 'Use WhatsApp template' }));
    await user.click(screen.getByRole('button', { name: 'Save WhatsApp settings' }));
    expect(api.updateUserProfile).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'WhatsApp settings incomplete' }));
  });

  it('names every section that holds an unsaved edit', async () => {
    signInAs('DOCTOR');
    const { user, dialog } = await openSettings();
    await editMondayStart(user);
    await user.click(tab('WhatsApp'));
    await user.click(screen.getByRole('switch', { name: 'Send WhatsApp on appointment creation' }));
    await user.click(footerClose(dialog));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Availability and WhatsApp have changes you have not saved.');
  });
});

describe('Password section', () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>, current: string, next: string, confirm: string) => {
    await user.click(tab('Password'));
    await user.type(screen.getByLabelText('Current password'), current);
    await user.type(screen.getByLabelText('New password'), next);
    await user.type(screen.getByLabelText('Confirm new password'), confirm);
  };

  it('changes the signed-in user\'s own password and clears the form', async () => {
    signInAs('RECEPTION');
    const { user } = await openSettings();
    await fill(user, 'old-pass-123', 'new-pass-456', 'new-pass-456');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/users/u1/change-password', {
      currentPassword: 'old-pass-123', newPassword: 'new-pass-456', confirmPassword: 'new-pass-456',
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Password changed' }));
    await waitFor(() => expect(screen.getByLabelText('Current password')).toHaveValue(''));
  });

  it('explains a mismatch and sends nothing', async () => {
    signInAs('RECEPTION');
    const { user } = await openSettings();
    await fill(user, 'old-pass-123', 'new-pass-456', 'new-pass-457');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The new password and its confirmation do not match.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('explains a password outside 8 to 72 characters', async () => {
    signInAs('RECEPTION');
    const { user } = await openSettings();
    await fill(user, 'old-pass-123', 'short', 'short');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The new password must be 8 to 72 characters.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('shows the server\'s reason when the current password is wrong', async () => {
    signInAs('RECEPTION');
    api.post.mockRejectedValue(Object.assign(new Error('Current password is incorrect'), { status: 400 }) as never);
    const { user } = await openSettings();
    await fill(user, 'wrong-pass-1', 'new-pass-456', 'new-pass-456');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Current password is incorrect');
    expect(screen.getByLabelText('Current password')).toHaveValue('wrong-pass-1');
  });

  it('asks before discarding a half-typed password', async () => {
    signInAs('RECEPTION');
    const { user, dialog } = await openSettings();
    await user.click(tab('Password'));
    await user.type(screen.getByLabelText('Current password'), 'abc');
    await user.click(footerClose(dialog));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Password has changes you have not saved.');
  });
});

describe('Clinic section', () => {
  async function openClinic() {
    signInAs('ADMIN');
    const opened = await openSettings();
    await opened.user.click(tab(/^Clinic/));
    const name = await screen.findByLabelText('Clinic name');
    return { ...opened, name };
  }

  it('shows the clinic the admin belongs to', async () => {
    const { name } = await openClinic();
    expect(api.getClinicDetails).toHaveBeenCalledWith('branch-1');
    expect(name).toHaveValue('Main Dermatology Clinic');
    expect(screen.getByLabelText('GSTIN')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save clinic details' })).toBeDisabled();
  });

  it('saves only the changed field, trimmed, to the admin’s own branch', async () => {
    const { user, name } = await openClinic();
    await user.clear(name);
    await user.type(name, '  Linaé Skin, Hair and Aesthetic Clinic  ');
    await user.click(screen.getByRole('button', { name: 'Save clinic details' }));

    await waitFor(() => expect(api.updateClinicDetails).toHaveBeenCalledWith('branch-1', { name: 'Linaé Skin, Hair and Aesthetic Clinic' }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success', title: 'Clinic details saved' }));
    expect(name).toHaveValue('Linaé Skin, Hair and Aesthetic Clinic');
    expect(screen.getByRole('button', { name: 'Save clinic details' })).toBeDisabled();
  });

  it('refuses a blank clinic name without calling the server', async () => {
    const { user, name } = await openClinic();
    await user.clear(name);
    await user.type(name, '   ');
    await user.click(screen.getByRole('button', { name: 'Save clinic details' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the clinic name');
    expect(api.updateClinicDetails).not.toHaveBeenCalled();
  });

  it('says why a save failed and keeps what was typed', async () => {
    api.updateClinicDetails.mockRejectedValueOnce(new Error('Branch with this name already exists'));
    const { user, name } = await openClinic();
    await user.clear(name);
    await user.type(name, 'Taken name');
    await user.click(screen.getByRole('button', { name: 'Save clinic details' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Branch with this name already exists');
    expect(name).toHaveValue('Taken name');
  });

  it('warns before closing with an unsaved clinic name', async () => {
    const { user, dialog, name } = await openClinic();
    await user.type(name, ' Two');
    expect(screen.getByRole('tab', { name: /Clinic.*unsaved/ })).toBeInTheDocument();
    await user.click(footerClose(dialog));
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
  });
});
