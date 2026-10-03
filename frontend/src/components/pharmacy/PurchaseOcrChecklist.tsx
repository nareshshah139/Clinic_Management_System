'use client';

import { Button } from '@/components/ui/button';
import { AlertTriangle, Check } from 'lucide-react';
import { PurchaseHelp } from './PurchaseHelp';
import { focusPurchaseField, groupPurchaseOcrFlags, purchaseBlockingIssues, purchaseReviewIssue } from '@/lib/purchase-invoice-review';

export function PurchaseOcrChecklist({ flags, lineIndex, lineId, values, disabled, onResolve, onResolveMany }: {
  flags: string[];
  lineIndex?: number;
  lineId?: string;
  values: Record<string, string>;
  disabled: boolean;
  onResolve: (flag: string) => void;
  onResolveMany?: (flags:string[]) => void;
}) {
  flags = purchaseBlockingIssues(flags);
  if (!flags.length) return null;
  return <div className="space-y-3" aria-label={lineIndex === undefined ? 'Invoice checks' : `Line ${lineIndex + 1} checks`}>
    <ul className="divide-y">
      {groupPurchaseOcrFlags(flags,lineIndex).map((group, index) => {
        const flag=group[0];
        const issue = purchaseReviewIssue(flag, lineIndex);
        const target = issue.target && (lineId && issue.field ? `${lineId}-${issue.target}` : issue.target);
        const value = issue.field ? values[issue.field]?.trim() : undefined;
        const missingValue = !!issue.field && issue.field !== 'manufacturer' && !value;
        const invalidGstin = issue.field === 'distributorGstin' && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value || '');
        const missingDueDate = issue.field === 'billType' && values.billType === 'CREDIT' && !values.dueDate;
        const label = `${lineIndex === undefined ? '' : `line ${lineIndex + 1} `}${issue.label}`;
        return <li key={`${flag}-${index}`} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1 basis-48">
            <div className="flex items-center gap-2"><AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"/><p className="text-sm font-medium">{issue.message}</p><PurchaseHelp label={`${label} check`}>{issue.help}</PurchaseHelp></div>
            {issue.field && <p className="pl-6 text-sm text-muted-foreground">{value || (issue.field === 'manufacturer' ? 'Not provided (optional)' : 'Not entered')}</p>}
            {(missingValue || invalidGstin || missingDueDate) && <p className="pl-6 text-sm text-destructive">Enter a valid {missingDueDate ? 'due date' : issue.label} to confirm.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {target && <a aria-label={issue.requiresUpload ? 'Upload pages for complete invoice' : `Edit ${label}`} className="inline-flex min-h-8 items-center text-sm text-primary underline underline-offset-4" href={`#${target}`} onClick={() => focusPurchaseField(target)}>{issue.requiresUpload ? 'Upload pages' : 'Correct'}</a>}
            {!issue.requiresUpload && <Button type="button" variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal text-left"
              aria-label={`Confirm ${label} checked`}
              disabled={disabled || missingValue || invalidGstin || missingDueDate} onClick={() => onResolveMany ? onResolveMany(group) : group.forEach(flag=>onResolve(flag))}>
              <Check aria-hidden="true" className="h-4 w-4"/> Checked
            </Button>}
          </div>
        </li>;
      })}
    </ul>
  </div>;
}
