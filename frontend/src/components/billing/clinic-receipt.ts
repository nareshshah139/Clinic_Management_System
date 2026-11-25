import { displayClinicDate, displayClinicDateTime } from '@/lib/date-display';
import { downloadInvoicePdf } from '@/lib/download-invoice-pdf';
import { getGlobalPrintStyleTag } from '@/lib/printStyles';
import { escapeHtml, formatRupees, printHtml } from '@/lib/pharmacy-invoice-print';
import { paymentModeLabel } from '@/lib/clinic-payment-modes';
import { KIND_LABEL, STATUS_VIEW, type ClinicReceipt } from './clinic-bill-model';

const row = (cells: string[], tag: 'td' | 'th' = 'td') => `<tr>${cells.map((cell) => `<${tag}>${cell}</${tag}>`).join('')}</tr>`;
const line = (label: string, value: string, className = '') => `<div class="${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;

/**
 * @cc [owner:nareshshah139,label:product;security] clinic-receipt
 * A clinic receipt MUST show the clinic, the patient, the doctor when known, every line, every
 * payment and refund, and what was paid and is still due, with every stored text escaped. A void
 * bill MUST say it is void and why, and show nothing due.
 */
export function renderClinicReceiptHtml({ bill, clinic, items, payments, notes }: ClinicReceipt): string {
  const voided = bill.status === 'CANCELLED';
  const clinicLines = [clinic.address, clinic.phone && `Phone: ${clinic.phone}`, clinic.gstin && `GSTIN: ${clinic.gstin}`].filter(Boolean) as string[];
  const meta: [string, string][] = [
    ['Bill No', bill.billNo],
    ['Date', displayClinicDate(bill.billedAt)],
    ...(bill.doctor ? [['Doctor', bill.doctor.name] as [string, string]] : []),
    ...(bill.kind ? [['For', KIND_LABEL[bill.kind]] as [string, string]] : []),
  ];
  const paymentRows = payments.map((payment) =>
    row([
      escapeHtml(displayClinicDateTime(payment.paidAt)),
      escapeHtml(`${payment.amount < 0 ? 'Refund · ' : ''}${paymentModeLabel(payment.mode)}`),
      escapeHtml(payment.reference ?? ''),
      `<span class="num">${escapeHtml(formatRupees(payment.amount))}</span>`,
    ]),
  );
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(`Receipt ${bill.billNo}`)}</title>
    ${getGlobalPrintStyleTag()}
    <style>
      @media print { body { margin: 12mm; } .no-print { display: none; } }
      body { font-family: var(--print-font); padding: 20px; max-width: 760px; margin: 0 auto; color: var(--print-ink); font-size: 14px; }
      .clinic { text-align: center; line-height: 1.5; margin-bottom: 12px; }
      .clinic-name { font-size: 22px; font-weight: bold; }
      h1 { font-size: 20px; margin: 0 0 8px; display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid var(--print-ink); padding-bottom: 8px; }
      .status { font-size: 14px; border: 1px solid var(--print-ink); border-radius: 4px; padding: 2px 8px; }
      .meta, .party { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 12px 0; }
      .party { padding: 10px; background: var(--print-surface); border-radius: 4px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      caption { text-align: left; font-weight: bold; margin-bottom: 4px; }
      th, td { border: 1px solid var(--print-rule); padding: 6px; text-align: left; font-variant-numeric: tabular-nums; }
      th { background: var(--print-surface); }
      td:last-child, th:last-child, .num { text-align: right; }
      .totals { margin: 12px 0 0 auto; width: 280px; font-variant-numeric: tabular-nums; }
      .totals div { display: flex; justify-content: space-between; padding: 2px 0; }
      .totals .due { font-size: 18px; border-top: 2px solid var(--print-ink); margin-top: 4px; padding-top: 6px; }
      .void, .notes { margin-top: 16px; padding: 10px; border: 1px solid var(--print-ink); border-radius: 4px; }
      .print-button { margin: 12px 0; padding: 8px 16px; font-size: 15px; cursor: pointer; }
    </style>
  </head>
  <body>
    <div class="clinic"><div class="clinic-name">${escapeHtml(clinic.name)}</div>${clinicLines.map((text) => `<div>${escapeHtml(text)}</div>`).join('')}</div>
    <h1><span>Receipt</span><span class="status">${escapeHtml(STATUS_VIEW[bill.status].label)}</span></h1>
    <div class="meta">${meta.map(([label, value]) => `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`).join('')}</div>
    <div class="party"><span>Patient</span><strong>${escapeHtml(bill.patient.name)}</strong>${bill.patient.phone ? `<span>Mobile</span><span>${escapeHtml(bill.patient.phone)}</span>` : ''}</div>
    <button class="print-button no-print" onclick="window.print()">Print</button>
    <table>
      <thead>${row(['Item', 'Qty', 'Rate', 'Amount'], 'th')}</thead>
      <tbody>${items.map((item) => row([escapeHtml(item.name), String(item.qty), escapeHtml(formatRupees(item.unitPrice)), escapeHtml(formatRupees(item.total))])).join('')}</tbody>
    </table>
    <div class="totals">
      ${line('Total', formatRupees(bill.amount))}
      ${line('Paid', formatRupees(bill.paid))}
      ${bill.refunded > 0 ? line('Refunded', formatRupees(bill.refunded)) : ''}
      ${line('Balance due', formatRupees(bill.due), 'due')}
    </div>
    ${paymentRows.length ? `<table><caption>Payments</caption><thead>${row(['Date', 'Mode', 'Reference', 'Amount'], 'th')}</thead><tbody>${paymentRows.join('')}</tbody></table>` : ''}
    ${voided ? `<div class="void"><strong>This bill is void.</strong>${bill.voidReason ? ` Reason: ${escapeHtml(bill.voidReason)}` : ''}</div>` : ''}
    ${notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(notes)}</div>` : ''}
  </body>
</html>`;
}

export function printClinicReceipt(receipt: ClinicReceipt): Promise<void> {
  return printHtml(renderClinicReceiptHtml(receipt));
}

export function downloadClinicReceipt(receipt: ClinicReceipt): Promise<void> {
  return downloadInvoicePdf(new DOMParser().parseFromString(renderClinicReceiptHtml(receipt), 'text/html'), {
    title: 'Clinic receipt',
    invoiceNumber: receipt.bill.billNo,
    patientName: receipt.bill.patient.name,
    date: receipt.bill.billedAt,
  });
}
