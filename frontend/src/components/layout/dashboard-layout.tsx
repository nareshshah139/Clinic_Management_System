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
import { apiClient } from "@/lib/api";
import type { ApiError } from "@/lib/api";
import type { User } from "@/lib/types";
import { DashboardUserProvider } from "./dashboard-user-context";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog as Sheet,
  DialogContent as SheetContent,
  DialogTitle as SheetTitle,
  DialogTrigger as SheetTrigger,
} from "@/components/ui/dialog";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [navigationOpen, setNavigationOpen] = useState(false);

  const fetchCurrentUser = useCallback(async () => {
    try {
      setLoading(true);
      const me = await apiClient.get<{
        id?: string;
        role?: string;
        branchId?: string;
      }>("/auth/me");
      if (me?.id) {
        try {
          const fullUser = await apiClient.get<User>(`/users/${me.id}`);
          setUser({
            ...(fullUser as User),
            role: (me.role as any) ?? (fullUser as any).role,
          });
        } catch (innerError) {
          console.error(
            "Failed to load full user profile; using minimal identity",
            innerError,
          );
          setUser({
            id: me.id!,
            firstName: "",
            lastName: "",
            name: "",
            email: "",
            phone: "",
            role: (me.role as any) || "UNKNOWN",
            status: "ACTIVE",
            branchId: (me.branchId as any) || "",
            isActive: true,
            createdAt: "",
            updatedAt: "",
          } as unknown as User);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      const apiError = error as ApiError | undefined;
      if (apiError?.status === 401) {
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
      <div className="h-screen flex bg-gray-50">
        {/* Sidebar */}
        <div className="hidden shrink-0 md:block">
          <Suspense
            fallback={
              <div className="h-full w-64 shrink-0 border-r border-[var(--border)] bg-[var(--sidebar, var(--card))]" />
            }
          >
            <Sidebar />
          </Suspense>
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="hidden md:block">
            <Header />
          </div>
          <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-white px-4 md:hidden">
            <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open clinic navigation"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                aria-describedby={undefined}
                className="left-0 top-0 block h-dvh w-72 max-w-72 translate-x-0 translate-y-0 overflow-y-auto rounded-none p-0"
              >
                <SheetTitle className="sr-only">Clinic navigation</SheetTitle>
                <Suspense>
                  <Sidebar onNavigate={() => setNavigationOpen(false)} />
                </Suspense>
              </SheetContent>
            </Sheet>
            <span className="font-semibold">ClinicMS</span>
          </div>

          {/* Page content */}
          <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </DashboardUserProvider>
  );
}
