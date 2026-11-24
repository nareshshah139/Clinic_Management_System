import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from '@/app/login/page';
import { apiClient } from '@/lib/api';

const replace = jest.fn();
let params = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}));
jest.mock('next/image', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/api', () => ({ apiClient: { login: jest.fn() } }));

function signIn() {
  fireEvent.change(screen.getByLabelText('Phone or email'), { target: { value: 'doctor@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('login after the session expired', () => {
  beforeEach(() => {
    replace.mockReset();
    window.localStorage.clear();
    (apiClient.login as jest.Mock).mockResolvedValue({});
  });

  it('says the session expired when sent here for that reason', () => {
    params = new URLSearchParams('next=%2Fdashboard%2Fbilling&reason=expired');
    render(<LoginPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Your session expired. Sign in again to continue where you left off.');
  });

  it('shows no expiry banner on a normal visit', () => {
    params = new URLSearchParams();
    render(<LoginPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in to Linaé');
    expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument();
  });

  it('returns to the page saved at expiry when the link lost its next parameter', async () => {
    params = new URLSearchParams('reason=expired');
    window.localStorage.setItem('cms_next_after_login', '/dashboard/billing?invoice=inv-7');
    render(<LoginPage />);
    signIn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/billing?invoice=inv-7'));
    expect(window.localStorage.getItem('cms_next_after_login')).toBeNull();
  });
});
