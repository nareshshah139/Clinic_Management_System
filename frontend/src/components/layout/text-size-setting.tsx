"use client";
import { useEffect, useState, useId, useRef } from 'react';
import { apiClient } from '@/lib/api';
import { useDashboardUser } from './dashboard-user-context';

const sizes = { NORMAL: 'Normal', LARGE: 'Large', EXTRA_LARGE: 'Extra large' } as const;
type TextSize = keyof typeof sizes;
const savedSizes = new Map<string, TextSize>();
const valid = (value: unknown): value is TextSize => typeof value === 'string' && value in sizes;

/**
 * @cc [owner:nareshshah139,label:product] text-size-user-scope
 * Text size MUST load from the signed-in user's preferences, affect screen content only and
 * persist through that user's endpoint. Failed saves MUST retain the previous size and show retry.
 */
/**
 * @cc [owner:nareshshah139,label:product] text-size-normal-layout
 * Normal MUST preserve the existing screen typography, control heights and table wrapping.
 * Enlarged text overrides MUST apply only when Large or Extra large is selected.
 */
export function TextSizeSetting() {
  const selectId = useId();
  const { user } = useDashboardUser();
  const currentUser = useRef(user?.id);
  currentUser.current = user?.id;
  const [size, setSize] = useState<TextSize>('NORMAL');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const metadata = user?.metadata;
    const next = user?.id && savedSizes.get(user.id) || (metadata && typeof metadata === 'object' && valid(metadata.textSize) ? metadata.textSize : 'NORMAL');
    setSize(next);
    setSaving(false);
    setError('');
    document.documentElement.dataset.clinicTextSize = next;
    const sync = () => { const saved = user?.id && savedSizes.get(user.id); if (saved) setSize(saved); };
    window.addEventListener('clinic-text-size', sync);
    return () => { window.removeEventListener('clinic-text-size', sync); };
  }, [user?.id, user?.metadata]);
  return <div className="mt-4 space-y-1">
    <label className="block" htmlFor={selectId}>Text size</label>
    <select id={selectId} className="w-full rounded-md border bg-background p-2" value={size} disabled={saving || !user}
      onChange={async event => {
        const next = event.target.value;
        if (!user || !valid(next)) return;
        setSaving(true); setError('');
        try {
          await apiClient.patch(`/users/${user.id}/text-size`, { textSize: next });
          savedSizes.set(user.id, next);
          if (currentUser.current !== user.id) return;
          setSize(next); document.documentElement.dataset.clinicTextSize = next;
          window.dispatchEvent(new Event('clinic-text-size'));
        } catch { if (currentUser.current === user.id) setError('Text size was not saved. Please retry.'); }
        finally { if (currentUser.current === user.id) setSaving(false); }
      }}>
      {Object.entries(sizes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    {error && <p role="alert">{error}</p>}
  </div>;
}
