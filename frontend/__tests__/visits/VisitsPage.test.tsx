import { render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import VisitsPage from '@/app/dashboard/visits/page';
import { apiClient } from '@/lib/api';

// Mock the API client
jest.mock('@/lib/api', () => ({
  apiClient: {
    getPatients: jest.fn(),
    get: jest.fn(),
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

  it('renders loading state initially', () => {
    const mockGetPatients = jest.mocked(apiClient.getPatients);
    const mockGet = jest.mocked(apiClient.get);
    
    // Mock API calls to return pending promises
    mockGetPatients.mockImplementation(() => new Promise(() => {}));
    mockGet.mockImplementation(() => new Promise(() => {}));

    render(<VisitsPage />);
    
    expect(screen.getByText('Loading visit form…')).toBeInTheDocument();
  });

  it('renders MedicalVisitForm when patient and doctor IDs are loaded', async () => {
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
      expect(screen.getByTestId('medical-visit-form')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Medical Visit Form - Patient: patient-123, Doctor: doctor-123')).toBeInTheDocument();
  });

  it('continues showing loading when no patients are found', async () => {
    const mockGetPatients = jest.mocked(apiClient.getPatients);
    const mockGet = jest.mocked(apiClient.get);
    
    // Mock API responses with no data
    mockGetPatients.mockResolvedValue({ data: [] });
    mockGet.mockResolvedValue({ users: [] });

    render(<VisitsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Loading visit form…')).toBeInTheDocument();
    });
    
    expect(screen.queryByTestId('medical-visit-form')).not.toBeInTheDocument();
  });

  it('continues showing loading when no doctors are found', async () => {
    const mockGetPatients = jest.mocked(apiClient.getPatients);
    const mockGet = jest.mocked(apiClient.get);
    
    // Mock API responses
    mockGetPatients.mockResolvedValue({
      data: [{ id: 'patient-123', name: 'John Doe' }],
    });
    mockGet.mockResolvedValue({ users: [] });

    render(<VisitsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Loading visit form…')).toBeInTheDocument();
    });
    
    expect(screen.queryByTestId('medical-visit-form')).not.toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    const mockGetPatients = jest.mocked(apiClient.getPatients);
    const mockGet = jest.mocked(apiClient.get);
    
    // Mock API errors
    mockGetPatients.mockRejectedValue(new Error('Failed to fetch patients'));
    mockGet.mockRejectedValue(new Error('Failed to fetch users'));

    render(<VisitsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Loading visit form…')).toBeInTheDocument();
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
      expect(mockGet).toHaveBeenCalledWith('/users', { role: 'DOCTOR', limit: 1 });
    });
  });

  it('uses first available patient and doctor', async () => {
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
      expect(screen.getByText('Medical Visit Form - Patient: patient-123, Doctor: doctor-123')).toBeInTheDocument();
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
      expect(screen.getByText('Loading visit form…')).toBeInTheDocument();
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
      expect(screen.getByText('Loading visit form…')).toBeInTheDocument();
    });
    
    expect(screen.queryByTestId('medical-visit-form')).not.toBeInTheDocument();
  });
}); 