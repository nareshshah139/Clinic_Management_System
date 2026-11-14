import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarLegend } from './CalendarLegend';

function renderLegend() {
  const user = userEvent.setup();
  render(
    <>
      <CalendarLegend />
      <button type="button">Elsewhere</button>
    </>,
  );
  return { user, legend: screen.getByRole('button', { name: 'Legend' }) };
}

describe('CalendarLegend disclosure', () => {
  it('is a collapsed disclosure button, not a menu', () => {
    const { legend } = renderLegend();
    expect(legend).toHaveAttribute('aria-expanded', 'false');
    expect(legend).not.toHaveAttribute('aria-haspopup');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Legend' })).toBeNull();
  });

  it('expands into the panel it controls', async () => {
    const { user, legend } = renderLegend();
    await user.click(legend);
    const panel = screen.getByRole('region', { name: 'Legend' });
    expect(legend).toHaveAttribute('aria-expanded', 'true');
    expect(legend).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveTextContent('Scheduled: Booked ahead. Call to confirm.');
    expect(panel).toHaveTextContent('Open a scheduled patient and press Confirm to move them to Confirmed at the same time.');
    expect(panel).toHaveTextContent('Booking In Progress');
  });

  it('closes on Escape and returns focus to the button', async () => {
    const { user, legend } = renderLegend();
    await user.click(legend);
    await user.click(screen.getByText('Booking In Progress'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Legend' })).toBeNull();
    expect(legend).toHaveAttribute('aria-expanded', 'false');
    expect(legend).toHaveFocus();
  });

  it('closes on a click outside and toggles shut from its own button', async () => {
    const { user, legend } = renderLegend();
    await user.click(legend);
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('region', { name: 'Legend' })).toBeNull();
    await user.click(legend);
    await user.click(legend);
    expect(legend).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the open panel inside the viewport when the button moves with no resize or scroll event', async () => {
    const { user, legend } = renderLegend();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1366 });
    let anchorLeft = 1250;
    jest.spyOn(legend.parentElement as HTMLElement, 'getBoundingClientRect').mockImplementation(() => ({ left: anchorLeft } as DOMRect));

    await user.click(legend);
    const panel = screen.getByRole('region', { name: 'Legend' });
    expect(panel.style.left).toBe('-444px');

    anchorLeft = 5;
    await waitFor(() => expect(panel.style.left).toBe('11px'));

    anchorLeft = 300;
    await waitFor(() => expect(panel.style.left).toBe('0px'));
  });
});
