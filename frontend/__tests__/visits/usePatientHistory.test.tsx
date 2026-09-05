import { act, renderHook, waitFor } from '@testing-library/react';
import { usePatientHistory } from '@/components/visits/usePatientHistory';
import { apiClient } from '@/lib/api';
import { PATIENT_HISTORY_CHANGED } from '@/lib/patient-history';

jest.mock('@/lib/api', () => ({ apiClient: { getAllPatientVisitHistory: jest.fn() } }));
const load = apiClient.getAllPatientVisitHistory as jest.Mock;
beforeEach(() => load.mockReset());
it('does not show another patient when a stale request resolves', async () => {
  let finish: (entries: any[]) => void = () => {};
  load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce([{ id: 'new-patient' }]);
  const { result, rerender } = renderHook(({ patientId }) => usePatientHistory(patientId), { initialProps: { patientId: 'old' } });
  rerender({ patientId: 'new' });
  await waitFor(() => expect(result.current.entries).toEqual([{ id: 'new-patient' }]));
  await act(async () => finish([{ id: 'old-patient' }]));
  expect(result.current.entries).toEqual([{ id: 'new-patient' }]);
});
it('reports an error separately from empty history and supports retry', async () => {
  load.mockRejectedValueOnce(new Error('Connection failed')).mockResolvedValueOnce([{ id: 'visit' }]);
  const { result } = renderHook(() => usePatientHistory('p'));
  await waitFor(() => expect(result.current.error).toBe('Connection failed'));
  await act(async () => result.current.refresh());
  expect(result.current.error).toBeNull();
  expect(result.current.entries).toEqual([{ id: 'visit' }]);
});
it('refreshes after a saved visit or prescription', async () => {
  load.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'saved' }]);
  const { result } = renderHook(() => usePatientHistory('p'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => window.dispatchEvent(new Event(PATIENT_HISTORY_CHANGED)));
  await waitFor(() => expect(result.current.entries).toEqual([{ id: 'saved' }]));
});
it('hides only empty entries and lets the user reveal them without refetching or deleting', async () => {
  const empty = { id: 'empty', entryType: 'visit', complaints: [{ complaint: 'General consultation' }] };
  const saved = { id: 'saved', entryType: 'visit', history: { pastHistory: 'Saved detail' } };
  load.mockResolvedValue([empty, saved]);
  const { result } = renderHook(() => usePatientHistory('p'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.entries).toEqual([saved]);
  expect(result.current.hiddenCount).toBe(1);
  act(() => result.current.setShowEmpty(true));
  expect(result.current.entries).toEqual([empty, saved]);
  expect(load).toHaveBeenCalledTimes(1);
});
