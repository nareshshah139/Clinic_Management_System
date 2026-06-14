'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useDashboardUser } from './dashboard-user-context';
import type { LucideIcon } from 'lucide-react';
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
  Receipt,
  TrendingUp,
  Mic,
} from 'lucide-react';

type PharmacySidebarSection = 'desk' | 'counter' | 'billing';

type NavigationItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  allowedRoles: string[];
  pharmacySection?: PharmacySidebarSection;
};

const navigation: NavigationItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: Home,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER', 'DOCTOR', 'NURSE', 'RECEPTION', 'PHARMACIST', 'ACCOUNTANT'],
  },
  {
    name: 'Patients',
    href: '/dashboard/patients',
    icon: Users,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER', 'DOCTOR', 'NURSE', 'RECEPTION'],
  },
  {
    name: 'Appointments',
    href: '/dashboard/appointments',
    icon: Calendar,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER', 'DOCTOR', 'NURSE', 'RECEPTION'],
  },
  {
    name: 'Visits',
    href: '/dashboard/visits',
    icon: Stethoscope,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER', 'DOCTOR', 'NURSE'],
  },
  {
    name: 'Procedures',
    href: '/dashboard/procedures',
    icon: Activity,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER', 'DOCTOR'],
  },
  {
    name: 'Rooms',
    href: '/dashboard/rooms',
    icon: MapPin,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER', 'DOCTOR', 'NURSE', 'RECEPTION'],
  },
  {
    name: 'Pharmacy Desk',
    href: '/dashboard/pharmacy?section=desk',
    icon: Pill,
    pharmacySection: 'desk',
    allowedRoles: ['ADMIN', 'PHARMACIST', 'RECEPTION'],
  },
  {
    name: 'Pharmacy Counter',
    href: '/dashboard/pharmacy?section=counter',
    icon: ClipboardCheck,
    pharmacySection: 'counter',
    allowedRoles: ['ADMIN', 'PHARMACIST', 'RECEPTION'],
  },
  {
    name: 'Pharmacy Billing',
    href: '/dashboard/pharmacy?section=billing',
    icon: Receipt,
    pharmacySection: 'billing',
    allowedRoles: ['ADMIN', 'PHARMACIST', 'RECEPTION'],
  },
  {
    name: 'Inventory',
    href: '/dashboard/inventory',
    icon: Package,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER', 'PHARMACIST', 'RECEPTION'],
  },
  {
    name: 'Stock Predictions',
    href: '/dashboard/stock-predictions',
    icon: TrendingUp,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER', 'PHARMACIST'],
  },
  {
    name: 'Reports',
    href: '/dashboard/reports',
    icon: BarChart3,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER'],
  },
  {
    name: 'Users',
    href: '/dashboard/users',
    icon: UserIcon,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER'],
  },
  {
    name: 'Test Transcribe',
    href: '/test-transcribe',
    icon: Mic,
    allowedRoles: ['OWNER', 'ADMIN', 'DOCTOR'],
  },
];

const defaultAllowedRoles = new Set<string>(['OWNER', 'ADMIN', 'MANAGER', 'DOCTOR', 'NURSE', 'RECEPTION', 'PHARMACIST', 'ACCOUNTANT']);

const filterNavigationByRole = (items: NavigationItem[], role: string | undefined) => {
  if (!role) {
    return items.filter((item) => item.allowedRoles?.some((r) => defaultAllowedRoles.has(r)) ?? true);
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
  searchParams: Pick<URLSearchParams, 'get' | 'has'>,
): PharmacySidebarSection | null {
  if (!pathname.startsWith('/dashboard/pharmacy')) return null;

  if (pathname === '/dashboard/pharmacy/invoices') return 'billing';

  const requested = searchParams.get('section') || searchParams.get('tab') || '';
  if (requested === 'desk' || requested === 'counter' || requested === 'billing') {
    return requested;
  }

  if (requested === 'invoices' || requested === 'payments') return 'billing';

  if (
    searchParams.has('patientId') ||
    searchParams.has('prescriptionId') ||
    searchParams.has('doctorId') ||
    searchParams.has('visitId')
  ) {
    return 'billing';
  }

  return 'desk';
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, logout, loading } = useDashboardUser();
  const role = user?.role;

  const navigationItems = useMemo(() => filterNavigationByRole(navigation, role), [role]);
  const activePharmacySection = getActivePharmacySection(pathname, searchParams);

  return (
    <div className="flex h-full w-64 flex-col bg-[var(--sidebar, var(--card))] border-r border-[var(--border)]" data-tour="sidebar">
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
      <nav className="flex-1 px-4 py-4 space-y-1">
        {navigationItems.map((item) => {
          const itemPath = item.href.split('?')[0];
          const isActive = item.pharmacySection
            ? activePharmacySection === item.pharmacySection
            : itemPath === '/dashboard'
              ? pathname === itemPath
              : pathname === itemPath || pathname.startsWith(itemPath + '/');
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors border',
                isActive
                  ? 'bg-[var(--accent)] text-[var(--accent-foreground)] border-[var(--ring)] shadow-sm'
                  : 'border-transparent text-[var(--muted-foreground)] hover:bg-[var(--accent-soft)] hover:text-[var(--foreground)]'
              )}
            >
              <item.icon
                className={cn(
                  'mr-3 h-5 w-5',
                  isActive ? 'text-[var(--accent-foreground)]' : 'text-[var(--muted-foreground)] group-hover:text-[var(--primary)]'
                )}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-[var(--border)] p-4">
        <div className="flex items-center">
          <div className="h-8 w-8 rounded-full bg-[var(--accent-soft)] flex items-center justify-center">
            <UserIcon className="h-4 w-4 text-[var(--primary)]" />
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-[var(--foreground)]">
              {loading ? 'Loading…' : `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Unknown User'}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">{role ?? 'Unknown Role'}</p>
          </div>
          <button
            className="ml-2 p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            onClick={() => { void logout(); }}
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
