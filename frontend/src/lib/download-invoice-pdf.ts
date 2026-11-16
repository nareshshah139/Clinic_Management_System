/**
 * @cc [owner:nareshshah139,label:product] printable-invoice-pdf
 * The download MUST contain the supplied document's printable body and omit no-print controls.
 * Temporary DOM nodes MUST be removed after success or failure.
 */
export async function downloadInvoicePdf(sourceDocument: Document, invoiceNumber: string): Promise<void> {
  const source = sourceDocument.body.cloneNode(true) as HTMLElement;
  source.querySelectorAll('.no-print, script, iframe, object, embed').forEach(element => element.remove());
  source.querySelectorAll('*').forEach(element => {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name);
    }
  });
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  const wrapper = document.createElement('div');
  wrapper.style.width = '210mm';
  const style = document.createElement('style');
  style.textContent = Array.from(sourceDocument.querySelectorAll('style')).map(element => element.textContent || '').join('\n');
  wrapper.append(style, source);
  host.appendChild(wrapper);
  document.body.appendChild(host);
  try {
    const { default: html2pdf } = await import('html2pdf.js');
    const safeNumber = invoiceNumber.replace(/[^a-zA-Z0-9._-]/g, '_') || 'invoice';
    await html2pdf().set({
      margin: 0,
      filename: `pharmacy-invoice-${safeNumber}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    } as any).from(wrapper).save();
  } finally {
    host.remove();
  }
}
