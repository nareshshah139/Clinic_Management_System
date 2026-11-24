import { act, fireEvent, render, screen } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';
import { UserRole } from '@cms/shared-types';
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), getPatient: jest.fn(), getPatientVisitHistory: jest.fn(), getAllPatientVisitHistory: jest.fn(), getVisits: jest.fn(), updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn() } }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/components/visits/VisitPhotos', () => function Photos() { return null; });
jest.mock('@/components/tours/DoctorTour', () => ({ DoctorTour: () => null }));
jest.mock('@/components/visits/PrescriptionBuilder', () => function Editor() { return null; });

const history = 'Type 2 diabetes on metformin since 2018, hypothyroidism on levothyroxine';

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); localStorage.clear();
  (apiClient.getPatientVisitHistory as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.getAllPatientVisitHistory as jest.Mock).mockResolvedValue([]);
  (apiClient.getVisits as jest.Mock).mockResolvedValue({ visits: [] });
});
afterEach(() => { jest.useRealTimers(); });

it('lets touch and keyboard users expand the full medical history without hovering', async () => {
  render(<MedicalVisitForm patientId="p" doctorId="d" userRole={UserRole.ADMIN} patient={{ id: 'p', allergies: 'Penicillin, latex', medicalHistory: history }} />);
  await act(async () => { jest.advanceTimersByTime(100); });

  const toggle = screen.getByRole('button', { name: `History: ${history}` });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
