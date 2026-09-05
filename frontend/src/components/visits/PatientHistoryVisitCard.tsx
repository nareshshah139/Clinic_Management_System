'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { encounterDay } from '@/lib/patient-history';
import { cn } from '@/lib/utils';
import {
  Calendar,
  Camera,
  ChevronDown,
  FileText,
  Pill,
  Stethoscope,
  User,
} from 'lucide-react';

type PatientHistoryVisit = Record<string, unknown> & {
  id?: string;
  createdAt?: string | Date;
  status?: string | null;
  visitType?: string | null;
  complaints?: unknown;
  diagnosis?: unknown;
  plan?: unknown;
  followUp?: string | null;
  scribeJson?: unknown;
  vitals?: unknown;
  doctor?: { firstName?: string; lastName?: string } | null;
  prescription?: { id?: string; createdAt?: string | null } | null;
};

type PatientHistoryVisitCardProps = {
  visit: PatientHistoryVisit;
  visitLabel?: string;
  defaultCollapsed?: boolean;
  highlight?: boolean;
  onResume?: () => void;
  resumeLabel?: string;
  footerActions?: ReactNode;
  className?: string;
};

const normalizeStructuredValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
};

const parseJsonObject = <T extends Record<string, unknown>>(value: unknown): T | undefined => {
  const normalized = normalizeStructuredValue(value);
  if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
    return normalized as T;
  }
  return undefined;
};

const humanizeKey = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

const stringifyValue = (value: unknown): string | undefined => {
  if (value == null || value === '') return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const joined = value
      .map((entry) => stringifyValue(entry))
      .filter((entry): entry is string => Boolean(entry))
      .join(', ');
    return joined || undefined;
  }
  if (typeof value === 'object') {
    const parts = Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => {
        const text = stringifyValue(entry);
        return text ? `${key.includes('(') ? key : humanizeKey(key)}: ${text}` : undefined;
      })
      .filter((entry): entry is string => Boolean(entry));
    return parts.join('; ') || undefined;
  }
  return undefined;
};

const extractTextFromUnknown = (value: unknown, keys: string[]): string | undefined => {
  const normalized = normalizeStructuredValue(value);
  if (normalized == null || normalized === '') return undefined;
  if (typeof normalized === 'string') return normalized.trim() || undefined;
  if (typeof normalized === 'number' || typeof normalized === 'boolean') return String(normalized);
  if (Array.isArray(normalized)) {
    for (const entry of normalized) {
      const text = extractTextFromUnknown(entry, keys);
      if (text) return text;
    }
    return undefined;
  }
  if (typeof normalized === 'object') {
    const record = normalized as Record<string, unknown>;
    for (const key of keys) {
      const text = extractTextFromUnknown(record[key], []);
      if (text) return text;
    }
  }
  return undefined;
};

const extractTextList = (value: unknown, keys: string[]): string[] => {
  const normalized = normalizeStructuredValue(value);
  if (normalized == null || normalized === '') return [];
  if (Array.isArray(normalized)) {
    return normalized
      .map((entry) => extractTextFromUnknown(entry, keys))
      .filter((entry): entry is string => Boolean(entry));
  }
  const single = extractTextFromUnknown(normalized, keys);
  return single ? [single] : [];
};

const normalizeAssetUrl = (path: string) => {
  if (!path) return path;
  const value = String(path);
  if (/^https?:\/\//i.test(value)) return value;
  const cleaned = value.replace(/^\/?api\/+/, '/');
  if (/^\/?uploads\//i.test(cleaned) || /\/uploads\//i.test(cleaned)) {
    const startIndex = cleaned.toLowerCase().indexOf('/uploads/');
    const suffix =
      startIndex >= 0 ? cleaned.slice(startIndex) : `/${cleaned.replace(/^\/?/, '')}`;
    return suffix.startsWith('/uploads/')
      ? suffix
      : `/uploads/${suffix.replace(/^\/?uploads\//i, '')}`;
  }
  return `/api/${cleaned.replace(/^\//, '')}`;
};

const formatMaybeDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

const deriveVisitData = (visit: PatientHistoryVisit) => {
  const raw = visit as Record<string, any>;
  const scribe = parseJsonObject<Record<string, unknown>>(visit.scribeJson) || {};
  const day = encounterDay(raw);
  const visitTypeLabel = extractTextFromUnknown(scribe.visitType, []) || visit.visitType || undefined;
  const photoPreviews = Array.isArray(raw.photoPreviewUrls) ? raw.photoPreviewUrls.map(normalizeAssetUrl) : [];
  const rxItems = Array.isArray(raw.prescriptionItems) ? raw.prescriptionItems : [];
  const status = String(visit.status || '').toLowerCase().replaceAll('_', '-');
  return {
    dateLabel: day ? new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : 'Unknown date',
    doctorName: visit.doctor ? `${visit.doctor.firstName || ''} ${visit.doctor.lastName || ''}`.trim() : undefined,
    chiefComplaint: extractTextList(visit.complaints, ['complaint', 'text', 'name']).join('; '),
    primaryDiagnosis: extractTextList(visit.diagnosis, ['diagnosis', 'condition', 'name']).join('; '),
    visitTypeLabel,
    statusLabel: status ? humanizeKey(status) : undefined,
    statusVariant: status === 'completed' ? 'default' as const : status === 'in-progress' ? 'secondary' as const : 'outline' as const,
    photoCount: Number(raw.photos || 0) || photoPreviews.length,
    photoPreviews: photoPreviews as string[],
    rxItems,
    hasPrescription: Boolean(visit.prescription?.id) || rxItems.length > 0,
  };
};

const DetailSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="min-w-0 py-4 first:pt-0 last:pb-0">
    <h4 className="text-sm font-semibold text-foreground">{title}</h4>
    <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </section>
);

