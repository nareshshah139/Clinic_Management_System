import { fireEvent, render, screen, within } from '@testing-library/react';
import RoomsPage from '@/app/dashboard/rooms/page';
import PatientsPage from '@/app/dashboard/patients/page';
import VisitsPage from '@/app/dashboard/visits/page';
import { PharmacyWorkspace } from '@/app/dashboard/pharmacy/pharmacy-workspace';
import { apiClient } from '@/lib/api';
import { UserRole } from '@cms/shared-types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard',
}));
jest.mock('@/components/layout/dashboard-user-context', () => ({
  useDashboardUser: () => ({ user: { id: 'u1', role: UserRole.OWNER }, loading: false }),
}));
jest.mock('@/lib/api', () => ({
  apiClient: { get: jest.fn(), getPatients: jest.fn(), getPatient: jest.fn(), getUser: jest.fn(), getAppointment: jest.fn() },
}));
jest.mock('@/components/rooms/RoomsManagement', () => () => null);
jest.mock('@/components/rooms/RoomCalendar', () => () => null);
jest.mock('@/components/patients/PatientsManagement', () => () => null);
jest.mock('@/components/pharmacy/PackageBrowser', () => ({ PackageBrowser: () => null }));
jest.mock('@/components/pharmacy/PharmacyPackageCreator', () => ({ PharmacyPackageCreator: () => null }));
jest.mock('@/components/pharmacy/PartnerDailySync', () => ({ PartnerDailySync: () => null }));
jest.mock('@/components/pharmacy/PharmacyCounterCockpit', () => ({ PharmacyCounterCockpit: () => null }));

const api = apiClient as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  api.get.mockImplementation(async (url: string) =>
    url === '/users' ? { users: [{ id: 'd1', firstName: 'Meera', lastName: 'Iyer', role: UserRole.DOCTOR }] } : {});
  api.getPatients.mockResolvedValue({ data: [{ id: 'p1', name: 'Asha Rao' }] });
});

const readGuide = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Quick guide' }));
  return within(await screen.findByRole('dialog')).getAllByRole('listitem').map((item) => item.textContent ?? '');
};

it('the Rooms guide describes only the calendar, room list and booking that exist', async () => {
  render(<RoomsPage />);
  const guide = (await readGuide()).join('\n');

  expect(guide).not.toMatch(/reassign|amenit|equipment|availability schedule|utili[sz]ation|cleaning|maintenance/i);
  expect(guide).toMatch(/name, type and capacity/);
  expect(guide).toMatch(/booking dialog/);
});

it('the Patients guide names the real form fields, filters and profile tabs', async () => {
  render(<PatientsPage />);
  const guide = (await readGuide()).join('\n');

  expect(guide).not.toMatch(/date of birth|medical history|insurance|by status|invoices|treatment plans/i);
  expect(guide).toMatch(/New Patient/);
  expect(guide).toMatch(/gender, consultation type/);
  expect(guide).toMatch(/Info .* History .* Uploads/);
});

it('the Visits guide does not promise nurses complaints or a SOAP form', async () => {
  render(<VisitsPage />);
  const guide = await readGuide();

  expect(guide.filter((item) => /nurse/i.test(item))).toEqual(['Nurses record vitals and photos']);
  expect(guide.join('\n')).not.toMatch(/SOAP|Subjective/);
  expect(guide.join('\n')).toMatch(/Vitals, Complaints, Diagnosis, Treatment, Investigations and Follow-up/);
});

it('the Pharmacy guide points to the counter queue and inventory screens that exist', async () => {
  render(<PharmacyWorkspace />);
  const guide = (await readGuide()).join('\n');

  expect(guide).not.toMatch(/Pharmacy Control|Rx queue|Excel/);
  expect(guide).toMatch(/Pharmacy Counter queue/);
  expect(guide).toMatch(/Inventory > Purchases > Scan or enter bill/);
});
