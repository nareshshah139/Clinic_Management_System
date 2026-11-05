'use client';

import Image from 'next/image';
import { Spinner } from '@/components/ui/spinner';
import { useState, Suspense } from 'react';
import { Switch } from '@/components/ui/switch';
import { Palette } from 'lucide-react';
import { useBrandedMode } from '@/components/layout/branded-mode-context';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';

function LoginPageInner() {
  const { brandedEnabled, toggleBranded, loading: brandedLoading } = useBrandedMode();
  const router = useRouter();
  const search = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier || !password) {
      setError('Phone or email and password are required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiClient.login(trimmedIdentifier, password);
      const next = search.get('next') || '/dashboard';
      router.replace(next);
    } catch (e: any) {
      setError(e?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-gradient-soft px-4 py-16 relative">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <Palette className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Branded</span>
        <Switch
          checked={brandedEnabled}
          onCheckedChange={() => toggleBranded()}
          aria-label="Toggle branded mode"
          disabled={brandedLoading}
        />
      </div>
      <Card className="w-full max-w-md border-border/70 bg-card">
        <CardHeader className="items-center gap-5 pb-2">
          <div className="relative mx-auto h-24 w-56 overflow-hidden rounded-md">
            <Image src="/letterhead.png" alt="Linaé Skin, Hair & Aesthetic Clinic" width={1100} height={1520} priority className="absolute -left-5 -top-[30px] h-auto w-[672px] max-w-none" />
          </div>
          <h1 className="text-center text-2xl font-semibold tracking-tight">ClinicMS Login</h1>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(e) => { e.preventDefault(); void submit(); }}
            autoComplete="on"
            className="space-y-4"
          >
            <div>
              <label className="text-sm text-foreground" htmlFor="login-identifier">Phone or email</label>
              <Input
                id="login-identifier"
                name="username"
                type="text"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Phone or email"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="text-sm text-foreground" htmlFor="login-password">Password</label>
              <Input
                id="login-password"
                name="current-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p role="alert" className="text-sm text-destructive-text">{error}</p>}
            <Button className="w-full" type="submit" disabled={loading || !identifier.trim() || !password}>
              {loading && <Spinner label="Signing in…" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">Use your registered phone number or email with your password.</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center">Loading…</div>}>
      <LoginPageInner />
    </Suspense>
  );
} 