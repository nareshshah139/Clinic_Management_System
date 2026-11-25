'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Eraser, Hand, Highlighter, Maximize, MousePointer2, Redo2, Square, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useObjectUrl } from '@/hooks/use-object-url';
import { cn } from '@/lib/utils';
import {
  MAX_ZOOM,
  boxBetween,
  clampZoom,
  flatten,
  highlightWidth,
  historyReducer,
  initialHistory,
  moveBox,
  newRedactionId,
  nextZoom,
  previousZoom,
  resizeBox,
  type Handle,
  type ImageSize,
  type Point,
  type Redaction,
  type RedactionTool,
} from './redaction';

type Tool = RedactionTool | 'select' | 'pan';

const TOOLS: Array<{ tool: Tool; label: string; icon: typeof Square; hint: string }> = [
  { tool: 'hide', label: 'Hide', icon: Square, hint: 'Drag over anything private to black it out.' },
  { tool: 'highlight', label: 'Highlight', icon: Highlighter, hint: 'Drag around the problem to point at it.' },
  { tool: 'select', label: 'Select', icon: MousePointer2, hint: 'Tap a box to move it. Drag its corners to resize it.' },
  { tool: 'pan', label: 'Pan', icon: Hand, hint: 'Drag to move around the zoomed screenshot. Two fingers pan and pinch in any tool.' },
];

const HANDLES: Array<{ handle: Handle; className: string }> = [
  { handle: 'nw', className: 'left-0 top-0 cursor-nwse-resize' },
  { handle: 'ne', className: 'left-full top-0 cursor-nesw-resize' },
  { handle: 'sw', className: 'left-0 top-full cursor-nesw-resize' },
  { handle: 'se', className: 'left-full top-full cursor-nwse-resize' },
];

const KEY_STEP_PX = 8;
const MIN_DRAWN_PX = 6;
const NUDGE_MERGE_MS = 800;
const DRAFT_ID = 'draft';
const PADDING = 8;

type Gesture =
  | { kind: 'draw'; tool: RedactionTool; from: Point }
  | { kind: 'move'; id: string; from: Point; origin: Redaction }
  | { kind: 'resize'; id: string; handle: Handle; from: Point; origin: Redaction }
  | { kind: 'pan'; x: number; y: number; left: number; top: number };

interface Anchor {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
}

