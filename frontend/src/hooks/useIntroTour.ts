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
            doneLabel: options.doneLabel ?? 'Done',
            nextLabel: options.nextLabel ?? 'Next →',
            prevLabel: options.prevLabel ?? '← Back',
            skipLabel: options.skipLabel ?? 'Skip',
            steps: options.steps as any,
          });
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
      }
    };
  }, [options]);

  const start = useCallback(() => {
    if (introRef.current) {
      try {
        introRef.current.start();
      } catch (e) {
        console.error('Error starting tour:', e);
      }
    }
  }, []);

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

