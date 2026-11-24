import { LANG_NAMES, t } from '@/lib/portal/strings';

export default function RecordsComingSoon() {
  return (
    <section aria-labelledby="records-title" className="space-y-4">
      <h1 id="records-title" className="text-xl font-semibold">{t('EN', 'records')}</h1>
      {(Object.keys(LANG_NAMES) as (keyof typeof LANG_NAMES)[]).map((lang) => (
        <p key={lang} lang={lang.toLowerCase()} className="text-muted-foreground">{t(lang, 'recordsSoon')}</p>
      ))}
    </section>
  );
}
