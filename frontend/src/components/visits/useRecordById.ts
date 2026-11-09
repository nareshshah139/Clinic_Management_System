import { useEffect, useState } from 'react';

export type RecordState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; record: T }
  | { status: 'missing' };

export function useRecordById<T>(id: string, fetchById: (id: string) => Promise<unknown>): RecordState<T> {
  const [state, setState] = useState<{ id: string; result: RecordState<T> }>({ id: '', result: { status: 'idle' } });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchById(id)
      .then((record) => {
        if (cancelled) return;
        setState({ id, result: record ? { status: 'ready', record: record as T } : { status: 'missing' } });
      })
      .catch(() => {
        if (!cancelled) setState({ id, result: { status: 'missing' } });
      });
    return () => {
      cancelled = true;
    };
  }, [id, fetchById]);

  if (!id) return { status: 'idle' };
  return state.id === id ? state.result : { status: 'loading' };
}
