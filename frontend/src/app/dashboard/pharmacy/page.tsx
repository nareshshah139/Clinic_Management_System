import { redirect } from 'next/navigation';
import { pharmacyBillingRedirect } from '@/components/pharmacy/sales/sales-bill-model';
import { PharmacyWorkspace } from './pharmacy-workspace';

export default async function PharmacyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (typeof value === 'string') query.set(key, value);
  const billing = pharmacyBillingRedirect(query);
  if (billing) redirect(billing);
  return <PharmacyWorkspace />;
}
