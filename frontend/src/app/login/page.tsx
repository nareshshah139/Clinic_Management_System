'use client';

import Link from 'next/link';
import { Spinner } from '@/components/ui/spinner';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';
import { splitErrorReference } from '@/lib/utils';
import { NEXT_AFTER_LOGIN_KEY, SESSION_EXPIRED_REASON } from '@/lib/authRedirect';

/**
 * @cc [owner:nareshshah139,label:security] login-local-redirect
 * Post-login destinations MUST be local absolute paths; a missing next falls back to the path
 * saved when the session expired, unsafe values fall back to /dashboard, and local query strings
 * and fragments remain intact.
 */
function loginDestination(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') ||
      /[\\\u0000-\u001f\u007f]/.test(next) || /^\/(?:%2f|%5c)/i.test(next)) {
    return '/dashboard';
  }
  return next;
}

function takeSavedDestination(): string | null {
  try {
    const saved = window.localStorage.getItem(NEXT_AFTER_LOGIN_KEY);
    window.localStorage.removeItem(NEXT_AFTER_LOGIN_KEY);
    return saved;
  } catch {
    return null;
  }
}

function LoginPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState({ identifier: false, password: false });
  const sessionExpired = search.get('reason') === SESSION_EXPIRED_REASON;

  const submit = async () => {
    const trimmedIdentifier = identifier.trim();
    const nowMissing = { identifier: !trimmedIdentifier, password: !password };
    setMissing(nowMissing);
    if (nowMissing.identifier || nowMissing.password) {
      setError(null);
      document.getElementById(nowMissing.identifier ? 'login-identifier' : 'login-password')?.focus();
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiClient.login(trimmedIdentifier, password);
      const saved = takeSavedDestination();
      router.replace(loginDestination(search.get('next') ?? saved));
    } catch (e: any) {
      setError(e?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const shownError = error ? splitErrorReference(error) : null;

  return (
    <AuthCard title="Sign in to Linaé">
      <form
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        autoComplete="on"
        noValidate
        className="space-y-4"
      >
        {sessionExpired && (
          <p role="status" className="rounded-md border border-info-border bg-info-soft px-3 py-2 text-sm text-info-text">
            Your session expired. Sign in again to continue where you left off.
          </p>
        )}
        <div className="space-y-1">
          <Label htmlFor="login-identifier">Phone or email</Label>
          <Input
            id="login-identifier"
            name="username"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            value={identifier}
            onChange={(e) => { setIdentifier(e.target.value); setMissing((m) => ({ ...m, identifier: false })); }}
            aria-invalid={missing.identifier || undefined}
            aria-describedby={missing.identifier ? 'login-identifier-error' : undefined}
            autoFocus
          />
          {missing.identifier && <p id="login-identifier-error" className="text-sm text-destructive">Enter your phone number or email.</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            name="current-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setMissing((m) => ({ ...m, password: false })); }}
            aria-invalid={missing.password || undefined}
            aria-describedby={missing.password ? 'login-password-error' : undefined}
          />
          {missing.password && <p id="login-password-error" className="text-sm text-destructive">Enter your password.</p>}
        </div>
        {shownError && (
          <div role="alert" className="text-sm text-destructive">
            <p>{shownError.text}</p>
            {shownError.reference && <p className="select-all text-xs text-muted-foreground">Reference: {shownError.reference}</p>}
          </div>
        )}
        <Button className="w-full" type="submit" disabled={loading}>
          {loading && <Spinner label="Signing in…" />}
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-sm text-center text-muted-foreground">Forgot password? Ask your clinic admin for a code, then <Link href="/reset-password" className="text-primary underline underline-offset-2">use a reset code</Link>.</p>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center">Loading…</div>}>
      <LoginPageInner />
    </Suspense>
  );
}
