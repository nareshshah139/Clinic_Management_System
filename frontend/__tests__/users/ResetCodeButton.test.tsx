import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { apiClient } from '@/lib/api';
import { ResetCodeButton } from '@/components/users/ResetCodeButton';

describe('ResetCodeButton', () => {
  const user = { id: 'u1', firstName: 'Riya', lastName: 'Sharma' };

  it('creates a code only after the admin confirms who is asking, then shows it once', async () => {
    const issue = jest.spyOn(apiClient, 'issueResetCode').mockResolvedValue({ code: 'K7QM-4XPD', expiresAt: '2026-11-07T09:00:00.000Z' });
    render(<ResetCodeButton user={user} />);
    fireEvent.click(screen.getByRole('button', { name: /Reset password/ }));
    expect(issue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /I have confirmed who is asking/ }));
    expect(await screen.findByLabelText('Reset code')).toHaveTextContent('K7QM-4XPD');
    expect(issue).toHaveBeenCalledWith('u1');
  });

  it('explains when the admin may not reset this user', async () => {
    jest.spyOn(apiClient, 'issueResetCode').mockRejectedValue(new Error('You cannot reset the password of a user at or above your role.'));
    render(<ResetCodeButton user={user} />);
    fireEvent.click(screen.getByRole('button', { name: /Reset password/ }));
    fireEvent.click(screen.getByRole('button', { name: /I have confirmed who is asking/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('at or above your role');
  });
});
