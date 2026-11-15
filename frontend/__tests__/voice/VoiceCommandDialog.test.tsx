import { UserRole } from '@cms/shared-types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceCommandDialog, type HeardCommand } from '@/components/voice/VoiceCommandButton';
import { apiClient } from '@/lib/api';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getPatients: jest.fn(),
    getUsers: jest.fn(),
    getAvailableSlots: jest.fn(),
    createAppointment: jest.fn(),
  },
}));

const api = jest.mocked(apiClient);
// Sunday 15 Nov 2026, 10:00 in India.
const now = new Date('2026-11-15T04:30:00Z');
const heard: HeardCommand = {
  id: 7,
  transcript: 'Book Ramesh Kumar with Dr Shravya tomorrow at 10',
  command: { action: 'schedule_appointment', patientName: 'Ramesh Kumar', doctorName: 'Shravya', date: '2026-11-16', time: '10:00' },
};

const open = () => render(<VoiceCommandDialog heard={heard} role="RECEPTION" now={now} onClose={jest.fn()} />);
const book = () => screen.getByRole('button', { name: 'Book' });

async function chooseFirstRamesh() {
  await userEvent.click(await screen.findByRole('button', { name: 'Ramesh Kumar · 9848022338' }));
  await waitFor(() => expect(book()).toBeEnabled());
}

describe('VoiceCommandDialog', () => {
  beforeEach(() => {
    // Not resetAllMocks: that also wipes the global IntersectionObserver stub next/link relies on.
    Object.values(api).forEach((fn) => (fn as jest.Mock).mockReset());
    api.getPatients.mockResolvedValue({
      data: [
        { id: 'p1', name: 'Ramesh Kumar', phone: '9848022338' },
        { id: 'p2', name: 'Ramesh Kumar', phone: '9123456789' },
      ],
    } as never);
    api.getUsers.mockResolvedValue({
      users: [
        { id: 'd1', firstName: 'Shravya', lastName: 'Rao', role: UserRole.DOCTOR },
        { id: 'd2', firstName: 'Anil', lastName: 'Rao', role: UserRole.DOCTOR },
      ],
    } as never);
    api.getAvailableSlots.mockResolvedValue({ availableSlots: ['10:00-10:30', '10:30-11:00'] } as never);
  });

  it('keeps Book disabled while two patients match, and enables it once one is chosen', async () => {
    open();
    expect(await screen.findByRole('group', { name: 'Choose patient' })).toBeInTheDocument();
    expect(screen.getByText('Dr Shravya Rao')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.className === 'font-medium' && el.textContent === 'Tomorrow · Mon 16 Nov, 10:00–10:30')).toBeInTheDocument();
    expect(book()).toBeDisabled();
    await chooseFirstRamesh();
    expect(screen.getByText('Ramesh Kumar · 9848022338')).toBeInTheDocument();
  });

  it('books once with the exact payload and an idempotency key, then links to the day', async () => {
    api.createAppointment.mockResolvedValue({ id: 'a1' } as never);
    open();
    await chooseFirstRamesh();
    await userEvent.click(book());
    const link = await screen.findByRole('link', { name: 'View in Appointments' });
    expect(link).toHaveAttribute('href', '/dashboard/appointments?date=2026-11-16&doctorId=d1');
    expect(link).toHaveClass('underline', 'text-primary');
    expect(link.querySelector('svg')).not.toBeNull();
    expect(api.createAppointment.mock.calls).toEqual([[
      { patientId: 'p1', doctorId: 'd1', date: '2026-11-16', slot: '10:00-10:30', visitType: 'OPD' },
      { idempotencyKey: expect.stringMatching(/^voice-command-7-/) },
    ]]);
    expect(screen.getByRole('heading', { name: 'Appointment booked' })).toBeInTheDocument();
  });

  it('sends one booking for a double click', async () => {
    let finish: (value: unknown) => void = () => {};
    api.createAppointment.mockReturnValue(new Promise((resolve) => { finish = resolve; }) as never);
    open();
    await chooseFirstRamesh();
    await userEvent.dblClick(book());
    finish({ id: 'a1' });
    await screen.findByRole('heading', { name: 'Appointment booked' });
    expect(api.createAppointment).toHaveBeenCalledTimes(1);
  });

  it('shows a slot conflict and offers the free times that remain', async () => {
    api.createAppointment.mockRejectedValue(Object.assign(new Error('Scheduling conflict detected'), {
      status: 409,
      body: { message: 'Scheduling conflict detected', conflicts: [{ type: 'doctor' }], suggestions: ['10:30-11:00'] },
    }));
    open();
    await chooseFirstRamesh();
    api.getAvailableSlots.mockResolvedValue({ availableSlots: ['10:30-11:00', '11:00-11:30'] } as never);
    await userEvent.click(book());
    expect(await screen.findByRole('alert')).toHaveTextContent('Scheduling conflict detected. Pick another time.');
    expect(await screen.findByRole('group', { name: 'Choose time' })).toHaveTextContent('10:30');
    expect(screen.getByText('10:00 is not free. Nearest free times:')).toBeInTheDocument();
    expect(book()).toBeDisabled();
  });

  it('explains instead of offering Book when the role cannot do the action', async () => {
    render(
      <VoiceCommandDialog
        heard={{ ...heard, command: { action: 'start_visit', patientName: 'Ramesh Kumar' } }}
        role="RECEPTION"
        now={now}
        onClose={jest.fn()}
      />,
    );
    expect(await screen.findByText("Reception accounts can't start visits.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Can't do that" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start visit' })).toBeNull();
  });
});
