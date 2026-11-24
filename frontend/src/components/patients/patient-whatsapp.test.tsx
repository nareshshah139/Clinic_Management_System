import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientWhatsAppCard } from './patient-whatsapp';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  apiClient: { recordWhatsAppConsent: jest.fn(), confirmWhatsAppNumber: jest.fn(), setPatientPortalEnabled: jest.fn(), updatePatient: jest.fn() },
}));

const profile = { phoneE164: '+919876543210', consentState: 'NOT_ASKED' as const, preferredLanguage: 'EN' as const, portalEnabled: true };

describe('PatientWhatsAppCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('PP-01: prompts staff to fix a phone number WhatsApp cannot use and blocks agreement', () => {
    render(<PatientWhatsAppCard patientId="p1" phone="12345" profile={{ ...profile, phoneE164: null }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('"12345" cannot be used for WhatsApp');
    expect(screen.getByRole('button', { name: 'Patient agreed to WhatsApp' })).toBeDisabled();
  });

  it('PP-04: recording agreement shows the number is waiting to confirm', async () => {
    (apiClient.recordWhatsAppConsent as jest.Mock).mockResolvedValue({ ...profile, consentState: 'PENDING' });
    render(<PatientWhatsAppCard patientId="p1" profile={profile} />);
    expect(screen.getByTestId('whatsapp-consent-state')).toHaveTextContent('Not asked');
    await userEvent.click(screen.getByRole('button', { name: 'Patient agreed to WhatsApp' }));
    expect(apiClient.recordWhatsAppConsent).toHaveBeenCalledWith('p1', 'agreed');
    expect(await screen.findByText('Waiting for the number to confirm')).toBeInTheDocument();
  });

  it('PP-04: reception types the code from the confirmation message and the patient becomes agreed and confirmed', async () => {
    (apiClient.confirmWhatsAppNumber as jest.Mock).mockResolvedValue({ ...profile, consentState: 'OPTED_IN' });
    render(<PatientWhatsAppCard patientId="p1" profile={{ ...profile, consentState: 'PENDING' }} />);
    const confirm = screen.getByRole('button', { name: 'Confirm number' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Code from the clinic/), '12a3456');
    expect(screen.getByLabelText(/Code from the clinic/)).toHaveValue('123456');
    await userEvent.click(confirm);
    expect(apiClient.confirmWhatsAppNumber).toHaveBeenCalledWith('p1', '123456');
    expect(await screen.findByText('Agreed and confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm number' })).not.toBeInTheDocument();
  });

  it('PP-04: a wrong code shows the server message and keeps waiting', async () => {
    (apiClient.confirmWhatsAppNumber as jest.Mock).mockRejectedValue(new Error('That code does not match. Check the latest WhatsApp message from the clinic.'));
    render(<PatientWhatsAppCard patientId="p1" profile={{ ...profile, consentState: 'PENDING' }} />);
    await userEvent.type(screen.getByLabelText(/Code from the clinic/), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm number' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code does not match');
    expect(screen.getByTestId('whatsapp-consent-state')).toHaveTextContent('Waiting for the number to confirm');
  });

  it('PP-05: changing the language saves it on the patient', async () => {
    (apiClient.updatePatient as jest.Mock).mockResolvedValue({});
    render(<PatientWhatsAppCard patientId="p1" profile={profile} />);
    await userEvent.selectOptions(screen.getByLabelText('Preferred language:'), 'TE');
    expect(apiClient.updatePatient).toHaveBeenCalledWith('p1', { preferredLanguage: 'TE' });
    await waitFor(() => expect(screen.getByLabelText('Preferred language:')).toHaveValue('TE'));
  });

  it('PP-09: staff can turn the portal off for one patient', async () => {
    (apiClient.setPatientPortalEnabled as jest.Mock).mockResolvedValue({ ...profile, portalEnabled: false });
    render(<PatientWhatsAppCard patientId="p1" profile={profile} />);
    await userEvent.click(screen.getByRole('button', { name: 'Turn off for this patient' }));
    expect(apiClient.setPatientPortalEnabled).toHaveBeenCalledWith('p1', false);
    expect(await screen.findByTestId('portal-enabled-state')).toHaveTextContent('Off');
  });
});
