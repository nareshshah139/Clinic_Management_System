import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { InventoryWorkspace } from '@/components/inventory/InventoryWorkspace';
import { apiClient } from '@/lib/api';
import { useInventoryResource } from '@/components/inventory/useInventoryResource';
const mockRouter = {push:jest.fn(),replace:jest.fn(),refresh:jest.fn()};
let mockQuery = 'area=stock&view=list';
jest.mock('@/lib/api', () => ({apiClient:{get:jest.fn()}}));
jest.mock('next/navigation', () => ({usePathname:()=>'/dashboard/inventory',useRouter:()=>mockRouter,useSearchParams:()=>new URLSearchParams(mockQuery)}));
let mockRole = 'OWNER';
jest.mock('@/components/layout/dashboard-user-context', () => ({useDashboardUser:()=>({user:{id:'operator',branchId:'branch',role:mockRole}})}));
jest.mock('@/components/inventory/WorkflowDocumentEditor', () => ({WorkflowDocumentEditor:({recoveryRequestKey,recoveryVersion,recoveryOperation,onBack}:any)=><div><p>Recover request {recoveryRequestKey || 'missing'}</p><p>Recovery version {recoveryVersion ?? 'missing'} operation {recoveryOperation || 'missing'}</p><button onClick={onBack}>Back from recovery</button></div>}));
jest.mock('@/components/inventory/WorkspaceStock', () => ({WorkspaceStock:({capabilities}:any)=><p>Count access {capabilities.kinds.COUNT.write?'available':'unavailable'}</p>}));
beforeEach(()=>{jest.clearAllMocks();mockQuery='area=stock&view=list';mockRole='OWNER';});
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

it.each(['', '0', '-1', '1.5', 'invalid'])('does not invent a pending revision from invalid recovery version %s',async version=>{
  mockQuery=`area=stock&view=LOSS&document=saved-loss&recoverVersion=${version}&recoverOperation=transition`;
  (apiClient.get as jest.Mock).mockResolvedValue({kinds:{LOSS:{read:true,write:false}}});
  render(<InventoryWorkspace/>);
  expect(await screen.findByText('Recovery version missing operation transition')).toBeInTheDocument();
});

const emptyDocuments = { rows: [], total: 0, page: 1, totalPages: 1 };
it.each([
  ['area=stock&view=LOSS', 'Loading records…', 'Retry records', emptyDocuments, 'No loss & breakage match these filters.'],
  ['area=purchases&view=suppliers', 'Loading suppliers…', 'Retry suppliers', [], 'No suppliers yet. Add a supplier to start recording purchases.'],
])('distinguishes loading, failed and recovered empty reads for %s', async (query, loading, retry, result, empty) => {
  mockQuery = query as string;
  let rejectRead: (error: Error) => void = () => {};
  let reads = 0;
  (apiClient.get as jest.Mock).mockImplementation((path: string) => {
    if (path.includes('capabilities')) return Promise.resolve({supplierWrite:true,kinds:{LOSS:{read:true,write:true}}});
    if (++reads === 1) return new Promise((_resolve, reject) => { rejectRead = reject; });
    return Promise.resolve(result);
  });
  render(<InventoryWorkspace/>);
  expect(await screen.findByText(loading as string)).toBeInTheDocument();
  expect(screen.queryByText('0 records')).not.toBeInTheDocument();
  await act(async () => rejectRead(new Error('Connection interrupted')));
  expect(await screen.findByText('Connection interrupted')).toBeInTheDocument();
  expect(screen.queryByText(empty as string)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: retry as string}));
  expect(await screen.findByText(empty as string)).toBeInTheDocument();
  expect(screen.queryByText('Connection interrupted')).not.toBeInTheDocument();
});

it('shows purchase bills from the purchase register with their payment state', async () => {
  mockQuery = 'area=purchases&view=register&gstin=36ABCDE1234F1Z5';
  (apiClient.get as jest.Mock).mockImplementation(async (path: string) => path.includes('capabilities') ? {kinds:{}} : {
    rows:[{id:'bill-1',srNo:1,billNo:'LIN-101',entryAt:'2026-10-01T05:00:00.000Z',billDate:'2026-10-01',entryBy:null,source:'MANUAL',
      distributor:{name:'Linae Distributors',gstin:'36ABCDE1234F1Z5'},amount:1000,invoiceState:'POSTED',
      documents:[],payment:{state:'DUE',paid:0,credit:0,outstanding:1000,scheduled:0,scheduledOn:null,payable:1000,partlyPaid:false,dueDate:null,overdueDays:0}}],
    total:1,page:1,limit:50,totals:{amount:1000,outstanding:1000,count:1,excluded:{notPosted:0,cancelled:0}},entryByOptions:[],distributorOptions:[],
  });
  render(<InventoryWorkspace/>);
  const table = await screen.findByRole('table', {name: 'Purchase bills'});
  expect(table).toHaveTextContent('LIN-101');
  expect(table).toHaveTextContent('₹1,000.00Due');
  expect(screen.getByRole('button', {name: 'Purchase bills'})).toHaveAttribute('aria-current', 'page');
  const reads = (apiClient.get as jest.Mock).mock.calls.map(([path, params]) => [path, params?.distributorGstin]).filter(([path]) => !path.includes('capabilities'));
  expect(reads).toEqual([['/pharmacy/purchase-register', '36ABCDE1234F1Z5']]);
  expect(screen.queryByText('Saved bills')).not.toBeInTheDocument();
});

