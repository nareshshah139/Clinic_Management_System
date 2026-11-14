'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CALENDARS, CALENDAR_ORDER } from './appointment-calendars';

const PANEL_WIDTH_PX = 544;

const SWATCHES: Array<[label: string, color: string]> = [
  ['OPD', 'var(--calendar-consultation)'],
  ['Procedure', 'var(--calendar-procedure)'],
  ['Telemedicine', 'var(--calendar-telemedicine)'],
  ['Completed', 'var(--calendar-completed)'],
  ['Past (OPD)', 'var(--calendar-consultation-past)'],
  ['Past (Procedure)', 'var(--calendar-procedure-past)'],
  ['Newly Booked', 'var(--success)'],
  ['Booking In Progress', 'var(--warning-border)'],
];

/**
 * @cc [owner:nareshshah139,label:product] appointment-calendar-legend
 * The legend MUST stay closed until a button named Legend opens it, and Escape MUST close it. Calendar legend colors MUST match the doctor timeline for visit types and past or completed
 * appointments in either theme. The legend MUST name the Scheduled and Confirmed calendars and
 * say how Confirm moves a patient between them.
 */
/**
 * @cc [owner:nareshshah139,label:accessibility] appointment-calendar-legend-disclosure
 * The Legend button is a disclosure, not a menu: it reports aria-expanded and controls the
 * legend panel. Escape closes the panel and returns focus to the button; a click outside closes it.
 */
export function CalendarLegend() {
  const [open, setOpen] = useState(false);
  const [alignEnd, setAlignEnd] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  const toggle = () => {
    const left = buttonRef.current?.getBoundingClientRect().left ?? 0;
    setAlignEnd(left + PANEL_WIDTH_PX > window.innerWidth - 16);
    setOpen((value) => !value);
  };

  return (
    <div ref={rootRef} className="relative">
      <Button ref={buttonRef} variant="outline" size="sm" className="gap-1.5" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <BookOpen className="h-4 w-4" aria-hidden="true" />
        Legend
      </Button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={`${panelId}-title`}
          className={`absolute top-full z-50 mt-1 w-[34rem] max-w-[90vw] rounded-md border bg-popover p-3 text-popover-foreground shadow-md ${alignEnd ? 'right-0' : 'left-0'}`}
        >
          <h2 id={`${panelId}-title`} className="mb-2 font-semibold">Legend</h2>
          <ul className="mb-3 space-y-1 text-sm">
            {CALENDAR_ORDER.map((calendar) => (
              <li key={calendar} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1.5 h-1 w-4 shrink-0 rounded" style={{ backgroundColor: CALENDARS[calendar].accentColor }} />
                <span><strong>{CALENDARS[calendar].title}:</strong> {CALENDARS[calendar].description}</span>
              </li>
            ))}
            <li className="text-foreground">Open a scheduled patient and press <strong>Confirm</strong> to move them to Confirmed at the same time.</li>
          </ul>
          <ul className="flex flex-wrap gap-4 items-center">
            {SWATCHES.map(([label, color]) => (
              <li key={label} className="flex items-center gap-2">
                <span aria-hidden="true" className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                <span className="text-sm">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
