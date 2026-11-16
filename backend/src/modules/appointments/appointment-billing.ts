const billSelect = { id: true, invoiceNo: true, billType: true, total: true, received: true, balance: true, status: true } as const;

export function appointmentBillingInclude(branchId: string) {
  const bills = { where: { branchId, status: { not: 'CANCELLED' } }, select: billSelect };
  return { newInvoices: bills, visit: { select: { id: true, newInvoices: bills } } };
}

type LinkedBill = { id: string; invoiceNo: string; billType: string | null; total: number; received: number; balance: number; status: string };

/**
 * @cc [owner:nareshshah139,label:product] appointment-linked-bills
 * Appointment billing MUST contain only its explicitly linked invoices and its
 * linked visit's invoices, once per invoice ID. Unrecorded bill types remain null.
 */
export function withAppointmentBilling<T extends { newInvoices?: LinkedBill[]; visit?: { newInvoices?: LinkedBill[] } | null }>(appointment: T) {
  const unique = new Map<string, LinkedBill>();
  for (const invoice of [...(appointment.newInvoices || []), ...(appointment.visit?.newInvoices || [])]) {
    if (invoice.status !== 'CANCELLED') unique.set(invoice.id, invoice);
  }
  return { ...appointment, billing: { invoices: [...unique.values()] } };
}
