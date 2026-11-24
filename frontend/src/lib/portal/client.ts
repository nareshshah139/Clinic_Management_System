/**
 * The portal's own API client. Unlike the shared client it sends no cookie, never redirects, never
 * reads or writes browser storage, and puts the task token only in a POST body (PP-36).
 */
export type Lang = 'EN' | 'TE' | 'HI';
export type Text = Record<Lang, string>;
export type TaskItem = {
  key: string;
  type: 'scale' | 'single-choice' | 'multi-choice' | 'text' | 'photo';
  prompt: Text;
  required: boolean;
  min?: number;
  max?: number;
  options?: { value: string; label: Text }[];
};
export type TaskPage = { clinic: string; firstName: string; language: Lang; checkIns: { id: string; doctor: string; title: Text; items: TaskItem[] }[] };
export type Answer = number | string | string[];
export type SubmitResult = { status: 'saved'; urgent: boolean; clinicPhone?: string } | { status: 'already-answered' };
export type PortalResult<T> = { ok: true; data: T } | { ok: false; reason: 'inactive' | 'invalid' | 'network' };

async function post<T>(path: string, body: unknown): Promise<PortalResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api/portal/task/${path}`, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (res.status === 404) return { ok: false, reason: 'inactive' };
  if (res.status === 400 || res.status === 413) return { ok: false, reason: 'invalid' };
  if (!res.ok) return { ok: false, reason: 'network' };
  return { ok: true, data: (await res.json()) as T };
}

export const loadTask = (token: string) => post<TaskPage>('questions', { token });

export const submitAnswers = (token: string, checkInId: string, answers: Record<string, Answer>, photos: { itemKey: string; dataUrl: string }[]) =>
  post<SubmitResult>('responses', { token, checkInId, answers, photos });

/** Reads the token from the fragment and removes it from the address bar and history. */
export function takeTokenFromFragment(win: Pick<Window, 'location' | 'history'> = window): string {
  const token = win.location.hash.replace(/^#/, '');
  if (win.location.hash) win.history.replaceState(null, '', win.location.pathname + win.location.search);
  return token;
}
