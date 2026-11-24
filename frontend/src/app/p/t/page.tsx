'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { type Answer, type Lang, type SubmitResult, type TaskItem, type TaskPage, loadTask, submitAnswers, takeTokenFromFragment } from '@/lib/portal/client';
import { MAX_PHOTOS, compressPhoto } from '@/lib/portal/compress';
import { LANG_NAMES, type StringKey, t } from '@/lib/portal/strings';

type Photo = { itemKey: string; dataUrl: string };
type Phase = { kind: 'loading' } | { kind: 'inactive' } | { kind: 'form' } | { kind: 'done'; results: SubmitResult[] };

/** The patient task page: one POST for the questions, answers kept in memory only (PP-40, PP-45, PP-46). */
export default function TaskLinkPage() {
  const token = useRef('');
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [page, setPage] = useState<TaskPage | null>(null);
  const [lang, setLang] = useState<Lang>('EN');
  const [answers, setAnswers] = useState<Record<string, Record<string, Answer>>>({});
  const [photos, setPhotos] = useState<Record<string, Photo[]>>({});
  const [done, setDone] = useState<Record<string, SubmitResult>>({});
  const [error, setError] = useState<StringKey | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    token.current = takeTokenFromFragment();
    void loadTask(token.current).then((r) => {
      if (!r.ok) return setPhase({ kind: 'inactive' });
      setPage(r.data);
      setLang(r.data.language);
      setPhase({ kind: 'form' });
    });
  }, []);

  const setAnswer = (checkInId: string, key: string, value: Answer) =>
    setAnswers((a) => ({ ...a, [checkInId]: { ...a[checkInId], [key]: value } }));

  async function addPhoto(checkInId: string, itemKey: string, file: File | undefined) {
    if (!file) return;
    if ((photos[checkInId]?.length ?? 0) >= MAX_PHOTOS) return;
    try {
      const dataUrl = await compressPhoto(file);
      setPhotos((p) => ({ ...p, [checkInId]: [...(p[checkInId] ?? []), { itemKey, dataUrl }] }));
      setError(null);
    } catch {
      setError('photoTooLarge');
    }
  }

  async function submit() {
    if (!page) return;
    setSending(true);
    setError(null);
    const results = { ...done };
    for (const c of page.checkIns) {
      if (results[c.id]) continue;
      const r = await submitAnswers(token.current, c.id, answers[c.id] ?? {}, photos[c.id] ?? []);
      if (!r.ok) {
        setDone(results);
        setSending(false);
        if (r.reason === 'inactive') return setPhase({ kind: 'inactive' });
        return setError(r.reason === 'invalid' ? 'invalid' : 'network');
      }
      results[c.id] = r.data;
    }
    setDone(results);
    setSending(false);
    setPhase({ kind: 'done', results: Object.values(results) });
  }

  const languagePicker = (
    <fieldset className="flex flex-wrap items-center gap-2 text-sm">
      <legend className="sr-only">{t(lang, 'language')}</legend>
      {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
        <Button key={l} type="button" size="sm" variant={l === lang ? 'default' : 'outline'} aria-pressed={l === lang} onClick={() => setLang(l)}>
          {LANG_NAMES[l]}
        </Button>
      ))}
    </fieldset>
  );

  if (phase.kind === 'loading') return <p role="status">{t(lang, 'loading')}</p>;
  if (phase.kind === 'inactive') return <p role="alert" data-testid="link-inactive">{t(lang, 'inactive')}</p>;
  if (!page) return null;

  if (phase.kind === 'done') {
    const urgent = phase.results.find((r) => r.status === 'saved' && r.urgent) as Extract<SubmitResult, { status: 'saved' }> | undefined;
    const already = phase.results.some((r) => r.status === 'already-answered');
    return (
      <section className="space-y-4" data-testid="confirmation">
        {languagePicker}
        {urgent && (
          <div role="alert" className="space-y-3 rounded-md border-2 border-destructive p-4" data-testid="urgent">
            <p className="text-lg font-semibold">{t(lang, 'urgent')}</p>
            {urgent.clinicPhone && (
              <a className="inline-block rounded-md bg-destructive px-4 py-3 text-lg font-semibold text-destructive-foreground" href={`tel:${urgent.clinicPhone}`}>
                {t(lang, 'call', { phone: urgent.clinicPhone })}
              </a>
            )}
          </div>
        )}
        <p data-testid={already ? 'already-answered' : 'saved'}>{t(lang, already ? 'already' : 'thanks')}</p>
        <a className="underline" href="/p/records">{t(lang, 'records')}</a>
      </section>
    );
  }

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {languagePicker}
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{page.clinic}</p>
        <h1 className="text-xl font-semibold">{t(lang, 'hello', { name: page.firstName })}</h1>
      </header>
      {page.checkIns.map((c) => (
        <section key={c.id} className="space-y-4" aria-label={c.title[lang]}>
          <p>{t(lang, 'intro', { doctor: c.doctor })}</p>
          <h2 className="text-lg font-semibold">{c.title[lang]}</h2>
          {c.items.map((item) => (
            <Question
              key={item.key}
              item={item}
              lang={lang}
              value={answers[c.id]?.[item.key]}
              photos={(photos[c.id] ?? []).filter((p) => p.itemKey === item.key)}
              canAddPhoto={(photos[c.id]?.length ?? 0) < MAX_PHOTOS}
              onAnswer={(v) => setAnswer(c.id, item.key, v)}
              onPhoto={(f) => void addPhoto(c.id, item.key, f)}
              onRemovePhoto={(i) => setPhotos((p) => ({ ...p, [c.id]: (p[c.id] ?? []).filter((x) => x !== (p[c.id] ?? []).filter((y) => y.itemKey === item.key)[i]) }))}
            />
          ))}
        </section>
      ))}
      {error && <p role="alert" className="text-destructive" data-testid="submit-error">{t(lang, error)}</p>}
      <Button type="submit" className="w-full" size="lg" disabled={sending}>{t(lang, sending ? 'sending' : 'submit')}</Button>
    </form>
  );
}

