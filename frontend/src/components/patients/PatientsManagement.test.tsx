import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatientsManagement from './PatientsManagement';
import { apiClient } from '@/lib/api';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/api', () => ({ apiClient: { getPatients: jest.fn(), getUsers: jest.fn().mockResolvedValue({ users: [] }), getRooms: jest.fn().mockResolvedValue([]), createPatient: jest.fn() } }));

const PATIENTS = [
  { id: 'p-ananya', patientCode: 'ES93U', name: 'Ananya Reddy', gender: 'FEMALE', age: 28, phone: '9848010000', abhaId: '12345678901234', referralSource: 'Instagram', consultationType: 'OFFLINE', lastVisitAt: '2026-11-10T06:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'p-karthik', patientCode: null, name: 'Karthik N', gender: 'MALE', age: 30, phone: '9848010959', lastVisitAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
];

const rowOf = (name: string) => screen.getByRole('link', { name }).closest('tr') as HTMLElement;

describe('PatientsManagement table', () => {
  beforeEach(() => {
    push.mockReset();
    (apiClient.getPatients as jest.Mock).mockResolvedValue({ data: PATIENTS, meta: { page: 1, limit: 20, total: 2, totalPages: 1 } });
  });

  it('shows the desk columns and keeps ABHA, referral and consultation off the table', async () => {
    render(<PatientsManagement />);
    await screen.findByRole('link', { name: 'Ananya Reddy' });

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())).toEqual(['Patient ▲', 'Phone', 'Age · Sex', 'Last visit', 'Actions']);
    expect(within(rowOf('Ananya Reddy')).getAllByRole('cell').map((td) => td.textContent?.trim())).toEqual(['Ananya ReddyES93U', '9848010000', '28 · Female', '10 Nov 2026', 'Start Visit']);
    expect(within(rowOf('Karthik N')).getAllByRole('cell').map((td) => td.textContent?.trim())).toEqual(['Karthik NNo patient code', '9848010959', '30 · Male', 'No visits yet', 'Start Visit']);
    expect(screen.queryByText('12345678901234')).not.toBeInTheDocument();
    expect(screen.queryByText('Instagram')).not.toBeInTheDocument();
    expect(screen.queryByText(/^ID:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Patients' })).not.toBeInTheDocument();
  });

  it('renders Start Visit and a named actions menu in every row', async () => {
    render(<PatientsManagement />);
    await screen.findByRole('link', { name: 'Ananya Reddy' });

    for (const patient of PATIENTS) {
      const row = rowOf(patient.name);
      expect(within(row).getByRole('button', { name: 'Start Visit' })).toBeInTheDocument();
      expect(within(row).getByRole('button', { name: `More actions for ${patient.name}` })).toBeInTheDocument();
    }

    await userEvent.click(screen.getByRole('button', { name: 'More actions for Ananya Reddy' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent?.trim())).toEqual(['View', 'Edit', 'Book appointment', 'Copy code', 'WhatsApp reminder', 'Link portal', 'Archive']);
    expect(push).not.toHaveBeenCalled();
  });

  it('opens the patient from the name link or anywhere on the row, and Start Visit opens a visit', async () => {
    render(<PatientsManagement />);
    const link = await screen.findByRole('link', { name: 'Ananya Reddy' });
    expect(link).toHaveAttribute('href', '/dashboard/patients/p-ananya');

    fireEvent.click(within(rowOf('Ananya Reddy')).getByText('9848010000'));
    expect(push).toHaveBeenLastCalledWith('/dashboard/patients/p-ananya');

    push.mockReset();
    fireEvent.click(within(rowOf('Karthik N')).getByRole('button', { name: 'Start Visit' }));
    expect(push.mock.calls).toEqual([['/dashboard/visits?patientId=p-karthik&autoStart=true']]);
  });

  it('starts New Patient with no gender, marks required fields, and will not create until gender is chosen', async () => {
    render(<PatientsManagement />);
    await screen.findByRole('link', { name: 'Ananya Reddy' });

    await userEvent.click(screen.getByRole('button', { name: 'New Patient' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('combobox', { name: 'Gender' })).toHaveTextContent('Select gender');
    expect(['First Name', 'Phone'].map((label) => within(dialog).getByRole('textbox', { name: label }).hasAttribute('required'))).toEqual([true, true]);
    expect(within(dialog).getByText(/are required\./)).toHaveTextContent('Fields marked * are required.');

    await userEvent.type(within(dialog).getByRole('textbox', { name: 'First Name' }), 'Meera');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Phone' }), '9848012345');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    const gender = within(dialog).getByRole('combobox', { name: 'Gender' });
    expect(gender).toHaveAttribute('aria-invalid', 'true');
    expect(gender).toHaveAccessibleDescription("Choose the patient's gender.");
    expect(gender).toHaveFocus();
    expect(within(dialog).getByRole('textbox', { name: 'Phone' })).not.toHaveAttribute('aria-invalid');
    expect(apiClient.createPatient).not.toHaveBeenCalled();
  });
});
