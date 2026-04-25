import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { jest } from '@jest/globals';

// Mock API client methods used by PrescriptionBuilder
jest.mock('@/lib/api', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({}),
    getClinicAssets: jest.fn().mockResolvedValue([]),
    getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
    getPrinterProfiles: jest.fn().mockResolvedValue([
      { id: 'prof-1', name: 'Default', isDefault: true, topMarginPx: 170, bottomMarginPx: 45, leftMarginPx: 45, rightMarginPx: 45 },
    ]),
    getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }),
    getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
    autocompletePrescriptionField: jest.fn().mockResolvedValue([]),
    translateTexts: jest.fn().mockResolvedValue({ translations: [] }),
    sharePrescription: jest.fn().mockResolvedValue({}),
    previewDrugInteractions: jest.fn().mockResolvedValue({ interactions: [] }),
  },
}));

// Capture CSS injected for Paged.js via the temp <style> element
let lastPagedCssText: string | null = null;
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const OriginalBlob = Blob;
const blobUrlMap = new Map<string, Blob>();
let blobUrlCounter = 0;

// Mock pagedjs Previewer
jest.mock('pagedjs', () => {
  class PreviewerMock {
    // Simulate Paged.js rendering by building a minimal page structure
    async preview(_content: string, cssArray: any[], container: HTMLElement) {
      const firstCssUrl = Array.isArray(cssArray) ? cssArray[0] : null;
      const firstCssBlob = typeof firstCssUrl === 'string' ? blobUrlMap.get(firstCssUrl) : null;
      lastPagedCssText = firstCssBlob ? await firstCssBlob.text() : null;

      // Build minimal paged structure expected by component after preview
      container.innerHTML = `
        <div class="pagedjs_page">
          <div class="pagedjs_pagebox">
            <div class="pagedjs_page_content page-1-content" style="margin:0;padding:0;height:100px;">
              <div class="page-1-heading">Header</div>
              <div class="rx-row page-1-rx-row">Medication 1</div>
            </div>
          </div>
        </div>
        <div class="pagedjs_page">
          <div class="pagedjs_pagebox">
            <div class="pagedjs_page_content page-2-content" style="margin:0;padding:0;height:100px;">
              <div class="rx-row page-2-rx-row">Medication 2</div>
            </div>
          </div>
        </div>
      `;
      return { pages: 1 } as any;
    }
  }
  return { Previewer: PreviewerMock };
});

// Provide a stable getComputedStyle used by the component
beforeAll(() => {
  window.print = window.print || (() => {});
  window.getComputedStyle = window.getComputedStyle || ((el: Element) => ({
    getPropertyValue: () => '',
    marginTop: '0px',
    marginBottom: '0px',
    paddingTop: '0px',
    paddingBottom: '0px',
  } as any));
});

