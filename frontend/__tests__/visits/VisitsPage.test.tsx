import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VisitsPage from '@/app/dashboard/visits/page';
import { apiClient } from '@/lib/api';
const navigation = jest.requireMock('next/navigation');

// Mock the API client
jest.mock('@/lib/api', () => ({
  apiClient: {
    getPatients: jest.fn(),
    getPatient: jest.fn().mockResolvedValue({ id: 'patient-1', name: 'Synthetic Patient' }),
    getUser: jest.fn().mockResolvedValue({ id: 'doctor-1', firstName: 'Synthetic', lastName: 'Doctor' }),
    get: jest.fn(),
    getAppointment: jest.fn(),
    createVisit: jest.fn(),
    completeVisit: jest.fn(),
  },
}));

// Mock the MedicalVisitForm component to avoid complex rendering
jest.mock('@/components/visits/MedicalVisitForm', () => {
  return function MockMedicalVisitForm({ patientId, doctorId }: { patientId: string; doctorId: string }) {
    return (
      <div data-testid="medical-visit-form">
        Medical Visit Form - Patient: {patientId}, Doctor: {doctorId}
      </div>
    );
  };
});

describe('VisitsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('offers doctors from every page of the branch user list', async () => {
    const scrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = jest.fn();
    jest.mocked(apiClient.getPatients).mockResolvedValue({ data: [{ id: 'patient-123', name: 'Patient' }] });
    jest.mocked(apiClient.get).mockImplementation(async (path: string, params?: any) => {
      if (path === '/auth/me') return { role: 'DOCTOR' } as any;
      if (params?.page === 2) return { users: [{ id: 'doctor-2', firstName: 'Second', lastName: 'Doctor' }], pagination: { totalPages: 2 } } as any;
      return { users: [{ id: 'doctor-1', firstName: 'First', lastName: 'Doctor' }], pagination: { totalPages: 2 } } as any;
    });

    render(<VisitsPage />);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/users', { role: 'DOCTOR', page: 2, limit: 100 }));
    fireEvent.click(await screen.findByRole('combobox', { name: 'Select Doctor' }));
    expect(await screen.findByText('Dr. Second Doctor')).toBeInTheDocument();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
  });

  describe('attributed doctor', () => {
    const doctors = [
      { id: 'doctor-1', firstName: 'First', lastName: 'Doctor' },
      { id: 'doctor-2', firstName: 'Second', lastName: 'Doctor' },
    ];
    const signInAs = (me: { id: string; role: string }) => {
      jest.mocked(apiClient.getPatients).mockResolvedValue({ data: [{ id: 'patient-123', name: 'Patient' }] } as any);
      jest.mocked(apiClient.get).mockImplementation(async (path: string) => {
        if (path === '/auth/me') return me as any;
        return { users: doctors, pagination: { totalPages: 1 } } as any;
      });
    };

    it('defaults to the signed-in doctor, not the first doctor in the list', async () => {
      signInAs({ id: 'doctor-2', role: 'DOCTOR' });
      render(<VisitsPage />);
      const picker = await screen.findByRole('combobox', { name: 'Select Doctor' });
      await waitFor(() => expect(picker).toHaveTextContent('Dr. Second Doctor'));
      expect(picker).not.toHaveTextContent('Dr. First Doctor');
    });

    it('leaves the doctor unset for an admin and asks for a choice', async () => {
      signInAs({ id: 'admin-1', role: 'ADMIN' });
      render(<VisitsPage />);
      const picker = await screen.findByRole('combobox', { name: 'Select Doctor' });
      await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/auth/me'));
      expect(picker).toHaveTextContent('Choose a doctor...');
    });
  });

  describe('opening a colleague\'s appointment', () => {
    const doctors = [
      { id: 'doctor-1', firstName: 'Shravya', lastName: 'Rao' },
      { id: 'doctor-2', firstName: 'Praneeta', lastName: 'Jain' },
    ];
    const open = (me: { id: string; role: string }, order: 'me-first' | 'appointment-first') => {
      jest.mocked(apiClient.getPatients).mockResolvedValue({ data: [{ id: 'patient-123', name: 'Patient' }] } as any);
      let releaseMe: () => void = () => {};
      const meGate = new Promise<void>((resolve) => { releaseMe = resolve; });
      jest.mocked(apiClient.get).mockImplementation(async (path: string) => {
        if (path === '/auth/me') {
          if (order === 'appointment-first') await meGate;
          return me as any;
        }
        return { users: doctors, pagination: { totalPages: 1 } } as any;
      });
      jest.mocked(apiClient.getAppointment).mockImplementation(async () => {
        if (order === 'me-first') await new Promise((r) => setTimeout(r, 50));
        else releaseMe();
        return { id: 'appt-1', doctorId: 'doctor-2' } as any;
      });
      return jest.spyOn(navigation, 'useSearchParams').mockReturnValue(
        new URLSearchParams('patientId=patient-123&appointmentId=appt-1&autoStart=true') as any,
      );
    };

    it.each(['me-first', 'appointment-first'] as const)(
      'gives a doctor on a colleague\'s appointment the booked doctor, locked, with a note (%s)',
      async (order) => {
        const spy = open({ id: 'doctor-1', role: 'DOCTOR' }, order);
        render(<VisitsPage />);
        await waitFor(() => expect(apiClient.getAppointment).toHaveBeenCalled());
        const picker = await screen.findByRole('combobox', { name: 'Attending doctor' });
        await waitFor(() => expect(picker).toHaveTextContent('Dr. Praneeta Jain'));
        expect(picker).toBeDisabled();
        expect(
          await screen.findByText(
            "Booked with Dr. Praneeta Jain. Change the appointment's doctor to see this patient yourself.",
          ),
        ).toBeInTheDocument();
        expect(screen.getByTestId('medical-visit-form')).toHaveTextContent('Doctor: doctor-2');
        spy.mockRestore();
      },
    );

    it('never shows the signed-in doctor while the appointment is still loading', async () => {
      const spy = open({ id: 'doctor-1', role: 'DOCTOR' }, 'me-first');
      render(<VisitsPage />);
      await waitFor(() => expect(apiClient.getAppointment).toHaveBeenCalled());
      expect(screen.queryByTestId('medical-visit-form')).not.toBeInTheDocument();
      await screen.findByTestId('medical-visit-form');
      expect(screen.getByTestId('medical-visit-form')).not.toHaveTextContent('Doctor: doctor-1');
      spy.mockRestore();
    });

    it('locks the doctor and shows no note when the doctor opens their own appointment', async () => {
      const spy = open({ id: 'doctor-2', role: 'DOCTOR' }, 'me-first');
      render(<VisitsPage />);
      const picker = await screen.findByRole('combobox', { name: 'Attending doctor' });
      await waitFor(() => expect(picker).toHaveTextContent('Dr. Praneeta Jain'));
      expect(picker).toBeDisabled();
      expect(screen.queryByText(/Booked with/)).not.toBeInTheDocument();
      spy.mockRestore();
    });

    it('drops the appointment when a different patient is chosen, so the doctor defaults again', async () => {
      const spy = open({ id: 'doctor-1', role: 'DOCTOR' }, 'me-first');
      render(<VisitsPage />);
      await screen.findByTestId('medical-visit-form');
      jest.mocked(apiClient.getPatients).mockResolvedValue({
        data: [
          { id: 'patient-123', name: 'Patient' },
          { id: 'patient-456', name: 'Rahul Kumar' },
        ],
      } as any);
      fireEvent.click(screen.getByRole('button', { name: /Back to Setup/ }));
      fireEvent.focus(await screen.findByPlaceholderText('Search name, phone, or email'));
      fireEvent.click(await screen.findByRole('option', { name: /Rahul Kumar/ }));
      const setupPicker = screen.getByRole('combobox', { name: 'Select Doctor' });
      await waitFor(() => expect(setupPicker).toHaveTextContent('Dr. Shravya Rao'));
      expect(setupPicker).toBeEnabled();
      fireEvent.click(await screen.findByRole('button', { name: 'Start Visit Documentation' }));
      await waitFor(() =>
        expect(screen.getByTestId('medical-visit-form')).toHaveTextContent('Patient: patient-456, Doctor: doctor-1'),
      );
      const picker = screen.getByRole('combobox', { name: 'Attending doctor' });
      expect(picker).toBeEnabled();
      expect(screen.queryByText(/Booked with/)).not.toBeInTheDocument();
      spy.mockRestore();
    });

    it('selects the appointment doctor for a receptionist without a note', async () => {
      const spy = open({ id: 'rec-1', role: 'RECEPTIONIST' }, 'me-first');
      render(<VisitsPage />);
      const picker = await screen.findByRole('combobox', { name: 'Attending doctor' });
      await waitFor(() => expect(picker).toHaveTextContent('Dr. Praneeta Jain'));
      expect(screen.queryByText(/Booked with/)).not.toBeInTheDocument();
      spy.mockRestore();
    });
  });

  it('does not open a visit for an admin who arrives without a doctor', async () => {
    jest.mocked(apiClient.getPatients).mockResolvedValue({ data: [{ id: 'patient-123', name: 'Patient' }] } as any);
    jest.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === '/auth/me') return { id: 'admin-1', role: 'ADMIN' } as any;
      return { users: [{ id: 'doctor-1', firstName: 'First', lastName: 'Doctor' }], pagination: { totalPages: 1 } } as any;
    });
    const spy = jest.spyOn(navigation, 'useSearchParams').mockReturnValue(
      new URLSearchParams('patientId=patient-123&autoStart=true') as any,
    );
    render(<VisitsPage />);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/auth/me'));
    expect(await screen.findByText('Ready to Start')).toBeInTheDocument();
    expect(screen.getByText('Please select a doctor to start the visit.')).toBeInTheDocument();
    expect(screen.queryByTestId('medical-visit-form')).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it('renders loading state initially', () => {
    const mockGetPatients = jest.mocked(apiClient.getPatients);
    const mockGet = jest.mocked(apiClient.get);
    
    // Mock API calls to return pending promises
    mockGetPatients.mockImplementation(() => new Promise(() => {}));
    mockGet.mockImplementation(() => new Promise(() => {}));

    render(<VisitsPage />);
    
    expect(screen.getByText('Loading visit form…')).toBeInTheDocument();
  });

  it('shows setup when patient and doctor IDs are loaded', async () => {
    const mockGetPatients = jest.mocked(apiClient.getPatients);
    const mockGet = jest.mocked(apiClient.get);
    
    // Mock successful API responses
    mockGetPatients.mockResolvedValue({
      data: [{ id: 'patient-123', name: 'John Doe' }],
    });
    
    mockGet.mockResolvedValue({
      users: [{ id: 'doctor-123', name: 'Dr. Smith', role: 'DOCTOR' }],
    });

    render(<VisitsPage />);
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search name, phone, or email')).toBeInTheDocument();
    });
    
    expect(screen.getByPlaceholderText('Search name, phone, or email')).toBeInTheDocument();
    expect(screen.queryByTestId('medical-visit-form')).not.toBeInTheDocument();
  });

  it('shows empty-state when no patients are found', async () => {
    const mockGetPatients = jest.mocked(apiClient.getPatients);
    const mockGet = jest.mocked(apiClient.get);
    
    // Mock API responses with no data
    mockGetPatients.mockResolvedValue({ data: [] });
    mockGet.mockResolvedValue({ users: [] });

    render(<VisitsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('No patients or doctors found. Please add at least one to create a visit.')).toBeInTheDocument();
    });
    
    expect(screen.queryByTestId('medical-visit-form')).not.toBeInTheDocument();
  });

  it('shows empty-state when no doctors are found', async () => {
    const mockGetPatients = jest.mocked(apiClient.getPatients);
    const mockGet = jest.mocked(apiClient.get);
    
    // Mock API responses
    mockGetPatients.mockResolvedValue({
      data: [{ id: 'patient-123', name: 'John Doe' }],
    });
    mockGet.mockResolvedValue({ users: [] });

    render(<VisitsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('No patients or doctors found. Please add at least one to create a visit.')).toBeInTheDocument();
    });
    
    expect(screen.queryByTestId('medical-visit-form')).not.toBeInTheDocument();
  });

  it('handles API errors gracefully with empty-state', async () => {
    const mockGetPatients = jest.mocked(apiClient.getPatients);
    const mockGet = jest.mocked(apiClient.get);
    
    // Mock API errors
    mockGetPatients.mockRejectedValue(new Error('Failed to fetch patients'));
    mockGet.mockRejectedValue(new Error('Failed to fetch users'));

    render(<VisitsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('No patients or doctors found. Please add at least one to create a visit.')).toBeInTheDocument();
    });
    
    expect(screen.queryByTestId('medical-visit-form')).not.toBeInTheDocument();
  });

  it('calls correct API endpoints with proper parameters', async () => {
    const mockGetPatients = jest.mocked(apiClient.getPatients);
    const mockGet = jest.mocked(apiClient.get);
    
    mockGetPatients.mockResolvedValue({
      data: [{ id: 'patient-123', name: 'John Doe' }],
    });
    
    mockGet.mockResolvedValue({
      users: [{ id: 'doctor-123', name: 'Dr. Smith', role: 'DOCTOR' }],
    });

    render(<VisitsPage />);
    
    await waitFor(() => {
      expect(mockGetPatients).toHaveBeenCalledWith({ page: 1, limit: 1 });
      expect(mockGet).toHaveBeenCalledWith('/users', { role: 'DOCTOR', page: 1, limit: 100 });
    });
  });

  it('does not automatically open the first available patient', async () => {
    const mockGetPatients = jest.mocked(apiClient.getPatients);
    const mockGet = jest.mocked(apiClient.get);
    
    // Mock multiple patients and doctors
    mockGetPatients.mockResolvedValue({
      data: [
        { id: 'patient-123', name: 'John Doe' },
        { id: 'patient-456', name: 'Jane Smith' },
      ],
    });
    
    mockGet.mockResolvedValue({
      users: [
        { id: 'doctor-123', name: 'Dr. Smith', role: 'DOCTOR' },
        { id: 'doctor-456', name: 'Dr. Johnson', role: 'DOCTOR' },
      ],
    });

    render(<VisitsPage />);
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search name, phone, or email')).toBeInTheDocument();
      expect(screen.queryByTestId('medical-visit-form')).not.toBeInTheDocument();
    });
  });

  it('handles missing patient ID in response', async () => {
    const mockGetPatients = jest.mocked(apiClient.getPatients);
    const mockGet = jest.mocked(apiClient.get);
    
    // Mock response with patient but no ID
    mockGetPatients.mockResolvedValue({
      data: [{ name: 'John Doe' }], // Missing id
    });
    
    mockGet.mockResolvedValue({
      users: [{ id: 'doctor-123', name: 'Dr. Smith', role: 'DOCTOR' }],
    });

    render(<VisitsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('No patients or doctors found. Please add at least one to create a visit.')).toBeInTheDocument();
    });
    
    expect(screen.queryByTestId('medical-visit-form')).not.toBeInTheDocument();
  });

  it('handles missing doctor ID in response', async () => {
    const mockGetPatients = jest.mocked(apiClient.getPatients);
    const mockGet = jest.mocked(apiClient.get);
    
    mockGetPatients.mockResolvedValue({
      data: [{ id: 'patient-123', name: 'John Doe' }],
    });
    
    // Mock response with doctor but no ID
    mockGet.mockResolvedValue({
      users: [{ name: 'Dr. Smith', role: 'DOCTOR' }], // Missing id
    });

    render(<VisitsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('No patients or doctors found. Please add at least one to create a visit.')).toBeInTheDocument();
    });
    
    expect(screen.queryByTestId('medical-visit-form')).not.toBeInTheDocument();
  });
});
