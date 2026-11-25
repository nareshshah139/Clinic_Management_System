import { renderTemplate } from '../../messaging/templates';
import { instrumentProblems, planProblems } from '../content';
import { readDataFiles } from '../plan-import';
import { checkInWindow, closeAfterOpening } from '../schedule';
import { deriveTaskToken, hashTaskToken, taskLinkUrl, verifyTaskToken } from '../task-link';
import { CHECK_IN_MOVES, checkInCan, trackCan } from '../lifecycle';

const ist = (s: string) => new Date(`${s}+05:30`);

describe('follow-up helpers', () => {
  const env = { ...process.env };
  beforeEach(() => Object.assign(process.env, { PORTAL_LINK_SECRET: 'unit-secret', PORTAL_BASE_URL: 'https://portal.example.test/' }));
  afterAll(() => { process.env = env; });

  it('PP-30: opens 09:00 IST on anchor+offset and closes 20:00 IST on the last window day', () => {
    expect(checkInWindow('2026-11-24', { offsetDays: 3, windowDays: 2 })).toEqual({
      opensAt: ist('2026-11-27T09:00:00'),
      closesAt: ist('2026-11-28T20:00:00'),
    });
  });

  it('PP-30: a late open keeps one whole 09:00-20:00 window', () => {
    const opensAt = ist('2026-11-27T09:00:00');
    const closesAt = ist('2026-11-27T20:00:00');
    expect(closeAfterOpening(opensAt, closesAt, ist('2026-11-27T10:00:00'))).toEqual(closesAt);
    expect(closeAfterOpening(opensAt, closesAt, ist('2026-11-27T21:00:00'))).toEqual(ist('2026-11-28T20:00:00'));
    expect(closeAfterOpening(opensAt, closesAt, ist('2026-11-29T06:00:00'))).toEqual(ist('2026-11-29T20:00:00'));
    expect(closeAfterOpening(opensAt, closesAt, ist('2026-11-29T12:00:00'))).toEqual(ist('2026-11-30T20:00:00'));
  });

  it('task tokens are 256-bit, derived from the link id, stored only as a hash, and rendered by one URL function', () => {
    const token = deriveTaskToken('tl_1');
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(deriveTaskToken('tl_1')).toBe(token);
    expect(deriveTaskToken('tl_2')).not.toBe(token);
    expect(verifyTaskToken(token, 'tl_1')).toBe(true);
    expect(verifyTaskToken(token, 'tl_2')).toBe(false);
    expect(hashTaskToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(taskLinkUrl(token)).toBe(`https://portal.example.test/t#${token}`);
  });

  it('PP-41: check-in and review templates carry the clinic, the token as a URL button, and nothing clinical', () => {
    const opened = renderTemplate('check_in_opened', { clinic: 'Linae', language: 'HI', linkId: 'tl_1', diagnosis: 'Acne', score: 9 });
    expect(opened).toMatchObject({ name: 'check_in_opened', language: 'hi' });
    expect((opened as any).components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'Linae' }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: deriveTaskToken('tl_1') }] },
    ]);
    expect(JSON.stringify(opened)).not.toMatch(/Acne|9/);
    expect(() => renderTemplate('check_in_reminder', { clinic: 'Linae' })).toThrow('needs a task link');
    const review = renderTemplate('review_reminder', { clinic: 'Linae', date: '2026-12-01', time: '10:30', doctor: 'Dr. M', medicine: 'X' });
    expect((review as any).components).toEqual([
      { type: 'body', parameters: ['Linae', '2026-12-01', '10:30', 'Dr. M'].map((text) => ({ type: 'text', text })) },
    ]);
  });

  it('PP-24: the shipped data files carry EN, TE and HI for every item, and a missing translation is refused', () => {
    const { instruments, plans } = readDataFiles();
    expect(instruments.flatMap(instrumentProblems)).toEqual([]);
    expect(plans.flatMap(planProblems)).toEqual([]);
    const broken = structuredClone(instruments[0]);
    delete (broken.items[0].prompt as any).TE;
    expect(instrumentProblems(broken).join()).toMatch(/TE/);
  });

  it('lifecycles are transition tables: terminal check-ins never move, stopped tracks never move', () => {
    expect(checkInCan('answer', 'OPEN')).toBe(true);
    expect(checkInCan('answer', 'SCHEDULED')).toBe(false);
    for (const s of ['ANSWERED', 'MISSED', 'CANCELLED'] as const) {
      expect(Object.keys(CHECK_IN_MOVES).some((m) => checkInCan(m as any, s))).toBe(false);
    }
    expect(trackCan('stop', 'STOPPED')).toBe(false);
    expect(trackCan('complete', 'ACTIVE')).toBe(true);
  });
});
