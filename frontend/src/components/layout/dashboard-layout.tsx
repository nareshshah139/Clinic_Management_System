'use client';

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { apiClient } from '@/lib/api';
import type { ApiError } from '@/lib/api';
import type { User } from '@/lib/types';
import { DashboardUserProvider } from './dashboard-user-context';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = useCallback(async () => {
    try {
      setLoading(true);
      const me = await apiClient.get<{ id?: string; role?: string; branchId?: string }>('/auth/me');
      if (me?.id) {
        try {
          const fullUser = await apiClient.get<User>(`/users/${me.id}`);
          setUser({ ...(fullUser as User), role: (me.role as any) ?? (fullUser as any).role });
        } catch (innerError) {
          console.error('Failed to load full user profile; using minimal identity', innerError);
          setUser({
            id: me.id!,
            firstName: '',
            lastName: '',
            name: '',
            email: '',
            phone: '',
            role: (me.role as any) || 'UNKNOWN',
            status: 'ACTIVE',
            branchId: (me.branchId as any) || '',
            isActive: true,
            createdAt: '',
            updatedAt: '',
          } as unknown as User);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      const apiError = error as ApiError | undefined;
      if (apiError?.status === 401) {
        setUser(null);
        router.replace('/login');
        return;
      }
      console.error('Failed to load current user', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void fetchCurrentUser();
  }, [fetchCurrentUser]);

  const handleLogout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch (error) {
      console.error('Logout failed', error);
    } finally {
      setUser(null);
      router.replace('/login');
    }
  }, [router]);

  const contextValue = useMemo(
    () => ({
      user,
      loading,
      refresh: fetchCurrentUser,
      logout: handleLogout,
    }),
    [user, loading, fetchCurrentUser, handleLogout]
  );

  return (
    <DashboardUserProvider value={contextValue}>
      <div className="h-screen flex bg-gray-50">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <Header />

          {/* Page content */}
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </DashboardUserProvider>
  );
}