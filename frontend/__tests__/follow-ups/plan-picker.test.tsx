import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FollowUpPlanPicker } from '@/components/follow-ups/plan-picker';

const api = { getFollowUpPlans: jest.fn(), getActiveFollowUpTracks: jest.fn(), stopFollowUpTrack: jest.fn() };
jest.mock('@/lib/api', () => ({ apiClient: new Proxy({}, { get: (_t, k: string) => (...args: unknown[]) => (api as any)[k](...args) }) }));

const plans = [{ key: 'skin-two-week', planVersionId: 'pv1', version: 1, name: { EN: 'Two-week skin check' }, steps: [] }];
const track = {
  id: 't1', visitId: 'v0', anchorDate: '2026-11-01', createdAt: '2026-11-01T05:00:00.000Z',
  planVersion: { id: 'pv1', version: 1, content: { name: { EN: 'Two-week skin check' } }, plan: { key: 'skin-two-week' } },
  checkIns: [{ id: 'c1', stepKey: 'day3', state: 'SCHEDULED', opensAt: '2026-11-04T03:30:00.000Z', closesAt: '2026-11-05T14:30:00.000Z' }],
};

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getFollowUpPlans.mockResolvedValue(plans);
});

it('always offers "No follow-up" beside every plan and reports the pick (PP-26)', async () => {
  api.getActiveFollowUpTracks.mockResolvedValue([]);
  const onChange = jest.fn();
  render(<FollowUpPlanPicker patientId="p1" value="" onChange={onChange} userRole="DOCTOR" />);
  const select = screen.getByLabelText('Follow-up plan');
  await screen.findByRole('option', { name: 'Two-week skin check' });
  expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['No follow-up', 'Two-week skin check']);
  expect(select).toHaveValue('');
  fireEvent.change(select, { target: { value: 'pv1' } });
  expect(onChange).toHaveBeenCalledWith('pv1');
});

it('lists the patient\'s active tracks and lets the doctor stop one after confirming', async () => {
  api.getActiveFollowUpTracks.mockResolvedValueOnce([track]).mockResolvedValueOnce([]);
  api.stopFollowUpTrack.mockResolvedValue({ stopped: true });
  render(<FollowUpPlanPicker patientId="p1" value="" onChange={jest.fn()} userRole="DOCTOR" />);
  const list = await screen.findByRole('list', { name: 'Active follow-up plans' });
  expect(list).toHaveTextContent('Two-week skin check');
  fireEvent.click(within(list).getByRole('button', { name: 'Stop' }));
  expect(api.stopFollowUpTrack).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Stop Two-week skin check' }));
  await waitFor(() => expect(api.stopFollowUpTrack).toHaveBeenCalledWith('t1'));
  await waitFor(() => expect(screen.queryByRole('list', { name: 'Active follow-up plans' })).toBeNull());
});

it('shows active tracks to a nurse without a stop action', async () => {
  api.getActiveFollowUpTracks.mockResolvedValue([track]);
  render(<FollowUpPlanPicker patientId="p1" value="" onChange={jest.fn()} userRole="NURSE" disabled />);
  const list = await screen.findByRole('list', { name: 'Active follow-up plans' });
  expect(within(list).queryByRole('button')).toBeNull();
});
