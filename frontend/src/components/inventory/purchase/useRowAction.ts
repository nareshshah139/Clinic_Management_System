'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

type Identified = { id: string };

export function useRowAction<Row extends Identified>({
  reload,
  next,
}: {
  reload: () => Promise<{ rows: readonly Row[] } | null>;
  next: (row: Row) => boolean;
}) {
  const ids = useId();
  const [focusIds, setFocusIds] = useState<string[]>([]);
  const actionId = useCallback((rowId: string) => `${ids}act-${rowId}`, [ids]);
  const openId = useCallback((rowId: string) => `${ids}open-${rowId}`, [ids]);

  useEffect(() => {
    if (!focusIds.length) return;
    focusIds.map((id) => document.getElementById(id)).find((element) => element)?.focus();
    setFocusIds([]);
  }, [focusIds]);

  const focusAfter = (fresh: readonly Row[], rowId: string, oldIndex: number, wanted: (row: Row) => boolean = next) => {
    const index = fresh.findIndex((row) => row.id === rowId);
    const following = fresh.slice(index >= 0 ? index + 1 : Math.max(0, oldIndex)).find(wanted);
    const landing = index >= 0 ? rowId : fresh[Math.min(Math.max(0, oldIndex), fresh.length - 1)]?.id;
    setFocusIds([...(following ? [actionId(following.id)] : []), ...(landing ? [openId(landing)] : [])]);
  };

  const refresh = async (rowId: string, oldIndex: number, wanted?: (row: Row) => boolean) => {
    const fresh = (await reload())?.rows ?? [];
    focusAfter(fresh, rowId, oldIndex, wanted);
    return fresh;
  };

  return { actionId, openId, focus: (...targets: string[]) => setFocusIds(targets), focusAfter, refresh };
}

type Pending<T> = { value: T; undoing: boolean };

export function useUndoWindow<T>(windowMs: number) {
  const [pending, setPending] = useState<Record<string, Pending<T>>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    const live = timers.current;
    return () => live.forEach(clearTimeout);
  }, []);

  const forget = useCallback((rowIds: string[]) => {
    for (const rowId of rowIds) {
      clearTimeout(timers.current.get(rowId));
      timers.current.delete(rowId);
    }
    setPending((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !rowIds.includes(id))));
  }, []);
  const remember = (rowIds: string[], value: T) => {
    for (const rowId of rowIds) {
      clearTimeout(timers.current.get(rowId));
      timers.current.set(rowId, setTimeout(() => forget([rowId]), windowMs));
    }
    setPending((current) => ({ ...current, ...Object.fromEntries(rowIds.map((rowId) => [rowId, { value, undoing: false }])) }));
  };
  const sharing = (value: T) =>
    Object.entries(pendingRef.current)
      .filter(([, entry]) => entry.value === value)
      .map(([rowId]) => rowId);
  const mark = (rowIds: string[], value: T, undoing: boolean) =>
    setPending((current) => ({ ...current, ...Object.fromEntries(rowIds.map((rowId) => [rowId, { value, undoing }])) }));

  return { pending, entry: (rowId: string) => pendingRef.current[rowId], remember, forget, sharing, mark };
}
