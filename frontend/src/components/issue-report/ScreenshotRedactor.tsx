'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Highlighter, Square, Trash2, Undo2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useObjectUrl } from '@/hooks/use-object-url';
import { encodeCanvas } from '@/lib/issue-report';
import { cn } from '@/lib/utils';

type Tool = 'hide' | 'highlight';
/** Box coordinates are fractions of the image size, so they survive any display scaling. */
interface Box {
  tool: Tool;
  x: number;
  y: number;
  w: number;
  h: number;
}

const TOOLS: Array<{ tool: Tool; label: string; icon: typeof Square }> = [
  { tool: 'hide', label: 'Hide', icon: Square },
  { tool: 'highlight', label: 'Highlight', icon: Highlighter },
];

const MIN_BOX = 0.01;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

function boxBetween(tool: Tool, a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return { tool, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

async function burnIn(blob: Blob, boxes: Box[]): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    context.drawImage(image, 0, 0);
    context.lineWidth = Math.max(3, Math.round(Math.min(canvas.width, canvas.height) / 150));
    context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--destructive').trim();
    context.fillStyle = 'rgb(0, 0, 0)';
    for (const box of boxes) {
      const rect = [box.x * canvas.width, box.y * canvas.height, box.w * canvas.width, box.h * canvas.height] as const;
      if (box.tool === 'hide') context.fillRect(...rect);
      else context.strokeRect(...rect);
    }
    return await encodeCanvas(canvas, blob.type);
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface ScreenshotRedactorProps {
  blob: Blob;
  onDone: (blob: Blob) => void;
  onCancel: () => void;
}

export function ScreenshotRedactor({ blob, onDone, onCancel }: ScreenshotRedactorProps) {
  const url = useObjectUrl(blob);
  const surface = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>('hide');
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const point = (event: PointerEvent) => {
    const rect = surface.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
  };

  const finishBox = () => {
    if (start && current) {
      const box = boxBetween(tool, start, current);
      if (box.w > MIN_BOX && box.h > MIN_BOX) setBoxes((all) => [...all, box]);
    }
    setStart(null);
    setCurrent(null);
  };

  const done = async () => {
    if (boxes.length === 0) return onCancel();
    setSaving(true);
    setError(null);
    try {
      onDone(await burnIn(blob, boxes));
    } catch {
      setError("Couldn't save the changes to this screenshot. Try again, or remove it.");
      setSaving(false);
    }
  };

  const drawing = start && current ? boxBetween(tool, start, current) : null;

  return (
    <Dialog open onOpenChange={(open: boolean) => !open && !saving && onCancel()}>
      <DialogContent
        className="sm:max-w-[min(72rem,calc(100vw-2rem))]"
        onInteractOutside={(event: Event) => event.preventDefault()}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'z' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            setBoxes((all) => all.slice(0, -1));
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Redact screenshot</DialogTitle>
          <DialogDescription>Cover names, phone numbers and anything else that identifies a patient.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Drawing tool" className="flex gap-1 rounded-lg bg-muted p-1">
            {TOOLS.map(({ tool: value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={tool === value}
                onClick={() => setTool(value)}
                className={cn(
                  'flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
                  tool === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className={cn('size-4', value === 'hide' && 'fill-current')} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {tool === 'hide' ? 'Drag over anything private to black it out.' : 'Drag around the problem to point at it.'}
          </p>
          <div className="ml-auto flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!boxes.length || saving}
              onClick={() => setBoxes((all) => all.slice(0, -1))}
            >
              <Undo2 aria-hidden="true" />
              Undo
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={!boxes.length || saving} onClick={() => setBoxes([])}>
              <Trash2 aria-hidden="true" />
              Clear
            </Button>
          </div>
        </div>

        <div className="flex justify-center overflow-auto rounded-md bg-muted p-2">
          <div
            ref={surface}
            data-testid="redaction-surface"
            className="relative inline-block cursor-crosshair touch-none select-none"
            onPointerDown={(event) => {
              if (saving || event.button !== 0) return;
              event.currentTarget.setPointerCapture?.(event.pointerId);
              const at = point(event);
              setStart(at);
              setCurrent(at);
            }}
            onPointerMove={(event) => start && setCurrent(point(event))}
            onPointerUp={finishBox}
            onPointerCancel={() => {
              setStart(null);
              setCurrent(null);
            }}
          >
            {url && <img src={url} alt="Screenshot being redacted" draggable={false} className="block max-h-[65dvh] w-auto max-w-full" />}
            {[...boxes, ...(drawing ? [drawing] : [])].map((box, index) => (
              <div
                key={index}
                aria-hidden="true"
                className={cn('pointer-events-none absolute', box.tool === 'hide' ? 'bg-black' : 'border-[3px] border-destructive')}
                style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
              />
            ))}
          </div>
        </div>
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
