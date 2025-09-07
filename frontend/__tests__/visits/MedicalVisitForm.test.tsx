import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';

// Mock the API client
jest.mock('@/lib/api', () => ({
  apiClient: {
    createVisit: jest.fn(),
    completeVisit: jest.fn(),
  },
}));

// Mock alert
global.alert = jest.fn();

describe('MedicalVisitForm', () => {
  const mockProps = {
    patientId: 'patient-123',
    doctorId: 'doctor-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all form sections correctly', () => {
    render(<MedicalVisitForm {...mockProps} />);
    
    expect(screen.getByText('Medical Visit Documentation')).toBeInTheDocument();
    expect(screen.getByText('SOAP notes with vitals and plan')).toBeInTheDocument();
    
    // Check all tabs are present
    expect(screen.getByText('Subjective')).toBeInTheDocument();
    expect(screen.getByText('Objective')).toBeInTheDocument();
    expect(screen.getByText('Assessment')).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Vitals')).toBeInTheDocument();
    
    // Check buttons are present
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Complete Visit')).toBeInTheDocument();
  });

  it('allows input in subjective tab', () => {
    render(<MedicalVisitForm {...mockProps} />);
    
    const subjectiveTab = screen.getByText('Subjective');
    fireEvent.click(subjectiveTab);
    
    const subjectiveTextarea = screen.getByPlaceholderText('Chief complaint, HPI...');
    fireEvent.change(subjectiveTextarea, { target: { value: 'Patient reports headache for 2 days' } });
    
    expect(subjectiveTextarea.value).toBe('Patient reports headache for 2 days');
  });

  it('allows input in objective tab', () => {
    render(<MedicalVisitForm {...mockProps} />);
    
    const objectiveTab = screen.getByText('Objective');
    fireEvent.click(objectiveTab);
    
    const objectiveTextarea = screen.getByPlaceholderText('Physical examination findings...');
    fireEvent.change(objectiveTextarea, { target: { value: 'Patient appears well, no acute distress' } });
    
    expect(objectiveTextarea.value).toBe('Patient appears well, no acute distress');
  });

  it('allows input in assessment tab', () => {
    render(<MedicalVisitForm {...mockProps} />);
    
    const assessmentTab = screen.getByText('Assessment');
    fireEvent.click(assessmentTab);
    
    const assessmentTextarea = screen.getByPlaceholderText('Diagnosis and assessments...');
    fireEvent.change(assessmentTextarea, { target: { value: 'Tension headache' } });
    
    expect(assessmentTextarea.value).toBe('Tension headache');
  });

  it('allows input in plan tab', () => {
    render(<MedicalVisitForm {...mockProps} />);
    
    const planTab = screen.getByText('Plan');
    fireEvent.click(planTab);
    
    const planTextarea = screen.getByPlaceholderText('Treatment plan and follow-up...');
    fireEvent.change(planTextarea, { target: { value: 'Prescribe paracetamol, follow up in 1 week' } });
    
    expect(planTextarea.value).toBe('Prescribe paracetamol, follow up in 1 week');
  });

  it('allows input in vitals tab', () => {
    render(<MedicalVisitForm {...mockProps} />);
    
    const vitalsTab = screen.getByText('Vitals');
    fireEvent.click(vitalsTab);
    
    const bpSystolicInput = screen.getByPlaceholderText('BP Systolic');
    const bpDiastolicInput = screen.getByPlaceholderText('BP Diastolic');
    const heartRateInput = screen.getByPlaceholderText('Heart Rate');
    const temperatureInput = screen.getByPlaceholderText('Temperature');
    const weightInput = screen.getByPlaceholderText('Weight');
    const heightInput = screen.getByPlaceholderText('Height');
    const spo2Input = screen.getByPlaceholderText('SpO2');
    const respRateInput = screen.getByPlaceholderText('Resp. Rate');
    
    fireEvent.change(bpSystolicInput, { target: { value: '120' } });
    fireEvent.change(bpDiastolicInput, { target: { value: '80' } });
    fireEvent.change(heartRateInput, { target: { value: '72' } });
    fireEvent.change(temperatureInput, { target: { value: '36.5' } });
    fireEvent.change(weightInput, { target: { value: '70' } });
    fireEvent.change(heightInput, { target: { value: '175' } });
    fireEvent.change(spo2Input, { target: { value: '98' } });
    fireEvent.change(respRateInput, { target: { value: '16' } });
    
    expect(bpSystolicInput.value).toBe('120');
    expect(bpDiastolicInput.value).toBe('80');
    expect(heartRateInput.value).toBe('72');
    expect(temperatureInput.value).toBe('36.5');
    expect(weightInput.value).toBe('70');
    expect(heightInput.value).toBe('175');
    expect(spo2Input.value).toBe('98');
    expect(respRateInput.value).toBe('16');
  });

  it('saves visit with minimal data when save button is clicked', async () => {
    const mockCreateVisit = jest.mocked(apiClient.createVisit);
    mockCreateVisit.mockResolvedValue({ id: 'visit-123' });

    render(<MedicalVisitForm {...mockProps} />);
    
    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(mockCreateVisit).toHaveBeenCalledWith({
        patientId: 'patient-123',
        doctorId: 'doctor-123',
        complaints: [{ complaint: 'General consultation' }],
        examination: undefined,
        diagnosis: undefined,
        treatmentPlan: undefined,
        vitals: {
          systolicBP: undefined,
          diastolicBP: undefined,
          heartRate: undefined,
          temperature: undefined,
          weight: undefined,
          height: undefined,
          oxygenSaturation: undefined,
          respiratoryRate: undefined,
        },
      });
    });
    
    expect(global.alert).toHaveBeenCalledWith('Visit saved');
  });

  it('saves and completes visit when complete visit button is clicked', async () => {
    const mockCreateVisit = jest.mocked(apiClient.createVisit);
    const mockCompleteVisit = jest.mocked(apiClient.completeVisit);
    
    mockCreateVisit.mockResolvedValue({ id: 'visit-123' });
    mockCompleteVisit.mockResolvedValue({});

    render(<MedicalVisitForm {...mockProps} />);
    
    const completeButton = screen.getByText('Complete Visit');
    fireEvent.click(completeButton);
    
    await waitFor(() => {
      expect(mockCreateVisit).toHaveBeenCalled();
      expect(mockCompleteVisit).toHaveBeenCalledWith('visit-123', {});
    });
    
    expect(global.alert).toHaveBeenCalledWith('Visit saved and completed');
  });

  it('saves visit with comprehensive data', async () => {
    const mockCreateVisit = jest.mocked(apiClient.createVisit);
    mockCreateVisit.mockResolvedValue({ id: 'visit-123' });

    render(<MedicalVisitForm {...mockProps} />);
    
    // Fill in subjective data
    const subjectiveTab = screen.getByText('Subjective');
    fireEvent.click(subjectiveTab);
    const subjectiveTextarea = screen.getByPlaceholderText('Chief complaint, HPI...');
    fireEvent.change(subjectiveTextarea, { target: { value: 'Headache for 2 days' } });
    
    // Fill in objective data
    const objectiveTab = screen.getByText('Objective');
    fireEvent.click(objectiveTab);
    const objectiveTextarea = screen.getByPlaceholderText('Physical examination findings...');
    fireEvent.change(objectiveTextarea, { target: { value: 'Patient appears well' } });
    
    // Fill in assessment data
    const assessmentTab = screen.getByText('Assessment');
    fireEvent.click(assessmentTab);
    const assessmentTextarea = screen.getByPlaceholderText('Diagnosis and assessments...');
    fireEvent.change(assessmentTextarea, { target: { value: 'Tension headache' } });
    
    // Fill in plan data
    const planTab = screen.getByText('Plan');
    fireEvent.click(planTab);
    const planTextarea = screen.getByPlaceholderText('Treatment plan and follow-up...');
    fireEvent.change(planTextarea, { target: { value: 'Paracetamol 500mg TID' } });
    
    // Fill in vitals data
    const vitalsTab = screen.getByText('Vitals');
    fireEvent.click(vitalsTab);
    const bpSystolicInput = screen.getByPlaceholderText('BP Systolic');
    fireEvent.change(bpSystolicInput, { target: { value: '120' } });
    
    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(mockCreateVisit).toHaveBeenCalledWith({
        patientId: 'patient-123',
        doctorId: 'doctor-123',
        complaints: [{ complaint: 'Headache for 2 days' }],
        examination: { generalAppearance: 'Patient appears well' },
        diagnosis: [{ diagnosis: 'Tension headache', icd10Code: 'R69', type: 'Primary' }],
        treatmentPlan: { notes: 'Paracetamol 500mg TID' },
        vitals: {
          systolicBP: 120,
          diastolicBP: undefined,
          heartRate: undefined,
          temperature: undefined,
          weight: undefined,
          height: undefined,
          oxygenSaturation: undefined,
          respiratoryRate: undefined,
        },
      });
    });
  });

  it('handles API errors gracefully', async () => {
    const mockCreateVisit = jest.mocked(apiClient.createVisit);
    mockCreateVisit.mockRejectedValue(new Error('API Error'));

    render(<MedicalVisitForm {...mockProps} />);
    
    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(mockCreateVisit).toHaveBeenCalled();
    });
    
    expect(global.alert).toHaveBeenCalledWith('Failed to save visit');
  });

  it('disables buttons while saving', async () => {
    const mockCreateVisit = jest.mocked(apiClient.createVisit);
    mockCreateVisit.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    render(<MedicalVisitForm {...mockProps} />);
    
    const saveButton = screen.getByText('Save');
    const completeButton = screen.getByText('Complete Visit');
    
    fireEvent.click(saveButton);
    
    expect(saveButton).toBeDisabled();
    expect(completeButton).toBeDisabled();
    
    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
      expect(completeButton).not.toBeDisabled();
    });
  });

  it('converts numeric vitals correctly', async () => {
    const mockCreateVisit = jest.mocked(apiClient.createVisit);
    mockCreateVisit.mockResolvedValue({ id: 'visit-123' });

    render(<MedicalVisitForm {...mockProps} />);
    
    const vitalsTab = screen.getByText('Vitals');
    fireEvent.click(vitalsTab);
    
    // Fill in all vitals with string values
    fireEvent.change(screen.getByPlaceholderText('BP Systolic'), { target: { value: '120' } });
    fireEvent.change(screen.getByPlaceholderText('BP Diastolic'), { target: { value: '80' } });
    fireEvent.change(screen.getByPlaceholderText('Heart Rate'), { target: { value: '72' } });
    fireEvent.change(screen.getByPlaceholderText('Temperature'), { target: { value: '36.5' } });
    fireEvent.change(screen.getByPlaceholderText('Weight'), { target: { value: '70' } });
    fireEvent.change(screen.getByPlaceholderText('Height'), { target: { value: '175' } });
    fireEvent.change(screen.getByPlaceholderText('SpO2'), { target: { value: '98' } });
    fireEvent.change(screen.getByPlaceholderText('Resp. Rate'), { target: { value: '16' } });
    
    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(mockCreateVisit).toHaveBeenCalledWith(
        expect.objectContaining({
          vitals: {
            systolicBP: 120,
            diastolicBP: 80,
            heartRate: 72,
            temperature: 36.5,
            weight: 70,
            height: 175,
            oxygenSaturation: 98,
            respiratoryRate: 16,
          },
        })
      );
    });
  });

  it('handles empty vitals correctly', async () => {
    const mockCreateVisit = jest.mocked(apiClient.createVisit);
    mockCreateVisit.mockResolvedValue({ id: 'visit-123' });

    render(<MedicalVisitForm {...mockProps} />);
    
    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(mockCreateVisit).toHaveBeenCalledWith(
        expect.objectContaining({
          vitals: {
            systolicBP: undefined,
            diastolicBP: undefined,
            heartRate: undefined,
            temperature: undefined,
            weight: undefined,
            height: undefined,
            oxygenSaturation: undefined,
            respiratoryRate: undefined,
          },
        })
      );
    });
  });
}); 