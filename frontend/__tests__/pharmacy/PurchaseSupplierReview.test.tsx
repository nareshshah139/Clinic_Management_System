import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PurchaseSupplierReview } from '@/components/pharmacy/PurchaseSupplierReview';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
const api = apiClient as jest.Mocked<typeof apiClient>;
const supplier = { id: 'supplier-1', name: 'Apex Distributors', gstNumber: '36ABCDE1234F1Z5' };
const props = () => ({ name: supplier.name, gstNumber: supplier.gstNumber, canLoad: true, canSave: true,
  readOnly: false, disabled: false, onChange: jest.fn(), onSaved: jest.fn(), onBusy: jest.fn() });
const confirmation = () => screen.getByRole('checkbox', { name: /I checked the supplier/ });

beforeEach(() => { jest.clearAllMocks(); api.get.mockReset().mockResolvedValue([]); api.post.mockReset().mockResolvedValue(supplier); });

it('requires verification, prevents rapid duplicate saves and confirms that stock is unchanged', async () => {
  const callbacks = props();
  let finish!: (value: unknown) => void;
  api.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<PurchaseSupplierReview {...callbacks} />);
  await waitFor(() => expect(confirmation()).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Save verified supplier' })).toBeDisabled();
  fireEvent.click(confirmation());
  const save = screen.getByRole('button', { name: 'Save verified supplier' });
  fireEvent.click(save); fireEvent.click(save);
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Saving supplier…' })).toBeDisabled();
  await act(async () => finish(supplier));
  expect(screen.getByText(/Supplier saved. Stock has not changed/)).toBeVisible();
  expect(screen.getByLabelText('Saved supplier')).toHaveValue(supplier.id);
  expect(callbacks.onSaved).toHaveBeenCalledTimes(1);
  expect(callbacks.onBusy.mock.calls).toEqual([[true], [false]]);
});

it('invalidates verification after changing either identity field', async () => {
  const callbacks = props();
  const view = render(<PurchaseSupplierReview {...callbacks} />);
  await waitFor(() => expect(confirmation()).toBeEnabled());
  fireEvent.click(confirmation());
  view.rerender(<PurchaseSupplierReview {...callbacks} gstNumber="36ABCDE1234F2Z5" />);
  expect(confirmation()).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Save verified supplier' })).toBeDisabled();
  view.rerender(<PurchaseSupplierReview {...callbacks} gstNumber="bad" />);
  expect(confirmation()).toBeDisabled();
  expect(api.post).not.toHaveBeenCalled();
});

