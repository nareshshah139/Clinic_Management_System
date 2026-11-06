import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DoctorAvailabilitySettings } from '@/components/users/DoctorAvailabilitySettings';
import { apiClient } from '@/lib/api';
import { checkSlot, gridHoursFor, type DoctorDay } from '@/lib/doctor-availability';

jest.mock('@/lib/api', () => ({
  apiClient: {
    getDoctorAvailability: jest.fn(),
    replaceDoctorHours: jest.fn(),
    createTimeOff: jest.fn(),
    deleteTimeOff: jest.fn(),
  },
}));

const api = apiClient as jest.Mocked<typeof apiClient>;
const legacy = {
  doctorId: 'doc-1',
  source: 'legacy' as const,
  hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '10:00', end: '14:00' })),
  timeOff: [
    { id: 'h1', doctorId: null, kind: 'HOLIDAY' as const, startsAt: '2099-03-02T00:00:00+05:30', endsAt: '2099-03-03T00:00:00+05:30', reason: 'Holi' },
  ],
};

describe('DoctorAvailabilitySettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getDoctorAvailability.mockResolvedValue(legacy);
  });

  it('prefills legacy hours with a note and saves a split shift as the weekly schedule', async () => {
    api.replaceDoctorHours.mockResolvedValue({ ...legacy, source: 'configured' });
    render(<DoctorAvailabilitySettings doctorId="doc-1" />);

    expect(await screen.findByText(/old working-hours setting/)).toBeInTheDocument();
    expect(screen.getByLabelText('Monday shift 1 start')).toHaveValue('10:00');
    expect(screen.getByText(/Clinic holiday/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Remove Clinic holiday/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Add Monday shift'));
    fireEvent.change(screen.getByLabelText('Monday shift 2 start'), { target: { value: '15:00' } });
    fireEvent.click(screen.getByText('Save hours'));

    await waitFor(() => expect(api.replaceDoctorHours).toHaveBeenCalled());
    const [doctorId, hours] = api.replaceDoctorHours.mock.calls[0];
    expect(doctorId).toBe('doc-1');
    expect(hours.filter((h) => h.weekday === 1)).toEqual([
      { weekday: 1, start: '10:00', end: '14:00' },
      { weekday: 1, start: '15:00', end: '18:00' },
    ]);
    expect(await screen.findByText('Working hours saved.')).toBeInTheDocument();
  });

  it('blocks saving overlapping shifts without calling the API', async () => {
    render(<DoctorAvailabilitySettings doctorId="doc-1" />);
    await screen.findByLabelText('Monday shift 1 start');
    fireEvent.click(screen.getByLabelText('Add Monday shift'));
    fireEvent.change(screen.getByLabelText('Monday shift 2 start'), { target: { value: '13:00' } });
    fireEvent.click(screen.getByText('Save hours'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Monday: shifts overlap');
    expect(api.replaceDoctorHours).not.toHaveBeenCalled();
  });

  it('adds all-day leave as an IST range ending at the next midnight', async () => {
    api.createTimeOff.mockResolvedValue({ ...legacy.timeOff[0], id: 'l1', kind: 'LEAVE', doctorId: 'doc-1' });
    render(<DoctorAvailabilitySettings doctorId="doc-1" />);
    await screen.findByLabelText('Monday shift 1 start');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2099-04-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2099-04-02' } });
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'Conference' } });
    fireEvent.click(screen.getByText('Add leave'));
    await waitFor(() => expect(api.createTimeOff).toHaveBeenCalledWith({
      doctorId: 'doc-1',
      kind: 'LEAVE',
      startsAt: '2099-04-01T00:00:00+05:30',
      endsAt: '2099-04-03T00:00:00+05:30',
      reason: 'Conference',
    }));
    expect(api.getDoctorAvailability).toHaveBeenCalledTimes(2);
  });
});

describe('checkSlot and gridHoursFor', () => {
  const day = (overrides: Partial<DoctorDay> = {}): DoctorDay => ({
    date: '2099-03-02', weekday: 1, source: 'configured',
    working: [{ start: 540, end: 780 }, { start: 840, end: 1080 }],
    intervals: [], blocked: [], ...overrides,
  });

  it('blocks a slot that hits time off and names the reason', () => {
    const result = checkSlot(day({ blocked: [{ id: 'b', kind: 'LEAVE', reason: 'Conference', start: 0, end: 1440 }] }), '10:00-10:30');
    expect(result.blocked).toBe('Cannot book 10:00-10:30: Leave all day (Conference).');
  });

  it('only warns outside configured hours, and stays silent on clinic defaults', () => {
    expect(checkSlot(day(), '13:15-13:45').warning).toMatch(/outside doctor's working hours \(09:00-13:00, 14:00-18:00\)/);
    expect(checkSlot(day(), '09:00-09:30')).toEqual({});
    expect(checkSlot(day({ source: 'default' }), '20:00-20:30')).toEqual({});
    expect(checkSlot(null, '20:00-20:30')).toEqual({});
  });

  it('sizes the grid to the doctor hours but keeps the caller default otherwise', () => {
    expect(gridHoursFor(day())).toEqual({ startHour: 9, endHour: 18 });
    expect(gridHoursFor(day({ working: [{ start: 510, end: 1230 }] }))).toEqual({ startHour: 8, endHour: 21 });
    expect(gridHoursFor(day({ source: 'default' }))).toBeNull();
    expect(gridHoursFor(day({ working: [] }))).toBeNull();
  });
});

describe('timeOffSpan', () => {
  const { timeOffSpan } = jest.requireActual('@/lib/doctor-availability') as typeof import('@/lib/doctor-availability');
  it('shows whole IST days as dates', () => {
    expect(timeOffSpan('2026-11-30T18:30:00.000Z', '2026-12-01T18:30:00.000Z')).toBe('1 Dec 2026 (all day)');
    expect(timeOffSpan('2026-11-30T18:30:00.000Z', '2026-12-03T18:30:00.000Z')).toBe('1 Dec 2026 – 3 Dec 2026 (all day)');
  });
  it('shows times for partial blocks', () => {
    expect(timeOffSpan('2026-12-01T07:30:00.000Z', '2026-12-01T08:30:00.000Z')).toMatch(/1 Dec 2026.*13:00.*14:00/);
  });
});
