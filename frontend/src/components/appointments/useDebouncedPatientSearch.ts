import { useCallback, useEffect, useRef } from 'react';

export const PATIENT_SEARCH_DEBOUNCE_MS = 250;

/**
 * @cc [owner:nareshshah139,label:product] debounced-latest-patient-search
 * Rapid patient-search keystrokes MUST issue one request for the final query after the debounce
 * delay. A response for a superseded or cancelled query MUST NOT reach the caller's state:
 * `run` receives `isCurrent`, which turns false once a newer query or `cancel` arrives.
 */
export function useDebouncedPatientSearch(
  run: (query: string, isCurrent: () => boolean) => Promise<void>,
  delayMs: number = PATIENT_SEARCH_DEBOUNCE_MS,
) {
  const runRef = useRef(run);
  runRef.current = run;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);

  const cancel = useCallback(() => {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const schedule = useCallback((query: string) => {
    cancel();
    const mine = generation.current;
    timer.current = setTimeout(() => {
      timer.current = null;
      void runRef.current(query, () => generation.current === mine);
    }, delayMs);
  }, [cancel, delayMs]);

  useEffect(() => cancel, [cancel]);

  return { schedule, cancel };
}
