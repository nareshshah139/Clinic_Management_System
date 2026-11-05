"use client";

import React, { useRef } from 'react';
import { Expand } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatPatientName } from '@/lib/utils';
import type { AppointmentInSlot } from '@/lib/types';

type AppointmentSummaryProps = {
  appointment: AppointmentInSlot;
  onOpenDetails: (appointment: AppointmentInSlot, restoreFocus: () => boolean) => void;
};

export function AppointmentFacts({ appointment }: { appointment: AppointmentInSlot }) {
  const facts = [
    ['Time', appointment.slot],
    ['Patient', formatPatientName(appointment.patient)],
    ['Phone', appointment.patient.phone],
    ['Email', appointment.patient.email],
    ['Age', appointment.patient.age !== undefined ? `${appointment.patient.age} years` : undefined],
    ['Sex', appointment.patient.gender],
    ['Type', appointment.visitType || 'OPD'],
    ['Follow-up', appointment.isFollowUp ? 'Existing patient' : undefined],
    [appointment.visitType === 'PROCEDURE' ? 'Procedure' : 'Notes', appointment.notes],
    ['Room', appointment.room ? `${appointment.room.name} (${appointment.room.type})` : undefined],
    ['Status', appointment.status],
  ];

  return (
    <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 leading-snug [overflow-wrap:anywhere]">
      {facts.filter(([, value]) => value !== undefined && value !== '').map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="min-w-0 text-xs text-muted-foreground">{label}</dt>
          <dd className="min-w-0 font-medium">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/**
 * @cc [owner:nareshshah139,label:accessibility] appointment-disclosure
 * Full appointment facts MUST be available on hover or keyboard focus without resizing the summary.
 * Click, touch activation, Enter and Space MUST open actionable details, including for pending entries.
 * The preview MUST remain read-only, dismiss on Escape and stay within the viewport.
 */
/**
 * @cc [owner:nareshshah139,label:accessibility] appointment-focus-restoration
 * Restoring details focus MUST suppress only that restored focus preview, not later intentional focus.
 * A detached trigger MUST return false without moving focus.
 */
export default function AppointmentSummary({ appointment, onOpenDetails }: AppointmentSummaryProps) {
  const suppressReturnFocusPreview = useRef(false);
  const name = formatPatientName(appointment.patient);

  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={0} disableHoverableContent={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-appointment-summary
            aria-label={`View appointment details for ${name}, ${appointment.slot}`}
            aria-haspopup="dialog"
            className="flex h-full w-full min-w-0 items-start gap-1 overflow-hidden rounded-md px-2 py-1 text-left text-black transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
            onFocus={(event) => {
              if (suppressReturnFocusPreview.current) {
                suppressReturnFocusPreview.current = false;
                event.preventDefault();
              }
            }}
            onClick={(event) => {
              event.stopPropagation();
              const trigger = event.currentTarget;
              onOpenDetails(appointment, () => {
                if (!trigger.isConnected) return false;
                if (document.activeElement !== trigger) {
                  suppressReturnFocusPreview.current = true;
                  trigger.focus({ preventScroll: true });
                }
                return true;
              });
            }}
          >
            <span className="h-full min-w-0 flex-1 overflow-hidden">
              <span className="block truncate text-sm font-semibold leading-4">{name}</span>
              <span className="block truncate text-xs leading-4">
                <span className="font-medium text-blue-700">{appointment.slot}</span>
                {' · '}{appointment.visitType || 'OPD'}
                {appointment.isFollowUp ? ' · Follow-up' : ''}
                {appointment.status === 'COMPLETED' ? ' · Completed' : ''}
                {appointment.id.startsWith('optimistic-') ? ' · Saving' : ''}
              </span>
            </span>
            <Expand aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 opacity-70" />
          </button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            data-appointment-preview
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            className="max-h-[min(28rem,calc(100dvh-24px))] w-96 max-w-[calc(100vw-24px)] overflow-y-auto p-4 text-sm [overflow-wrap:anywhere] motion-reduce:animate-none motion-reduce:transition-none"
          >
            <AppointmentFacts appointment={appointment} />
            <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">Open appointment for actions.</p>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}
