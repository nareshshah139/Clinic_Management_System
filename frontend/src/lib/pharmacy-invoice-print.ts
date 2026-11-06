import { displayClinicDate } from '@/lib/date-display';
import { getGlobalPrintStyleTag } from '@/lib/printStyles';

export function renderPharmacyInvoiceHtml(invoice: any): string {
  const dateStr = invoice.invoiceDate ? displayClinicDate(invoice.invoiceDate) : displayClinicDate(invoice.createdAt);
  
  const itemsRows = (invoice.items || []).map((item: any) => {
    const itemName = item.itemType === 'PACKAGE' 
      ? (item.package?.name || 'Unknown Package')
      : (item.drug?.name || 'Unknown Drug');
    
    return `
      <tr>
        <td style="padding:6px;border:1px solid #ddd;">${itemName}</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:center;">${item.quantity}</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${item.unitPrice?.toFixed(2) || '0.00'}</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:right;">${item.discountPercent || 0}%</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:right;">${item.taxPercent || 0}%</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${item.totalAmount?.toFixed(2) || '0.00'}</td>
      </tr>
    `;
  }).join('');

  const patientName = invoice.patient?.name || invoice.billingName || 'N/A';
  const patientPhone = invoice.patient?.phone || invoice.billingPhone || 'N/A';
  const billingAddress = invoice.billingAddress || invoice.patient?.address || '';

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Invoice ${invoice?.invoiceNumber || ''}</title>
        ${getGlobalPrintStyleTag()}
        <style>
          @media print {
            body { margin: 12mm; }
            .no-print { display: none; }
          }
          body { 
            font-family: Arial, sans-serif; 
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
          }
          h1 { 
            margin-bottom: 8px;
            color: #1a1a1a;
          }
          .invoice-header {
            border-bottom: 2px solid #333;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .muted { 
            color: #666;
            font-size: 14px;
          }
          .billing-section {
            margin: 20px 0;
            padding: 15px;
            background: #f9f9f9;
            border-radius: 4px;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 20px;
          }
          th { 
            background: #f5f5f5;
            font-weight: bold;
            padding: 10px 6px !important;
          }
          th, td {
            border: 1px solid #ddd;
          }
          .totals-section {
            margin-top: 20px;
            text-align: right;
            padding: 15px;
            background: #f9f9f9;
            border-radius: 4px;
          }
          .totals-section div {
            margin: 8px 0;
          }
          .grand-total {
            font-size: 20px;
            font-weight: bold;
            color: #1a1a1a;
            border-top: 2px solid #333;
            padding-top: 12px;
            margin-top: 12px;
          }
          .print-button {
            margin: 20px 0;
            padding: 12px 24px;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
          }
          .print-button:hover {
            background: #1d4ed8;
          }
        </style>
      </head>
      <body style="--print-header-height: 28mm;">
        <div class="print-fixed-header">
          <div class="invoice-header">
            <h1>Pharmacy Invoice</h1>
            <div class="muted">
              <strong>Invoice #:</strong> ${invoice?.invoiceNumber || ''}<br/>
              <strong>Date:</strong> ${dateStr}<br/>
              <strong>Status:</strong> ${invoice?.status || 'N/A'}
            </div>
          </div>
        </div>
        <div class="print-content">
        
        <div class="billing-section">
          <strong>Bill To:</strong><br />
          <div style="margin-top: 8px;">
            ${patientName}<br/>
            ${patientPhone}${billingAddress ? '<br/>' + billingAddress : ''}
          </div>
        </div>

        <button class="print-button no-print" onclick="window.print()">🖨️ Print Invoice</button>

        <table>
          <thead>
            <tr>
              <th style="text-align:left;">Item</th>
              <th style="width: 80px;">Qty</th>
              <th style="text-align:right;width: 100px;">Unit Price</th>
              <th style="text-align:right;width: 80px;">Disc%</th>
              <th style="text-align:right;width: 80px;">Tax%</th>
              <th style="text-align:right;width: 120px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <div class="totals-section">
          <div><strong>Subtotal:</strong> ₹${invoice.subtotal?.toFixed(2) || '0.00'}</div>
          <div><strong>Discount:</strong> -₹${invoice.discountAmount?.toFixed(2) || '0.00'}</div>
          <div><strong>Tax:</strong> ₹${invoice.taxAmount?.toFixed(2) || '0.00'}</div>
          <div class="grand-total"><strong>Grand Total:</strong> ₹${invoice.totalAmount?.toFixed(2) || '0.00'}</div>
        </div>

        ${invoice.notes ? `
          <div style="margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 4px;">
            <strong>Notes:</strong><br/>
            ${invoice.notes}
          </div>
        ` : ''}
        </div>
      </body>
    </html>
  `;
}
