"use client";

import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Fragment, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useDashboardUser } from "./dashboard-user-context";
import { usePendingItemRequestCount } from "@/components/inventory/use-pending-item-requests";
import { ITEM_REQUEST_APPROVER_ROLES } from "@/lib/inventory-item-requests";
import { APPOINTMENT_READ_ROLES, ROOM_READ_ROLES } from "@/lib/appointment-access";
import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  ClipboardCheck,
  Users,
  Package,
  BarChart3,
  User as UserIcon,
  Stethoscope,
  Home,
  LogOut,
  MapPin,
  Activity,
  Pill,
  Mic,
  ShoppingBag,
  FileBarChart,
  Wallet,
} from "lucide-react";

type PharmacySidebarSection = "desk" | "counter";

type NavigationItem = {
  name: string;
  section: "Overview" | "Clinical" | "Pharmacy" | "Admin";
  href: string;
  icon: LucideIcon;
  allowedRoles: string[];
  pharmacySection?: PharmacySidebarSection;
};

/** The roles GET /pharmacy/reports/:reportId admits, so neither report link leads to a refusal. */
const PHARMACY_REPORT_ROLES = ["OWNER", "ADMIN", "MANAGER", "DOCTOR", "PHARMACIST", "ACCOUNTANT"];

/**
 * @cc [owner:nareshshah139,label:product] single-inventory-entry
 * Inventory MUST be the only stock-work menu entry, including for doctors reviewing edits;
 * price/stock approval and reorder targets MUST be reached inside that workspace.
 */
const navigation: NavigationItem[] = [
  {
    name: "Dashboard", section: "Overview",
    href: "/dashboard",
    icon: Home,
    allowedRoles: [
      "OWNER",
      "ADMIN",
      "MANAGER",
      "DOCTOR",
      "NURSE",
      "RECEPTION",
      "PHARMACIST",
      "ACCOUNTANT",
    ],
  },
  {
    name: "Daily Collection", section: "Overview",
    href: "/dashboard/pharmacy/reports?report=daily-collection",
    icon: Wallet,
    allowedRoles: PHARMACY_REPORT_ROLES,
  },
  {
    name: "Patients", section: "Clinical",
    href: "/dashboard/patients",
    icon: Users,
    allowedRoles: ["OWNER", "ADMIN", "MANAGER", "DOCTOR", "NURSE", "RECEPTION"],
  },
  {
    name: "Appointments", section: "Clinical",
    href: "/dashboard/appointments",
    icon: Calendar,
    allowedRoles: APPOINTMENT_READ_ROLES,
  },
  {
    name: "Visits", section: "Clinical",
    href: "/dashboard/visits",
    icon: Stethoscope,
    allowedRoles: ["OWNER", "ADMIN", "MANAGER", "DOCTOR", "NURSE"],
  },
  {
    name: "Procedures", section: "Clinical",
    href: "/dashboard/procedures",
    icon: Activity,
    allowedRoles: ["OWNER", "ADMIN", "MANAGER", "DOCTOR"],
  },
  {
    name: "Rooms", section: "Clinical",
    href: "/dashboard/rooms",
    icon: MapPin,
    allowedRoles: ROOM_READ_ROLES,
  },
  {
    name: "Pharmacy Desk", section: "Pharmacy",
    href: "/dashboard/pharmacy?section=desk",
    icon: Pill,
    pharmacySection: "desk",
    allowedRoles: ["ADMIN", "DOCTOR", "PHARMACIST", "RECEPTION"],
  },
  {
    name: "Pharmacy Counter", section: "Pharmacy",
    href: "/dashboard/pharmacy?section=counter",
    icon: ClipboardCheck,
    pharmacySection: "counter",
    allowedRoles: ["ADMIN", "DOCTOR", "PHARMACIST", "RECEPTION"],
  },
  {
    name: "Sales", section: "Pharmacy",
    href: "/dashboard/pharmacy/sales",
    icon: ShoppingBag,
    allowedRoles: ["OWNER", "ADMIN", "DOCTOR", "PHARMACIST"],
  },
  {
    name: "Inventory", section: "Pharmacy",
    href: "/dashboard/inventory",
    icon: Package,
    allowedRoles: ["OWNER", "ADMIN", "MANAGER", "DOCTOR", "PHARMACIST", "RECEPTION"],
  },
  {
    name: "Pharmacy Report", section: "Pharmacy",
    href: "/dashboard/pharmacy/reports",
    icon: FileBarChart,
    allowedRoles: PHARMACY_REPORT_ROLES,
  },
  {
    name: "Reports", section: "Admin",
    href: "/dashboard/reports",
    icon: BarChart3,
    allowedRoles: ["OWNER", "ADMIN", "MANAGER"],
  },
  {
    name: "Users", section: "Admin",
    href: "/dashboard/users",
    icon: UserIcon,
    allowedRoles: ["OWNER", "ADMIN", "MANAGER"],
  },
  {
    name: "Test Transcribe", section: "Admin",
    href: "/test-transcribe",
    icon: Mic,
    allowedRoles: ["OWNER", "ADMIN", "DOCTOR"],
  },
];