export default function PatientHistoryVisitCard({
  visit,
  visitLabel,
  defaultCollapsed = true,
  highlight = false,
  onResume,
  resumeLabel = 'Resume session',
  footerActions,
  className,
}: PatientHistoryVisitCardProps) {
  const detailsId = useId();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const data = useMemo(() => deriveVisitData(visit), [visit]);

  const raw = visit as Record<string, any>;
  const appointmentOnly = raw.entryType === 'appointment';
  const fullVitals = parseJsonObject<Record<string, unknown>>(visit.vitals);
  const labeledVitals = fullVitals ? Object.fromEntries(Object.entries(fullVitals).map(([key, value]) => [
    ({ temperature: 'Temperature (°C)', temp: 'Temperature (°F)', oxygenSaturation: 'SpO₂ (%)', spo2: 'SpO₂ (%)' } as Record<string, string>)[key] || key, value,
  ])) : undefined;
  const sections = [
    ['Complaint details', normalizeStructuredValue(visit.complaints)],
    ['Diagnosis details', normalizeStructuredValue(visit.diagnosis)],
    ['History', normalizeStructuredValue(raw.history) || raw.historySummary],
    ['Examination', normalizeStructuredValue(raw.exam) || raw.examSummary],
    ['Treatment plan', normalizeStructuredValue(visit.plan) || raw.planSummary],
    ['Vitals', labeledVitals],
    ['Prescription Items', raw.prescriptionItems],
    ['Prescription instructions', raw.prescriptionMeta],
    ['Follow-up date', visit.followUp ? formatMaybeDate(String(visit.followUp)) : undefined],
    ['Visit notes', normalizeStructuredValue(visit.scribeJson)],
    ['Appointment notes', raw.appointmentNotes],
  ].map(([title, value]) => ({ title: String(title), text: stringifyValue(value) })).filter(section => section.text);
  const hasExpandedContent = sections.length > 0 || data.photoPreviews.length > 0 || footerActions;

  return (
    <Card
      className={cn(
        'gap-0 overflow-hidden border-border py-0 shadow-none',
        highlight && 'border-blue-300 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/20',
        className
      )}
    >
      <CardContent className="p-0">
        <div className="space-y-5 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
                  <Calendar aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {data.dateLabel}
                </h3>
                {visitLabel && <span className="text-sm text-muted-foreground">{visitLabel}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex min-w-0 items-center gap-1.5 break-words">
                  <User aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  <span className="sr-only">Doctor: </span>
                  {data.doctorName || 'Not recorded'}
                </span>
                {data.visitTypeLabel && <span className="min-w-0 break-words">{data.visitTypeLabel}</span>}
              </div>
            </div>
            {data.statusLabel && (
              <Badge variant={data.statusVariant} className="max-w-full whitespace-normal break-words">
                {data.statusLabel}
              </Badge>
            )}
          </div>

          {appointmentOnly && <p className="text-sm leading-relaxed text-muted-foreground">Appointment only — no visit documentation recorded.</p>}
          <dl className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2 sm:gap-6">
            <div className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <FileText aria-hidden="true" className="h-3.5 w-3.5" />
                Chief Complaint
              </dt>
              <dd className={cn('mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed', data.chiefComplaint ? 'text-foreground' : 'text-muted-foreground')}>
                {data.chiefComplaint || 'Not recorded'}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Stethoscope aria-hidden="true" className="h-3.5 w-3.5" />
                Diagnosis
              </dt>
              <dd className={cn('mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed', data.primaryDiagnosis ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                {data.primaryDiagnosis || 'Not recorded'}
              </dd>
            </div>
          </dl>
        </div>

        {(data.photoCount > 0 || data.hasPrescription || (onResume && !appointmentOnly) || hasExpandedContent) && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border bg-muted/30 px-4 py-2 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              {data.photoCount > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Camera aria-hidden="true" className="h-3.5 w-3.5" />
                  {data.photoCount} Photos
                </span>
              )}
              {data.hasPrescription && (
                <span className="inline-flex items-center gap-1.5">
                  <Pill aria-hidden="true" className="h-3.5 w-3.5" />
                  {data.rxItems.length > 0 ? `${data.rxItems.length} Rx Items` : 'Prescription'}
                </span>
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {onResume && !appointmentOnly && (
                <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={onResume}>
                  {resumeLabel}
                </Button>
              )}
              {hasExpandedContent && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-10"
                  aria-expanded={!collapsed}
                  aria-controls={detailsId}
                  onClick={() => setCollapsed((current) => !current)}
                >
                  {collapsed ? 'Show details' : 'Hide details'}
                  <ChevronDown
                    aria-hidden="true"
                    className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', !collapsed && 'rotate-180')}
                  />
                </Button>
              )}
            </div>
          </div>
        )}

        {hasExpandedContent && (
          <div id={detailsId} hidden={collapsed} className="border-t border-border p-4 sm:p-5">
            {!collapsed && <>
              <div className="divide-y divide-border">
                {sections.map(section => (
                  <DetailSection key={section.title} title={section.title}>
                    <p className="max-w-prose whitespace-pre-wrap break-words">{section.text}</p>
                  </DetailSection>
                ))}
                {data.photoPreviews.length > 0 && <DetailSection title="Photos">
                  <div className="flex flex-wrap gap-3">{data.photoPreviews.map((url, index) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={index} src={url} alt={`Visit photo preview ${index + 1}`} loading="lazy" width={120} height={80} className="h-20 w-30 rounded-md border border-border object-cover" />
                  ))}</div>
                </DetailSection>}
              </div>
              {footerActions && <div className="mt-4 border-t border-border pt-4">{footerActions}</div>}
            </>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
