import { fireEvent, render, screen } from '@testing-library/react';
import LoginPage from '@/app/login/page';
import { apiClient } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));
jest.mock('@/lib/api', () => ({ apiClient: { login: jest.fn() } }));

describe('login form', () => {
  beforeEach(() => (apiClient.login as jest.Mock).mockReset());

  it('names the clinic, shows no fake saved password, and lets Sign in be pressed empty', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in to Linaé');
    expect(screen.getByRole('img', { name: 'Linaé Skin, Hair & Aesthetic Clinic' })).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('placeholder');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('says what is missing next to each empty field when Sign in is pressed', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByLabelText('Phone or email')).toHaveAccessibleDescription('Enter your phone number or email.');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.');
    expect(screen.getByLabelText('Phone or email')).toHaveFocus();
    expect(apiClient.login).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Phone or email'), { target: { value: '9000000001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByLabelText('Phone or email')).not.toHaveAccessibleDescription();
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.');
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(apiClient.login).not.toHaveBeenCalled();
  });

  it('signs in once both fields are filled', () => {
    (apiClient.login as jest.Mock).mockResolvedValue({});
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone or email'), { target: { value: ' 9000000001 ' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((apiClient.login as jest.Mock).mock.calls).toEqual([['9000000001', 'password123']]);
  });

  it('leads a failed sign-in with the reason and shows the support reference apart', async () => {
    (apiClient.login as jest.Mock).mockRejectedValue(new Error('Invalid credentials (Reference: 2d5455c9-7f62-4182-9f72-21662ce6e1d6)'));
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone or email'), { target: { value: '9999999990' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    const alert = await screen.findByRole('alert');
    expect([...alert.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['Invalid credentials', 'Reference: 2d5455c9-7f62-4182-9f72-21662ce6e1d6']);
  });
});
