/**
 * Doctor Workflow Tour Component
 * 
 * Provides a comprehensive guided tour for doctor users covering the complete
 * medical visit workflow from vitals to prescription to completion.
 * 
 * @module DoctorTour
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';
import { useIntroTour, type TourStep } from '@/hooks/useIntroTour';
import 'intro.js/introjs.css';

// Function to inject custom styles for tour tooltips
/**
 * @cc [owner:nareshshah139,label:accessibility] tour-controls-clickable
 * Tour styling preserves Intro.js stacking so tooltip controls receive pointer input above the overlay.
 */
function injectTourStyles() {
  if (typeof window === 'undefined') return;
  
  const styleId = 'doctor-tour-styles';
  if (document.getElementById(styleId)) return; // Already injected
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
      /* Enhanced tooltip sizes */
      .introjs-tooltip.introjs-large-tooltip {
        max-width: 650px !important;
        min-width: 500px !important;
      }
      
      .introjs-tooltip.introjs-medium-tooltip {
        max-width: 450px !important;
        min-width: 350px !important;
      }
      
      /* Improved tooltip styling */
      .introjs-tooltip {
        border-radius: 12px !important;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15) !important;
        padding: 0 !important;
        overflow: hidden !important;
        max-height: 80vh !important;
      }
      .introjs-tooltiptext {
        overflow: auto !important;
        max-height: calc(80vh - 120px) !important; /* leave room for buttons */
        -webkit-overflow-scrolling: touch !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
      }
      
      .introjs-tooltiptext {
        padding: 20px !important;
        font-size: calc(14px + var(--app-text-increase, 0rem)) !important;
        line-height: 1.6 !important;
      }
      
      /* Button styling */
      .introjs-button {
        border-radius: 8px !important;
        padding: 10px 20px !important;
        font-weight: 600 !important;
        text-shadow: none !important;
        transition: all 0.2s !important;
        font-size: calc(14px + var(--app-text-increase, 0rem)) !important;
        margin: 0 4px !important;
      }
      
      /* Button container */
      .introjs-tooltipbuttons {
        border-top: 1px solid #e5e7eb !important;
        padding: 16px 20px !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        gap: 8px !important;
        background-color: #fafafa !important;
        border-bottom-left-radius: 12px !important;
        border-bottom-right-radius: 12px !important;
        margin: 0 !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      
      .introjs-nextbutton {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
        border: none !important;
      }
      
      .introjs-nextbutton:hover {
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%) !important;
        transform: translateY(-1px) !important;
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4) !important;
      }
      
      .introjs-prevbutton {
        background: #f3f4f6 !important;
        color: #374151 !important;
        border: 1px solid #d1d5db !important;
      }
      
      .introjs-prevbutton:hover {
        background: #e5e7eb !important;
        transform: translateY(-1px) !important;
      }
      
      .introjs-skipbutton {
        background: #ef4444 !important;
        color: #ffffff !important;
        font-weight: 700 !important;
        border: 2px solid #ef4444 !important;
        border-radius: 50% !important;
        padding: 8px !important;
        width: 36px !important;
        height: 36px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: all 0.2s !important;
        text-shadow: none !important;
        cursor: pointer !important;
        position: relative !important;
        margin: 0 4px !important;
        white-space: nowrap !important;
        min-width: unset !important;
        font-size: 0 !important;
        line-height: 0 !important;
        overflow: hidden !important;
      }
      
      .introjs-skipbutton:hover {
        background: #dc2626 !important;
        color: #ffffff !important;
        transform: translateY(-1px) scale(1.05) !important;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.5) !important;
        border-color: #dc2626 !important;
      }
      
      .introjs-skipbutton:before {
        content: "✕" !important;
        font-weight: 700 !important;
        font-size: calc(20px + var(--app-text-increase, 0rem)) !important;
        line-height: 1 !important;
        position: absolute !important;
        left: 50% !important;
        top: 50% !important;
        transform: translate(-50%, -50%) !important;
      }
      
      /* Button navigation wrapper */
      .introjs-tooltipbuttons::after {
        content: none !important;
      }
      
      .introjs-tooltipbuttons > a,
      .introjs-tooltipbuttons > button {
        position: static !important;
        float: none !important;
      }
      
      /* Ensure no overflow from buttons */
      .introjs-tooltip * {
        box-sizing: border-box !important;
      }
      
      /* Progress bar */
      .introjs-progress {
        background-color: #e5e7eb !important;
      }
      
      .introjs-progressbar {
        background: linear-gradient(90deg, #10b981 0%, #3b82f6 100%) !important;
      }
      
      /* Bullets */
      .introjs-bullets ul li a {
        width: 10px !important;
        height: 10px !important;
        background: #d1d5db !important;
      }
      
      .introjs-bullets ul li a.active {
        background: #10b981 !important;
        width: 24px !important;
        border-radius: 5px !important;
      }
      
      /* Overlay */
      .introjs-overlay {
        background-color: rgba(0, 0, 0, 0.7) !important;
      }
      
      /* Highlighted element */
      .introjs-helperLayer {
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.7), 0 0 20px rgba(16, 185, 129, 0.5) !important;
        border-radius: 8px !important;
      }
      
      /* Arrow styling */
      .introjs-arrow {
        border-width: 8px !important;
      }
      
      /* Responsive adjustments */
      @media (max-width: 768px) {
        .introjs-tooltip { max-width: 92vw !important; min-width: auto !important; }
        .introjs-tooltip.introjs-large-tooltip,
        .introjs-tooltip.introjs-medium-tooltip { max-width: 92vw !important; min-width: auto !important; }
        
        .introjs-tooltiptext {
          padding: 15px !important;
          font-size: calc(13px + var(--app-text-increase, 0rem)) !important;
        }
        
        .introjs-tooltipbuttons {
          flex-wrap: wrap !important;
          padding: 12px 15px !important;
          width: 100% !important;
          margin: 0 !important;
        }
        
        .introjs-button {
          padding: 8px 16px !important;
          font-size: calc(13px + var(--app-text-increase, 0rem)) !important;
          margin: 4px 2px !important;
          max-width: calc(50% - 8px) !important;
        }
        
        .introjs-skipbutton {
          order: -1 !important;
          flex: 1 1 100% !important;
          margin: 0 0 8px 0 !important;
          max-width: 100% !important;
          width: 100% !important;
          box-sizing: border-box !important;
          border-radius: 8px !important;
          height: auto !important;
          padding: 10px !important;
        }
        
        .introjs-skipbutton:before {
          position: static !important;
          transform: none !important;
          margin-right: 6px !important;
        }
      }
    `;
  document.head.appendChild(style);
}

interface DoctorTourProps {
  /** Whether to auto-start the tour on first visit */
  autoStart?: boolean;
}

/**
 * Get tour steps for the doctor visit workflow
 * This covers the complete workflow from start to finish
 */
function getDoctorVisitTourSteps(): TourStep[] {
  return [
    {
      intro: `
        <div class="space-y-2">
          <h4 class="text-lg font-semibold">The visit</h4>
          <div class="space-y-1 text-sm leading-relaxed">
            <p>The visit opens on the Prescription tab.</p>
            <p>Fill it from top to bottom, then press <strong>Complete visit</strong>.</p>
          </div>
        </div>
      `,
    },
    {
      intro: `
        <div class="space-y-2">
          <h4 class="text-lg font-semibold">Check the patient first</h4>
          <div class="space-y-1 text-sm leading-relaxed">
            <p>The patient panel shows allergies and past visits.</p>
            <p>Check allergies before you prescribe.</p>
          </div>
        </div>
      `,
    },
    {
      intro: `
        <div class="space-y-2">
          <h4 class="text-lg font-semibold">Complaint and diagnosis</h4>
          <div class="space-y-1 text-sm leading-relaxed">
            <p>Type the chief complaint and the diagnosis.</p>
            <p>The visit needs at least one of them to complete.</p>
          </div>
        </div>
      `,
    },
    {
      intro: `
        <div class="space-y-2">
          <h4 class="text-lg font-semibold">Medicines</h4>
          <div class="space-y-1 text-sm leading-relaxed">
            <p>Type a medicine name in the empty row and pick it from the list.</p>
            <p>Set frequency and duration with the presets: 1-0-1, Night, 5d, 7d, 10d, 14d.</p>
            <p>A new empty row appears for the next medicine.</p>
            <p><strong>Suggested</strong> under a field fills the value you used before.</p>
          </div>
        </div>
      `,
    },
    {
      intro: `
        <div class="space-y-2">
          <h4 class="text-lg font-semibold">Vitals, photos and lab tests</h4>
          <div class="space-y-1 text-sm leading-relaxed">
            <p>Fill these tabs only when there is something to record. The visit completes without them.</p>
            <p>A single photo uploads straight away. Change its position on the photo card.</p>
          </div>
        </div>
      `,
    },
    {
      intro: `
        <div class="space-y-2">
          <h4 class="text-lg font-semibold">Complete the visit</h4>
          <div class="space-y-1 text-sm leading-relaxed">
            <p><strong>Complete visit</strong> saves the prescription, completes the visit and takes you back to the dashboard.</p>
            <p><strong>Create Prescription</strong> saves the prescription without completing the visit. <strong>Go to pharmacy</strong> appears once it is saved.</p>
          </div>
        </div>
      `,
    },
    {
      intro: `
        <div class="space-y-2">
          <h4 class="text-lg font-semibold">Saving</h4>
          <div class="space-y-1 text-sm leading-relaxed">
            <p>Your work saves by itself. The top of the form shows when it last saved.</p>
            <p>If it says <strong>Save failed</strong>, press <strong>Save Draft</strong>.</p>
          </div>
        </div>
      `,
    },
  ];
}

/**
 * Doctor Tour Component
 * 
 * Displays a help button that starts an interactive tour for the doctor visit workflow.
 * Can be configured to auto-start on first visit.
 */
export function DoctorTour({ autoStart = false }: DoctorTourProps) {
  const pathname = usePathname();
  const [hasSeenTour, setHasSeenTour] = useState(true);

  // Memoize steps and options to avoid re-initializing intro.js on re-renders
  const steps = useMemo(() => getDoctorVisitTourSteps(), []);
  const tourOptions = useMemo(() => ({
    steps,
    showProgress: true,
    showBullets: true,
    exitOnEsc: true,
    exitOnOverlayClick: true,
    skipLabel: '',
    doneLabel: 'Finish',
  }), [steps]);

  const { start } = useIntroTour(tourOptions);

  // Check if user has seen the tour before
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const tourKey = `tour-seen-doctor-visits`;
      const seen = localStorage.getItem(tourKey) === 'true';
      setHasSeenTour(seen);
      
      // Auto-start tour if enabled and not seen before
      if (autoStart && !seen) {
        // Small delay to ensure page is fully loaded
        const timer = setTimeout(() => {
          injectTourStyles();
          start();
          localStorage.setItem(tourKey, 'true');
        }, 1500);
        
        return () => clearTimeout(timer);
      }
    }
  }, [pathname, autoStart, start]);

  const handleStartTour = () => {
    // Inject styles before starting tour
    injectTourStyles();
    
    start();
    if (typeof window !== 'undefined') {
      const tourKey = `tour-seen-doctor-visits`;
      localStorage.setItem(tourKey, 'true');
      setHasSeenTour(true);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleStartTour}
      aria-label="Visit workflow tour"
      className="flex items-center gap-2"
      data-tour="help-button"
    >
      <HelpCircle className="h-4 w-4" />
      <span className="hidden sm:inline">Visit tour</span>
      <span className="sm:hidden">Tour</span>
    </Button>
  );
}

