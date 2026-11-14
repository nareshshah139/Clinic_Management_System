import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SalesBillPage from '@/app/dashboard/pharmacy/sales/bill/page';
import { apiClient } from '@/lib/api';

const mockToast = jest.fn();
const mockNav = { query: new URLSearchParams(), listeners: new Set<() => void>() };
const mockGo = jest.fn((href: string) => {
  mockNav.query = new URL(href, 'http://clinic.test').searchParams;
  mockNav.listeners.forEach((listener) => listener());
});
jest.mock('next/navigation', () => {
  const { useSyncExternalStore } = jest.requireActual('react');
  const subscribe = (listener: () => void) => {
    mockNav.listeners.add(listener);
    return () => mockNav.listeners.delete(listener);
  };
  return {
    useRouter: () => ({ push: mockGo, replace: mockGo }),
    useSearchParams: () => useSyncExternalStore(subscribe, () => mockNav.query),
  };
});
jest.mock('@/lib/api', () => ({
  apiClient: {
    get: jest.fn(), getPatients: jest.fn(), getPatient: jest.fn(), getUsers: jest.fn(), getPrescription: jest.fn(),
    post: jest.fn(), getPharmacyInvoicePrintData: jest.fn(),
  },
}));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

const api = apiClient as jest.Mocked<typeof apiClient>;
const patient = { id: 'patient-1', name: 'Meera Shah', phone: '9876543210' };
const cetirizine = { id: 'drug-c', name: 'Cetirizine 10mg Tablet', price: 32, gstRate: 12, manufacturerName: 'Cipla', packSizeLabel: '10 tablets', totalStock: 90 };
const sunscreen = { id: 'drug-s', name: 'Sunscreen SPF 50 Gel 50g', price: 520, gstRate: 18, manufacturerName: 'Sebamed', packSizeLabel: '50 g', totalStock: 26 };
const finished = {
  id: 'inv-9', invoiceNumber: 'PHI-2026-009', status: 'CONFIRMED', mutationVersion: 1, invoiceDate: '2026-11-14T05:00:00.000Z', revisedAt: null,
  billingName: patient.name, billingPhone: patient.phone, patient, doctor: null, subtotal: 32, discountAmount: 0, billDiscountKind: null,
  billDiscountValue: 0, billDiscountAmount: 0, taxAmount: 3.84, totalAmount: 35.84, items: [], payments: [], revisions: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  mockNav.query = new URLSearchParams();
  Element.prototype.scrollIntoView = jest.fn();
  api.getPatients.mockResolvedValue({ data: [patient] } as any);
  api.getUsers.mockResolvedValue({ users: [{ id: 'doctor-1', firstName: 'Priya', lastName: 'Menon' }] } as any);
  api.get.mockImplementation(async (url: string, query?: any) => {
    if (url === '/pharmacy/prescription-queue') return { data: [], pagination: { page: 1, limit: 20, total: 0, pages: 1 } };
    if (url === '/drugs/autocomplete') return [cetirizine, sunscreen].filter((d) => d.name.toLowerCase().includes(query.q.toLowerCase()));
    if (url === '/pharmacy/packages') return { packages: [] };
    if (url === '/pharmacy/invoices/inv-9') return finished;
    return {};
  });
  api.post.mockResolvedValue({ id: 'inv-9', invoiceNumber: 'PHI-2026-009', status: 'CONFIRMED' } as any);
  api.getPharmacyInvoicePrintData.mockResolvedValue({ id: 'inv-9', invoiceNumber: 'PHI-2026-009' } as any);
});

const pickPatient = async () => {
  fireEvent.change(await screen.findByLabelText('Patient *'), { target: { value: 'Meera' } });
  fireEvent.mouseDown(await screen.findByText('Meera Shah', { selector: '.font-medium' }));
};
const line = async (name: string) => (await screen.findByRole('heading', { name, level: 4 })).closest('[data-invoice-item]') as HTMLElement;

it('adds the top match on Enter, marks it before, puts the cursor in its quantity and takes its own GST rate', async () => {
  render(<SalesBillPage />);
  const search = await screen.findByLabelText('Medicine');
  fireEvent.change(search, { target: { value: 'Cetirizine' } });
  const top = (await screen.findByRole('heading', { name: cetirizine.name, level: 4 })).closest('[role="button"]') as HTMLElement;
  expect(within(top).getByText('Best match · Enter')).toBeInTheDocument();
  fireEvent.keyDown(search, { key: 'Enter' });

  const cetirizineLine = await line(cetirizine.name);
  await waitFor(() => expect(within(cetirizineLine).getByLabelText('Quantity')).toHaveFocus());
  expect(within(cetirizineLine).getByLabelText('Tax %')).toHaveValue(12);
  expect(search).toHaveValue('');
});

