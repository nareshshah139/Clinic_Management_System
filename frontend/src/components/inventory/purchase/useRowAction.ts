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

type Pending<T> = { value: T; rowIds: string[]; undoing: boolean };

export function useUndoWindow<T>(windowMs: number) {
  const [pending, setPending] = useState<Record<string, Pending<T>>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    const live = timers.current;
    return () => live.forEach(clearTimeout);
  }, []);

  const forget = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setPending((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
  }, []);
  const remember = (id: string, rowIds: string[], value: T) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => forget(id), windowMs));
    setPending((current) => ({ ...current, [id]: { value, rowIds, undoing: false } }));
  };
  const mark = (id: string, undoing: boolean) =>
    setPending((current) => (current[id] ? { ...current, [id]: { ...current[id], undoing } } : current));
  const latest = (rowId: string) =>
    Object.values(pending)
      .filter((entry) => entry.rowIds.includes(rowId))
      .at(-1);

  return { latest, entry: (id: string) => pendingRef.current[id], remember, forget, mark };
}
