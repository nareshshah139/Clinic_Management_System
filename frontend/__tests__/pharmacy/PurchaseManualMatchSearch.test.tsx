import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PurchaseManualMatchSearch } from '@/components/pharmacy/PurchaseManualMatchSearch';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn() } }));
const get = apiClient.get as jest.Mock;
const product = { id: 'abzorb', name: 'Abzorb 1% Cream', manufacturerName: 'Sun Pharma', packSizeLabel: '15 gm', price: 429 };

describe('PurchaseManualMatchSearch', () => {
  beforeEach(() => get.mockReset());

  it('discards a late result after clearing the search and never selects it', async () => {
    let resolve!: (value: unknown) => void;
    get.mockReturnValue(new Promise(done => { resolve = done; }));
    const onSelect = jest.fn();
    render(<PurchaseManualMatchSearch lineNumber={1} disabled={false} onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText('Search saved products manually'), { target: { value: 'Abzorb' } });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Search saved products manually'), { target: { value: '' } });
    await act(async () => resolve([product]));
    expect(screen.queryByRole('button', { name: 'Match Abzorb 1% Cream' })).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows search failure instead of asserting there is no matching product', async () => {
    get.mockRejectedValue(new Error('unavailable'));
    render(<PurchaseManualMatchSearch lineNumber={1} disabled={false} onSelect={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Search saved products manually'), { target: { value: 'Abzorb' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not search saved products');
    expect(screen.queryByText('No saved products found.')).not.toBeInTheDocument();
  });
});
