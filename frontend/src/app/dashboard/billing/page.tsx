import { redirect } from 'next/navigation';
import { SALES_BILL_PATH } from '@/components/pharmacy/sales/sales-bill-model';

export default function BillingPage() {
  redirect(SALES_BILL_PATH);
}
