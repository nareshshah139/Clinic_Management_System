import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ShelfIntelligence } from '@/components/inventory/ShelfIntelligence';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { getInventoryItems: jest.fn(), adjustStock: jest.fn() } }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
const items = ['a', 'b'].map(id => ({ id, name: `Stock ${id}`, currentStock: 10, minStockLevel: 0, costPrice: 1, sellingPrice: 2, mrp: 2, unit: 'PIECES', status: 'ACTIVE', type: 'MEDICINE' }));
let sequence = 0;
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(global.crypto, 'randomUUID', { configurable: true, value: () => `count-${++sequence}` });
  (apiClient.getInventoryItems as jest.Mock).mockResolvedValue(items);
});
const enter = async () => {
  render(<ShelfIntelligence />);
  fireEvent.change(await screen.findByLabelText('Physical count for Stock a'), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText('Physical count for Stock b'), { target: { value: '13' } });
  fireEvent.change(screen.getByPlaceholderText(/Reason required/), { target: { value: 'Verified shelf count' } });
  fireEvent.click(screen.getByRole('button', { name: 'Post corrections' }));
};
it('keeps the failed request identity and never resubmits acknowledged rows', async () => {
  let failed = false;
  (apiClient.adjustStock as jest.Mock).mockImplementation(async data => {
    if (data.itemId === 'b' && !failed) { failed = true; throw new Error('response lost'); }
    return { id: `movement-${data.itemId}`, ...data, quantityDelta: data.adjustmentQuantity };
  });
  await enter();
  const retry = await screen.findByRole('button', { name: 'Retry corrections' });
  await waitFor(() => expect(retry).not.toBeDisabled());
  expect(screen.getByLabelText('Physical count for Stock a')).toBeDisabled();
  const original = (apiClient.adjustStock as jest.Mock).mock.calls.find(([data]) => data.itemId === 'b')[0];
  fireEvent.click(retry);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Post corrections' })).toBeEnabled());
  const calls = (apiClient.adjustStock as jest.Mock).mock.calls.map(([data]) => data);
  expect(calls.filter(data => data.itemId === 'a')).toHaveLength(1);
  expect(calls.filter(data => data.itemId === 'b')).toEqual([original, original]);
  expect(screen.getByLabelText('Physical count for Stock a')).toHaveValue(null);
});
it('does not accept a malformed success acknowledgement', async () => {
  (apiClient.adjustStock as jest.Mock).mockResolvedValue({});
  await enter();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry corrections' })).toBeEnabled());
  const before = (apiClient.adjustStock as jest.Mock).mock.calls.map(([data]) => data);
  fireEvent.click(screen.getByRole('button', { name: 'Retry corrections' }));
  await waitFor(() => expect(apiClient.adjustStock).toHaveBeenCalledTimes(4));
  expect((apiClient.adjustStock as jest.Mock).mock.calls.slice(2).map(([data]) => data)).toEqual(before);
});
