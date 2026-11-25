import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GlobalSearch } from './global-search';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { apiClient } from '@/lib/api';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('@/lib/api', () => ({
  apiClient: { getPatients: jest.fn(), getAppointments: jest.fn(), getUsers: jest.fn() },
}));

const api = apiClient as jest.Mocked<typeof apiClient>;
const patients = [
  { id: 'p-rahul', firstName: 'Rahul', lastName: 'Kumar', phone: '9848010411', gender: 'MALE', age: 19 },
  { id: 'p-lakshmi', firstName: 'Lakshmi', lastName: 'Iyer', phone: '9848010274', gender: 'FEMALE', age: 63 },
];
const staff = [{ id: 'u-praneeta', firstName: 'Praneeta', lastName: 'Jain', role: 'DOCTOR' }];

beforeEach(() => {
  push.mockReset();
  api.getPatients.mockReset().mockResolvedValue({ data: patients } as never);
  api.getAppointments.mockReset().mockResolvedValue({ appointments: [] } as never);
  api.getUsers.mockReset().mockResolvedValue({ users: staff } as never);
});

const BOX = { name: 'Search patients, appointments, doctors' };

async function typeQuery(props: React.ComponentProps<typeof GlobalSearch> = { role: 'OWNER' }) {
  const user = userEvent.setup();
  render(<GlobalSearch {...props} />);
  const box = screen.getByRole('combobox', BOX);
  await user.type(box, 'ra');
  const list = await screen.findByRole('listbox', { name: 'Search results' });
  return { user, box, list };
}

const activeLabel = (box: HTMLElement) => {
  const id = box.getAttribute('aria-activedescendant');
  return id ? document.getElementById(id)?.textContent : null;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('GlobalSearch keyboard', () => {
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
    expect(push).toHaveBeenCalledWith('/dashboard/patients/p-lakshmi');
  });

  it('opens the first option on Enter when none is active', async () => {
    const { user } = await typeQuery();
    await user.keyboard('{Enter}');
    expect(push).toHaveBeenCalledWith('/dashboard/patients/p-rahul');
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

  it('opens a staff option when it is clicked', async () => {
    const { user } = await typeQuery();
    await user.click(screen.getByRole('option', { name: /Praneeta Jain/ }));
    expect(push).toHaveBeenCalledWith('/dashboard/users?search=u-praneeta');
  });
});

describe('GlobalSearch destinations and sources', () => {
  it('opens a patient on the patient profile', async () => {
    const { user } = await typeQuery();
    await user.click(screen.getByRole('option', { name: /Rahul Kumar/ }));
    expect(push).toHaveBeenCalledWith('/dashboard/patients/p-rahul');
  });

  it('starts patient, appointment and staff searches together instead of one after another', async () => {
    const patientsReply = deferred<unknown>();
    api.getPatients.mockReturnValue(patientsReply.promise as never);
    const user = userEvent.setup();
    render(<GlobalSearch role="OWNER" />);
    await user.type(screen.getByRole('combobox', BOX), 'ra');
    await waitFor(() => expect(api.getPatients).toHaveBeenCalled());
    expect(api.getAppointments).toHaveBeenCalledTimes(1);
    expect(api.getUsers).toHaveBeenCalledTimes(1);
    await act(async () => patientsReply.resolve({ data: [] }));
  });

  it('keeps the other results when one source fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    api.getAppointments.mockRejectedValue(new Error('boom') as never);
    const { list } = await typeQuery();
    expect(within(list).getAllByRole('option').map((o) => o.textContent?.slice(0, 11))).toEqual(['Rahul Kumar', 'Lakshmi Iye', 'Praneeta Ja']);
  });

  it.each([
    ['OWNER', true, true],
    ['MANAGER', true, true],
    ['RECEPTION', true, false],
    ['DOCTOR', true, false],
    ['PHARMACIST', false, false],
  ])('as %s asks for appointments: %s and for staff: %s', async (role, appointments, users) => {
    await typeQuery({ role });
    expect(api.getPatients).toHaveBeenCalledTimes(1);
    expect(api.getAppointments).toHaveBeenCalledTimes(appointments ? 1 : 0);
    expect(api.getUsers).toHaveBeenCalledTimes(users ? 1 : 0);
  });

  it('shows only the answer to the latest query when an older request finishes late', async () => {
    const slow = deferred<unknown>();
    api.getPatients.mockImplementation((async (params: { search: string }) =>
      params.search === 'ra' ? slow.promise : { data: [patients[0]] }) as never);
    api.getUsers.mockResolvedValue({ users: [] } as never);
    const user = userEvent.setup();
    render(<GlobalSearch role="OWNER" />);
    const box = screen.getByRole('combobox', BOX);
    await user.type(box, 'ra');
    await waitFor(() => expect(api.getPatients).toHaveBeenCalledWith(expect.objectContaining({ search: 'ra' })));
    await user.type(box, 'h');
    const list = await screen.findByRole('listbox', { name: 'Search results' });
    expect(within(list).getAllByRole('option')).toHaveLength(1);

    await act(async () => slow.resolve({ data: [patients[1]] }));

    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent?.slice(0, 11))).toEqual(['Rahul Kumar']);
    expect(screen.queryByText('Lakshmi Iyer')).toBeNull();
  });
});

