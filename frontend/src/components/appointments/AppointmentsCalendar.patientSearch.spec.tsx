import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppointmentsCalendar from './AppointmentsCalendar';

const getPatients = jest.fn();

const stableToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: stableToast }),
}));

jest.mock('@/lib/api', () => ({
  apiClient: {
    getDoctorSchedule: jest.fn().mockResolvedValue({ appointments: [] }),
    getUsers: jest.fn().mockResolvedValue({ data: [{ id: 'd1', firstName: 'Do', lastName: 'Ctor', role: 'DOCTOR' }] }),
    getRooms: jest.fn().mockResolvedValue({ rooms: [] }),
    getRoomSchedule: jest.fn().mockResolvedValue({ appointments: [] }),
    getPatients: (...args: unknown[]) => getPatients(...args),
  },
}));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const patient = (id: string, firstName: string) => ({ id, firstName, lastName: 'Test', phone: '9000000000' });

async function setup() {
  jest.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime, delay: null });
  render(<AppointmentsCalendar controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls />);
  const input = await screen.findByRole('textbox', { name: 'Patient' });
  return { user, input };
}

describe('AppointmentsCalendar patient search', () => {
  beforeEach(() => getPatients.mockReset());
  afterEach(() => jest.useRealTimers());

  it('issues one request for rapid typing', async () => {
    getPatients.mockResolvedValue({ data: [patient('p1', 'Asha')] });
    const { user, input } = await setup();

    await user.type(input, 'asha');
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(getPatients).toHaveBeenCalledTimes(1);
    expect(getPatients).toHaveBeenCalledWith({ search: 'asha', limit: 10 });
  });

  it('ignores an older slow response that resolves after a newer one', async () => {
    const slow = deferred<unknown>();
    const fast = deferred<unknown>();
    getPatients.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const { user, input } = await setup();

    await user.type(input, 'a');
    await act(async () => { jest.advanceTimersByTime(400); });
    await user.type(input, 'b');
    await act(async () => { jest.advanceTimersByTime(400); });
    expect(getPatients).toHaveBeenCalledTimes(2);

    await act(async () => { fast.resolve({ data: [patient('p2', 'Newer')] }); });
    await act(async () => { slow.resolve({ data: [patient('p1', 'Older')] }); });

    expect(screen.getByRole('button', { name: /Newer Test/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Older Test/ })).not.toBeInTheDocument();
  });

  it('still offers quick-create when a settled search has no matches', async () => {
    getPatients.mockResolvedValue({ data: [] });
    const { user, input } = await setup();

    await user.type(input, 'zzz');
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(getPatients).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('No matching patients found.')).toBeInTheDocument();
  });
});
