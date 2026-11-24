export type SessionState = 'active' | 'expired' | 'reauthenticating';
type SessionEvent = 'unauthorized' | 'submitted' | 'rejected' | 'signedIn';

const TRANSITIONS: Record<SessionState, Partial<Record<SessionEvent, SessionState>>> = {
  active: { unauthorized: 'expired' },
  expired: { submitted: 'reauthenticating', signedIn: 'active' },
  reauthenticating: { rejected: 'expired', signedIn: 'active' },
};

export const NEXT_AFTER_LOGIN_KEY = 'cms_next_after_login';
export const SESSION_EXPIRED_REASON = 'expired';

let state: SessionState = 'active';
const recoveryListeners = new Set<() => void>();

export function getSessionState(): SessionState {
  return state;
}

export function sendSessionEvent(event: SessionEvent) {
  const next = TRANSITIONS[state][event];
  if (!next) return;
  state = next;
  recoveryListeners.forEach((listener) => listener());
}

export function subscribeToSessionRecovery(listener: () => void) {
  recoveryListeners.add(listener);
  return () => { recoveryListeners.delete(listener); };
}

/**
 * @cc [owner:nareshshah139,label:reliability] in-place-session-recovery
 * While a subscriber is mounted, a 401 MUST only move the session to expired so the subscriber can
 * re-authenticate over the current page; it MUST NOT navigate. With no subscriber, a 401 MUST
 * navigate to /login with the current path as next and reason=expired.
 */
export function handleUnauthorizedRedirect(input: Response | number) {
  const status = typeof input === 'number' ? input : input?.status;
  if (status !== 401 || typeof window === 'undefined') return;
  if (recoveryListeners.size > 0) {
    sendSessionEvent('unauthorized');
    return;
  }
  try {
    const { pathname, search, hash } = window.location;
    if (pathname.startsWith('/login')) return;
    const nextUrl = pathname + search + hash;
    try { window.localStorage.setItem(NEXT_AFTER_LOGIN_KEY, nextUrl); } catch {}
    window.location.href = `/login?next=${encodeURIComponent(nextUrl)}&reason=${SESSION_EXPIRED_REASON}`;
  } catch {}
}
