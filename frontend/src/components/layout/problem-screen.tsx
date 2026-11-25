import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export function ProblemScreen({
  icon: Icon,
  title,
  description,
  reference,
  role,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  reference?: string;
  role?: 'alert';
  children?: ReactNode;
}) {
  return (
    <div role={role} className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
      </span>
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      {reference && <p className="mt-2 text-xs text-muted-foreground">Reference: {reference}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {children}
        <Button asChild variant={children ? 'outline' : 'default'}>
          {/* A full page load, so a crash on /dashboard itself still resets. */}
          <a href="/dashboard">Go to dashboard</a>
        </Button>
      </div>
    </div>
  );
}
