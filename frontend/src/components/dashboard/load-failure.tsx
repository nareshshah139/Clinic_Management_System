import { AlertTriangle } from 'lucide-react';
import type { ApiError } from '@/lib/api';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

export type LoadFailure = 'forbidden' | 'unavailable';

export const loadFailure = (error: unknown): LoadFailure =>
  (error as ApiError)?.status === 403 ? 'forbidden' : 'unavailable';

export function LoadFailureState({ failure, subject, onRetry }: { failure: LoadFailure; subject: string; onRetry: () => void }) {
  return (
    <div role="alert">
      <EmptyState
        icon={AlertTriangle}
        title={`Couldn't load ${subject}`}
        description={
          failure === 'forbidden'
            ? 'Your account does not have access to this yet. Ask an admin to check your role permissions.'
            : 'This is not an empty list. Check your connection and try again.'
        }
        action={<Button variant="outline" onClick={onRetry}>Try again</Button>}
      />
    </div>
  );
}
