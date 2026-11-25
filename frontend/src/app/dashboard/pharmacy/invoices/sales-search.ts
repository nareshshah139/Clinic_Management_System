import { SALES_PATH } from '@/components/pharmacy/sales/sales-register-model';

const PHONE_NUMBER = /^\+?[\d\s-]{7,}$/;

/**
 * The old invoice list searched one box. In-app links still send it an invoice number
 * (Ledger, Compliance), so a term with digits cannot go to the patient field.
 */
export function salesHrefForLegacySearch(search: string | undefined): string {
  const q = search?.trim();
  if (!q) return SALES_PATH;
  const field = PHONE_NUMBER.test(q) ? 'mobile' : /\d/.test(q) ? 'billNo' : 'patient';
  return `${SALES_PATH}?${new URLSearchParams({ field, q })}`;
}
