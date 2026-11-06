'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apiClient } from '@/lib/api';
import { AuthCard } from '@/components/auth/AuthCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<{ status: 'idle' | 'sending' | 'sent' } | { status: 'error'; message: string }>({ status: 'idle' });

  const submit = async () => {
    setState({ status: 'sending' });
    try {
      await apiClient.forgotPassword(email.trim());
      setState({ status: 'sent' });
    } catch (e: any) {
      setState({ status: 'error', message: e?.status === 429 ? 'Too many requests. Wait a minute and try again.' : 'Could not send the reset email. Please try again.' });
    }
  };

  return (
    <AuthCard title="Reset your password">
      {state.status === 'sent' ? (
        <div role="status" className="space-y-3 text-sm text-gray-700">
          <p>If an account exists for <strong>{email.trim()}</strong>, we have emailed a link to set a new password. It works once and expires in 30 minutes.</p>
          <p>Didn&apos;t get it? Check spam, or ask your clinic admin to confirm the email on your account.</p>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
          <p className="text-sm text-gray-600">Enter the email on your account and we&apos;ll send you a link to set a new password.</p>
          <div>
            <label className="text-sm text-gray-700" htmlFor="forgot-email">Email</label>
            <Input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          {state.status === 'error' && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
          <Button className="w-full" type="submit" disabled={state.status === 'sending' || !email.trim()}>
            {state.status === 'sending' && <Spinner label="Sending…" />}
            {state.status === 'sending' ? 'Sending…' : 'Email me a reset link'}
          </Button>
        </form>
      )}
      <p className="text-sm text-center"><Link href="/login" className="text-blue-700 underline underline-offset-2">Back to sign in</Link></p>
    </AuthCard>
  );
}
