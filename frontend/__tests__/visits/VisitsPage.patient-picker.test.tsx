import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VisitsPage from '@/app/dashboard/visits/page';
import { apiClient } from '@/lib/api';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getPatients: jest.fn(),
    getPatient: jest.fn(),
    getUser: jest.fn().mockResolvedValue({ id: 'doctor-1', firstName: 'Synthetic', lastName: 'Doctor' }),
    get: jest.fn(),
    getAllPatientVisitHistory: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/components/visits/MedicalVisitForm', () => function Form() { return <div data-testid="medical-form" />; });
jest.mock('@/components/patients/PatientProgressTracker', () => function Tracker() { return null; });
jest.mock('@/components/common/QuickGuide', () => ({ QuickGuide: () => null }));

const ASHA_A = { id: 'cm1aaaaaaaaaaaaaaaaaaaaaa', name: 'Asha Verma', gender: 'F', dob: '1990-01-01', phone: '9000000001' };
const ASHA_B = { id: 'cm1bbbbbbbbbbbbbbbbbbbbbb', name: 'Asha Verma', gender: 'M', age: 7, phone: '9000000002' };
const CHETAN = { id: 'cm1cccccccccccccccccccccc', name: 'Chetan Rao', gender: 'M', age: 44, phone: '9000000003' };

const getPatients = jest.mocked(apiClient.getPatients);
const searchBox = () => screen.findByRole('combobox', { name: 'Select Patient' });
const startButton = () => screen.queryByRole('button', { name: 'Start Visit Documentation' });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(apiClient.getPatient).mockImplementation(async (id: string) => ({ id, name: id === CHETAN.id ? CHETAN.name : ASHA_A.name }) as never);
  jest.mocked(apiClient.getUser).mockResolvedValue({ id: 'doctor-1', firstName: 'Synthetic', lastName: 'Doctor' } as never);
  jest.mocked(apiClient.getAllPatientVisitHistory).mockResolvedValue([] as never);
  jest.mocked(apiClient.get).mockImplementation(async (endpoint: string) =>
    endpoint === '/auth/me' ? ({ role: 'ADMIN' } as never) : ({ users: [{ id: 'doctor-1', firstName: 'Synthetic', lastName: 'Doctor' }] } as never));
  getPatients.mockImplementation(async (params?: { search?: string }) => {
    const s = (params?.search ?? '').toLowerCase();
    if (s.includes('chetan')) return { patients: [CHETAN] } as never;
    return { patients: [ASHA_A, ASHA_B, CHETAN] } as never;
  });
});

describe('Visits patient picker', () => {
  it('is a combobox named Select Patient', async () => {
    render(<VisitsPage />);
    const box = await searchBox();
    expect(box).toHaveAttribute('aria-autocomplete', 'list');
  });

  it('Enter on an empty search does not choose a patient', async () => {
    render(<VisitsPage />);
    const box = await searchBox();
    fireEvent.focus(box);
    await screen.findAllByRole('option');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(startButton()).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Patient History' })).not.toBeInTheDocument();
  });

  it('Enter chooses the only match', async () => {
    render(<VisitsPage />);
    const box = await searchBox();
    fireEvent.change(box, { target: { value: 'chetan' } });
    await screen.findByRole('option', { name: /Chetan Rao/ });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(await screen.findByRole('button', { name: 'Start Visit Documentation' })).toBeInTheDocument();
    expect(box).toHaveValue('Chetan Rao');
  });

  it('ArrowDown then Enter chooses the highlighted row', async () => {
    render(<VisitsPage />);
    const box = await searchBox();
    fireEvent.focus(box);
    await screen.findAllByRole('option');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(await screen.findByRole('button', { name: 'Start Visit Documentation' })).toBeInTheDocument();
    expect(box).toHaveValue('Chetan Rao');
  });

  it('editing the chosen name clears the selection', async () => {
    render(<VisitsPage />);
    const box = await searchBox();
    fireEvent.change(box, { target: { value: 'chetan' } });
    fireEvent.click(await screen.findByRole('option', { name: /Chetan Rao/ }));
    await screen.findByRole('button', { name: 'Start Visit Documentation' });
    fireEvent.change(box, { target: { value: 'Chetan Rao x' } });
    await waitFor(() => expect(startButton()).not.toBeInTheDocument());
    expect(screen.queryByRole('tab', { name: 'Patient History' })).not.toBeInTheDocument();
  });

  it('the menu closes when focus leaves the search', async () => {
    render(<VisitsPage />);
    const box = await searchBox();
    fireEvent.focus(box);
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    const doctor = await screen.findByRole('combobox', { name: 'Select Doctor' });
    doctor.focus();
    fireEvent.blur(box, { relatedTarget: doctor });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('a slower earlier search does not replace newer results', async () => {
    let resolveSlow: (v: unknown) => void = () => {};
    getPatients.mockImplementation((params?: { search?: string }) => {
      if (params?.search === 'asha') return new Promise((r) => { resolveSlow = r; }) as never;
      if (params?.search === 'asha v') return Promise.resolve({ patients: [CHETAN] }) as never;
      return Promise.resolve({ patients: [CHETAN] }) as never;
    });
    render(<VisitsPage />);
    const box = await searchBox();
    fireEvent.change(box, { target: { value: 'asha' } });
    await waitFor(() => expect(getPatients).toHaveBeenCalledWith({ search: 'asha', limit: 10 }));
    fireEvent.change(box, { target: { value: 'asha v' } });
    await screen.findByRole('option', { name: /Chetan Rao/ });
    await act(async () => { resolveSlow({ patients: [ASHA_A, ASHA_B] }); });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.queryByRole('option', { name: /Asha/ })).not.toBeInTheDocument();
  });

  it('a failed search says so', async () => {
    getPatients.mockImplementation(async (params?: { search?: string }) => {
      if (params?.search === 'boom') throw new Error('500');
      return { patients: [ASHA_A] } as never;
    });
    render(<VisitsPage />);
    const box = await searchBox();
    fireEvent.change(box, { target: { value: 'boom' } });
    expect(await screen.findByText("Couldn't search patients. Try again.")).toBeInTheDocument();
    expect(screen.queryByText('No results')).not.toBeInTheDocument();
  });

  it('rows show age, sex and phone, not the record id', async () => {
    render(<VisitsPage />);
    const box = await searchBox();
    fireEvent.focus(box);
    const rows = await screen.findAllByRole('option');
    expect(rows[1].textContent).toContain('7 · Male · 9000000002');
    expect(rows[0].textContent).toMatch(/· Female · 9000000001/);
    expect(screen.queryByText(/ID:/)).not.toBeInTheDocument();
    expect(screen.queryByText(ASHA_A.id, { exact: false })).not.toBeInTheDocument();
  });
});
