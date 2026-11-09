import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VisitPhotos from '@/components/visits/VisitPhotos';

jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
beforeEach(() => jest.spyOn(window, 'confirm').mockReturnValue(true));
afterEach(() => jest.restoreAllMocks());

it('deletes the clicked thumbnail using a single API prefix', async () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => ({
    ok: true,
    json: async () => init?.method === 'DELETE' ? { items: [] } : {
      items: [
        { url: '/api/visits/current/photos/first' },
        { url: '/api/visits/current/photos/second' },
      ],
    },
  }) as Response);
  global.fetch = fetchMock as typeof fetch;
  try {
    render(<VisitPhotos visitId="current" allowDelete />);
    const buttons = await screen.findAllByRole('button', { name: 'Delete photo' });
    fireEvent.click(buttons[1]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/visits/current/photos/second', {
      method: 'DELETE', credentials: 'include',
    }));
  } finally {
    global.fetch = originalFetch;
  }
});
