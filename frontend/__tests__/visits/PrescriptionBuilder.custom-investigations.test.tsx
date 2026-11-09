import { act, fireEvent, render, screen } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn().mockResolvedValue({}),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }),
  getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]),
  getClinicInvestigations: jest.fn(),
  createClinicInvestigation: jest.fn(),
  renameClinicInvestigation: jest.fn(),
  deleteClinicInvestigation: jest.fn(),
} }));

const toast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const api = jest.mocked(apiClient);

beforeEach(() => {
  localStorage.clear();
  toast.mockClear();
  api.get.mockReset().mockResolvedValue({});
  api.getClinicInvestigations.mockReset().mockResolvedValue([]);
  api.createClinicInvestigation.mockReset();
  api.renameClinicInvestigation.mockReset();
  api.deleteClinicInvestigation.mockReset();
});

const renderBuilder = async () => {
  render(<PrescriptionBuilder patientId="patient" visitId={null} doctorId="doctor" />);
  await act(async () => {});
};

const typeAndAdd = async (name: string) => {
  fireEvent.change(screen.getByPlaceholderText('e.g., MRI Brain, CT Scan'), { target: { value: name } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add custom investigation' })); });
};

const checkbox = (name: string) => screen.queryByRole('checkbox', { name });

it('saves a typed investigation to the clinic list and ticks it for this prescription', async () => {
  api.createClinicInvestigation.mockResolvedValue({ id: '1', name: 'MRI Brain' });
  await renderBuilder();
  await typeAndAdd('MRI Brain');
  expect(api.createClinicInvestigation).toHaveBeenCalledWith({ name: 'MRI Brain' });
  expect(checkbox('MRI Brain')).toBeChecked();
  expect(screen.getByPlaceholderText('e.g., MRI Brain, CT Scan')).toHaveValue('');
});

it('shows a clinic-saved investigation as an unticked checkbox on a fresh prescription', async () => {
  api.getClinicInvestigations.mockResolvedValue([{ id: '1', name: 'MRI Brain' }]);
  await renderBuilder();
  expect(checkbox('MRI Brain')).not.toBeChecked();
  expect(checkbox('CBC')).not.toBeChecked();
});

it('rejects a duplicate of a saved investigation regardless of case', async () => {
  api.getClinicInvestigations.mockResolvedValue([{ id: '1', name: 'MRI Brain' }]);
  await renderBuilder();
  fireEvent.change(screen.getByPlaceholderText('e.g., MRI Brain, CT Scan'), { target: { value: '  mri   brain ' } });
  expect(screen.getByRole('button', { name: 'Add custom investigation' })).toBeDisabled();
  fireEvent.change(screen.getByPlaceholderText('e.g., MRI Brain, CT Scan'), { target: { value: 'cbc' } });
  expect(screen.getByRole('button', { name: 'Add custom investigation' })).toBeDisabled();
});

const rename = async (from: string, to: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Manage saved investigations' }));
  fireEvent.click(screen.getByRole('button', { name: `Rename ${from}` }));
  fireEvent.change(screen.getByRole('textbox', { name: `New name for ${from}` }), { target: { value: to } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: `Save new name for ${from}` })); });
};

it('renames a saved investigation without changing the text ticked on the open prescription', async () => {
  api.getClinicInvestigations.mockResolvedValue([{ id: '1', name: 'MRI Brain' }]);
  api.renameClinicInvestigation.mockResolvedValue({ id: '1', name: 'MRI Brain plain' });
  const onClinicalDataChange = jest.fn();
  render(<PrescriptionBuilder patientId="patient" visitId={null} doctorId="doctor" onClinicalDataChange={onClinicalDataChange} />);
  await act(async () => {});
  fireEvent.click(checkbox('MRI Brain')!);
  await rename('MRI Brain', 'MRI Brain plain');
  expect(api.renameClinicInvestigation).toHaveBeenCalledWith('1', 'MRI Brain plain');
  expect(checkbox('MRI Brain')).toBeChecked();
  expect(checkbox('MRI Brain plain')).not.toBeChecked();
  expect(onClinicalDataChange).toHaveBeenLastCalledWith(expect.objectContaining({ treatmentPlan: expect.objectContaining({ investigations: ['MRI Brain'] }) }));
});

it('replaces the checkbox when the renamed investigation is not ticked', async () => {
  api.getClinicInvestigations.mockResolvedValue([{ id: '1', name: 'MRI Brain' }]);
  api.renameClinicInvestigation.mockResolvedValue({ id: '1', name: 'MRI Brain plain' });
  await renderBuilder();
  await rename('MRI Brain', 'MRI Brain plain');
  expect(checkbox('MRI Brain')).toBeNull();
  expect(checkbox('MRI Brain plain')).not.toBeChecked();
});

