import { randomUUID } from 'node:crypto';

const DRAFT_PREFIX = 'DRAFT-';

export const draftBillNumber = () => `${DRAFT_PREFIX}${randomUUID()}`;

export const isIssuedBillNumber = (invoiceNumber: string) => !invoiceNumber.startsWith(DRAFT_PREFIX);

export const billNumberLabel = (invoiceNumber: string) =>
  isIssuedBillNumber(invoiceNumber) ? invoiceNumber : 'Draft';
