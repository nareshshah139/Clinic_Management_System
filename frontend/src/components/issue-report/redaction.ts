import { encodeCanvas } from '@/lib/issue-report';

export type RedactionTool = 'hide' | 'highlight';
export type Handle = 'nw' | 'ne' | 'sw' | 'se';

/** A box in image pixels. Zoom, pan and display size never change it. */
export interface Redaction {
  id: string;
  tool: RedactionTool;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ImageSize {
  w: number;
  h: number;
}

/** What the dialog keeps after Done so reopening edits the same boxes on the untouched original. */
export interface RedactionSession {
  original: Blob;
  boxes: Redaction[];
  result: Blob;
}

export const MIN_SIDE = 4;
export const ZOOM_LEVELS = [1, 1.5, 2, 3, 4, 6, 8] as const;
export const MIN_ZOOM = ZOOM_LEVELS[0];
export const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

let sequence = 0;
export const newRedactionId = () => `redaction-${++sequence}`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const clampZoom = (zoom: number) => clamp(zoom, MIN_ZOOM, MAX_ZOOM);
export const nextZoom = (zoom: number) => ZOOM_LEVELS.find((level) => level > zoom + 0.001) ?? MAX_ZOOM;
export const previousZoom = (zoom: number) => [...ZOOM_LEVELS].reverse().find((level) => level < zoom - 0.001) ?? MIN_ZOOM;

export function boxBetween(id: string, tool: RedactionTool, a: Point, b: Point): Redaction {
  return { id, tool, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function moveBox(box: Redaction, dx: number, dy: number, size: ImageSize): Redaction {
  return {
    ...box,
    x: clamp(Math.round(box.x + dx), 0, Math.max(0, size.w - box.w)),
    y: clamp(Math.round(box.y + dy), 0, Math.max(0, size.h - box.h)),
  };
}

export function resizeBox(box: Redaction, handle: Handle, dx: number, dy: number, size: ImageSize): Redaction {
  let left = box.x;
  let top = box.y;
  let right = box.x + box.w;
  let bottom = box.y + box.h;
  if (handle.endsWith('w')) left = clamp(Math.round(left + dx), 0, right - MIN_SIDE);
  else right = clamp(Math.round(right + dx), left + MIN_SIDE, size.w);
  if (handle.startsWith('n')) top = clamp(Math.round(top + dy), 0, bottom - MIN_SIDE);
  else bottom = clamp(Math.round(bottom + dy), top + MIN_SIDE, size.h);
  return { ...box, x: left, y: top, w: right - left, h: bottom - top };
}

interface History {
  past: Redaction[][];
  present: Redaction[];
  future: Redaction[][];
}

export type HistoryAction =
  | { type: 'commit'; boxes: Redaction[]; merge?: boolean }
  | { type: 'undo' }
  | { type: 'redo' };

export const initialHistory = (boxes: Redaction[]): History => ({ past: [], present: boxes, future: [] });

export function historyReducer(history: History, action: HistoryAction): History {
  switch (action.type) {
    case 'commit':
      if (action.merge && history.past.length > 0) return { ...history, present: action.boxes, future: [] };
      return { past: [...history.past, history.present], present: action.boxes, future: [] };
    case 'undo': {
      const previous = history.past[history.past.length - 1];
      if (!previous) return history;
      return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
    }
    case 'redo': {
      const [next, ...rest] = history.future;
      if (!next) return history;
      return { past: [...history.past, history.present], present: next, future: rest };
    }
  }
}

/** Draws the boxes onto a copy of the image at full resolution. Returns the original when there is nothing to draw. */
export async function flatten(blob: Blob, boxes: Redaction[]): Promise<Blob> {
  if (boxes.length === 0) return blob;
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
    context.lineWidth = highlightWidth({ w: canvas.width, h: canvas.height });
    context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--destructive').trim();
    context.fillStyle = 'rgb(0, 0, 0)';
    for (const box of boxes) {
      if (box.tool === 'hide') context.fillRect(box.x, box.y, box.w, box.h);
      else context.strokeRect(box.x, box.y, box.w, box.h);
    }
    return await encodeCanvas(canvas, blob.type);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const highlightWidth = (size: ImageSize) => Math.max(3, Math.round(Math.min(size.w, size.h) / 150));
