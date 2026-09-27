/** Adapt modern CSS colors in html2canvas's private clone to its RGB parser. */
export function normalizePdfColors(document: Document): void {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const view = document.defaultView;
  if (!context || !view) throw new Error('PDF color conversion is unavailable');
  const cache = new Map<string, string>();
  const properties = ['color', 'background-color', 'border-top-color', 'border-right-color',
    'border-bottom-color', 'border-left-color', 'outline-color', 'text-decoration-color'];
  for (const element of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
    const computed = view.getComputedStyle(element);
    for (const property of properties) {
      const color = computed.getPropertyValue(property);
      if (!/^(oklch|oklab|lab|lch|color|color-mix)\(/.test(color)) continue;
      let rgb = cache.get(color);
      if (!rgb) {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
        rgb = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
        cache.set(color, rgb);
      }
      element.style.setProperty(property, rgb, 'important');
    }
  }
}

/**
 * @cc [owner:nareshshah139,label:product] signature-export-ready
 * Export MUST wait for every selected signature image to decode and fail if any
 * cannot load, rather than silently producing an unsigned document.
 */
export async function waitForSignatureImages(root: HTMLElement): Promise<void> {
  await Promise.all(Array.from(root.querySelectorAll<HTMLImageElement>('img[data-doctor-signature]')).map(async image => {
    await image.decode();
    if (!image.naturalWidth) throw new Error('The signature image could not be loaded. Please retry.');
  }));
}

/** Export each already-paginated preview page once, without re-paginating it. */
export async function renderPrescriptionPages(wrapper: HTMLElement, paperPreset?: string): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const pages = Array.from(wrapper.querySelectorAll<HTMLElement>('.pagedjs_page'));
  if (!pages.length) throw new Error('No rendered prescription pages are available');
  wrapper.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  Object.assign(wrapper.style, { position: 'fixed', left: '-100000px', top: '0', width: paperPreset === 'LETTER' ? '8.5in' : '210mm', background: '#fff' });
  document.body.appendChild(wrapper);
  try {
    await document.fonts.ready;
    await waitForSignatureImages(wrapper);
    const pdf = new jsPDF({ unit: 'mm', format: paperPreset === 'LETTER' ? 'letter' : 'a4', orientation: 'portrait' });
    for (const [index, page] of pages.entries()) {
      const canvas = await html2canvas(page, { scale: 2, useCORS: true, backgroundColor: '#ffffff', onclone: normalizePdfColors });
      if (index > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      canvas.width = canvas.height = 0;
    }
    return pdf.output('blob');
  } finally {
    wrapper.remove();
  }
}
