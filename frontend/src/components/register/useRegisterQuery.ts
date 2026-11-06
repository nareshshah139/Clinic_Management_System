'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { getISTDateString } from '@/lib/utils';
import {
  errorMessage,
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
  | { status: 'error'; data: Data | null; error: string };

export function useRegisterQuery<Filter extends string, Sort extends string, Data extends RegisterPage>({
  config,
  searchParams,
  onParamsChange,
  fetchPage,
  enabled = true,
}: {
  config: RegisterQueryConfig<Filter, Sort>;
  searchParams: Pick<URLSearchParams, 'get'>;
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

  useEffect(() => {
    paramsRef.current(queryParams(config, query, today));
  }, [config, query, today]);

  useEffect(() => {
    if (!started) return;
    const request = ++latest.current;
    setLoad((current) => ({ status: 'loading', data: current.data, error: '' }));
    fetchRef.current(query).then(
      (data) => {
        if (request !== latest.current) return;
        const last = lastPage(data.total, data.limit);
        if (!data.rows.length && query.page > last) dispatch({ type: 'page', page: last });
        else setLoad({ status: 'ready', data, error: '' });
      },
      (error: unknown) => {
        if (request === latest.current) setLoad((current) => ({ status: 'error', data: current.data, error: errorMessage(error) }));
      },
    );
  }, [query, attempt, started]);

  const clear = useCallback(() => {
    setDraft('');
    dispatch({ type: 'clear', today });
  }, [today]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { today, query, dispatch, draft, setDraft, clear, load, retry };
}
