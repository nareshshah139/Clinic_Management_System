'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LanguagePicker, formatDate, inLang } from '@/components/portal/portal-ui';
import type { Lang } from '@/lib/portal/client';
import {
  type Answer, type Appointment, type CheckIn, type Home, type Message, type Prescription, type ProfileList, type View, type Visit,
  chooseProfile, getSession, loadView, sendMessage, signOut,
} from '@/lib/portal/session-client';
import { type StringKey, t } from '@/lib/portal/strings';

const TABS: { view: View; label: StringKey }[] = [
  { view: 'home', label: 'home' },
  { view: 'appointments', label: 'appointments' },
  { view: 'visits', label: 'prescriptions' },
  { view: 'check-ins', label: 'checkIns' },
  { view: 'messages', label: 'messages' },
];

type Data =
  | { view: 'home'; home: Home }
  | { view: 'appointments'; upcoming: Appointment[] }
  | { view: 'visits'; visits: Visit[] }
  | { view: 'check-ins'; checkIns: CheckIn[] }
  | { view: 'messages'; messages: Message[] };

/** The signed-in portal: read-only records of the chosen person and their thread with the clinic (PP-61, PP-63, PP-65). */
export default function PortalRecordsPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('EN');
  const [session, setSession] = useState<ProfileList | null>(null);
  const [view, setView] = useState<View>('home');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<StringKey | null>(null);

  const leave = useCallback(() => router.replace('/p'), [router]);

  const open = useCallback(async (next: View) => {
    setView(next);
    setData(null);
    setError(null);
    const r = await loadView<Record<string, unknown>>(next);
    if (!r.ok) return r.reason === 'signed-out' ? leave() : setError('offline');
    setData(next === 'home' ? { view: 'home', home: r.data as Home } : ({ view: next, ...r.data } as Data));
  }, [leave]);

  useEffect(() => {
    void getSession().then((r) => {
      if (!r.ok || !r.data.chosen) return leave();
      setSession(r.data);
      void open('home');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function switchTo(ref: string) {
    const r = await chooseProfile(ref);
    if (!r.ok) return r.reason === 'signed-out' ? leave() : setError('offline');
    setSession(r.data);
    void open('home');
  }

  async function out(everywhere: boolean) {
    await signOut(everywhere);
    leave();
  }

  if (!session) return <p role="status">{t(lang, 'loading')}</p>;
  const me = session.profiles.find((p) => p.ref === session.chosen);

  return (
    <section className="space-y-5">
      <LanguagePicker lang={lang} onChange={setLang} />
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{me?.branch}</p>
        <h1 className="text-xl font-semibold" data-testid="portal-name">{t(lang, 'hello', { name: me?.firstName ?? '' })}</h1>
      </header>
      {session.profiles.length > 1 && (
        <fieldset className="flex flex-wrap items-center gap-2" data-testid="profile-switch">
          <legend className="mb-1 text-sm font-medium">{t(lang, 'switchProfile')}</legend>
          {session.profiles.map((p) => (
            <Button key={p.ref} type="button" size="sm" variant={p.ref === session.chosen ? 'default' : 'outline'} aria-pressed={p.ref === session.chosen} onClick={() => void switchTo(p.ref)}>
              {p.firstName} · {p.branch}
            </Button>
          ))}
        </fieldset>
      )}
      <nav aria-label={t(lang, 'portal')} className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Button key={tab.view} type="button" size="sm" variant={tab.view === view ? 'default' : 'outline'} aria-current={tab.view === view ? 'page' : undefined} onClick={() => void open(tab.view)}>
            {t(lang, tab.label)}
          </Button>
        ))}
      </nav>
      {error && <p role="alert" className="text-destructive">{t(lang, error)}</p>}
      {!data && !error && <p role="status">{t(lang, 'loading')}</p>}
      {data?.view === 'home' && <HomeView lang={lang} home={data.home} onMessages={() => void open('messages')} />}
      {data?.view === 'appointments' && <Appointments lang={lang} upcoming={data.upcoming} />}
      {data?.view === 'visits' && <Visits lang={lang} visits={data.visits} />}
      {data?.view === 'check-ins' && <CheckIns lang={lang} checkIns={data.checkIns} />}
      {data?.view === 'messages' && <Messages lang={lang} messages={data.messages} onSent={(messages) => setData({ view: 'messages', messages })} onSignedOut={leave} />}
      <footer className="flex flex-col gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => void out(false)}>{t(lang, 'signOut')}</Button>
        <Button type="button" variant="ghost" onClick={() => void out(true)}>{t(lang, 'signOutEverywhere')}</Button>
      </footer>
    </section>
  );
}

