import { randomUUID } from 'node:crypto';

const DRAFT_PREFIX = 'DRAFT-';

export const draftBillNumber = () => `${DRAFT_PREFIX}${randomUUID()}`;

/** A bill either holds an issued number or a draft placeholder, which is never shown or counted as a number. */
export const isIssuedBillNumber = (invoiceNumber: string) => !invoiceNumber.startsWith(DRAFT_PREFIX);

export const issuedBillNumber = (invoiceNumber: string): string | null =>
  isIssuedBillNumber(invoiceNumber) ? invoiceNumber : null;

/** Matches bills whose issued number contains the text; draft placeholders never match. */
export const issuedNumberContains = (text: string) => ({
  AND: [
    { invoiceNumber: { contains: text, mode: 'insensitive' as const } },
    { NOT: { invoiceNumber: { startsWith: DRAFT_PREFIX } } },
  ],
});

export const billNumberLabel = (invoiceNumber: string) => issuedBillNumber(invoiceNumber) ?? 'Draft';
