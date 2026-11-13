import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VisitsPage from '@/app/dashboard/visits/page';
import { apiClient } from '@/lib/api';

type FormProps = {
  patientId: string;
  doctorId: string;
  visitDate?: string;
  appointmentId?: string;
  initialVisitId?: string;
  onSaveStatusChange?: (status: string) => void;
};

let mockQuery = '';
const mockFormRenders: FormProps[] = [];
let mockFormStatus = 'idle';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mockQuery) }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getPatients: jest.fn(),
    getPatient: jest.fn(),
    getUser: jest.fn(),
    get: jest.fn(),
    getAppointment: jest.fn(),
    getAllPatientVisitHistory: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/components/visits/MedicalVisitForm', () => {
  const React = jest.requireActual('react');
  return function MockForm(props: FormProps) {
    mockFormRenders.push(props);
    const { onSaveStatusChange } = props;
    React.useEffect(() => { onSaveStatusChange?.(mockFormStatus); }, [onSaveStatusChange]);
    return <div data-testid="medical-form">Form for {props.patientId}</div>;
  };
});
jest.mock('@/components/patients/PatientProgressTracker', () => function Tracker() { return null; });
jest.mock('@/components/common/QuickGuide', () => ({ QuickGuide: () => null }));

const VISIT_ID = 'cvisit000000000000000000001';
const PATIENT_ID = 'cpatient0000000000000000001';
const patients: Record<string, { id: string; name: string }> = {
  pA: { id: 'pA', name: 'Asha Test' },
  pB: { id: 'pB', name: 'Bina Test' },
};
const doctors = [
  { id: 'd1', firstName: 'One', lastName: 'Doc' },
  { id: 'd2', firstName: 'Two', lastName: 'Doc' },
];

const lastForm = () => mockFormRenders[mockFormRenders.length - 1];

beforeEach(() => {
  mockQuery = '';
  mockFormStatus = 'idle';
  mockFormRenders.length = 0;
  jest.clearAllMocks();
  window.history.replaceState(null, '', '/');
  jest.mocked(apiClient.getPatients).mockResolvedValue({ patients: Object.values(patients) } as any);
  jest.mocked(apiClient.getPatient).mockImplementation(async (id: string) => {
    if (patients[id]) return patients[id] as any;
    throw new Error('not found');
  });
  jest.mocked(apiClient.getUser).mockImplementation(async (id: string) => doctors.find((d) => d.id === id) as any);
  jest.mocked(apiClient.get).mockImplementation(async (endpoint: string) => {
    if (endpoint === '/auth/me') return { role: 'DOCTOR' } as any;
    if (endpoint === '/users') return { users: doctors } as any;
    throw new Error(`unexpected ${endpoint}`);
  });
});

const backToSetup = () => fireEvent.click(screen.getByRole('button', { name: 'Back to Setup' }));

async function pickPatient(name: string) {
  fireEvent.focus(screen.getByPlaceholderText('Search name, phone, or email'));
  fireEvent.click(await screen.findByText(name));
}

it('does not reuse a linked visit after another patient is chosen', async () => {
  mockQuery = `visitId=${VISIT_ID}&patientId=pA`;
  const getImpl = jest.mocked(apiClient.get).getMockImplementation()!;
  jest.mocked(apiClient.get).mockImplementation(async (endpoint: string, ...rest: any[]) => {
    if (endpoint === `/visits/${VISIT_ID}`) return { id: VISIT_ID, patient: { id: 'pA' }, doctor: { id: 'd1' } } as any;
    return getImpl(endpoint, ...rest);
  });
  render(<VisitsPage />);
  await screen.findByTestId('medical-form');
  await waitFor(() => expect(lastForm().initialVisitId).toBe(VISIT_ID));
  backToSetup();
  await pickPatient('Bina Test');
  fireEvent.click(await screen.findByRole('button', { name: 'Start Visit Documentation' }));
  await screen.findByTestId('medical-form');
  expect(lastForm()).toMatchObject({ patientId: 'pB', initialVisitId: undefined, appointmentId: undefined });
});

