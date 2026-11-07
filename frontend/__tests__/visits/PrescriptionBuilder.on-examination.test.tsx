import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn().mockResolvedValue({}),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }),
  getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const PREF_KEY = 'cms.ui.onExamination.open.doctor';
const heading = () => screen.getByRole('button', { name: 'On Examination' });

beforeEach(() => { localStorage.clear(); jest.mocked(apiClient.get).mockReset().mockResolvedValue({}); });

it('starts collapsed, toggles with aria-expanded and keeps fields mounted', async () => {
  render(<PrescriptionBuilder patientId="patient" visitId={null} doctorId="doctor" />);
  expect(heading()).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByPlaceholderText('Detailed physical examination findings...')).not.toBeVisible();

  fireEvent.click(heading());
  expect(heading()).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByPlaceholderText('Detailed physical examination findings...')).toBeVisible();
});

it('keeps typed text when collapsed and reopened', () => {
  render(<PrescriptionBuilder patientId="patient" visitId={null} doctorId="doctor" />);
  fireEvent.click(heading());
  fireEvent.change(screen.getByPlaceholderText('Detailed physical examination findings...'), { target: { value: 'Erythematous papules' } });
  fireEvent.click(heading());
  expect(screen.getByText('filled')).toBeInTheDocument();
  fireEvent.click(heading());
  expect(screen.getByPlaceholderText('Detailed physical examination findings...')).toHaveValue('Erythematous papules');
});

it('remembers the last choice across remounts', () => {
  const first = render(<PrescriptionBuilder patientId="patient" visitId={null} doctorId="doctor" />);
  fireEvent.click(heading());
  expect(localStorage.getItem(PREF_KEY)).toBe('true');
  first.unmount();

  const second = render(<PrescriptionBuilder patientId="patient" visitId={null} doctorId="doctor" />);
  expect(heading()).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(heading());
  expect(localStorage.getItem(PREF_KEY)).toBe('false');
  second.unmount();

  render(<PrescriptionBuilder patientId="patient" visitId={null} doctorId="doctor" />);
  expect(heading()).toHaveAttribute('aria-expanded', 'false');
});

it('opens for a saved visit that has examination findings', async () => {
  jest.mocked(apiClient.get).mockImplementation(async url => url === '/visits/saved' ? { exam: { generalAppearance: 'Scaly plaques' } } : {});
  render(<PrescriptionBuilder patientId="patient" visitId="saved" doctorId="doctor" />);
  await waitFor(() => expect(heading()).toHaveAttribute('aria-expanded', 'true'));
  expect(screen.getByPlaceholderText('Detailed physical examination findings...')).toHaveValue('Scaly plaques');
  expect(localStorage.getItem(PREF_KEY)).toBeNull();
});
