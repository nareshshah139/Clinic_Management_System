import { API_DIAGNOSTICS_KEY, type ApiDiagnostic } from './api-diagnostics';
import { normalizePdfColors } from './pdf-export';

export type IssueKind = 'bug' | 'idea' | 'question';
export type ScreenshotSource = 'capture' | 'upload' | 'paste';

export type Screenshot =
  | { id: string; source: 'capture'; state: 'capturing' }
  | { id: string; source: ScreenshotSource; state: 'ready'; blob: Blob };

export interface CapturedError {
  at: string;
  message: string;
  stack?: string;
}

export interface IssueReportContext {
  page: string;
  appVersion?: string;
  userAgent: string;
  viewport: string;
  timezone: string;
  occurredAt: string;
  recentRequests: Array<Omit<ApiDiagnostic, 'attempts'>>;
  recentErrors: CapturedError[];
}

export interface IssueDraft {
  kind: IssueKind;
  title: string;
  description: string;
  includeContext: boolean;
  screenshots: Screenshot[];
  errors: CapturedError[];
}

export type ReportStatus =
  | { phase: 'editing' }
  | { phase: 'submitting' }
  | { phase: 'submitted'; number: number; url: string }
  | { phase: 'failed'; message: string };

export interface ReportState {
  open: boolean;
  draft: IssueDraft;
  context: IssueReportContext | null;
  status: ReportStatus;
  resumed: boolean;
}

export interface ReportPrefill {
  kind?: IssueKind;
  title?: string;
  error?: CapturedError;
}

export type ReportAction =
  | { type: 'opened'; context: IssueReportContext; prefill?: ReportPrefill }
  | { type: 'closed' }
  | { type: 'discarded' }
  | { type: 'kindChanged'; kind: IssueKind }
  | { type: 'titleChanged'; title: string }
  | { type: 'descriptionChanged'; description: string }
  | { type: 'includeContextChanged'; includeContext: boolean }
  | { type: 'captureStarted'; id: string }
  | { type: 'captureFinished'; id: string; blob: Blob }
  | { type: 'captureFailed'; id: string }
  | { type: 'screenshotsAdded'; screenshots: Screenshot[] }
  | { type: 'screenshotRemoved'; id: string }
  | { type: 'screenshotRedacted'; id: string; blob: Blob }
  | { type: 'submitStarted' }
  | { type: 'submitSucceeded'; number: number; url: string }
  | { type: 'submitFailed'; message: string };

export const MAX_SCREENSHOTS = 5;
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 5000;
const MAX_ERRORS = 5;

export const emptyDraft = (): IssueDraft => ({
  kind: 'bug',
  title: '',
  description: '',
  includeContext: true,
  screenshots: [],
  errors: [],
});

export const initialReportState = (): ReportState => ({
  open: false,
  draft: emptyDraft(),
  context: null,
  status: { phase: 'editing' },
  resumed: false,
});

const mergeErrors = (errors: CapturedError[], extra?: CapturedError) =>
  extra && !errors.some((e) => e.message === extra.message) ? [...errors, extra].slice(-MAX_ERRORS) : errors;

function editDraft(state: ReportState, change: Partial<IssueDraft>): ReportState {
  if (state.status.phase === 'submitting' || state.status.phase === 'submitted') return state;
  return { ...state, draft: { ...state.draft, ...change } };
}

const mapShots = (state: ReportState, id: string, fn: (shot: Screenshot) => Screenshot | null) =>
  editDraft(state, {
    screenshots: state.draft.screenshots.flatMap((shot) => {
      if (shot.id !== id) return [shot];
      const next = fn(shot);
      return next ? [next] : [];
    }),
  });

