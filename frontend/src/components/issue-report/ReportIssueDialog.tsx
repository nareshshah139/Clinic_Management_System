'use client';

import { useEffect, useId, useRef, useState, type Dispatch, type DragEvent, type KeyboardEvent } from 'react';
import { useObjectUrl } from '@/hooks/use-object-url';
import { Bug, Check, CircleCheck, CircleQuestionMark, Copy, ExternalLink, EyeOff, ImagePlus, Lightbulb, Lock, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, splitErrorReference } from '@/lib/utils';
import {
  ACCEPTED_IMAGE_TYPES,
  DESCRIPTION_MAX,
  MAX_SCREENSHOTS,
  TITLE_MAX,
  TITLE_MIN,
  acceptImages,
  newScreenshotId,
  submitBlocker,
  type IssueKind,
  type ReportAction,
  type ReportState,
  type Screenshot,
  type ScreenshotSource,
} from '@/lib/issue-report';
import { ScreenshotRedactor } from './ScreenshotRedactor';
import type { RedactionSession } from './redaction';

const KINDS: Array<{ kind: IssueKind; label: string; icon: typeof Bug; title: string; details: string }> = [
  {
    kind: 'bug',
    label: "Something's broken",
    icon: Bug,
    title: "e.g. Prescription won't print after adding a second drug",
    details: 'What did you do?\nWhat happened?\nWhat did you expect instead?',
  },
  {
    kind: 'idea',
    label: 'Idea',
    icon: Lightbulb,
    title: 'e.g. Let reception reschedule from the patient page',
    details: 'What would make your work easier? Who else would it help?',
  },
  {
    kind: 'question',
    label: 'Question',
    icon: CircleQuestionMark,
    title: 'e.g. How do I refund part of a pharmacy bill?',
    details: 'What are you trying to do, and where did you get stuck?',
  },
];

interface ReportIssueDialogProps {
  state: ReportState;
  dispatch: Dispatch<ReportAction>;
  onSubmit: () => void;
}

export function ReportIssueDialog({ state, dispatch, onSubmit }: ReportIssueDialogProps) {
  const [redacting, setRedacting] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Record<string, RedactionSession>>({});
  const close = () => dispatch({ type: 'closed' });
  const { status } = state;
  const editing = redacting ? state.draft.screenshots.find((shot) => shot.id === redacting) : undefined;
  const liveSessions = Object.fromEntries(
    state.draft.screenshots.flatMap((shot) => {
      const session = sessions[shot.id];
      return shot.state === 'ready' && session?.result === shot.blob ? [[shot.id, session] as const] : [];
    }),
  );
  const session = editing ? liveSessions[editing.id] : undefined;
  const { screenshots } = state.draft;
  useEffect(() => {
    setSessions((all) => {
      const kept = Object.entries(all).filter(([id]) => screenshots.some((shot) => shot.id === id));
      return kept.length === Object.keys(all).length ? all : Object.fromEntries(kept);
    });
  }, [screenshots]);
  return (
    <Dialog open={state.open} onOpenChange={(open: boolean) => !open && close()}>
      <DialogContent
        className="sm:max-w-[38rem]"
        onOpenAutoFocus={(event: Event) => {
          event.preventDefault();
          (event.target as HTMLElement).querySelector<HTMLElement>('[data-autofocus]')?.focus();
        }}
      >
        {status.phase === 'submitted' ? (
          <SuccessPanel number={status.number} url={status.url} onDone={close} />
        ) : (
          <ReportForm
            state={state}
            dispatch={dispatch}
            onSubmit={onSubmit}
            onRedact={setRedacting}
            redactionCounts={Object.fromEntries(Object.entries(liveSessions).map(([id, kept]) => [id, kept.boxes.length]))}
          />
        )}
      </DialogContent>
      {editing?.state === 'ready' && (
        <ScreenshotRedactor
          key={editing.id}
          blob={session?.original ?? editing.blob}
          initialBoxes={session?.boxes}
          onDone={(result, boxes) => {
            const original = session?.original ?? editing.blob;
            setSessions((all) => {
              const rest = Object.fromEntries(Object.entries(all).filter(([id]) => id !== editing.id));
              return boxes.length ? { ...rest, [editing.id]: { original, boxes, result } } : rest;
            });
            dispatch({ type: 'screenshotRedacted', id: editing.id, blob: result });
            setRedacting(null);
          }}
          onCancel={() => setRedacting(null)}
        />
      )}
    </Dialog>
  );
}

