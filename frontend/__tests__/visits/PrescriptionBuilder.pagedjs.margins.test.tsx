import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { jest } from '@jest/globals';

// Mock API client methods used by PrescriptionBuilder
jest.mock('@/lib/api', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({}),
    createPrescription: jest.fn().mockResolvedValue({ id: "saved-rx" }),
    patch: jest.fn().mockResolvedValue({ id: "saved-rx" }),
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

const mockPdfOutput = jest.fn().mockResolvedValue(new Blob(['pdf']));
jest.mock('html2pdf.js', () => ({ __esModule: true, default: () => ({
  set() { return this; }, from() { return this; }, outputPdf: mockPdfOutput,
}) }));

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
import { apiClient } from '@/lib/api';

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

    render(<PrescriptionBuilder patientId="p3" doctorId="d3" onBeforeExport={async () => "v3"} /> as any);

    await openPreview();
    await settlePreviewPagination();

    fireEvent.click(await screen.findByRole('button', { name: 'Print' }));

    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
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
    expect((pageContents[1] as HTMLElement).style.transform).toBe('translate(0px, 86px)');
  });
});


describe('saving before prescription export', () => {
  it('waits for the visit save before generating a PDF, including visits without medication', async () => {
    mockPdfOutput.mockClear();
    let confirmSave!: (id: string) => void;
    const onBeforeExport = jest.fn(() => new Promise<string>(resolve => { confirmSave = resolve; }));
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<PrescriptionBuilder patientId="pdf-patient" visitId="visit" doctorId="doctor" onBeforeExport={onBeforeExport} />);
    await openPreview();
    await settlePreviewPagination();
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(onBeforeExport).toHaveBeenCalledTimes(1);
    expect(mockPdfOutput).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    await act(async () => confirmSave('visit'));
    await waitFor(() => expect(mockPdfOutput).toHaveBeenCalledTimes(1));
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it.each(['Download PDF', 'PDF via WhatsApp', 'Print'])('blocks %s when the visit save fails', async (action) => {
    mockPdfOutput.mockClear();
    const print = jest.spyOn(window, 'print').mockImplementation(() => {});
    const onBeforeExport = jest.fn(async () => { throw new Error('Save failed'); });
    render(<PrescriptionBuilder patientId="failed-patient" visitId="visit" doctorId="doctor" onBeforeExport={onBeforeExport} />);
    await openPreview();
    await settlePreviewPagination();
    fireEvent.click(screen.getByRole('button', { name: action }));
    await waitFor(() => expect(onBeforeExport).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(mockPdfOutput).not.toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
    print.mockRestore();
  });
});

it('saves medications before PDF output and updates the same prescription on another export', async () => {
  const createRx = jest.spyOn(apiClient, 'createPrescription').mockResolvedValue({ id: 'saved-rx' } as any);
  const patchRx = jest.spyOn(apiClient, 'patch').mockResolvedValue({ id: 'saved-rx' });
  mockPdfOutput.mockClear();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  localStorage.setItem('rxDraft:med-patient:visit', JSON.stringify({ items: [{ drugName: 'Synthetic medicine', dosage: 10, dosageUnit: 'MG', frequency: 'ONCE_DAILY', duration: 7, durationUnit: 'DAYS' }] }));
  const onBeforeExport = jest.fn(async () => 'visit');
  render(<PrescriptionBuilder patientId="med-patient" visitId="visit" doctorId="doctor" onBeforeExport={onBeforeExport} />);
  await openPreview();
  await settlePreviewPagination();
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await act(async () => {});
  await waitFor(() => expect(mockPdfOutput).toHaveBeenCalledTimes(1));
  expect(apiClient.createPrescription).toHaveBeenCalledWith(expect.objectContaining({ visitId: 'visit', items: expect.arrayContaining([expect.objectContaining({ drugName: 'Synthetic medicine' })]) }));
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await waitFor(() => expect(mockPdfOutput).toHaveBeenCalledTimes(2));
  expect(apiClient.patch).toHaveBeenCalledWith('/prescriptions/saved-rx', expect.objectContaining({ visitId: 'visit' }));
  expect(onBeforeExport).toHaveBeenCalledTimes(2);
  click.mockRestore();
  localStorage.removeItem('rxDraft:med-patient:visit');
  createRx.mockRestore();
  patchRx.mockRestore();
});

it('does not export when medication saving fails after the visit save succeeds', async () => {
  mockPdfOutput.mockClear();
  const createRx = jest.spyOn(apiClient, 'createPrescription').mockRejectedValue(new Error('Prescription save failed'));
  localStorage.setItem('rxDraft:rx-failure:visit', JSON.stringify({ items: [{ drugName: 'Synthetic medicine', frequency: 'ONCE_DAILY', dosage: 10, dosageUnit: 'MG', duration: 7, durationUnit: 'DAYS' }] }));
  render(<PrescriptionBuilder patientId="rx-failure" visitId="visit" doctorId="doctor" onBeforeExport={async () => 'visit'} />);
  await openPreview();
  await settlePreviewPagination();
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await waitFor(() => expect(createRx).toHaveBeenCalled());
  await act(async () => {});
  expect(mockPdfOutput).not.toHaveBeenCalled();
  expect(localStorage.getItem('rxDraft:rx-failure:visit')).toContain('Synthetic medicine');
  createRx.mockRestore();
  localStorage.removeItem('rxDraft:rx-failure:visit');
});

it('normalizes legacy draft medication values before export', async () => {
  mockPdfOutput.mockClear();
  const createRx = jest.spyOn(apiClient, 'createPrescription').mockResolvedValue({ id: 'saved-rx' } as any);
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  localStorage.setItem('rxDraft:legacy-draft:visit', JSON.stringify({
    items: [{
      drugName: 'Legacy medicine',
      frequency: { label: 'ONCE_DAILY' },
      duration: 7,
      durationUnit: { label: 'DAYS' },
      dosageUnit: { label: 'MG' },
    }],
  }));

  render(<PrescriptionBuilder patientId="legacy-draft" visitId="visit" doctorId="doctor" onBeforeExport={async () => 'visit'} />);
  await openPreview();
  await settlePreviewPagination();
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));

  await waitFor(() => expect(apiClient.createPrescription).toHaveBeenCalledWith(
    expect.objectContaining({
      items: expect.arrayContaining([
        expect.objectContaining({ frequency: 'ONCE_DAILY', durationUnit: 'DAYS', dosageUnit: 'TABLET' }),
      ]),
    }),
  ));
  click.mockRestore();
  createRx.mockRestore();
  localStorage.removeItem('rxDraft:legacy-draft:visit');
});
