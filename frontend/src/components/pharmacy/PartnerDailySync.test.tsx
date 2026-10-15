import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { PartnerDailySync } from './PartnerDailySync';
import { apiClient } from '@/lib/api';

const toast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/lib/api', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
let sale: any;
beforeEach(() => {
  jest.clearAllMocks();
  sale = {
    id: 'sale-1',
    version: 4,
    canReconcile: true,
    partnerOrganizationId: 'partner-1',
    partnerOrganizationName: 'Synthetic Partner',
    date: '2026-10-15',
    source: 'MANUAL',
    status: 'PARTIAL_STOCK_COMMITTED',
    lateEntry: false,
    hasDiscrepancy: true,
    stockCommittedAt: '2026-10-14T12:00:00Z',
    totalQuantity: 7,
    netAmount: 70,
    items: [
      {
        id: 'line-1',
        medicineName: 'Cream typo',
        batchNumber: 'B-1',
        quantitySold: 7,
        committedQuantity: 5,
        discrepancyReason: 'Choose the correct batch.',
      },
    ],
  };
  (apiClient.get as jest.Mock).mockImplementation(async (path: string) => {
    if (path.endsWith('today-summary')) return {};
    if (path.endsWith('/missing')) return { missingPartners: [] };
    if (path.endsWith('/recovery-matches'))
      return {
        matches: [
          {
            id: 'stock-2',
            name: 'Synthetic Cream',
            batchNumber: 'B-2',
            availableQuantity: 8,
            unit: 'unit',
          },
        ],
      };
    return { data: [JSON.parse(JSON.stringify(sale))] };
  });
});

it('enables a legacy partial retry and sends the current revision before showing completion', async () => {
  (apiClient.post as jest.Mock).mockImplementation(async () => {
    sale = {
      ...sale,
      version: 5,
      status: 'STOCK_COMMITTED',
      items: [{ ...sale.items[0], committedQuantity: 7 }],
    };
    return JSON.parse(JSON.stringify(sale));
  });
  render(<PartnerDailySync />);
  const retry = await screen.findByRole('button', {
    name: 'Retry outstanding',
  });
  expect(retry).toBeEnabled();
  fireEvent.click(retry);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Committed' })).toBeDisabled(),
  );
  expect(apiClient.post).toHaveBeenCalledWith(
    '/pharmacy/partner-sales/sale-1/commit-stock',
    { expectedVersion: 4 },
  );
});

