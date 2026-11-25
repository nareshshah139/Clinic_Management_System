import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CalendarColumn from './CalendarColumn';
import { getISTDateString } from '@/lib/utils';

const toastMock = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));

const slots = ['10:00-10:30', '10:30-11:00', '11:00-11:30'];

function renderColumn(onBook: jest.Mock, { date = '2099-01-01', nowHHMM = null as string | null, slotAction = { kind: 'book', patientMissing: false } as React.ComponentProps<typeof CalendarColumn>['slotAction'], onMove = jest.fn() } = {}) {
  render(
    <CalendarColumn
      calendar="SCHEDULED"
      column={2}
      appointments={[]}
      date={date}
      slots={slots}
      stepMinutes={30}
      tileHeight="2rem"
      timeline={{ start: 600, end: 690, topPadding: '0px', bottomPadding: '0px' }}
      nowHHMM={nowHHMM}
      maxBookingsPerSlot={1}
      slotAction={slotAction}
      busy={false}
      onOpen={jest.fn()}
      onReschedule={jest.fn()}
      onStartVisit={jest.fn()}
      onBook={onBook}
      onMove={onMove}
    />,
  );
}

describe('CalendarColumn slot selection', () => {
  it('books exactly the dragged span once', async () => {
    const onBook = jest.fn();
    renderColumn(onBook);
    const user = userEvent.setup();

    await user.pointer([
      { keys: '[MouseLeft>]', target: screen.getByRole('button', { name: 'Book 10:00-10:30' }) },
      { target: screen.getByRole('button', { name: 'Book 10:30-11:00' }) },
      { keys: '[/MouseLeft]', target: screen.getByRole('button', { name: 'Book 10:30-11:00' }) },
    ]);

    expect(onBook.mock.calls).toEqual([['10:00-11:00']]);
  });

  it('books a single clicked slot once', async () => {
    const onBook = jest.fn();
    renderColumn(onBook);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Book 10:30-11:00' }));

    expect(onBook.mock.calls).toEqual([['10:30-11:00']]);
  });

  it('books a slot from the keyboard', async () => {
    const onBook = jest.fn();
    renderColumn(onBook);
    const user = userEvent.setup();

    await user.tab();
    await user.keyboard('{Enter}');

    expect(onBook.mock.calls).toEqual([['10:00-10:15']]);
  });
});

describe('CalendarColumn at the current time', () => {
  const today = getISTDateString();

  it('books the next quarter hour of the running slot with a mouse click at 10:01', async () => {
    const onBook = jest.fn();
    renderColumn(onBook, { date: today, nowHHMM: '10:01' });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Book 10:00-10:30' }));

    expect(onBook.mock.calls).toEqual([['10:15-10:30']]);
  });

  it('books nothing in the running slot at 10:16, when no quarter hour is left to start in', async () => {
    const onBook = jest.fn();
    renderColumn(onBook, { date: today, nowHHMM: '10:16' });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Book 10:00-10:30' }));

    expect(onBook).not.toHaveBeenCalled();
  });

  it('closes the 10:00-10:30 slot at 10:31 and leaves the next one bookable', async () => {
    const onBook = jest.fn();
    renderColumn(onBook, { date: today, nowHHMM: '10:31' });

    expect(screen.getByRole('button', { name: 'Book 10:00-10:30' }).parentElement).toHaveStyle({ pointerEvents: 'none' });
    expect(screen.getByRole('button', { name: 'Book 10:30-11:00' }).parentElement).not.toHaveStyle({ pointerEvents: 'none' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Book 10:30-11:00' }));

    expect(onBook.mock.calls).toEqual([['10:45-11:00']]);
  });
});

describe('CalendarColumn moving an appointment at 10:16', () => {
  const today = getISTDateString();
  const move = { kind: 'move', minutes: 30 } as React.ComponentProps<typeof CalendarColumn>['slotAction'];

  beforeEach(() => toastMock.mockClear());

  it('does not move onto the running 10:00-10:30 row and says the time has started', async () => {
    const onMove = jest.fn();
    renderColumn(jest.fn(), { date: today, nowHHMM: '10:16', slotAction: move, onMove });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Move to 10:00-10:30' }));

    expect(onMove).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'That time has already started' }));
  });

  it('still moves onto a row that starts later', async () => {
    const onMove = jest.fn();
    renderColumn(jest.fn(), { date: today, nowHHMM: '10:16', slotAction: move, onMove });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Move to 10:30-11:00' }));

    expect(onMove.mock.calls).toEqual([['10:30-11:00']]);
  });

  it('moves onto a future day row from its start', async () => {
    const onMove = jest.fn();
    renderColumn(jest.fn(), { slotAction: move, onMove });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Move to 10:00-10:30' }));

    expect(onMove.mock.calls).toEqual([['10:00-10:30']]);
  });
});
