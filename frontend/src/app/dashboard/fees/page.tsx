'use client';

import { Lock } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ClinicFeeList } from '@/components/billing/ClinicFeeList';
import { FEE_EDITOR_ROLES } from '@/components/appointments/appointment-billing-view';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';

export default function FeesPage() {
  const { user, loading } = useDashboardUser();
  const editor = FEE_EDITOR_ROLES.includes(user?.role ?? '');
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Fee list"
        description="Starting prices for calendar bills, without GST. Bills already made keep their amount."
      />
      {loading ? null : editor ? (
        <ClinicFeeList />
      ) : (
        <EmptyState icon={Lock} title="Only an admin can change the fee list." description="Create bill on the appointments calendar shows the fee for each appointment." />
      )}
    </div>
  );
}
