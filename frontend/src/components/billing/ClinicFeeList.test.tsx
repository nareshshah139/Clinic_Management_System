import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ClinicFeeList } from './ClinicFeeList';
import FeesPage from '@/app/dashboard/fees/page';
import { apiClient } from '@/lib/api';

const toast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/lib/api', () => ({ apiClient: { getClinicFees: jest.fn(), setClinicFee: jest.fn() } }));
let role = 'ADMIN';
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { role }, loading: false }) }));

const api = apiClient as unknown as Record<string, jest.Mock>;
const AT = '2026-11-11T08:32:00.000Z';
const fee = (billType: string, label: string, amount: number | null, version: number, updatedBy: string | null = null) =>
  ({ billType, label, amount, version, updatedAt: version ? AT : null, updatedBy });
const LIST = [
  fee('FIRST_CONSULTATION', 'First consultation', null, 0),
  fee('REVIEW', 'Review', 500, 2, 'Meera Kulkarni'),
  fee('PROCEDURE', 'Procedure', null, 1, 'Meera Kulkarni'),
];

const rowOf = (label: string) => screen.getByRole('form', { name: label });
const box = (label: string) => within(rowOf(label)).getByRole('textbox', { name: `${label} fee in rupees` });
const status = (label: string) => within(rowOf(label)).getByTestId('fee-status').textContent;

describe('ClinicFeeList', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    role = 'ADMIN';
    api.getClinicFees.mockResolvedValue({ fees: LIST });
  });

  it('lists every bill type with its fee, or none, and who changed it when', async () => {
    render(<ClinicFeeList />);
    await screen.findByRole('form', { name: 'Review' });
    expect(['First consultation', 'Review', 'Procedure'].map((label) => [(box(label) as HTMLInputElement).value, status(label)])).toEqual([
      ['', 'No fee set yet'],
      ['500', '₹500 · changed 11 Nov 2026, 02:02 pm by Meera Kulkarni'],
      ['', 'No fee · cleared 11 Nov 2026, 02:02 pm by Meera Kulkarni'],
    ]);
    expect(within(rowOf('Review')).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves one fee at a time against its version and shows the saved fee', async () => {
    api.setClinicFee.mockResolvedValue(fee('FIRST_CONSULTATION', 'First consultation', 1280, 1, 'Meera Kulkarni'));
    render(<ClinicFeeList />);
    await screen.findByRole('form', { name: 'First consultation' });
    fireEvent.change(box('First consultation'), { target: { value: '1,280' } });
    fireEvent.submit(rowOf('First consultation'));
    await waitFor(() => expect(status('First consultation')).toBe('₹1,280 · changed 11 Nov 2026, 02:02 pm by Meera Kulkarni'));
    expect(api.setClinicFee.mock.calls).toEqual([['FIRST_CONSULTATION', 1280, 0]]);
    expect(box('First consultation')).toHaveValue('1280');
    expect(toast).toHaveBeenCalledWith({ variant: 'success', title: 'First consultation fee saved: ₹1,280' });
  });

  it('refuses an amount that is not a fee before calling the server', async () => {
    render(<ClinicFeeList />);
    await screen.findByRole('form', { name: 'Review' });
    for (const value of ['0', 'abc', '12.345', '1000001']) {
      fireEvent.change(box('Review'), { target: { value } });
      expect([value, within(rowOf('Review')).getByRole('button', { name: 'Save' }).hasAttribute('disabled'), within(rowOf('Review')).getByText(/^Enter an amount/).textContent])
        .toEqual([value, true, 'Enter an amount above 0 and up to ₹10,00,000, for example 500.']);
    }
    expect(api.setClinicFee.mock.calls).toEqual([]);
  });

  it('clears a fee when its box is emptied', async () => {
    api.setClinicFee.mockResolvedValue(fee('REVIEW', 'Review', null, 3, 'Meera Kulkarni'));
    render(<ClinicFeeList />);
    await screen.findByRole('form', { name: 'Review' });
    fireEvent.change(box('Review'), { target: { value: '' } });
    fireEvent.click(within(rowOf('Review')).getByRole('button', { name: 'Clear fee' }));
    await waitFor(() => expect(status('Review')).toBe('No fee · cleared 11 Nov 2026, 02:02 pm by Meera Kulkarni'));
    expect(api.setClinicFee.mock.calls).toEqual([['REVIEW', null, 2]]);
    expect(toast).toHaveBeenCalledWith({ variant: 'success', title: 'Review fee cleared' });
  });

  it('says who changed the fee first, shows their fee, keeps what was typed, and saves it on the next try', async () => {
    api.setClinicFee.mockRejectedValueOnce({ status: 409, body: { message: 'Asha Jain set the Review fee to ₹600 while you were editing. Check it and save again.' } });
    render(<ClinicFeeList />);
    await screen.findByRole('form', { name: 'Review' });
    api.getClinicFees.mockResolvedValue({ fees: [LIST[0], fee('REVIEW', 'Review', 600, 3, 'Asha Jain'), LIST[2]] });
    fireEvent.change(box('Review'), { target: { value: '700' } });
    fireEvent.click(within(rowOf('Review')).getByRole('button', { name: 'Save' }));
    expect(await within(rowOf('Review')).findByRole('alert')).toHaveTextContent(
      'Asha Jain set the Review fee to ₹600 while you were editing. Check it and save again. Your ₹700 is still in the box.',
    );
    expect([status('Review'), (box('Review') as HTMLInputElement).value]).toEqual(['₹600 · changed 11 Nov 2026, 02:02 pm by Asha Jain', '700']);

    api.setClinicFee.mockResolvedValueOnce(fee('REVIEW', 'Review', 700, 4, 'Meera Kulkarni'));
    fireEvent.click(within(rowOf('Review')).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(status('Review')).toBe('₹700 · changed 11 Nov 2026, 02:02 pm by Meera Kulkarni'));
    expect(api.setClinicFee.mock.calls).toEqual([['REVIEW', 700, 2], ['REVIEW', 700, 3]]);
    expect(within(rowOf('Review')).queryByRole('alert')).toBeNull();
  });

  it('offers a retry when the list cannot load', async () => {
    api.getClinicFees.mockRejectedValueOnce({ status: 500, body: { message: 'Internal server error' } });
    render(<ClinicFeeList />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the fee list: Internal server error');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('form', { name: 'Procedure' })).toBeInTheDocument();
  });
});

describe('Fee list page', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    api.getClinicFees.mockResolvedValue({ fees: LIST });
  });

  it('shows the list to an admin and an owner', async () => {
    for (const who of ['ADMIN', 'OWNER']) {
      role = who;
      const { unmount } = render(<FeesPage />);
      expect([who, (await screen.findAllByRole('form')).map((f) => f.getAttribute('aria-labelledby') && within(f).getByRole('heading').textContent)])
        .toEqual([who, ['First consultation', 'Review', 'Procedure']]);
      unmount();
    }
  });

  it.each(['DOCTOR', 'RECEPTION', 'NURSE', 'PHARMACIST'])('tells %s only an admin can change it, without asking the server', (who) => {
    role = who;
    render(<FeesPage />);
    expect([screen.getByRole('heading', { level: 1 }).textContent, screen.getByText(/^Only an admin/).textContent, screen.queryAllByRole('form').length])
      .toEqual(['Fee list', 'Only an admin can change the fee list.', 0]);
    expect(api.getClinicFees.mock.calls).toEqual([]);
  });
});
