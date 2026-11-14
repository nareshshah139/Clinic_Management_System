'use client';

import { displayUtcDate, displayCalendarDate } from '@/lib/date-display';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ClinicalHistoryDetails, hasClinicalValue } from './ClinicalHistoryDetails';
import { encounterDay } from '@/lib/patient-history';
import { cn } from '@/lib/utils';
import { enumLabel } from '@/lib/labels';
import {
  Calendar,
  Camera,
  ChevronDown,
  Pill,
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
  return displayUtcDate(value, value);
};

const deriveVisitData = (visit: PatientHistoryVisit) => {
  const raw = visit as Record<string, any>;
  const scribe = parseJsonObject<Record<string, unknown>>(visit.scribeJson) || {};
  const day = encounterDay(raw);
  const visitTypeLabel = extractTextFromUnknown(scribe.visitType, []) || (visit.visitType ? enumLabel('visitType', visit.visitType) : undefined);
  const photoPreviews = Array.isArray(raw.photoPreviewUrls) ? raw.photoPreviewUrls.map(normalizeAssetUrl) : [];
  const issued = [raw.prescriptionItems, raw.prescription?.items].map(asRecordList).find((items) => items.length > 0) || [];
  const planItems = asRecordList(planDermatology(raw.plan)?.medicationPlan);
  const rxItems = (issued.length > 0 ? issued : planItems).map(cleanMedicine);
  return {
    dateLabel: displayCalendarDate(day, 'Unknown date'),
    doctorName: visit.doctor ? `${visit.doctor.firstName || ''} ${visit.doctor.lastName || ''}`.trim() : undefined,
    chiefComplaint: extractTextList(visit.complaints, ['complaint', 'text', 'name']).join('; '),
    primaryDiagnosis: extractTextList(visit.diagnosis, ['diagnosis', 'condition', 'name']).join('; '),
    visitTypeLabel,
    status: visit.status || undefined,
    photoCount: Number(raw.photos || 0) || photoPreviews.length,
    photoPreviews: photoPreviews as string[],
    rxItems,
    planItems,
    issuedCount: issued.length,
    medicines: medicineNames(rxItems.length > 0 ? rxItems : freeTextMedicines(raw.plan).map((name) => ({ name }))),
    hasPrescription: Boolean(visit.prescription?.id) || issued.length > 0,
  };
};

type VisitView = 'summary' | 'compact' | 'full';
type MedicineItem = Record<string, unknown>;

const asRecordList = (value: unknown): MedicineItem[] => {
  const normalized = normalizeStructuredValue(value);
  return Array.isArray(normalized)
    ? normalized.filter((entry): entry is MedicineItem => Boolean(entry) && typeof entry === 'object')
    : [];
};

const omitKeys = (record: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));

const cleanMedicine = (item: MedicineItem): MedicineItem => {
  const cleaned = omitKeys(item, ['regimenState', 'gstRate', 'drugId', 'inventoryItemId']);
  return cleaned.name === cleaned.drugName ? omitKeys(cleaned, ['name']) : cleaned;
};

const planDermatology = (plan: unknown) =>
  parseJsonObject<Record<string, any>>(parseJsonObject<Record<string, unknown>>(plan)?.dermatology);

const freeTextMedicines = (plan: unknown): string[] => {
  const medications = planDermatology(plan)?.medications;
  return [medications?.topicals, medications?.systemics]
    .flatMap((text) => (typeof text === 'string' ? text.split('\n') : []))
    .map((line) => line.trim())
    .filter(Boolean);
};

const medicineKey = (name: string) => name.toLowerCase().replace(/\s+/g, ' ');

const medicineNames = (items: MedicineItem[]): string[] => {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of items) {
    const raw = [item.drugName, item.name, item.medicine].find((candidate) => typeof candidate === 'string' && candidate.trim());
    if (typeof raw !== 'string') continue;
    const name = raw.trim();
    if (seen.has(medicineKey(name))) continue;
    seen.add(medicineKey(name));
    names.push(name);
  }
  return names;
};

