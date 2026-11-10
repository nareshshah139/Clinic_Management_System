"use client";

import React, { useEffect, useId, useMemo, useState } from 'react';
import { Badge, badgeVariants } from '@/components/ui/badge';
import type { VariantProps } from 'class-variance-authority';
import { useToast } from '@/hooks/use-toast';
import {
  isSlotInPast,
  formatPatientName,
  doTimeSlotsOverlap,
  hhmmToMinutes,
  minutesToHHMM,
  addMinutesToHHMM,
} from '@/lib/utils';
import { CircleAlert } from 'lucide-react';
import type { AppointmentInSlot, AppointmentCalendar } from '@/lib/types';
import { AppointmentStatus } from '@cms/shared-types';
import { layoutDay } from './day-layout';
import { CALENDARS, canMove } from './appointment-calendars';
import { BILL_TYPE_LABEL, billingChip, type BillingTone } from './appointment-billing-view';

type StatusStyle = {
  label: string;
  badgeVariant: NonNullable<VariantProps<typeof badgeVariants>['variant']>;
  accentClassName: string;
  muted: boolean;
  strikeName: boolean;
};

const APPOINTMENT_STATUS_STYLE: Record<AppointmentStatus, StatusStyle> = {
  [AppointmentStatus.SCHEDULED]: { label: 'Scheduled', badgeVariant: 'neutral', accentClassName: 'border-l-slate-400', muted: false, strikeName: false },
  [AppointmentStatus.CONFIRMED]: { label: 'Confirmed', badgeVariant: 'info', accentClassName: 'border-l-sky-500', muted: false, strikeName: false },
  [AppointmentStatus.CHECKED_IN]: { label: 'Checked in', badgeVariant: 'warning', accentClassName: 'border-l-amber-500', muted: false, strikeName: false },
  [AppointmentStatus.IN_PROGRESS]: { label: 'In progress', badgeVariant: 'success', accentClassName: 'border-l-emerald-500', muted: false, strikeName: false },
  [AppointmentStatus.COMPLETED]: { label: 'Completed', badgeVariant: 'neutral', accentClassName: 'border-l-slate-300', muted: true, strikeName: false },
  [AppointmentStatus.NO_SHOW]: { label: 'No-show', badgeVariant: 'danger', accentClassName: 'border-l-red-500', muted: true, strikeName: true },
  [AppointmentStatus.CANCELLED]: { label: 'Cancelled', badgeVariant: 'danger', accentClassName: 'border-l-red-300', muted: true, strikeName: true },
};

const VISIT_TYPE_BACKGROUND: Record<string, { current: string; past: string }> = {
  OPD: { current: 'rgba(219, 234, 254, 0.95)', past: 'rgba(239, 246, 255, 0.95)' },
  PROCEDURE: { current: 'rgba(237, 233, 254, 0.95)', past: 'rgba(245, 237, 254, 0.95)' },
  TELEMED: { current: 'rgba(243, 244, 246, 0.95)', past: 'rgba(249, 250, 251, 0.95)' },
};

const FLEX_STEP_MIN = 15;

const BILLING_TONE: Record<BillingTone, string> = {
  paid: 'flex bg-emerald-50 text-emerald-800 ring-emerald-300',
  due: 'flex bg-amber-100 text-amber-900 ring-amber-400',
  unbilled: 'flex bg-amber-100 text-amber-900 ring-amber-400',
  quiet: 'hidden bg-white/70 text-gray-600 ring-gray-300 @min-[14rem]:flex',
};

export type SlotAction =
  | { kind: 'book'; patientMissing: boolean }
  | { kind: 'move'; minutes: number }
  | { kind: 'none' };

export interface Timeline {
  start: number;
  end: number;
  topPadding: string;
  bottomPadding: string;
}

interface CalendarColumnProps {
  calendar: AppointmentCalendar;
  column: number;
  appointments: AppointmentInSlot[];
  date: string;
  slots: string[];
  stepMinutes: number;
  tileHeight: string;
  timeline: Timeline;
  nowHHMM: string | null;
  recentBookedSlot?: string;
  bookingInProgress?: string;
  maxBookingsPerSlot: number;
  slotAction: SlotAction;
  busy: boolean;
  onOpen: (appointment: AppointmentInSlot) => void;
  onReschedule: (appointment: AppointmentInSlot) => void;
  onStartVisit: (appointment: AppointmentInSlot) => void;
  onOpenBill?: (appointment: AppointmentInSlot) => void;
  onBook: (slot: string) => void;
  onMove: (slot: string) => void;
}