function AppointmentLine({ lang, a }: { lang: Lang; a: Appointment }) {
  return (
    <p>
      <span className="font-medium">{formatDate(lang, a.date)}</span>, {a.slot}
      {a.doctor && <> · {a.doctor}</>} · {a.branch}
    </p>
  );
}

function HomeView({ lang, home, onMessages }: { lang: Lang; home: Home; onMessages: () => void }) {
  return (
    <div className="space-y-5">
      <section aria-labelledby="next-appt" className="space-y-1">
        <h2 id="next-appt" className="text-lg font-semibold">{t(lang, 'nextAppointment')}</h2>
        {home.nextAppointment ? <AppointmentLine lang={lang} a={home.nextAppointment} /> : <p className="text-muted-foreground">{t(lang, 'noAppointment')}</p>}
      </section>
      {home.openCheckIns.length > 0 && (
        <section aria-labelledby="open-checkins" className="space-y-1">
          <h2 id="open-checkins" className="text-lg font-semibold">{t(lang, 'openCheckIns')}</h2>
          {home.openCheckIns.map((c) => (
            <p key={c.id}><span className="font-medium">{inLang(lang, c.title)}</span>: {t(lang, 'answerOnWhatsApp', { date: formatDate(lang, c.closesAt) })}</p>
          ))}
        </section>
      )}
      <section aria-labelledby="latest-rx" className="space-y-1">
        <h2 id="latest-rx" className="text-lg font-semibold">{t(lang, 'latestPrescription')}</h2>
        {home.latestPrescription ? (
          <>
            <p className="text-sm text-muted-foreground">{t(lang, 'visitWith', { date: formatDate(lang, home.latestPrescription.date), doctor: home.latestPrescription.doctor ?? '' })}</p>
            <PrescriptionBlock lang={lang} rx={home.latestPrescription} />
          </>
        ) : <p className="text-muted-foreground">{t(lang, 'noPrescription')}</p>}
      </section>
      <section aria-labelledby="recent-messages" className="space-y-1">
        <h2 id="recent-messages" className="text-lg font-semibold">{t(lang, 'messages')}</h2>
        <Thread lang={lang} messages={home.messages} />
        <Button type="button" variant="outline" onClick={onMessages}>{t(lang, 'writeToClinic')}</Button>
      </section>
    </div>
  );
}

function Appointments({ lang, upcoming }: { lang: Lang; upcoming: Appointment[] }) {
  if (!upcoming.length) return <p className="text-muted-foreground">{t(lang, 'noAppointment')}</p>;
  return <ul className="space-y-2" data-testid="appointments">{upcoming.map((a, i) => <li key={i}><AppointmentLine lang={lang} a={a} /></li>)}</ul>;
}

const rxLine = (item: Prescription['items'][number]) =>
  [
    [item.drugName, item.dosage !== undefined ? `${item.dosage}${item.dosageUnit ?? ''}` : ''].filter(Boolean).join(' '),
    item.frequency ?? item.dosePattern,
    item.duration !== undefined ? `${item.duration} ${String(item.durationUnit ?? '').toLowerCase()}`.trim() : '',
    item.route,
    item.timing,
    item.applicationSite,
    item.instructions,
    item.foodInstructions,
  ].filter((part) => part !== undefined && part !== '').join(' · ');

function PrescriptionBlock({ lang, rx }: { lang: Lang; rx: Prescription }) {
  return (
    <div className="space-y-1">
      <ul className="list-disc space-y-1 pl-5" data-testid="prescription">{rx.items.map((item, i) => <li key={i}>{rxLine(item)}</li>)}</ul>
      {rx.instructions && <p><span className="font-medium">{t(lang, 'instructions')}:</span> {rx.instructions}</p>}
    </div>
  );
}

