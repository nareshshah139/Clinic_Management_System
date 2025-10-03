'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useDashboardUser } from './dashboard-user-context';
import {
  Calendar,
  Users,
  CreditCard,
  Package,
  BarChart3,
  User as UserIcon,
  Stethoscope,
  Home,
  LogOut,
  MapPin,
  Activity,
  Pill,
  FilePlus2,
  TrendingUp,
} from 'lucide-react';

const navigation = [
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
    name: 'Billing',
    href: '/dashboard/billing',
    icon: CreditCard,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT'],
  },
  {
    name: 'Pharmacy',
    href: '/dashboard/pharmacy',
    icon: Pill,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER', 'PHARMACIST'],
  },
  {
    name: 'Prescription Pad',
    href: '/dashboard/prescriptions',
    icon: FilePlus2,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER', 'DOCTOR'],
  },
  {
    name: 'Inventory',
    href: '/dashboard/inventory',
    icon: Package,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER', 'PHARMACIST'],
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
];

type NavigationItem = (typeof navigation)[number];

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

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, loading } = useDashboardUser();
  const role = user?.role;

  const navigationItems = useMemo(() => filterNavigationByRole(navigation, role), [role]);

  return (
    <div className="flex h-full w-64 flex-col bg-[var(--sidebar, var(--card))] border-r border-[var(--border)]">
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
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
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