'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { getISTDateString } from '@/lib/utils';
import {
  countFilters,
  errorMessage,
  isRangeDefault,
  lastPage,
  parseQuery,
  queryParams,
  reduceQuery,
  type RegisterQuery,
  type RegisterQueryAction,
  type RegisterQueryConfig,
} from './register-query';

export type RegisterPage = { rows: readonly unknown[]; total: number; limit: number };
export type RegisterLoad<Data> =
  | { status: 'loading'; data: Data | null; error: '' }
  | { status: 'ready'; data: Data; error: '' }
  | { status: 'error'; data: Data | null; error: string }
  | { status: 'denied'; data: null; error: '' };

const isDenied = (error: unknown) => (error as { status?: number } | null)?.status === 403;

export function useRegisterQuery<Filter extends string, Sort extends string, Data extends RegisterPage>({
  config,
  more,
  searchParams,
  onParamsChange,
  fetchPage,
  enabled = true,
}: {
  config: RegisterQueryConfig<Filter, Sort>;
  more: readonly Filter[];
  searchParams: Pick<URLSearchParams, 'get' | 'toString'>;
  onParamsChange: (params: URLSearchParams) => void;
  fetchPage: (query: RegisterQuery<Filter, Sort>) => Promise<Data>;
  enabled?: boolean;
}) {
  const [today] = useState(() => getISTDateString());
  const [query, dispatch] = useReducer(
    (state: RegisterQuery<Filter, Sort>, action: RegisterQueryAction<Filter, Sort>) => reduceQuery(config, state, action),
    undefined,
    () => parseQuery(config, searchParams, today),
  );
  const [draft, setDraft] = useState(query.q);
  const [load, setLoad] = useState<RegisterLoad<Data>>({ status: 'loading', data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  const [started, setStarted] = useState(enabled);
  const latest = useRef(0);
  const waiting = useRef<((data: Data | null) => void)[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const paramsRef = useRef(onParamsChange);
  paramsRef.current = onParamsChange;

  if (enabled && !started) setStarted(true);

  useEffect(() => {
    if (draft === query.q) return;
    const timer = setTimeout(() => dispatch({ type: 'search', q: draft }), 300);
    return () => clearTimeout(timer);
  }, [draft, query.q]);

  const queryRef = useRef(query);
  queryRef.current = query;
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const pending = useRef<string[]>([]);
  const keyOf = useCallback(
    (value: RegisterQuery<Filter, Sort>) => queryParams(config, value, today).toString(),
    [config, today],
  );

  useEffect(() => {
    const params = queryParams(config, query, today);
    if (enabled && params.toString() !== keyOf(parseQuery(config, searchParamsRef.current, today))) pending.current.push(params.toString());
    paramsRef.current(params);
  }, [config, query, today, enabled, keyOf]);

  const incoming = searchParams.toString();
  useEffect(() => {
    if (!enabled) return;
    const parsed = parseQuery(config, searchParamsRef.current, today);
    const key = keyOf(parsed);
    if (key === keyOf(queryRef.current)) {
      pending.current = [];
      return;
    }
    const echoed = pending.current.indexOf(key);
    if (echoed >= 0) {
      pending.current = pending.current.slice(echoed + 1);
      return;
    }
    pending.current = [];
    setDraft(parsed.q);
    dispatch({ type: 'load', query: parsed });
  }, [incoming, enabled, config, today, keyOf]);

  useEffect(() => {
    if (!started) return;
    const request = ++latest.current;
    setLoad((current) => ({ status: 'loading', data: current.data, error: '' }));
    const settle = (data: Data | null) => waiting.current.splice(0).forEach((resolve) => resolve(data));
    fetchRef.current(query).then(
      (data) => {
        if (request !== latest.current) return;
        const last = lastPage(data.total, data.limit);
        if (!data.rows.length && query.page > last) dispatch({ type: 'page', page: last });
        else {
          setLoad({ status: 'ready', data, error: '' });
          settle(data);
        }
      },
      (error: unknown) => {
        if (request !== latest.current) return;
        setLoad((current) => (isDenied(error) ? { status: 'denied', data: null, error: '' } : { status: 'error', data: current.data, error: errorMessage(error) }));
        settle(null);
      },
    );
  }, [query, attempt, started]);

  const reload = useCallback(
    () =>
      new Promise<Data | null>((resolve) => {
        waiting.current.push(resolve);
        setAttempt((n) => n + 1);
      }),
    [],
  );

  const filterCount = countFilters(query, Object.keys(config.filters) as Filter[]);
  const rangeChanged = !isRangeDefault(query, today);
  const searching = query.q.trim() !== '' || draft.trim() !== '' || filterCount > 0;
  const view = {
    searching,
    rangeChanged,
    filtered: searching || rangeChanged,
    barCount: filterCount + (rangeChanged ? 1 : 0),
    moreCount: countFilters(query, more),
  };

  const clearAll = () => {
    setDraft('');
    dispatch({ type: 'clear', today });
    searchRef.current?.focus();
  };
  const goToPage = (page: number) => {
    dispatch({ type: 'page', page });
    tableRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  };

  return { today, query, dispatch, draft, setDraft, load, reload, view, searchRef, tableRef, clearAll, goToPage };
}
