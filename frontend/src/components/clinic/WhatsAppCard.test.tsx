import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { WhatsAppCard } from './WhatsAppCard';
import ClinicProfilePage from '@/app/dashboard/clinic/page';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  apiClient: {
    getWhatsAppConnection: jest.fn(),
    linkWhatsApp: jest.fn(),
    getWhatsAppDocumentTemplates: jest.fn(),
    setWhatsAppPrescriptionTemplate: jest.fn(),
    sendWhatsAppTestPrescription: jest.fn(),
    unlinkWhatsApp: jest.fn(),
    getWhatsAppMessages: jest.fn(),
    getBranch: jest.fn(),
  },
}));
let role = 'ADMIN';
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { role, branchId: 'branch-1' }, loading: false }) }));

const api = apiClient as unknown as Record<string, jest.Mock>;
const card = () => screen.getByRole('region', { name: 'WhatsApp' });
const LINKED = {
  linked: true,
  phoneNumberId: '1234567890',
  businessAccountId: '998877',
  displayPhoneNumber: '+91 20 2555 0199',
  verifiedName: 'Lakshmi Family Clinic',
  qualityRating: 'GREEN',
  prescriptionTemplate: null,
  verifiedAt: '2026-11-14T06:30:00.000Z',
  linkedBy: { id: 'admin-1', name: 'Meera Kulkarni' },
};
const TEMPLATES = [
  { name: 'prescription_ready', language: 'en', bodyParams: 2 },
  { name: 'long_rx', language: 'en_US', bodyParams: 4 },
];

