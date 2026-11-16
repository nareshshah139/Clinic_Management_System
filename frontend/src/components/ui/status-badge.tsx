import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { statusVariant, type StatusDomain } from '@/lib/status-variants';

export function StatusBadge({ domain, status, children, className }: { domain: StatusDomain; status: string | null | undefined; children?: ReactNode; className?: string }) {
  return <Badge variant={statusVariant(domain, status)} className={className}>{children ?? status ?? 'Unknown'}</Badge>;
}
