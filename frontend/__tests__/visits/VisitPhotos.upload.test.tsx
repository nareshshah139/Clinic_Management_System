import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VisitPhotos from '@/components/visits/VisitPhotos';

jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
const originalFetch = global.fetch;
const originalXhr = global.XMLHttpRequest;
afterEach(() => { global.fetch = originalFetch; global.XMLHttpRequest = originalXhr; });

it('uploads a single photo at once as Front, without the tagging dialog, and forwards the visit version', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }) as unknown as typeof fetch;
  const sent: { url: string; positions: string | null }[] = [];
  class FakeXhr {
    status = 200; readyState = 0; responseText = '{"visitVersion":7}'; upload = {}; onreadystatechange: (() => void) | null = null;
    url = '';
    open(_method: string, url: string) { this.url = url; }
    send(body: FormData) { sent.push({ url: this.url, positions: body.get('positions') as string | null }); this.readyState = 4; setTimeout(() => this.onreadystatechange?.(), 0); }
  }
  global.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
  const onVisitVersion = jest.fn();
  const { container } = render(<VisitPhotos visitId="current" onVisitVersion={onVisitVersion} />);
  await screen.findByText('No photos');
  const input = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
  await act(async () => { fireEvent.change(input, { target: { files: [new File(['gif'], 'lesion.gif', { type: 'image/gif' })] } }); });
  await waitFor(() => expect(onVisitVersion).toHaveBeenCalledWith(7));
  expect(sent).toEqual([{ url: '/api/visits/current/photos', positions: '["FRONT"]' }]);
  expect(screen.queryByText('Tag photo positions')).not.toBeInTheDocument();
});

it('retags the shown photo from its card and forwards the new visit version', async () => {
  const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => ({
    ok: true,
    json: async () => init?.method === 'PATCH'
      ? { items: [{ url: '/visits/current/photos/first', position: 'CLOSE_UP' }], visitVersion: 9 }
      : { items: [{ url: '/visits/current/photos/first', position: 'FRONT' }] },
  }) as Response);
  global.fetch = fetchMock as typeof fetch;
  const onVisitVersion = jest.fn();
  render(<VisitPhotos visitId="current" onVisitVersion={onVisitVersion} />);
  const position = await screen.findByRole('combobox', { name: 'Photo position' });
  expect(position).toHaveValue('FRONT');
  await act(async () => { fireEvent.change(position, { target: { value: 'CLOSE_UP' } }); });
  expect(fetchMock).toHaveBeenCalledWith('/api/visits/current/photos/first', expect.objectContaining({ method: 'PATCH', body: '{"position":"CLOSE_UP"}' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Photo position' })).toHaveValue('CLOSE_UP'));
  expect(onVisitVersion).toHaveBeenCalledWith(9);
});