it('tells the doctor when a rename collides with an existing investigation', async () => {
  api.getClinicInvestigations.mockResolvedValue([{ id: '1', name: 'MRI Brain' }]);
  api.renameClinicInvestigation.mockRejectedValue(Object.assign(new Error('Conflict'), { status: 409 }));
  await renderBuilder();
  fireEvent.click(screen.getByRole('button', { name: 'Manage saved investigations' }));
  fireEvent.click(screen.getByRole('button', { name: 'Rename MRI Brain' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'New name for MRI Brain' }), { target: { value: 'CT Brain' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save new name for MRI Brain' })); });
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'An investigation with that name already exists' }));
  expect(checkbox('MRI Brain')).not.toBeNull();
});

it('removes an unticked saved investigation from the checkbox list', async () => {
  api.getClinicInvestigations.mockResolvedValue([{ id: '1', name: 'MRI Brain' }]);
  api.deleteClinicInvestigation.mockResolvedValue({ id: '1' });
  await renderBuilder();
  fireEvent.click(screen.getByRole('button', { name: 'Manage saved investigations' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove MRI Brain' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm removing MRI Brain' })); });
  expect(api.deleteClinicInvestigation).toHaveBeenCalledWith('1');
  expect(checkbox('MRI Brain')).toBeNull();
});

it('keeps a removed investigation ticked for the current prescription', async () => {
  api.getClinicInvestigations.mockResolvedValue([{ id: '1', name: 'MRI Brain' }]);
  api.deleteClinicInvestigation.mockResolvedValue({ id: '1' });
  await renderBuilder();
  fireEvent.click(checkbox('MRI Brain')!);
  fireEvent.click(screen.getByRole('button', { name: 'Manage saved investigations' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove MRI Brain' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm removing MRI Brain' })); });
  expect(api.deleteClinicInvestigation).toHaveBeenCalledWith('1');
  expect(checkbox('MRI Brain')).toBeChecked();
});

it('still ticks the investigation for this prescription when saving to the clinic list fails', async () => {
  api.createClinicInvestigation.mockRejectedValue(new Error('offline'));
  await renderBuilder();
  await typeAndAdd('MRI Brain');
  expect(checkbox('MRI Brain')).toBeChecked();
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Not saved to clinic list' }));
  fireEvent.click(screen.getByRole('button', { name: 'Manage saved investigations' }));
  expect(screen.getByText('No investigations saved to the clinic list yet.')).toBeInTheDocument();
});

it('asks before removing and keeps the investigation when the doctor declines', async () => {
  api.getClinicInvestigations.mockResolvedValue([{ id: '1', name: 'MRI Brain' }]);
  await renderBuilder();
  fireEvent.click(screen.getByRole('button', { name: 'Manage saved investigations' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove MRI Brain' }));
  expect(screen.getByText('Remove MRI Brain for everyone in the clinic?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Keep MRI Brain' }));
  expect(api.deleteClinicInvestigation).not.toHaveBeenCalled();
  expect(checkbox('MRI Brain')).not.toBeNull();
});

it('lets the doctor retry saving after a failed save', async () => {
  api.createClinicInvestigation.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: '1', name: 'MRI Brain' });
  await renderBuilder();
  await typeAndAdd('MRI Brain');
  await typeAndAdd('MRI Brain');
  expect(api.createClinicInvestigation).toHaveBeenNthCalledWith(2, { name: 'MRI Brain' });
  expect(screen.getAllByRole('checkbox', { name: 'MRI Brain' })).toHaveLength(1);
  expect(checkbox('MRI Brain')).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Manage saved investigations' }));
  expect(screen.getByRole('button', { name: 'Rename MRI Brain' })).toBeInTheDocument();
});

it('saves an investigation carried over from an earlier draft to the clinic list', async () => {
  localStorage.setItem('rxDraft:patient:standalone', JSON.stringify({ investigations: ['MRI Brain'] }));
  api.createClinicInvestigation.mockResolvedValue({ id: '1', name: 'MRI Brain' });
  await renderBuilder();
  expect(checkbox('MRI Brain')).toBeChecked();
  await typeAndAdd('MRI Brain');
  expect(api.createClinicInvestigation).toHaveBeenCalledWith({ name: 'MRI Brain' });
});

it('keeps an investigation added before the clinic list finished loading', async () => {
  let resolveList!: (rows: { id: string; name: string }[]) => void;
  api.getClinicInvestigations.mockReturnValue(new Promise((resolve) => { resolveList = resolve; }));
  api.createClinicInvestigation.mockResolvedValue({ id: '2', name: 'CT Brain' });
  await renderBuilder();
  await typeAndAdd('CT Brain');
  await act(async () => { resolveList([{ id: '1', name: 'MRI Brain' }]); });
  expect(checkbox('MRI Brain')).not.toBeChecked();
  expect(checkbox('CT Brain')).toBeChecked();
});
