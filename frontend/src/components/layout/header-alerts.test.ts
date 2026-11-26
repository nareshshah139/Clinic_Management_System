import { buildRoleNotifications, canOpenReports } from './header-alerts';

const appointment = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  time: '2026-11-26T00:00:00.000Z',
  slot: '10:30-11:00',
  status: 'CONFIRMED',
  visitType: 'OPD',
  patientName: 'Meera Kapoor',
  doctorName: 'Priya Menon',
  ...over,
});

const invoice = { id: 'i1', invoiceNo: 'INV-7', dueDate: '2026-11-01T00:00:00.000Z', patient: { name: 'Rahul Kumar' } };
const payment = { id: 'pay1', amount: 500, mode: 'UPI', createdAt: new Date().toISOString(), invoice: { invoiceNo: 'INV-7' } };
const expiring = { itemId: 'm1', itemName: 'Amoxicillin 500', daysUntilExpiry: 12, currentStock: 40 };

describe('appointment alerts', () => {
  it('tell a doctor the time of the slot as well as the day', () => {
    const [item] = buildRoleNotifications({ upcomingAppointments: [appointment()] }, 'DOCTOR');
    expect(item.title).toBe('Meera Kapoor on 26 Nov 2026, 10:30-11:00');
    expect(item.href).toBe('/dashboard/visits?appointmentId=a1');
  });

  it('tell reception the time of the slot and name the doctor once', () => {
    const [item] = buildRoleNotifications({ upcomingAppointments: [appointment()] }, 'RECEPTION');
    expect(item.title).toBe('Upcoming: Meera Kapoor on 26 Nov 2026, 10:30-11:00');
    expect(item.description).toBe('OPD • Dr. Priya Menon');
  });

  it('do not invent a doctor when the appointment names none', () => {
    const [item] = buildRoleNotifications({ upcomingAppointments: [appointment({ doctorName: '' })] }, 'RECEPTION');
    expect(item.description).toBe('OPD');
  });

  it('fall back to the day alone when no slot is recorded', () => {
    const [item] = buildRoleNotifications({ upcomingAppointments: [appointment({ slot: undefined })] }, 'DOCTOR');
    expect(item.title).toBe('Meera Kapoor on 26 Nov 2026');
  });
});

describe('stock alerts', () => {
  it('open the expiring stock list for pharmacy staff', () => {
    const [item] = buildRoleNotifications({ expiryAlerts: [expiring] }, 'PHARMACIST');
    expect(item.href).toBe('/dashboard/inventory?area=stock&view=list&expiryMonths=1');
  });

  it('open the expiring stock list from the owner summary', () => {
    const items = buildRoleNotifications({ counts: { expiryAlerts: 3 } }, 'OWNER');
    expect(items.map((i) => i.href)).toEqual(['/dashboard/inventory?area=stock&view=list&expiryMonths=1']);
  });
});

describe('dues alerts', () => {
  const OVERDUE = '/dashboard/billing?status=overdue';

  it('send reception from an overdue bill to the unpaid clinic bills', () => {
    const items = buildRoleNotifications({ overdueInvoices: [invoice] }, 'RECEPTION');
    expect(items.map((i) => [i.title, i.href])).toEqual([['Overdue bill INV-7', OVERDUE]]);
  });

  it('give an accountant, whom the billing page refuses, the dues without a link', () => {
    const items = buildRoleNotifications({ overdueInvoices: [invoice], pendingPayments: [payment] }, 'ACCOUNTANT');
    expect(items.map((i) => i.title)).toEqual(['Pending ₹500.00 (UPI)', 'Overdue bill INV-7']);
    expect(items.map((i) => i.href)).toEqual([undefined, undefined]);
  });

  it.each(['OWNER', 'ADMIN'])('send the %s summary of overdue bills to the unpaid clinic bills, and leave payments unlinked', (role) => {
    const items = buildRoleNotifications({ counts: { overdueInvoices: 2, pendingPayments: 1 } }, role);
    expect(items.map((i) => [i.title, i.href])).toEqual([
      ['2 overdue clinic bills', OVERDUE],
      ['1 payment awaiting reconciliation', undefined],
    ]);
  });

  it('show a manager, whom the billing page refuses, the dues summary without links', () => {
    const items = buildRoleNotifications({ counts: { overdueInvoices: 1, pendingPayments: 2 } }, 'MANAGER');
    expect(items.map((i) => [i.title, i.href])).toEqual([
      ['1 overdue clinic bill', undefined],
      ['2 payments awaiting reconciliation', undefined],
    ]);
  });
});

describe('who may open reports from the menu', () => {
  it.each(['OWNER', 'ADMIN', 'MANAGER', 'admin'])('allows %s', (role) => expect(canOpenReports(role)).toBe(true));
  it.each(['DOCTOR', 'RECEPTION', 'PHARMACIST', 'ACCOUNTANT', 'NURSE', '', undefined])('refuses %s', (role) =>
    expect(canOpenReports(role)).toBe(false));
});