function ReportForm({
  state,
  dispatch,
  onSubmit,
  onRedact,
  redactionCounts,
}: ReportIssueDialogProps & { onRedact: (id: string) => void; redactionCounts: Record<string, number> }) {
  const { draft, status, context } = state;
  const sending = status.phase === 'submitting';
  const attached = draft.screenshots.map((shot) => shot.id).join(',');
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const confirmed = attached !== '' && confirmedFor === attached;
  const hasReadyShot = draft.screenshots.some((shot) => shot.state === 'ready');
  const blocker =
    submitBlocker(draft) ?? (hasReadyShot && !confirmed ? 'Check the screenshot for patient details and confirm below.' : null);
  const titleShort = draft.title.trim().length < TITLE_MIN;
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [titleNudge, setTitleNudge] = useState(false);
  const [dragging, setDragging] = useState(false);
  const ids = useId();
  const kind = KINDS.find((k) => k.kind === draft.kind) ?? KINDS[0];
  const slotsLeft = MAX_SCREENSHOTS - draft.screenshots.length;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

  const addFiles = (files: File[], source: ScreenshotSource) => {
    if (sending || files.length === 0) return;
    const { accepted, problems: found } = acceptImages(files, slotsLeft);
    setProblems(found);
    if (accepted.length) {
      dispatch({
        type: 'screenshotsAdded',
        screenshots: accepted.map((blob) => ({ id: newScreenshotId(), source, state: 'ready', blob })),
      });
    }
  };

  const trySubmit = () => {
    if (sending) return;
    if (!blocker) return onSubmit();
    if (titleShort) {
      setTitleNudge(true);
      titleRef.current?.focus();
    }
  };

  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files');

  return (
    <div
      className="relative grid min-w-0 gap-5"
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
        event.preventDefault();
        trySubmit();
      }}
      onPaste={(event) => {
        const files = Array.from(event.clipboardData.files);
        if (!files.length) return;
        event.preventDefault();
        addFiles(files, 'paste');
      }}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        addFiles(Array.from(event.dataTransfer.files), 'upload');
      }}
    >
      <DialogHeader>
        <DialogTitle>Report a problem</DialogTitle>
        <DialogDescription>Something broken, an idea, or a question. It goes straight to the team that builds this app.</DialogDescription>
      </DialogHeader>

      {state.resumed && !sending && (
        <p className="-mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          Picked up where you left off.
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-4"
            onClick={() => {
              dispatch({ type: 'discarded' });
              setProblems([]);
              setTitleNudge(false);
              titleRef.current?.focus();
            }}
          >
            Start over
          </button>
        </p>
      )}

      <fieldset disabled={sending} className="grid min-w-0 gap-5">
        <KindPicker value={draft.kind} onChange={(next) => dispatch({ type: 'kindChanged', kind: next })} />

        <div className="grid gap-2">
          <Label htmlFor={`${ids}-title`}>Summarize it in a line</Label>
          <Input
            id={`${ids}-title`}
            ref={titleRef}
            data-autofocus
            value={draft.title}
            maxLength={TITLE_MAX}
            placeholder={kind.title}
            aria-describedby={titleNudge && titleShort ? `${ids}-title-hint` : undefined}
            aria-invalid={titleNudge && titleShort ? true : undefined}
            onChange={(event) => dispatch({ type: 'titleChanged', title: event.target.value })}
          />
          {titleNudge && titleShort && (
            <p id={`${ids}-title-hint`} className="text-sm text-destructive-text">
              Add a few words so the team knows what it&apos;s about.
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${ids}-details`}>
            Details <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id={`${ids}-details`}
            value={draft.description}
            maxLength={DESCRIPTION_MAX}
            placeholder={kind.details}
            className="min-h-24 max-h-60"
            onChange={(event) => dispatch({ type: 'descriptionChanged', description: event.target.value })}
          />
        </div>

        <section aria-labelledby={`${ids}-shots`} className="grid gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <h3 id={`${ids}-shots`} className="text-sm font-medium">
              Screenshots
            </h3>
            <span className="text-xs text-muted-foreground">
              {draft.screenshots.length} of {MAX_SCREENSHOTS} · paste or drop images here too
            </span>
          </div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {draft.screenshots.map((shot, index) => (
              <ScreenshotTile
                key={shot.id}
                shot={shot}
                index={index}
                redactions={redactionCounts[shot.id] ?? 0}
                onRemove={() => dispatch({ type: 'screenshotRemoved', id: shot.id })}
                onRedact={() => onRedact(shot.id)}
              />
            ))}
            {slotsLeft > 0 && (
              <li className="flex">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-36 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                >
                  <ImagePlus className="size-5" aria-hidden="true" />
                  Add screenshot
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_IMAGE_TYPES.join(',')}
                  aria-label="Add screenshots"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(event) => {
                    addFiles(Array.from(event.target.files ?? []), 'upload');
                    event.target.value = '';
                  }}
                />
              </li>
            )}
          </ul>
          {hasReadyShot && (
            <div className="flex items-start gap-2 rounded-md border bg-muted p-3 text-sm">
              <Checkbox
                id={`${ids}-phi`}
                className="mt-0.5"
                checked={confirmed}
                onCheckedChange={(checked: boolean | 'indeterminate') => setConfirmedFor(checked === true ? attached : null)}
              />
              <Label htmlFor={`${ids}-phi`} className="font-normal leading-snug">
                I&apos;ve checked {draft.screenshots.length > 1 ? 'these screenshots contain' : 'this screenshot contains'} no
                patient-identifying information, or I&apos;ve redacted {draft.screenshots.length > 1 ? 'them' : 'it'}.
              </Label>
            </div>
          )}
          {problems.length > 0 && (
            <ul role="alert" className="grid gap-1 text-sm text-destructive-text">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid gap-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="grid gap-1">
              <Label htmlFor={`${ids}-context`}>Include technical details</Label>
              <p id={`${ids}-context-hint`} className="text-xs text-muted-foreground">
                The page, browser and recent errors help the team find the cause.
              </p>
            </div>
            <Switch
              id={`${ids}-context`}
              aria-describedby={`${ids}-context-hint`}
              checked={draft.includeContext}
              onCheckedChange={(includeContext) => dispatch({ type: 'includeContextChanged', includeContext })}
            />
          </div>
          {draft.includeContext && context && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">See exactly what&apos;s sent</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono">
                {JSON.stringify(context, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </fieldset>

      <p className="flex gap-2 text-xs text-muted-foreground">
        <Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        <span>
          Reports and screenshots are posted to the team&apos;s GitHub issue tracker, along with your role and user ID. Review each screenshot and use
          Redact to cover patient details before sending.
        </span>
      </p>

      <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 grid gap-3 border-t bg-background px-6 py-4">
        {status.phase === 'failed' && <SendFailure message={status.message} />}
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto hidden text-xs text-muted-foreground [@media(pointer:fine)]:sm:inline">
            <kbd className="font-sans">{isMac ? '⌘' : 'Ctrl'}</kbd> + <kbd className="font-sans">Enter</kbd> to send
          </span>
          <Button type="button" variant="outline" onClick={() => dispatch({ type: 'closed' })}>
            Close
          </Button>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  aria-disabled={Boolean(blocker) || sending || undefined}
                  className={cn((blocker || sending) && 'cursor-not-allowed opacity-50')}
                  onClick={trySubmit}
                >
                  {sending ? (
                    <>
                      <Spinner label="Sending report" />
                      Sending…
                    </>
                  ) : status.phase === 'failed' ? (
                    'Try again'
                  ) : (
                    'Send report'
                  )}
                </Button>
              </TooltipTrigger>
              {blocker && !sending && <TooltipContent>{blocker}</TooltipContent>}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-ring bg-background/90 text-sm font-medium">
          Drop images to attach them
        </div>
      )}
    </div>
  );
}

function SendFailure({ message }: { message: string }) {
  const { text, reference } = splitErrorReference(message);
  return (
    <div role="alert" className="rounded-md border border-destructive-border bg-destructive-soft p-3 text-sm text-destructive-text">
      <p className="font-medium">The report wasn&apos;t sent. Everything you wrote is still here.</p>
      <p className="mt-1">{text}</p>
      {reference && <p className="mt-1 text-xs">Reference: {reference}</p>}
    </div>
  );
}

function KindPicker({ value, onChange }: { value: IssueKind; onChange: (kind: IssueKind) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (event: KeyboardEvent, index: number) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + KINDS.length) % KINDS.length;
    onChange(KINDS[next].kind);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="What kind of report?" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
      {KINDS.map(({ kind, label, icon: Icon }, index) => {
        const selected = kind === value;
        return (
          <button
            key={kind}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(kind)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              'flex min-h-10 flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 text-center text-xs font-medium transition-colors sm:flex-row sm:gap-1.5 sm:whitespace-nowrap sm:px-1.5 sm:text-sm',
              selected ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="leading-tight">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ScreenshotTile({
  shot,
  index,
  redactions,
  onRemove,
  onRedact,
}: {
  shot: Screenshot;
  index: number;
  redactions: number;
  onRemove: () => void;
  onRedact: () => void;
}) {
  const url = useObjectUrl(shot.state === 'ready' ? shot.blob : null);
  const name = `screenshot ${index + 1}`;
  if (shot.state === 'capturing') {
    return (
      <li className="relative h-36 w-full overflow-hidden rounded-md border" role="status">
        <Skeleton className="size-full rounded-none" />
        <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Capturing screen…</span>
      </li>
    );
  }
  return (
    <li className="relative h-36 w-full overflow-hidden rounded-md border bg-muted">
      <button type="button" onClick={onRedact} aria-label={`Open ${name} to redact`} className="relative block size-full">
        {url && <img src={url} alt="" draggable={false} className="size-full object-contain" />}
        <span
          aria-hidden="true"
          className="absolute bottom-1 left-1 flex items-center gap-1 rounded border bg-background/90 px-1.5 py-0.5 text-xs font-medium shadow-sm"
        >
          <EyeOff className="size-3" aria-hidden="true" />
          {redactions > 0 ? `Redacted (${redactions})` : 'Redact'}
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full border bg-background/90 text-foreground shadow-sm hover:bg-background"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </li>
  );
}

function SuccessPanel({ number, url, onDone }: { number: number; url: string; onDone: () => void }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => doneRef.current?.focus(), []);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  };
  return (
    <div className="grid justify-items-center gap-4 py-4 text-center">
      <CircleCheck className="size-12 text-success" aria-hidden="true" />
      <DialogHeader className="items-center sm:text-center">
        <DialogTitle>Thanks, we&apos;ve got it</DialogTitle>
        <DialogDescription>Your report is issue #{number} on the team&apos;s tracker. Updates will appear there.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild variant="outline">
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden="true" />
            View on GitHub
          </a>
        </Button>
        <Button type="button" variant="outline" onClick={() => void copyLink()}>
          {copy === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copy === 'copied' ? 'Link copied' : 'Copy link'}
        </Button>
      </div>
      {copy === 'failed' && (
        <p role="status" className="max-w-full break-all text-xs text-muted-foreground">
          Couldn&apos;t copy automatically. The link is {url}
        </p>
      )}
      <Button ref={doneRef} type="button" className="min-w-32" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
