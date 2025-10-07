'use client';

import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';

type DermatologyExam = {
  skinType?: string;
  morphology: string[];
  distribution: string[];
  acneSeverity?: string;
  itchScore?: number;
  skinConcerns: string[];
};

type VisitCore = {
  complaints: string[];
  objective?: string;
  diagnosis: string[];
  reviewDate?: string;
  dermatology: DermatologyExam;
};

type VisitAction =
  | { type: 'setComplaints'; complaints: string[] }
  | { type: 'setObjective'; objective?: string }
  | { type: 'setDiagnosis'; diagnosis: string[] }
  | { type: 'setReviewDate'; reviewDate?: string }
  | { type: 'setDermatology'; dermatology: Partial<DermatologyExam> };

function reducer(state: VisitCore, action: VisitAction): VisitCore {
  switch (action.type) {
    case 'setComplaints':
      return { ...state, complaints: action.complaints };
    case 'setObjective':
      return { ...state, objective: action.objective };
    case 'setDiagnosis':
      return { ...state, diagnosis: action.diagnosis };
    case 'setReviewDate':
      return { ...state, reviewDate: action.reviewDate };
    case 'setDermatology':
      return { ...state, dermatology: { ...state.dermatology, ...action.dermatology } } as VisitCore;
    default:
      return state;
  }
}

type VisitContextValue = {
  state: VisitCore;
  setComplaints: (complaints: string[]) => void;
  setObjective: (objective?: string) => void;
  setDiagnosis: (diagnosis: string[]) => void;
  setReviewDate: (reviewDate?: string) => void;
  setDermatology: (patch: Partial<DermatologyExam>) => void;
};

const defaultState: VisitCore = {
  complaints: [],
  objective: undefined,
  diagnosis: [],
  reviewDate: undefined,
  dermatology: { skinType: undefined, morphology: [], distribution: [], acneSeverity: undefined, itchScore: undefined, skinConcerns: [] },
};

const VisitStateContext = createContext<VisitContextValue | undefined>(undefined);

export function VisitStateProvider({ children, initial }: { children: React.ReactNode; initial?: Partial<VisitCore> }) {
  const initialState: VisitCore = useMemo(() => ({ ...defaultState, ...initial, dermatology: { ...defaultState.dermatology, ...(initial?.dermatology || {}) } }), [initial]);
  const [state, dispatch] = useReducer(reducer, initialState);

  const setComplaints = useCallback((complaints: string[]) => dispatch({ type: 'setComplaints', complaints }), []);
  const setObjective = useCallback((objective?: string) => dispatch({ type: 'setObjective', objective }), []);
  const setDiagnosis = useCallback((diagnosis: string[]) => dispatch({ type: 'setDiagnosis', diagnosis }), []);
  const setReviewDate = useCallback((reviewDate?: string) => dispatch({ type: 'setReviewDate', reviewDate }), []);
  const setDermatology = useCallback((patch: Partial<DermatologyExam>) => dispatch({ type: 'setDermatology', dermatology: patch }), []);

  const value = useMemo<VisitContextValue>(() => ({ state, setComplaints, setObjective, setDiagnosis, setReviewDate, setDermatology }), [state, setComplaints, setObjective, setDiagnosis, setReviewDate, setDermatology]);
  return <VisitStateContext.Provider value={value}>{children}</VisitStateContext.Provider>;
}

export function useVisitState(): VisitContextValue {
  const ctx = useContext(VisitStateContext);
  if (!ctx) throw new Error('useVisitState must be used within VisitStateProvider');
  return ctx;
}


