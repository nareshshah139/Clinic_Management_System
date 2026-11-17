"use client";

import React, { useId, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AppointmentInSlot, AppointmentCalendar } from '@/lib/types';
import { CALENDARS } from './appointment-calendars';
import { placeAppointments, type Timeline } from './day-layout';

interface FoldedCalendarProps {
  calendar: AppointmentCalendar;
  column: number;
  appointments: AppointmentInSlot[];
  slots: string[];
  tileHeight: string;
  timeline: Timeline;
  onShow: () => void;
  autoFocus?: boolean;
}

export default function FoldedCalendar({ calendar, column, appointments, slots, tileHeight, timeline, onShow, autoFocus }: FoldedCalendarProps) {
  const spec = CALENDARS[calendar];
  const titleId = useId();
  const marks = useMemo(() => placeAppointments(appointments, timeline), [appointments, timeline]);

  return (
    <section
      aria-labelledby={titleId}
      data-calendar={calendar}
      data-folded
      className="row-span-2 grid min-w-0 grid-rows-subgrid"
      style={{ gridColumnStart: column }}
    >
      <header className="min-w-0 border-b-2 pb-1.5" style={{ borderBottomColor: spec.accentColor }}>
        <h2 id={titleId} className="font-semibold leading-tight text-foreground">{spec.title}</h2>
        <p className="text-xs font-medium leading-tight text-foreground">{appointments.length ? spec.foldedCount(appointments.length) : spec.empty}</p>
        <button
          type="button"
          aria-expanded={false}
          aria-label={`Show ${spec.title} calendar`}
          autoFocus={autoFocus}
          onClick={onShow}
          className="flex items-center gap-0.5 rounded-sm text-xs font-medium leading-tight text-info-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Show
          <ChevronRight className="size-3" aria-hidden="true" />
        </button>
      </header>
      <div
        data-folded-rail
        aria-hidden="true"
        onClick={onShow}
        className="relative cursor-pointer rounded bg-muted/40 transition-colors hover:bg-muted"
        style={{ paddingTop: timeline.topPadding, paddingBottom: timeline.bottomPadding }}
      >
        {slots.map((slot) => (
          <div
            key={slot}
            className={slot.split('-')[0].endsWith(':00') ? 'border-t border-border' : undefined}
            style={{ height: tileHeight }}
          />
        ))}
        {marks.map(({ key, topPct, heightPct, lane, laneCount }) => (
          <div
            key={key}
            data-folded-mark
            className="absolute p-px"
            style={{ top: `${topPct}%`, height: `${heightPct}%`, left: `${(lane * 100) / laneCount}%`, width: `${100 / laneCount}%` }}
          >
            <div className="h-full w-full rounded-[5px] border-l-[3px] border-l-muted-foreground/60 shadow-sm" style={{ backgroundColor: 'var(--calendar-consultation)' }} />
          </div>
        ))}
      </div>
    </section>
  );
}
