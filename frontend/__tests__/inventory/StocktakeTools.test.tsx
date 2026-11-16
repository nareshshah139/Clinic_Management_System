import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StocktakeTools } from '@/components/inventory/StocktakeTools';
import { apiClient } from '@/lib/api';
import { downloadCsv } from '@/components/inventory/workspace-model';
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock('@/components/inventory/workspace-model', () => ({ downloadCsv: jest.fn(), inputClass: '' }));

it('exports the complete template and opens the imported draft for review', async () => {
  const rows = [{ inventoryItemId: 'batch-1', physicalStock: '' }, { inventoryItemId: 'batch-2', physicalStock: '' }];
  (apiClient.get as jest.Mock).mockResolvedValue({ rows });
  (apiClient.post as jest.Mock).mockResolvedValue({ id: 'count-1', status: 'DRAFT' });
  const onOpen = jest.fn(); render(<StocktakeTools onOpen={onOpen} />);
  fireEvent.click(screen.getByRole('button', { name: 'Export stock-take CSV' }));
  await waitFor(() => expect(downloadCsv).toHaveBeenCalledWith('physical-stock-take.csv', rows));
  fireEvent.change(screen.getByLabelText('Completed CSV / Excel file'), { target: { files: [new File(['counts'], 'count.csv', { type: 'text/csv' })] } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Shelf count' } });
  fireEvent.click(screen.getByRole('button', { name: 'Import for review' }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith('COUNT', 'count-1'));
  const [url, data] = (apiClient.post as jest.Mock).mock.calls.at(-1);
  expect(url).toBe('/inventory/workspace/stocktake/import'); expect(data.get('reason')).toBe('Shelf count');
  expect(screen.queryByText('Stock reset')).not.toBeInTheDocument();
});