it('selects an existing supplier instead of creating a duplicate identity', async () => {
  api.get.mockResolvedValue([supplier]);
  const callbacks = props();
  render(<PurchaseSupplierReview {...callbacks} name="OCR spelling" />);
  await screen.findByText(/A saved supplier has this name or GSTIN/);
  fireEvent.change(screen.getByLabelText('Saved supplier'), { target: { value: supplier.id } });
  expect(callbacks.onChange).toHaveBeenCalledWith(supplier.name, supplier.gstNumber);
  expect(screen.queryByRole('button', { name: 'Save verified supplier' })).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

it('distinguishes list failure from an empty directory and supports retry', async () => {
  api.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([supplier]);
  render(<PurchaseSupplierReview {...props()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry supplier list' }));
  await screen.findByText(/Matching saved supplier found/);
  expect(screen.queryByText(/directory is empty/)).not.toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(2);
});

it('keeps supplier creation unavailable without permission and explains the manual route', async () => {
  render(<PurchaseSupplierReview {...props()} canSave={false} />);
  await screen.findByText(/directory is empty/);
  expect(screen.queryByRole('button', { name: 'Save verified supplier' })).not.toBeInTheDocument();
  expect(screen.getByText(/Your permissions allow invoice entry but not saving suppliers/)).toBeVisible();
  expect(screen.getByText(/continue without saving a supplier/)).toBeVisible();
});

it('keeps values and verification on a failed save so an idempotent retry is available', async () => {
  api.post.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValueOnce(supplier);
  render(<PurchaseSupplierReview {...props()} />);
  await waitFor(() => expect(confirmation()).toBeEnabled());
  fireEvent.click(confirmation()); fireEvent.click(screen.getByRole('button', { name: 'Save verified supplier' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
  expect(screen.getByLabelText('GSTIN')).toHaveValue(supplier.gstNumber);
  fireEvent.click(screen.getByRole('button', { name: 'Save verified supplier' }));
  await screen.findByText(/Supplier saved/);
  expect(api.post).toHaveBeenCalledTimes(2);
});

const savedWrong = { ...supplier, gstNumber: '36ABCDE1234F2Z5', updatedAt: '2026-10-01T10:00:00.000Z' };
async function startCorrection() {
  fireEvent.click(await screen.findByRole('button', { name: `Correct saved GSTIN ${savedWrong.gstNumber}` }));
}
function verifyCorrection() {
  fireEvent.change(screen.getByLabelText('Reason for correction'), { target: { value: 'Checked original invoice' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /I checked the new GSTIN/ }));
}

it('corrects a verified saved GSTIN once without changing invoice fields or stock', async () => {
  api.get.mockResolvedValue([savedWrong]);
  let finish!: (value: unknown) => void;
  api.patch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const callbacks = props();
  render(<PurchaseSupplierReview {...callbacks} canEdit />);
  await startCorrection();
  expect(screen.getByText(/Earlier invoices, payments and stock stay unchanged/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Update saved GSTIN' })).toBeDisabled();
  verifyCorrection();
  const save = screen.getByRole('button', { name: 'Update saved GSTIN' });
  fireEvent.click(save); fireEvent.click(save);
  expect(api.patch).toHaveBeenCalledTimes(1);
  expect(api.patch).toHaveBeenCalledWith('/pharmacy/purchase-invoices/suppliers/supplier-1/gstin', {
    gstNumber: supplier.gstNumber, expectedGstNumber: savedWrong.gstNumber, expectedUpdatedAt: savedWrong.updatedAt,
    reason: 'Checked original invoice', verified: true,
  });
  await act(async () => finish({ ...supplier, updatedAt: '2026-10-02T10:00:00.000Z' }));
  expect(screen.getByText(/Saved supplier GSTIN corrected/)).toBeVisible();
  expect(callbacks.onSaved).toHaveBeenCalledTimes(1);
  expect(callbacks.onBusy.mock.calls).toEqual([[true], [false]]);
  expect(callbacks.onChange).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
});

it('keeps correction unavailable without update permission', async () => {
  api.get.mockResolvedValue([savedWrong]);
  render(<PurchaseSupplierReview {...props()} />);
  await screen.findByText('Supplier GSTIN differs');
  expect(screen.getByText(/requires supplier-update permission/)).toBeVisible();
  expect(screen.queryByRole('button', { name: /Correct saved GSTIN/ })).not.toBeInTheDocument();
});

it('invalidates confirmation when the reason or invoice GSTIN changes', async () => {
  api.get.mockResolvedValue([savedWrong]);
  const callbacks = props();
  const view = render(<PurchaseSupplierReview {...callbacks} canEdit />);
  await startCorrection(); verifyCorrection();
  fireEvent.change(screen.getByLabelText('Reason for correction'), { target: { value: 'A different reason' } });
  expect(screen.getByRole('checkbox', { name: /I checked the new GSTIN/ })).not.toBeChecked();
  view.rerender(<PurchaseSupplierReview {...callbacks} canEdit gstNumber="36ABCDE1234F3Z5" />);
  expect(screen.queryByRole('button', { name: 'Update saved GSTIN' })).not.toBeInTheDocument();
  expect(api.patch).not.toHaveBeenCalled();
});

it('preserves invoice details on conflict and requires fresh verification after reloading suppliers', async () => {
  api.get.mockResolvedValue([savedWrong]);
  api.patch.mockRejectedValue(new Error('The saved supplier changed. Reload the supplier list and verify the correction again.'));
  const callbacks = props();
  render(<PurchaseSupplierReview {...callbacks} canEdit />);
  await startCorrection(); verifyCorrection();
  fireEvent.click(screen.getByRole('button', { name: 'Update saved GSTIN' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('saved supplier changed');
  expect(callbacks.onSaved).not.toHaveBeenCalled();
  expect(screen.getByLabelText('GSTIN')).toHaveValue(supplier.gstNumber);
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved suppliers' }));
  await startCorrection();
  expect(screen.getByRole('checkbox', { name: /I checked the new GSTIN/ })).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Update saved GSTIN' })).toBeDisabled();
});

it('does not accept an unconfirmed correction response', async () => {
  api.get.mockResolvedValue([savedWrong]); api.patch.mockResolvedValue(savedWrong);
  const callbacks = props();
  render(<PurchaseSupplierReview {...callbacks} canEdit />);
  await startCorrection(); verifyCorrection();
  fireEvent.click(screen.getByRole('button', { name: 'Update saved GSTIN' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('response could not be confirmed');
  expect(callbacks.onSaved).not.toHaveBeenCalled();
});
