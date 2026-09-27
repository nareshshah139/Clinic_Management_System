import { act, renderHook, waitFor } from '@testing-library/react';
import { usePrescriptionSignature, signaturePreferenceKey } from '@/hooks/usePrescriptionSignature';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { getDoctorSignature: jest.fn() } }));
const readSignature = apiClient.getDoctorSignature as jest.MockedFunction<typeof apiClient.getDoctorSignature>;
beforeEach(() => { localStorage.clear(); jest.clearAllMocks(); });

it('remembers checked and unchecked choices across visits, isolated by doctor', async () => {
  readSignature.mockResolvedValue({ signature: { id: 'sig', url: 'data:image/png;base64,c2ln' } });
  const { result, rerender, unmount } = renderHook(({ id }) => usePrescriptionSignature(id, true), { initialProps: { id: 'one' } });
  await waitFor(() => expect(result.current.signatureLoading).toBe(false));
  act(() => result.current.setShowSignature(true));
  expect(localStorage.getItem(signaturePreferenceKey('one'))).toBe('true');
  rerender({ id: 'two' });
  await waitFor(() => expect(result.current.signatureLoading).toBe(false));
  expect(result.current.showSignature).toBe(false);
  rerender({ id: 'one' });
  expect(result.current.showSignature).toBe(true);
  act(() => result.current.setShowSignature(false));
  unmount();
  const nextVisit = renderHook(() => usePrescriptionSignature('one', true));
  await waitFor(() => expect(nextVisit.result.current.signatureLoading).toBe(false));
  expect(nextVisit.result.current.showSignature).toBe(false);
  expect(localStorage.getItem(signaturePreferenceKey('one'))).toBe('false');
});

it('discards late responses from another doctor and refreshes after signature replacement', async () => {
  let resolveOld!: (value: any) => void;
  readSignature.mockImplementation(id => id === 'old' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ signature: { id: 'new', url: 'new-url' } }));
  const { result, rerender } = renderHook(({ id }) => usePrescriptionSignature(id, true), { initialProps: { id: 'old' } });
  rerender({ id: 'new' });
  await waitFor(() => expect(result.current.signatureUrl).toBe('new-url'));
  await act(async () => resolveOld({ signature: { id: 'old', url: 'old-url' } }));
  expect(result.current.signatureUrl).toBe('new-url');
  readSignature.mockResolvedValue({ signature: { id: 'replacement', url: 'replacement-url' } });
  act(() => window.dispatchEvent(new CustomEvent('doctor-signature-changed', { detail: { doctorId: 'new' } })));
  await waitFor(() => expect(result.current.signatureUrl).toBe('replacement-url'));
});

it('reports a failed signature read and allows retry without forgetting the choice', async () => {
  localStorage.setItem(signaturePreferenceKey('one'), 'true');
  readSignature.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ signature: null });
  const { result } = renderHook(() => usePrescriptionSignature('one', true));
  await waitFor(() => expect(result.current.signatureError).toContain('Could not load'));
  expect(result.current.showSignature).toBe(true);
  act(() => result.current.reloadSignature());
  await waitFor(() => expect(result.current.signatureError).toBe(''));
  expect(result.current.signatureUrl).toBeNull();
});

it.each([[548, 350], [1000, 100], [100, 500]])('preserves the original %s × %s aspect ratio in bounded print dimensions', async (width, height) => {
  readSignature.mockResolvedValue({ signature: { id: 'sig', url: 'data:image/png;base64,c2ln', width, height } });
  const { result } = renderHook(() => usePrescriptionSignature('doctor', true));
  await waitFor(() => expect(result.current.signatureLoading).toBe(false));
  expect(result.current.signatureWidth).toBeLessThanOrEqual(160);
  expect(result.current.signatureHeight).toBeLessThanOrEqual(72);
  expect(result.current.signatureWidth / result.current.signatureHeight).toBeCloseTo(width / height);
});
