import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VisitsPage from '@/app/dashboard/visits/page';
import { apiClient } from '@/lib/api';

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
    fireEvent.click(await screen.findByRole('combobox'));
    expect(await screen.findByText('Dr. Second Doctor')).toBeInTheDocument();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
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
