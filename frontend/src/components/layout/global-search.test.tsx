import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GlobalSearch } from './global-search';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getPatients: jest.fn().mockResolvedValue({
      data: [
        { id: 'p-rahul', firstName: 'Rahul', lastName: 'Kumar', phone: '9848010411', gender: 'MALE', age: 19 },
        { id: 'p-lakshmi', firstName: 'Lakshmi', lastName: 'Iyer', phone: '9848010274', gender: 'FEMALE', age: 63 },
      ],
    }),
    getAppointments: jest.fn().mockResolvedValue({ appointments: [] }),
    getUsers: jest.fn().mockResolvedValue({ users: [{ id: 'u-praneeta', firstName: 'Praneeta', lastName: 'Jain', role: 'DOCTOR' }] }),
  },
}));

async function typeQuery() {
  const user = userEvent.setup();
  render(<GlobalSearch />);
  const box = screen.getByRole('combobox', { name: 'Search patients, appointments, doctors' });
  await user.type(box, 'ra');
  const list = await screen.findByRole('listbox', { name: 'Search results' });
  return { user, box, list };
}

const activeLabel = (box: HTMLElement) => {
  const id = box.getAttribute('aria-activedescendant');
  return id ? document.getElementById(id)?.textContent : null;
};

describe('GlobalSearch keyboard', () => {
  beforeEach(() => push.mockReset());

  it('lists results as options of an expanded combobox', async () => {
    const { box, list } = await typeQuery();
    expect(box).toHaveAttribute('aria-expanded', 'true');
    expect(box).toHaveAttribute('aria-controls', list.id);
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Rahul Kumar9848010411Patient • Male • 19 yrsPatient',
      'Lakshmi Iyer9848010274Patient • Female • 63 yrsPatient',
      'Praneeta JainDoctor • GeneralStaff',
    ]);
    expect(box).not.toHaveAttribute('aria-activedescendant');
  });

  it('moves the active option with the arrow keys and wraps at both ends', async () => {
    const { user, box } = await typeQuery();
    await user.keyboard('{ArrowDown}');
    expect(activeLabel(box)).toMatch(/^Rahul Kumar/);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(activeLabel(box)).toMatch(/^Praneeta Jain/);
    expect(screen.getByRole('option', { name: /Praneeta Jain/ })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(activeLabel(box)).toMatch(/^Rahul Kumar/);
    await user.keyboard('{ArrowUp}');
    expect(activeLabel(box)).toMatch(/^Praneeta Jain/);
    expect(box).toHaveFocus();
  });

  it('opens the active option on Enter', async () => {
    const { user } = await typeQuery();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(push).toHaveBeenCalledWith('/dashboard/patients?search=p-lakshmi');
  });

  it('opens the first option on Enter when none is active', async () => {
    const { user } = await typeQuery();
    await user.keyboard('{Enter}');
    expect(push).toHaveBeenCalledWith('/dashboard/patients?search=p-rahul');
  });

  it('closes on Escape, keeps the query, and reopens on ArrowDown', async () => {
    const { user, box } = await typeQuery();
    await user.keyboard('{ArrowDown}{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(box).toHaveValue('ra');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(activeLabel(box)).toMatch(/^Rahul Kumar/);
  });

  it('opens an option when it is clicked', async () => {
    const { user } = await typeQuery();
    await user.click(screen.getByRole('option', { name: /Praneeta Jain/ }));
    expect(push).toHaveBeenCalledWith('/dashboard/users?search=u-praneeta');
  });
});
