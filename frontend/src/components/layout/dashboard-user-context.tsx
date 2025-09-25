'use client';

import { ReactNode, createContext, useContext } from 'react';
import type { User } from '@/lib/types';

export interface DashboardUserContextValue {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const DashboardUserContext = createContext<DashboardUserContextValue | undefined>(undefined);

interface DashboardUserProviderProps {
  value: DashboardUserContextValue;
  children: ReactNode;
}

export function DashboardUserProvider({ value, children }: DashboardUserProviderProps) {
  return (
    <DashboardUserContext.Provider value={value}>
      {children}
    </DashboardUserContext.Provider>
  );
}

export function useDashboardUser() {
  const ctx = useContext(DashboardUserContext);
  if (!ctx) {
    throw new Error('useDashboardUser must be used within a DashboardUserProvider');
  }
  return ctx;
}