it('never lets a late prior filter overwrite current workflow results', async () => {
  mockQuery = 'area=stock&view=LOSS&search=old';
  let resolveOld: (data: unknown) => void = () => {};
  (apiClient.get as jest.Mock).mockImplementation((path: string) => {
    if(path.includes('capabilities')) return Promise.resolve({kinds:{LOSS:{read:true,write:true}}});
    if(path.includes('search=old')) return new Promise(resolve => {resolveOld=resolve;});
    return Promise.resolve({...emptyDocuments, rows:[{id:'new',kind:'LOSS',reference:'Current filtered record',status:'POSTED',createdAt:'2026-11-04',totalAmount:10,payload:{lines:[]}}],total:1});
  });
  const view = render(<InventoryWorkspace/>);
  await screen.findByText('Loading records…');
  mockQuery = 'area=stock&view=LOSS&search=new';
  view.rerender(<InventoryWorkspace/>);
  expect(await screen.findByText('Current filtered record')).toBeInTheDocument();
  await act(async () => resolveOld({...emptyDocuments,rows:[{id:'old',kind:'LOSS',reference:'Stale record',status:'POSTED',createdAt:'2026-11-04',totalAmount:10,payload:{lines:[]}}],total:1}));
  expect(screen.getByText('Current filtered record')).toBeInTheDocument();
  expect(screen.queryByText('Stale record')).not.toBeInTheDocument();
});

it('reloads the current query when an older mutation retains its reload callback', async () => {
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => ({ label: url }));
  const view = renderHook(({url}) => useInventoryResource<{label:string}>(url), {initialProps:{url:'/old-query'}});
  await waitFor(() => expect(view.result.current.data?.label).toBe('/old-query'));
  const retainedReload = view.result.current.reload;
  view.rerender({url:'/current-query'});
  await waitFor(() => expect(view.result.current.data?.label).toBe('/current-query'));
  await act(async () => retainedReload());
  expect(view.result.current.status).toBe('ready');
  expect(view.result.current.data).toEqual({label:'/current-query'});
  expect((apiClient.get as jest.Mock).mock.calls.map(([url])=>url)).toEqual(['/old-query','/current-query','/current-query']);
});

it('returns to the Sales register a document was opened from, and refuses another site',async()=>{
  (apiClient.get as jest.Mock).mockImplementation(async(path:string)=>path.includes('capabilities')?{kinds:{SALES_RETURN:{read:true,write:false}}}:{rows:[],total:0,totalPages:1});
  mockQuery=`area=sales&view=SALES_RETURN&recoverRequest=k&return=${encodeURIComponent('/dashboard/pharmacy/sales?tab=returns&q=SR-1')}`;
  const first = render(<InventoryWorkspace/>);
  fireEvent.click(await screen.findByRole('button',{name:'Back from recovery'}));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/dashboard/pharmacy/sales?tab=returns&q=SR-1',{scroll:false});
  first.unmount();
  mockQuery=`area=sales&view=SALES_RETURN&recoverRequest=k&return=${encodeURIComponent('//evil.example/x')}`;
  render(<InventoryWorkspace/>);
  fireEvent.click(await screen.findByRole('button',{name:'Back from recovery'}));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/dashboard/inventory?area=sales&view=SALES_RETURN',{scroll:false});
});

it.each(['RECEPTION', 'PHARMACIST', 'DOCTOR'])('keeps pharmacy reports out of %s Purchases: they live in Pharmacy Report (CR-33)', async (role) => {
  mockRole = role;
  mockQuery = 'area=purchases&view=suppliers';
  (apiClient.get as jest.Mock).mockResolvedValue({ kinds: {}, rows: [], total: 0, totalPages: 1 });
  render(<InventoryWorkspace/>);
  const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
  expect(options.filter((o) => ['GST & monthly reports', 'Day-wise summary', 'Item-wise margin'].includes(o || ''))).toEqual([]);
  expect(options).toContain('Terms of Trade');
});

it.each([
  ['reports', '/dashboard/pharmacy/reports?report=gst-summary'],
  ['daywise', '/dashboard/pharmacy/reports?report=day-wise-summary'],
  ['margin', '/dashboard/pharmacy/reports?report=item-margin'],
])('sends an old Inventory link to %s on to the same report in Pharmacy Report', async (view, href) => {
  mockRole = 'PHARMACIST';
  mockQuery = `area=purchases&view=${view}`;
  (apiClient.get as jest.Mock).mockResolvedValue({ kinds: {}, rows: [], total: 0, totalPages: 1 });
  render(<InventoryWorkspace/>);
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(href));
  expect(screen.getByRole('link', { name: 'Pharmacy Report' })).toHaveAttribute('href', href);
});
