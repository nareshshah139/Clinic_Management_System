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
