import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn().mockResolvedValue({}), getPatient: jest.fn().mockResolvedValue({}),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getAllPatientVisitHistory: jest.fn().mockResolvedValue([]), getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
  getPrescriptions: jest.fn().mockResolvedValue({ prescriptions: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }),
  getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
beforeEach(() => localStorage.clear());
it('sends examination diagnosis shortcuts and explicitly unchecked family history to the visit saver', async () => {
  const onClinicalDataChange = jest.fn();
  render(<PrescriptionBuilder patientId="synthetic" visitId={null} doctorId="doctor" onClinicalDataChange={onClinicalDataChange} />);
  await waitFor(() => expect(onClinicalDataChange).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Acne vulgaris', exact: true }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'DM', exact: true }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'DM', exact: true }));
  await waitFor(() => expect(onClinicalDataChange).toHaveBeenLastCalledWith(expect.objectContaining({
    diagnosis: [{ diagnosis: 'Acne vulgaris' }],
    history: expect.objectContaining({ familyHistory: expect.objectContaining({ dm: false }) }),
  })));
});
it('sends restored history, examination, medications, procedures, custom sections and follow-up together', async () => {
  const item = { drugName: 'Synthetic medicine', dosage: 10, dosageUnit: 'MG', frequency: 'ONCE_DAILY', duration: 7, durationUnit: 'DAYS', notes: 'Medicine note', applicationSite: 'Arm', applicationAmount: 'Thin layer', leaveOn: false, washOffAfterMinutes: 10, taperSchedule: 'Taper note', pregnancyWarning: true, photosensitivityWarning: false, foodInstructions: 'After food', pulseRegimen: 'Pulse note' };
  localStorage.setItem('rxDraft:synthetic:standalone', JSON.stringify({
    chiefComplaints: 'Complaint', diagnosis: 'Primary diagnosis', exDermDx: ['Psoriasis'],
    pastHistory: 'Past history', medicationHistory: 'Medication history', menstrualHistory: 'Menstrual history', familyHistoryDM: true, familyHistoryOthers: 'Family note',
    exObjective: 'Examination', exSkinType: 'III', exMorphology: ['Papules'], exDistribution: ['Face'], exAcneSeverity: 'Mild', exItchScore: '0', exTriggers: 'Sun', exPriorTx: 'Prior treatment', skinConcerns: ['Dryness'],
    vitalsHeightCm: 160, vitalsWeightKg: 60, vitalsBpSys: 120, vitalsBpDia: 80, vitalsPulse: 72,
    investigations: ['CBC'], procedures: 'Procedure performed', procedurePlanned: 'Procedure planned', followUpInstructions: 'Review instructions',
    procedureMetrics: { device: 'Laser', wavelengthNm: 1064, passes: 0, area: 'Face' }, customSections: [{ id: 'custom', title: 'Additional detail', content: 'Complete custom note' }], items: [item],
  }));
  const onClinicalDataChange = jest.fn();
  render(<PrescriptionBuilder patientId="synthetic" visitId={null} doctorId="doctor" reviewDate="2026-10-01" onClinicalDataChange={onClinicalDataChange} />);
  await waitFor(() => expect(onClinicalDataChange).toHaveBeenLastCalledWith(expect.objectContaining({
    complaints: [{ complaint: 'Complaint' }], diagnosis: [{ diagnosis: 'Primary diagnosis' }, { diagnosis: 'Psoriasis' }],
    history: { pastHistory: 'Past history', medicationHistory: 'Medication history', menstrualHistory: 'Menstrual history', triggers: 'Sun', priorTreatments: 'Prior treatment', familyHistory: { dm: true, others: 'Family note' } },
    vitals: { height: 160, weight: 60, systolicBP: 120, diastolicBP: 80, heartRate: 72 },
    examination: { generalAppearance: 'Examination', dermatology: { diagnoses: ['Psoriasis'], skinType: 'III', morphology: ['Papules'], distribution: ['Face'], acneSeverity: 'Mild', itchScore: 0, skinConcerns: ['Dryness'] } },
    treatmentPlan: { investigations: ['CBC'], procedurePlanned: 'Procedure planned', followUpInstructions: 'Review instructions', followUpDate: '2026-10-01', dermatology: { procedures: [{ type: 'Procedure performed' }], medicationPlan: [item] } },
    scribeJson: { procedureMetrics: { device: 'Laser', wavelengthNm: 1064, passes: 0, area: 'Face' }, customSections: [{ id: 'custom', title: 'Additional detail', content: 'Complete custom note' }] },
  })));
});

it('does not duplicate shortcut diagnoses when reopening a saved combined diagnosis', async () => {
  localStorage.setItem('rxDraft:synthetic:standalone', JSON.stringify({ diagnosis: 'Acne vulgaris, Psoriasis', exDermDx: ['Psoriasis'] }));
  const onClinicalDataChange = jest.fn();
  render(<PrescriptionBuilder patientId="synthetic" visitId={null} doctorId="doctor" onClinicalDataChange={onClinicalDataChange} />);
  await waitFor(() => expect(onClinicalDataChange).toHaveBeenLastCalledWith(expect.objectContaining({ diagnosis: [{ diagnosis: 'Acne vulgaris, Psoriasis' }] })));
});
