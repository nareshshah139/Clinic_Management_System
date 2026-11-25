"use client";

import Image from "next/image";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Fragment, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { enumLabel } from "@/lib/labels";
import { useDashboardUser } from "./dashboard-user-context";
import { usePendingItemRequestCount } from "@/components/inventory/use-pending-item-requests";
import { ITEM_REQUEST_APPROVER_ROLES } from "@/lib/inventory-item-requests";
import { can, type Capability } from "@/lib/role-capabilities";
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
  ShoppingBag,
  FileBarChart,
  Wallet,
  ReceiptIndianRupee,
  CreditCard,
} from "lucide-react";
import { FEE_LIST_PATH } from "@/components/appointments/appointment-billing-view";
import { PROCEDURES_PATH, useProcedureMenu } from "@/components/procedures/procedure-access";

type PharmacySidebarSection = "desk" | "counter";

type NavigationItem = {
  name: string;
  section: "Overview" | "Clinical" | "Pharmacy" | "Admin";
  href: string;
  icon: LucideIcon;
  capability: Capability;
  pharmacySection?: PharmacySidebarSection;
};

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
    capability: "dashboard",
  },
  {
    name: "Patients", section: "Clinical",
    href: "/dashboard/patients",
    icon: Users,
    capability: "patients",
  },
  {
    name: "Appointments", section: "Clinical",
    href: "/dashboard/appointments",
    icon: Calendar,
    capability: "appointments",
  },
  {
    name: "Visits", section: "Clinical",
    href: "/dashboard/visits",
    icon: Stethoscope,
    capability: "visits",
  },
  {
    name: "Procedures", section: "Clinical",
    href: PROCEDURES_PATH,
    icon: Activity,
    capability: "procedures",
  },
  {
    name: "Rooms", section: "Clinical",
    href: "/dashboard/rooms",
    icon: MapPin,
    capability: "rooms",
  },
  {
    name: "Pharmacy Desk", section: "Pharmacy",
    href: "/dashboard/pharmacy?section=desk",
    icon: Pill,
    pharmacySection: "desk",
    capability: "pharmacy-desk",
  },
  {
    name: "Pharmacy Counter", section: "Pharmacy",
    href: "/dashboard/pharmacy?section=counter",
    icon: ClipboardCheck,
    pharmacySection: "counter",
    capability: "pharmacy-counter",
  },
  {
    name: "Sales", section: "Pharmacy",
    href: "/dashboard/pharmacy/sales",
    icon: ShoppingBag,
    capability: "pharmacy-sales",
  },
  {
    name: "Inventory", section: "Pharmacy",
    href: "/dashboard/inventory",
    icon: Package,
    capability: "inventory",
  },
  {
    name: "Daily Collection", section: "Pharmacy",
    href: "/dashboard/pharmacy/reports?report=daily-collection",
    icon: Wallet,
    capability: "pharmacy-reports",
  },
  {
    name: "Pharmacy Report", section: "Pharmacy",
    href: "/dashboard/pharmacy/reports",
    icon: FileBarChart,
    capability: "pharmacy-reports",
  },
  {
    name: "Billing", section: "Admin",
    href: "/dashboard/billing",
    icon: CreditCard,
    capability: "billing",
  },
  {
    name: "Reports", section: "Admin",
    href: "/dashboard/reports",
    icon: BarChart3,
    capability: "reports",
  },
  {
    name: "Users", section: "Admin",
    href: "/dashboard/users",
    icon: UserIcon,
    capability: "users",
  },
  {
    name: "Fee list", section: "Admin",
    href: FEE_LIST_PATH,
    icon: ReceiptIndianRupee,
    capability: "fees",
  },
];

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, logout, loading } = useDashboardUser();
  const role = user?.role;
  const pendingItemRequests = usePendingItemRequestCount(ITEM_REQUEST_APPROVER_ROLES.includes(role || ""));

  const showProcedures = useProcedureMenu(role);
  const navigationItems = useMemo(
    () => navigation.filter((item) => (item.href === PROCEDURES_PATH ? showProcedures : can(role, item.capability))),
    [role, showProcedures],
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
      <div className="flex h-16 items-center px-6 border-b border-[var(--border)]">
        <Image src="/linae-name.png" alt="Linaé" width={304} height={112} priority className="h-8 w-auto" />
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
              prefetch={false}
              onMouseEnter={() => router.prefetch(item.href)}
              onFocus={() => router.prefetch(item.href)}
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
              {role ? enumLabel("role", role) : "Unknown Role"}
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
