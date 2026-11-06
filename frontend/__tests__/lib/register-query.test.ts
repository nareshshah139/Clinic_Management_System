import { errorMessage, parseQuery, queryParams, reduceQuery, type RegisterQueryConfig } from '@/components/register/register-query';

type Filter = 'pay' | 'by';
type Sort = 'billNo' | 'entryAt' | 'amount';
const config: RegisterQueryConfig<Filter, Sort> = {
  searchFields: ['billNo', 'patient'],
  filters: { pay: { param: 'pay', values: ['CASH', 'UPI'] }, by: { param: 'by' } },
  sorts: ['billNo', 'entryAt', 'amount'],
  descFirst: ['entryAt', 'amount'],
  defaultSort: { by: 'entryAt', dir: 'desc' },
};
const today = '2026-11-06';
const parse = (search: string) => parseQuery(config, new URLSearchParams(search), today);
const defaults = {
  field: 'billNo',
  q: '',
  from: '2026-04-01',
  to: '2027-03-31',
  filters: { pay: '', by: '' },
  sortBy: 'entryAt',
  sortDir: 'desc',
  page: 1,
};

it('falls back to defaults for every garbage parameter', () => {
  expect(parse('field=drop&pay=BITCOIN&sort=secret&dir=sideways&page=abc&from=2026-02-30&to=yesterday')).toEqual(defaults);
});

it('ignores a range whose start is after its end or before 2000', () => {
  expect(parse('from=2026-11-06&to=2026-11-01')).toMatchObject({ from: '2026-04-01', to: '2027-03-31' });
  expect(parse('from=1999-04-01&to=2026-11-01')).toMatchObject({ from: '2026-04-01', to: '2027-03-31' });
  expect(parse('from=2026-11-01&to=2026-11-06')).toMatchObject({ from: '2026-11-01', to: '2026-11-06' });
});

it('keeps only whole page numbers above one', () => {
  expect(['0', '-3', '2.5', '1e3', ''].map((page) => parse(`page=${page}`).page)).toEqual([1, 1, 1, 1000, 1]);
  expect(parse('page=4').page).toBe(4);
});

it('writes only what differs from the defaults and reads it back unchanged', () => {
  const query = { ...defaults, field: 'patient', q: 'meera', from: '2026-11-01', to: '2026-11-06', filters: { pay: 'UPI', by: 'user-7' }, sortBy: 'amount' as const, sortDir: 'asc' as const, page: 3 };
  const params = queryParams(config, query, today);
  expect(params.toString()).toBe('field=patient&q=meera&from=2026-11-01&to=2026-11-06&pay=UPI&by=user-7&sort=amount&dir=asc&page=3');
  expect(parse(params.toString())).toEqual(query);
  expect(queryParams(config, parse(''), today).toString()).toBe('');
});

it('sorts dates and amounts newest or largest first, text A to Z first, and toggles on a repeat click', () => {
  const byBill = reduceQuery(config, { ...defaults, page: 4 } as never, { type: 'sort', key: 'billNo' });
  expect([byBill.sortBy, byBill.sortDir, byBill.page]).toEqual(['billNo', 'asc', 1]);
  const toggled = reduceQuery(config, byBill, { type: 'sort', key: 'billNo' });
  expect(toggled.sortDir).toBe('desc');
  const byAmount = reduceQuery(config, toggled, { type: 'sort', key: 'amount' });
  expect([byAmount.sortBy, byAmount.sortDir]).toEqual(['amount', 'desc']);
});

it('returns to page one on every filter change and clears everything except the sort', () => {
  const start = { ...defaults, q: 'x', filters: { pay: 'UPI', by: '' }, sortBy: 'billNo' as const, sortDir: 'asc' as const, page: 5 };
  expect(reduceQuery(config, start, { type: 'filter', key: 'by', value: 'u1' })).toMatchObject({ filters: { pay: 'UPI', by: 'u1' }, page: 1 });
  expect(reduceQuery(config, start, { type: 'range', from: '2026-11-01', to: '2026-11-02' })).toMatchObject({ from: '2026-11-01', page: 1 });
  expect(reduceQuery(config, start, { type: 'page', page: 0 }).page).toBe(1);
  expect(reduceQuery(config, start, { type: 'clear', today })).toEqual({ ...defaults, sortBy: 'billNo', sortDir: 'asc' });
});

it('flattens a server validation list into one sentence', () => {
  expect(errorMessage({ body: { message: ['Choose a date range of at most 400 days', 'The start date must be on or before the end date'] } })).toBe(
    'Choose a date range of at most 400 days. The start date must be on or before the end date',
  );
  expect(errorMessage({ message: 'HTTP 500' })).toBe('HTTP 500');
  expect(errorMessage(null)).toBe('Something went wrong');
});
