'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LanguagePicker } from '@/components/portal/portal-ui';
import type { Lang } from '@/lib/portal/client';
import { type Profile, type ProfileList, chooseProfile, getSession, requestCode, verifyCode } from '@/lib/portal/session-client';
import { type StringKey, t } from '@/lib/portal/strings';

type Step = { kind: 'loading' } | { kind: 'phone' } | { kind: 'code' } | { kind: 'pick'; profiles: Profile[] };

/** Portal sign-in: a WhatsApp number, the 6-digit code sent there, then the person on that number (PP-55, PP-61). */
export default function PortalSignInPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('EN');
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<StringKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function afterSignIn(list: ProfileList) {
    if (list.chosen) return router.replace('/p/records');
    if (list.profiles.length === 1) return pick(list.profiles[0].ref);
    if (list.profiles.length === 0) return setStep({ kind: 'phone' });
    setStep({ kind: 'pick', profiles: list.profiles });
  }

  useEffect(() => {
    void getSession().then((r) => (r.ok ? afterSignIn(r.data) : setStep({ kind: 'phone' })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const failed = (reason: string): StringKey => (reason === 'rejected' ? 'codeRejected' : reason === 'busy' ? 'busy' : reason === 'invalid' ? 'codeRejected' : 'offline');

  async function sendCode() {
    setBusy(true);
    setError(null);
    const r = await requestCode(phone);
    setBusy(false);
    if (!r.ok && r.reason !== 'invalid') return setError(failed(r.reason));
    setCode('');
    setStep({ kind: 'code' });
  }

  async function signIn() {
    setBusy(true);
    setError(null);
    const r = await verifyCode(phone, code);
    setBusy(false);
    if (!r.ok) return setError(failed(r.reason));
    await afterSignIn(r.data);
  }

  async function pick(ref: string) {
    setBusy(true);
    const r = await chooseProfile(ref);
    setBusy(false);
    if (!r.ok) return r.reason === 'signed-out' ? setStep({ kind: 'phone' }) : setError('offline');
    router.replace('/p/records');
  }

  if (step.kind === 'loading') return <p role="status">{t(lang, 'loading')}</p>;

  return (
    <section className="space-y-6">
      <LanguagePicker lang={lang} onChange={setLang} />
      <h1 className="text-xl font-semibold">{t(lang, 'portal')}</h1>
      {step.kind === 'phone' && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
          <label className="block space-y-1">
            <span className="font-medium">{t(lang, 'phone')}</span>
            <Input type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <p className="text-sm text-muted-foreground">{t(lang, 'phoneHint')}</p>
          <Button type="submit" size="lg" className="w-full" disabled={busy || !phone.trim()}>{t(lang, 'getCode')}</Button>
        </form>
      )}
      {step.kind === 'code' && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void signIn(); }}>
          <p role="status" data-testid="code-on-way">{t(lang, 'codeOnWay')}</p>
          <label className="block space-y-1">
            <span className="font-medium">{t(lang, 'code')}</span>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <Button type="submit" size="lg" className="w-full" disabled={busy || code.length !== 6}>{t(lang, 'signIn')}</Button>
          <Button type="button" variant="outline" className="w-full" onClick={() => { setError(null); setStep({ kind: 'phone' }); }}>{t(lang, 'newCode')}</Button>
        </form>
      )}
      {step.kind === 'pick' && (
        <div className="space-y-3" data-testid="profile-picker">
          <h2 className="text-lg font-semibold">{t(lang, 'whoIsThis')}</h2>
          {step.profiles.map((p) => (
            <Button key={p.ref} type="button" variant="outline" size="lg" className="w-full justify-between" disabled={busy} onClick={() => void pick(p.ref)}>
              <span>{p.firstName}</span>
              <span className="text-sm text-muted-foreground">{p.branch}</span>
            </Button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-destructive" data-testid="sign-in-error">{t(lang, error)}</p>}
    </section>
  );
}
