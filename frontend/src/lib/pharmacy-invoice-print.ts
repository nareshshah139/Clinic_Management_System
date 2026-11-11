import { billLineName } from '@/lib/bill-line-name';
import { displayCalendarDate, displayClinicDate } from '@/lib/date-display';
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
type PrintDocument = {
  title: string;
  meta: [string, string][];
  party: string[];
  columns: Column[];
  rows: string[][];
  totals: [string, string][];
  grandTotal: [string, string];
  notes?: string;
  clinic?: ClinicIdentity | null;
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

function renderPrintDocument(doc: PrintDocument): string {
  const cell = (column: Column, value: string) =>
    `<td style="text-align:${column.align ?? 'left'}">${escapeHtml(value)}</td>`;
  const head = doc.columns
    .map((column) => `<th style="text-align:${column.align ?? 'left'}${column.width ? `;width:${column.width}` : ''}">${escapeHtml(column.label)}</th>`)
    .join('');
  const body = doc.rows.map((row) => `<tr>${row.map((value, index) => cell(doc.columns[index], value)).join('')}</tr>`).join('');
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(doc.title)}</title>
    ${getGlobalPrintStyleTag()}
    <style>
      @media print { body { margin: 12mm; } .no-print { display: none; } }
      body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; color: #1a1a1a; }
      .clinic { text-align: center; margin-bottom: 12px; font-size: 14px; line-height: 1.5; }
      .clinic-name { font-size: 22px; font-weight: bold; }
      h1 { margin: 0 0 8px; font-size: 20px; }
      .header { border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 16px; }
      .meta { font-size: 14px; line-height: 1.6; }
      .party { margin: 16px 0; padding: 12px; background: #f6f6f6; border-radius: 4px; line-height: 1.6; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #ddd; padding: 6px; font-variant-numeric: tabular-nums; }
      th { background: #f2f2f2; }
      .totals { margin-top: 16px; text-align: right; line-height: 1.8; font-variant-numeric: tabular-nums; }
      .grand { font-size: 20px; font-weight: bold; border-top: 2px solid #333; padding-top: 8px; margin-top: 8px; }
      .notes { margin-top: 16px; padding: 12px; background: #f6f6f6; border-radius: 4px; }
      .print-button { margin: 16px 0; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; }
    </style>
  </head>
  <body>
    ${clinicHeader(doc.clinic)}
    <div class="header">
      <h1>${escapeHtml(doc.title)}</h1>
      <div class="meta">${doc.meta.map(([label, value]) => `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}`).join('<br/>')}</div>
    </div>
    <div class="party"><strong>Bill to:</strong><br/>${doc.party.map(escapeHtml).join('<br/>')}</div>
    <button class="print-button no-print" onclick="window.print()">Print</button>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <div class="totals">
      ${doc.totals.map(([label, value]) => `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`).join('')}
      <div class="grand"><strong>${escapeHtml(doc.grandTotal[0])}:</strong> ${escapeHtml(doc.grandTotal[1])}</div>
    </div>
    ${doc.notes ? `<div class="notes"><strong>Notes:</strong><br/>${escapeHtml(doc.notes)}</div>` : ''}
  </body>
</html>`;
}

export function renderPharmacyInvoiceHtml(invoice: any, clinic?: ClinicIdentity | null): string {
  const party = [
    invoice.patient?.name || invoice.billingName || 'N/A',
    invoice.patient?.phone || invoice.billingPhone || 'N/A',
    invoice.billingAddress || invoice.patient?.address || '',
  ].filter(Boolean);
  const number = billNumberLabel(invoice ?? {});
  const billDiscount = Number(invoice?.billDiscountAmount) || 0;
  const discount = Number(invoice?.discountAmount) || 0;
  return renderPrintDocument({
    title: number === 'Draft' ? 'Draft bill, not a tax invoice' : `Pharmacy Invoice ${number}`,
    clinic,
    meta: [
      ['Invoice #', number],
      ['Date', displayClinicDate(invoice.invoiceDate || invoice.createdAt)],
      ['Status', invoice?.status || 'N/A'],
      ...(invoice?.revisedAt ? [['Revised', displayClinicDate(invoice.revisedAt)] as [string, string]] : []),
    ],
    party,
    columns: [
      { label: 'Item' },
      { label: 'Qty', align: 'center', width: '64px' },
      { label: 'Unit Price', align: 'right', width: '110px' },
      { label: 'Disc%', align: 'right', width: '64px' },
      { label: 'Tax%', align: 'right', width: '64px' },
      { label: 'Amount', align: 'right', width: '120px' },
    ],
    rows: (invoice.items || []).map((item: any) => [
      billLineName(item),
      String(item.quantity ?? ''),
      formatRupees(item.unitPrice),
      percent(item.discountPercent),
      percent(item.taxPercent),
      formatRupees(item.totalAmount),
    ]),
    totals: [
      ['Subtotal', formatRupees(invoice.subtotal)],
      ['Item discount', formatRupees(-(discount - billDiscount))],
      ...(billDiscount > 0
        ? [[invoice.billDiscountKind === 'PERCENT' ? `Bill discount (${invoice.billDiscountValue}%)` : 'Bill discount', formatRupees(-billDiscount)] as [string, string]]
        : []),
      ['Tax', formatRupees(invoice.taxAmount)],
    ],
    grandTotal: ['Grand Total', formatRupees(invoice.totalAmount)],
    notes: invoice.notes || undefined,
  });
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
    totals: [],
    grandTotal: [isReturn ? 'Refund total' : 'Total', formatRupees(doc?.totalAmount ?? lines.reduce((sum, line) => sum + (Number(line.total) || 0), 0))],
    notes: payload.notes || undefined,
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
