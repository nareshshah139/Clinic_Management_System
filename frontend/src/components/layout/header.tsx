'use client';

import { useState, type ReactNode } from 'react';
import { UserRole } from '@cms/shared-types';
import dynamic from 'next/dynamic';
import { Search, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReportIssueButton } from '@/components/issue-report/ReportIssueButton';
import { useDashboardUser } from './dashboard-user-context';
import { GlobalSearch } from './global-search';
import { NotificationsMenu } from './notifications-menu';
import { SettingsDialog } from './settings-dialog';

const ReceptionistTour = dynamic(() => import('@/components/tours/ReceptionistTour').then((m) => m.ReceptionistTour), { ssr: false });

export function Header({ leading }: { leading?: ReactNode }) {
  const { user, loading } = useDashboardUser();
  const [phoneSearchOpen, setPhoneSearchOpen] = useState(false);

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-1 border-b border-border bg-card px-3 md:h-16 md:gap-2 md:px-6 lg:gap-4">
      {leading}
      <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
        <GlobalSearch role={user?.role} />
      </div>

      <div className="ml-auto flex items-center gap-1 md:gap-2 lg:gap-4">
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search" onClick={() => setPhoneSearchOpen(true)}>
          <Search className="h-5 w-5" />
        </Button>
        {user?.role === UserRole.RECEPTION && (
          <div className="md:mr-2 md:border-r md:border-border md:pr-2 max-lg:[&_span]:hidden">
            <ReceptionistTour />
          </div>
        )}

        <ReportIssueButton />
        <NotificationsMenu />
        <SettingsDialog />

        <div className="hidden items-center space-x-2 lg:flex">
          <div className="h-8 w-8 rounded-full bg-info-soft flex items-center justify-center">
            <User className="h-4 w-4 text-info-text" />
          </div>
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {loading ? 'Loading…' : `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Unknown User'}
            </p>
          </div>
        </div>
      </div>

      {phoneSearchOpen && (
        <div className="absolute inset-0 z-10 flex items-center gap-1 bg-card px-3 md:hidden">
          <GlobalSearch role={user?.role} autoFocus className="max-w-none" onNavigate={() => setPhoneSearchOpen(false)} />
          <Button variant="ghost" size="icon" aria-label="Close search" onClick={() => setPhoneSearchOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}
    </header>
  );
}
