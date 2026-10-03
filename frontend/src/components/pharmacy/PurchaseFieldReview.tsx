'use client';

import { createContext, useContext } from 'react';
import { ReviewStatus, reviewColors, type ReviewTone } from '@/components/ui/ReviewStatus';
import { purchaseReviewIssue, type PurchaseReviewIssue } from '@/lib/purchase-invoice-review';

export const PurchaseFieldReviewContext = createContext<Record<string, ReviewTone>>({});
export const usePurchaseFieldTone = (id: string) => useContext(PurchaseFieldReviewContext)[id];
export { reviewColors };

export function PurchaseFieldStatus({ id }: { id: string }) {
  const tone = usePurchaseFieldTone(id);
  return tone ? <ReviewStatus id={`${id}-review-state`} tone={tone} /> : null;
}

/**
 * @cc [owner:nareshshah139,label:validation] purchase-expiry-bounds
 * Expiry checks and draft saves MUST reject missing, noninteger or out-of-range dates:
 * month 1–12 and year 2020–2100 inclusive. Invalid expiry MUST never be confirmable.
 */
export function purchaseExpiryInvalid(month: string, year: string) {
  const m = Number(month), y = Number(year);
  return !Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 2020 || y > 2100;
}

export function purchaseCheckInvalid(issue: PurchaseReviewIssue, values: Record<string, string>) {
  const value = issue.field ? values[issue.field]?.trim() : undefined;
  return !!issue.requiresUpload || (!!issue.field && issue.field !== 'manufacturer' && !value)
    || (issue.field === 'expiryMonth' && purchaseExpiryInvalid(values.expiryMonth, values.expiryYear))
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

export type PurchaseCheckedFields = Record<string, { flags: string[]; snapshot: string }>;

/**
 * @cc [owner:nareshshah139,label:state] changed-checks-remain-pending
 * Values or dependencies that differ from their confirmation MUST restore their OCR flags
 * for counts, field colors, approval guards and saved drafts until checked again.
 * Existing server flags MUST remain pending even when a prior confirmation matches.
 */
export function pendingPurchaseOcrFlags(flags: string[], values: Record<string, string>, checked: PurchaseCheckedFields = {}, lineIndex?: number) {
  const changed = Object.values(checked).flatMap(entry => {
    const issue = purchaseReviewIssue(entry.flags[0], lineIndex);
    return purchaseCheckInvalid(issue, values) || purchaseCheckSnapshot(issue, values) !== entry.snapshot ? entry.flags : [];
  });
  return [...new Set([...flags, ...changed])];
}
