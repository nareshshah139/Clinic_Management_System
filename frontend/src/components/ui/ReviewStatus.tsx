import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, XCircle } from 'lucide-react';

export type ReviewTone = 'error' | 'warning' | 'success' | 'neutral';
export const reviewColors: Record<ReviewTone, string> = {
  error: 'border-red-600 bg-red-50 text-red-900 dark:border-red-400 dark:bg-red-950 dark:text-red-100',
  warning: 'border-amber-600 bg-amber-50 text-amber-900 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-100',
  success: 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-100',
  neutral: 'border-slate-500 bg-slate-50 text-slate-800 dark:border-slate-400 dark:bg-slate-900 dark:text-slate-100',
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