it('corrects the lookup in place with an explicit batch and reason without committing stock', async () => {
  (apiClient.post as jest.Mock).mockImplementation(
    async (_path: string, body: any) => {
      sale = {
        ...sale,
        version: 5,
        items: [
          { ...sale.items[0], recoveryInventoryItemId: body.inventoryItemId },
        ],
      };
      return JSON.parse(JSON.stringify(sale));
    },
  );
  render(<PartnerDailySync />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Resolve outstanding' }),
  );
  expect(screen.getByText('5 committed · 2 outstanding')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Corrected product name or batch'), {
    target: { value: 'Synthetic Cream' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search batches' }));
  const select = await screen.findByLabelText(
    'Choose the actual product and batch',
  );
  fireEvent.change(select, { target: { value: 'stock-2' } });
  expect(screen.getByRole('button', { name: 'Save match' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Reason for correcting the match'), {
    target: { value: 'Corrected spelling and batch' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save match' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Match saved');
  expect(apiClient.post).toHaveBeenCalledTimes(1);
  expect(apiClient.post).toHaveBeenCalledWith(
    '/pharmacy/partner-sales/sale-1/items/line-1/reconcile',
    {
      expectedVersion: 4,
      inventoryItemId: 'stock-2',
      reason: 'Corrected spelling and batch',
    },
  );
  expect(
    screen.getByRole('button', { name: 'Retry outstanding' }),
  ).toBeEnabled();
  expect(sale.items[0]).toMatchObject({
    medicineName: 'Cream typo',
    quantitySold: 7,
    committedQuantity: 5,
  });
});

it('shows a useful empty-match fallback and preserves the submitted sale', async () => {
  (apiClient.get as jest.Mock).mockImplementation(async (path: string) =>
    path.endsWith('/recovery-matches')
      ? { matches: [] }
      : path === '/pharmacy/partner-sales'
        ? { data: [sale] }
        : {},
  );
  render(<PartnerDailySync />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Resolve outstanding' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Search batches' }));
  expect(
    await screen.findByText(/Add or correct the product in Inventory/),
  ).toHaveTextContent('The submitted sale stays saved');
  expect(apiClient.post).not.toHaveBeenCalled();
});

it('refreshes an uncertain commit and retains the newest revision for a deliberate retry', async () => {
  (apiClient.post as jest.Mock).mockImplementationOnce(async () => {
    sale = {
      ...sale,
      version: 5,
      items: [{ ...sale.items[0], committedQuantity: 6 }],
    };
    throw new Error('Network timeout');
  });
  render(<PartnerDailySync />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry outstanding' }),
  );
  expect(
    await screen.findByText(/The stock outcome was not confirmed/),
  ).toBeInTheDocument();
  (apiClient.post as jest.Mock).mockImplementationOnce(async () => {
    sale = {
      ...sale,
      version: 6,
      status: 'STOCK_COMMITTED',
      items: [{ ...sale.items[0], committedQuantity: 7 }],
    };
    return sale;
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry outstanding' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Committed' })).toBeDisabled(),
  );
  expect((apiClient.post as jest.Mock).mock.calls[1][1]).toEqual({
    expectedVersion: 5,
  });
});

it('hides staff correction controls from partner users', async () => {
  sale.canReconcile = false;
  render(<PartnerDailySync />);
  await screen.findByRole('button', { name: 'Retry outstanding' });
  expect(
    screen.queryByRole('button', { name: 'Resolve outstanding' }),
  ).not.toBeInTheDocument();
});

it('blocks stock retry while a correction is being saved', async () => {
  let finish: (value: any) => void = () => undefined;
  (apiClient.post as jest.Mock).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<PartnerDailySync />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Resolve outstanding' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Search batches' }));
  fireEvent.change(
    await screen.findByLabelText('Choose the actual product and batch'),
    { target: { value: 'stock-2' } },
  );
  fireEvent.change(screen.getByLabelText('Reason for correcting the match'), {
    target: { value: 'Confirmed actual batch' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save match' }));
  expect(
    screen.getByRole('button', { name: 'Retry outstanding' }),
  ).toBeDisabled();
  await act(async () => {
    sale = {
      ...sale,
      version: 5,
      items: [{ ...sale.items[0], recoveryInventoryItemId: 'stock-2' }],
    };
    finish(sale);
  });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Retry outstanding' }),
    ).toBeEnabled(),
  );
});

it.each(['empty items', 'wrong line', 'stale version'])(
  'retains the submission when the commit acknowledgement has %s and refresh fails',
  async (fault) => {
    (apiClient.post as jest.Mock).mockImplementation(async () => {
      const response = {
        ...sale,
        version: 5,
        status: 'STOCK_COMMITTED',
        items: [{ ...sale.items[0], committedQuantity: 7 }],
      };
      if (fault === 'empty items') response.items = [];
      if (fault === 'wrong line') response.items[0].id = 'another-line';
      if (fault === 'stale version') response.version = 3;
      (apiClient.get as jest.Mock).mockRejectedValue(
        new Error('Read refresh unavailable'),
      );
      return response;
    });
    render(<PartnerDailySync />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry outstanding' }),
    );
    expect(
      await screen.findByText(/The stock outcome was not confirmed/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry outstanding' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Committed' }),
    ).not.toBeInTheDocument();
    expect(toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'All sale quantities committed' }),
    );
  },
);

it('does not confirm a match when its response changes sold quantities and refresh fails', async () => {
  (apiClient.post as jest.Mock).mockImplementation(async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(
      new Error('Read refresh unavailable'),
    );
    return {
      ...sale,
      version: 5,
      items: [
        {
          ...sale.items[0],
          quantitySold: 999,
          recoveryInventoryItemId: 'stock-2',
        },
      ],
    };
  });
  render(<PartnerDailySync />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Resolve outstanding' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Search batches' }));
  fireEvent.change(
    await screen.findByLabelText('Choose the actual product and batch'),
    { target: { value: 'stock-2' } },
  );
  fireEvent.change(screen.getByLabelText('Reason for correcting the match'), {
    target: { value: 'Confirmed actual batch' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save match' }));
  expect(
    await screen.findByText(/The match was not confirmed/),
  ).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText('5 committed · 2 outstanding')).toBeInTheDocument();
});
