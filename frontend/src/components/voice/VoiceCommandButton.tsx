'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppointmentStatus } from '@cms/shared-types';
import { Check } from 'lucide-react';
import { useOverbookConfirm } from '@/components/appointments/useOverbookConfirm';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import type { VoiceFillPhase } from '@/hooks/useVoiceFill';
import { apiClient, type ApiError } from '@/lib/api';
import { appointmentsHref } from '@/lib/appointments-link';
import { overbookFlag } from '@/lib/overbooking';
import { cn, getErrorMessage } from '@/lib/utils';
import {
  clinicClock,
  COMMAND_EXAMPLE,
  confirmedStep,
  createVoiceCommandSource,
  dayLabel,
  parseVoiceCommand,
  resolveVoiceCommand,
  withPick,
  type Choice,
  type VoiceCommand,
  type VoiceCommandAction,
  type VoiceCommandPicks,
  type VoiceCommandPlan,
  type VoiceCommandStep,
} from '@/lib/voice-command';
import { fetchVoiceFillStatus, requestVoiceFill } from '@/lib/voice-fill';
import type { VisitType } from '@/lib/types';
import { useCancelOnEscape, VoicePillFace, voicePillClass } from './VoiceFillButton';

const TITLE: Record<VoiceCommandAction, string> = {
  schedule_appointment: 'Book appointment',
  reschedule_appointment: 'Reschedule appointment',
  cancel_appointment: 'Cancel appointment',
  check_in: 'Check in patient',
  open_patient: 'Open patient chart',
  start_visit: 'Start visit',
};

const CONFIRM: Record<VoiceCommandAction, string> = {
  schedule_appointment: 'Book',
  reschedule_appointment: 'Reschedule',
  cancel_appointment: 'Cancel appointment',
  check_in: 'Check in',
  open_patient: 'Open chart',
  start_visit: 'Start visit',
};

const VISIT_TYPE: Record<VisitType, string> = { OPD: 'In clinic (OPD)', TELEMED: 'Video consult', PROCEDURE: 'Procedure' };
const CHIP_LIMIT = 6;

export interface HeardCommand {
  id: number;
  transcript: string;
  command: VoiceCommand;
}

type Done = { title: string; href: string; linkText: string };

const slotRange = (slot: string) => slot.replace('-', '–');


interface ChoiceViewProps<T> {
  label: string;
  choice: Choice<T>;
  describe: (value: T) => string;
  chip?: (value: T) => string;
  onPick: (value: T) => void;
  onChange?: () => void;
  disabled?: boolean;
}

