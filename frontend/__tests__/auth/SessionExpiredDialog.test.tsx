import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionExpiredDialog } from '@/components/auth/SessionExpiredDialog';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import { apiClient } from '@/lib/api';
import { sendSessionEvent } from '@/lib/authRedirect';
import type { User } from '@/lib/types';

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const originalLocation = window.location;
const pageUrl = 'http://localhost/dashboard/visits/new';
const logout = jest.fn();

function renderDashboardPage() {
  const user = { id: 'doctor-1', email: 'doctor@example.com' } as User;
  render(
    <DashboardUserProvider value={{ user, loading: false, refresh: jest.fn(), logout }}>
      <label htmlFor="notes">Clinical notes</label>
      <textarea id="notes" defaultValue="" />
      <SessionExpiredDialog />
    </DashboardUserProvider>,
  );
  fireEvent.change(screen.getByLabelText('Clinical notes'), { target: { value: 'Plaque psoriasis, start calcipotriol' } });
}

async function expireSession() {
  (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401));
  await act(async () => { await apiClient.getSystemAlerts().catch(() => undefined); });
}

describe('SessionExpiredDialog', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    delete (window as any).location;
    (window as any).location = { pathname: '/dashboard/visits/new', search: '', hash: '', href: pageUrl, assign: jest.fn() };
  });

  afterEach(() => {
    act(() => {
      sendSessionEvent('submitted');
      sendSessionEvent('signedIn');
    });
    (window as any).location = originalLocation;
  });

  it('asks for sign-in over the page on a 401 and keeps unsaved notes after signing back in', async () => {
    renderDashboardPage();
    await expireSession();

    expect(screen.getByRole('dialog', { name: 'Your session expired' })).toBeInTheDocument();
    expect(window.location.href).toBe(pageUrl);
    expect(screen.getByLabelText('Phone or email')).toHaveValue('doctor@example.com');

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ user: { id: 'doctor-1' } }));
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Clinical notes')).toHaveValue('Plaque psoriasis, start calcipotriol');
    expect(window.location.href).toBe(pageUrl);
  });

  it('stays open with the reason when the password is wrong', async () => {
    renderDashboardPage();
    await expireSession();

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ message: 'Invalid credentials' }, 401));
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
    expect(screen.getByRole('dialog', { name: 'Your session expired' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('leaves the page when someone else signs in, so the previous user\'s draft is not shown to them', async () => {
    renderDashboardPage();
    await expireSession();

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ user: { id: 'reception-2' } }));
    fireEvent.change(screen.getByLabelText('Phone or email'), { target: { value: 'reception@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith('/dashboard'));
  });
});