function Question(props: {
  item: TaskItem;
  lang: Lang;
  value: Answer | undefined;
  photos: Photo[];
  canAddPhoto: boolean;
  onAnswer: (v: Answer) => void;
  onPhoto: (f: File | undefined) => void;
  onRemovePhoto: (i: number) => void;
}) {
  const { item, lang, value } = props;
  const label = (
    <legend className="font-medium">
      {item.prompt[lang]} {item.required && <span className="text-sm text-muted-foreground">({t(lang, 'required')})</span>}
    </legend>
  );
  if (item.type === 'scale') {
    const steps = Array.from({ length: item.max! - item.min! + 1 }, (_, i) => item.min! + i);
    return (
      <fieldset className="space-y-2">
        {label}
        <div className="flex flex-wrap gap-2">
          {steps.map((n) => (
            <label key={n} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border has-[:checked]:bg-primary has-[:checked]:text-primary-foreground">
              <input className="sr-only" type="radio" name={item.key} value={n} checked={value === n} onChange={() => props.onAnswer(n)} />
              {n}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (item.type === 'single-choice' || item.type === 'multi-choice') {
    const multi = item.type === 'multi-choice';
    const chosen = Array.isArray(value) ? value : [];
    return (
      <fieldset className="space-y-2">
        {label}
        {item.options!.map((o) => (
          <label key={o.value} className="flex min-h-11 items-center gap-3 rounded-md border px-3">
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={item.key}
              value={o.value}
              checked={multi ? chosen.includes(o.value) : value === o.value}
              onChange={(e) => props.onAnswer(multi ? (e.target.checked ? [...chosen, o.value] : chosen.filter((v) => v !== o.value)) : o.value)}
            />
            {o.label[lang]}
          </label>
        ))}
      </fieldset>
    );
  }
  if (item.type === 'text') {
    return (
      <fieldset className="space-y-2">
        {label}
        <Textarea aria-label={item.prompt[lang]} maxLength={2000} value={typeof value === 'string' ? value : ''} onChange={(e) => props.onAnswer(e.target.value)} />
      </fieldset>
    );
  }
  return (
    <fieldset className="space-y-2">
      {label}
      <div className="flex flex-wrap gap-2">
        {props.photos.map((p, i) => (
          <div key={i} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.dataUrl} alt="" className="h-20 w-20 rounded-md object-cover" />
            <Button type="button" size="sm" variant="outline" onClick={() => props.onRemovePhoto(i)}>{t(lang, 'removePhoto')}</Button>
          </div>
        ))}
      </div>
      {props.canAddPhoto && (
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border px-4">
          {t(lang, 'addPhoto')}
          <input className="sr-only" type="file" accept="image/*" capture="environment" data-testid={`photo-${item.key}`} onChange={(e) => { props.onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      )}
    </fieldset>
  );
}
