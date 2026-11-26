import { billLineName } from '@/lib/bill-line-name';
import { displayCalendarDate, displayClinicDate, displayUtcDate } from '@/lib/date-display';
import { getGlobalPrintStyleTag } from '@/lib/printStyles';
import { billNumberLabel } from '@/lib/bill-number';

export type ClinicIdentity = {
  name: string;
  address?: string;
  phone?: string;
  gstin?: string;
  drugLicence?: string;
};

type Column = { label: string; align?: 'center' | 'right'; width?: string };
type Table = { columns: Column[]; rows: string[][]; caption?: string };
type PrintDocument = {
  title: string;
  meta: [string, string][];
  party: string[];
  table: Table;
  totals: [string, string][];
  grandTotal: [string, string];
  grandNote?: string;
  amountInWords?: string | null;
  taxTable?: Table | null;
  notes?: string;
  clinic?: ClinicIdentity | null;
  printButton?: boolean;
};

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * @cc [owner:nareshshah139,label:security] escape-invoice-print-fields
 * Invoice and patient text MUST be escaped before it is inserted into print or PDF HTML.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ENTITIES[char]);
}

export function formatRupees(value: unknown): string {
  const amount = Number(value) || 0;
  const text = Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? '-' : ''}₹${text}`;
}

const percent = (value: unknown) => `${Number(value) || 0}%`;

function clinicHeader(clinic?: ClinicIdentity | null) {
  if (!clinic?.name) return '';
  const lines = [
    clinic.address,
    clinic.phone && `Phone: ${clinic.phone}`,
    [clinic.gstin && `GSTIN: ${clinic.gstin}`, clinic.drugLicence && `Drug licence: ${clinic.drugLicence}`].filter(Boolean).join(' · '),
  ].filter(Boolean);
  return `<div class="clinic"><div class="clinic-name">${escapeHtml(clinic.name)}</div>${lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`;
}

function renderTable({ columns, rows, caption }: Table) {
  const align = (column: Column) => `text-align:${column.align ?? 'left'}`;
  const head = columns
    .map((column) => `<th style="${align(column)}${column.width ? `;width:${column.width}` : ''}">${escapeHtml(column.label)}</th>`)
    .join('');
  const body = rows.map((row) => `<tr>${row.map((value, index) => `<td style="${align(columns[index])}">${escapeHtml(value)}</td>`).join('')}</tr>`).join('');
  return `<table>${caption ? `<caption>${escapeHtml(caption)}</caption>` : ''}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderPrintDocument(doc: PrintDocument): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(doc.title)}</title>
    ${getGlobalPrintStyleTag()}
    <style>
      @media print { body { margin: 12mm; } .no-print { display: none; } }
      body { font-family: var(--print-font); padding: 20px; max-width: 800px; margin: 0 auto; color: var(--print-ink); }
      .clinic { text-align: center; margin-bottom: 12px; font-size: 14px; line-height: 1.5; }
      .clinic-name { font-size: 22px; font-weight: bold; }
      h1 { margin: 0 0 8px; font-size: 20px; }
      .header { border-bottom: 2px solid var(--print-ink); padding-bottom: 12px; margin-bottom: 16px; }
      .meta { font-size: 14px; line-height: 1.6; }
      .party { margin: 16px 0; padding: 12px; background: var(--print-surface); border-radius: 4px; line-height: 1.6; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid var(--print-rule); padding: 6px; font-variant-numeric: tabular-nums; }
      th { background: var(--print-surface); }
      .totals { margin-top: 16px; text-align: right; line-height: 1.8; font-variant-numeric: tabular-nums; }
      .grand { font-size: 20px; font-weight: bold; border-top: 2px solid var(--print-ink); padding-top: 8px; margin-top: 8px; }
      .notes { margin-top: 16px; padding: 12px; background: var(--print-surface); border-radius: 4px; }
      caption { text-align: left; font-weight: bold; margin-bottom: 4px; }
      .words { font-size: 14px; color: var(--print-muted); }
      .print-button { margin: 16px 0; padding: 10px 20px; background: var(--print-accent); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; }
    </style>
  </head>
  <body>
    ${clinicHeader(doc.clinic)}
    <div class="header">
      <h1>${escapeHtml(doc.title)}</h1>
      <div class="meta">${doc.meta.map(([label, value]) => `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}`).join('<br/>')}</div>
    </div>
    <div class="party"><strong>Bill to:</strong><br/>${doc.party.map(escapeHtml).join('<br/>')}</div>
    ${doc.printButton ? '<button class="print-button no-print" onclick="window.print()">Print</button>' : ''}
    ${renderTable(doc.table)}
    <div class="totals">
      ${doc.totals.map(([label, value]) => `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`).join('')}
      <div class="grand"><strong>${escapeHtml(doc.grandTotal[0])}:</strong> ${escapeHtml(doc.grandTotal[1])}</div>
      ${doc.grandNote ? `<div class="words">${escapeHtml(doc.grandNote)}</div>` : ''}
      ${doc.amountInWords ? `<div class="words">${escapeHtml(doc.amountInWords)}</div>` : ''}
    </div>
    ${doc.taxTable ? renderTable(doc.taxTable) : ''}
    ${doc.notes ? `<div class="notes"><strong>Notes:</strong><br/>${escapeHtml(doc.notes)}</div>` : ''}
  </body>
