'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { AuditLogRegister } from '@/components/audit-logs/AuditLogRegister';
import { AUDIT_LOGS_PATH } from '@/components/audit-logs/audit-log-model';
import { RegisterDenied } from '@/components/register/RegisterGrid';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { can } from '@/lib/role-capabilities';

function AuditLogsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const onParamsChange = (params: URLSearchParams) => {
    const query = params.toString();
    const href = query ? `${AUDIT_LOGS_PATH}?${query}` : AUDIT_LOGS_PATH;
    if (href !== `${window.location.pathname}${window.location.search}`) router.replace(href, { scroll: false });
  };
  const { user, loading } = useDashboardUser();
  const body = loading || !user
    ? <LoadingSkeleton label="Loading the audit log…" />
    : can(user.role, 'audit-logs')
      ? <AuditLogRegister searchParams={searchParams} onParamsChange={onParamsChange} />
      : <RegisterDenied noun="the audit log" />;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader title="Audit log" description="Who changed what in this clinic, and when. Open an entry to see each field before and after." />
      {body}
    </div>
  );
}

export default function AuditLogsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton label="Loading the audit log…" />}>
      <AuditLogsContent />
    </Suspense>
  );
}