interface View {
  zoom: number;
  anchor: Anchor | null;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

interface ScreenshotRedactorProps {
  blob: Blob;
  initialBoxes?: Redaction[];
  onDone: (blob: Blob, boxes: Redaction[]) => void;
  onCancel: () => void;
}

export function ScreenshotRedactor({ blob, initialBoxes, onDone, onCancel }: ScreenshotRedactorProps) {
  const url = useObjectUrl(blob);
  const hintId = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const boxEls = useRef(new Map<string, HTMLDivElement>());
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const pinch = useRef<{ distance: number; zoom: number; fx: number; fy: number } | null>(null);
  const lastNudge = useRef<{ id: string; at: number } | null>(null);
  const viewRef = useRef<View>({ zoom: 1, anchor: null });

  const [tool, setTool] = useState<Tool>('hide');
  const [history, dispatch] = useReducer(historyReducer, initialBoxes ?? [], initialHistory);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [live, setLive] = useState<Redaction | null>(null);
  const [natural, setNatural] = useState<ImageSize | null>(null);
  const [fit, setFit] = useState(0);
  const [view, setView] = useState<View>({ zoom: 1, anchor: null });
  const [focusRequest, setFocusRequest] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boxes = history.present;
  const zoom = view.zoom;
  viewRef.current = view;
  const shownWidth = fit > 0 ? fit * zoom : 0;
  const scale = natural && shownWidth > 0 ? shownWidth / natural.w : 1;
  const selected = boxes.find((box) => box.id === selectedId) ?? null;

  useLayoutEffect(() => {
    const host = viewport.current?.parentElement;
    if (!host || !natural) return;
    const measure = () => {
      const width = host.clientWidth - PADDING * 2;
      const height = window.innerHeight * 0.55 - PADDING * 2;
      setFit(Math.max(0, Math.min(width, (height * natural.w) / natural.h, natural.w)));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(host);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [natural]);

  useLayoutEffect(() => {
    const { anchor } = view;
    const el = viewport.current;
    const surface = stage.current;
    if (!anchor || !el || !surface) return;
    const rect = surface.getBoundingClientRect();
    el.scrollLeft += rect.left + anchor.fx * rect.width - anchor.cx;
    el.scrollTop += rect.top + anchor.fy * rect.height - anchor.cy;
  }, [view]);

  const zoomTo = (next: number, at?: Point, fractions?: { fx: number; fy: number }) => {
    const el = viewport.current;
    const surface = stage.current;
    if (!el || !surface) return;
    const rect = surface.getBoundingClientRect();
    const bounds = el.getBoundingClientRect();
    const cx = at?.x ?? bounds.left + bounds.width / 2;
    const cy = at?.y ?? bounds.top + bounds.height / 2;
    const fx = fractions?.fx ?? (rect.width ? clamp01((cx - rect.left) / rect.width) : 0.5);
    const fy = fractions?.fy ?? (rect.height ? clamp01((cy - rect.top) / rect.height) : 0.5);
    setView({ zoom: clampZoom(next), anchor: { fx, fy, cx, cy } });
  };

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (event: globalThis.WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      zoomTo(viewRef.current.zoom * Math.exp(-event.deltaY * 0.01), { x: event.clientX, y: event.clientY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  useEffect(() => {
    if (!focusRequest) return;
    (boxEls.current.get(focusRequest) ?? viewport.current)?.focus();
    setFocusRequest(null);
  }, [focusRequest]);

  const toImage = (event: { clientX: number; clientY: number }): Point | null => {
    const rect = stage.current?.getBoundingClientRect();
    if (!rect || !natural || rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.round(clamp01((event.clientX - rect.left) / rect.width) * natural.w),
      y: Math.round(clamp01((event.clientY - rect.top) / rect.height) * natural.h),
    };
  };

  const screenScale = () => {
    const rect = stage.current?.getBoundingClientRect();
    return natural && rect && rect.width > 0 ? rect.width / natural.w : 1;
  };

  const commit = (next: Redaction[], merge = false) => dispatch({ type: 'commit', boxes: next, merge });

  const replaceBox = (box: Redaction) => boxes.map((existing) => (existing.id === box.id ? box : existing));

  const remove = (id: string) => {
    const index = boxes.findIndex((box) => box.id === id);
    if (index < 0) return;
    const rest = boxes.filter((box) => box.id !== id);
    commit(rest);
    setSelectedId(null);
    setFocusRequest(rest[index]?.id ?? rest[index - 1]?.id ?? 'viewport');
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    const rect = stage.current?.getBoundingClientRect();
    const mid = midpoint(a, b);
    gesture.current = null;
    setLive(null);
    pinch.current = {
      distance: Math.max(1, distance(a, b)),
      zoom: viewRef.current.zoom,
      fx: rect?.width ? clamp01((mid.x - rect.left) / rect.width) : 0.5,
      fy: rect?.height ? clamp01((mid.y - rect.top) / rect.height) : 0.5,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (saving || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) return startPinch();
    if (pointers.current.size > 2) return;

    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-box-id]');
    const at = toImage(event);
    if (tool === 'pan') {
      const el = viewport.current;
      if (el) gesture.current = { kind: 'pan', x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
    } else if (tool === 'select') {
      const origin = boxes.find((box) => box.id === target?.dataset.boxId);
      setSelectedId(origin?.id ?? null);
      if (!origin || !at) return;
      const handle = target?.dataset.handle as Handle | undefined;
      gesture.current = handle ? { kind: 'resize', id: origin.id, handle, from: at, origin } : { kind: 'move', id: origin.id, from: at, origin };
    } else if (at) {
      gesture.current = { kind: 'draw', tool, from: at };
      setLive(boxBetween(DRAFT_ID, tool, at, at));
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const { distance: start, zoom: startZoom, fx, fy } = pinch.current;
      zoomTo(startZoom * (distance(a, b) / start), midpoint(a, b), { fx, fy });
      return;
    }
    const active = gesture.current;
    if (!active) return;
    if (active.kind === 'pan') {
      const el = viewport.current;
      if (el) {
        el.scrollLeft = active.left - (event.clientX - active.x);
        el.scrollTop = active.top - (event.clientY - active.y);
      }
      return;
    }
    const at = toImage(event);
    if (!at || !natural) return;
    if (active.kind === 'draw') setLive(boxBetween(DRAFT_ID, active.tool, active.from, at));
    else if (active.kind === 'move') setLive(moveBox(active.origin, at.x - active.from.x, at.y - active.from.y, natural));
    else setLive(resizeBox(active.origin, active.handle, at.x - active.from.x, at.y - active.from.y, natural));
  };

  const endGesture = (commitChange: boolean) => {
    const active = gesture.current;
    gesture.current = null;
    const box = live;
    setLive(null);
    if (!commitChange || !active || !box) return;
    if (active.kind === 'draw') {
      const pixelScale = screenScale();
      if (box.w * pixelScale < MIN_DRAWN_PX || box.h * pixelScale < MIN_DRAWN_PX) return;
      const drawn = { ...box, id: newRedactionId() };
      commit([...boxes, drawn]);
      setSelectedId(drawn.id);
    } else if (active.kind === 'move' || active.kind === 'resize') {
      commit(replaceBox(box));
    }
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>, commitChange: boolean) => {
    if (!pointers.current.delete(event.pointerId)) return;
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    endGesture(commitChange);
  };

  const nudge = (box: Redaction, event: KeyboardEvent<HTMLDivElement>) => {
    if (!natural) return;
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = Math.max(1, Math.round(KEY_STEP_PX / screenScale()));
    const [dx, dy] = [direction[0] * step, direction[1] * step];
    const next = event.shiftKey ? resizeBox(box, 'se', dx, dy, natural) : moveBox(box, dx, dy, natural);
    const now = Date.now();
    const merge = lastNudge.current?.id === box.id && now - lastNudge.current.at < NUDGE_MERGE_MS;
    lastNudge.current = { id: box.id, at: now };
    commit(replaceBox(next), merge);
  };

  const onBoxKeyDown = (box: Redaction, event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || saving) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      remove(box.id);
    } else {
      nudge(box, event);
    }
  };

  const done = async () => {
    if (history.past.length === 0) return onCancel();
    setSaving(true);
    setError(null);
    try {
      onDone(await flatten(blob, boxes), boxes);
    } catch {
      setError("Couldn't save the changes to this screenshot. Try again, or remove it.");
      setSaving(false);
    }
  };

  const shortcut = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey) || saving) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) dispatch({ type: 'undo' });
    else if ((key === 'z' && event.shiftKey) || key === 'y') dispatch({ type: 'redo' });
    else return;
    event.preventDefault();
  };

  const shown = boxes.map((box) => (live && live.id === box.id ? live : box));
  const activeHint = TOOLS.find((entry) => entry.tool === tool)?.hint;
  const lineWidth = natural ? highlightWidth(natural) * scale : 3;

  return (
    <Dialog open onOpenChange={(open: boolean) => !open && !saving && onCancel()}>
      <DialogContent
        className="[&>*]:min-w-0 sm:max-w-[min(72rem,calc(100vw-2rem))]"
        onInteractOutside={(event: Event) => event.preventDefault()}
        onKeyDown={shortcut}
      >
        <DialogHeader>
          <DialogTitle>Redact screenshot</DialogTitle>
          <DialogDescription>Cover names, phone numbers and anything else that identifies a patient.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Drawing tool" className="grid w-full grid-cols-4 gap-1 rounded-lg bg-muted p-1 sm:flex sm:w-auto">
            {TOOLS.map(({ tool: value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={tool === value}
                onClick={() => setTool(value)}
                className={cn(
                  'flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-xs font-medium transition-colors sm:min-h-9 sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm',
                  tool === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className={cn('size-4', value === 'hide' && 'fill-current')} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Zoom" className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label="Zoom out" disabled={zoom <= 1 || saving} onClick={() => zoomTo(previousZoom(zoom))}>
              <ZoomOut aria-hidden="true" />
            </Button>
            <span className="min-w-12 text-center text-sm tabular-nums text-muted-foreground" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <Button type="button" variant="ghost" size="icon" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM || saving} onClick={() => zoomTo(nextZoom(zoom))}>
              <ZoomIn aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={zoom === 1 || saving} onClick={() => zoomTo(1)}>
              <Maximize aria-hidden="true" />
              Fit
            </Button>
          </div>
          <div className="ml-auto flex gap-1">
            <ToolbarButton label="Undo" icon={<Undo2 aria-hidden="true" />} disabled={!history.past.length || saving} onClick={() => dispatch({ type: 'undo' })} />
            <ToolbarButton label="Redo" icon={<Redo2 aria-hidden="true" />} disabled={!history.future.length || saving} onClick={() => dispatch({ type: 'redo' })} />
            <ToolbarButton label="Delete box" icon={<Trash2 aria-hidden="true" />} disabled={!selected || saving} onClick={() => selected && remove(selected.id)} />
            <ToolbarButton
              label="Clear all"
              icon={<Eraser aria-hidden="true" />}
              disabled={!boxes.length || saving}
              onClick={() => {
                commit([]);
                setSelectedId(null);
              }}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{activeHint}</p>

        <div className="flex min-w-0 flex-col">
          <div
            ref={viewport}
            tabIndex={-1}
            data-testid="redaction-viewport"
            className="flex max-h-[55dvh] min-h-24 overflow-auto rounded-md bg-muted outline-none"
            style={{ padding: PADDING }}
          >
            <div
              ref={stage}
              data-testid="redaction-surface"
              className={cn(
                'relative m-auto shrink-0 touch-none select-none',
                tool === 'pan' ? 'cursor-grab' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair',
              )}
              style={{ width: shownWidth > 0 ? `${shownWidth}px` : `${zoom * 100}%` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => onPointerEnd(event, true)}
              onPointerCancel={(event) => onPointerEnd(event, false)}
            >
              {url && (
                <img
                  src={url}
                  alt="Screenshot being redacted"
                  draggable={false}
                  className="block h-auto w-full"
                  onLoad={(event) => {
                    const { naturalWidth, naturalHeight } = event.currentTarget;
                    if (naturalWidth > 0 && naturalHeight > 0) setNatural({ w: naturalWidth, h: naturalHeight });
                  }}
                />
              )}
              {natural &&
                shown.map((box, index) => (
                  <BoxView
                    key={box.id}
                    box={box}
                    size={natural}
                    label={`Redaction ${index + 1} of ${boxes.length}${box.tool === 'highlight' ? ' (highlight)' : ''}`}
                    hintId={hintId}
                    selected={box.id === selectedId}
                    interactive={tool === 'select'}
                    lineWidth={lineWidth}
                    register={(el) => (el ? boxEls.current.set(box.id, el) : boxEls.current.delete(box.id))}
                    onFocus={() => setSelectedId(box.id)}
                    onKeyDown={(event) => onBoxKeyDown(box, event)}
                  />
                ))}
              {natural && live?.id === DRAFT_ID && <BoxView box={live} size={natural} lineWidth={lineWidth} draft />}
            </div>
          </div>
        </div>
        <p id={hintId} className="sr-only">
          Arrow keys move the box. Shift plus arrow keys resize it. Delete removes it.
        </p>
        <p className="sr-only" role="status">
          {boxes.length === 1 ? '1 box drawn' : `${boxes.length} boxes drawn`}
        </p>

        {error && (
          <p role="alert" className="text-sm text-destructive-text">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => void done()}>
            {saving && <Spinner label="Saving screenshot" />}
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToolbarButton({ label, icon, disabled, onClick }: { label: string; icon: ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" aria-label={label} disabled={disabled} onClick={onClick}>
      {icon}
      <span className="max-sm:hidden">{label}</span>
    </Button>
  );
}

interface BoxViewProps {
  box: Redaction;
  size: ImageSize;
  lineWidth: number;
  label?: string;
  hintId?: string;
  selected?: boolean;
  interactive?: boolean;
  draft?: boolean;
  register?: (el: HTMLDivElement | null) => void;
  onFocus?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}

function BoxView({ box, size, lineWidth, label, hintId, selected, interactive, draft, register, onFocus, onKeyDown }: BoxViewProps) {
  const hide = box.tool === 'hide';
  return (
    <div
      ref={register}
      role={draft ? undefined : 'button'}
      aria-hidden={draft || undefined}
      aria-label={label}
      aria-describedby={draft ? undefined : hintId}
      aria-pressed={draft ? undefined : Boolean(selected)}
      tabIndex={draft ? undefined : 0}
      data-box-id={draft ? undefined : box.id}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      className={cn(
        'absolute outline-none',
        hide ? 'bg-black' : 'border-destructive',
        interactive ? 'pointer-events-auto cursor-move' : 'pointer-events-none',
        !draft && 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
      )}
      style={{
        left: `${(box.x / size.w) * 100}%`,
        top: `${(box.y / size.h) * 100}%`,
        width: `${(box.w / size.w) * 100}%`,
        height: `${(box.h / size.h) * 100}%`,
        ...(hide ? null : { borderStyle: 'solid', borderWidth: Math.max(2, lineWidth) }),
      }}
    >
      {selected && interactive && !draft && HANDLES.map(({ handle, className }) => (
        <span
          key={handle}
          aria-hidden="true"
          data-box-id={box.id}
          data-handle={handle}
          className={cn('absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center', className)}
        >
          <span className="size-3.5 rounded-full border-2 border-ring bg-background" />
        </span>
      ))}
    </div>
  );
}
