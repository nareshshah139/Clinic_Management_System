import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';

// Keep the real parent form and prescription editor mounted together.
jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn(), getPatient: jest.fn().mockResolvedValue({ id: 'p', name: 'Synthetic Patient' }),
  getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }), getAllPatientVisitHistory: jest.fn().mockResolvedValue([]),
  getVisits: jest.fn().mockResolvedValue({ visits: [] }), updateVisit: jest.fn().mockResolvedValue({ id: 'saved' }),
  createVisit: jest.fn().mockResolvedValue({ id: 'new-visit' }), completeVisit: jest.fn(),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }), getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/components/visits/VisitPhotos', () => function Photos() { return null; });
jest.mock('@/components/tours', () => ({ DoctorTour: () => null }));

beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); });

it.each([
  { savedComplaint: 'General consultation', editedComplaint: undefined },
  { savedComplaint: '', editedComplaint: undefined },
  { savedComplaint: 'Recorded complaint', editedComplaint: '' },
  { savedComplaint: 'Recorded complaint', editedComplaint: ' \n ' },
])('preserves other visit information when saving complaints $savedComplaint → $editedComplaint', async ({ savedComplaint, editedComplaint }) => {
  const visit = {
    id: 'saved', patientId: 'p', doctorId: 'd',
    complaints: savedComplaint ? [{ complaint: savedComplaint }] : [],
    history: { pastHistory: 'Recorded medical history', medicationHistory: 'Recorded medicines' },
    vitals: { systolicBP: 120, diastolicBP: 80, heartRate: 72, height: 160, weight: 60 },
    diagnosis: [{ diagnosis: 'Recorded diagnosis' }],
    exam: { generalAppearance: 'Recorded examination' },
    plan: { investigations: ['CBC'], followUpInstructions: 'Recorded follow-up', dermatology: { medicationPlan: [{ drugName: 'Synthetic medicine', frequency: 'ONCE_DAILY', dosage: 1, dosageUnit: 'TABLET', duration: 7, durationUnit: 'DAYS' }] } },
    scribeJson: { customSections: [{ id: 'detail', title: 'Additional detail', content: 'Recorded custom note' }] },
  };
  jest.mocked(apiClient.get).mockImplementation(async endpoint => endpoint === '/visits/saved' ? visit : {});
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="saved" userRole="ADMIN" />);
  await screen.findByDisplayValue('Recorded medical history');
  await screen.findByDisplayValue('Synthetic medicine');
  const complaintField = screen.getByLabelText('Chief Complaints', { selector: 'textarea' });
  expect(complaintField).toHaveValue(savedComplaint);
  if (editedComplaint !== undefined) fireEvent.change(complaintField, { target: { value: editedComplaint } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })); });
  await waitFor(() => expect(apiClient.updateVisit).toHaveBeenCalled());
  const payload = jest.mocked(apiClient.updateVisit).mock.calls.at(-1)![1];
  expect(payload).toMatchObject({
    history: visit.history, vitals: visit.vitals, diagnosis: visit.diagnosis,
    examination: visit.exam, treatmentPlan: visit.plan, scribeJson: visit.scribeJson,
    ...(editedComplaint !== undefined ? { complaints: [] } : savedComplaint ? { complaints: visit.complaints } : {}),
  });
});

it('saves a new visit with the real editor, an empty complaint and entered clinical information', async () => {
  jest.mocked(apiClient.get).mockResolvedValue({});
  render(<MedicalVisitForm patientId="p" doctorId="d" userRole="ADMIN" />);
  const field = await screen.findByLabelText('Chief Complaints', { selector: 'textarea' });
  expect(field).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'On Examination' }));
  fireEvent.click(screen.getByRole('button', { name: 'Acne vulgaris' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })); });
  expect(apiClient.createVisit).toHaveBeenCalledWith(expect.objectContaining({ complaints: [], diagnosis: [{ diagnosis: 'Acne vulgaris' }] }), expect.anything());
});
