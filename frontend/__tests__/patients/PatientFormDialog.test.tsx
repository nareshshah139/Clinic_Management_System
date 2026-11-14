import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatientFormDialog from '@/components/patients/PatientFormDialog';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@/lib/api', () => ({ apiClient: {
  getUsers: jest.fn(),
  getRooms: jest.fn(),
  getPatient: jest.fn(),
  createPatient: jest.fn(),
  updatePatient: jest.fn(),
  getAvailableSlots: jest.fn(),
  getRoomSchedule: jest.fn(),
  createAppointment: jest.fn(),
} }));

const api = apiClient as jest.Mocked<typeof apiClient>;
const isoDate = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

beforeEach(() => {
  Object.values(api).forEach((fn) => (fn as jest.Mock).mockReset());
  localStorage.clear();
  api.getUsers.mockResolvedValue({ data: [{ id: 'doc-1', firstName: 'Priya', lastName: 'Menon' }] } as never);
  api.getRooms.mockResolvedValue({ rooms: [] } as never);
  api.createPatient.mockResolvedValue({ id: 'p9' } as never);
});

async function fillNewPatient(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Name *'), 'Farhan Qureshi');
  await user.type(screen.getByLabelText('Phone *'), '9890012345');
  await user.click(screen.getByRole('radio', { name: 'Male' }));
}

const renderNew = (onSaved = jest.fn()) => render(<PatientFormDialog open onOpenChange={jest.fn()} onSaved={onSaved} />);