describe('GlobalSearch appointment results', () => {
  const booked = (doctor?: { firstName?: string; lastName?: string }) => ({
    id: 'a1', slot: '10:00-10:30', date: '2026-11-26T00:00:00.000Z', visitType: 'OPD', doctorId: 'd1',
    patient: { name: 'Meera Kapoor' }, doctor,
  });

  async function appointmentRow(doctor?: { firstName?: string; lastName?: string }) {
    api.getPatients.mockResolvedValue({ data: [] } as never);
    api.getUsers.mockResolvedValue({ users: [] } as never);
    api.getAppointments.mockResolvedValue({ appointments: [booked(doctor)] } as never);
    const { list } = await typeQuery({ role: 'RECEPTION' });
    return within(list).getByRole('option');
  }

  it('names the doctor with a Dr. prefix', async () => {
    expect(await appointmentRow({ firstName: 'Priya', lastName: 'Menon' })).toHaveTextContent('Dr. Priya Menon');
  });

  it('does not double the prefix when the stored name already carries it', async () => {
    expect(await appointmentRow({ firstName: 'Dr.', lastName: 'Anil Rao' })).toHaveTextContent(/^Meera Kapoor - 10:00-10:30Dr\. Anil Rao/);
  });

  it('leaves the doctor line out when the appointment has no doctor name', async () => {
    const row = await appointmentRow(undefined);
    expect(row).not.toHaveTextContent('Dr.');
    expect(row).not.toHaveTextContent('Unknown Doctor');
  });
});

describe('GlobalSearch clear button', () => {
  it('empties the box, hides the results and returns focus to the box', async () => {
    const { user, box } = await typeQuery();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(box).toHaveValue('');
    expect(box).toHaveFocus();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('is absent while the box is empty', () => {
    render(<GlobalSearch role="OWNER" />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });
});

describe('GlobalSearch on a phone', () => {
  it('tells the host when a result was opened so it can close the search', async () => {
    const onNavigate = jest.fn();
    const { user } = await typeQuery({ role: 'OWNER', onNavigate });
    await user.click(screen.getByRole('option', { name: /Rahul Kumar/ }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('puts the cursor in the box when asked to', () => {
    render(<GlobalSearch role="OWNER" autoFocus />);
    expect(screen.getByRole('combobox', BOX)).toHaveFocus();
  });
});

describe('GlobalSearch shortcut', () => {
  it('jumps to search when / is pressed outside a text field', async () => {
    const user = userEvent.setup();
    render(<><button>Elsewhere</button><GlobalSearch role="OWNER" /></>);
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    await user.keyboard('/');
    const box = screen.getByRole('combobox', BOX);
    expect(box).toHaveFocus();
    expect(box).toHaveValue('');
  });

  it('leaves / alone while typing in another field', async () => {
    const user = userEvent.setup();
    render(<><input aria-label="Dose" /><GlobalSearch role="OWNER" /></>);
    await user.click(screen.getByRole('textbox', { name: 'Dose' }));
    await user.keyboard('1/2');
    expect(screen.getByRole('textbox', { name: 'Dose' })).toHaveValue('1/2');
    expect(screen.getByRole('combobox', BOX)).not.toHaveFocus();
  });
});

describe('GlobalSearch shortcut inside an overlay', () => {
  it('leaves an open dialog alone', async () => {
    const user = userEvent.setup();
    render(
      <>
        <GlobalSearch role="OWNER" />
        <Dialog open>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>Quick guide</DialogTitle>
            <p>Guide text</p>
          </DialogContent>
        </Dialog>
      </>,
    );
    await user.click(screen.getByText('Guide text'));
    await user.keyboard('/');
    expect(screen.getByRole('combobox', { hidden: true, ...BOX })).not.toHaveFocus();
  });

  it('leaves a running tour alone', async () => {
    const user = userEvent.setup();
    render(<><GlobalSearch role="OWNER" /><div className="introjs-overlay" /><button>Next step</button></>);
    await user.click(screen.getByRole('button', { name: 'Next step' }));
    await user.keyboard('/');
    expect(screen.getByRole('button', { name: 'Next step' })).toHaveFocus();
  });
});