export function reportReducer(state: ReportState, action: ReportAction): ReportState {
  switch (action.type) {
    case 'opened': {
      const { prefill } = action;
      const draft = state.draft;
      const titled = draft.title.trim() !== '';
      return {
        ...state,
        open: true,
        context: action.context,
        resumed: !isDraftEmpty(draft),
        status: state.status.phase === 'failed' ? { phase: 'editing' } : state.status,
        draft: {
          ...draft,
          kind: !titled && prefill?.kind ? prefill.kind : draft.kind,
          title: !titled && prefill?.title ? prefill.title.slice(0, TITLE_MAX) : draft.title,
          errors: mergeErrors(draft.errors, prefill?.error),
        },
      };
    }
    case 'closed':
      return state.status.phase === 'submitted' ? initialReportState() : { ...state, open: false };
    case 'discarded':
      return state.status.phase === 'submitting' ? state : { ...initialReportState(), open: state.open, context: state.context };
    case 'kindChanged':
      return editDraft(state, { kind: action.kind });
    case 'titleChanged':
      return editDraft(state, { title: action.title.slice(0, TITLE_MAX) });
    case 'descriptionChanged':
      return editDraft(state, { description: action.description.slice(0, DESCRIPTION_MAX) });
    case 'includeContextChanged':
      return editDraft(state, { includeContext: action.includeContext });
    case 'captureStarted':
      if (state.draft.screenshots.length >= MAX_SCREENSHOTS) return state;
      return editDraft(state, {
        screenshots: [{ id: action.id, source: 'capture', state: 'capturing' }, ...state.draft.screenshots],
      });
    case 'captureFinished':
      return mapShots(state, action.id, () => ({ id: action.id, source: 'capture', state: 'ready', blob: action.blob }));
    case 'captureFailed':
    case 'screenshotRemoved':
      return mapShots(state, action.id, () => null);
    case 'screenshotRedacted':
      return mapShots(state, action.id, (shot) => (shot.state === 'ready' ? { ...shot, blob: action.blob } : shot));
    case 'screenshotsAdded': {
      const room = MAX_SCREENSHOTS - state.draft.screenshots.length;
      return editDraft(state, { screenshots: [...state.draft.screenshots, ...action.screenshots.slice(0, Math.max(0, room))] });
    }
    case 'submitStarted':
      return submitBlocker(state.draft) || state.status.phase === 'submitting' || state.status.phase === 'submitted'
        ? state
        : { ...state, status: { phase: 'submitting' } };
    case 'submitSucceeded':
      return { ...state, status: { phase: 'submitted', number: action.number, url: action.url } };
    case 'submitFailed':
      return { ...state, status: { phase: 'failed', message: action.message } };
  }
}

export function submitBlocker(draft: IssueDraft): string | null {
  if (draft.title.trim().length < TITLE_MIN) return 'Add a short title first (at least 3 characters).';
  if (draft.screenshots.some((shot) => shot.state === 'capturing')) return 'Hold on, the screenshot is still being taken.';
  return null;
}

export const isDraftEmpty = (draft: IssueDraft) =>
  draft.title.trim() === '' && draft.description.trim() === '' && draft.screenshots.length === 0;

export function acceptImages(files: File[], slotsLeft: number): { accepted: File[]; problems: string[] } {
  const accepted: File[] = [];
  const problems: string[] = [];
  let skippedForRoom = 0;
  for (const file of files) {
    if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      problems.push(`"${file.name}" isn't a PNG, JPG or WebP image.`);
    } else if (file.size > MAX_SCREENSHOT_BYTES) {
      problems.push(`"${file.name}" is larger than 5 MB.`);
    } else if (accepted.length >= slotsLeft) {
      skippedForRoom++;
    } else {
      accepted.push(file);
    }
  }
  if (skippedForRoom) {
    problems.push(`You can attach up to ${MAX_SCREENSHOTS} screenshots. Remove one to add another.`);
  }
  return { accepted, problems };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_DIGITS = /\d{4,}/;
const OPAQUE_ID = /^(?=.*\d)(?=.*[a-z])[a-z0-9_-]{16,}$/i;

/** Record IDs here are cuids as well as UUIDs, so any identifier-looking segment is masked whole. */
export function scrubPath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0];
  return path
    .split('/')
    .map((segment) => (UUID.test(segment) || LONG_DIGITS.test(segment) || OPAQUE_ID.test(segment) ? ':id' : segment))
    .join('/');
}

const MAX_REQUESTS = 10;

