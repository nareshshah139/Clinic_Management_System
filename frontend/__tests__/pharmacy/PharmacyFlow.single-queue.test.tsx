import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PharmacyWorkspace } from '@/app/dashboard/pharmacy/pharmacy-workspace';
import SalesBillPage from '@/app/dashboard/pharmacy/sales/bill/page';
import { apiClient } from '@/lib/api';

const mockPush = jest.fn();
let mockQuery = new URLSearchParams();
let mockRole = 'PHARMACIST';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockPush }),
  useSearchParams: () => mockQuery,
}));
jest.mock('@/components/layout/dashboard-user-context', () => ({
  useDashboardUser: () => ({ user: { id: 'u1', role: mockRole }, loading: false }),
}));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn(), post: jest.fn(), patch: jest.fn(), getPatients: jest.fn(), getPatient: jest.fn(), getUsers: jest.fn(), getPrescription: jest.fn(),
} }));

const api = apiClient as jest.Mocked<typeof apiClient>;
const entry = (id: string, name: string, extra: object = {}) => ({
  prescriptionId: id, visitId: `visit-${id}`, status: 'pending', createdAt: new Date().toISOString(), pendingHours: 1, isOverTwoHours: false,
  linkedInvoiceIds: [], patient: { id: `patient-${id}`, name }, doctor: { id: 'doctor-1', name: 'Shravya' },
  medications: [{ drugName: 'Adapalene gel', prescribedQuantity: 1, dispensedQuantity: 0, coverageStatus: 'not_started' }],
  ...extra,
});
const queue = [
  entry('rx-1', 'Ananya Reddy'),
  entry('rx-2', 'Mohammed Irfan', { linkedInvoiceIds: ['inv-1'] }),
  entry('rx-3', 'Old Patient', { dispensingEligible: false, status: 'expired' }),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery = new URLSearchParams();
  mockRole = 'PHARMACIST';
  Element.prototype.scrollIntoView = jest.fn();
  api.get.mockImplementation(async (url: string) => {
    if (url === '/pharmacy/prescription-queue') return { data: queue, pagination: { total: queue.length } };
    if (url.endsWith('/stock-check')) {
      return { items: [{ drugName: 'Adapalene gel', prescriptionVersion: 'v1', inventoryItemId: null, matchedDrug: null, stockStatus: 'UNMATCHED', totalNonExpiredStock: 0, batches: [], lowStock: false, nearExpiry: false, alternatives: [] }] };
    }
    return {};
  });
  const task = (id: string) => ({ ...queue.find((item) => item.prescriptionId === id)!, dispenseTaskId: `task-${id}`, dispenseStatus: 'IN_REVIEW' });
  api.post.mockImplementation(async (url: string) => ({ data: task(url.split('/')[3]) }) as any);
  api.patch.mockImplementation(async () => task('rx-2') as any);
  api.getPrescription.mockResolvedValue({ id: 'rx-1', updatedAt: 'v1', visit: { patient: { id: 'patient-rx-1', name: 'Ananya Reddy' }, doctor: { id: 'doctor-1', firstName: 'Shravya', lastName: 'D' } }, items: [{ drugName: 'Adapalene gel', quantity: 1 }] } as any);
  api.getPatient.mockResolvedValue({ id: 'patient-rx-1', name: 'Ananya Reddy' } as any);
  api.getPatients.mockResolvedValue({ data: [] } as any);
  api.getUsers.mockResolvedValue({ users: [] } as any);
});