function ChoiceView<T>({ label, choice, describe, chip = describe, onPick, onChange, disabled }: ChoiceViewProps<T>) {
  if (choice.kind === 'resolved') {
    return (
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{describe(choice.value)}</span>
        {onChange && (
          <button type="button" onClick={onChange} className="rounded-sm text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            Change<span className="sr-only"> {label.toLowerCase()}</span>
          </button>
        )}
      </span>
    );
  }
  if (choice.kind === 'missing') return <span className="text-warning-text">{choice.reason}</span>;
  return (
    <div className="flex flex-col gap-1.5">
      {choice.note && <span className="text-xs text-muted-foreground">{choice.note}</span>}
      {choice.options.length <= CHIP_LIMIT ? (
        <div role="group" aria-label={`Choose ${label.toLowerCase()}`} className="flex flex-wrap gap-1.5">
          {choice.options.map((option, index) => (
            <Button
              key={index}
              type="button"
              size="sm"
              variant="outline"
              data-choice-option=""
              disabled={disabled}
              className="h-7 rounded-full px-2.5 text-xs"
              onClick={() => onPick(option)}
            >
              {chip(option)}
            </Button>
          ))}
        </div>
      ) : (
        <NativeSelect
          aria-label={`Choose ${label.toLowerCase()}`}
          data-choice-option=""
          disabled={disabled}
          value=""
          className="h-8 w-full"
          onChange={(event) => onPick(choice.options[Number(event.target.value)])}
        >
          <option value="" disabled>Choose…</option>
          {choice.options.map((option, index) => (
            <option key={index} value={index}>{chip(option)}</option>
          ))}
        </NativeSelect>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 px-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

interface VoiceCommandDialogProps {
  heard: HeardCommand;
  role: string;
  onClose: () => void;
  now?: Date;
}

/** The confirmation card. Nothing is written until Confirm, and only from a fully resolved plan. */
export function VoiceCommandDialog({ heard, role, onClose, now: fixedNow }: VoiceCommandDialogProps) {
  const router = useRouter();
  const { sendWithOverbookConfirm, overbookDialog } = useOverbookConfirm();
  const now = useMemo(() => fixedNow ?? new Date(), [fixedNow]);
  const today = clinicClock(now).today;
  const source = useMemo(() => createVoiceCommandSource(), []);
  // One key per heard command: a double click or a network retry replays the first write instead of repeating it.
  const idempotencyKey = useMemo(() => `voice-command-${heard.id}-${Math.random().toString(36).slice(2)}`, [heard.id]);
  const [picks, setPicks] = useState<VoiceCommandPicks>({});
  const [plan, setPlan] = useState<VoiceCommandPlan | null>(null);
  const [resolving, setResolving] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dismissRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setResolving(true);
    resolveVoiceCommand(heard.command, picks, { role, now }, source)
      .then((next) => { if (!cancelled) setPlan(next); })
      .catch((e) => { if (!cancelled) setError(getErrorMessage(e) || 'Could not look that up. Try again.'); })
      .finally(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [heard.command, picks, role, now, source]);

  const step = plan && !resolving ? confirmedStep(plan) : null;

  useEffect(() => {
    if (!plan || resolving) return;
    // A picked chip unmounts with its question, so carry focus on to the next question, else to Confirm.
    const active = document.activeElement;
    if (active && active !== document.body && active !== dismissRef.current && bodyRef.current?.contains(active)) return;
    const next = bodyRef.current?.querySelector<HTMLElement>('[data-choice-option]')
      ?? (confirmRef.current && !confirmRef.current.disabled ? confirmRef.current : dismissRef.current);
    next?.focus();
  }, [plan, resolving]);

  const pick = <K extends keyof VoiceCommandPicks>(key: K) => (value: VoiceCommandPicks[K]) => {
    setError(null);
    setPicks((current) => withPick(current, key, value));
  };
  const change = <K extends keyof VoiceCommandPicks>(key: K) => (picks[key] !== undefined ? () => pick(key)(undefined) : undefined);

  const doneOn = (title: string, date: string, doctorId: string): Done =>
    ({ title, href: appointmentsHref(date, doctorId), linkText: `Open ${dayLabel(date, today)} in Appointments` });

  /** Resolves to the success state, or null when the user declined to overbook or the step navigated away. */
  const run = async (next: VoiceCommandStep): Promise<Done | null> => {
    const opts = { idempotencyKey };
    switch (next.kind) {
      case 'create': {
        const made = await sendWithOverbookConfirm((allow) => apiClient.createAppointment({ ...next.body, ...overbookFlag(allow) }, opts));
        return made && doneOn('Appointment booked', next.body.date, next.body.doctorId);
      }
      case 'reschedule': {
        const moved = await sendWithOverbookConfirm((allow) => apiClient.rescheduleAppointment(next.appointmentId, { ...next.body, ...overbookFlag(allow) }, opts));
        return moved && doneOn('Appointment moved', next.body.date, next.doctorId);
      }
      case 'cancel':
        await apiClient.deleteAppointment(next.appointmentId, opts);
        return doneOn('Appointment cancelled', next.date, next.doctorId);
      case 'check_in':
        await apiClient.updateAppointment(next.appointmentId, { status: AppointmentStatus.CHECKED_IN }, opts);
        return doneOn('Checked in', next.date, next.doctorId);
      case 'navigate':
        router.push(next.href);
        onClose();
        return null;
    }
  };

  const confirm = async () => {
    if (!step || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const outcome = await run(step);
      if (outcome) setDone(outcome);
    } catch (e) {
      const slotTaken = (e as ApiError | null)?.status === 409 && (step.kind === 'create' || step.kind === 'reschedule');
      const message = getErrorMessage(e);
      setError(slotTaken ? `${message.replace(/\.?$/, '.')} Pick another time.` : message);
      if (slotTaken) {
        source.forgetSlots();
        setPicks((current) => withPick(current, 'slot', undefined));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const action = plan && plan.action !== 'unavailable' ? plan.action : null;
  const title = done ? done.title : plan?.action === 'unavailable' ? "Can't do that" : action ? TITLE[action] : 'Voice command';
  const locked = submitting || !!done;

  const patientRow = plan && plan.action !== 'unavailable' && (
    <Row label="Patient">
      <ChoiceView
        label="Patient"
        choice={plan.patient}
        describe={(p) => (p.phone ? `${p.name} · ${p.phone}` : p.name)}
        onPick={pick('patient')}
        onChange={locked ? undefined : change('patient')}
        disabled={locked}
      />
    </Row>
  );
  const appointmentRow = plan && (plan.action === 'reschedule_appointment' || plan.action === 'cancel_appointment' || plan.action === 'check_in') && (
    <Row label="Appointment">
      <ChoiceView
        label="Appointment"
        choice={plan.appointment}
        describe={(a) => `${dayLabel(a.date, today)}, ${slotRange(a.slot)} · ${a.doctorName}`}
        onPick={pick('appointment')}
        onChange={locked ? undefined : change('appointment')}
        disabled={locked}
      />
    </Row>
  );
  const whenRow = plan && (plan.action === 'schedule_appointment' || plan.action === 'reschedule_appointment') && (
    <Row label={plan.action === 'schedule_appointment' ? 'When' : 'New time'}>
      <div className="flex flex-col gap-1.5">
        <ChoiceView label="Day" choice={plan.date} describe={(d) => dayLabel(d, today)} onPick={pick('date')} onChange={locked ? undefined : change('date')} disabled={locked} />
        {plan.date.kind === 'resolved' && (
          <ChoiceView label="Time" choice={plan.slot} describe={slotRange} chip={(s) => s.slice(0, 5)} onPick={pick('slot')} onChange={locked ? undefined : change('slot')} disabled={locked} />
        )}
      </div>
    </Row>
  );

  return (
    <>
      <Dialog open onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
        <DialogContent showCloseButton={false} className="top-20 translate-y-0 gap-3 p-5 sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2 text-base">
              {done && <Check className="size-4 text-success-text" aria-hidden="true" />}
              {title}
            </DialogTitle>
            <DialogDescription className="line-clamp-2">Heard “{heard.transcript}”</DialogDescription>
          </DialogHeader>

          <div ref={bodyRef} aria-busy={resolving || submitting} className="flex flex-col gap-3">
            {!plan && !error && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="size-3.5" label="Looking up" /> Looking up…
              </p>
            )}
            {plan?.action === 'unavailable' && <p className="text-sm">{plan.reason}</p>}
            {plan && plan.action !== 'unavailable' && (
              <dl className="divide-y divide-border rounded-md border border-border">
                {patientRow}
                {plan.action === 'schedule_appointment' && (
                  <Row label="Doctor">
                    <ChoiceView label="Doctor" choice={plan.doctor} describe={(d) => d.name} onPick={pick('doctor')} onChange={locked ? undefined : change('doctor')} disabled={locked} />
                  </Row>
                )}
                {appointmentRow}
                {plan.action === 'start_visit' && plan.appointment && (
                  <Row label="Appointment">
                    <span className="font-medium">{`${slotRange(plan.appointment.slot)} · ${plan.appointment.doctorName}`}</span>
                  </Row>
                )}
                {whenRow}
                {plan.action === 'schedule_appointment' && <Row label="Type"><span className="font-medium">{VISIT_TYPE[plan.visitType]}</span></Row>}
                {plan.action === 'schedule_appointment' && plan.notes && <Row label="Notes">{plan.notes}</Row>}
              </dl>
            )}
            {error && <p role="alert" className="text-sm text-destructive-text">{error}</p>}
            {done && (
              <p role="status" className="text-sm">
                <Link href={done.href} onClick={onClose} className="font-medium text-primary underline-offset-2 hover:underline">{done.linkText}</Link>
              </p>
            )}
          </div>

          <DialogFooter>
            {done ? (
              <Button type="button" onClick={onClose}>Close</Button>
            ) : (
              <>
                <Button ref={dismissRef} type="button" variant="outline" onClick={onClose}>
                  {!action ? 'Close' : action === 'cancel_appointment' ? 'Keep appointment' : 'Cancel'}
                </Button>
                {action && (
                  <Button
                    ref={confirmRef}
                    type="button"
                    variant={action === 'cancel_appointment' ? 'destructive' : 'default'}
                    disabled={!step || submitting}
                    onClick={() => void confirm()}
                  >
                    {submitting && <Spinner className="size-3.5" label="Saving" />}
                    {CONFIRM[action]}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {overbookDialog}
    </>
  );
}

const IDLE: VoiceFillPhase = { kind: 'idle' };
const UNDERSTANDING: VoiceFillPhase = { kind: 'filling' };

/** The global mic: speak a command, then confirm it in the card. */
export function VoiceCommandButton({ className }: { className?: string }) {
  const { user } = useDashboardUser();
  const { toast } = useToast();
  const [available, setAvailable] = useState(false);
  const [understanding, setUnderstanding] = useState(false);
  const [heard, setHeard] = useState<HeardCommand | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    void fetchVoiceFillStatus().then((ok) => { if (!cancelled) setAvailable(ok); });
    return () => { cancelled = true; mountedRef.current = false; };
  }, []);

  const understand = async (audio: Blob, filename: string) => {
    setUnderstanding(true);
    try {
      const { transcript, fields } = await requestVoiceFill('voice-command', audio, filename);
      if (!mountedRef.current) return;
      if (!transcript.trim()) {
        toast({ variant: 'info', title: 'Nothing heard', description: 'No speech was heard. Try speaking closer to the microphone.' });
        return;
      }
      setHeard({ id: Date.now(), transcript: transcript.trim(), command: parseVoiceCommand(fields) });
    } catch (error) {
      if (mountedRef.current) toast({ variant: 'warning', title: 'Voice command failed', description: getErrorMessage(error) || 'Please try again.' });
    } finally {
      if (mountedRef.current) setUnderstanding(false);
    }
  };

  const { recording, toggle, cancel } = useAudioRecorder({ toast, onRecorded: (_key, audio, filename) => void understand(audio, filename) });
  const phase: VoiceFillPhase = understanding ? UNDERSTANDING : recording ? { kind: 'listening', startedAt: recording.startedAt } : IDLE;
  useCancelOnEscape(phase.kind === 'listening', cancel);
  const onClick = useCallback(() => {
    if (!understanding) void toggle('voice-command');
  }, [understanding, toggle]);

  if (!available || !user) return null;

  const label = { idle: 'Speak a command', listening: 'Stop recording and run command', filling: 'Understanding…', filled: '' }[phase.kind];
  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">
        {phase.kind === 'listening' ? 'Listening. Click to stop, or press Escape to cancel.' : understanding ? 'Understanding…' : ''}
      </span>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onClick}
              aria-label={label}
              aria-disabled={understanding || undefined}
              className={cn(voicePillClass(phase), className)}
            >
              <VoicePillFace phase={phase} busyText="Understanding…" />
            </button>
          </TooltipTrigger>
          {phase.kind === 'idle' && (
            <TooltipContent className="max-w-64 text-center">
              <div className="font-medium">Voice command</div>
              <div className="text-xs text-muted-foreground">Say a command, e.g. {COMMAND_EXAMPLE}</div>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
      {heard && <VoiceCommandDialog key={heard.id} heard={heard} role={user.role} onClose={() => setHeard(null)} />}
    </>
  );
}