function readDiagnostics(): ApiDiagnostic[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(API_DIAGNOSTICS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function recentRequests(): IssueReportContext['recentRequests'] {
  const newestFirst = readDiagnostics().reverse();
  const ordered = [...newestFirst.filter((entry) => entry.code !== 'success'), ...newestFirst.filter((entry) => entry.code === 'success')];
  return ordered.slice(0, MAX_REQUESTS).map(({ timestamp, requestId, resource, method, status, code, durationMs }) => ({
    timestamp,
    requestId,
    resource,
    method,
    status,
    code,
    durationMs,
  }));
}

export function buildContext(extraErrors: CapturedError[] = [], now = new Date()): IssueReportContext {
  const dpr = Number((window.devicePixelRatio || 1).toFixed(2));
  const errors = [...recentErrors()];
  for (const error of extraErrors) if (!errors.some((e) => e.message === error.message)) errors.push(error);
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION;
  return {
    page: scrubPath(window.location.pathname),
    ...(appVersion ? { appVersion } : {}),
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight} @${dpr}x`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    occurredAt: now.toISOString(),
    recentRequests: recentRequests(),
    recentErrors: errors.slice(-MAX_ERRORS),
  };
}

export function toCapturedError(reason: unknown, at = new Date()): CapturedError {
  const error = reason instanceof Error ? reason : null;
  const message = (error ? `${error.name}: ${error.message}` : String(reason)).slice(0, 300);
  const stack = error?.stack
    ?.split('\n')
    .slice(0, 6)
    .map((line) => line.slice(0, 200))
    .join('\n');
  return { at: at.toISOString(), message, ...(stack ? { stack } : {}) };
}

const errorRing: CapturedError[] = [];
let errorCaptureInstalled = false;

const remember = (error: CapturedError) => {
  errorRing.push(error);
  if (errorRing.length > MAX_ERRORS) errorRing.shift();
};

export function installErrorCapture(): void {
  if (errorCaptureInstalled || typeof window === 'undefined') return;
  errorCaptureInstalled = true;
  window.addEventListener('error', (event) => remember(toCapturedError(event.error ?? event.message)));
  window.addEventListener('unhandledrejection', (event) => remember(toCapturedError(event.reason)));
}

export const recentErrors = (): CapturedError[] => [...errorRing];

export function buildIssueFormData(draft: IssueDraft, context: IssueReportContext | null): FormData {
  const form = new FormData();
  form.append('kind', draft.kind);
  form.append('title', draft.title.trim());
  form.append('description', draft.description.trim());
  if (draft.includeContext && context) form.append('context', JSON.stringify(context));
  draft.screenshots.forEach((shot, index) => {
    if (shot.state !== 'ready') return;
    const extension = shot.blob.type === 'image/jpeg' ? 'jpg' : shot.blob.type.replace('image/', '');
    form.append('screenshots', shot.blob, `screenshot-${index + 1}.${extension}`);
  });
  return form;
}

export async function encodeCanvas(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  const toBlob = (as: string, quality?: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, as, quality));
  const preferred = await toBlob((ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type) ? type : 'image/png', 0.92);
  if (preferred && preferred.size <= MAX_SCREENSHOT_BYTES) return preferred;
  const smaller = await toBlob('image/jpeg', 0.8);
  if (!smaller) throw new Error('Could not encode the image');
  return smaller;
}

const IGNORED_IN_CAPTURE = '[data-radix-popper-content-wrapper], [role="region"][aria-label^="Notifications"]';

const CAPTURE_CLONE_CSS = [
  '*, *::before, *::after { box-shadow: none !important; }',
  'details:not([open]) > :not(summary) { display: none !important; }',
  'summary { list-style: none !important; }',
].join('\n');

export function prepareCaptureClone(clone: Document): void {
  const style = clone.createElement('style');
  style.textContent = CAPTURE_CLONE_CSS;
  clone.head.appendChild(style);
}

let html2canvasModule: Promise<typeof import('html2canvas')> | null = null;
export const preloadScreenCapture = () =>
  (html2canvasModule ??= import('html2canvas').catch((error) => {
    html2canvasModule = null;
    throw error;
  }));

/**
 * html2canvas clones the DOM synchronously inside its first call, so the caller can open the dialog as
 * soon as this resolves and the dialog will not appear in the shot.
 */
export async function startViewportCapture(): Promise<{ image: Promise<Blob> }> {
  const { default: html2canvas } = await preloadScreenCapture();
  const rendering = html2canvas(document.body, {
    x: window.scrollX,
    y: window.scrollY,
    width: window.innerWidth,
    height: window.innerHeight,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
    logging: false,
    ignoreElements: (element) => element.matches(IGNORED_IN_CAPTURE),
    onclone: (clone) => {
      normalizePdfColors(clone);
      prepareCaptureClone(clone);
    },
  });
  const image = rendering.then((canvas) =>
    encodeCanvas(canvas, 'image/png').finally(() => {
      canvas.width = canvas.height = 0;
    }),
  );
  return { image };
}

let screenshotCounter = 0;
export const newScreenshotId = () => `shot-${++screenshotCounter}`;
