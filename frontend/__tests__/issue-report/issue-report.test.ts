import { API_DIAGNOSTICS_KEY } from '@/lib/api-diagnostics';
import {
  acceptImages,
  buildContext,
  initialReportState,
  installErrorCapture,
  recentErrors,
  reportReducer,
  scrubPath,
  type IssueReportContext,
  type ReportAction,
  type ReportState,
} from '@/lib/issue-report';

const context: IssueReportContext = {
  page: '/dashboard/patients/:id',
  userAgent: 'test',
  viewport: '1024x768 @1x',
  timezone: 'Asia/Kolkata',
  occurredAt: '2026-11-17T05:00:00.000Z',
  recentRequests: [],
  recentErrors: [],
};
const png = new Blob(['png'], { type: 'image/png' });
const redacted = new Blob(['redacted'], { type: 'image/png' });
const run = (...actions: ReportAction[]) => actions.reduce(reportReducer, initialReportState());

describe('reportReducer', () => {
  it('opens a fresh draft with the prefill and the error it came from', () => {
    const error = { at: '2026-11-17T05:00:00.000Z', message: 'TypeError: x is undefined' };
    expect(run({ type: 'opened', context, prefill: { kind: 'bug', title: 'Page error: x is undefined', error } })).toEqual({
      open: true,
      resumed: false,
      context,
      status: { phase: 'editing' },
      draft: { kind: 'bug', title: 'Page error: x is undefined', description: '', includeContext: true, screenshots: [], errors: [error] },
    });
  });

  it('keeps the draft through an accidental close and marks it resumed on reopen', () => {
    const state = run(
      { type: 'opened', context },
      { type: 'kindChanged', kind: 'idea' },
      { type: 'titleChanged', title: 'Bulk reschedule' },
      { type: 'closed' },
      { type: 'opened', context, prefill: { kind: 'bug', title: 'Ignored because a title exists' } },
    );
    expect(state.open).toBe(true);
    expect(state.resumed).toBe(true);
    expect(state.draft).toEqual({
      kind: 'idea',
      title: 'Bulk reschedule',
      description: '',
      includeContext: true,
      screenshots: [],
      errors: [],
    });
  });

  it('replaces the capture placeholder with the image, then the redacted image', () => {
    const state = run(
      { type: 'opened', context },
      { type: 'captureStarted', id: 'a' },
      { type: 'screenshotsAdded', screenshots: [{ id: 'b', source: 'paste', state: 'ready', blob: png }] },
    );
    expect(state.draft.screenshots).toEqual([
      { id: 'a', source: 'capture', state: 'capturing' },
      { id: 'b', source: 'paste', state: 'ready', blob: png },
    ]);
    const done = [
      { type: 'captureFinished', id: 'a', blob: png },
      { type: 'screenshotRedacted', id: 'a', blob: redacted },
      { type: 'screenshotRemoved', id: 'b' },
    ] as ReportAction[];
    expect(done.reduce(reportReducer, state).draft.screenshots).toEqual([{ id: 'a', source: 'capture', state: 'ready', blob: redacted }]);
  });

  it('drops a failed capture and ignores a capture that finishes after its tile was removed', () => {
    const state = run({ type: 'opened', context }, { type: 'captureStarted', id: 'a' }, { type: 'captureStarted', id: 'b' });
    const after = [
      { type: 'captureFailed', id: 'a' },
      { type: 'screenshotRemoved', id: 'b' },
      { type: 'captureFinished', id: 'b', blob: png },
    ] as ReportAction[];
    expect(after.reduce(reportReducer, state).draft.screenshots).toEqual([]);
  });

  it('caps screenshots at five', () => {
    const shots = Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, source: 'upload' as const, state: 'ready' as const, blob: png }));
    expect(run({ type: 'screenshotsAdded', screenshots: shots }).draft.screenshots.map((s) => s.id)).toEqual([
      's0',
      's1',
      's2',
      's3',
      's4',
    ]);
  });

  it('refuses to start sending until the title has three characters', () => {
    expect(run({ type: 'opened', context }, { type: 'titleChanged', title: ' ab ' }, { type: 'submitStarted' }).status).toEqual({
      phase: 'editing',
    });
    expect(run({ type: 'opened', context }, { type: 'titleChanged', title: 'abc' }, { type: 'submitStarted' }).status).toEqual({
      phase: 'submitting',
    });
  });

  it('freezes the draft while sending and keeps it after a failure', () => {
    const sending = run({ type: 'opened', context }, { type: 'titleChanged', title: 'Print fails' }, { type: 'submitStarted' });
    expect(reportReducer(sending, { type: 'titleChanged', title: 'changed' }).draft.title).toBe('Print fails');
    const failed = reportReducer(sending, { type: 'submitFailed', message: "GitHub didn't accept the report." });
    expect(failed.status).toEqual({ phase: 'failed', message: "GitHub didn't accept the report." });
    expect(failed.draft.title).toBe('Print fails');
  });

  it('clears the draft when the success panel is closed', () => {
    const state = run(
      { type: 'opened', context },
      { type: 'titleChanged', title: 'Print fails' },
      { type: 'submitStarted' },
      { type: 'submitSucceeded', number: 42, url: 'https://github.com/o/r/issues/42' },
    );
    expect(state.status).toEqual({ phase: 'submitted', number: 42, url: 'https://github.com/o/r/issues/42' });
    expect(reportReducer(state, { type: 'closed' })).toEqual(initialReportState());
  });

  it('starts over without closing', () => {
    const state: ReportState = run({ type: 'opened', context }, { type: 'titleChanged', title: 'Old' }, { type: 'discarded' });
    expect(state).toEqual({ ...initialReportState(), open: true, context });
  });
});

