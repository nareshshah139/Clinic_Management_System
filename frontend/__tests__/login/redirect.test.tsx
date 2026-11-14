import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from '@/app/login/page';
import { apiClient } from '@/lib/api';

const replace = jest.fn();
let next: string | null = null;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => ({ get: () => next }),
}));
jest.mock('next/image', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/api', () => ({ apiClient: { login: jest.fn() } }));

describe('login return destination', () => {
  beforeEach(() => {
    replace.mockReset();
    (apiClient.login as jest.Mock).mockResolvedValue({});
  });

  it.each(['https://example.com', '//example.com/path', '/\\example.com', 'javascript:alert(1)'])(
    'sends unsafe destination %s to the dashboard', async (destination) => {
      next = destination;
      render(<LoginPage />);
      fireEvent.change(screen.getByLabelText('Phone or email'), { target: { value: 'doctor@example.com' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
      fireEvent.submit(screen.getByLabelText('Password').closest('form')!);
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    },
  );

  it('preserves a local destination and its query and fragment', async () => {
    next = '/dashboard/appointments?day=2026-11-08#today';
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone or email'), { target: { value: 'doctor@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByLabelText('Password').closest('form')!);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(next));
  });
});
