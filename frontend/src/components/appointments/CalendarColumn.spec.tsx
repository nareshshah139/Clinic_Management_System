import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CalendarColumn from './CalendarColumn';

jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const slots = ['10:00-10:30', '10:30-11:00', '11:00-11:30'];

function renderColumn(onBook: jest.Mock) {
  render(
    <CalendarColumn
      calendar="SCHEDULED"
      column={2}
      appointments={[]}
      date="2099-01-01"
      slots={slots}
      stepMinutes={30}
      tileHeight="2rem"
      timeline={{ start: 600, end: 690, topPadding: '0px', bottomPadding: '0px' }}
      nowHHMM={null}
      maxBookingsPerSlot={1}
      slotAction={{ kind: 'book', patientMissing: false }}
      busy={false}
      onOpen={jest.fn()}
      onReschedule={jest.fn()}
      onStartVisit={jest.fn()}
      onBook={onBook}
      onMove={jest.fn()}
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
