/**
 * Redirect to login on HTTP 401 while preserving the current path for post-login return.
 * Use for fetch calls that don't go through apiClient (which already handles 401).
 */
export function handleUnauthorizedRedirect(input: Response | number) {
  const status = typeof input === 'number' ? input : input?.status;
  if (status !== 401 || typeof window === 'undefined') return;
  try {
    const nextUrl = window.location.pathname + window.location.search + window.location.hash;
    try { window.localStorage.setItem('cms_next_after_login', nextUrl); } catch {}
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = `/login?next=${encodeURIComponent(nextUrl)}`;
    }
  } catch {
    // If redirect fails, swallow to avoid breaking caller
  }
}

