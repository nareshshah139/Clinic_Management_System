import { render, screen } from '@testing-library/react';
import { WorkspaceStock } from '@/components/inventory/WorkspaceStock';
import { apiClient } from '@/lib/api';
import roleCapabilities from '../fixtures/workspace-capabilities.json';

let mockRole = 'DOCTOR';
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'u', branchId: 'clinic', role: mockRole } }) }));
jest.mock('@/components/inventory/AddInventoryItemDialog', () => ({ AddInventoryItemDialog: () => null }));

const row = { id: 'stock', name: 'Max Rich Yu Cream', batchNumber: 'B1', expiryDate: '2028-05-31T23:59:59.999Z', currentStock: 17, heldStock: 0, available: 17, unit: 'PACKS', costPrice: 10, sellingPrice: 20, mrp: 20, status: 'ACTIVE' };

it.each([
  ['PHARMACIST', ['Edit price', 'Edit stock']],
  ['DOCTOR', ['Edit price', 'Edit stock']],
  ['ADMIN', ['Edit price', 'Edit stock']],
  ['RECEPTION', []],
] as const)('offers %s price and stock edit submission on each batch', async (role, offered) => {
  mockRole = role;
  (apiClient.get as jest.Mock).mockResolvedValue({ rows: [row], total: 1, page: 1, totalPages: 1, facets: {}, quality: {} });
  render(<WorkspaceStock query={{}} navigate={jest.fn()} capabilities={roleCapabilities[role]} onTask={jest.fn()} onDocument={jest.fn()} onInvoice={jest.fn()} />);
  await screen.findByText('Max Rich Yu Cream');
  expect(screen.queryAllByRole('button', { name: /^Edit (price|stock)$/ }).map((button) => button.textContent)).toEqual(offered);
});
