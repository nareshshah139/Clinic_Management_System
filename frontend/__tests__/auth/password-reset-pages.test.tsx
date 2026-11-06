import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { apiClient } from '@/lib/api';
import ResetPasswordPage from '@/app/reset-password/page';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace }) }));

const fill = (code: string, password: string, confirm = password) => {
  fireEvent.change(screen.getByLabelText('Reset code'), { target: { value: code } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
};

describe('Reset password page', () => {
  it('sets the new password with the code an admin gave', async () => {
    const reset = jest.spyOn(apiClient, 'resetPassword').mockResolvedValue({ message: 'ok' } as any);
    render(<ResetPasswordPage />);
    fill(' abcd-efgh ', 'fresh-pass-1');
    expect(await screen.findByText(/Password updated/)).toBeInTheDocument();
    expect(reset).toHaveBeenCalledWith('abcd-efgh', 'fresh-pass-1', 'fresh-pass-1');
  });

  it('catches a mismatch before calling the server', async () => {
    const reset = jest.spyOn(apiClient, 'resetPassword').mockResolvedValue({ message: 'ok' } as any);
    reset.mockClear();
    render(<ResetPasswordPage />);
    fill('ABCD-EFGH', 'fresh-pass-1', 'fresh-pass-2');
    expect(await screen.findByText('The two passwords do not match.')).toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
  });

  it('shows the server message for a used or expired code', async () => {
    jest.spyOn(apiClient, 'resetPassword').mockRejectedValue(new Error('This reset code is invalid or has expired. Ask an admin for a new one.'));
    render(<ResetPasswordPage />);
    fill('ABCD-EFGH', 'fresh-pass-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Ask an admin for a new one');
  });
});
