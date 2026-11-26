import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PharmacyInvoiceBuilderFixed } from './PharmacyInvoiceBuilderFixed';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    getPatients: jest.fn(),
    getUsers: jest.fn(),
    getPatient: jest.fn(),
    getPrescription: jest.fn(),
  },
}));

const api = apiClient as unknown as Record<'get' | 'getPatients' | 'getUsers' | 'getPrescription', jest.Mock>;

const acnosis = {
  id: 'acnosis',
  name: 'Acnosis',
  price: 0,
  stockPrice: 250,
  gstRate: 12,
  stockName: 'Tab. Acnosis',
  manufacturerName: 'Lakshmi Pharma',
  packSizeLabel: '10 tablets',
  totalStock: 20,
};

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  api.getPatients.mockResolvedValue({ data: [] });
  api.getUsers.mockResolvedValue({ users: [] });
});

describe('a stocked tablet shows its price on the bill', () => {
  it('in the medicine search and on the line it adds, though the catalogue price is 0', async () => {
    api.get.mockImplementation(async (url: string) => {
      if (url === '/drugs/autocomplete') return [acnosis];
      return { data: [], packages: [] };
    });
    render(<PharmacyInvoiceBuilderFixed canLinkInventory />);

    await userEvent.type(screen.getByLabelText('Search Drugs'), 'acnosis');
    const title = await screen.findByRole('heading', { name: 'Tab. Acnosis' });
    const row = title.closest('[role="button"]') as HTMLElement;
    expect(row).toHaveTextContent('₹250.00');

    await userEvent.click(within(row).getByRole('button', { name: 'Add' }));
    expect(await screen.findByLabelText('Unit price for Tab. Acnosis')).toHaveValue(250);
  });

  it('as the line total, with the 12% GST inside the stock price instead of added to it', async () => {
    api.get.mockImplementation(async (url: string) => {
      if (url === '/drugs/autocomplete') return [acnosis];
      return { data: [], packages: [] };
    });
    render(<PharmacyInvoiceBuilderFixed canLinkInventory />);

    await userEvent.type(screen.getByLabelText('Search Drugs'), 'acnosis');
    const row = (await screen.findByRole('heading', { name: 'Tab. Acnosis' })).closest('[role="button"]') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Add' }));

    expect(await screen.findByLabelText('Total for Tab. Acnosis')).toHaveTextContent('₹250.00');
    expect(screen.getByText('Total:').nextSibling).toHaveTextContent('₹250.00');
    expect(screen.getByText('Includes GST:').nextSibling).toHaveTextContent('₹26.79');
  });

  it('on a prescription line once its product is linked to stock', async () => {
    api.getPrescription.mockResolvedValue({
      id: 'rx-1',
      updatedAt: 'v1',
      items: [{ drugName: 'Acnosis tablet', dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS' }],
    });
    api.get.mockImplementation(async (url: string) => {
      if (url === '/pharmacy/prescription-queue/rx-1/stock-check')
        return {
          items: [{
            prescriptionVersion: 'v1', drugName: 'Acnosis tablet', inventoryItemId: 'batch-1', stockName: 'Tab. Acnosis',
            matchedDrug: { id: 'acnosis', name: 'Acnosis' }, stockStatus: 'IN_STOCK', totalNonExpiredStock: 20,
            billingQuantity: { quantity: 1, unit: 'strip', review: null },
          }],
        };
      if (url === '/drugs/acnosis') return acnosis;
      return { data: [], packages: [] };
    });
    render(<PharmacyInvoiceBuilderFixed canLinkInventory prefill={{ prescriptionId: 'rx-1' }} />);

    await waitFor(() => expect(screen.getByLabelText('Unit price for Tab. Acnosis')).toHaveValue(250));
  });
});