function Visits({ lang, visits }: { lang: Lang; visits: Visit[] }) {
  if (!visits.length) return <p className="text-muted-foreground">{t(lang, 'noVisits')}</p>;
  return (
    <ul className="space-y-4" data-testid="visits">
      {visits.map((v) => (
        <li key={v.id} className="space-y-1">
          <h2 className="font-semibold">{t(lang, 'visitWith', { date: formatDate(lang, v.date), doctor: v.doctor ?? '' })}</h2>
          {v.prescription ? <PrescriptionBlock lang={lang} rx={v.prescription} /> : <p className="text-sm text-muted-foreground">{t(lang, 'noPrescription')}</p>}
        </li>
      ))}
    </ul>
  );
}

const answerText = (lang: Lang, a: Answer): string =>
  Array.isArray(a) ? a.map((x) => inLang(lang, x)).join(', ') : typeof a === 'number' ? String(a) : inLang(lang, a);

function CheckIns({ lang, checkIns }: { lang: Lang; checkIns: CheckIn[] }) {
  if (!checkIns.length) return <p className="text-muted-foreground">{t(lang, 'noCheckIns')}</p>;
  return (
    <ul className="space-y-4" data-testid="check-ins">
      {checkIns.map((c) => (
        <li key={c.id} className="space-y-1">
          <h2 className="font-semibold">{inLang(lang, c.title)} · {formatDate(lang, c.opensAt)}</h2>
          {c.response ? (
            <>
              <p className="text-sm text-muted-foreground">{t(lang, 'answered', { date: formatDate(lang, c.response.submittedAt) })}</p>
              <dl className="space-y-1">
                {c.response.answers.map((a, i) => (
                  <div key={i}><dt className="text-sm text-muted-foreground">{inLang(lang, a.prompt)}</dt><dd>{answerText(lang, a.answer)}</dd></div>
                ))}
              </dl>
              {c.response.photos > 0 && <p className="text-sm">{t(lang, 'photosSent', { count: String(c.response.photos) })}</p>}
            </>
          ) : <p className="text-sm text-muted-foreground">{t(lang, 'notAnswered')}</p>}
        </li>
      ))}
    </ul>
  );
}

function Thread({ lang, messages }: { lang: Lang; messages: Message[] }) {
  if (!messages.length) return <p className="text-muted-foreground">{t(lang, 'noMessages')}</p>;
  return (
    <ol className="space-y-2" data-testid="thread">
      {messages.map((m) => (
        <li key={m.id} className={`rounded-md border p-2 ${m.from === 'patient' ? 'ml-8' : 'mr-8 bg-muted'}`} data-from={m.from}>
          <p className="text-xs text-muted-foreground">{t(lang, m.from === 'patient' ? 'you' : 'clinic')} · {formatDate(lang, m.at)}</p>
          <p className="whitespace-pre-wrap">{m.body ?? (m.photo ? t(lang, 'photoMessage') : '')}</p>
        </li>
      ))}
    </ol>
  );
}

function Messages({ lang, messages, onSent, onSignedOut }: { lang: Lang; messages: Message[]; onSent: (m: Message[]) => void; onSignedOut: () => void }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<StringKey | null>(null);
  // One key per message, kept across retries, so a resend after a lost answer is stored once (PP-65).
  const key = useRef<string>('');
  if (!key.current) key.current = crypto.randomUUID();

  async function send() {
    setSending(true);
    setError(null);
    const r = await sendMessage(text, key.current);
    setSending(false);
    if (!r.ok) return r.reason === 'signed-out' ? onSignedOut() : setError('offline');
    key.current = crypto.randomUUID();
    setText('');
    onSent(r.data.messages);
  }

  return (
    <div className="space-y-4">
      <Thread lang={lang} messages={messages} />
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <label className="block space-y-1">
          <span className="font-medium">{t(lang, 'writeToClinic')}</span>
          <Textarea maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <p className="text-sm text-muted-foreground">{t(lang, 'messageHint')}</p>
        {error && <p role="alert" className="text-destructive" data-testid="send-error">{t(lang, error)}</p>}
        <Button type="submit" disabled={sending || !text.trim()}>{t(lang, sending ? 'sending' : 'send')}</Button>
      </form>
    </div>
  );
}
