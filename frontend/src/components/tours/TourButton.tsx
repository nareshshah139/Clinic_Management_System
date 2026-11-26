'use client';

import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIntroTour, type TourStep } from '@/hooks/useIntroTour';
import 'intro.js/introjs.css';
import './tours.css';

/**
 * @cc [owner:nareshshah139,label:accessibility] tour-controls-clickable
 * Tour styling preserves Intro.js stacking so tooltip controls receive pointer input above the overlay.
 */
export function TourButton({ steps, label, children }: { steps: readonly TourStep[]; label: string; children: ReactNode }) {
  const start = useIntroTour(steps);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={(event) => void start(event.currentTarget)}
      aria-label={label}
      className="flex items-center gap-2"
      data-tour="help-button"
    >
      <HelpCircle className="h-4 w-4" aria-hidden="true" />
      {children}
    </Button>
  );
}