const defaultAllowedRoles = new Set<string>([
  "OWNER",
  "ADMIN",
  "MANAGER",
  "DOCTOR",
  "NURSE",
  "RECEPTION",
  "PHARMACIST",
  "ACCOUNTANT",
]);

const filterNavigationByRole = (
  items: NavigationItem[],
  role: string | undefined,
) => {
  if (!role) {
    return items.filter(
      (item) =>
        item.allowedRoles?.some((r) => defaultAllowedRoles.has(r)) ?? true,
    );
  }

  return items.filter((item) => {
    if (!item.allowedRoles || item.allowedRoles.length === 0) {
      return true;
    }
    return item.allowedRoles.includes(role);
  });
};

function getActivePharmacySection(
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
): PharmacySidebarSection | null {
  if (pathname !== "/dashboard/pharmacy") return null;
  const requested = searchParams.get("section") || searchParams.get("tab");
  return requested === "counter" ? "counter" : "desk";
}

/** A link with a query is active only on that query; a deeper link to the same page wins over the plain one. */
function linkIsActive(
  item: NavigationItem,
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
  activePharmacySection: PharmacySidebarSection | null,
): boolean {
  const [itemPath, query] = item.href.split("?");
  if (item.pharmacySection) return activePharmacySection === item.pharmacySection;
  if (query)
    return pathname === itemPath && [...new URLSearchParams(query).entries()].every(([key, value]) => searchParams.get(key) === value);
  if (itemPath === "/dashboard") return pathname === itemPath;
  return pathname === itemPath || pathname.startsWith(itemPath + "/");
}

/**
 * @cc [owner:nareshshah139,label:product] grouped-navigation-permissions
 * Navigation sections MUST contain only the role-filtered links. Grouping MUST
 * preserve each destination and pharmacy active-section selection.
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, logout, loading } = useDashboardUser();
  const role = user?.role;
  const pendingItemRequests = usePendingItemRequestCount(ITEM_REQUEST_APPROVER_ROLES.includes(role || ""));

  const navigationItems = useMemo(
    () => filterNavigationByRole(navigation, role),
    [role],
  );
  const activePharmacySection = getActivePharmacySection(
    pathname,
    searchParams,
  );

  return (
    <div
      className="flex h-full min-h-0 w-64 flex-col bg-sidebar border-r border-[var(--border)]"
      data-tour="sidebar"
    >
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-[var(--border)]">
        <div className="flex items-center">
          <Stethoscope className="h-8 w-8 text-[var(--primary)]" />
          <span className="ml-2 text-xl font-semibold text-[var(--foreground)]">
            ClinicMS
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navigationItems.map((item, index) => {
          const isActive = linkIsActive(item, pathname, searchParams, activePharmacySection) &&
            !navigationItems.some((other) => other !== item && other.href.startsWith(`${item.href}?`) && linkIsActive(other, pathname, searchParams, activePharmacySection));
          return (
            <Fragment key={item.name}>
              {(index === 0 || navigationItems[index - 1].section !== item.section) && (
                <p className={cn('px-3 pb-1 text-xs font-medium text-muted-foreground', index > 0 && 'pt-5')}>{item.section}</p>
              )}
            <Link
              key={item.name}
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group relative flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-ring"
                  : "text-muted-foreground hover:bg-accent-soft hover:text-foreground",
              )}
            >
              <item.icon
                className={cn(
                  "mr-3 h-5 w-5",
                  isActive
                    ? "text-[var(--accent-foreground)]"
                    : "text-[var(--muted-foreground)] group-hover:text-[var(--primary)]",
                )}
              />
              {item.name}
              {item.href === "/dashboard/inventory" && pendingItemRequests > 0 && (
                <span className="ml-auto rounded-full bg-destructive px-2 text-xs font-semibold text-destructive-foreground" aria-label={`${pendingItemRequests} new item requests waiting for approval`}>
                  {pendingItemRequests}
                </span>
              )}
            </Link>
            </Fragment>
          );
        })}
      </nav>

      {/* User section */}
      <div className="shrink-0 border-t border-border p-4">
        <div className="flex items-center">
          <Avatar className="size-9 shrink-0">
            <AvatarFallback className="bg-accent-soft text-sm font-semibold text-primary">
              {`${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || user?.email?.slice(0, 2).toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="ml-3 min-w-0 flex-1">
            <p className="break-words text-sm font-medium text-[var(--foreground)]">
              {loading
                ? "Loading…"
                : `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
                  user?.email ||
                  "Unknown User"}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {role ?? "Unknown Role"}
            </p>
          </div>
          <button
            className="ml-2 p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            onClick={() => {
              void logout();
            }}
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
