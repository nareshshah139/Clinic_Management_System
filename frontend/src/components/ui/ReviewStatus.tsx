import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, XCircle } from 'lucide-react';

export type ReviewTone = 'error' | 'warning' | 'success' | 'neutral';
export const reviewColors: Record<ReviewTone, string> = {
  error: 'border-destructive-border bg-destructive-soft text-destructive-text dark:border-destructive-border dark:bg-destructive dark:text-destructive-text',
  warning: 'border-warning-border bg-warning-soft text-warning-text dark:border-warning-border dark:bg-warning dark:text-warning-text',
  success: 'border-success-border bg-success-soft text-success-text dark:border-success-border dark:bg-success dark:text-success-text',
  neutral: 'border-border bg-background text-foreground dark:border-border dark:bg-primary dark:text-muted-foreground',
};
export const reviewLabels: Record<ReviewTone, string> = {
  error: 'Needs correction', warning: 'Needs checking', success: 'Verified', neutral: 'Not checked',
};

/**
 * @cc [owner:nareshshah139,label:accessibility] review-status-redundant-cues
 * Every status MUST pair its semantic color with a distinct icon and a visible label in both
 * themes. Callers MUST supply success only for an explicit confirmation or a known matching
 * comparison, and label comparisons as matches rather than human verification.
 */
export function ReviewStatus({ tone, children, id }: { tone: ReviewTone; children?: ReactNode; id?: string }) {
  const Icon = { error: XCircle, warning: AlertTriangle, success: CheckCircle2, neutral: CircleHelp }[tone];
  return <span id={id} data-review-state={tone} className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-sm font-medium ${reviewColors[tone]}`}>
    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
    <span>{children ?? reviewLabels[tone]}</span>
  </span>;
}

export function ReviewLegend() {
  return <div aria-label="Status colors" className="flex flex-wrap gap-2 text-sm">
    <ReviewStatus tone="error">Correct</ReviewStatus>
    <ReviewStatus tone="warning">Check</ReviewStatus>
    <ReviewStatus tone="success">Checked / matches</ReviewStatus>
  </div>;
}
