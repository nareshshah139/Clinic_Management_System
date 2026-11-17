'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { VOICE_BAR_COLLAPSED_KEY, VOICE_BAR_IDLE, voiceBarReducer, voiceBarRegistrationOf, type VoiceBarEvent, type VoiceBarState } from '@/lib/voice-bar';
import type { VoiceBarApplyResult, VoiceDraftLine, VoiceFillFields, VoiceFillFormId } from '@/lib/voice-fill';

export interface VoiceBarForm {
  form: Exclude<VoiceFillFormId, 'voice-command'>;
  /** Names the target in the bar, e.g. "Visit notes". */
  label: string;
  /** Placeholder for the text box, e.g. "Say or type the visit notes". */
  hint: string;
  /** Opaque; a change discards an open draft and a pending undo. */
  scope: string;
  preview(fields: VoiceFillFields): VoiceDraftLine[];
  apply(fields: VoiceFillFields): VoiceBarApplyResult | Promise<VoiceBarApplyResult>;
}

/** `form` always holds the page's latest props, so a re-render is not a new registration. */
export interface VoiceBarRegistration {
  id: string;
  form: RefObject<VoiceBarForm>;
}

interface VoiceBarContextValue {
  active: VoiceBarRegistration | null;
  state: VoiceBarState;
  dispatch: Dispatch<VoiceBarEvent>;
  collapsed: boolean;
  setCollapsed(collapsed: boolean): void;
  /** Where focus goes once the bar has re-rendered after a collapse or expand; the bar consumes it. */
  pendingFocus: MutableRefObject<'box' | 'opener' | null>;
  register(form: RefObject<VoiceBarForm>): string;
  unregister(id: string): void;
}

const VoiceBarContext = createContext<VoiceBarContextValue | null>(null);

/**
 * @cc [owner:nareshshah139,label:product] voice-bar-latest-registration-wins
 * The latest mounted non-null registration MUST be the active one, a registration MUST be released on unmount (also
 * under Strict Mode's double mount), and only a change of `form` or `scope` MUST count as a new registration.
 */
export function VoiceBarProvider({ children }: { children: ReactNode }) {
  const [registrations, setRegistrations] = useState<VoiceBarRegistration[]>([]);
  const [state, dispatch] = useReducer(voiceBarReducer, VOICE_BAR_IDLE);
  const [collapsed, setCollapsedState] = useState(false);
  const pendingFocus = useRef<'box' | 'opener' | null>(null);
  const nextIdRef = useRef(0);

  useEffect(() => {
    try {
      if (localStorage.getItem(VOICE_BAR_COLLAPSED_KEY) === '1') setCollapsedState(true);
    } catch {}
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    pendingFocus.current = next ? 'opener' : 'box';
    setCollapsedState(next);
    try {
      if (next) localStorage.setItem(VOICE_BAR_COLLAPSED_KEY, '1');
      else localStorage.removeItem(VOICE_BAR_COLLAPSED_KEY);
    } catch {}
  }, []);

  const register = useCallback((form: RefObject<VoiceBarForm>) => {
    nextIdRef.current += 1;
    const id = `voice-bar-form-${nextIdRef.current}`;
    setRegistrations((current) => [...current, { id, form }]);
    return id;
  }, []);
  const unregister = useCallback((id: string) => {
    setRegistrations((current) => current.filter((registration) => registration.id !== id));
  }, []);

  const active = registrations.at(-1) ?? null;
  const activeId = active?.id ?? null;
  useEffect(() => {
    dispatch({ type: 'registration', activeId });
  }, [activeId]);

  const value = useMemo(
    () => ({ active, state, dispatch, collapsed, setCollapsed, pendingFocus, register, unregister }),
    [active, state, collapsed, setCollapsed, register, unregister],
  );
  return <VoiceBarContext.Provider value={value}>{children}</VoiceBarContext.Provider>;
}

export function useVoiceBar(): Pick<VoiceBarContextValue, 'active' | 'state' | 'dispatch' | 'collapsed' | 'setCollapsed' | 'pendingFocus'> {
  const context = useContext(VoiceBarContext);
  if (!context) throw new Error('useVoiceBar must be used within a VoiceBarProvider');
  return context;
}

/** Registers the page's form with the bar while mounted. Outside a provider it does nothing. */
export function useVoiceBarForm(form: VoiceBarForm | null): { busy: boolean; settle: () => void } {
  const context = useContext(VoiceBarContext);
  const formRef = useRef(form);
  if (form) formRef.current = form;
  const idRef = useRef<string | null>(null);
  const register = context?.register;
  const unregister = context?.unregister;
  const enabled = form !== null;
  const formId = form?.form;
  const scope = form?.scope;

  useEffect(() => {
    if (!register || !unregister || !enabled) return;
    const id = register(formRef as RefObject<VoiceBarForm>);
    idRef.current = id;
    return () => {
      idRef.current = null;
      unregister(id);
    };
  }, [register, unregister, enabled, formId, scope]);

  const state = context?.state;
  const busy = !!state && (state.kind === 'listening' || state.kind === 'working')
    && idRef.current !== null && voiceBarRegistrationOf(state) === idRef.current;
  const dispatch = context?.dispatch;
  const stateRef = useRef(state);
  stateRef.current = state;
  /** Clears "the form is open" once the page's dialog has closed, so the bar does not describe a dialog that is gone. */
  const settle = useCallback(() => {
    const current = stateRef.current;
    if (current?.kind === 'applied' && current.registrationId === idRef.current) dispatch?.({ type: 'dismiss' });
  }, [dispatch]);
  return { busy, settle };
}
