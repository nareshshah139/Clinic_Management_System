'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { AuthCard } from '@/components/auth/AuthCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError('');
    if (!code.trim()) { setError('Enter the reset code you were given.'); return; }
    if (password.length < 8 || password.length > 72) { setError('Use 8 to 72 characters.'); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setSaving(true);
    try {
      await apiClient.resetPassword(code.trim(), password, confirm);
      setDone(true);
      setTimeout(() => router.replace('/login'), 2500);
    } catch (e: any) {
      setError(e?.message || 'Could not reset the password. Ask an admin for a new code.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthCard title="Set a new password">
      {done ? (
        <p role="status" className="text-sm text-gray-700">Password updated. Taking you to sign in…</p>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
          <div>
            <label className="text-sm text-gray-700" htmlFor="reset-code">Reset code</label>
            <Input id="reset-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" autoCapitalize="characters"
              placeholder="ABCD-EFGH" aria-describedby="reset-code-help" required autoFocus />
            <p id="reset-code-help" className="mt-1 text-xs text-gray-500">The 8-character code your clinic admin gave you. It works once and expires after 24 hours.</p>
          </div>
          <div>
            <label className="text-sm text-gray-700" htmlFor="new-password">New password</label>
            <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="new-password-help" required />
            <p id="new-password-help" className="mt-1 text-xs text-gray-500">At least 8 characters.</p>
          </div>
          <div>
            <label className="text-sm text-gray-700" htmlFor="confirm-password">Confirm new password</label>
            <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <Button className="w-full" type="submit" disabled={saving || !code.trim() || !password || !confirm}>
            {saving && <Spinner label="Saving…" />}
            {saving ? 'Saving…' : 'Set new password'}
          </Button>
        </form>
      )}
      <p className="text-sm text-center"><Link href="/login" className="text-blue-700 underline underline-offset-2">Back to sign in</Link></p>
    </AuthCard>
  );
}