// Use fake timers to drive debounced effects (250ms + 300ms)
beforeEach(() => {
  jest.useFakeTimers();
  lastPagedCssText = null;
  blobUrlMap.clear();
  blobUrlCounter = 0;
  global.Blob = class MockBlob extends OriginalBlob {
    private readonly rawText: string;

    constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
      super(parts, options);
      this.rawText = Array.isArray(parts) ? parts.map((part) => String(part ?? '')).join('') : '';
    }

    async text() {
      return this.rawText;
    }
  } as typeof Blob;
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof window.requestAnimationFrame;
  URL.createObjectURL = ((blob: Blob) => {
    const url = `blob:mock-${blobUrlCounter++}`;
    blobUrlMap.set(url, blob);
    return url;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = ((url: string) => {
    blobUrlMap.delete(url);
  }) as typeof URL.revokeObjectURL;
  HTMLElement.prototype.getBoundingClientRect = function() {
    if ((this as HTMLElement).classList?.contains('page-1-content')) {
      return {
        x: 0,
        y: 100,
        top: 100,
        left: 0,
        bottom: 500,
        right: 600,
        width: 600,
        height: 400,
        toJSON: () => ({}),
      } as DOMRect;
    }
    if ((this as HTMLElement).classList?.contains('page-1-heading')) {
      return {
        x: 0,
        y: 180,
        top: 180,
        left: 0,
        bottom: 220,
        right: 600,
        width: 600,
        height: 40,
        toJSON: () => ({}),
      } as DOMRect;
    }
    if ((this as HTMLElement).classList?.contains('page-2-content')) {
      return {
        x: 0,
        y: 100,
        top: 100,
        left: 0,
        bottom: 500,
        right: 600,
        width: 600,
        height: 400,
        toJSON: () => ({}),
      } as DOMRect;
    }
    if ((this as HTMLElement).classList?.contains('page-2-rx-row')) {
      return {
        x: 0,
        y: 130,
        top: 130,
        left: 0,
        bottom: 170,
        right: 600,
        width: 600,
        height: 40,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 900,
      right: 1200,
      width: 1200,
      height: 900,
      toJSON: () => ({}),
    } as DOMRect;
  };
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  global.Blob = OriginalBlob;
  window.requestAnimationFrame = originalRequestAnimationFrame;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

// Import after mocks
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';

function pxToMm(px: number): number {
  // Component rounds to 0.1mm: Math.round((px/3.78)*10)/10
  return Math.round((px / 3.78) * 10) / 10;
}

async function openPreview() {
  const btn = await screen.findByText('Print Preview');
  fireEvent.click(btn);
  // Wait until the paged container is present to avoid early-return guard
  await waitFor(() => {
    expect(document.getElementById('pagedjs-container')).toBeTruthy();
  });
}

async function settlePreviewPagination() {
  await act(async () => {
    jest.advanceTimersByTime(400);
  });

  await waitFor(() => {
    expect(document.querySelector('#pagedjs-container .pagedjs_page')).toBeTruthy();
  });
}

describe('PrescriptionBuilder - Paged.js margin wiring', () => {
  it('applies @page margin-top from the Top margin slider (UI -> Paged.js)', async () => {
    render(<PrescriptionBuilder patientId="p1" doctorId="d1" /> as any);

    // Open preview (language defaults to EN, so translation is skipped)
    await openPreview();

    // Move the Top margin slider to a new value (in px)
    const newTopMarginPx = 200; // px
    const expectedMm = pxToMm(newTopMarginPx);

    const sliders = screen.getAllByRole('slider');
    // Slider order: Zoom, Top margin, Bottom margin
    fireEvent.change(sliders[1], { target: { value: String(newTopMarginPx) } });

    await settlePreviewPagination();

    // Verify the Paged.js injected CSS reflects the slider value
    expect(lastPagedCssText).toContain(`margin-top: ${expectedMm}mm`);
  });

  it('injects browser print CSS that isolates the print host and zeroes page margins', async () => {
    render(<PrescriptionBuilder patientId="p2" doctorId="d2" /> as any);

    await openPreview();

    await waitFor(() => {
      const styleTags = Array.from(document.querySelectorAll('style')) as HTMLStyleElement[];
      const dialogStyle = styleTags.find(s => (s.textContent || '').includes('#prescription-print-host'));
      expect(dialogStyle).toBeTruthy();
      expect(dialogStyle!.textContent).toContain('@page {');
      expect(dialogStyle!.textContent).toContain('margin: 0;');
      expect(dialogStyle!.textContent).toContain('body.prescription-preview-printing > *:not(#prescription-print-host)');
      expect(dialogStyle!.textContent).toContain('display: none !important;');
      expect(dialogStyle!.textContent).toContain('body.prescription-preview-printing #prescription-print-host');
      expect(dialogStyle!.textContent).not.toContain('body.prescription-preview-printing > * {');
    });
  });

  it('prints from a temporary body-level host so dialog positioning does not affect browser print', async () => {
    const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {});

    render(<PrescriptionBuilder patientId="p3" doctorId="d3" /> as any);

    await openPreview();
    await settlePreviewPagination();

    fireEvent.click(await screen.findByRole('button', { name: 'Print' }));

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains('prescription-preview-printing')).toBe(true);

    const printHost = document.getElementById('prescription-print-host');
    expect(printHost).toBeTruthy();
    expect(printHost?.querySelector('.prescription-print-pages .pagedjs_page')).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(new Event('afterprint'));
    });

    expect(document.body.classList.contains('prescription-preview-printing')).toBe(false);
    expect(document.getElementById('prescription-print-host')).toBeNull();

    printSpy.mockRestore();
  });

  it('copies the first text offset from page 1 onto continuation pages', async () => {
    render(<PrescriptionBuilder patientId="p4" doctorId="d4" /> as any);

    await openPreview();
    await settlePreviewPagination();

    const pageContents = document.querySelectorAll('#pagedjs-container .pagedjs_page_content');
    expect(pageContents).toHaveLength(2);
    expect((pageContents[0] as HTMLElement).style.transform).toBe('translate(0px, 0px)');
    expect((pageContents[1] as HTMLElement).style.transform).toBe('translate(0px, 50px)');
  });
});
