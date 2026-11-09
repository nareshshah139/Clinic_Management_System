const DRAFT_PREFIX = 'DRAFT-';

export const isIssuedBillNumber = (invoiceNumber: string | null | undefined): invoiceNumber is string =>
  Boolean(invoiceNumber) && !invoiceNumber!.startsWith(DRAFT_PREFIX);

export const billNumberLabel = (invoice: { invoiceNumber?: string | null; status?: string | null }) =>
  isIssuedBillNumber(invoice.invoiceNumber) && !['DRAFT', 'PENDING'].includes(invoice.status ?? '')
    ? invoice.invoiceNumber
    : 'Draft';
