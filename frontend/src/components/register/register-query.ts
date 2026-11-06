import { financialYear, isDay } from '@/lib/date-ranges';

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export type FilterSpec = { param: string; values?: readonly string[] };

export type RegisterQueryConfig<Filter extends string, Sort extends string> = {
  searchFields: readonly string[];
  filters: Record<Filter, FilterSpec>;
  sorts: readonly Sort[];
  descFirst: readonly Sort[];
  defaultSort: { by: Sort; dir: SortDirection };
};

export type RegisterQuery<Filter extends string, Sort extends string> = {
  field: string;
  q: string;
  from: string;
  to: string;
  filters: Record<Filter, string>;
  sortBy: Sort;
  sortDir: SortDirection;
  page: number;
};

export type RegisterQueryAction<Filter extends string, Sort extends string> =
  | { type: 'search'; field?: string; q?: string }
  | { type: 'range'; from: string; to: string }
  | { type: 'filter'; key: Filter; value: string }
  | { type: 'sort'; key: Sort }
  | { type: 'page'; page: number }
  | { type: 'clear'; today: string };

type Params = Pick<URLSearchParams, 'get'>;

const filterKeys = <Filter extends string>(config: RegisterQueryConfig<Filter, string>) =>
  Object.keys(config.filters) as Filter[];

export function defaultQuery<Filter extends string, Sort extends string>(
  config: RegisterQueryConfig<Filter, Sort>,
  today: string,
): RegisterQuery<Filter, Sort> {
  return {
    field: config.searchFields[0],
    q: '',
    ...financialYear(today),
    filters: Object.fromEntries(filterKeys(config).map((key) => [key, ''])) as Record<Filter, string>,
    sortBy: config.defaultSort.by,
    sortDir: config.defaultSort.dir,
    page: 1,
  };
}

export function parseQuery<Filter extends string, Sort extends string>(
  config: RegisterQueryConfig<Filter, Sort>,
  params: Params,
  today: string,
): RegisterQuery<Filter, Sort> {
  const query = defaultQuery(config, today);
  const read = (name: string) => params.get(name)?.trim() ?? '';
  const field = read('field');
  if (config.searchFields.includes(field)) query.field = field;
  query.q = read('q');
  const from = read('from');
  const to = read('to');
  if (isDay(from) && isDay(to) && from <= to) Object.assign(query, { from, to });
  for (const key of filterKeys(config)) {
    const { param, values } = config.filters[key];
    const value = read(param);
    if (!values || values.includes(value)) query.filters[key] = value;
  }
  const sortBy = read('sort');
  if ((config.sorts as readonly string[]).includes(sortBy)) query.sortBy = sortBy as Sort;
  const sortDir = read('dir');
  if ((SORT_DIRECTIONS as readonly string[]).includes(sortDir)) query.sortDir = sortDir as SortDirection;
  const page = Number(read('page'));
  if (Number.isSafeInteger(page) && page > 1) query.page = page;
  return query;
}

export function queryParams<Filter extends string, Sort extends string>(
  config: RegisterQueryConfig<Filter, Sort>,
  query: RegisterQuery<Filter, Sort>,
  today: string,
): URLSearchParams {
  const defaults = defaultQuery(config, today);
  const params = new URLSearchParams();
  const put = (name: string, value: string | number, fallback: string | number) => {
    if (value !== fallback) params.set(name, String(value));
  };
  put('field', query.field, defaults.field);
  put('q', query.q, defaults.q);
  put('from', query.from, defaults.from);
  put('to', query.to, defaults.to);
  for (const key of filterKeys(config)) put(config.filters[key].param, query.filters[key], '');
  put('sort', query.sortBy, defaults.sortBy);
  put('dir', query.sortDir, defaults.sortDir);
  put('page', query.page, 1);
  return params;
}

export function reduceQuery<Filter extends string, Sort extends string>(
  config: RegisterQueryConfig<Filter, Sort>,
  query: RegisterQuery<Filter, Sort>,
  action: RegisterQueryAction<Filter, Sort>,
): RegisterQuery<Filter, Sort> {
  switch (action.type) {
    case 'search':
      return { ...query, field: action.field ?? query.field, q: action.q ?? query.q, page: 1 };
    case 'range':
      return { ...query, from: action.from, to: action.to, page: 1 };
    case 'filter':
      return { ...query, filters: { ...query.filters, [action.key]: action.value }, page: 1 };
    case 'sort': {
      const firstDir: SortDirection = config.descFirst.includes(action.key) ? 'desc' : 'asc';
      const sortDir = query.sortBy !== action.key ? firstDir : query.sortDir === 'asc' ? 'desc' : 'asc';
      return { ...query, sortBy: action.key, sortDir, page: 1 };
    }
    case 'page':
      return { ...query, page: Math.max(1, Math.floor(action.page)) };
    case 'clear':
      return { ...defaultQuery(config, action.today), sortBy: query.sortBy, sortDir: query.sortDir };
  }
}

export const countFilters = <Filter extends string>(query: RegisterQuery<Filter, string>, keys: readonly Filter[]) =>
  keys.filter((key) => query.filters[key] !== '').length;

export function isRangeDefault(query: RegisterQuery<string, string>, today: string) {
  const range = financialYear(today);
  return query.from === range.from && query.to === range.to;
}

export const lastPage = (total: number, limit: number) => Math.max(1, Math.ceil(total / limit));

export function errorMessage(error: unknown): string {
  const failure = error as { body?: { message?: unknown } | null; message?: unknown } | null;
  const message = failure?.body?.message ?? failure?.message;
  if (Array.isArray(message)) return message.filter((part) => typeof part === 'string').join('. ') || 'Something went wrong';
  return typeof message === 'string' && message ? message : 'Something went wrong';
}

export function shortName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first;
}
