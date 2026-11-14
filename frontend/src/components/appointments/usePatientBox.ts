import { useCallback, useEffect, useRef, useState } from 'react';
import type { Patient } from '@/lib/types';

export const SEARCH_PAUSE_MS = 250;
const AUTO_SELECT_MIN_CHARS = 3;

/**
 * The patient box is in exactly one of two states. `searching` holds what the user typed and the
 * list from the last finished search (`done` is false while the next search is still waiting or
 * running). `selected` holds the patient and no text.
 */
export type PatientBox =
  | { kind: 'searching'; text: string; results: Patient[]; done: boolean }
  | { kind: 'selected'; patient: Patient };

const EMPTY: PatientBox = { kind: 'searching', text: '', results: [], done: true };

export function usePatientBox(find: (text: string) => Promise<Patient[]>) {
  const [box, setBox] = useState<PatientBox>(EMPTY);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turn = useRef(0);
  const findRef = useRef(find);
  findRef.current = find;

  // Every user action starts a new turn: its pending pause is dropped and an answer to an earlier turn is stale.
  const startTurn = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    return ++turn.current;
  }, []);

  useEffect(() => () => { startTurn(); }, [startTurn]);

  const select = useCallback((patient: Patient) => {
    startTurn();
    setBox({ kind: 'selected', patient });
  }, [startTurn]);

  const clear = useCallback(() => {
    startTurn();
    setBox(EMPTY);
  }, [startTurn]);

  const type = useCallback((text: string) => {
    const mine = startTurn();
    if (!text.trim()) {
      setBox({ kind: 'searching', text, results: [], done: true });
      return;
    }
    setBox((previous) => ({ kind: 'searching', text, results: previous.kind === 'searching' ? previous.results : [], done: false }));
    timer.current = setTimeout(async () => {
      let results: Patient[] = [];
      try {
        results = await findRef.current(text);
      } catch (error) {
        console.error('Failed to search patients', error);
      }
      if (turn.current !== mine) return;
      if (results.length === 1 && text.trim().length >= AUTO_SELECT_MIN_CHARS) setBox({ kind: 'selected', patient: results[0] });
      else setBox({ kind: 'searching', text, results, done: true });
    }, SEARCH_PAUSE_MS);
  }, [startTurn]);

  return { box, type, select, clear, turn };
}
