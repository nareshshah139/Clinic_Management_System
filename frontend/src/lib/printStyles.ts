// Centralized print CSS for all printable documents (prescriptions, invoices, reports)
// Consumers should inject the returned string inside a <style> tag in the print HTML.

export const GLOBAL_PRINT_CSS = `
@page {
  size: A4 portrait;
  margin: 0; /* content manages its own margins/padding */
}

@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Hide elements marked as no-print */
  .no-print { display: none !important; }

  /* Fixed header repeated on every page */
  .print-fixed-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    z-index: 9999;
  }

  /* Fixed footer (optional); add content-height padding accordingly */
  .print-fixed-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    z-index: 9999;
  }

  /* Page number helper; shows current page number */
  .page-numbers::after {
    content: "Page " counter(page);
    display: block;
    text-align: center;
    font-size: 12px;
    color: #444;
    padding: 4mm 0;
  }

  /* Content area should account for fixed header/footer heights */
  .print-content {
    /* Adjust these paddings to match your header/footer heights */
    padding-top: var(--print-header-height, 32mm);
    padding-bottom: var(--print-footer-height, 0mm);
  }

  /* Page-break helpers */
  .pb-before-page { break-before: page !important; page-break-before: always !important; }
  .pb-avoid-break { break-inside: avoid !important; page-break-inside: avoid !important; }
  .pb-after-page { break-after: page !important; page-break-after: always !important; }

  /* Tables: repeat header, keep rows intact */
  table { page-break-inside: auto; border-collapse: collapse; width: 100%; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th, td { page-break-inside: avoid; break-inside: avoid; }
}

/* Screen preview helpers: show page outline when previewing in-app */
.print-page-preview {
  width: 210mm;
  min-height: 297mm; /* allow growth for multi-page stack previews */
  background: white;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
  margin: 0 auto 12px auto;
}
`;

/**
 * Returns a full <style> tag string with global print CSS, plus any extra rules appended.
 */
export function getGlobalPrintStyleTag(extraCss?: string): string {
  const css = extraCss ? `${GLOBAL_PRINT_CSS}\n${extraCss}` : GLOBAL_PRINT_CSS;
  return `<style>${css}</style>`;
}

/**
 * Ensures the global print CSS is injected into document.head exactly once.
 * Safer than injecting a <style> tag inside the body for consistent print engines.
 */
export function ensureGlobalPrintStyles(extraCss?: string): void {
  if (typeof document === 'undefined') return;
  const STYLE_ID = 'global-print-css';
  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  const css = extraCss ? `${GLOBAL_PRINT_CSS}\n${extraCss}` : GLOBAL_PRINT_CSS;
  if (styleEl.textContent !== css) {
    styleEl.textContent = css;
  }
}


