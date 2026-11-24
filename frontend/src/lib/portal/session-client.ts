/**
 * The signed-in portal's API client. The session lives only in the __Host-portal_session cookie,
 * which the browser sends to this origin; nothing is kept in browser storage (PP-58).
 */
import type { Lang, Text } from './client';

export type Profile = { ref: string; firstName: string; branch: string };
export type ProfileList = { profiles: Profile[]; chosen: string | null };
export type Appointment = { date: string; slot: string; status: string; doctor: string | null; branch: string };
export type RxLine = Record<string, string | number | boolean | undefined> & { drugName: string };
export type Prescription = { status: string; language: Lang | string; items: RxLine[]; instructions: string | null; writtenAt: string };
export type Visit = { id: string; date: string; doctor: string | null; prescription: Prescription | null };
export type CheckIn = {
  id: string;
  title: Text;
  state: string;
  opensAt: string;
  closesAt: string;
  endedAt: string | null;
  response: { submittedAt: string; photos: number; answers: { prompt: Text; answer: Answer }[] } | null;
};
export type Answer = string | number | Text | (string | Text)[];
export type Message = { id: string; from: 'patient' | 'clinic'; channel: string; body: string | null; photo: boolean; at: string };
export type Home = {
  profile: { firstName: string; branch: string };
  nextAppointment: Appointment | null;
  openCheckIns: { id: string; title: Text; closesAt: string }[];
  latestPrescription: (Prescription & { date: string; doctor: string | null }) | null;
  messages: Message[];
};
export type Result<T> = { ok: true; data: T } | { ok: false; reason: 'signed-out' | 'rejected' | 'invalid' | 'busy' | 'network' };

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(`/api/portal/${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (res.status === 401) return { ok: false, reason: path.startsWith('auth/verify') ? 'rejected' : 'signed-out' };
  if (res.status === 403) return { ok: false, reason: 'signed-out' };
  if (res.status === 400 || res.status === 413) return { ok: false, reason: 'invalid' };
  if (res.status === 429) return { ok: false, reason: 'busy' };
  if (!res.ok) return { ok: false, reason: 'network' };
  return { ok: true, data: (await res.json()) as T };
}

export const requestCode = (phone: string) => call<{ message: string }>('POST', 'auth/code', { phone });
export const verifyCode = (phone: string, code: string) => call<ProfileList>('POST', 'auth/verify', { phone, code });
export const getSession = () => call<ProfileList>('GET', 'session');
export const chooseProfile = (ref: string) => call<ProfileList>('POST', 'session/profile', { ref });
export const signOut = (everywhere: boolean) => call<{ signedOut: true }>('POST', everywhere ? 'auth/sign-out-everywhere' : 'auth/sign-out', {});

export type View = 'home' | 'appointments' | 'visits' | 'check-ins' | 'messages';
export const loadView = <T>(view: View) => call<T>('GET', `records/${view}`);
export const sendMessage = (body: string, clientKey: string) => call<{ messages: Message[] }>('POST', 'records/messages', { body, clientKey });
