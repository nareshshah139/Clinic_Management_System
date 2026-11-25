import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VisitPhotos from '@/components/visits/VisitPhotos';
import { apiClient } from '@/lib/api';

jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/api', () => ({ apiClient: { getAllPatientVisitHistory: jest.fn().mockResolvedValue([]), get: jest.fn().mockResolvedValue({ items: [] }) } }));
jest.setTimeout(60_000);

const photos = (items: unknown[]) => jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (init?.method === 'DELETE') return { ok: true, json: async () => ({ items: [] }) } as Response;
  if (url.includes('/visits/old/photos')) return { ok: true, json: async () => ({ items: [
    { url: '/uploads/old-close-1.jpg', position: 'CLOSE_UP', uploadedAt: '2026-01-01T00:00:00Z' },
    { url: '/uploads/old-close-2.jpg', position: 'CLOSE_UP', uploadedAt: '2026-01-01T00:01:00Z' },
  ] }) } as Response;
  return { ok: true, json: async () => ({ items }) } as Response;
});

const current = [
  { url: '/api/visits/cur/photos/a', position: 'CLOSE_UP', uploadedAt: '2026-02-01T00:00:00Z' },
  { url: '/api/visits/cur/photos/b', position: 'CLOSE_UP', uploadedAt: '2026-02-01T00:01:00Z' },
];

let originalFetch: typeof fetch;
beforeEach(() => { originalFetch = global.fetch; });
afterEach(() => { global.fetch = originalFetch; jest.clearAllMocks(); jest.restoreAllMocks(); });

it('offers no upload, camera or delete controls when read only', async () => {
  global.fetch = photos(current) as unknown as typeof fetch;
  render(<VisitPhotos visitId="cur" allowDelete readOnly />);
  await screen.findByText('Before / After Photos (2)');
  expect(screen.queryByRole('button', { name: /upload/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /camera/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
});

it('keeps upload and delete when editable', async () => {
  global.fetch = photos(current) as unknown as typeof fetch;
  render(<VisitPhotos visitId="cur" allowDelete />);
  await screen.findByText('Before / After Photos (2)');
  expect(screen.getByRole('button', { name: /upload/i })).toBeEnabled();
  expect(screen.getAllByRole('button', { name: /delete/i }).length).toBeGreaterThan(0);
});

it('does not send a 26MB file to the upload API', async () => {
  const fetchMock = photos([]);
  global.fetch = fetchMock as unknown as typeof fetch;
  const open = jest.fn();
  URL.createObjectURL = () => 'blob:preview';
  URL.revokeObjectURL = () => {};
  jest.spyOn(window, 'XMLHttpRequest').mockImplementation(function (this: any) { this.open = open; this.send = jest.fn(); this.setRequestHeader = jest.fn(); this.upload = {}; } as any);
  const { container } = render(<VisitPhotos visitId="cur" />);
  await screen.findByText(/No photos attached/);
  const big = new File(['x'], 'huge.jpg', { type: 'image/jpeg' });
  Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [big] } });
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /upload/i }));
  await waitFor(() => expect(screen.queryByText('Uploading...')).toBeNull());
  expect(open).not.toHaveBeenCalled();
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
});

it('reaches every photo of the same position in compare mode and deletes only the visible one', async () => {
  const fetchMock = photos(current);
  global.fetch = fetchMock as unknown as typeof fetch;
  (apiClient.getAllPatientVisitHistory as jest.Mock).mockResolvedValue([
    { id: 'old', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'cur', createdAt: '2026-02-01T00:00:00Z' },
  ]);
  render(<VisitPhotos visitId="cur" patientId="p" allowDelete />);
  await screen.findByText('Before / After Photos (2)');
  fireEvent.click(screen.getByRole('button', { name: 'Compare: Off' }));
  expect(await screen.findByText(/Position: Close-up • 1 \/ 2/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByAltText('before')).toHaveAttribute('src', '/uploads/old-close-1.jpg'));
  fireEvent.click(screen.getAllByRole('button', { name: 'Next' })[0]);
  expect(await screen.findByText(/Position: Close-up • 2 \/ 2/)).toBeInTheDocument();
  expect(screen.getByAltText('after')).toHaveAttribute('src', '/api/visits/cur/photos/b');
  fireEvent.click(screen.getAllByRole('button', { name: /^delete$/i })[0]);
  const ask = await screen.findByRole('alertdialog');
  fireEvent.click(within(ask).getByRole('button', { name: 'Delete photo' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/visits/cur/photos/b', { method: 'DELETE', credentials: 'include' }));
});
