'use client';

import { createContext, useContext } from 'react';
import { ReviewStatus, reviewColors, type ReviewTone } from '@/components/ui/ReviewStatus';
import type { PurchaseReviewIssue } from '@/lib/purchase-invoice-review';

export const PurchaseFieldReviewContext = createContext<Record<string, ReviewTone>>({});
export const usePurchaseFieldTone = (id: string) => useContext(PurchaseFieldReviewContext)[id];
export { reviewColors };

export function PurchaseFieldStatus({ id }: { id: string }) {
  const tone = usePurchaseFieldTone(id);
  return tone ? <ReviewStatus id={`${id}-review-state`} tone={tone} /> : null;
}

export function purchaseCheckInvalid(issue: PurchaseReviewIssue, values: Record<string, string>) {
  const value = issue.field ? values[issue.field]?.trim() : undefined;
  return !!issue.requiresUpload || (!!issue.field && issue.field !== 'manufacturer' && !value)
    || (issue.field === 'distributorGstin' && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value || ''))
    || (issue.field === 'billType' && values.billType === 'CREDIT' && !values.dueDate);
}

/**
 * @cc [owner:nareshshah139,label:product] checked-value-identity
 * A field confirmation MUST include the displayed value and its dependent values. Changing
 * expiry year, credit due date or supplier identity MUST invalidate the associated confirmation.
 * Flag removal alone MUST NOT invalidate it; unknown-field checks cover all invoice values.
 */
export function purchaseCheckSnapshot(issue: PurchaseReviewIssue, values: Record<string, string>) {
  const dependencies: Record<string, string[]> = {
    expiryMonth: ['expiryMonth', 'expiryYear'], billType: ['billType', 'dueDate'],
    distributorName: ['distributorName', 'distributorGstin'], distributorGstin: ['distributorName', 'distributorGstin'],
  };
  const keys = issue.field ? dependencies[issue.field] || [issue.field] : Object.keys(values).filter(key => key !== 'ocrFlags').sort();
  return JSON.stringify(keys.map(key => [key, values[key] ?? '']));
}