describe('registering a patient', () => {
  it('books for today by default with the only doctor chosen, and switches to register only in one click', async () => {
    const user = userEvent.setup();
    renderNew();
    expect(await screen.findByRole('combobox', { name: /Doctor/ })).toHaveTextContent('Dr. Priya Menon');
    expect(screen.getByRole('button', { name: 'Register and book' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Register only' }));
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Doctor/ })).not.toBeInTheDocument();
  });

  it('starts with no gender chosen and refuses to save without one', async () => {
    const user = userEvent.setup();
    renderNew();
    await user.type(await screen.findByLabelText('Name *'), 'Farhan Qureshi');
    await user.type(screen.getByLabelText('Phone *'), '9890012345');
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false']);
    await user.click(screen.getByRole('button', { name: 'Register and book' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Required: gender.');
    expect(api.createPatient).not.toHaveBeenCalled();
  });

  it('keeps the other details behind More details', async () => {
    const user = userEvent.setup();
    renderNew();
    await screen.findByLabelText('Name *');
    expect(screen.queryByLabelText('ABHA ID')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'More details' }));
    expect(screen.getByLabelText('ABHA ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('shows the time and token after booking today and links to the list', async () => {
    const user = userEvent.setup();
    api.getAvailableSlots.mockResolvedValue({ availableSlots: ['15:30-16:00', '16:00-16:30'] } as never);
    api.createAppointment.mockResolvedValue({ id: 'a1', tokenNumber: 4 } as never);
    const onSaved = jest.fn();
    renderNew(onSaved);
    await fillNewPatient(user);
    await user.click(screen.getByRole('button', { name: 'Register and book' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Farhan Qureshi is booked with Dr. Priya Menon today at 15:30-16:00, token 4.');
    expect(screen.getByRole('link', { name: "Open today's list" })).toHaveAttribute('href', `/dashboard/appointments?date=${isoDate(0)}`);
    expect(api.createAppointment).toHaveBeenCalledWith(expect.objectContaining({ patientId: 'p9', doctorId: 'doc-1', date: isoDate(0), slot: '15:30-16:00' }));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('appointments.doctorId')).toBe('doc-1');
  });

  it('says which day when today has no free time', async () => {
    const user = userEvent.setup();
    api.getAvailableSlots.mockImplementation((async ({ date }: { date: string }) => ({ availableSlots: date === isoDate(1) ? ['09:00-09:30'] : [] })) as never);
    api.createAppointment.mockResolvedValue({ id: 'a1', tokenNumber: 1 } as never);
    renderNew();
    await fillNewPatient(user);
    await user.click(screen.getByRole('button', { name: 'Register and book' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('at 09:00-09:30, token 1. Today had no free time.');
    expect(status).not.toHaveTextContent('today at');
    expect(api.createAppointment).toHaveBeenCalledWith(expect.objectContaining({ date: isoDate(1) }));
  });

  it('does not book another day when the booking call fails, and links to Appointments', async () => {
    const user = userEvent.setup();
    api.getAvailableSlots.mockResolvedValue({ availableSlots: ['15:30-16:00'] } as never);
    api.createAppointment.mockRejectedValue(new Error('Slot could not be saved'));
    renderNew();
    await fillNewPatient(user);
    await user.click(screen.getByRole('button', { name: 'Register and book' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Patient saved, not booked: Slot could not be saved');
    expect(screen.getByRole('link', { name: 'Open Appointments' })).toHaveAttribute('href', '/dashboard/appointments?patientId=p9');
    expect(api.createAppointment).toHaveBeenCalledTimes(1);
    expect(api.getAvailableSlots).toHaveBeenCalledTimes(1);
  });

  it('reports when no day in the next week has a free time', async () => {
    const user = userEvent.setup();
    api.getAvailableSlots.mockResolvedValue({ availableSlots: [] } as never);
    renderNew();
    await fillNewPatient(user);
    await user.click(screen.getByRole('button', { name: 'Register and book' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Patient saved, not booked: no free time in the next 7 days.');
    expect(api.getAvailableSlots).toHaveBeenCalledTimes(8);
    expect(api.createAppointment).not.toHaveBeenCalled();
  });

  it('registers without booking when Register only is chosen', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();
    render(<PatientFormDialog open onOpenChange={onOpenChange} onSaved={jest.fn()} />);
    await fillNewPatient(user);
    await user.click(screen.getByRole('button', { name: 'Register only' }));
    await user.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.createPatient).toHaveBeenCalledWith(expect.objectContaining({ name: 'Farhan Qureshi', gender: 'MALE', phone: '9890012345' }));
    expect(api.getAvailableSlots).not.toHaveBeenCalled();
  });
});

describe('editing a patient', () => {
  const stored = { id: 'p1', name: 'Rohan Kulkarni', gender: 'MALE', dob: '1988-07-19T00:00:00.000Z', age: 38, phone: '9822011102', consultationType: 'ONLINE', primaryDoctorId: 'doc-1' };

  it('shows every field and no booking controls', async () => {
    api.getPatient.mockResolvedValue(stored as never);
    render(<PatientFormDialog open onOpenChange={jest.fn()} patientId="p1" onSaved={jest.fn()} />);
    expect(await screen.findByLabelText('Phone *')).toHaveValue('9822011102');
    for (const label of ['Name *', 'Age (years)', 'ABHA ID', 'Email', 'Address', 'Emergency contact']) expect(screen.getByLabelText(label)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Book for today' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More details' })).not.toBeInTheDocument();
  });

  it('shows the age worked out from the date of birth, not a stale stored age', async () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 34);
    dob.setMonth(dob.getMonth() - 1);
    api.getPatient.mockResolvedValue({ ...stored, dob: dob.toISOString(), age: 33 } as never);
    render(<PatientFormDialog open onOpenChange={jest.fn()} patientId="p1" onSaved={jest.fn()} />);
    expect(await screen.findByLabelText('Age (years)')).toHaveValue(34);
  });

  it('sends only the phone when only the phone changed', async () => {
    const user = userEvent.setup();
    api.getPatient.mockResolvedValue(stored as never);
    api.updatePatient.mockResolvedValue({} as never);
    const onSaved = jest.fn();
    render(<PatientFormDialog open onOpenChange={jest.fn()} patientId="p1" onSaved={onSaved} />);
    const phone = await screen.findByLabelText('Phone *');
    await user.clear(phone);
    await user.type(phone, '9822099102');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.updatePatient).toHaveBeenCalledWith('p1', { phone: '9822099102' });
  });

  it('sends the age when the age was changed', async () => {
    const user = userEvent.setup();
    api.getPatient.mockResolvedValue(stored as never);
    api.updatePatient.mockResolvedValue({} as never);
    render(<PatientFormDialog open onOpenChange={jest.fn()} patientId="p1" onSaved={jest.fn()} />);
    const age = await screen.findByLabelText('Age (years)');
    await user.clear(age);
    await user.type(age, '41');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.updatePatient).toHaveBeenCalledWith('p1', { age: 41 }));
  });
});
