import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DistributorAnalytics } from '@/components/pharmacy/DistributorAnalytics';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  apiClient: {
    getPharmacyPurchaseDistributorAnalytics: jest.fn(),
  },
}));

const api = apiClient as jest.Mocked<typeof apiClient>;

const analyticsResponse = {
  totals: {
    invoiceCount: 2,
    lineCount: 3,
    taxableAmount: 2300,
    gstAmount: 276,
    lineTotal: 2576,
    purchasedQuantity: 30,
    freeQuantity: 3,
    totalQuantity: 33,
    freeQuantityRatioPercent: 9.09,
    effectiveUnitCost: 69.7,
    averageDiscountPercent: 8.4,
  },
  distributors: [
    {
      distributorName: 'Apex Distributors',
      distributorGstin: '36ABCDE1234F1Z5',
      invoiceCount: 2,
      lineCount: 3,
      taxableAmount: 2300,
      gstAmount: 276,
      lineTotal: 2576,
      purchasedQuantity: 30,
      freeQuantity: 3,
      totalQuantity: 33,
      freeQuantityRatioPercent: 9.09,
      effectiveUnitCost: 69.7,
      averageDiscountPercent: 8.4,
      lastInvoiceDate: '2026-05-01T00:00:00.000Z',
    },
  ],
  products: [
    {
      distributorName: 'Apex Distributors',
      distributorGstin: '36ABCDE1234F1Z5',
      productName: 'Azithral 500 Tablet',
      manufacturer: 'Alembic',
      packSize: 'Strip of 3',
      hsnCode: '3004',
      invoiceCount: 2,
      purchasedQuantity: 20,
      freeQuantity: 2,
      totalQuantity: 22,
      taxableAmount: 1100,
      gstAmount: 132,
      lineTotal: 1232,
      effectiveUnitCost: 50,
      averageDiscountPercent: 10,
      latestPurchaseRate: 55,
      latestDiscountPercent: 8,
      lastInvoiceDate: '2026-05-01T00:00:00.000Z',
    },
  ],
  discountDropAlerts: [
    {
      distributorName: 'Apex Distributors',
      distributorGstin: '36ABCDE1234F1Z5',
      productName: 'Azithral 500 Tablet',
      manufacturer: 'Alembic',
      packSize: 'Strip of 3',
      previousInvoiceNumber: 'APX-0009',
      latestInvoiceNumber: 'APX-0010',
      previousInvoiceDate: '2026-04-01T00:00:00.000Z',
      latestInvoiceDate: '2026-05-01T00:00:00.000Z',
      previousDiscountPercent: 15,
      latestDiscountPercent: 8,
      dropPercent: 7,
    },
  ],
};

describe('DistributorAnalytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getPharmacyPurchaseDistributorAnalytics.mockResolvedValue(analyticsResponse);
  });

  it('renders distributor totals, product effective cost, and discount-drop alerts', async () => {
    render(<DistributorAnalytics />);

    expect((await screen.findAllByText('Apex Distributors')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Azithral 500 Tablet').length).toBeGreaterThan(0);
    expect(screen.getByText('APX-0009 to APX-0010')).toBeInTheDocument();
    expect(screen.getByText('2 invoices')).toBeInTheDocument();
    expect(screen.getByText('9.09% of stock')).toBeInTheDocument();
  });

  it('sends filters when refreshed', async () => {
    const user = userEvent.setup();
    render(<DistributorAnalytics />);

    await screen.findAllByText('Apex Distributors');
    await user.clear(screen.getByLabelText('Product'));
    await user.type(screen.getByLabelText('Product'), 'Azithral');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() =>
      expect(api.getPharmacyPurchaseDistributorAnalytics).toHaveBeenLastCalledWith(
        expect.objectContaining({ productName: 'Azithral' }),
      ),
    );
  });

  it('shows a friendly empty state when the API returns no rows', async () => {
    api.getPharmacyPurchaseDistributorAnalytics.mockResolvedValueOnce({
      totals: {},
      distributors: [],
      products: [],
      discountDropAlerts: [],
    });

    render(<DistributorAnalytics />);

    expect(await screen.findByText('No reviewed purchase data found')).toBeInTheDocument();
    expect(screen.getByText('No product analytics available')).toBeInTheDocument();
    expect(screen.getByText('No discount-drop alerts')).toBeInTheDocument();
  });
});
