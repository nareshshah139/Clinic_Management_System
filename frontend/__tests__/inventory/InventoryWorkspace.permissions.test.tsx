import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InventoryWorkspace } from '@/components/inventory/InventoryWorkspace';
import { apiClient } from '@/lib/api';
jest.mock('@/lib/api', () => ({apiClient:{get:jest.fn()}}));
jest.mock('next/navigation', () => ({usePathname:()=>'/dashboard/inventory',useRouter:()=>({push:jest.fn(),refresh:jest.fn()}),useSearchParams:()=>new URLSearchParams('area=stock&view=list')}));
jest.mock('@/components/layout/dashboard-user-context', () => ({useDashboardUser:()=>({user:{id:'operator',branchId:'branch',role:'OWNER'}})}));
jest.mock('@/components/inventory/WorkspaceStock', () => ({WorkspaceStock:({capabilities}:any)=><p>Count access {capabilities.kinds.COUNT.write?'available':'unavailable'}</p>}));
beforeEach(()=>jest.clearAllMocks());
it('retries failed permissions from a named control and renders the recovered access',async()=>{
  (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValue({kinds:{COUNT:{write:true}}});
  render(<InventoryWorkspace/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Inventory permissions could not be loaded');
  expect(screen.getByRole('alert')).toHaveTextContent('Loading permissions does not change stock');
  fireEvent.click(screen.getByRole('button',{name:'Retry permissions'}));
  expect(await screen.findByText('Count access available')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('refreshes permissions and removes stale access if the request fails',async()=>{
  (apiClient.get as jest.Mock).mockResolvedValueOnce({kinds:{COUNT:{write:true}}}).mockRejectedValueOnce(new Error('Session unavailable')).mockResolvedValue({kinds:{COUNT:{write:false}}});
  render(<InventoryWorkspace/>);
  await screen.findByText('Count access available');
  fireEvent.click(screen.getByRole('button',{name:'Refresh inventory'}));
  await screen.findByRole('button',{name:'Retry permissions'});
  expect(screen.queryByText('Count access available')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Retry permissions'}));
  await waitFor(()=>expect(screen.getByText('Count access unavailable')).toBeInTheDocument());
});
