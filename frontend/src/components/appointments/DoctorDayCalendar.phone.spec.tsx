import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import DoctorDayCalendar from './DoctorDayCalendar';
import { apiClient } from '@/lib/api';
import { AppointmentStatus } from '@cms/shared-types';
import { MIN_TILE_PX } from './tile-height';
import { CALENDAR_ORDER } from './appointment-calendars';

const [SCHEDULED, CONFIRMED] = CALENDAR_ORDER;

const stableToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: stableToast }) }));

jest.mock('@/lib/api', () => ({
  apiClient: { getDoctorSchedule: jest.fn() },
}));

const api = apiClient as jest.Mocked<typeof apiClient>;

const schedule = (...rows: Array<{ id: string; slot: string; name: string; calendar: typeof SCHEDULED }>) => ({
  appointments: rows.map(({ id, slot, name, calendar }) => ({
    id, slot, calendar, visitType: 'OPD', patient: { name },
    status: calendar === SCHEDULED ? AppointmentStatus.SCHEDULED : AppointmentStatus.CONFIRMED,
  })),
}) as never;

const ravi = { id: 'a1', slot: '10:00-10:30', name: 'Ravi Kumar', calendar: SCHEDULED };
const priya = { id: 'a2', slot: '11:00-11:30', name: 'Priya Nair', calendar: CONFIRMED };

function onPhone() {
  const matchMedia = jest.mocked(window.matchMedia);
  const desktop = matchMedia.getMockImplementation()!;
  matchMedia.mockImplementation((query: string) => ({ ...desktop(query), matches: query === '(max-width: 639px)' }));
  return () => matchMedia.mockImplementation(desktop);
}

describe('DoctorDayCalendar on a phone', () => {
  let restoreDesktop = () => {};
  beforeEach(() => {
    jest.clearAllMocks();
    restoreDesktop = onPhone();
  });
  afterEach(() => restoreDesktop());

  async function renderDay(props: Partial<React.ComponentProps<typeof DoctorDayCalendar>> = {}) {
    api.getDoctorSchedule.mockResolvedValue(schedule(ravi, priya));
    render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" {...props} />);
    await screen.findByRole('group', { name: 'Calendar' });
  }

  it('shows one calendar at a time and the switcher swaps it, with counts on both buttons', async () => {
    await renderDay();

    expect(screen.getByRole('region', { name: 'Scheduled' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Confirmed' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Scheduled (1)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Confirmed (1)' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Ravi Kumar, 10:00-10:30, Scheduled' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmed (1)' }));

    expect(screen.queryByRole('region', { name: 'Scheduled' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Confirmed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Priya Nair, 11:00-11:30, Confirmed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmed (1)' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the chosen calendar when the date changes', async () => {
    api.getDoctorSchedule.mockResolvedValue(schedule(ravi, priya));
    const { rerender } = render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmed (1)' }));

    rerender(<DoctorDayCalendar doctorId="doc-1" date="2099-01-02" />);

    expect(await screen.findByRole('region', { name: 'Confirmed' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Scheduled' })).toBeNull();
  });

  it('opens a doctor on Confirmed, with no Hide control that could leave the screen empty', async () => {
    await renderDay({ foldedCalendars: [SCHEDULED] });

    expect(screen.getByRole('region', { name: 'Confirmed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Hide / })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Scheduled (1)' }));
    expect(screen.getByRole('button', { name: 'Ravi Kumar, 10:00-10:30, Scheduled' })).toBeInTheDocument();
  });

  it('gives every 10-minute slot row at least the minimum tap height, so the day scrolls', async () => {
    await renderDay({ timeSlotConfig: { startHour: 9, endHour: 18, stepMinutes: 10, timezone: 'Asia/Kolkata' } });

    const book = screen.getByRole('button', { name: 'Book 09:00-09:10' });
    const row = book.parentElement as HTMLElement;
    expect(parseFloat(row.style.height)).toBeGreaterThanOrEqual(MIN_TILE_PX);
    expect(row.style.height).toMatch(/px$/);
  });
});

describe('DoctorDayCalendar on a desktop', () => {
  it('shows both calendars side by side with no switcher', async () => {
    api.getDoctorSchedule.mockResolvedValue(schedule(ravi, priya));
    render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" />);

    expect(await screen.findByRole('region', { name: 'Scheduled' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Confirmed' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Calendar' })).toBeNull();
  });
});

describe('DoctorDayCalendar clock', () => {
  const ist = (hhmm: string) => new Date(`2026-11-25T${hhmm}:00+05:30`);
  const slotBook = () => within(screen.getByRole('region', { name: 'Confirmed' })).getByRole('button', { name: 'Book 10:00-10:30' });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: ist('10:01') });
  });
  afterEach(() => jest.useRealTimers());

  it('lets reception book into the running slot at 10:01 and closes it once its end has passed', async () => {
    api.getDoctorSchedule.mockResolvedValue(schedule());
    const onSelectSlot = jest.fn();
    render(<DoctorDayCalendar doctorId="doc-1" date="2026-11-25" onSelectSlot={onSelectSlot} />);
    await screen.findByRole('region', { name: 'Confirmed' });

    expect(slotBook().parentElement).not.toHaveStyle({ pointerEvents: 'none' });
    fireEvent.click(slotBook());
    expect(onSelectSlot.mock.calls).toEqual([['10:15-10:30', 'CONFIRMED']]);

    act(() => { jest.advanceTimersByTime(30 * 60_000); });

    expect(slotBook().parentElement).toHaveStyle({ pointerEvents: 'none' });
    fireEvent.click(slotBook());
    expect(onSelectSlot).toHaveBeenCalledTimes(1);
  });
});
