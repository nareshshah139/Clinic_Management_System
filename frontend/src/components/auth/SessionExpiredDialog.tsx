'use client';

import { useState, useSyncExternalStore } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { apiClient } from '@/lib/api';
import { getSessionState, sendSessionEvent, subscribeToSessionRecovery } from '@/lib/authRedirect';
import { splitErrorReference } from '@/lib/utils';

const keepOpen = (event: Event) => event.preventDefault();

export function SessionExpiredDialog() {
  const session = useSyncExternalStore(subscribeToSessionRecovery, getSessionState, () => 'active' as const);
  const { user, logout } = useDashboardUser();
  const [typedIdentifier, setTypedIdentifier] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const identifier = typedIdentifier ?? user?.email ?? user?.phone ?? '';
  const signingIn = session === 'reauthenticating';

  const submit = async () => {
    if (!identifier.trim() || !password) {
      setError('Enter your phone or email and your password.');
      return;
    }
    setError(null);
    sendSessionEvent('submitted');
    try {
      const signedIn = await apiClient.login(identifier.trim(), password);
      setPassword('');
      // Unsaved work on this page belongs to the previous user; never hand it to someone else.
      if (user?.id && signedIn?.user?.id && signedIn.user.id !== user.id) window.location.assign('/dashboard');
    } catch (e) {
      sendSessionEvent('rejected');
      setError(splitErrorReference((e as Error)?.message || 'Sign in failed').text);
    }
  };

  return (
    <Dialog open={session !== 'active'}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={keepOpen}
        onInteractOutside={keepOpen}
      >
        <DialogHeader>
          <DialogTitle>Your session expired</DialogTitle>
          <DialogDescription>
            Your work on this page is still here. Sign in again to keep going, then retry anything that did not save.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
        >
          <div className="space-y-1">
            <Label htmlFor="session-identifier">Phone or email</Label>
            <Input
              id="session-identifier"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setTypedIdentifier(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="session-password">Password</Label>
            <Input
              id="session-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => void logout()} disabled={signingIn}>
              Sign out
            </Button>
            <Button type="submit" disabled={signingIn}>
              {signingIn && <Spinner label="Signing in…" />}
              {signingIn ? 'Signing in…' : 'Sign in'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
