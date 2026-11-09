/**
 * @cc [owner:nareshshah139,label:product] printable-invoice-pdf
 * The download MUST contain the supplied document's printable body and omit no-print controls.
 * Temporary DOM nodes MUST be removed after success or failure.
 */
/**
 * @cc [owner:nareshshah139,label:reliability] invoice-pdf-modern-colors
 * Unsupported computed theme colors MUST be resolved in the render clone without changing the live page.
 */
export async function downloadInvoicePdf(sourceDocument: Document, invoiceNumber: string): Promise<void> {
  const source = sourceDocument.body.cloneNode(true) as HTMLElement;
  source.querySelectorAll('.no-print, script, iframe, object, embed').forEach(element => element.remove());
  [source, ...Array.from(source.querySelectorAll('*'))].forEach(element => {
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
  wrapper.style.color = '#000000';
  wrapper.style.backgroundColor = '#ffffff';
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
      html2canvas: {
        scale: 2, useCORS: true, letterRendering: true,
        onclone: (clonedDocument: Document, clonedElement: HTMLElement) => {
          clonedDocument.documentElement.style.setProperty('background-color', '#ffffff', 'important');
          clonedDocument.body.style.setProperty('background-color', '#ffffff', 'important');
          // html2canvas cannot parse modern CSS colors. Resolve only unsupported computed
          // colors in its detached clone, preserving the application's live theme.
          const canvas = clonedDocument.createElement('canvas');
          canvas.width = canvas.height = 1;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Unable to prepare invoice colors');
          const properties = ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'text-decoration-color'];
          for (const el of [clonedElement, ...Array.from(clonedElement.querySelectorAll('*'))]) {
            const computed = clonedDocument.defaultView!.getComputedStyle(el);
            for (const property of properties) {
              const value = computed.getPropertyValue(property);
              if (!value.includes('oklch(') && !value.includes('oklab(')) continue;
              context.clearRect(0, 0, 1, 1);
              context.fillStyle = value;
              context.fillRect(0, 0, 1, 1);
              const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
              (el as HTMLElement).style.setProperty(property, `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`, 'important');
            }
          }
        },
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    } as any).from(wrapper).save();
  } finally {
    host.remove();
  }
}
