"use client";

import {
  ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { MobileNavigation } from "./mobile-navigation";
import { VoiceBar } from "@/components/voice/VoiceBar";
import { VoiceBarProvider } from "@/components/voice/VoiceBarProvider";
import { apiClient } from "@/lib/api";
import type { ApiError } from "@/lib/api";
import type { User } from "@/lib/types";
import { DashboardUserProvider } from "./dashboard-user-context";
import { AnalyticsMount } from "@/lib/analytics";
import { ReportIssueProvider } from "@/components/issue-report/ReportIssueProvider";
import { SessionExpiredDialog } from "@/components/auth/SessionExpiredDialog";
import { OfflineBanner } from "./offline-banner";

interface DashboardLayoutProps {
  children: ReactNode;
}

/** The profile in one request; /auth/me only when the profile is refused, as for a role outside clinic staff. */
async function loadSignedInUser(): Promise<User | null> {
  try {
    return await apiClient.get<User>("/users/me");
  } catch (error) {
    if ((error as ApiError | undefined)?.status === 401) throw error;
    console.error("Failed to load full user profile; using minimal identity", error);
  }
  const me = await apiClient.get<{ id?: string; role?: string; branchId?: string }>("/auth/me");
  if (!me?.id) return null;
  return {
    id: me.id,
    firstName: "",
    lastName: "",
    name: "",
    email: "",
    phone: "",
    role: (me.role as any) || "UNKNOWN",
    status: "ACTIVE",
    branchId: me.branchId || "",
    isActive: true,
    createdAt: "",
    updatedAt: "",
  } as unknown as User;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = useCallback(async () => {
    setLoading(true);
    try {
      setUser(await loadSignedInUser());
    } catch (error) {
      if ((error as ApiError | undefined)?.status === 401) {
        setUser(null);
        router.replace("/login");
        return;
      }
      console.error("Failed to load current user", error);
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
      console.error("Logout failed", error);
    } finally {
      setUser(null);
      router.replace("/login");
    }
  }, [router]);

  const contextValue = useMemo(
    () => ({
      user,
      loading,
      refresh: fetchCurrentUser,
      logout: handleLogout,
    }),
    [user, loading, fetchCurrentUser, handleLogout],
  );

  return (
    <DashboardUserProvider value={contextValue}>
      <AnalyticsMount user={user} />
      <SessionExpiredDialog />
      <ReportIssueProvider>
        <VoiceBarProvider>
          <div className="h-screen supports-[height:100dvh]:h-dvh flex bg-background">
            {/* Sidebar */}
            <div className="hidden shrink-0 md:block">
              <Suspense
                fallback={
                  <div className="h-full w-64 shrink-0 border-r border-[var(--border)] bg-sidebar" />
                }
              >
                <Sidebar />
              </Suspense>
            </div>

            {/* Main content */}
            <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
              <Header leading={<MobileNavigation />} />

              <OfflineBanner />

              {/* Page content */}
              <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">
                {children}
              </main>
              <VoiceBar />
            </div>
          </div>
        </VoiceBarProvider>
      </ReportIssueProvider>
    </DashboardUserProvider>
  );
}
