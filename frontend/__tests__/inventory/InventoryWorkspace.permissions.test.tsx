import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InventoryWorkspace } from '@/components/inventory/InventoryWorkspace';
import { apiClient } from '@/lib/api';
const mockRouter = {push:jest.fn(),refresh:jest.fn()};
let mockQuery = 'area=stock&view=list';
jest.mock('@/lib/api', () => ({apiClient:{get:jest.fn()}}));
jest.mock('next/navigation', () => ({usePathname:()=>'/dashboard/inventory',useRouter:()=>mockRouter,useSearchParams:()=>new URLSearchParams(mockQuery)}));
jest.mock('@/components/layout/dashboard-user-context', () => ({useDashboardUser:()=>({user:{id:'operator',branchId:'branch',role:'OWNER'}})}));
jest.mock('@/components/inventory/WorkflowDocumentEditor', () => ({WorkflowDocumentEditor:({recoveryRequestKey,recoveryVersion,recoveryOperation,onBack}:any)=><div><p>Recover request {recoveryRequestKey || 'missing'}</p><p>Recovery version {recoveryVersion ?? 'missing'} operation {recoveryOperation || 'missing'}</p><button onClick={onBack}>Back from recovery</button></div>}));
jest.mock('@/components/inventory/WorkspaceStock', () => ({WorkspaceStock:({capabilities}:any)=><p>Count access {capabilities.kinds.COUNT.write?'available':'unavailable'}</p>}));
beforeEach(()=>{jest.clearAllMocks();mockQuery='area=stock&view=list';});
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

it('ignores a stale permission response after a newer refresh completes',async()=>{
  let resolveOld: (value:unknown)=>void = ()=>{};
  (apiClient.get as jest.Mock).mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValue({kinds:{COUNT:{write:false}}});
  render(<InventoryWorkspace/>);
  fireEvent.click(screen.getByRole('button',{name:'Refresh inventory'}));
  await screen.findByText('Count access unavailable');
  await act(async()=>{resolveOld({kinds:{COUNT:{write:true}}});});
  expect(screen.getByText('Count access unavailable')).toBeInTheDocument();
  expect(screen.queryByText('Count access available')).not.toBeInTheDocument();
});

it('opens only the receipts linked to the order in the recovery destination',async()=>{
  mockQuery='area=purchases&view=INWARD_CHALLAN&sourceId=order-1';
  (apiClient.get as jest.Mock).mockImplementation(async(path:string)=>path.includes('capabilities')?{kinds:{INWARD_CHALLAN:{read:true,write:false}}}:{rows:[{id:'receipt',kind:'INWARD_CHALLAN',reference:path.includes('sourceId=order-1')?'Receipt for order 1':'Unrelated receipt',createdAt:'2026-10-24',status:'POSTED',totalAmount:1,payload:{lines:[]}}],total:1,totalPages:1});
  render(<InventoryWorkspace/>);
  expect(await screen.findByText('Receipt for order 1')).toBeInTheDocument();
  expect(screen.getByText('Showing records linked to the selected source document.')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Show all records'})).toBeEnabled();
  expect(screen.queryByText('Unrelated receipt')).not.toBeInTheDocument();
});

it('opens a request recovery handoff without a saved id and leaves it through Back',async()=>{
  mockQuery='area=stock&view=LOSS&recoverRequest=retained-key';
  (apiClient.get as jest.Mock).mockImplementation(async(path:string)=>path.includes('capabilities')?{kinds:{LOSS:{read:true,write:false}}}:{rows:[],total:0,totalPages:1});
  render(<InventoryWorkspace/>);
  expect(await screen.findByText('Recover request retained-key')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Back from recovery'}));
  const target = new URL(mockRouter.push.mock.calls[0][0], 'http://localhost');
  expect(target.searchParams.get('recoverRequest')).toBeNull();
  expect(target.searchParams.get('view')).toBe('LOSS');
});

it('forwards the exact pending version and operation for a saved-document handoff',async()=>{
  mockQuery='area=stock&view=LOSS&document=saved-loss&recoverVersion=1&recoverOperation=transition';
  (apiClient.get as jest.Mock).mockResolvedValue({kinds:{LOSS:{read:true,write:false}}});
  render(<InventoryWorkspace/>);
  expect(await screen.findByText('Recovery version 1 operation transition')).toBeInTheDocument();
});
