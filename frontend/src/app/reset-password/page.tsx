'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { AuthCard } from '@/components/auth/AuthCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError('');
    if (password.length < 8 || password.length > 72) { setError('Use 8 to 72 characters.'); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setSaving(true);
    try {
      await apiClient.resetPassword(token, password, confirm);
      setDone(true);
      setTimeout(() => router.replace('/login'), 2500);
    } catch (e: any) {
      setError(e?.message || 'Could not reset the password. Please request a new link.');
    } finally {
      setSaving(false);
    }
  };

  if (!token) {
    return (
      <p role="alert" className="text-sm text-red-600">
        This link is missing its reset code. <Link href="/forgot-password" className="underline">Request a new link</Link>.
      </p>
    );
  }
  if (done) return <p role="status" className="text-sm text-gray-700">Password updated. Taking you to sign in…</p>;

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
      <div>
        <label className="text-sm text-gray-700" htmlFor="new-password">New password</label>
        <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="new-password-help" required autoFocus />
        <p id="new-password-help" className="mt-1 text-xs text-gray-500">At least 8 characters.</p>
      </div>
      <div>
        <label className="text-sm text-gray-700" htmlFor="confirm-password">Confirm new password</label>
        <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}{/expired|invalid/i.test(error) && <> <Link href="/forgot-password" className="underline">Request a new link</Link>.</>}
        </p>
      )}
      <Button className="w-full" type="submit" disabled={saving || !password || !confirm}>
        {saving && <Spinner label="Saving…" />}
        {saving ? 'Saving…' : 'Set new password'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Set a new password">
      <Suspense fallback={<p className="text-sm text-gray-600">Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
      <p className="text-sm text-center"><Link href="/login" className="text-blue-700 underline underline-offset-2">Back to sign in</Link></p>
    </AuthCard>
  );
}
