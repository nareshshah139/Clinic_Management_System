import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatientQuickCreateDialog from './PatientQuickCreateDialog';

const createPatient = jest.fn();
const stableToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: stableToast }) }));
jest.mock('@/lib/api', () => ({
  apiClient: { createPatient: (...args: unknown[]) => createPatient(...args) },
}));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@/components/voice/VoiceFillButton', () => ({ VoiceFillButton: () => null }));

const renderDialog = (initialName?: string) =>
  render(<PatientQuickCreateDialog open onOpenChange={jest.fn()} initialName={initialName} onPatientCreated={jest.fn()} />);

describe('PatientQuickCreateDialog', () => {
  beforeEach(() => createPatient.mockReset());

  it('puts a searched phone number in Phone and leaves First Name empty', () => {
    renderDialog('9876543210');
    expect(screen.getByLabelText('First Name *')).toHaveValue('');
    expect(screen.getByLabelText('Phone *')).toHaveValue('9876543210');
  });

  it('still splits a searched name into first and last name', () => {
    renderDialog('Asha Rao');
    expect(screen.getByLabelText('First Name *')).toHaveValue('Asha');
    expect(screen.getByLabelText('Last Name')).toHaveValue('Rao');
  });

  it('refuses to create a patient until a gender is chosen', async () => {
    const user = userEvent.setup();
    renderDialog('Asha Rao — 9876543210');

    await user.click(screen.getByRole('button', { name: 'Create Patient' }));

    expect(await screen.findByText('Gender is required')).toBeInTheDocument();
    expect(createPatient).not.toHaveBeenCalled();
  });
});
