'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      setLoading(true);
      setError(null);
      await apiClient.login(phone, password);
      const next = search.get('next') || '/dashboard';
      router.replace(next);
    } catch (e: any) {
      setError(e?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">ClinicMS Login</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(e) => { e.preventDefault(); void submit(); }}
            autoComplete="on"
            className="space-y-4"
          >
            <div>
              <label className="text-sm text-gray-700" htmlFor="login-username">Phone</label>
              <Input
                id="login-username"
                name="username"
                type="tel"
                inputMode="tel"
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit phone"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm text-gray-700" htmlFor="login-password">Password</label>
              <Input
                id="login-password"
                name="current-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="text-xs text-gray-500 text-center">Use your registered phone and password.</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
} 