/**
 * @cc [owner:nareshshah139,label:product] appointment-details-access
 * Appointment facts MUST remain inline on calendar cards; hovering MUST NOT open a details preview.
 * Saved appointments MUST expose their full details and actions through the INFO control.
 */
export default function CalendarColumn({
  calendar,
  column,
  appointments,
  date,
  slots,
  stepMinutes,
  tileHeight,
  timeline,
  nowHHMM,
  recentBookedSlot,
  bookingInProgress,
  maxBookingsPerSlot,
  slotAction,
  busy,
  onOpen,
  onReschedule,
  onStartVisit,
  onOpenBill,
  onBook,
  onMove,
}: CalendarColumnProps) {
  const spec = CALENDARS[calendar];
  const titleId = useId();
  const { toast } = useToast();
  const [selecting, setSelecting] = useState<boolean>(false);
  const [selectionStartIdx, setSelectionStartIdx] = useState<number | null>(null);
  const [selectionEndIdx, setSelectionEndIdx] = useState<number | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [isLongPressing, setIsLongPressing] = useState<boolean>(false);

  useEffect(() => () => {
    if (longPressTimer) clearTimeout(longPressTimer);
  }, [longPressTimer]);

  const blocks = useMemo(() => {
    const totalDayMin = Math.max(1, timeline.end - timeline.start);
    const spans = appointments.flatMap((apt, index) => {
      const [start, end] = (apt.slot || '').split('-');
      if (!start || !end) return [];
      const startMin = Math.max(timeline.start, Math.min(hhmmToMinutes(start), timeline.end));
      const endMin = Math.max(timeline.start, Math.min(hhmmToMinutes(end), timeline.end));
      if (endMin <= startMin) return [];
      return [{ apt, key: apt.id || `${apt.slot}#${index}`, start, end, startMin, endMin }];
    });
    const lanes = layoutDay(spans.map(({ key, startMin, endMin }) => ({ id: key, startMin, endMin })));
    return spans.map((span) => ({
      ...span,
      ...lanes.get(span.key)!,
      topPct: ((span.startMin - timeline.start) * 100) / totalDayMin,
      heightPct: ((span.endMin - span.startMin) * 100) / totalDayMin,
    }));
  }, [appointments, timeline.start, timeline.end]);

  const blockBackground = (apt: AppointmentInSlot) => {
    if (apt.status === AppointmentStatus.COMPLETED) return 'rgba(226, 232, 240, 0.95)';
    const tone = VISIT_TYPE_BACKGROUND[apt.visitType] ?? VISIT_TYPE_BACKGROUND.OPD;
    return isSlotInPast(apt.slot, date) ? tone.past : tone.current;
  };

  const clearSelection = () => {
    setSelecting(false);
    setSelectionStartIdx(null);
    setSelectionEndIdx(null);
  };

  const clearLongPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const startLongPress = (appointment: AppointmentInSlot) => {
    setLongPressTimer(setTimeout(() => {
      setIsLongPressing(true);
      onOpen(appointment);
    }, 500));
  };

  const requirePatient = () => toast({ variant: 'destructive', title: 'Patient required', description: 'Search and select a patient before booking a slot.' });

  // Same conservative count as the server: every booking in this calendar overlapping the span takes a place.
  const fits = (span: string) => appointments.filter(a => doTimeSlotsOverlap(a.slot, span)).length < maxBookingsPerSlot;
  const requiredMinutes = slotAction.kind === 'move' ? slotAction.minutes : FLEX_STEP_MIN;

  return (
    <section
      aria-labelledby={titleId}
      data-calendar={calendar}
      className="row-span-2 grid min-w-0 grid-rows-subgrid"
      style={{ gridColumnStart: column }}
    >
      <header className="min-w-0 border-b-2 pb-1.5" style={{ borderBottomColor: spec.accentColor }}>
        <h3 id={titleId} className="font-semibold leading-tight text-gray-900">{spec.title}</h3>
        <p className="text-xs font-medium leading-tight text-gray-800">{appointments.length ? spec.count(appointments.length) : spec.empty}</p>
        <p className="text-xs leading-tight text-gray-600">{spec.description}</p>
      </header>
      <div
        className="grid grid-cols-1 gap-0"
        style={{ position: 'relative', paddingTop: timeline.topPadding, paddingBottom: timeline.bottomPadding, gridAutoRows: tileHeight, ...(busy ? { pointerEvents: 'none', opacity: 0.6 } : {}) }}
      >
        {blocks.map(({ apt, key, start, end, topPct, heightPct, lane, laneCount }) => {
          const status = APPOINTMENT_STATUS_STYLE[apt.status] ?? APPOINTMENT_STATUS_STYLE[AppointmentStatus.SCHEDULED];
          const patientName = formatPatientName(apt.patient ?? { name: 'Unknown' });
          const isOptimistic = apt.id?.startsWith('optimistic-');
          const accessibleName = [
            apt.tokenNumber != null ? `Token ${apt.tokenNumber}` : null,
            patientName,
            `${start}-${end}`,
            status.label,
          ].filter(Boolean).join(', ');
          const chip = apt.billing ? billingChip(apt.billing, apt.billType) : null;
          return (
            <div
              key={key}
              data-appointment-block={apt.id || apt.slot}
              className="@container group absolute p-px"
              style={{
                top: `${topPct}%`,
                height: `${heightPct}%`,
                left: `${(lane * 100) / Math.max(laneCount, maxBookingsPerSlot)}%`,
                width: `${100 / Math.max(laneCount, maxBookingsPerSlot)}%`,
                zIndex: 2,
              }}
            >
              <div
                className={`flex h-full w-full overflow-hidden rounded-md border-l-[3px] shadow-sm ${status.accentClassName} ${apt.slot === recentBookedSlot ? 'ring-2 ring-green-500/60' : ''}`}
                style={{ backgroundColor: blockBackground(apt) }}
              >
                <div className="relative h-full min-w-0 flex-1">
                  <button
                    type="button"
                    aria-label={accessibleName}
                    title={accessibleName}
                    onClick={() => onOpen(apt)}
                    disabled={isOptimistic}
                    className="@container flex h-full w-full items-start overflow-hidden px-1.5 py-0.5 text-left leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                    style={{ fontSize: 'calc(0.75rem + var(--app-text-increase, 0rem))' }}
                  >
                    <span className={`flex w-full min-w-0 items-center gap-1.5 whitespace-nowrap ${status.muted ? 'text-gray-500' : 'text-gray-900'}`}>
                      {apt.tokenNumber != null && (
                        <span className="shrink-0 font-semibold text-gray-500">#{apt.tokenNumber}</span>
                      )}
                      <span data-appointment-time className="hidden shrink-0 font-bold text-blue-700 @min-[24rem]:inline">{`${start}-${end}`}</span>
                      <span
                        data-patient-name
                        className={`min-w-0 flex-auto truncate font-semibold ${status.strikeName ? 'line-through' : ''}`}
                      >
                        {patientName}
                      </span>
                      {apt.billType && (
                        <span data-bill-type className={`hidden shrink-0 font-semibold @min-[10rem]:inline ${apt.billType === 'PROCEDURE' ? 'text-purple-700' : apt.billType === 'REVIEW' ? 'text-sky-700' : 'text-teal-700'}`}>
                          {BILL_TYPE_LABEL[apt.billType]}
                        </span>
                      )}
                      <span className="hidden min-w-0 shrink-[100] items-center gap-1.5 overflow-hidden @min-[28rem]:flex">
                        {apt.visitType === 'PROCEDURE' && apt.notes && (
                          <span className="truncate font-medium text-purple-700">({apt.notes})</span>
                        )}
                        {(!apt.billType || apt.visitType === 'TELEMED') && <span className="font-medium text-purple-600">{apt.visitType || 'OPD'}</span>}
                        {apt.patient?.age !== undefined && <span className="text-gray-600">{apt.patient.age}y</span>}
                        {apt.patient?.gender && <span className="rounded bg-gray-100 px-1 text-gray-600">{apt.patient.gender.charAt(0).toUpperCase()}</span>}
                        {apt.room?.name && <span className="truncate font-medium text-green-600">{apt.room.name}</span>}
                      </span>
                      <Badge variant={status.badgeVariant} className="hidden shrink-0 whitespace-nowrap px-1.5 py-0 text-[10px] leading-4 @min-[9rem]:inline-flex">
                        {status.label}
                      </Badge>
                    </span>
                  </button>

                  <div data-appointment-actions className="pointer-events-none absolute right-1 top-0.5 hidden gap-1 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 @min-[16rem]:flex">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(apt);
                      }}
                      className="bg-gray-500 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded shadow-sm transition-colors font-medium"
                      title="View Appointment Details"
                      disabled={isOptimistic}
                    >
                      INFO
                    </button>
                    {canMove(apt.status) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReschedule(apt);
                        }}
                        className="bg-amber-700 hover:bg-amber-800 text-white text-xs px-2 py-1 rounded shadow-sm transition-colors font-medium"
                        title="Reschedule Appointment"
                        disabled={isOptimistic}
                      >
                        RESCHED
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartVisit(apt);
                      }}
                      className="bg-blue-700 hover:bg-blue-800 text-white text-xs px-2 py-1 rounded shadow-sm transition-colors font-medium"
                      title={apt.visit?.id ? 'Continue Visit' : 'Start Visit'}
                      disabled={isOptimistic}
                    >
                      {apt.visit?.id ? 'CONT' : 'START'}
                    </button>
                  </div>
                </div>
                {chip && (
                  <button
                    type="button"
                    data-appointment-billing={apt.billing?.state}
                    data-attention={apt.billing?.attention || undefined}
                    aria-label={chip.label}
                    title={chip.label}
                    onClick={() => onOpenBill?.(apt)}
                    disabled={isOptimistic || !onOpenBill}
                    className={`my-0.5 mr-0.5 shrink-0 items-center gap-1 self-start whitespace-nowrap rounded px-1.5 text-[11px] font-semibold leading-4 ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${BILLING_TONE[chip.tone]}`}
                  >
                    {(chip.tone === 'due' || chip.tone === 'unbilled') && <CircleAlert className="hidden size-3 shrink-0 @min-[12rem]:block" aria-hidden="true" />}
                    <span className="@min-[12rem]:hidden">{chip.tiny}</span>
                    <span className="hidden @min-[12rem]:inline @min-[22rem]:hidden">{chip.short}</span>
                    <span className="hidden @min-[22rem]:inline">{chip.text}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {slots.map((slot, idx) => {
          const overlappingAppointments = appointments.filter(a => doTimeSlotsOverlap(a.slot, slot));
          const hasAny = overlappingAppointments.length > 0;
          const full = overlappingAppointments.length >= maxBookingsPerSlot;
          const primary = overlappingAppointments[0];
          const past = isSlotInPast(slot, date);
          const isNewlyBooked = recentBookedSlot === slot || (primary?.slot === recentBookedSlot);
          const isBookingInProgress = bookingInProgress === slot;
          const [tileStartStr, tileEndStr] = slot.split('-');
          const tileStartMin = hhmmToMinutes(tileStartStr);
          const tileEndMin = hhmmToMinutes(tileEndStr);
          const isHourStart = tileStartStr.endsWith(':00');
          const nowMin = nowHHMM ? hhmmToMinutes(nowHHMM) : null;
          const showNowLine = nowMin !== null && nowMin >= tileStartMin && nowMin < tileEndMin;

          const inSelectionPreview = (() => {
            if (!selecting || selectionStartIdx === null || selectionEndIdx === null) return false;
            const lo = Math.min(selectionStartIdx, selectionEndIdx);
            const hi = Math.max(selectionStartIdx, selectionEndIdx);
            return idx >= lo && idx <= hi && !full;
          })();

          const crossesTop = hasAny && overlappingAppointments.some((apt) => {
            const [as, ae] = apt.slot.split('-');
            return hhmmToMinutes(as) < tileStartMin && hhmmToMinutes(ae) > tileStartMin;
          });
          const crossesBottom = hasAny && overlappingAppointments.some((apt) => {
            const [as, ae] = apt.slot.split('-');
            return hhmmToMinutes(as) < tileEndMin && hhmmToMinutes(ae) > tileEndMin;
          });
          const baseBorderColor = isBookingInProgress ? '#f59e0b' : (past ? '#d1d5db' : '#e5e7eb');

          const findFirstFreeStart = (minutes: number): number | null => {
            for (let s = tileStartMin; s <= tileEndMin - minutes; s += FLEX_STEP_MIN) {
              if (fits(`${minutesToHHMM(s)}-${minutesToHHMM(s + minutes)}`)) return s;
            }
            return null;
          };
          const freeStartMin = findFirstFreeStart(requiredMinutes);
          const freeSpan = freeStartMin !== null ? `${minutesToHHMM(freeStartMin)}-${minutesToHHMM(freeStartMin + requiredMinutes)}` : null;
          const moveSpan = freeSpan ?? `${tileStartStr}-${addMinutesToHHMM(tileStartStr, requiredMinutes)}`;
          const offersAction = !full && slotAction.kind !== 'none';

          return (
            <div
              key={slot}
              className={`border rounded-none ${hasAny ? 'p-0' : 'p-1'} flex flex-col gap-1 transition-all duration-200 relative`}
              style={{
                backgroundColor: isBookingInProgress ? '#fbbf24' : past ? '#f3f4f6' : (inSelectionPreview ? '#fef3c7' : 'white'),
                borderTopColor: hasAny && crossesTop ? 'transparent' : baseBorderColor,
                borderBottomColor: hasAny && crossesBottom ? 'transparent' : baseBorderColor,
                borderLeftColor: baseBorderColor,
                borderRightColor: baseBorderColor,
                opacity: past && !hasAny ? 0.6 : 1,
                boxShadow: (() => {
                  const parts: string[] = [];
                  if (isNewlyBooked) parts.push('0 0 0 2px rgba(34, 197, 94, 0.3)');
                  else if (isBookingInProgress) parts.push('0 0 0 2px rgba(251, 191, 36, 0.3)');
                  if (showNowLine) parts.push('inset 0 2px 0 #ef4444');
                  else if (isHourStart && !(hasAny && crossesTop)) parts.push('inset 0 1px 0 #e5e7eb');
                  return parts.length ? parts.join(', ') : 'none';
                })(),
                height: tileHeight,
                pointerEvents: past ? 'none' : undefined,
                overflow: 'hidden',
              }}
              title={(() => {
                if (full && primary) return `Long press to view details: ${formatPatientName(primary.patient ?? { name: 'Unknown' })} — ${primary.slot}`;
                if (!past && freeSpan && slotAction.kind === 'book') return `Book ${freeSpan}`;
                return undefined;
              })()}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                if (full && primary) startLongPress(primary);
                if (slotAction.kind !== 'book' || past) return;
                if (slotAction.patientMissing) {
                  if (!full) requirePatient();
                  return;
                }
                setSelecting(true);
                setSelectionStartIdx(idx);
                setSelectionEndIdx(idx);
              }}
              onMouseEnter={() => {
                if (selecting) setSelectionEndIdx(idx);
              }}
              onMouseLeave={clearLongPress}
              onTouchStart={() => {
                if (full && primary) startLongPress(primary);
              }}
              onTouchEnd={() => {
                clearLongPress();
                setIsLongPressing(false);
              }}
              onTouchCancel={() => {
                clearLongPress();
                setIsLongPressing(false);
              }}
              onMouseUp={() => {
                clearLongPress();
                if (isLongPressing) {
                  setIsLongPressing(false);
                  return;
                }
                if (!selecting) return;
                const lo = Math.min(selectionStartIdx ?? idx, selectionEndIdx ?? idx);
                const hi = Math.max(selectionStartIdx ?? idx, selectionEndIdx ?? idx);
                const startHH = slots[lo].split('-')[0];
                const endHH = lo === hi ? addMinutesToHHMM(startHH, stepMinutes) : slots[hi].split('-')[1];
                const span = `${startHH}-${endHH}`;
                clearSelection();
                if (fits(span)) {
                  onBook(span);
                } else if (freeSpan) {
                  onBook(freeSpan);
                } else {
                  toast({ variant: 'destructive', title: 'Overlaps existing appointment', description: 'Please select a free time range.' });
                }
              }}
            >
              {offersAction && (
                <div
                  role="button"
                  aria-label={`${slotAction.kind === 'move' ? `Move to ${slot}` : `Book ${slot}`}${hasAny ? `, ${overlappingAppointments.length} of ${maxBookingsPerSlot} booked` : ''}`}
                  onClick={() => {
                    if (selecting || past) return;
                    if (slotAction.kind === 'move') {
                      onMove(moveSpan);
                      return;
                    }
                    if (slotAction.kind === 'book' && slotAction.patientMissing) {
                      requirePatient();
                      return;
                    }
                    if (freeSpan) onBook(freeSpan);
                  }}
                  title={slotAction.kind === 'move' ? `Move to ${moveSpan}` : freeSpan ? `Book ${freeSpan}` : 'Book'}
                  style={{
                    height: '1.75rem',
                    backgroundColor: isBookingInProgress ? '#fbbf24' : '#ffffff',
                    cursor: (past || (slotAction.kind === 'book' && slotAction.patientMissing) || freeStartMin === null) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {hasAny && (
                    <span data-overbook-capacity className="pointer-events-none absolute right-1 top-0.5 rounded bg-amber-100 px-1 text-[10px] font-medium leading-4 text-amber-800">
                      Overbook {overlappingAppointments.length}/{maxBookingsPerSlot}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
