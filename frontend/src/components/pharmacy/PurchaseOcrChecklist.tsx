'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { ReviewStatus, reviewColors } from '@/components/ui/ReviewStatus';
import { PurchaseHelp } from './PurchaseHelp';
import { purchaseCheckInvalid, purchaseCheckSnapshot } from './PurchaseFieldReview';
import { focusPurchaseField, groupPurchaseOcrFlags, purchaseBlockingIssues, purchaseReviewIssue } from '@/lib/purchase-invoice-review';

/**
 * @cc [owner:nareshshah139,label:product] ocr-check-color-evidence
 * Missing or invalid flagged values MUST show correction state; unchecked OCR values MUST show
 * review state. Green Checked MUST follow an explicit confirmation of the current values in this
 * editor session. Changed values or reintroduced flags MUST remove that success state.
 */
export function PurchaseOcrChecklist({ flags, lineIndex, lineId, values, disabled, onResolve, onResolveMany }: {
  flags: string[];
  lineIndex?: number;
  lineId?: string;
  values: Record<string, string>;
  disabled: boolean;
  onResolve: (flag: string) => void;
  onResolveMany?: (flags:string[]) => void;
}) {
  const [checked, setChecked] = useState<Record<string, { flags: string[]; snapshot: string }>>({});
  const pending = groupPurchaseOcrFlags(purchaseBlockingIssues(flags), lineIndex);
  const keyFor = (group: string[]) => { const issue = purchaseReviewIssue(group[0], lineIndex); return issue.field || issue.key; };
  const activeKeys = new Set(pending.map(keyFor));
  const groups = [...pending, ...Object.entries(checked).filter(([key]) => !activeKeys.has(key)).map(([, entry]) => entry.flags)];
  if (!groups.length) return null;
  return <div className="space-y-3" aria-label={lineIndex === undefined ? 'Invoice checks' : `Line ${lineIndex + 1} checks`}>
    <ul className="space-y-2">
      {groups.map((group) => {
        const key = keyFor(group), issue = purchaseReviewIssue(group[0], lineIndex);
        const target = issue.target && (lineId && issue.field ? `${lineId}-${issue.target}` : issue.target);
        const value = issue.field ? values[issue.field]?.trim() : undefined;
        const invalid = purchaseCheckInvalid(issue, values);
        const snapshot = purchaseCheckSnapshot(issue, values);
        const verified = !activeKeys.has(key) && checked[key]?.snapshot === snapshot && !invalid;
        const changed = !!checked[key] && checked[key].snapshot !== snapshot;
        const tone = invalid ? 'error' : verified ? 'success' : 'warning';
        const label = `${lineIndex === undefined ? '' : `line ${lineIndex + 1} `}${issue.label}`;
        return <li key={key} data-review-state={tone} className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-md border p-3 ${reviewColors[tone]}`}>
          <div className="min-w-0 flex-1 basis-48">
            <div className="flex flex-wrap items-center gap-2">
              <ReviewStatus tone={tone}>{verified ? 'Checked' : invalid ? 'Needs correction' : changed ? 'Changed — check again' : 'Needs checking'}</ReviewStatus>
              <PurchaseHelp label={`${label} check`}>{issue.help}</PurchaseHelp>
            </div>
            <p className="mt-1 text-sm font-medium">{verified ? `${label[0].toUpperCase()}${label.slice(1)} checked against the original.` : issue.message}</p>
            {issue.field && <p className="mt-1 text-sm break-words">{value || (issue.field === 'manufacturer' ? 'Not provided (optional)' : 'Not entered')}</p>}
            {invalid && !issue.requiresUpload && <p className="mt-1 text-sm">Enter a valid {issue.field === 'billType' && values.billType === 'CREDIT' && !values.dueDate ? 'due date' : issue.label} to confirm.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {target && <a aria-label={issue.requiresUpload ? 'Upload pages for complete invoice' : `Edit ${label}`} className="inline-flex min-h-8 items-center text-sm underline underline-offset-4" href={`#${target}`} onClick={() => focusPurchaseField(target)}>{issue.requiresUpload ? 'Upload pages' : 'Correct'}</a>}
            {!issue.requiresUpload && !verified && <Button type="button" variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal text-left text-foreground"
              aria-label={`Confirm ${label} checked`} disabled={disabled || invalid} onClick={() => {
                setChecked(current => ({ ...current, [key]: { flags: group, snapshot } }));
                if (onResolveMany) onResolveMany(group); else group.forEach(flag => onResolve(flag));
              }}><Check aria-hidden="true" className="h-4 w-4"/> Mark checked</Button>}
          </div>
        </li>;
      })}
    </ul>
  </div>;
}
