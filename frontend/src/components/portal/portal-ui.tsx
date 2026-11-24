'use client';

import { Button } from '@/components/ui/button';
import type { Lang, Text } from '@/lib/portal/client';
import { LANG_NAMES, t } from '@/lib/portal/strings';

const LOCALES: Record<Lang, string> = { EN: 'en-IN', TE: 'te-IN', HI: 'hi-IN' };

export function formatDate(lang: Lang, iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALES[lang], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export function inLang(lang: Lang, text: Text | string): string {
  return typeof text === 'string' ? text : text[lang] ?? text.EN;
}

export function LanguagePicker({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2 text-sm">
      <legend className="sr-only">{t(lang, 'language')}</legend>
      {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
        <Button key={l} type="button" size="sm" variant={l === lang ? 'default' : 'outline'} aria-pressed={l === lang} onClick={() => onChange(l)}>
          {LANG_NAMES[l]}
        </Button>
      ))}
    </fieldset>
  );
}
