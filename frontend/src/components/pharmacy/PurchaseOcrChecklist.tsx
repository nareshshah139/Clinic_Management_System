'use client';

import { reviewColors } from '@/components/ui/ReviewStatus';
import { purchaseCheckInvalid, purchaseCheckSnapshot, type PurchaseCheckedFields } from './PurchaseFieldReview';
import { focusPurchaseField, groupPurchaseOcrFlags, purchaseBlockingIssues, purchaseReviewIssue } from '@/lib/purchase-invoice-review';

/**
 * @cc [owner:nareshshah139,label:product] ocr-check-color-evidence
 * Invalid or upload-only values MUST retain their correction route. Valid uncertainty is confirmed
 * by the final whole-invoice action; only explicit corrections with matching dependencies appear checked.
 */
export function PurchaseOcrChecklist({ flags, lineIndex, lineId, values, checked = {} }: {
  flags: string[]; lineIndex?: number; lineId?: string; values: Record<string, string>; checked?: PurchaseCheckedFields;
}) {
  const groups = groupPurchaseOcrFlags(purchaseBlockingIssues(flags), lineIndex);
  if (!groups.length) return null;
  return <ul className="space-y-1 text-sm" aria-label={lineIndex === undefined ? 'Invoice checks' : `Line ${lineIndex + 1} checks`}>
    {groups.map(group => {
      const issue = purchaseReviewIssue(group[0], lineIndex);
      const target = issue.target && (lineId && issue.field ? `${lineId}-${issue.target}` : issue.target);
      const invalid = purchaseCheckInvalid(issue, values);
      const verified = checked[issue.field || issue.key]?.snapshot === purchaseCheckSnapshot(issue, values) && !invalid;
      return <li key={issue.key} data-review-state={invalid ? 'error' : 'warning'} className={`flex flex-wrap items-baseline justify-between gap-2 rounded border px-3 py-2 ${reviewColors[invalid ? 'error' : 'warning']}`}>
        <span>{issue.message} {!invalid && !verified && 'Check against the original before confirming.'}</span>
        {target && <a className="inline-flex min-h-8 items-center underline underline-offset-4" aria-label={issue.requiresUpload ? issue.uploadLabel?.accessibleName || 'Upload pages for complete invoice' : `Edit ${lineIndex === undefined ? '' : `line ${lineIndex + 1} `}${issue.label}`} href={`#${target}`} onClick={() => focusPurchaseField(target)}>{issue.requiresUpload ? issue.uploadLabel?.text || 'Upload pages' : 'Correct'}</a>}
      </li>;
    })}
  </ul>;
}
