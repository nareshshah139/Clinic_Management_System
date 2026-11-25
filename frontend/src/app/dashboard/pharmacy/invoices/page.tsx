import { redirect } from 'next/navigation';
import { salesHrefForLegacySearch } from './sales-search';

export default async function PharmacyInvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { search } = await searchParams;
  redirect(salesHrefForLegacySearch(typeof search === 'string' ? search : undefined));
}