const treatmentPlanWithoutDuplicate = (plan: unknown, planItems: MedicineItem[], shown: MedicineItem[]): unknown => {
  const parsed = parseJsonObject<Record<string, unknown>>(plan);
  const dermatology = planDermatology(plan);
  if (!parsed || !dermatology || planItems.length === 0) return plan;
  const duplicate = medicineNames(planItems).map(medicineKey).join('|') === medicineNames(shown).map(medicineKey).join('|');
  return {
    ...parsed,
    dermatology: duplicate
      ? omitKeys(dermatology, ['medicationPlan'])
      : { ...dermatology, medicationPlan: planItems.map(cleanMedicine) },
  };
};

const DetailSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="min-w-0 border-t border-border pt-2">
    <h4 className="text-sm font-semibold text-foreground">{title}</h4>
    <div className="mt-1.5 text-sm leading-5 text-muted-foreground">{children}</div>
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
  const data = useMemo(() => deriveVisitData(visit), [visit]);

  const raw = visit as Record<string, any>;
  const appointmentOnly = raw.entryType === 'appointment';
  const history = normalizeStructuredValue(raw.history) || raw.historySummary;
  const historyRecord = parseJsonObject<Record<string, unknown>>(history);
  const compactHistory = historyRecord ? { personalHistory: historyRecord.personalHistory, ...historyRecord } : history;
  const fullVitals = parseJsonObject<Record<string, unknown>>(visit.vitals);
  const labeledVitals = fullVitals ? Object.fromEntries(Object.entries(fullVitals).map(([key, value]) => [
    ({ temperature: 'Temperature (°C)', temp: 'Temperature (°F)', oxygenSaturation: 'SpO₂ (%)', spo2: 'SpO₂ (%)' } as Record<string, string>)[key] || key, value,
  ])) : undefined;
  const sections = [
    ['Complaint details', normalizeStructuredValue(visit.complaints)],
    ['Diagnosis details', normalizeStructuredValue(visit.diagnosis)],
    ['History', history],
    ['Examination', normalizeStructuredValue(raw.exam) || raw.examSummary],
    ['Treatment plan', treatmentPlanWithoutDuplicate(normalizeStructuredValue(visit.plan) || raw.planSummary, data.planItems, data.rxItems)],
    ['Vitals', labeledVitals || normalizeStructuredValue(visit.vitals)],
    ['Prescription', data.rxItems],
    ['Prescription instructions', { ...omitKeys({ ...raw.prescriptionMeta }, ['language']), ...(raw.prescription?.instructions ? { followUpInstructions: raw.prescription.instructions } : {}), ...(raw.prescription?.pharmacistNotes ? { pharmacistNotes: raw.prescription.pharmacistNotes } : {}), ...(raw.prescription?.validUntil ? { validUntil: formatMaybeDate(String(raw.prescription.validUntil)) } : {}) }],
    ['Follow-up date', visit.followUp ? formatMaybeDate(String(visit.followUp)) : undefined],
    ['Visit notes', normalizeStructuredValue(visit.scribeJson)],
    ['Lab orders', raw.labOrders],
    ['Procedure device records', raw.deviceLogs],
    ['Consents', raw.consents],
    ['Appointment notes', raw.appointmentNotes || raw.appointment?.notes],
  ].map(([title, value]) => ({ title: String(title), value })).filter(section => hasClinicalValue(section.value));
  const hasFullDetails = sections.length > 0 || data.photoPreviews.length > 0;
  const hasCompact = hasClinicalValue(history) || data.medicines.length > 0;
  const expandedView: VisitView = hasCompact ? 'compact' : 'full';
  const [view, setView] = useState<VisitView>(defaultCollapsed ? 'summary' : expandedView);
  const summary = view === 'summary';
  const hasExpandedContent = hasFullDetails || hasCompact || footerActions;

  return (
    <Card
      className={cn(
        'gap-0 overflow-hidden border-border py-0 shadow-none',
        highlight && 'border-info-border bg-info-soft/30',
        className
      )}
    >
      <CardContent className="p-0">
        <div className="space-y-2.5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Calendar aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {data.dateLabel}
              </h3>
              {visitLabel && <span className="text-xs text-muted-foreground">{visitLabel}</span>}
              <span className="break-words text-xs text-muted-foreground"><span className="sr-only">Doctor: </span>{data.doctorName || 'Not recorded'}</span>
              {data.visitTypeLabel && <span className="break-words text-xs text-muted-foreground">{data.visitTypeLabel}</span>}
            </div>
            {data.status && <StatusBadge domain="visit" status={data.status} className="max-w-full" />}
          </div>

          {appointmentOnly && <p className="text-xs leading-relaxed text-muted-foreground">Appointment only — no visit documentation recorded.</p>}
          <dl className="space-y-1 text-sm leading-snug">
            <div className="flex min-w-0 gap-2">
              <dt className="w-28 shrink-0 text-xs leading-5 text-muted-foreground">Chief Complaint</dt>
              <dd className={cn('min-w-0 whitespace-pre-wrap break-words', summary && 'line-clamp-2', data.chiefComplaint ? 'text-foreground' : 'text-muted-foreground')}>
                {data.chiefComplaint || 'Not recorded'}
              </dd>
            </div>
            <div className="flex min-w-0 gap-2">
              <dt className="w-28 shrink-0 text-xs leading-5 text-muted-foreground">Diagnosis</dt>
              <dd className={cn('min-w-0 whitespace-pre-wrap break-words', summary && 'line-clamp-2', data.primaryDiagnosis ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                {data.primaryDiagnosis || 'Not recorded'}
              </dd>
            </div>
          </dl>
        </div>

        {(data.photoCount > 0 || data.hasPrescription || (onResume && !appointmentOnly) || hasExpandedContent) && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border bg-muted/30 px-3 py-1">
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
                  {data.issuedCount > 0 ? `${data.issuedCount} Rx Items` : 'Prescription'}
                </span>
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {onResume && !appointmentOnly && (
                <Button type="button" size="sm" variant="outline" className="h-8 min-h-8 px-2 text-xs" onClick={onResume}>
                  {resumeLabel}
                </Button>
              )}
              {hasExpandedContent && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 min-h-8 px-2 text-xs"
                  aria-expanded={!summary}
                  aria-controls={detailsId}
                  onClick={() => setView((current) => (current === 'summary' ? expandedView : 'summary'))}
                >
                  {summary ? 'Show details' : 'Hide details'}
                  <ChevronDown
                    aria-hidden="true"
                    className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', !summary && 'rotate-180')}
                  />
                </Button>
              )}
            </div>
          </div>
        )}

        {hasExpandedContent && (
          <div id={detailsId} hidden={summary} className="border-t border-border p-3">
            {!summary && <>
              {hasCompact && hasFullDetails && (
                <div className="mb-3 flex justify-end">
                  <Button type="button" size="sm" variant="outline" className="h-8 min-h-8 px-2 text-xs" onClick={() => setView((current) => (current === 'full' ? 'compact' : 'full'))}>
                    {view === 'full' ? 'Compact view' : 'Full details'}
                  </Button>
                </div>
              )}
              {view === 'compact' ? (
                <div className="space-y-3">
                  {hasClinicalValue(history) && (
                    <DetailSection title="History">
                      <div className="max-w-lg"><ClinicalHistoryDetails value={compactHistory} /></div>
                    </DetailSection>
                  )}
                  {data.medicines.length > 0 && (
                    <DetailSection title="Medicines">
                      <ul className="space-y-0.5 text-foreground">
                        {data.medicines.map((name) => <li key={name.toLowerCase()} className="min-w-0 break-words">{name}</li>)}
                      </ul>
                    </DetailSection>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-4">
                  {sections.map(section => (
                    <DetailSection key={section.title} title={section.title}>
                      <ClinicalHistoryDetails value={section.value} />
                    </DetailSection>
                  ))}
                  {data.photoPreviews.length > 0 && <DetailSection title="Photos">
                    <div className="flex flex-wrap gap-2">{data.photoPreviews.map((url, index) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={index} href={url} target="_blank" rel="noreferrer" aria-label={`Open visit photo ${index + 1}`} className="rounded-md focus-visible:outline-2 focus-visible:outline-ring"><img src={url} alt={`Visit photo preview ${index + 1}`} loading="lazy" width={120} height={80} className="h-20 w-30 rounded-md border border-border object-cover" /></a>
                    ))}</div>
                  </DetailSection>}
                </div>
              )}
              {footerActions && <div className="mt-3 border-t border-border pt-3">{footerActions}</div>}
            </>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
