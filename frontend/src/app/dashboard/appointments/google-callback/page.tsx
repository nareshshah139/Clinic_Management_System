'use client';

import { Spinner } from '@/components/ui/spinner';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { apiClient } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, XCircle } from 'lucide-react';

const googleCodeExchangePromises = new Map<string, Promise<unknown>>();

function GoogleCallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'exchanging' | 'success' | 'error'>('exchanging');
  const [message, setMessage] = useState('Connecting your Google Calendar...');

  useEffect(() => {
    let cancelled = false;

    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const state = searchParams.get('state');

    if (error) {
      setStatus('error');
      setMessage(error === 'access_denied' ? 'You denied access to Google Calendar.' : `Google returned an error: ${error}`);
      setTimeout(() => router.push('/dashboard/appointments'), 3000);
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('No authorization code received from Google.');
      setTimeout(() => router.push('/dashboard/appointments'), 3000);
      return;
    }

    (async () => {
      try {
        let exchangePromise = googleCodeExchangePromises.get(code);
        if (!exchangePromise) {
          exchangePromise = apiClient.exchangeGoogleCalendarCode(code);
          googleCodeExchangePromises.set(code, exchangePromise);
        }

        await exchangePromise;
        if (cancelled) return;
        setStatus('success');
        setMessage('Google Calendar connected successfully!');
        const redirect = state || '/dashboard/appointments';
        setTimeout(() => router.push(redirect), 1500);
      } catch (e: any) {
        if (cancelled) return;
        setStatus('error');
        const msg = e?.body?.message || e?.message || 'Failed to connect Google Calendar.';
        setMessage(msg);
        setTimeout(() => router.push('/dashboard/appointments'), 4000);
      }
    })();

    return () => { cancelled = true; };
  }, [searchParams, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-12">
          {status === 'exchanging' && (
            <>
              <Spinner className="h-10 w-10  text-info-text" />
              <p className="text-sm text-muted-foreground">{message}</p>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 className="h-10 w-10 text-success-text" />
              <p className="text-sm font-medium text-success-text">{message}</p>
              <p className="text-xs text-muted-foreground">Redirecting to appointments...</p>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="h-10 w-10 text-destructive-text" />
              <p className="text-sm font-medium text-destructive-text">{message}</p>
              <p className="text-xs text-muted-foreground">Redirecting back...</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Spinner className="h-8 w-8  text-info-text" /></div>}>
      <GoogleCallbackInner />
    </Suspense>
  );
}