it('adds the top match when Enter comes before the results have shown', async () => {
  render(<SalesBillPage />);
  const search = await screen.findByLabelText('Medicine');
  fireEvent.change(search, { target: { value: 'Sunscreen' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  const sunscreenLine = await line(sunscreen.name);
  expect(within(sunscreenLine).getByLabelText('Tax %')).toHaveValue(18);
  await waitFor(() => expect(within(sunscreenLine).getByLabelText('Quantity')).toHaveFocus());
});

it('keeps a sale without a prescription to what it uses, with each extra one click away', async () => {
  render(<SalesBillPage />);
  const search = await screen.findByLabelText('Medicine');
  expect(screen.queryByText('Doctor', { selector: 'label' })).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: /Treatment Packages/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Decrease tab font size')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Bill discount')).not.toBeInTheDocument();

  fireEvent.change(search, { target: { value: 'Cetirizine' } });
  await screen.findByRole('heading', { name: cetirizine.name, level: 4 });
  fireEvent.keyDown(search, { key: 'Enter' });
  const cetirizineLine = await line(cetirizine.name);
  expect(within(cetirizineLine).queryByText('Dosage')).not.toBeInTheDocument();

  fireEvent.click(within(cetirizineLine).getByRole('button', { name: 'Directions' }));
  expect(within(cetirizineLine).getByText('Dosage')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Doctor' }));
  expect(screen.getByText('Doctor', { selector: 'label' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Bill discount' }));
  expect(screen.getByLabelText('Bill discount')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Treatment packages' }));
  expect(screen.getByRole('tab', { name: /Treatment Packages/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByLabelText('Decrease tab font size')).toBeInTheDocument();
});

it('shows payment as buttons with Cash chosen, and confirms, prints and opens the finished bill in one press', async () => {
  render(<SalesBillPage />);
  await pickPatient();
  expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true');
  const solid = (name: string) => screen.getByRole('button', { name }).classList.contains('bg-primary');
  expect([solid('Cash'), solid('UPI'), solid('Confirm and print')]).toEqual([false, false, true]);
  const search = screen.getByLabelText('Medicine');
  fireEvent.change(search, { target: { value: 'Cetirizine' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  fireEvent.change(within(await line(cetirizine.name)).getByLabelText('Quantity'), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
  expect(screen.getByRole('button', { name: 'UPI' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'false');

  fireEvent.click(screen.getByRole('button', { name: 'Confirm and print' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/pharmacy/invoices/checkout', expect.objectContaining({
    requestKey: expect.any(String), patientId: patient.id, paymentMethod: 'UPI',
    items: [expect.objectContaining({ drugId: cetirizine.id, quantity: 10, taxPercent: 12 })],
  })));
  await waitFor(() => expect(mockGo).toHaveBeenLastCalledWith('/dashboard/pharmacy/sales/bill?bill=inv-9&next=sale'));
  expect(await screen.findByText('Bill PHI-2026-009')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'New sale' })).toHaveAttribute('href', '/dashboard/pharmacy/sales/bill');
  expect(api.post).toHaveBeenCalledTimes(1);
});

it('sells to a walk-in customer by name and phone with no patient, and never carries a patient over', async () => {
  render(<SalesBillPage />);
  await pickPatient();
  expect(screen.getByLabelText('Billing Name *')).toHaveValue('Meera Shah');
  fireEvent.click(screen.getByRole('button', { name: 'Walk-in customer' }));
  expect(screen.queryByLabelText('Patient *')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Customer name *')).toHaveValue('');
  expect(screen.getByLabelText('Phone *')).toHaveValue('');

  const search = screen.getByLabelText('Medicine');
  fireEvent.change(search, { target: { value: 'Sunscreen' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  await line(sunscreen.name);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and print' }));
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Enter the customer's name" }));
  expect(api.post).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('Customer name *'), { target: { value: 'Ramesh Kale' } });
  fireEvent.change(screen.getByLabelText('Phone *'), { target: { value: '9000011111' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and print' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/pharmacy/invoices/checkout', expect.objectContaining({
    patientId: '', billingName: 'Ramesh Kale', billingPhone: '9000011111', billingAddress: '', paymentMethod: 'CASH',
    items: [expect.objectContaining({ drugId: sunscreen.id, quantity: 1, taxPercent: 18 })],
  })));
  await waitFor(() => expect(mockGo).toHaveBeenLastCalledWith('/dashboard/pharmacy/sales/bill?bill=inv-9&next=sale'));
});

it('refuses a prescription-only medicine on a walk-in bill at once, and lets it go on a bill with a patient', async () => {
  const doxycycline = { id: 'drug-d', name: 'Doxycycline 100mg Capsule', price: 90, gstRate: 12, manufacturerName: 'Cipla', packSizeLabel: '10 capsules', totalStock: 40, requiresPrescription: true };
  const base = api.get.getMockImplementation()!;
  api.get.mockImplementation(async (url: string, query?: any) =>
    url === '/drugs/autocomplete' && /doxy/i.test(query.q) ? [doxycycline] : base(url, query));
  const message = 'Doxycycline 100mg Capsule needs a prescription. Choose the patient instead of Walk-in customer.';

  render(<SalesBillPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Walk-in customer' }));
  const search = screen.getByLabelText('Medicine');
  fireEvent.change(search, { target: { value: 'Doxycycline' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  const doxyLine = await line(doxycycline.name);
  expect(within(doxyLine).getByRole('alert')).toHaveTextContent(message);

  fireEvent.change(screen.getByLabelText('Customer name *'), { target: { value: 'Ramesh Kale' } });
  fireEvent.change(screen.getByLabelText('Phone *'), { target: { value: '9000011111' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and print' }));
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: message }));
  expect(api.post).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Choose a patient' }));
  expect(within(doxyLine).queryByRole('alert')).not.toBeInTheDocument();
  await pickPatient();
  expect(within(await line(doxycycline.name)).queryByText(message)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and print' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/pharmacy/invoices/checkout', expect.objectContaining({
    patientId: patient.id, items: [expect.objectContaining({ drugId: doxycycline.id })],
  })));
});
