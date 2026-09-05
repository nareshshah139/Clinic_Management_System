'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { encounterDay } from '@/lib/patient-history';
import { Button } from '@/components/ui/button';

type PhotoGroup = { key: string; day: string; draft: boolean; urls: string[] };
const photoUrl = (url: string) => /^https?:\/\//i.test(url) || url.startsWith('/uploads/') ? url : `/api/${url.replace(/^\/?api\//, '').replace(/^\//, '')}`;
const displayDay = (day: string) => day ? new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Unknown date';

/** Read-only access to other encounters and uploads that were never attached to a visit. */
export default function PatientPhotoArchive({ patientId, currentVisitId, currentPhotoUrls = [] }: { patientId: string; currentVisitId: string; currentPhotoUrls?: string[] }) {
  const [groups, setGroups] = useState<PhotoGroup[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setGroups([]); setErrors([]); setLoading(true);
    void (async () => {
      const [visits, drafts] = await Promise.allSettled([
        apiClient.getAllPatientVisitHistory(patientId, false),
        apiClient.get(`/visits/photos/draft/${patientId}?allDates=true`),
      ]);
      if (!active) return;
      const next: PhotoGroup[] = [];
      const failures: string[] = [];
      if (visits.status === 'fulfilled') {
        for (const visit of visits.value) if (visit.entryType !== 'appointment' && visit.photoPreviewUrls?.length) {
          next.push({ key: visit.id, day: encounterDay(visit), draft: false, urls: visit.photoPreviewUrls.map(photoUrl) });
        }
      } else failures.push('Photos from other visits could not be loaded.');
      if (drafts.status === 'fulfilled') {
        const byDay = new Map<string, string[]>();
        for (const item of ((drafts.value as { items?: { url: string; dateStr: string }[] })?.items || [])) {
          const day = item.dateStr.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
          byDay.set(day, [...(byDay.get(day) || []), photoUrl(item.url)]);
        }
        for (const [day, urls] of byDay) next.push({ key: `draft:${day}`, day, draft: true, urls });
      } else failures.push('Unattached uploads could not be loaded.');
      setGroups(next.sort((a, b) => b.day.localeCompare(a.day))); setErrors(failures); setLoading(false);
    })();
    return () => { active = false; };
  }, [patientId, retry]);
  const currentUrls = new Set(currentPhotoUrls.map(photoUrl));
  const visible = groups.filter(group => group.key !== currentVisitId).map(group => ({ ...group, urls: group.urls.filter(url => !currentUrls.has(url)) })).filter(group => group.urls.length);
  if (!loading && !errors.length && !visible.length) return null;
  return <section className="space-y-4 border-t border-border pt-5" aria-label="Other saved patient photos">
    <h3 className="text-base font-semibold">Other saved photos</h3>
    <p className="text-sm text-muted-foreground">Photos from other visits and uploads not attached to a visit. Dates below identify where each photo was saved.</p>
    {loading && <p role="status" className="text-sm">Loading saved photos…</p>}
    {!!errors.length && <div role="alert" className="space-y-2 text-sm">{errors.map(error => <p key={error}>{error}</p>)}<Button type="button" variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>Retry saved photos</Button></div>}
    {visible.map(group => <section key={group.key} className="space-y-3">
      <h4 className="text-sm font-medium">{group.draft ? 'Unattached uploads' : 'Visit'} — {displayDay(group.day)} ({group.urls.length})</h4>
      <div className="flex flex-wrap gap-3">{group.urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="rounded-md focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Open ${group.draft ? 'unattached' : 'visit'} photo ${index + 1} from ${displayDay(group.day)}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`${group.draft ? 'Unattached upload' : 'Visit photo'} ${index + 1}`} loading="lazy" width={144} height={112} className="h-28 w-36 rounded-md border border-border object-cover" />
      </a>)}</div>
    </section>)}
  </section>;
}
