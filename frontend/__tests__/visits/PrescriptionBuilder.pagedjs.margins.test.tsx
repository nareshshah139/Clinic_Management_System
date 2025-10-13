import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { jest } from '@jest/globals';

// Mock API client methods used by PrescriptionBuilder
jest.mock('@/lib/api', () => ({
  apiClient: {
    getClinicAssets: jest.fn().mockResolvedValue([]),
    getPrinterProfiles: jest.fn().mockResolvedValue([
      { id: 'prof-1', name: 'Default', isDefault: true, topMarginPx: 170, bottomMarginPx: 45, leftMarginPx: 45, rightMarginPx: 45 },
    ]),
    getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
    translateTexts: jest.fn().mockResolvedValue({ translations: [] }),
    sharePrescription: jest.fn().mockResolvedValue({}),
    previewDrugInteractions: jest.fn().mockResolvedValue({ interactions: [] }),
  },
}));

// Capture CSS injected for Paged.js via the temp <style> element
let lastPagedCssText: string | null = null;

// Mock pagedjs Previewer
jest.mock('pagedjs', () => {
  class PreviewerMock {
    // Simulate Paged.js rendering by building a minimal page structure
    async preview(tempDiv: HTMLElement, _cssArray: any[], container: HTMLElement) {
      const styleEl = tempDiv.querySelector('style');
      lastPagedCssText = styleEl ? (styleEl.textContent || '') : null;

      // Build minimal paged structure expected by component after preview
      container.innerHTML = `
        <div class="pagedjs_page">
          <div class="pagedjs_pagebox">
            <div class="pagedjs_page_content" style="margin:0;padding:0;height:100px;"></div>
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
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
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

describe('PrescriptionBuilder - Paged.js margin wiring', () => {
  it('applies @page margin-top from the Top margin slider (UI -> Paged.js)', async () => {
    render(<PrescriptionBuilder patientId="p1" doctorId="d1" /> as any);

    // Open preview (language defaults to EN, so translation is skipped)
    await openPreview();

    // Move the Top margin slider to a new value (in px)
    const newTopMarginPx = 200; // px
    const expectedMm = pxToMm(newTopMarginPx);

    const sliders = screen.getAllByRole('slider');
    // First slider is Top margin per component layout
    fireEvent.change(sliders[0], { target: { value: String(newTopMarginPx) } });

    // Debounced effects
    await act(async () => {
      jest.advanceTimersByTime(250); // previewJustUpdated debounce
      jest.advanceTimersByTime(300); // Paged.js debounce
    });

    // Verify the Paged.js injected CSS reflects the slider value
    expect(lastPagedCssText).toContain(`margin-top: ${expectedMm}mm`);
  });

  it('syncs preview dialog padding-top with effective top margin (UI -> Dialog CSS)', async () => {
    render(<PrescriptionBuilder patientId="p2" doctorId="d2" /> as any);

    await openPreview();

    // Change the Top margin slider again
    const newTopMarginPx = 140;
    const expectedMm = pxToMm(newTopMarginPx);
    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: String(newTopMarginPx) } });

    await act(async () => {
      jest.advanceTimersByTime(250);
      jest.advanceTimersByTime(300);
    });

    // Find the dialog style tag that contains rules for #prescription-print-root
    await waitFor(() => {
      const styleTags = Array.from(document.querySelectorAll('style')) as HTMLStyleElement[];
      const dialogStyle = styleTags.find(s => (s.textContent || '').includes('#prescription-print-root'));
      expect(dialogStyle).toBeTruthy();
      expect(dialogStyle!.textContent).toContain(`padding-top: ${expectedMm}mm`);
    });
  });
});


