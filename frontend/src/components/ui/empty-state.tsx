import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({ title, description, action, icon: Icon = Inbox, className }: { title: string; description?: string; action?: ReactNode; icon?: LucideIcon; className?: string }) {
  return <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}><Icon className="mb-3 size-8 text-muted-foreground" aria-hidden="true" /><p className="font-medium text-foreground">{title}</p>{description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}{action && <div className="mt-4">{action}</div>}</div>;
}