describe('scrubPath', () => {
  it.each([
    ['/dashboard/patients/3f2b1c9e-4d5a-4b6c-8d7e-9f0a1b2c3d4e', '/dashboard/patients/:id'],
    ['/dashboard/patients/clx9a8b7c0000abcdef123456/visits', '/dashboard/patients/:id/visits'],
    ['/dashboard/billing/INV-20261117?tab=due#row', '/dashboard/billing/:id'],
    ['/dashboard/stock-predictions', '/dashboard/stock-predictions'],
    ['/dashboard/rooms/12', '/dashboard/rooms/12'],
  ])('%s -> %s', (input, expected) => {
    expect(scrubPath(input)).toBe(expected);
  });
});

describe('buildContext', () => {
  const entry = (n: number, code: string, status: number) => ({
    timestamp: `2026-11-17T05:00:${String(n).padStart(2, '0')}.000Z`,
    requestId: `11111111-1111-4111-8111-1111111111${String(n).padStart(2, '0')}`,
    resource: 'patients',
    method: 'GET',
    status,
    code,
    durationMs: n,
    attempts: 1,
  });

  it('puts failures first, newest first, and keeps ten', () => {
    const log = Array.from({ length: 14 }, (_, n) => (n === 2 || n === 9 ? entry(n, 'http_error', 500) : entry(n, 'success', 200)));
    sessionStorage.setItem(API_DIAGNOSTICS_KEY, JSON.stringify(log));
    window.history.pushState({}, '', '/dashboard/visits/clx9a8b7c0000abcdef123456?draft=1');
    const built = buildContext([], new Date('2026-11-17T05:01:00.000Z'));
    expect(built.recentRequests.map((r) => r.durationMs)).toEqual([9, 2, 13, 12, 11, 10, 8, 7, 6, 5]);
    expect(built.recentRequests[0]).toEqual({
      timestamp: '2026-11-17T05:00:09.000Z',
      requestId: '11111111-1111-4111-8111-111111111109',
      resource: 'patients',
      method: 'GET',
      status: 500,
      code: 'http_error',
      durationMs: 9,
    });
    expect(built.page).toBe('/dashboard/visits/:id');
    expect(built.occurredAt).toBe('2026-11-17T05:01:00.000Z');
    expect(built.viewport).toBe('1024x768 @1x');
  });

  it('survives unreadable diagnostics', () => {
    sessionStorage.setItem(API_DIAGNOSTICS_KEY, '{not json');
    expect(buildContext().recentRequests).toEqual([]);
  });
});

describe('error capture', () => {
  it('keeps the last five window errors and unhandled rejections, once installed', () => {
    installErrorCapture();
    installErrorCapture();
    for (let i = 1; i <= 6; i++) window.dispatchEvent(new ErrorEvent('error', { message: `boom ${i}` }));
    const rejection = new Event('unhandledrejection') as Event & { reason: unknown };
    rejection.reason = new RangeError('too far');
    window.dispatchEvent(rejection);
    expect(recentErrors().map((e) => e.message)).toEqual(['boom 3', 'boom 4', 'boom 5', 'boom 6', 'RangeError: too far']);
  });
});

describe('acceptImages', () => {
  it('explains each rejected file and keeps the rest', () => {
    const ok = new File(['x'], 'a.png', { type: 'image/png' });
    const pdf = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.jpg', { type: 'image/jpeg' });
    const extra = new File(['x'], 'b.webp', { type: 'image/webp' });
    expect(acceptImages([ok, pdf, big, extra], 1)).toEqual({
      accepted: [ok],
      problems: [
        '"notes.pdf" isn\'t a PNG, JPG or WebP image.',
        '"huge.jpg" is larger than 5 MB.',
        'You can attach up to 5 screenshots. Remove one to add another.',
      ],
    });
  });
});
