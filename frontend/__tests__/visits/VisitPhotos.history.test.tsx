import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import VisitPhotos from '@/components/visits/VisitPhotos';
import { apiClient } from '@/lib/api';
jest.mock('@/lib/api', () => ({ apiClient: { getAllPatientVisitHistory: jest.fn(), get: jest.fn() } }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
const originalFetch = global.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
  (apiClient.getAllPatientVisitHistory as jest.Mock).mockResolvedValue([{ id: 'old', entryType: 'visit', createdAt: '2025-01-01T12:00:00Z', photoPreviewUrls: ['/visits/old/photos/image'] }]);
  (apiClient.get as jest.Mock).mockResolvedValue({ items: [{ url: '/visits/photos/draft/p/20250102/draft', dateStr: '20250102' }] });
});
afterEach(() => { global.fetch = originalFetch; });
it('shows previous visit and older unattached photos even when the current visit is empty', async () => {
  render(<VisitPhotos patientId="p" visitId="current" />);
  expect(await screen.findByText('No photos attached to this visit')).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'Open visit photo 1 from 1 Jan 2025' })).toHaveAttribute('href', '/api/visits/old/photos/image');
  expect(await screen.findByRole('link', { name: 'Open unattached photo 1 from 2 Jan 2025' })).toHaveAttribute('href', '/api/visits/photos/draft/p/20250102/draft');
  expect(apiClient.getAllPatientVisitHistory).toHaveBeenCalledWith('p', false);
  expect(apiClient.get).toHaveBeenCalledWith('/visits/photos/draft/p?allDates=true');
});
it('shows a loading failure instead of falsely claiming no photos and supports retry', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });
  render(<VisitPhotos patientId="p" visitId="current" />);
  expect(await screen.findByText('Unable to load this visit’s photos. Please retry.')).toBeInTheDocument();
  expect(screen.queryByText('No photos attached to this visit')).not.toBeInTheDocument();
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ items: [{ url: '/visits/current/photos/photo' }] }) });
  fireEvent.click(screen.getByRole('button', { name: 'Retry visit photos' }));
  await waitFor(() => expect(screen.getByAltText('visit')).toHaveAttribute('src', '/api/visits/current/photos/photo'));
});
it('does not hide successfully loaded visit photos when the draft archive request fails', async () => {
  (apiClient.get as jest.Mock).mockRejectedValue(new Error('Offline'));
  render(<VisitPhotos patientId="p" visitId="current" />);
  expect(await screen.findByText('Unattached uploads could not be loaded.')).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'Open visit photo 1 from 1 Jan 2025' })).toBeInTheDocument();
});

it('advances the editor version only from a successful photo mutation', async () => {
  const onVisitVersion = jest.fn();
  (global.fetch as jest.Mock).mockImplementation(async (_url, init) => ({ ok: true, json: async () => init?.method === 'DELETE'
    ? { items: [], visitVersion: 8 }
    : { items: [{ url: '/visits/current/photos/photo' }], visitVersion: 7 } }));
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  try {
    render(<VisitPhotos patientId="p" visitId="current" allowDelete onVisitVersion={onVisitVersion} />);
    await screen.findByAltText('visit');
    expect(onVisitVersion).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    await screen.findByText('No photos attached to this visit');
    expect(onVisitVersion).toHaveBeenCalledWith(8);
  } finally { confirm.mockRestore(); }
});


it.each(['/visits/current/photos/photo', '/uploads/legacy.jpg', '/visits/photos/draft/p/20250102/photo'])('reports deletion conflicts for %s without acknowledging a version', async url => {
  const onClinicalConflict = jest.fn();
  const onVisitVersion = jest.fn();
  (global.fetch as jest.Mock).mockImplementation(async (_url, init) => init?.method === 'DELETE'
    ? { ok: false, status: 409 }
    : { ok: true, json: async () => ({ items: [{ url }], visitVersion: 4 }) });
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  try {
    render(<VisitPhotos patientId="p" visitId="current" allowDelete onClinicalConflict={onClinicalConflict} onVisitVersion={onVisitVersion} />);
    await screen.findByAltText('visit');
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    await waitFor(() => expect(onClinicalConflict).toHaveBeenCalledTimes(1));
    expect(onVisitVersion).not.toHaveBeenCalled();
    expect(screen.getByAltText('visit')).toBeInTheDocument();
  } finally { confirm.mockRestore(); }
});


it('reports an upload conflict before another batch acknowledges success', async () => {
  const originalXHR = global.XMLHttpRequest;
  const createURL = URL.createObjectURL;
  const revokeURL = URL.revokeObjectURL;
  const canvas = jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,');
  const events: string[] = [];
  let batch = 0;
  global.XMLHttpRequest = class {
    upload = {};
    readyState = 0;
    status = 0;
    responseText = '';
    onreadystatechange?: () => void;
    open() {}
    send() {
      this.status = batch++ === 0 ? 409 : 200;
      this.responseText = JSON.stringify({ visitVersion: 5 });
      this.readyState = 4;
      this.onreadystatechange?.();
    }
  } as unknown as typeof XMLHttpRequest;
  URL.createObjectURL = jest.fn(() => 'blob:synthetic');
  URL.revokeObjectURL = jest.fn();
  try {
    const view = render(<VisitPhotos patientId="p" visitId="current" onClinicalConflict={() => events.push('conflict')} onVisitVersion={version => events.push(`version:${version}`)} />);
    await screen.findByText('No photos attached to this visit');
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: Array.from({ length: 7 }, (_, i) => new File(['synthetic'], `${i}.gif`, { type: 'image/gif' })) } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload', exact: true }));
    await waitFor(() => expect(events).toEqual(['conflict', 'version:5']));
  } finally {
    global.XMLHttpRequest = originalXHR;
    URL.createObjectURL = createURL;
    URL.revokeObjectURL = revokeURL;
    canvas.mockRestore();
  }
});
