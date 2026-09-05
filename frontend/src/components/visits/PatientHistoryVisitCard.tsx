'use client';

import { useMemo, useState, type ReactNode } from 'react';
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
    visitTypeVariant: visitTypeLabel?.toLowerCase().includes('procedure') ? 'destructive' as const : 'default' as const,
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
  <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-4">
    <div className="text-sm font-medium text-gray-900">{title}</div>
    <div className="mt-2 text-sm text-gray-700">{children}</div>
  </div>
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
        'overflow-hidden border-gray-200 shadow-sm',
        highlight && 'border-blue-200 bg-blue-50/40',
        className
      )}
    >
      <CardContent className="p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {visitLabel && (
                <span className="text-sm font-semibold text-gray-900">
                  {visitLabel}
                </span>
              )}
              <Badge variant="secondary" className="gap-1">
                <Calendar className="h-3 w-3" />
                {data.dateLabel}
              </Badge>
              {data.visitTypeLabel && (
                <Badge variant={data.visitTypeVariant}>{data.visitTypeLabel}</Badge>
              )}
              {data.statusLabel && (
                <Badge variant={data.statusVariant}>{data.statusLabel}</Badge>
              )}
              {data.photoCount > 0 && (
                <Badge variant="outline" className="gap-1">
                  <Camera className="h-3 w-3" />
                  {data.photoCount} Photos
                </Badge>
              )}
              {data.hasPrescription && (
                <Badge variant="outline" className="gap-1">
                  <Pill className="h-3 w-3" />
                  {data.rxItems.length > 0 ? `${data.rxItems.length} Rx Items` : 'Prescription'}
                </Badge>
              )}
            </div>

            {appointmentOnly && <p className="text-sm text-gray-600">Appointment only — no visit documentation recorded.</p>}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-white/80 p-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <User className="h-3.5 w-3.5" />
                  Doctor
                </div>
                <p className="mt-1 text-sm font-medium text-gray-900">
                  {data.doctorName || 'Not recorded'}
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white/80 p-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <FileText className="h-3.5 w-3.5" />
                  Chief Complaint
                </div>
                <p className="mt-1 text-sm font-medium text-gray-900">
                  {data.chiefComplaint || 'Not recorded'}
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white/80 p-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <Stethoscope className="h-3.5 w-3.5" />
                  Diagnosis
                </div>
                <p className="mt-1 text-sm font-medium text-gray-900">
                  {data.primaryDiagnosis || 'Not recorded'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {onResume && !appointmentOnly && (
              <Button type="button" size="sm" variant="outline" onClick={onResume}>
                {resumeLabel}
              </Button>
            )}
            {hasExpandedContent && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-expanded={!collapsed}
                onClick={() => setCollapsed((current) => !current)}
              >
                {collapsed ? 'Show details' : 'Hide details'}
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform',
                    !collapsed && 'rotate-180'
                  )}
                />
              </Button>
            )}
          </div>
        </div>

        {!collapsed && hasExpandedContent && (
          <div className="mt-4 space-y-4 border-t border-gray-200 pt-4">
            {sections.map(section => (
              <DetailSection key={section.title} title={section.title}>
                <p className="whitespace-pre-wrap break-words">{section.text}</p>
              </DetailSection>
            ))}
            {data.photoPreviews.length > 0 && <DetailSection title="Photos">
              <div className="flex gap-2 overflow-x-auto">{data.photoPreviews.map((url, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={index} src={url} alt="Visit photo preview" className="h-16 w-24 rounded border object-cover" />
              ))}</div>
            </DetailSection>}
            {footerActions}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
