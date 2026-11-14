export const DAILY_COLLECTION = '/dashboard/pharmacy/reports?report=daily-collection';
export const LOW_STOCK_LIST = '/dashboard/inventory?area=stock&view=list&stock=LOW';
export const EXPIRING_LIST = '/dashboard/inventory?area=stock&view=list&expiryMonths=3';
export const APPROVALS = '/dashboard/inventory?area=stock&view=approvals';

export const appointmentsOn = (day: string) => `/dashboard/appointments?date=${String(day).slice(0, 10)}`;

/** The calendar's START: an existing visit opens as is; otherwise the visit starts for this appointment. */
export function visitHref(appointment: { id: string; patient?: { id: string } | null; visit?: { id: string } | null }) {
  const params = new URLSearchParams({ patientId: appointment.patient?.id ?? '', appointmentId: appointment.id });
  if (appointment.visit?.id) params.set('visitId', appointment.visit.id);
  else params.set('autoStart', 'true');
  return `/dashboard/visits?${params}`;
}

export type BillDue = {
  id: string;
  invoiceNo: string;
  balance: number;
  status: string;
  billDate: string;
  patient?: { id: string; name: string } | null;
  /** day is the appointment's calendar day, as the doctor schedule takes it. */
  appointment?: { id: string; doctorId: string; day: string } | null;
};

export type StockAlert = {
  itemId: string;
  itemName: string;
  currentStock: number;
  available?: number;
  availableInAll?: number;
  reorderLevel?: number;
  daysUntilExpiry?: number;
};

/** The low-stock rule is per batch, so a batch is named as one when the item has more in other batches. */
export function stockLeft(item: StockAlert): string {
  const available = item.available ?? item.currentStock;
  const inAll = item.availableInAll ?? available;
  return inAll > available ? `${available} in one batch (${inAll} in all)` : `${available} left`;
}

/** The system alerts: each section is empty when the viewer lacks its permission. */
export type ClinicAlerts = {
  counts?: { billsDue?: number; lowStockAlerts?: number; expiryAlerts?: number; pendingPayments?: number; upcomingAppointments?: number };
  billsDueBalance?: number;
  canTakePayment?: boolean;
  billsDue?: BillDue[];
  lowStockAlerts?: StockAlert[];
  expiryAlerts?: StockAlert[];
};
