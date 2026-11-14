import { Badge } from '@/components/ui/badge';
import { statusLabel, statusVariant, type StatusDomain } from '@/lib/status-variants';

export function StatusBadge({ domain, status, className }: { domain: StatusDomain; status: string | null | undefined; className?: string }) {
  return <Badge variant={statusVariant(domain, status)} className={className}>{statusLabel(domain, status)}</Badge>;
}
