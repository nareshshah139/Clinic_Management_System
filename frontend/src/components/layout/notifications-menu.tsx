'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiClient } from '@/lib/api';
import { useDashboardUser } from './dashboard-user-context';
import { buildRoleNotifications, canOpenReports, type NotificationItem } from './header-alerts';

const VARIANT_TEXT: Partial<Record<NonNullable<NotificationItem['variant']>, string>> = {
  destructive: 'text-destructive-text',
  warning: 'text-warning-text',
};

/**
 * @cc [owner:nareshshah139,label:accessibility] notification-control-label
 * The notifications control has an accessible name whether or not notifications are present.
 */
export function NotificationsMenu() {
  const router = useRouter();
  const { user, loading } = useDashboardUser();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const userId = user?.id;
  const role = user?.role;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (loading || !userId) return;
      try {
        setFetching(true);
        const alerts = await apiClient.getSystemAlerts<unknown>();
        if (mounted) setItems(buildRoleNotifications(alerts, role));
      } catch {
        if (mounted) setItems([]);
      } finally {
        if (mounted) setFetching(false);
      }
    };
    void load();

    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void load();
    }, 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loading, userId, role]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {items.length > 0 && (
            <Badge
              variant={items.some((n) => n.variant === 'destructive') ? 'destructive' : 'default'}
              className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {items.length > 9 ? '9+' : String(items.length)}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        <DropdownMenuLabel>
          Notifications {fetching ? '• Loading…' : ''}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 && !fetching && (
          <div className="px-3 py-6 text-sm text-muted-foreground">No notifications</div>
        )}
        {items.map((n) => (
          <DropdownMenuItem key={n.id} onClick={n.href ? () => router.push(n.href!) : undefined} className={n.variant ? VARIANT_TEXT[n.variant] : undefined}>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{n.title}</span>
              {n.description && <span className="text-xs text-muted-foreground">{n.description}</span>}
            </div>
          </DropdownMenuItem>
        ))}
        {items.length > 0 && canOpenReports(role) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/dashboard/reports')}>
              View reports & alerts
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