</html>`;
}

type PrintBatch = { batchNumber?: string | null; expiryDate?: string | null };
type PrintLine = {
  name: string;
  hsnCode?: string | null;
  batchAllocations?: PrintBatch[];
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
  totalAmount: number;
};
type GstSlab = { taxPercent: number; taxableAmount: number; cgst: number; sgst: number; igst: number; totalTax: number };

/** The shape `GET /pharmacy/invoices/:id/print-data` returns; every printed pharmacy bill renders from it. */
export type PharmacyBillPrint = {
  copyType?: 'ORIGINAL' | 'DUPLICATE';
  invoice: {
    invoiceNumber?: string | null;
    status?: string | null;
    invoiceDate?: string | null;
    createdAt?: string | null;
    revisedAt?: string | null;
    subtotal: number;
    discountAmount?: number;
    billDiscountKind?: string | null;
    billDiscountValue?: number | null;
    billDiscountAmount?: number;
    taxAmount: number;
    totalAmount: number;
    amountInWords?: string | null;
    notes?: string | null;
  };
  branch?: { name?: string | null; address?: string | null; phone?: string | null; gstNumber?: string | null; drugLicenseNumber?: string | null } | null;
  patient?: { name?: string | null; phone?: string | null; address?: string | null } | null;
  lines: PrintLine[];
  gstSummary?: GstSlab[];
};

function clinicOf(branch: PharmacyBillPrint['branch']): ClinicIdentity | null {
  if (!branch?.name) return null;
  return {
    name: branch.name,
    address: branch.address ?? undefined,
    phone: branch.phone ?? undefined,
    gstin: branch.gstNumber ?? undefined,
    drugLicence: branch.drugLicenseNumber ?? undefined,
  };
}

const batchText = (batches: PrintBatch[] = []) =>
  batches
    .filter((batch) => batch.batchNumber)
    .map((batch) => `${batch.batchNumber}${batch.expiryDate ? ` (exp ${displayUtcDate(batch.expiryDate)})` : ''}`)
    .join(', ');

function taxTable(slabs: GstSlab[] = []): Table | null {
  if (!slabs.length) return null;
  const interstate = slabs.some((slab) => slab.igst > 0);
  const split: Column[] = interstate ? [{ label: 'IGST', align: 'right' }] : [{ label: 'CGST', align: 'right' }, { label: 'SGST', align: 'right' }];
  return {
    caption: 'GST summary',
    columns: [{ label: 'GST %', align: 'right' }, { label: 'Taxable', align: 'right' }, ...split, { label: 'Total tax', align: 'right' }],
    rows: slabs.map((slab) => [
      percent(slab.taxPercent),
      formatRupees(slab.taxableAmount),
      ...(interstate ? [formatRupees(slab.igst)] : [formatRupees(slab.cgst), formatRupees(slab.sgst)]),
      formatRupees(slab.totalTax),
    ]),
  };
}

export function renderPharmacyBillHtml(bill: PharmacyBillPrint, options: { printButton?: boolean } = {}): string {
  const { invoice, lines } = bill;
  const number = billNumberLabel(invoice);
  const billDiscount = Number(invoice.billDiscountAmount) || 0;
  const discount = Number(invoice.discountAmount) || 0;
  const hasHsn = lines.some((line) => line.hsnCode);
  const hasBatch = lines.some((line) => batchText(line.batchAllocations));
  const meta: [string, string][] = [
    ['Invoice #', number],
    ['Date', displayClinicDate(invoice.invoiceDate || invoice.createdAt)],
  ];
  if (bill.copyType && number !== 'Draft') meta.push(['Copy', bill.copyType === 'DUPLICATE' ? 'Duplicate' : 'Original']);
  if (invoice.revisedAt) meta.push(['Revised', displayClinicDate(invoice.revisedAt)]);
  const columns: Column[] = [
    { label: 'Item' },
    ...(hasHsn ? [{ label: 'HSN', width: '72px' }] : []),
    ...(hasBatch ? [{ label: 'Batch', width: '150px' }] : []),
    { label: 'Qty', align: 'center', width: '48px' },
    { label: 'Rate', align: 'right', width: '96px' },
    { label: 'Disc%', align: 'right', width: '56px' },
    { label: 'GST%', align: 'right', width: '56px' },
    { label: 'Amount', align: 'right', width: '110px' },
  ];
  return renderPrintDocument({
    title: number === 'Draft' ? 'Draft bill, not a tax invoice' : `Pharmacy Invoice ${number}`,
    clinic: clinicOf(bill.branch),
    meta,
    party: [bill.patient?.name || 'Walk-in customer', bill.patient?.phone, bill.patient?.address].filter((part): part is string => Boolean(part)),
    table: {
      columns,
      rows: lines.map((line) => [
        line.name,
        ...(hasHsn ? [line.hsnCode || '—'] : []),
        ...(hasBatch ? [batchText(line.batchAllocations) || '—'] : []),
        String(line.quantity ?? ''),
        formatRupees(line.unitPrice),
        percent(line.discountPercent),
        percent(line.taxPercent),
        formatRupees(line.totalAmount),
      ]),
    },
    totals: [
      ['Subtotal', formatRupees(invoice.subtotal)],
      ['Item discount', formatRupees(-(discount - billDiscount))],
      ...(billDiscount > 0
        ? [[invoice.billDiscountKind === 'PERCENT' ? `Bill discount (${invoice.billDiscountValue}%)` : 'Bill discount', formatRupees(-billDiscount)] as [string, string]]
        : []),
    ],
    grandTotal: ['Grand Total', formatRupees(invoice.totalAmount)],
    grandNote: `Includes GST ${formatRupees(invoice.taxAmount)}`,
    amountInWords: invoice.amountInWords,
    taxTable: taxTable(bill.gstSummary),
    notes: invoice.notes || undefined,
    printButton: options.printButton,
  });
}

type StoredLine = Omit<PrintLine, 'name' | 'taxPercent'> & Parameters<typeof billLineName>[0] & { taxPercent: number | null };
type StoredInvoice = PharmacyBillPrint['invoice'] & {
  billingName?: string | null;
  billingPhone?: string | null;
  billingAddress?: string | null;
  patient?: PharmacyBillPrint['patient'];
  items?: StoredLine[];
};

/** A bill as `GET /pharmacy/invoices/:id` or an unsaved draft holds it: no HSN, batches or GST split. */
export function billPrintFromInvoice(invoice: StoredInvoice, items: StoredLine[] = invoice.items ?? []): PharmacyBillPrint {
  return {
    invoice,
    patient: {
      name: invoice.patient?.name || invoice.billingName,
      phone: invoice.patient?.phone || invoice.billingPhone,
      address: invoice.billingAddress || invoice.patient?.address,
    },
    lines: items.map((item) => ({ ...item, name: billLineName(item), taxPercent: item.taxPercent ?? 0 })),
  };
}

const MODE_LABELS: Record<string, string> = {
  CASH: 'Cash', UPI: 'UPI', CARD: 'Card', NETBANKING: 'Net banking', WALLET: 'Wallet', INSURANCE: 'Insurance', CREDIT: 'Credit', OTHER: 'Other',
};

export function renderSaleReceiptHtml(doc: any, clinic?: ClinicIdentity | null): string {
  const payload = doc?.payload ?? {};
  const isReturn = doc?.kind === 'SALES_RETURN';
  const mode = isReturn ? payload.refundMode : payload.paymentMode;
  const lines: any[] = payload.lines ?? [];
  return renderPrintDocument({
    title: `${isReturn ? 'Sales Return' : 'Pharmacy Receipt'} ${doc?.reference || ''}`.trim(),
    clinic,
    meta: [
      [isReturn ? 'Return #' : 'Bill #', doc?.reference || ''],
      ['Date', displayCalendarDate(payload.date, '') || displayClinicDate(doc?.createdAt)],
      [isReturn ? 'Refund mode' : 'Payment mode', mode ? MODE_LABELS[mode] ?? String(mode) : '—'],
    ],
    party: [payload.customerName || 'Walk-in customer', payload.customerPhone].filter(Boolean),
    table: {
      columns: [
        { label: 'Item' },
        { label: 'Batch', width: '110px' },
        { label: 'Qty', align: 'center', width: '64px' },
        { label: 'Rate', align: 'right', width: '110px' },
        { label: 'Amount', align: 'right', width: '120px' },
      ],
      rows: lines.map((line) => [
        line.name || 'Item',
        line.batchNumber || '—',
        String(line.quantity ?? ''),
        formatRupees(line.unitPrice),
        formatRupees(line.total ?? (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)),
      ]),
    },
    totals: [],
    grandTotal: [isReturn ? 'Refund total' : 'Total', formatRupees(doc?.totalAmount ?? lines.reduce((sum, line) => sum + (Number(line.total) || 0), 0))],
    notes: payload.notes || undefined,
    printButton: true,
  });
}

const PRINT_FRAME_LIFETIME_MS = 60_000;

export function printHtml(html: string): Promise<void> {
  document.querySelectorAll('iframe[data-print-frame]').forEach((frame) => frame.remove());
  const frame = document.createElement('iframe');
  frame.dataset.printFrame = 'true';
  frame.title = 'Print preview';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  return new Promise((resolve) => {
    frame.onload = () => {
      const view = frame.contentWindow;
      if (view) {
        setTimeout(() => frame.remove(), PRINT_FRAME_LIFETIME_MS);
        view.focus();
        view.print();
      }
      resolve();
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