it('changing the doctor after Back to Setup does not reopen the form', async () => {
  const proto = HTMLElement.prototype as any;
  const saved = { scrollIntoView: proto.scrollIntoView, hasPointerCapture: proto.hasPointerCapture, releasePointerCapture: proto.releasePointerCapture };
  Object.assign(proto, { scrollIntoView: jest.fn(), hasPointerCapture: jest.fn(() => false), releasePointerCapture: jest.fn() });
  try {
    mockQuery = 'patientId=pA&autoStart=true';
    render(<VisitsPage />);
    await screen.findByTestId('medical-form');
    backToSetup();
    await screen.findByRole('button', { name: 'Start Visit Documentation' });
    const user = userEvent.setup();
    const trigger = screen.getByText('Dr. One Doc').closest('button') as HTMLElement;
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: /Two Doc/ }));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByTestId('medical-form')).not.toBeInTheDocument();
    expect(screen.getByText('Dr. Two Doc')).toBeInTheDocument();
  } finally {
    Object.assign(proto, saved);
  }
});

it("an appointment-only link opens that appointment's patient", async () => {
  mockQuery = 'appointmentId=a1';
  jest.mocked(apiClient.getAppointment).mockResolvedValue({ id: 'a1', patientId: 'pA', doctorId: 'd1', visit: null } as any);
  render(<VisitsPage />);
  await screen.findByTestId('medical-form');
  await waitFor(() => expect(lastForm()).toMatchObject({ patientId: 'pA', doctorId: 'd1', appointmentId: 'a1' }));
  expect(screen.getByText('From Appointment')).toBeInTheDocument();
});

it('an unknown visit link explains itself', async () => {
  mockQuery = `visitId=${VISIT_ID}`;
  render(<VisitsPage />);
  expect(await screen.findByText('That visit could not be opened. Search for the patient to continue.')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.queryByTestId('medical-form')).not.toBeInTheDocument();
});

it('an unknown patient link does not leave a form open', async () => {
  mockQuery = `patientId=${PATIENT_ID}&autoStart=true`;
  render(<VisitsPage />);
  expect(await screen.findByText('That patient could not be loaded. Search for the patient to continue.')).toBeInTheDocument();
  expect(screen.queryByTestId('medical-form')).not.toBeInTheDocument();
});

it('Back to Setup removes the link from the address bar', async () => {
  window.history.replaceState(null, '', '/dashboard/visits?patientId=pA');
  mockQuery = 'patientId=pA';
  render(<VisitsPage />);
  await screen.findByTestId('medical-form');
  backToSetup();
  await screen.findByRole('button', { name: 'Start Visit Documentation' });
  expect(window.location.search).toBe('');
});

it('Back to Setup asks before leaving unsaved changes', async () => {
  mockFormStatus = 'unsaved';
  mockQuery = 'patientId=pA';
  render(<VisitsPage />);
  await screen.findByTestId('medical-form');
  backToSetup();
  expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  await waitFor(() => expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument());
  expect(screen.getByTestId('medical-form')).toBeInTheDocument();
  backToSetup();
  fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
  expect(await screen.findByRole('button', { name: 'Start Visit Documentation' })).toBeInTheDocument();
  expect(screen.queryByTestId('medical-form')).not.toBeInTheDocument();

  mockFormStatus = 'saved';
  fireEvent.click(screen.getByRole('button', { name: 'Start Visit Documentation' }));
  await screen.findByTestId('medical-form');
  backToSetup();
  expect(await screen.findByRole('button', { name: 'Start Visit Documentation' })).toBeInTheDocument();
  expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
});

it('the visit date stays the same while the form is open', async () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] });
  try {
    jest.setSystemTime(new Date('2026-03-01T10:00:00Z'));
    let releaseDoctor: () => void = () => {};
    jest.mocked(apiClient.getUser).mockImplementation((id: string) => new Promise((resolve) => {
      releaseDoctor = () => resolve(doctors.find((d) => d.id === id) as any);
    }));
    mockQuery = 'patientId=pA&autoStart=true';
    render(<VisitsPage />);
    await act(async () => { await jest.advanceTimersByTimeAsync(10); });
    await waitFor(() => expect(screen.getByTestId('medical-form')).toBeInTheDocument());
    const rendersBefore = mockFormRenders.length;
    jest.setSystemTime(new Date('2026-03-01T10:05:00Z'));
    await act(async () => { releaseDoctor(); await jest.advanceTimersByTimeAsync(10); });
    expect(mockFormRenders.length).toBeGreaterThan(rendersBefore);
    const dates = new Set(mockFormRenders.map((p) => p.visitDate));
    expect(dates.size).toBe(1);
  } finally {
    jest.useRealTimers();
  }
});