describe('WhatsAppCard', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    api.getWhatsAppMessages.mockResolvedValue([]);
    api.getWhatsAppDocumentTemplates.mockResolvedValue(TEMPLATES);
  });

  it('starts loading, then offers the link form with what happens until the clinic links', async () => {
    let answer!: (value: unknown) => void;
    api.getWhatsAppConnection.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(<WhatsAppCard />);
    expect(within(card()).getByText('Loading WhatsApp…')).toBeInTheDocument();
    answer({ linked: false, fallback: 'SERVER_ENV' });
    const form = await screen.findByRole('form', { name: 'Link WhatsApp' });
    expect([
      within(card()).getByText('Not linked').textContent,
      within(form).getByText(/^Not linked\./).textContent,
      within(form).getByLabelText('Access token').getAttribute('type'),
      within(form).getByRole('button', { name: 'Link WhatsApp' }).hasAttribute('disabled'),
    ]).toEqual(['Not linked', 'Not linked. Until you link the clinic number, WhatsApp messages go out from the server’s shared number.', 'password', true]);
    expect(within(card()).getAllByRole('listitem').at(-2)?.textContent).toContain('whatsapp_business_messaging and whatsapp_business_management');
  });

  it('links with trimmed details and shows the verified number', async () => {
    api.getWhatsAppConnection.mockResolvedValue({ linked: false, fallback: null });
    api.linkWhatsApp.mockResolvedValue(LINKED);
    render(<WhatsAppCard />);
    const form = await screen.findByRole('form', { name: 'Link WhatsApp' });
    fireEvent.change(within(form).getByLabelText('Phone number ID'), { target: { value: ' 1234567890 ' } });
    fireEvent.change(within(form).getByLabelText('WhatsApp Business Account ID (optional)'), { target: { value: '998877' } });
    fireEvent.change(within(form).getByLabelText('Access token'), { target: { value: ' EAAG-token ' } });
    fireEvent.submit(form);
    expect((await screen.findByTestId('whatsapp-verified-name')).textContent).toBe('Lakshmi Family Clinic');
    expect(api.linkWhatsApp.mock.calls).toEqual([[{ phoneNumberId: '1234567890', accessToken: 'EAAG-token', businessAccountId: '998877' }]]);
    expect([within(card()).getByText('+91 20 2555 0199').textContent, within(card()).getByText('High quality').textContent, within(card()).getByText(/^Linked 14/).textContent])
      .toEqual(['+91 20 2555 0199', 'High quality', 'Linked 14 Nov 2026 by Meera Kulkarni']);
  });

  it('keeps the form and shows WhatsApp’s reason when linking is refused', async () => {
    api.getWhatsAppConnection.mockResolvedValue({ linked: false, fallback: null });
    api.linkWhatsApp.mockRejectedValue({ body: { message: 'WhatsApp did not accept these details. The WhatsApp access token is invalid or has expired.' } });
    render(<WhatsAppCard />);
    const form = await screen.findByRole('form', { name: 'Link WhatsApp' });
    fireEvent.change(within(form).getByLabelText('Phone number ID'), { target: { value: '1' } });
    fireEvent.change(within(form).getByLabelText('Access token'), { target: { value: 'stale' } });
    fireEvent.submit(form);
    expect((await within(form).findByRole('alert')).textContent).toBe('WhatsApp did not accept these details. The WhatsApp access token is invalid or has expired.');
    expect(screen.getByRole('form', { name: 'Link WhatsApp' })).toBeInTheDocument();
  });

  it('chooses a template Meta approved and refuses one that needs more values than a prescription fills', async () => {
    api.getWhatsAppConnection.mockResolvedValue(LINKED);
    api.setWhatsAppPrescriptionTemplate.mockResolvedValue({ ...LINKED, prescriptionTemplate: TEMPLATES[0] });
    render(<WhatsAppCard />);
    const select = (await screen.findByRole('combobox', { name: 'Prescription template' })) as HTMLSelectElement;
    await waitFor(() => expect(select.options).toHaveLength(3));
    expect([...select.options].map((o) => [o.textContent, o.disabled])).toEqual([
      ['No template: plain document, 24-hour window only', false],
      ['prescription_ready (en)', false],
      ['long_rx (en_US) needs 4 values, at most 3 are filled', true],
    ]);
    fireEvent.change(select, { target: { value: 'prescription_ready|en' } });
    expect((await screen.findByText(/^Prescriptions are sent with/)).textContent).toBe('Prescriptions are sent with prescription_ready (en).');
    expect(api.setWhatsAppPrescriptionTemplate.mock.calls).toEqual([[{ name: 'prescription_ready', language: 'en' }]]);
  });

  it('shows the message id when WhatsApp accepts a test, and the reason when it does not', async () => {
    api.getWhatsAppConnection.mockResolvedValue(LINKED);
    api.sendWhatsAppTestPrescription
      .mockResolvedValueOnce({ status: 'ACCEPTED', wamid: 'wamid.HBgM', source: 'CLINIC' })
      .mockResolvedValueOnce({ status: 'FAILED', code: 131030, reason: 'This number is not in the allowed list of the Meta test number.' });
    api.getWhatsAppMessages.mockResolvedValueOnce([]).mockResolvedValue([
      { id: 'm1', wamid: 'wamid.HBgM', toPhone: '919704802443', kind: 'TEST_PRESCRIPTION', prescriptionId: null, status: 'DELIVERED', errorCode: null, errorTitle: null, createdAt: '2026-11-14T06:31:00.000Z', updatedAt: '2026-11-14T06:31:05.000Z' },
      { id: 'm0', wamid: 'wamid.OLD', toPhone: '919000000001', kind: 'PRESCRIPTION', prescriptionId: 'rx', status: 'FAILED', errorCode: 131026, errorTitle: 'Message undeliverable', createdAt: '2026-11-13T06:31:00.000Z', updatedAt: '2026-11-13T06:31:00.000Z' },
    ]);
    render(<WhatsAppCard />);
    const number = await screen.findByLabelText('WhatsApp number');
    fireEvent.change(number, { target: { value: '+91 9704802443' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send test prescription' }));
    expect((await screen.findByRole('status')).textContent).toBe('WhatsApp accepted the message. Message ID wamid.HBgM.');
    await waitFor(() => expect(screen.getAllByTestId('whatsapp-message')).toHaveLength(2));
    expect(screen.getAllByTestId('whatsapp-message').map((row) => row.textContent)).toEqual([
      'Test prescription to +91970480244314 Nov 2026, 12:01 pmDelivered',
      'Prescription to +91900000000113 Nov 2026, 12:01 pm · Message undeliverable (131026)Failed',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Send test prescription' }));
    expect((await screen.findByTestId('test-send-result')).getAttribute('role')).toBe('alert');
    expect(screen.getByTestId('test-send-result').textContent).toBe('This number is not in the allowed list of the Meta test number.');
    expect(api.sendWhatsAppTestPrescription.mock.calls).toEqual([['+91 9704802443'], ['+91 9704802443']]);
  });

  it('unlinks only after the in-app confirmation', async () => {
    api.getWhatsAppConnection.mockResolvedValue(LINKED);
    api.unlinkWhatsApp.mockResolvedValue({ linked: false, fallback: null });
    render(<WhatsAppCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Unlink' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Unlink WhatsApp?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(api.unlinkWhatsApp.mock.calls).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Unlink' }));
    expect(await screen.findByRole('form', { name: 'Link WhatsApp' })).toBeInTheDocument();
    expect(api.unlinkWhatsApp.mock.calls).toEqual([[]]);
  });

  it('reports a load failure and recovers on retry', async () => {
    api.getWhatsAppConnection.mockRejectedValueOnce({ body: { message: 'Internal server error' } }).mockResolvedValue({ linked: false, fallback: null });
    render(<WhatsAppCard />);
    expect((await within(card()).findByRole('alert')).textContent).toBe('Could not load WhatsApp: Internal server errorRetry');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('form', { name: 'Link WhatsApp' })).toBeInTheDocument();
  });
});

describe('Clinic profile page', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    api.getWhatsAppConnection.mockResolvedValue({ linked: false, fallback: null });
    api.getBranch.mockResolvedValue({ id: 'branch-1', name: 'Lakshmi Family Clinic', address: '12 MG Road', city: 'Pune', pincode: '411001', phone: '+91 20 2555 0101' });
  });

  it('shows the branch details and the WhatsApp card to an owner or admin', async () => {
    role = 'OWNER';
    render(<ClinicProfilePage />);
    const details = await screen.findByRole('region', { name: 'Clinic details' });
    await waitFor(() => expect(within(details).getByText('Lakshmi Family Clinic')).toBeInTheDocument());
    expect([...details.querySelectorAll('dd')].map((d) => d.textContent)).toEqual(['Lakshmi Family Clinic', '12 MG Road, Pune, 411001', '+91 20 2555 0101']);
    expect(api.getBranch.mock.calls).toEqual([['branch-1']]);
    expect(await screen.findByRole('form', { name: 'Link WhatsApp' })).toBeInTheDocument();
  });

  it.each(['DOCTOR', 'RECEPTION'])('tells %s to ask an admin, without loading WhatsApp', (who) => {
    role = who;
    render(<ClinicProfilePage />);
    expect(screen.getByText('Only an owner or admin can change the clinic profile.')).toBeInTheDocument();
    expect(api.getWhatsAppConnection.mock.calls).toEqual([]);
  });
});