describe('Pharmacy Counter', () => {
  beforeEach(() => { mockQuery = new URLSearchParams('section=counter'); });

  it('is the one place that lists waiting prescriptions, under one title and one New bill', async () => {
    render(<PharmacyWorkspace />);
    const list = await screen.findByRole('list', { name: 'Prescription queue' });
    expect(screen.getAllByRole('list', { name: 'Prescription queue' })).toHaveLength(1);
    expect(within(list).getAllByRole('listitem').map((row) => within(row).getByText(/Reddy|Irfan|Old/).textContent)).toEqual(['Ananya Reddy', 'Mohammed Irfan', 'Old Patient']);
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Pharmacy Counter']);
    expect(screen.getAllByRole('button', { name: 'New bill' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^(New sale|Walk-in bill|Start billing|Rx queue|Open bill)$/ })).not.toBeInTheDocument();
  });

  it("opens each row's bill pre-filled for that prescription, and offers no bill for an expired one", async () => {
    render(<PharmacyWorkspace />);
    const list = await screen.findByRole('list', { name: 'Prescription queue' });
    const row = (name: string) => within(list).getByText(name).closest('li')!;
    fireEvent.click(within(row('Mohammed Irfan')).getByRole('button', { name: 'Bill' }));
    expect(mockPush).toHaveBeenLastCalledWith('/dashboard/pharmacy/sales/bill?patientId=patient-rx-2&prescriptionId=rx-2&doctorId=doctor-1&visitId=visit-rx-2');
    expect(within(row('Old Patient')).queryByRole('button', { name: 'Bill' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New bill' }));
    expect(mockPush).toHaveBeenLastCalledWith('/dashboard/pharmacy/sales/bill');
  });

  it('offers reception no bill it would be refused, on any row or the active prescription', async () => {
    mockRole = 'RECEPTION';
    render(<PharmacyWorkspace />);
    const list = await screen.findByRole('list', { name: 'Prescription queue' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    await screen.findByText('0/1 lines reviewed');
    expect(screen.queryByRole('button', { name: /Bill/ })).not.toBeInTheDocument();
  });

  it('links an unmatched medicine to stock and collects payment only for a billed prescription', async () => {
    render(<PharmacyWorkspace />);
    expect(await screen.findByRole('button', { name: 'Link inventory for Adapalene gel' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Collect payment/ })).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('list', { name: 'Prescription queue' })).getByText('Mohammed Irfan'));
    expect(await screen.findByRole('link', { name: /Collect payment/ })).toHaveAttribute('href', '/dashboard/pharmacy/invoices?search=Mohammed%20Irfan');
  });
});

describe('Bill page', () => {
  it('opens a prescription bill with no queue, titled New bill, with one way back to the Counter', async () => {
    mockQuery = new URLSearchParams('patientId=patient-rx-1&prescriptionId=rx-1&doctorId=doctor-1');
    render(<SalesBillPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'New bill' })).toBeInTheDocument();
    await waitFor(() => expect(api.getPrescription).toHaveBeenCalledWith('rx-1'));
    expect(screen.queryByRole('list', { name: 'Prescription queue' })).not.toBeInTheDocument();
    expect(screen.queryByText(/queue/i)).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/pharmacy/prescription-queue', expect.anything());
    expect(screen.getAllByRole('link', { name: /^Back to/ }).map((link) => [link.textContent?.trim(), link.getAttribute('href')])).toEqual([
      ['Back to Counter', '/dashboard/pharmacy?section=counter'],
    ]);
    expect(screen.queryByRole('tab', { name: 'Returns' })).not.toBeInTheDocument();
  });

  it('sums up the linked prescription on one line and keeps its details one click away', async () => {
    mockQuery = new URLSearchParams('patientId=patient-rx-1&prescriptionId=rx-1&doctorId=doctor-1');
    render(<SalesBillPage />);
    const summary = (await screen.findByRole('heading', { name: 'Linked Prescription' })).closest('summary')!;
    await waitFor(() => expect(summary).toHaveTextContent('Linked Prescription· 1 item· 1 to link to inventory'));
    expect(screen.getByText('Prescription ID:')).not.toBeVisible();
    fireEvent.click(summary);
    expect(screen.getByText('Prescription ID:')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Link inventory for Adapalene gel' })).toBeVisible();
  });

  it('shows reception the linked prescription without a Link item control', async () => {
    mockRole = 'RECEPTION';
    mockQuery = new URLSearchParams('patientId=patient-rx-1&prescriptionId=rx-1&doctorId=doctor-1');
    render(<SalesBillPage />);
    const summary = (await screen.findByRole('heading', { name: 'Linked Prescription' })).closest('summary')!;
    await waitFor(() => expect(summary).toHaveTextContent('1 to link to inventory'));
    fireEvent.click(summary);
    expect(screen.getByText('Prescription ID:')).toBeVisible();
    expect(screen.queryByText('Link item')).not.toBeInTheDocument();
    expect(screen.queryByText('Change link')).not.toBeInTheDocument();
  });
});
