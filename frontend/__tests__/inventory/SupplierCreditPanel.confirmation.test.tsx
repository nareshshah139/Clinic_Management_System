import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SupplierCreditPanel } from '@/components/inventory/SupplierCreditPanel';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));

const originalCredit = {
  id: 'credit-1', reference: 'Credit 1', supplierGstin: 'supplier-1', available: 0, amount: 120,
  allocations: [{ id: 'allocation-1', amount: 120, purchaseInvoiceId: 'bill-1', createdAt: '2026-01-01T00:00:00Z' }],
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(apiClient.get).mockResolvedValue({ credits: [originalCredit], invoices: [] });
});

it('cancels without reversing and submits the trimmed reason once', async () => {
  const user = userEvent.setup();
  let finish!: (value: unknown) => void;
  jest.mocked(apiClient.post).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<SupplierCreditPanel canWrite supplierGstin="supplier-1" />);
  await user.click(await screen.findByRole('button', { name: 'Reverse allocation' }));
  expect(screen.getByRole('button', { name: 'Reverse allocation' })).toBeDisabled();
  await user.type(screen.getByRole('textbox', { name: 'Reason for reversing allocation' }), '  Wrong bill  ');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(apiClient.post).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Reverse allocation' }));
  await user.type(screen.getByRole('textbox', { name: 'Reason for reversing allocation' }), '  Wrong bill  ');
  await user.dblClick(screen.getByRole('button', { name: 'Reverse allocation' }));
  expect(apiClient.post).toHaveBeenCalledTimes(1);
  expect(apiClient.post).toHaveBeenCalledWith('/inventory/workspace/credits/allocations/allocation-1/reverse', { reason: 'Wrong bill' });
  expect(screen.getByRole('button', { name: 'Reversing…' })).toBeDisabled();
  jest.mocked(apiClient.get).mockResolvedValue({ credits: [{ ...originalCredit, available: 120, allocations: [{ ...originalCredit.allocations[0], reversedAt: '2026-11-05T00:00:00Z' }] }], invoices: [] });
  await act(async () => { finish({}); });
  expect(await screen.findByRole('status')).toHaveTextContent('Credit allocation reversed.');
  expect(screen.getByRole('button', { name: /Credit 1/ })).toHaveTextContent('Available ₹120.00 of ₹120.00');
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Reverse allocation' })).not.toBeInTheDocument());
});

it('retains the entered reason after a failed reversal', async () => {
  const user = userEvent.setup();
  jest.mocked(apiClient.post).mockRejectedValue(new Error('Allocation changed. Reload and try again.'));
  render(<SupplierCreditPanel canWrite supplierGstin="supplier-1" />);
  await user.click(await screen.findByRole('button', { name: 'Reverse allocation' }));
  await user.type(screen.getByRole('textbox', { name: 'Reason for reversing allocation' }), 'Wrong bill');
  await user.click(screen.getByRole('button', { name: 'Reverse allocation' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Allocation changed. Reload and try again.');
  expect(screen.getByRole('textbox', { name: 'Reason for reversing allocation' })).toHaveValue('Wrong bill');
  expect(screen.getByRole('button', { name: 'Reverse allocation' })).toBeEnabled();
});
