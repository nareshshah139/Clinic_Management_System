/**
 * Custom hook for managing Intro.js tours
 * 
 * @module useIntroTour
 */

import { useEffect, useRef, useCallback } from 'react';

export interface TourStep {
  element?: string;
  intro: string;
  title?: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  tooltipClass?: string;
  highlightClass?: string;
}

export interface TourOptions {
  steps: TourStep[];
  exitOnEsc?: boolean;
  exitOnOverlayClick?: boolean;
  showStepNumbers?: boolean;
  showBullets?: boolean;
  showProgress?: boolean;
  scrollToElement?: boolean;
  overlayOpacity?: number;
  doneLabel?: string;
  nextLabel?: string;
  prevLabel?: string;
  skipLabel?: string;
}

/**
 * Hook for managing Intro.js tours
 * 
 * @param options - Tour configuration options
 * @returns Object with start and exit methods
 */
export function useIntroTour(options: TourOptions) {
  const introRef = useRef<any>(null);

  // Wait for an element matching the selector to exist and be visible
  const waitForElement = useCallback(async (selector: string, timeoutMs: number = 5000): Promise<Element | null> => {
    if (typeof window === 'undefined') return null;
    const startTime = Date.now();

    const isElementReady = (el: Element | null) => {
      if (!el) return false;
      const rect = (el as HTMLElement).getBoundingClientRect();
      const style = window.getComputedStyle(el as HTMLElement);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none'
      );
    };

    return await new Promise<Element | null>((resolve) => {
      const tryFind = () => {
        const el = document.querySelector(selector);
        if (isElementReady(el)) {
          resolve(el);
          return;
        }
        if (Date.now() - startTime >= timeoutMs) {
          resolve(null);
          return;
        }
        // Use rAF for responsive polling without blocking
        window.requestAnimationFrame(tryFind);
      };
      tryFind();
    });
  }, []);

  useEffect(() => {
    // Dynamically import intro.js to avoid SSR issues
    const loadIntro = async () => {
      if (typeof window !== 'undefined') {
        const introJs = (await import('intro.js')).default;
        
        introRef.current = introJs();
        
        if (introRef.current) {
          introRef.current.setOptions({
            exitOnEsc: options.exitOnEsc ?? true,
            exitOnOverlayClick: options.exitOnOverlayClick ?? true,
            showStepNumbers: options.showStepNumbers ?? true,
            showBullets: options.showBullets ?? true,
            showProgress: options.showProgress ?? true,
            scrollToElement: options.scrollToElement ?? true,
            overlayOpacity: options.overlayOpacity ?? 0.7,
            positionPrecedence: ['bottom', 'top', 'right', 'left'],
            doneLabel: options.doneLabel ?? 'Done',
            nextLabel: options.nextLabel ?? 'Next →',
            prevLabel: options.prevLabel ?? '← Back',
            skipLabel: options.skipLabel ?? 'Skip',
            steps: options.steps as any,
          });

          // Ensure target elements are present before each step to improve highlight reliability
          introRef.current.onbeforechange(async () => {
            try {
              const currentIndex: number = introRef.current?._currentStep ?? 0;
              const steps: any[] = (options.steps as any[]) ?? [];
              const step = steps[currentIndex];
              const selector = typeof step?.element === 'string' ? step.element : null;
              if (selector) {
                const el = await waitForElement(selector, 5000);
                if (el) {
                  (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                  // Give layout a tick then refresh intro's positioning
                  setTimeout(() => {
                    try { introRef.current?.refresh(); } catch {}
                  }, 50);
                }
              }
            } catch {}
          });

          // Refresh positions after change in case of lazy content
          introRef.current.onafterchange(() => {
            try { introRef.current?.refresh(); } catch {}
          });

          // Keep tooltip positioned correctly on viewport changes
          const handleResize = () => {
            try { introRef.current?.refresh(); } catch {}
          };
          window.addEventListener('resize', handleResize);
          window.addEventListener('orientationchange', handleResize);
          (introRef.current as any)._handleResize = handleResize;
        }
      }
    };

    void loadIntro();

    return () => {
      if (introRef.current) {
        try {
          introRef.current.exit(true);
        } catch (e) {
          // Ignore errors on cleanup
        }
        try {
          const hr = (introRef.current as any)?._handleResize;
          if (hr) {
            window.removeEventListener('resize', hr);
            window.removeEventListener('orientationchange', hr);
          }
        } catch {}
      }
    };
  }, [options, waitForElement]);

  const start = useCallback(() => {
    if (!introRef.current) return;
    try {
      const steps: any[] = (options.steps as any[]) ?? [];
      const firstSelector = typeof steps?.[0]?.element === 'string' ? steps[0].element : null;
      if (firstSelector) {
        // Try to wait for the first element before starting, but don't block forever
        void (async () => {
      try {
            await waitForElement(firstSelector, 5000);
          } catch {}
          try { introRef.current?.start(); } catch (e) { console.error('Error starting tour:', e); }
        })();
      } else {
        introRef.current.start();
      }
      } catch (e) {
        console.error('Error starting tour:', e);
      }
  }, [options.steps, waitForElement]);

  const exit = useCallback(() => {
    if (introRef.current) {
      try {
        introRef.current.exit(true);
      } catch (e) {
        // Ignore errors
      }
    }
  }, []);

  return { start, exit };
}

