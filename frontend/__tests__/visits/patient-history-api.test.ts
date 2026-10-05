import { ApiClient } from '@/lib/api';
import { compactClinicalPatch, mergeClinicalPatch } from '@/lib/clinical-patch';

describe('Complete patient history loading', () => {
  it('continues beyond one page and forwards appointment inclusion', async () => {
    const client = new ApiClient();
    const get = jest.spyOn(client, 'getPatientVisitHistory');
    get.mockResolvedValueOnce({ visits: [{ id: 'one' }], pagination: { hasMore: true } });
    get.mockResolvedValueOnce({ visits: [{ id: 'two' }], pagination: { hasMore: false } });
    expect(await client.getAllPatientVisitHistory('patient', true)).toEqual([{ id: 'one' }, { id: 'two' }]);
    expect(get).toHaveBeenLastCalledWith('patient', { limit: 100, offset: 1, includeAppointments: true });
  });
  it('does not silently return a partial timeline when a later page fails', async () => {
    const client = new ApiClient();
    jest.spyOn(client, 'getPatientVisitHistory').mockResolvedValueOnce({ visits: [{ id: 'one' }], pagination: { hasMore: true } }).mockRejectedValueOnce(new Error('Network error'));
    await expect(client.getAllPatientVisitHistory('patient')).rejects.toThrow('Network error');
  });
  it('omits untouched controls without erasing saved clinical fields', () => {
    const patch = compactClinicalPatch({ history: { pastHistory: undefined }, diagnosis: undefined, examination: { dermatology: { morphology: undefined } }, vitals: { heartRate: 70 } });
    expect(patch).toEqual({ vitals: { heartRate: 70 } });
    expect(mergeClinicalPatch({ vitals: { temperature: 37 }, history: { pastHistory: 'Keep' } }, patch)).toEqual({ vitals: { temperature: 37, heartRate: 70 }, history: { pastHistory: 'Keep' } });
  });
});
