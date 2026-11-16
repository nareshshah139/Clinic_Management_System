import type { ComponentProps } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * @cc [owner:nareshshah139,label:accessibility] spinner-accessible-status
 * A spinner MUST expose its loading label without requiring motion or color.
 * Reduced-motion users MUST receive the same status with animation disabled.
 */
export function Spinner({ className, label = 'Loading…', ...props }: ComponentProps<typeof LoaderCircle> & { label?: string }) {
  return <LoaderCircle className={cn('size-4 shrink-0 animate-spin motion-reduce:animate-none', className)} role="status" aria-label={label} {...props} />;
}
