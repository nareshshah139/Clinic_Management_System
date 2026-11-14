import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const storedHistory = { pastHistory: 'Eczema as a child', personalHistory: 'Night shifts', triggers: 'Heat and stress', priorTreatments: 'Clobetasol cream' };
beforeEach(() => { localStorage.clear(); jest.mocked(apiClient.get).mockReset().mockResolvedValue({}); });

it('offers Patient History without Triggers and Prior Treatments, ending with Personal history', async () => {
  render(<PrescriptionBuilder patientId="patient" visitId={null} doctorId="doctor" />);
  const section = (await screen.findByRole('textbox', { name: 'Past history' })).closest('.opacity-100')!;
  expect(screen.queryByText('Triggers')).not.toBeInTheDocument();
  expect(screen.queryByText('Prior Treatments')).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Heat, stress, cosmetics...')).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Topicals/systemics tried')).not.toBeInTheDocument();
  const boxes = within(section as HTMLElement).getAllByRole('textbox');
  expect(boxes).toHaveLength(5);
  expect(boxes.at(-1)).toBe(screen.getByRole('textbox', { name: 'Personal history' }));
});

it('keeps a visit\'s stored triggers and prior treatments out of the form and the save patch', async () => {
  jest.mocked(apiClient.get).mockImplementation(async url => url === '/visits/saved' ? { history: storedHistory } : {});
  const onClinicalDataChange = jest.fn();
  render(<PrescriptionBuilder patientId="patient" visitId="saved" doctorId="doctor" onClinicalDataChange={onClinicalDataChange} />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Past history' })).toHaveValue('Eczema as a child'));
  expect(screen.queryByDisplayValue('Heat and stress')).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue('Clobetasol cream')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Past history' }), { target: { value: 'Eczema and asthma' } });
  expect(onClinicalDataChange).toHaveBeenLastCalledWith(expect.objectContaining({ history: { pastHistory: 'Eczema and asthma', personalHistory: 'Night shifts' } }));
});

it('ignores triggers and prior treatments in a draft saved before they were removed', async () => {
  localStorage.setItem('rxDraft:patient:standalone', JSON.stringify({ pastHistory: 'Recovered', exTriggers: 'Sun', exPriorTx: 'Old cream' }));
  const onClinicalDataChange = jest.fn();
  render(<PrescriptionBuilder patientId="patient" visitId={null} doctorId="doctor" onClinicalDataChange={onClinicalDataChange} />);
  await waitFor(() => expect(onClinicalDataChange).toHaveBeenLastCalledWith(expect.objectContaining({ history: { pastHistory: 'Recovered' } })));
  expect(screen.queryByText(/Triggers:|Prior Tx:/)).not.toBeInTheDocument();
  await waitFor(() => expect(Object.keys(JSON.parse(localStorage.getItem('rxDraft:patient:standalone')!))).not.toEqual(expect.arrayContaining(['exTriggers'])));
});

it('does not copy triggers or prior treatments into a saved fields template', async () => {
  localStorage.setItem('rxDraft:patient:standalone', JSON.stringify({ exSkinType: 'III', exTriggers: 'Sun', exPriorTx: 'Old cream' }));
  const createPrescriptionTemplate = jest.fn().mockResolvedValue({});
  (apiClient as any).createPrescriptionTemplate = createPrescriptionTemplate;
  jest.mocked(apiClient.getPrescriptionTemplates).mockResolvedValue({ templates: [] } as any);
  render(<PrescriptionBuilder patientId="patient" visitId={null} doctorId="doctor" />);
  fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Save fields' }));
  fireEvent.change(screen.getByPlaceholderText('E.g., Derm Fields: Acne follow-up'), { target: { value: 'Acne fields' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Fields Template' }));
  await waitFor(() => expect(createPrescriptionTemplate).toHaveBeenCalledTimes(1));
  expect(createPrescriptionTemplate.mock.calls[0][0].metadata.examination.dermatology).toEqual({ skinType: 'III', morphology: [], distribution: [], skinConcerns: [] });
});

it('offers chief complaint suggestions under the field while it is focused, and not after it loses focus', async () => {
  jest.mocked(apiClient.autocompletePrescriptionField).mockImplementation((async ({ field }: { field: string }) => field === 'chiefComplaints' ? ['Acne on the face'] : []) as any);
  render(<PrescriptionBuilder patientId="patient" visitId={null} doctorId="doctor" />);
  await screen.findByRole('textbox', { name: 'Past history' });
  const complaints = document.querySelector('.complaint-autocomplete textarea') as HTMLTextAreaElement;
  expect(screen.queryByText('Acne on the face')).not.toBeInTheDocument();
  fireEvent.focus(complaints);
  const option = await screen.findByText('Acne on the face');
  expect(option.closest('.complaint-autocomplete')).not.toBeNull();
  fireEvent.click(option);
  expect(complaints).toHaveValue('Acne on the face');
  fireEvent.blur(complaints);
  expect(screen.queryByText('Acne on the face', { selector: 'div.cursor-pointer' })).not.toBeInTheDocument();
});
