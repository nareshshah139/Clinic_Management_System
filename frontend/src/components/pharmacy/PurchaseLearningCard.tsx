'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { activeLessonCount, parseLearningLessons, parseLearningWeeks, type LearningLesson, type LearningWeek } from '@/lib/purchase-learning';

const WEEKS = 8;
const FIELD_LABEL = { product: 'Product', manufacturer: 'Manufacturer', distributorName: 'Supplier' } as const;
const TIER_LABEL = { SUGGEST: 'Suggested', APPLY: 'Applied', TRUSTED: 'Trusted' } as const;
const rate = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

const day = (date: Date) => date.toISOString().slice(0, 10);

function weekLabel(weekStart: string) {
  const date = new Date(`${weekStart.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? weekStart : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function TouchBars({ weeks }: { weeks: LearningWeek[] }) {
  const peak = Math.max(1, ...weeks.map(week => week.per100 ?? 0));
  return <ol className="grid grid-cols-8 items-end gap-1" aria-label="Reviewer touches per 100 lines, by week">
    {weeks.map(week => <li key={week.weekStart} className="flex min-w-0 flex-col items-center gap-1 text-xs">
      <span className="tabular-nums">{week.per100 === null ? '–' : rate.format(week.per100)}</span>
      <span className="flex h-16 w-full items-end rounded-sm bg-muted">
        <span className="w-full rounded-sm bg-primary" style={{ height: `${week.per100 === null ? 0 : Math.max(4, (week.per100 / peak) * 100)}%` }} />
      </span>
      <span className="max-w-full truncate text-muted-foreground"><span className="sr-only">Week of </span>{weekLabel(week.weekStart)}</span>
    </li>)}
  </ol>;
}

export function PurchaseLearningCard() {
  const [weeks, setWeeks] = useState<LearningWeek[] | null>(null);
  const [lessons, setLessons] = useState<LearningLesson[]>([]);
  const [forgetting, setForgetting] = useState<string | null>(null);
  const [forgetError, setForgetError] = useState('');

  useEffect(() => {
    let active = true;
    const to = new Date();
    const from = new Date(to.getTime() - WEEKS * 7 * 24 * 60 * 60 * 1000);
    Promise.allSettled([
      Promise.resolve().then(() => apiClient.getPharmacyPurchaseLearningMetrics<unknown>({ from: day(from), to: day(to) })),
      Promise.resolve().then(() => apiClient.getPharmacyPurchaseLearningLessons<unknown>()),
    ]).then(([metrics, learned]) => {
      if (!active) return;
      setWeeks(metrics.status === 'fulfilled' ? parseLearningWeeks(metrics.value).slice(-WEEKS) : []);
      setLessons(learned.status === 'fulfilled' ? parseLearningLessons(learned.value) : []);
    });
    return () => { active = false; };
  }, []);

  const forget = async (lesson: LearningLesson) => {
    setForgetting(lesson.key);
    setForgetError('');
    try {
      await apiClient.forgetPharmacyPurchaseLearningLesson(lesson.key);
      setLessons(current => current.filter(entry => entry.key !== lesson.key));
    } catch (error) {
      setForgetError(getErrorMessage(error));
    } finally {
      setForgetting(null);
    }
  };

  const measured = (weeks || []).filter(week => week.per100 !== null);
  if (weeks === null || (!measured.length && !lessons.length)) return null;
  const latest = measured[measured.length - 1];
  const first = measured[0];
  const active = activeLessonCount(lessons);

  return <Card aria-label="OCR learning" className="gap-4 py-4">
    <CardHeader className="px-4">
      <CardTitle className="text-base">OCR learning</CardTitle>
      <p className="text-sm text-muted-foreground">
        {latest
          ? <>Reviewers changed <strong className="text-foreground">{rate.format(latest.per100!)}</strong> per 100 lines in the latest week{measured.length > 1 && first !== latest ? `, from ${rate.format(first.per100!)} in the week of ${weekLabel(first.weekStart)}` : ''}.</>
          : 'No reviewed lines in the last 8 weeks yet.'}
        {' '}<strong className="text-foreground">{active}</strong> {active === 1 ? 'lesson is' : 'lessons are'} active.
      </p>
    </CardHeader>
    <CardContent className="space-y-4 px-4">
      {measured.length > 0 && <TouchBars weeks={weeks} />}
      {lessons.length > 0 && <details>
        <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium">What it has learned ({lessons.length})</summary>
        {forgetError && <p role="alert" className="mb-2 text-sm text-destructive">{forgetError}</p>}
        <ul className="divide-y">
          {lessons.map(lesson => <li key={lesson.key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1 basis-48 break-words">
              <span className="text-muted-foreground">{FIELD_LABEL[lesson.field]}: </span>
              &lsquo;{lesson.from}&rsquo; → {lesson.to}
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <Badge variant={lesson.tier === 'SUGGEST' ? 'outline' : 'secondary'}>{TIER_LABEL[lesson.tier]}</Badge>
                <span className="break-all">GSTIN {lesson.supplierGstin}</span>
                {lesson.reviews > 0 && `${lesson.reviews} ${lesson.reviews === 1 ? 'review' : 'reviews'}`}
              </span>
            </span>
            <Button type="button" variant="outline" size="sm" disabled={forgetting !== null} aria-label={`Forget lesson ${lesson.from} to ${lesson.to}`} onClick={() => forget(lesson)}>Forget</Button>
          </li>)}
        </ul>
      </details>}
    </CardContent>
  </Card>;
}
