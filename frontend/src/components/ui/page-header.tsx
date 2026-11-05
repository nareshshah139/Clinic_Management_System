import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type PageHeaderProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

/**
 * @cc [owner:nareshshah139,label:accessibility] page-heading-hierarchy
 * A page header MUST expose its title as one h1. Optional actions MUST remain
 * reachable in document order when the header wraps on a narrow viewport.
 */
export function PageHeader({ title, description, actions, className, ...props }: PageHeaderProps) {
  return (
    <header className={cn('flex min-w-0 flex-wrap items-start justify-between gap-4', className)} {...props}>
      <div className="min-w-0 space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description && <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
