'use client';

import { Button } from '@/components/ui/button';
import { purchaseBlockingIssues, purchaseReviewIssue } from '@/lib/purchase-invoice-review';

export function PurchaseOcrChecklist({ flags, lineIndex, lineId, values, disabled, onResolve }: {
  flags: string[];
  lineIndex?: number;
  lineId?: string;
  values: Record<string, string>;
  disabled: boolean;
  onResolve: (flag: string) => void;
}) {
  flags = purchaseBlockingIssues(flags);
  if (!flags.length) return null;
  return <div className="space-y-3" aria-label={lineIndex === undefined ? 'Invoice checks' : `Line ${lineIndex + 1} checks`}>
    {lineIndex === undefined && <p className="text-sm text-muted-foreground">Check against the original, then confirm each correction.</p>}
    <ul className="divide-y">
      {flags.map((flag, index) => {
        const issue = purchaseReviewIssue(flag, lineIndex);
        const target = issue.target && (lineId && issue.field ? `${lineId}-${issue.target}` : issue.target);
        const value = issue.field ? values[issue.field]?.trim() : undefined;
        const missingValue = !!issue.field && issue.field !== 'manufacturer' && !value;
        const invalidGstin = issue.field === 'distributorGstin' && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value || '');
        const missingDueDate = issue.field === 'billType' && values.billType === 'CREDIT' && !values.dueDate;
        const label = `${lineIndex === undefined ? '' : `line ${lineIndex + 1} `}${issue.label}`;
        return <li key={`${flag}-${index}`} className="space-y-2 py-3 first:pt-0 last:pb-0">
          <p className="text-sm font-medium">{issue.message}</p>
          {issue.requiresUpload ? <p className="max-w-prose text-sm text-muted-foreground">{issue.help}</p> : <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">How to check</summary><p className="mt-1 max-w-prose">{issue.help}</p></details>}
          <div className="flex flex-wrap items-center gap-3">
            {target && <a className="text-sm text-primary underline underline-offset-4" href={`#${target}`}>Go to {issue.label}</a>}
            {!issue.requiresUpload && <Button type="button" variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal text-left"
              disabled={disabled || missingValue || invalidGstin || missingDueDate} onClick={() => onResolve(flag)}>
              Confirm {label} checked
            </Button>}
          </div>
          {(missingValue || invalidGstin || missingDueDate) && <p className="text-sm text-muted-foreground">Enter a valid {missingDueDate ? 'due date' : issue.label} before confirming this check.</p>}
        </li>;
      })}
    </ul>
  </div>;
}
