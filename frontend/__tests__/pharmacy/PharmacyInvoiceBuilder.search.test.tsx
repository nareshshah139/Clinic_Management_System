import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PharmacyInvoiceBuilderFixed } from '@/components/pharmacy/PharmacyInvoiceBuilderFixed';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), getPatients: jest.fn(), getUsers: jest.fn(), post: jest.fn() } }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
const api=apiClient as jest.Mocked<typeof apiClient>;
const drug=(id:string,name:string) => ({id,name,price:100,manufacturerName:'Test maker',packSizeLabel:'20g',
  searchMatch:{kind:'fuzzy',corrections:['tyrodni → tyrodin'],matchedText:name}});

beforeEach(()=>{
  jest.clearAllMocks();
  api.getPatients.mockResolvedValue({data:[]} as any);
  api.getUsers.mockResolvedValue({data:[]} as any);
  api.get.mockResolvedValue({data:[]} as any);
});

it('uses shared autocomplete order, labels spelling suggestions, and requires Add before changing the invoice',async()=>{
  api.get.mockImplementation(async(url:any)=>url==='/drugs/autocomplete'?[drug('first','Tyrodin FSR Tablet'),drug('second','Tyrodin Cream')]:{data:[]});
  render(<PharmacyInvoiceBuilderFixed/>);
  fireEvent.change(screen.getByLabelText('Search Drugs'),{target:{value:'tyrodni'}});
  await waitFor(()=>expect(api.get).toHaveBeenCalledWith('/drugs/autocomplete',{q:'tyrodni',limit:20,mode:'all',clinicInventoryOnly:true}));
  const labels=await screen.findAllByText('Similar spelling');
  expect(labels).toHaveLength(2);
  expect(screen.getAllByRole('heading',{level:4}).map(h=>h.textContent)).toEqual(['Tyrodin FSR Tablet','Tyrodin Cream']);
  const first=screen.getByText('Tyrodin FSR Tablet').closest('[role="button"]') as HTMLElement;
  expect(within(first).getByRole('button',{name:'Add'})).toBeEnabled();
  expect(api.post).not.toHaveBeenCalled();
});

it('discards an older response after the query changes',async()=>{
  let resolveOld!:(value:any)=>void;
  api.get.mockImplementation((url:any,params:any)=>url==='/drugs/autocomplete'
    ? params.q==='tyrodni' ? new Promise(resolve=>{resolveOld=resolve;}) : Promise.resolve([drug('new','Max Rich Yu Cream')])
    : Promise.resolve({data:[]}));
  render(<PharmacyInvoiceBuilderFixed/>);
  const input=screen.getByLabelText('Search Drugs');
  fireEvent.change(input,{target:{value:'tyrodni'}});
  await waitFor(()=>expect(resolveOld).toBeDefined());
  fireEvent.change(input,{target:{value:'maxrcih'}});
  await screen.findByText('Max Rich Yu Cream');
  await act(async()=>{resolveOld([drug('old','Tyrodin Cream')]);});
  expect(screen.queryByText('Tyrodin Cream')).not.toBeInTheDocument();
  expect(screen.getByText('Max Rich Yu Cream')).toBeInTheDocument();
});
