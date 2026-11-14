import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailSettingsSection } from './EmailSettingsSection';
import { apiClient } from '@/lib/api';

const toast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/lib/api', () => ({ apiClient: { getEmailStatus: jest.fn(), sendTestEmail: jest.fn() } }));

const api = apiClient as unknown as Record<string, jest.Mock>;
const renderSection = (props = {}) =>
  render(<EmailSettingsSection autoConfirm onAutoConfirmChange={jest.fn()} description="d" allowTest {...props} />);

describe('EmailSettingsSection', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    toast.mockReset();
  });

  it('shows the sender when email is configured and toasts the test result', async () => {
    api.getEmailStatus.mockResolvedValue({ configured: true, from: 'clinic@example.test' });
    api.sendTestEmail.mockResolvedValue({ sent: true, to: 'doc@example.test' });
    renderSection();
    expect(await screen.findByText('Sending from clinic@example.test')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Send test email' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ variant: 'success', title: 'Test email sent', description: 'Check the inbox of doc@example.test.' }));
  });

  it('explains the missing setup and blocks the test button when SMTP is not configured', async () => {
    api.getEmailStatus.mockResolvedValue({ configured: false, from: null });
    renderSection();
    expect(await screen.findByText("Email isn't set up on the server yet. Ask an admin to configure SMTP.")).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Send test email' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('surfaces the server error when the test email fails', async () => {
    api.getEmailStatus.mockResolvedValue({ configured: true, from: 'clinic@example.test' });
    api.sendTestEmail.mockRejectedValue(new Error('Your account has no email address to send a test to.'));
    renderSection();
    await screen.findByText('Sending from clinic@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send test email' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ variant: 'warning', title: 'Test email failed', description: 'Your account has no email address to send a test to.' }));
  });

  it('hides the test button when not allowed', async () => {
    api.getEmailStatus.mockResolvedValue({ configured: true, from: 'x' });
    renderSection({ allowTest: false });
    await screen.findByText('Sending from x');
    expect(screen.queryByRole('button', { name: 'Send test email' })).toBeNull();
  });
});
