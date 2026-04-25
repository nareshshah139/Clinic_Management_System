'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

type VisitMedication = string | Record<string, unknown>;

type VisitDerivedData = {
  dateLabel: string;
  doctorName?: string;
  chiefComplaint?: string;
  primaryDiagnosis?: string;
  visitTypeLabel?: string;
  statusLabel?: string;
  statusVariant: 'default' | 'secondary' | 'outline';
  visitTypeVariant: 'default' | 'destructive';
  photoCount: number;
  photoPreviews: string[];
  drugNames: string[];
  medicationEntries: VisitMedication[];
  rxItems: Array<Record<string, unknown>>;
  hasPrescription: boolean;
  notes?: string;
  investigations: string[];
  procedurePlannedText?: string;
  followUpText?: string;
  counselingText?: string;
  validUntilIso?: string;
  pastHistoryText?: string;
  medicationHistoryText?: string;
  menstrualHistoryText?: string;
  familyHistoryText?: string;
  generalAppearanceText?: string;
  dermatologyText?: string;
  vitals: {
    bpS?: string | number;
    bpD?: string | number;
    hrVal?: string | number;
    tempVal?: string | number;
    spo2Val?: string | number;
    rrVal?: string | number;
    heightCm?: string | number;
    weightKg?: string | number;
  };
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
        return text ? `${humanizeKey(key)}: ${text}` : undefined;
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

const deriveVisitData = (visit: PatientHistoryVisit): VisitDerivedData => {
  const rawVisit = visit as Record<string, unknown>;
  const scribeData = parseJsonObject<Record<string, unknown>>(visit.scribeJson) ?? {};
  const planSummary =
    parseJsonObject<Record<string, unknown>>(rawVisit.planSummary) ?? {};
  const historySummary =
    parseJsonObject<Record<string, unknown>>(rawVisit.historySummary) ?? {};
  const examSummary =
    parseJsonObject<Record<string, unknown>>(rawVisit.examSummary) ?? {};
  const treatment = parseJsonObject<Record<string, unknown>>(visit.plan) ?? {};
  const vitals = parseJsonObject<Record<string, unknown>>(visit.vitals) ?? {};

  const visitDate =
    visit.createdAt != null ? new Date(String(visit.createdAt)) : null;
  const isValidVisitDate = visitDate && !Number.isNaN(visitDate.getTime());
  const dateLabel = isValidVisitDate
    ? visitDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Unknown date';

  const statusRaw = typeof visit.status === 'string' ? visit.status.trim() : '';
  const normalizedStatus = statusRaw.toLowerCase();

  const photoPreviews = Array.isArray(rawVisit.photoPreviewUrls)
    ? (rawVisit.photoPreviewUrls as string[]).map(normalizeAssetUrl)
    : [];
  const photoCount = Number(rawVisit.photos ?? 0) || photoPreviews.length;
  const drugNames = Array.isArray(rawVisit.prescriptionDrugNames)
    ? (rawVisit.prescriptionDrugNames as string[])
    : [];
  const rxItems = Array.isArray(rawVisit.prescriptionItems)
    ? (rawVisit.prescriptionItems as Array<Record<string, unknown>>)
    : [];
  const medicationEntries = Array.isArray(treatment.medications)
    ? (treatment.medications as VisitMedication[])
    : [];

  return {
    dateLabel,
    doctorName: visit.doctor
      ? `${visit.doctor.firstName ?? ''} ${visit.doctor.lastName ?? ''}`.trim() || undefined
      : undefined,
    chiefComplaint:
      extractTextList(visit.complaints, ['complaint', 'text', 'name'])[0] ??
      undefined,
    primaryDiagnosis:
      extractTextList(visit.diagnosis, ['diagnosis', 'condition', 'name'])[0] ??
      undefined,
    visitTypeLabel:
      extractTextFromUnknown(scribeData.visitType, []) ??
      (typeof visit.visitType === 'string' ? visit.visitType : undefined) ??
      undefined,
    statusLabel: statusRaw
      ? humanizeKey(statusRaw.toLowerCase()).replace(/^./, (char) => char.toUpperCase())
      : undefined,
    statusVariant:
      normalizedStatus === 'completed'
        ? 'default'
        : normalizedStatus === 'in-progress'
          ? 'secondary'
          : 'outline',
    visitTypeVariant:
      (
        extractTextFromUnknown(scribeData.visitType, []) ??
        (typeof visit.visitType === 'string' ? visit.visitType : '')
      )
        .toLowerCase()
        .includes('procedure')
        ? 'destructive'
        : 'default',
    photoCount,
    photoPreviews,
    drugNames,
    medicationEntries,
    rxItems,
    hasPrescription: Boolean(visit.prescription?.id) || rxItems.length > 0,
    notes: extractTextFromUnknown(scribeData.notes, []) ?? undefined,
    investigations: Array.isArray(planSummary.investigations)
      ? planSummary.investigations
          .map((entry) => stringifyValue(entry))
          .filter((entry): entry is string => Boolean(entry))
      : [],
    procedurePlannedText: stringifyValue(planSummary.procedurePlanned),
    followUpText:
      stringifyValue(planSummary.followUpInstructions) ??
      (visit.followUp ? formatMaybeDate(String(visit.followUp)) : undefined),
    counselingText: stringifyValue(planSummary.counseling),
    validUntilIso:
      typeof rawVisit.prescriptionMeta === 'object' &&
      rawVisit.prescriptionMeta !== null &&
      'validUntil' in (rawVisit.prescriptionMeta as Record<string, unknown>)
        ? stringifyValue((rawVisit.prescriptionMeta as Record<string, unknown>).validUntil)
        : undefined,
    pastHistoryText: stringifyValue(historySummary.pastHistory),
    medicationHistoryText: stringifyValue(historySummary.medicationHistory),
    menstrualHistoryText: stringifyValue(historySummary.menstrualHistory),
    familyHistoryText: stringifyValue(historySummary.familyHistory),
    generalAppearanceText: stringifyValue(examSummary.generalAppearance),
    dermatologyText: stringifyValue(examSummary.dermatology),
    vitals: {
      bpS: (vitals.bpS ?? vitals.bpSys ?? vitals.systolicBP) as string | number | undefined,
      bpD: (vitals.bpD ?? vitals.bpDia ?? vitals.diastolicBP) as string | number | undefined,
      hrVal: (vitals.hr ?? vitals.heartRate ?? vitals.pulse ?? vitals.pr) as
        | string
        | number
        | undefined,
      tempVal: (vitals.temp ?? vitals.temperature) as string | number | undefined,
      spo2Val: vitals.spo2 as string | number | undefined,
      rrVal: (vitals.rr ?? vitals.respiratoryRate) as string | number | undefined,
      heightCm: (vitals.height ?? vitals.heightCm) as string | number | undefined,
      weightKg: vitals.weight as string | number | undefined,
    },
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

  const hasVitals =
    data.vitals.bpS ||
    data.vitals.bpD ||
    data.vitals.hrVal ||
    data.vitals.tempVal ||
    data.vitals.spo2Val ||
    data.vitals.rrVal ||
    data.vitals.heightCm ||
    data.vitals.weightKg;

  const hasPrescriptionSummary =
    data.investigations.length > 0 ||
    data.procedurePlannedText ||
    data.followUpText ||
    data.counselingText ||
    data.validUntilIso;

  const hasHistorySummary =
    data.pastHistoryText ||
    data.medicationHistoryText ||
    data.menstrualHistoryText ||
    data.familyHistoryText;

  const hasExaminationSummary =
    data.generalAppearanceText || data.dermatologyText;

  const hasExpandedContent =
    hasVitals ||
    data.medicationEntries.length > 0 ||
    data.notes ||
    data.drugNames.length > 0 ||
    data.rxItems.length > 0 ||
    hasPrescriptionSummary ||
    hasHistorySummary ||
    hasExaminationSummary ||
    data.photoPreviews.length > 0 ||
    footerActions;

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
            {onResume && (
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
            {hasVitals && (
              <DetailSection title="Vitals">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {(data.vitals.bpS || data.vitals.bpD) && (
                    <div>
                      <span className="text-gray-500">BP:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.vitals.bpS ?? '?'} / {data.vitals.bpD ?? '?'}
                      </span>
                    </div>
                  )}
                  {data.vitals.hrVal !== undefined && (
                    <div>
                      <span className="text-gray-500">Pulse:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.vitals.hrVal} bpm
                      </span>
                    </div>
                  )}
                  {data.vitals.tempVal !== undefined && (
                    <div>
                      <span className="text-gray-500">Temp:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.vitals.tempVal} °F
                      </span>
                    </div>
                  )}
                  {data.vitals.spo2Val !== undefined && (
                    <div>
                      <span className="text-gray-500">SpO₂:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.vitals.spo2Val} %
                      </span>
                    </div>
                  )}
                  {data.vitals.rrVal !== undefined && (
                    <div>
                      <span className="text-gray-500">RR:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.vitals.rrVal} /min
                      </span>
                    </div>
                  )}
                  {data.vitals.heightCm !== undefined && (
                    <div>
                      <span className="text-gray-500">Height:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.vitals.heightCm} cm
                      </span>
                    </div>
                  )}
                  {data.vitals.weightKg !== undefined && (
                    <div>
                      <span className="text-gray-500">Weight:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.vitals.weightKg} kg
                      </span>
                    </div>
                  )}
                </div>
              </DetailSection>
            )}

            {data.medicationEntries.length > 0 && (
              <DetailSection title="Treatment">
                <div className="space-y-2">
                  {data.medicationEntries.map((medication, index) => {
                    const label =
                      typeof medication === 'string'
                        ? medication
                        : [
                            stringifyValue(medication.name),
                            stringifyValue(medication.dosage),
                            stringifyValue(medication.duration),
                          ]
                            .filter((entry): entry is string => Boolean(entry))
                            .join(' • ');
                    return (
                      <div
                        key={`${visit.id ?? 'visit'}-med-${index}`}
                        className="rounded border border-gray-200 bg-white p-2 text-sm text-gray-800"
                      >
                        {label || `Medication ${index + 1}`}
                      </div>
                    );
                  })}
                </div>
              </DetailSection>
            )}

            {data.notes && (
              <DetailSection title="Notes">
                <p className="whitespace-pre-line">{data.notes}</p>
              </DetailSection>
            )}

            {data.drugNames.length > 0 && (
              <DetailSection title="Drugs">
                <div className="flex flex-wrap gap-2">
                  {data.drugNames.map((drug, index) => (
                    <Badge
                      key={`${visit.id ?? 'visit'}-drug-${index}`}
                      variant="outline"
                    >
                      {drug}
                    </Badge>
                  ))}
                </div>
              </DetailSection>
            )}

            {data.rxItems.length > 0 && (
              <DetailSection title="Prescription Items">
                <div className="space-y-2">
                  {data.rxItems.map((item, index) => {
                    const line: string[] = [];
                    const dosage = stringifyValue(item.dosage);
                    const dosageUnit = stringifyValue(item.dosageUnit);
                    const frequency = stringifyValue(item.frequency)?.replaceAll('_', ' ');
                    const duration = stringifyValue(item.duration);
                    const durationUnit = stringifyValue(item.durationUnit);
                    const route = stringifyValue(item.route);
                    const timing = stringifyValue(item.timing);
                    const instructions = stringifyValue(item.instructions);
                    const quantity = stringifyValue(item.quantity);

                    if (dosage) line.push(dosage + (dosageUnit ? ` ${dosageUnit}` : ''));
                    if (frequency) line.push(frequency);
                    if (duration) line.push(`${duration}${durationUnit ? ` ${durationUnit}` : ''}`);
                    if (route) line.push(route);
                    if (timing) line.push(timing);
                    if (quantity) line.push(`Qty: ${quantity}`);

                    return (
                      <div
                        key={`${visit.id ?? 'visit'}-rx-${index}`}
                        className="rounded border border-gray-200 bg-white p-3"
                      >
                        <div className="font-medium text-gray-900">
                          {stringifyValue(item.drugName) || `Item ${index + 1}`}
                        </div>
                        {line.length > 0 && (
                          <div className="mt-1 text-gray-700">{line.join(' • ')}</div>
                        )}
                        {instructions && (
                          <div className="mt-1 text-gray-700">
                            Instructions: {instructions}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </DetailSection>
            )}

            {hasPrescriptionSummary && (
              <DetailSection title="Prescription Summary">
                <div className="space-y-1">
                  {data.investigations.length > 0 && (
                    <div>
                      <span className="text-gray-500">Investigations:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.investigations.join(', ')}
                      </span>
                    </div>
                  )}
                  {data.procedurePlannedText && (
                    <div>
                      <span className="text-gray-500">Procedure Planned:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.procedurePlannedText}
                      </span>
                    </div>
                  )}
                  {data.followUpText && (
                    <div>
                      <span className="text-gray-500">Follow-up:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.followUpText}
                      </span>
                    </div>
                  )}
                  {data.validUntilIso && (
                    <div>
                      <span className="text-gray-500">Valid Until:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {formatMaybeDate(data.validUntilIso)}
                      </span>
                    </div>
                  )}
                  {data.counselingText && (
                    <div>
                      <span className="text-gray-500">Counseling:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.counselingText}
                      </span>
                    </div>
                  )}
                </div>
              </DetailSection>
            )}

            {hasHistorySummary && (
              <DetailSection title="History">
                <div className="space-y-1">
                  {data.pastHistoryText && (
                    <div>
                      <span className="text-gray-500">Past:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.pastHistoryText}
                      </span>
                    </div>
                  )}
                  {data.medicationHistoryText && (
                    <div>
                      <span className="text-gray-500">Medications:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.medicationHistoryText}
                      </span>
                    </div>
                  )}
                  {data.menstrualHistoryText && (
                    <div>
                      <span className="text-gray-500">Menstrual:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.menstrualHistoryText}
                      </span>
                    </div>
                  )}
                  {data.familyHistoryText && (
                    <div>
                      <span className="text-gray-500">Family:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.familyHistoryText}
                      </span>
                    </div>
                  )}
                </div>
              </DetailSection>
            )}

            {hasExaminationSummary && (
              <DetailSection title="Examination">
                <div className="space-y-1">
                  {data.generalAppearanceText && (
                    <div>
                      <span className="text-gray-500">General:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.generalAppearanceText}
                      </span>
                    </div>
                  )}
                  {data.dermatologyText && (
                    <div>
                      <span className="text-gray-500">Dermatology:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {data.dermatologyText}
                      </span>
                    </div>
                  )}
                </div>
              </DetailSection>
            )}

            {data.photoPreviews.length > 0 && (
              <DetailSection title="Photos">
                <div className="flex gap-2 overflow-x-auto">
                  {data.photoPreviews.map((photoUrl, index) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${visit.id ?? 'visit'}-photo-${index}`}
                      src={photoUrl}
                      alt="Visit photo preview"
                      className="h-16 w-24 rounded border object-cover"
                    />
                  ))}
                </div>
              </DetailSection>
            )}

            {footerActions && (
              <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4">
                {footerActions}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
