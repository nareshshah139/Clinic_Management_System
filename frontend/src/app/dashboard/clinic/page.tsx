'use client';

import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { WhatsAppCard } from '@/components/clinic/WhatsAppCard';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import type { ClinicBranch } from '@/lib/types';
import { CLINIC_PROFILE_ROLES } from '@/lib/clinic-profile';

function BranchDetails({ branchId }: { branchId: string }) {
  const [branch, setBranch] = useState<ClinicBranch | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.getBranch(branchId).then(setBranch).catch((e) => setError(getErrorMessage(e)));
  }, [branchId]);

  if (error) return <p role="alert" className="text-sm text-destructive-text">Could not load the clinic details: {error}</p>;
  if (!branch) return <LoadingSkeleton label="Loading the clinic details…" variant="cards" />;
  const place = [branch.address, branch.city, branch.state, branch.pincode].filter(Boolean).join(', ');
  return (
    <section aria-label="Clinic details" className="rounded-lg border bg-card p-4 sm:p-6">
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
        <dt className="text-muted-foreground">Name</dt>
        <dd className="font-medium" data-testid="clinic-name">{branch.name}</dd>
        <dt className="text-muted-foreground">Address</dt>
        <dd>{place || 'Not set'}</dd>
        <dt className="text-muted-foreground">Phone</dt>
        <dd>{branch.phone || 'Not set'}</dd>
      </dl>
    </section>
  );
}

export default function ClinicProfilePage() {
  const { user, loading } = useDashboardUser();
  const manager = CLINIC_PROFILE_ROLES.includes(user?.role ?? '');
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Clinic profile" description="The clinic's details as they print on prescriptions, and the WhatsApp number prescriptions are sent from." />
      {loading || !user ? null : manager ? (
        <>
          <BranchDetails branchId={user.branchId} />
          <WhatsAppCard />
        </>
      ) : (
        <EmptyState icon={Lock} title="Only an owner or admin can change the clinic profile." description="Ask your clinic admin to link the clinic WhatsApp here." />
      )}
    </div>
  );
}
