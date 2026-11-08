import { useCallback, useEffect, useReducer } from 'react';

export interface OnExaminationPanelState {
  open: boolean;
  userChose: boolean;
}

export type OnExaminationPanelEvent =
  | { type: 'examinationFilled' }
  | { type: 'toggle' };

export function initialPanelState(preferenceOpen: boolean, hasExamination: boolean): OnExaminationPanelState {
  return { open: hasExamination || preferenceOpen, userChose: false };
}

export function panelReducer(
  state: OnExaminationPanelState,
  event: OnExaminationPanelEvent,
): OnExaminationPanelState {
  switch (event.type) {
    case 'examinationFilled':
      return state.userChose || state.open ? state : { ...state, open: true };
    case 'toggle':
      return { open: !state.open, userChose: true };
  }
}

export function preferenceKey(doctorId: string): string {
  return `cms.ui.onExamination.open.${doctorId}`;
}

export function readPreference(doctorId: string): boolean {
  try {
    return window.localStorage.getItem(preferenceKey(doctorId)) === 'true';
  } catch {
    return false;
  }
}

function writePreference(doctorId: string, open: boolean): void {
  try {
    window.localStorage.setItem(preferenceKey(doctorId), String(open));
  } catch {}
}

export function useOnExaminationPanel(doctorId: string, hasExamination: boolean) {
  const [state, dispatch] = useReducer(panelReducer, undefined, () =>
    initialPanelState(readPreference(doctorId), hasExamination),
  );

  useEffect(() => {
    if (hasExamination) dispatch({ type: 'examinationFilled' });
  }, [hasExamination]);

  const setOpen = useCallback(
    (next: boolean) => {
      if (next === state.open) return;
      dispatch({ type: 'toggle' });
      writePreference(doctorId, next);
    },
    [doctorId, state.open],
  );

  return { open: state.open, setOpen };
}
