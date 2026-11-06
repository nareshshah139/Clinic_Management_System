import { returnDestination } from '@/components/inventory/workspace-model';

const origin = 'https://clinic.example';
const resolve = (value: string | undefined) => returnDestination(value, '/dashboard/inventory', origin);

it('accepts a dashboard path on this site, with its query', () => {
  expect(resolve('/dashboard/pharmacy/sales?tab=returns')).toBe('/dashboard/pharmacy/sales?tab=returns');
  expect(resolve('https://clinic.example/dashboard/pharmacy/sales?q=A#top')).toBe('/dashboard/pharmacy/sales?q=A#top');
});

it('rejects every way of leaving the site or the dashboard', () => {
  const hostile = ['/\\evil.com', '/\t/evil.com', '//evil.com', 'https:evil.com', 'javascript:alert(1)', 'https://evil.com/dashboard/x', '/login', '/dashboard'];
  expect(hostile.map(resolve)).toEqual(Array(hostile.length).fill(null));
});

it('keeps a bare query string on the current page', () => {
  expect(resolve('area=sales&view=SALES_RETURN')).toBe('/dashboard/inventory?area=sales&view=SALES_RETURN');
  expect(resolve(undefined)).toBeNull();
});
