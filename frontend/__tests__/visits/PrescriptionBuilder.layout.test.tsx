import { act, fireEvent, render, screen } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import { apiClient } from '@/lib/api';

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
async function tick(ms = 300) { await act(async () => { jest.advanceTimersByTime(ms); }); }

beforeEach(() => { jest.useFakeTimers(); localStorage.clear(); jest.clearAllMocks(); });
afterEach(() => jest.useRealTimers());

it('puts complaints and diagnosis before vitals, with templates in the complaints header', async () => {
  render(<PrescriptionBuilder patientId="layout-test" visitId={null} doctorId="doctor" />);
  await tick(1000);
  const sections = Array.from(document.querySelectorAll('[id^="section-"][id$="-heading"]')).map(el => el.id);
  expect(sections.slice(0, 3)).toEqual(['section-chief-complaints-heading', 'section-diagnosis-heading', 'section-clinical-heading']);
  const complaintsHeader = document.getElementById('section-chief-complaints-heading')!.closest('[data-slot="card-header"]') as HTMLElement;
  expect(complaintsHeader).toContainElement(screen.getByRole('button', { name: 'Templates' }));
});

it('shows diagnosis suggestions only while the diagnosis field has focus', async () => {
  jest.mocked(apiClient.autocompletePrescriptionField).mockResolvedValue(['Tinea cruris'] as any);
  render(<PrescriptionBuilder patientId="layout-test" visitId={null} doctorId="doctor" />);
  await tick(1000);
  expect(screen.queryByText('Tinea cruris')).toBeNull();
  const diagnosis = screen.getByRole('textbox', { name: 'Diagnosis' });
  fireEvent.focus(diagnosis);
  expect(screen.getByText('Tinea cruris')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Tinea cruris'));
  expect(diagnosis).toHaveValue('Tinea cruris');
  fireEvent.blur(diagnosis);
  await tick(1000);
  expect(screen.queryByText('Tinea cruris')).toBeNull();
});
