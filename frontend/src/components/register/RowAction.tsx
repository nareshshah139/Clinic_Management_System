'use client';

import { useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function RowAction({
  label,
  hint,
  icon: Icon,
  reason,
  onClick,
  href,
  className,
}: {
  label: string;
  hint: string;
  icon: LucideIcon;
  reason?: string | null;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const reasonId = useId();
  const icon = <Icon aria-hidden="true" className="size-5" />;
  const trigger = reason ? (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-disabled="true"
      aria-describedby={reasonId}
      tabIndex={-1}
      className="size-9 lg:size-8 cursor-not-allowed text-muted-foreground opacity-60 hover:bg-transparent"
    >
      {icon}
    </Button>
  ) : href ? (
    <Button asChild variant="ghost" size="icon" className={cn('size-9 lg:size-8', className)}>
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
        {icon}
      </a>
    </Button>
  ) : (
    <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick} className={cn('size-9 lg:size-8', className)}>
      {icon}
    </Button>
  );
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent>{reason ?? hint}</TooltipContent>
      </Tooltip>
      {reason && <span id={reasonId} className="sr-only">{reason}</span>}
    </>
  );
}
