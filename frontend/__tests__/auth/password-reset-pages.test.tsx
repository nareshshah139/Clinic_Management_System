import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { apiClient } from '@/lib/api';
import ForgotPasswordPage from '@/app/forgot-password/page';
import ResetPasswordPage from '@/app/reset-password/page';

const mockReplace = jest.fn();
let mockToken: string | null = 'a'.repeat(64);
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({ get: () => mockToken }),
}));

describe('Forgot password page', () => {
  it('sends the email and shows the same confirmation whatever the account', async () => {
    const forgot = jest.spyOn(apiClient, 'forgotPassword').mockResolvedValue({ message: 'ok' } as any);
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' asha@example.test ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a reset link' }));
    expect(await screen.findByText(/If an account exists for/)).toBeInTheDocument();
    expect(forgot).toHaveBeenCalledWith('asha@example.test');
  });
});

describe('Reset password page', () => {
  beforeEach(() => { mockToken = 'a'.repeat(64); mockReplace.mockReset(); });

  it('sets the new password and returns to sign in', async () => {
    const reset = jest.spyOn(apiClient, 'resetPassword').mockResolvedValue({ message: 'ok' } as any);
    render(<ResetPasswordPage />);
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'fresh-pass-1' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'fresh-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByText(/Password updated/)).toBeInTheDocument();
    expect(reset).toHaveBeenCalledWith('a'.repeat(64), 'fresh-pass-1', 'fresh-pass-1');
  });

  it('catches a mismatch before calling the server', async () => {
    const reset = jest.spyOn(apiClient, 'resetPassword').mockResolvedValue({ message: 'ok' } as any);
    reset.mockClear();
    render(<ResetPasswordPage />);
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'fresh-pass-1' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'fresh-pass-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByText('The two passwords do not match.')).toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
  });

  it('offers a new link when this one has expired', async () => {
    jest.spyOn(apiClient, 'resetPassword').mockRejectedValue(new Error('This reset link is invalid or has expired. Request a new one.'));
    render(<ResetPasswordPage />);
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'fresh-pass-1' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'fresh-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password'));
  });

  it('explains a link without a reset code', async () => {
    mockToken = null;
    render(<ResetPasswordPage />);
    expect(await screen.findByText(/missing its reset code/)).toBeInTheDocument();
  });
});
