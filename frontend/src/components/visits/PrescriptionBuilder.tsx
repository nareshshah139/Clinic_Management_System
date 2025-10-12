'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ToastAction } from '@/components/ui/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronDown, ChevronUp, Languages, X } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { sortDrugsByRelevance, calculateDrugRelevanceScore, getErrorMessage } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { ensureGlobalPrintStyles } from '@/lib/printStyles';
// ID format validation is relaxed; backend accepts string IDs (cuid/uuid/custom)

// @ts-ignore - pagedjs types
import { Previewer } from 'pagedjs';

// Minimal local types aligned with backend DTO enums
type Language = 'EN' | 'TE' | 'HI';

type DosageUnit = 'MG' | 'ML' | 'MCG' | 'IU' | 'TABLET' | 'CAPSULE' | 'DROP' | 'SPRAY' | 'PATCH' | 'INJECTION';

type Frequency =
  | 'ONCE_DAILY'
  | 'TWICE_DAILY'
  | 'THREE_TIMES_DAILY'
  | 'FOUR_TIMES_DAILY'
  | 'EVERY_4_HOURS'
  | 'EVERY_6_HOURS'
  | 'EVERY_8_HOURS'
  | 'EVERY_12_HOURS'
  | 'AS_NEEDED'
  | 'WEEKLY'
  | 'MONTHLY';

type DurationUnit = 'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS';

interface PrescriptionItemForm {
  drugName: string;
  genericName?: string;
  brandName?: string;
  dosage: number | '';
  dosageUnit: DosageUnit;
  frequency: Frequency;
  dosePattern?: string;
  duration: number | '';
  durationUnit: DurationUnit;
  instructions?: string;
  route?: string;
  timing?: string;
  quantity?: number | '';
  notes?: string;
  isGeneric?: boolean;
  applicationSite?: string;
  applicationAmount?: string;
  dayPart?: string;
  leaveOn?: boolean;
  washOffAfterMinutes?: number | '';
  taperSchedule?: string;
  weightMgPerKgPerDay?: number | '';
  calculatedDailyDoseMg?: number | '';
  pregnancyWarning?: boolean;
  photosensitivityWarning?: boolean;
  foodInstructions?: string;
  pulseRegimen?: string;
}

interface Props {
  patientId: string;
  visitId: string | null;
  doctorId: string;
  userRole?: string;
  onCreated?: (id?: string) => void;
  reviewDate?: string;
  printBgUrl?: string;
  printTopMarginPx?: number;
  printLeftMarginPx?: number;
  printRightMarginPx?: number;
  printBottomMarginPx?: number;
  contentOffsetXPx?: number;
  contentOffsetYPx?: number;
  onChangeReviewDate?: (v: string) => void;
  refreshKey?: number;
  standalone?: boolean;
  standaloneReason?: string;
  includeSections?: Record<string, boolean>;
  onChangeIncludeSections?: (next: Record<string, boolean>) => void;
  ensureVisitId?: () => Promise<string>;
  onChangeContentOffset?: (x: number, y: number) => void;
  designAids?: {
    enabled: boolean;
    showGrid: boolean;
    showRulers: boolean;
    snapToGrid: boolean;
    gridSizePx: number;
    nudgeStepPx: number;
  };
  paperPreset?: 'A4' | 'LETTER';
  grayscale?: boolean;
  bleedSafe?: { enabled: boolean; safeMarginMm: number };
  frames?: { enabled: boolean; headerHeightMm: number; footerHeightMm: number };
  onChangeFrames?: (next: Partial<{ enabled: boolean; headerHeightMm: number; footerHeightMm: number }>) => void;
}

// Hoisted, memoized collapsible section to prevent remounting on parent re-render
const CollapsibleSection = React.memo(function CollapsibleSection({
  title,
  section,
  children,
  badge,
  highlight = false,
}: {
  title: string;
  section: string;
  children: React.ReactNode;
  badge?: string;
  highlight?: boolean;
}) {
  const headingId = `section-${section}-heading`;
  const contentId = `section-${section}-content`;
  return (
    <Card className={highlight ? 'bg-green-50 border-green-300' : ''}>
      <CardHeader className="pb-2">
        <div
          className="flex items-center justify-between w-full"
          aria-controls={contentId}
          aria-labelledby={headingId}
        >
          <div className="flex items-center gap-2">
            <CardTitle id={headingId} className="text-base">{title}</CardTitle>
            {badge && <Badge variant="outline" className="text-xs">{badge}</Badge>}
            {highlight && <div className="text-[10px] text-green-700">Auto-included in preview</div>}
          </div>
        </div>
      </CardHeader>
      <CardContent id={contentId} className="pt-0">
        {children}
      </CardContent>
    </Card>
  );
});

function PrescriptionBuilder({ patientId, visitId, doctorId, userRole = 'DOCTOR', onCreated, reviewDate, printBgUrl, printTopMarginPx, printLeftMarginPx, printRightMarginPx, printBottomMarginPx, contentOffsetXPx, contentOffsetYPx, onChangeReviewDate, refreshKey, standalone = false, standaloneReason, includeSections: includeSectionsProp, onChangeIncludeSections, ensureVisitId, onChangeContentOffset, designAids, paperPreset, grayscale, bleedSafe, frames, onChangeFrames }: Props) {
  const { toast } = useToast();
  useEffect(() => { ensureGlobalPrintStyles(); }, []);
  const [language, setLanguage] = useState<Language>('EN');
  const [diagnosis, setDiagnosis] = useState('');
  // Removed doctor's personal notes field from UI; retain no top-level notes state
  const [followUpInstructions, setFollowUpInstructions] = useState('');

  const [items, setItems] = useState<PrescriptionItemForm[]>([]);
  const [customSections, setCustomSections] = useState<Array<{ id: string; title: string; content: string }>>([]);
  const [procedureMetrics, setProcedureMetrics] = useState<{ device?: string; wavelengthNm?: number | ''; fluenceJcm2?: number | ''; spotSizeMm?: number | ''; pulseMs?: number | ''; shots?: number | ''; cooling?: string; area?: string; peelAgent?: string; peelConcentration?: string; peelContactTimeMin?: number | ''; frosting?: string; needleDepthMm?: string; passes?: number | ''; anesthetic?: string }>({});

  // Allow creating a drug in DB for doctors, admins, pharmacists
  const canAddDrugToDB = useMemo(() => ['ADMIN', 'PHARMACIST', 'DOCTOR'].includes(String(userRole || '').toUpperCase()), [userRole]);
  const [addDrugOpen, setAddDrugOpen] = useState(false);
  const [newDrugForm, setNewDrugForm] = useState<{ name: string; manufacturerName: string; price: string; packSizeLabel: string }>({ name: '', manufacturerName: '', price: '', packSizeLabel: '' });
  const openAddDrugDialog = () => {
    const q = (drugQuery || '').trim();
    setNewDrugForm({ name: q, manufacturerName: '', price: '', packSizeLabel: '' });
    setAddDrugOpen(true);
  };
  const handleCreateDrug = async () => {
    try {
      const payload: any = {
        name: (newDrugForm.name || '').trim(),
        manufacturerName: (newDrugForm.manufacturerName || '').trim(),
        price: Number(newDrugForm.price) || 0,
        packSizeLabel: (newDrugForm.packSizeLabel || '').trim() || 'unit',
        description: [
          'Added from Prescription Builder',
          patientId ? `patientId=${patientId}` : null,
          visitId ? `visitId=${visitId}` : null,
          doctorId ? `doctorId=${doctorId}` : null,
        ].filter(Boolean).join('; '),
      };
      if (!payload.name || !payload.manufacturerName) {
        toast({ variant: 'destructive', title: 'Missing details', description: 'Name and Manufacturer are required.' });
        return;
      }
      // Client-side duplicate pre-check by name+manufacturer (best-effort)
      try {
        const dupList: any = await apiClient.get('/drugs', { search: payload.name, limit: 20 });
        const items = Array.isArray(dupList) ? dupList : (Array.isArray((dupList as any)?.items) ? (dupList as any).items : (Array.isArray((dupList as any)?.data) ? (dupList as any).data : []));
        const hasDup = (items as any[]).some((d: any) => String(d?.name || '').toLowerCase() === payload.name.toLowerCase() && String(d?.manufacturerName || '').toLowerCase() === payload.manufacturerName.toLowerCase());
        if (hasDup) {
          toast({ variant: 'destructive', title: 'Duplicate detected', description: 'A drug with the same name and manufacturer already exists.' });
          return;
        }
      } catch {}
      const created: any = await apiClient.post('/drugs', payload);
      setAddDrugOpen(false);
      // Immediately add to current prescription items
      addItemFromDrug({ id: created?.id, name: created?.name, genericName: '', manufacturerName: created?.manufacturerName });
      toast({ variant: 'success', title: 'Drug added', description: 'Drug saved to database and added to prescription.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to add drug', description: getErrorMessage(e) });
    }
  };

  // Additional clinical fields per requirements
  const [chiefComplaints, setChiefComplaints] = useState<string>('');
  const [pastHistory, setPastHistory] = useState<string>('');
  const [medicationHistory, setMedicationHistory] = useState<string>('');
  const [menstrualHistory, setMenstrualHistory] = useState<string>('');
  const [familyHistoryDM, setFamilyHistoryDM] = useState<boolean>(false);
  const [familyHistoryHTN, setFamilyHistoryHTN] = useState<boolean>(false);
  const [familyHistoryThyroid, setFamilyHistoryThyroid] = useState<boolean>(false);
  const [familyHistoryOthers, setFamilyHistoryOthers] = useState<string>('');
  const [creatingTemplate, setCreatingTemplate] = useState<boolean>(false);
  const [savingFieldsTemplate, setSavingFieldsTemplate] = useState<boolean>(false);

  const showTemplateCreateError = useCallback((error: any, retry?: () => void) => {
    const status = error?.status;
    let title = 'Failed to create template';
    let description = getErrorMessage(error) || 'Please try again.';
    let withRetry = false;

    switch (status) {
      case 400:
        title = 'Invalid template';
        description = getErrorMessage(error) || 'Please check required fields and try again.';
        break;
      case 401:
        title = 'Not signed in';
        description = 'Your session may have expired. Please sign in and retry.';
        break;
      case 403:
        title = 'Action not allowed';
        description = 'You do not have permission to create templates.';
        break;
      case 404:
        title = 'Service unavailable';
        description = 'Template service is unavailable. Please try again later.';
        withRetry = true;
        break;
      case 408:
        title = 'Request timed out';
        description = 'Network seems slow. Please retry.';
        withRetry = true;
        break;
      case 409:
        title = 'Duplicate name';
        description = 'A template with this name already exists. Choose a different name.';
        break;
      case 429:
        title = 'Too many requests';
        description = 'You’ve made too many requests. Please wait a moment and retry.';
        withRetry = true;
        break;
      default:
        if (!status || status >= 500) {
          title = 'Server error';
          description = 'Something went wrong on our side. Please try again shortly.';
          withRetry = true;
        }
    }

    toast({
      variant: 'destructive',
      title,
      description,
      action: retry && withRetry ? (
        <ToastAction altText="Retry" onClick={retry}>Retry</ToastAction>
      ) : undefined,
    });
  }, [toast]);

  // Topicals
  // Removed Topicals UI

  // Voice-to-text functionality (Chief Complaints)
  const [isListening, setIsListening] = useState(false);
  const [activeVoiceField, setActiveVoiceField] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startVoiceInput = useCallback(async (fieldName: string) => {
    if (isListening && activeVoiceField === fieldName && recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch {}
      return;
    }

    let mimeType = '';
    let recorder: MediaRecorder;
    const chunks: BlobPart[] = [];
    const safeMimeTypes = ['audio/webm', 'audio/mp4'];
    const tryInitRecorder = (stream: MediaStream) => {
      for (const t of safeMimeTypes) {
        if ((window as any).MediaRecorder?.isTypeSupported?.(t)) {
          mimeType = t;
          try {
            recorder = new MediaRecorder(stream, { mimeType: t as any });
            return recorder;
          } catch {}
        }
      }
      try {
        recorder = new MediaRecorder(stream);
        return recorder;
      } catch (e) {
        throw new Error('Unable to start audio recorder');
      }
    };

    setIsListening(true);
    setActiveVoiceField(fieldName);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const r = tryInitRecorder(stream);
      if (!r) {
        toast({ variant: 'warning', title: 'Recording error', description: 'Your browser does not support audio recording.' });
        setIsListening(false);
        setActiveVoiceField(null);
        try { stream.getTracks().forEach(t => t.stop()); } catch {}
        return;
      }

      recorderRef.current = r;
      r.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      r.onstop = async () => {
        try { stream.getTracks().forEach(t => t.stop()); } catch {}
        streamRef.current = null;
        recorderRef.current = null;
        const recordedType: string = mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: recordedType });
        try {
          const baseUrl = '/api';
          const fd = new FormData();
          const filename = recordedType === 'audio/mp4' ? 'speech.m4a' : 'speech.webm';
          fd.append('file', blob, filename);
          const res = await fetch(`${baseUrl}/visits/transcribe`, { method: 'POST', body: fd, credentials: 'include' });
          if (!res.ok) {
            let errText = '';
            try { errText = await res.text(); } catch {}
            // eslint-disable-next-line no-console
            console.error('Transcription request failed:', res.status, errText);
            toast({ variant: 'warning', title: 'Transcription failed', description: `Speech-to-text request returned ${res.status}.` });
            return;
          }
          const data = await res.json();
          const text = (data?.text as string) || '';
          if (text) {
            switch (fieldName) {
              case 'chiefComplaints':
                setChiefComplaints(prev => (prev ? prev + ' ' : '') + text);
                break;
            }
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Speech-to-text error:', e);
          toast({ variant: 'warning', title: 'Speech-to-text error', description: getErrorMessage(e) || 'Please try again.' });
        } finally {
          setIsListening(false);
          setActiveVoiceField(null);
        }
      };

      try { r.start(); } catch {
        toast({ variant: 'warning', title: 'Recording error', description: 'Failed to start recording.' });
        setIsListening(false);
        setActiveVoiceField(null);
        try { stream.getTracks().forEach(t => t.stop()); } catch {}
        return;
      }
      setTimeout(() => { if (r.state !== 'inactive') r.stop(); }, 300000);
    } catch (e) {
      setIsListening(false);
      setActiveVoiceField(null);
      try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
      recorderRef.current = null;
      toast({ variant: 'warning', title: 'Microphone access denied', description: getErrorMessage(e) || 'Check browser permissions and try again.' });
    }
  }, [activeVoiceField, isListening, toast]);

  const VoiceButton = useCallback(({ fieldName }: { fieldName: string }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`ml-2 ${activeVoiceField === fieldName ? 'bg-red-100 text-red-600' : ''}`}
      onClick={() => void startVoiceInput(fieldName)}
      disabled={isListening && activeVoiceField !== fieldName}
    >
      {activeVoiceField === fieldName ? '🔴' : '🎤'}
    </Button>
  ), [activeVoiceField, isListening, startVoiceInput]);

  // Skin Concerns moved from Assessment into Chief Complaints
  const SKIN_CONCERNS = useMemo(() => (
    ['Acne', 'Pigmentation', 'Aging', 'Dryness', 'Sensitivity', 'Redness', 'Scarring']
  ), []);
  const [skinConcerns, setSkinConcerns] = useState<Set<string>>(new Set());
  const toggleSet = useCallback(<T,>(current: Set<T>, item: T, updater: (next: Set<T>) => void) => {
    const next = new Set(current);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    updater(next);
  }, []);
  // Removed Topicals UI
  // Removed Post Procedure Care UI
  const investigationOptions: string[] = [
    'CBC', 'ESR', 'CRP', 'LFT', 'Fasting lipid profile', 'RFT', 'Creatinine', 'FBS', 'Fasting Insulin', 'HbA1c', 'RBS', 'CUE', 'Stool examination', 'Total Testosterone', 'S. Prolactin', 'Vitamin B12', 'Vitamin D', 'Ferritin', 'TSH', 'Thyroid profile', 'HIV-I,II', 'HbS Ag', 'Anti HCV', 'VDRL', 'RPR', 'TPHA', 'TB Gold Quantiferon Test', 'Montoux Test', 'Chest Xray PA view', '2D Echo', 'Skin Biopsy'
  ];
  const [investigations, setInvestigations] = useState<string[]>([]);
  const [procedurePlanned, setProcedurePlanned] = useState<string>('');
  // Vitals (with BMI)
  const [vitalsHeightCm, setVitalsHeightCm] = useState<number | ''>('');
  const [vitalsWeightKg, setVitalsWeightKg] = useState<number | ''>('');
  const [vitalsBmi, setVitalsBmi] = useState<number | ''>('');
  const [vitalsBpSys, setVitalsBpSys] = useState<number | ''>('');
  const [vitalsBpDia, setVitalsBpDia] = useState<number | ''>('');
  const [vitalsPulse, setVitalsPulse] = useState<number | ''>('');
  // Restore drug search states
  const [drugQuery, setDrugQuery] = useState('');
  const [drugStockById, setDrugStockById] = useState<Record<string, number>>({});
  const [drugStockLoading, setDrugStockLoading] = useState<Record<string, boolean>>({});
  const [drugResults, setDrugResults] = useState<any[]>([]);
  const [loadingDrugs, setLoadingDrugs] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  // Removed local-only field templates in favor of server persistence
  // Default dermatology templates (client-side suggestions)
  const defaultDermTemplates: Array<any> = [
    {
      id: 'derm-acne-mild',
      name: 'Acne (Mild) — Topical regimen',
      description: 'Adapalene night + BPO morning + gentle facewash + sunscreen',
      items: [
        { drugName: 'Adapalene Gel 0.1%', dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 12, durationUnit: 'WEEKS', timing: 'Bedtime', route: 'Topical', instructions: 'Apply a pea-sized amount to entire face at night' },
        { drugName: 'Benzoyl Peroxide Gel 2.5%', dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 12, durationUnit: 'WEEKS', timing: 'Morning', route: 'Topical', instructions: 'Apply thin layer to affected areas in the morning' },
      ],
      metadata: {
        chiefComplaints: 'Acne lesions on face',
        diagnosis: 'Acne vulgaris (mild)',
        examination: {
          generalAppearance: 'Comedonal acne predominantly over T-zone',
          dermatology: {
            skinType: 'III',
            morphology: ['Comedo', 'Papule'],
            distribution: ['Face'],
            acneSeverity: 'Mild',
            itchScore: undefined,
            skinConcerns: ['Post-acne marks']
          }
        }
      },
    },
    {
      id: 'derm-fungal-tinea',
      name: 'Tinea (Fungal) — Topical + Hygiene',
      description: 'Clotrimazole cream + hygiene advice',
      items: [
        { drugName: 'Clotrimazole Cream 1%', dosage: 1, dosageUnit: 'TABLET', frequency: 'TWICE_DAILY', duration: 4, durationUnit: 'WEEKS', route: 'Topical', instructions: 'Apply to affected area and 2 cm beyond' },
      ],
      metadata: {
        chiefComplaints: 'Itchy annular rash in folds',
        diagnosis: 'Tinea corporis',
        examination: {
          generalAppearance: 'Erythematous annular plaques with peripheral scaling',
          dermatology: {
            skinType: 'IV',
            morphology: ['Plaque', 'Scale'],
            distribution: ['Flexures'],
            acneSeverity: undefined,
            itchScore: 5,
            skinConcerns: []
          }
        }
      },
    },
    {
      id: 'derm-eczema-care',
      name: 'Eczema — Emollients + Low-potency steroid',
      description: 'Hydrocortisone short course + moisturizers',
      items: [
        { drugName: 'Hydrocortisone Cream 1%', dosage: 1, dosageUnit: 'TABLET', frequency: 'TWICE_DAILY', duration: 14, durationUnit: 'DAYS', route: 'Topical', instructions: 'Thin layer to affected areas for 1-2 weeks then taper' },
      ],
      metadata: {
        chiefComplaints: 'Itchy scaly patches',
        diagnosis: 'Atopic dermatitis',
        examination: {
          generalAppearance: 'Lichenified plaques with excoriations',
          dermatology: {
            skinType: 'III',
            morphology: ['Plaque', 'Scale'],
            distribution: ['Flexures', 'Hands'],
            acneSeverity: undefined,
            itchScore: 7,
            skinConcerns: []
          }
        }
      },
    },
  ];
  // Autocomplete state for clinical fields
  const [diagOptions, setDiagOptions] = useState<string[]>([]);
  const [complaintOptions, setComplaintOptions] = useState<string[]>([]);
  const [loadingVisit, setLoadingVisit] = useState(false);
  const [visitData, setVisitData] = useState<any>(null);
  const createdPrescriptionIdRef = useRef<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [autoPreview, setAutoPreview] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewJustUpdated, setPreviewJustUpdated] = useState(false);
  const [rxPrintFormat, setRxPrintFormat] = useState<'TEXT' | 'TABLE'>('TEXT');
  const printRef = useRef<HTMLDivElement>(null);
  const [translatingPreview, setTranslatingPreview] = useState(false);
  const [translationsMap, setTranslationsMap] = useState<Record<string, string>>({});
  // Multi-page preview state
  const [previewViewMode, setPreviewViewMode] = useState<'scroll' | 'paginated'>('paginated');
  const [currentPreviewPage, setCurrentPreviewPage] = useState(1);
  const [totalPreviewPages, setTotalPreviewPages] = useState(1);
  // Pagination engine: 'custom' (default) or 'pagedjs'
  const [paginationEngine, setPaginationEngine] = useState<'custom' | 'pagedjs'>('custom');
  const [pagedJsProcessing, setPagedJsProcessing] = useState(false);
  const pagedJsContainerRef = useRef<HTMLDivElement>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [printTotals, setPrintTotals] = useState<Record<string, number>>({});
  const [showRefillStamp, setShowRefillStamp] = useState<boolean>(false);
  // Live margin overrides (px). Null -> use printer profile or provided defaults
  const [overrideTopMarginPx, setOverrideTopMarginPx] = useState<number | null>(null);
  const [overrideBottomMarginPx, setOverrideBottomMarginPx] = useState<number | null>(null);
  const [interactionsOpen, setInteractionsOpen] = useState(false);
  // Print page break controls
  const [breakBeforeMedications, setBreakBeforeMedications] = useState(false);
  const [breakBeforeInvestigations, setBreakBeforeInvestigations] = useState(false);
  const [breakBeforeFollowUp, setBreakBeforeFollowUp] = useState(false);
  const [breakBeforeSignature, setBreakBeforeSignature] = useState(false);
  const [avoidBreakInsideTables, setAvoidBreakInsideTables] = useState(true);
  const [interactions, setInteractions] = useState<any[]>([]);
  type OneMgSelection = { sku: string; name: string; price?: number };
  const [oneMgMap, setOneMgMap] = useState<Array<{ q: string; loading: boolean; results: any[]; selection?: OneMgSelection; qty: number }>>([]);
  const [oneMgChecking, setOneMgChecking] = useState(false);
  const [oneMgTotals, setOneMgTotals] = useState<any>(null);
  const [confirmPharmacy, setConfirmPharmacy] = useState<{
    open: boolean;
    prescriptionId: string;
    summary: { medicationsCount: number } | null;
  }>({ open: false, prescriptionId: '', summary: null });

  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    clinical: true,
    histories: true,
    procedures: true,
    investigations: true,
    templates: true,
    sections: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Fallback patient data (used when visit data is not available or before saving visit)
  const [patientData, setPatientData] = useState<any>(null);

  // Normalize visit JSON fields for reliable preview rendering
  const visitPlan = useMemo(() => {
    try {
      if (!visitData?.plan) return null;
      return typeof visitData.plan === 'object' ? visitData.plan : JSON.parse(visitData.plan);
    } catch {
      return null;
    }
  }, [visitData]);

  const visitVitals = useMemo(() => {
    try {
      if (!visitData?.vitals) return null;
      return typeof visitData.vitals === 'object' ? visitData.vitals : JSON.parse(visitData.vitals);
    } catch {
      return null;
    }
  }, [visitData]);

  // On Examination (Dermatology) - moved from Visit form into Prescription tab
  const DERM_DIAGNOSES = useMemo(() => [
    'Acne vulgaris','Atopic dermatitis','Psoriasis','Tinea corporis','Melasma','Post-inflammatory hyperpigmentation','Urticaria','Rosacea','Seborrheic dermatitis','Lichen planus','Vitiligo'
  ], []);
  const readCustomList = useCallback((key: string): string[] => {
    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      return Array.isArray(arr) ? arr.filter(Boolean) : [];
    } catch {
      return [];
    }
  }, []);

  const writeCustomList = useCallback((key: string, list: string[]) => {
    try {
      localStorage.setItem(key, JSON.stringify(list.slice(0, 100)));
    } catch {}
  }, []);

  const MORPHOLOGY_BASE = useMemo(() => ['Macule','Papule','Pustule','Nodule','Plaque','Vesicle','Scale','Erosion','Ulcer','Comedo'], []);
  const DISTRIBUTION_BASE = useMemo(() => ['Face','Scalp','Neck','Trunk','Arms','Legs','Hands','Feet','Flexures','Extensors','Generalized'], []);
  const [customMorphology, setCustomMorphology] = useState<string[]>(() => readCustomList('cms.custom.morphology'));
  const [customDistribution, setCustomDistribution] = useState<string[]>(() => readCustomList('cms.custom.distribution'));
  useEffect(() => { writeCustomList('cms.custom.morphology', customMorphology); }, [customMorphology, writeCustomList]);
  useEffect(() => { writeCustomList('cms.custom.distribution', customDistribution); }, [customDistribution, writeCustomList]);
  const MORPHOLOGY = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const m of [...MORPHOLOGY_BASE, ...customMorphology]) {
      const k = (m || '').trim();
      if (!k) continue;
      const key = k.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(k);
    }
    return merged;
  }, [MORPHOLOGY_BASE, customMorphology]);
  const DISTRIBUTION = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const d of [...DISTRIBUTION_BASE, ...customDistribution]) {
      const k = (d || '').trim();
      if (!k) continue;
      const key = k.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(k);
    }
    return merged;
  }, [DISTRIBUTION_BASE, customDistribution]);
  const FITZPATRICK = useMemo(() => ['I','II','III','IV','V','VI'], []);
  const [exSkinType, setExSkinType] = useState<string>('');
  const [exMorphology, setExMorphology] = useState<Set<string>>(new Set());
  const [exDistribution, setExDistribution] = useState<Set<string>>(new Set());
  const [exAcneSeverity, setExAcneSeverity] = useState<string>('');
  const [exItchScore, setExItchScore] = useState<string>('');
  const [newMorphology, setNewMorphology] = useState<string>('');
  const [newDistribution, setNewDistribution] = useState<string>('');
  const [exTriggers, setExTriggers] = useState<string>('');
  const [exPriorTx, setExPriorTx] = useState<string>('');
  const [exDermDx, setExDermDx] = useState<Set<string>>(new Set());
  const [exObjective, setExObjective] = useState<string>('');

  // Seed On Examination from visit if present
  useEffect(() => {
    try {
      const exam = (visitData?.examination && typeof visitData.examination === 'object') ? visitData.examination : (visitData?.examination ? JSON.parse(visitData.examination) : null);
      if (!exam) return;
      const derm = exam.dermatology || {};
      if (derm.skinType) setExSkinType(String(derm.skinType));
      if (Array.isArray(derm.morphology)) setExMorphology(new Set(derm.morphology));
      if (Array.isArray(derm.distribution)) setExDistribution(new Set(derm.distribution));
      if (derm.acneSeverity) setExAcneSeverity(String(derm.acneSeverity));
      if (typeof derm.itchScore !== 'undefined') setExItchScore(String(derm.itchScore ?? ''));
      if (derm.triggers) setExTriggers(String(derm.triggers));
      if (derm.priorTreatments) setExPriorTx(String(derm.priorTreatments));
      if (Array.isArray(derm.skinConcerns)) setSkinConcerns(new Set(derm.skinConcerns));
      if (Array.isArray(visitData?.diagnosis)) setExDermDx(new Set((visitData.diagnosis as any[]).map((d: any) => (typeof d === 'string' ? d : d?.diagnosis)).filter(Boolean)));
      const generalAppearance = exam.generalAppearance || '';
      if (generalAppearance) setExObjective(String(generalAppearance));
    } catch {}
  }, [visitData]);

  // Also seed triggers/prior treatments from visit history if present
  useEffect(() => {
    try {
      const hist = (visitData?.history && typeof visitData.history === 'object') ? visitData.history : (visitData?.history ? JSON.parse(visitData.history) : null);
      if (!hist) return;
      if (hist.triggers) setExTriggers(String(hist.triggers));
      if (hist.priorTreatments) setExPriorTx(String(hist.priorTreatments));
    } catch {}
  }, [visitData]);

  // Seed local vitals from visit data (one-time when empty)
  useEffect(() => {
    if (!visitVitals) return;
    // Only fill if local fields are empty
    const hv = (vitalsHeightCm === '' || vitalsHeightCm == null) && (visitVitals.height || visitVitals.heightCm);
    const wv = (vitalsWeightKg === '' || vitalsWeightKg == null) && visitVitals.weight;
    const sv = (vitalsBpSys === '' || vitalsBpSys == null) && (visitVitals.systolicBP || visitVitals.bpSys || visitVitals.bpS);
    const dv = (vitalsBpDia === '' || vitalsBpDia == null) && (visitVitals.diastolicBP || visitVitals.bpDia || visitVitals.bpD);
    const pv = (vitalsPulse === '' || vitalsPulse == null) && (visitVitals.heartRate || visitVitals.pulse || visitVitals.pr);
    if (hv) setVitalsHeightCm(Number(visitVitals.height || visitVitals.heightCm));
    if (wv) setVitalsWeightKg(Number(visitVitals.weight));
    if (sv) setVitalsBpSys(Number(visitVitals.systolicBP || visitVitals.bpSys || visitVitals.bpS));
    if (dv) setVitalsBpDia(Number(visitVitals.diastolicBP || visitVitals.bpDia || visitVitals.bpD));
    if (pv) setVitalsPulse(Number(visitVitals.heartRate || visitVitals.pulse || visitVitals.pr));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitVitals]);

  const [localIncludeSections, setLocalIncludeSections] = useState<Record<string, boolean>>({
    patientInfo: true,
    diagnosis: true,
    medications: true,
    procedures: true,
    counseling: true,
    vitals: true,
    followUp: true,
    notes: false,
    doctorSignature: true,
    chiefComplaints: true,
    histories: true,
    familyHistory: true,
    topicals: false,
    postProcedure: true,
    investigations: true,
    procedurePlanned: true,
    procedureParameters: true,
  });

  const includeSections = includeSectionsProp ?? localIncludeSections;
  const setIncludeSections = onChangeIncludeSections ?? setLocalIncludeSections;

  const tt = useCallback((key: string, fallback?: string) => {
    if (language === 'EN') return fallback ?? '';
    return translationsMap[key] ?? (fallback ?? '');
  }, [language, translationsMap]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.diag-autocomplete')) setDiagOptions([]);
      if (!target.closest('.complaint-autocomplete')) setComplaintOptions([]);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const translateForPreview = useCallback(async () => {
    if (language === 'EN') {
      setTranslationsMap({});
      return;
    }
    const plan: Array<{ key: string; text: string }> = [];
    const pushIf = (key: string, value?: string) => {
      const v = (value ?? '').trim();
      if (v) plan.push({ key, text: v });
    };
    // Top-level fields
    pushIf('diagnosis', diagnosis);
    pushIf('chiefComplaints', chiefComplaints);
    pushIf('pastHistory', pastHistory);
    pushIf('medicationHistory', medicationHistory);
    pushIf('menstrualHistory', menstrualHistory);
    pushIf('familyHistoryOthers', familyHistoryOthers);
    pushIf('followUpInstructions', followUpInstructions);
    pushIf('procedurePlanned', procedurePlanned);
    // Investigations
    (Array.isArray(investigations) ? investigations : []).forEach((inv, i) => {
      if (typeof inv === 'string') pushIf(`investigations.${i}`, inv);
    });
    // Custom sections
    (customSections || []).forEach((s, i) => {
      pushIf(`custom.${i}.title`, s?.title as any);
      pushIf(`custom.${i}.content`, s?.content as any);
    });
    // Medication item-level free-form fields
    (items || []).forEach((it, i) => {
      pushIf(`items.${i}.instructions`, it?.instructions as any);
      pushIf(`items.${i}.applicationSite`, it?.applicationSite as any);
      pushIf(`items.${i}.applicationAmount`, it?.applicationAmount as any);
      pushIf(`items.${i}.dayPart`, it?.dayPart as any);
      pushIf(`items.${i}.taperSchedule`, it?.taperSchedule as any);
      pushIf(`items.${i}.foodInstructions`, it?.foodInstructions as any);
      pushIf(`items.${i}.pulseRegimen`, it?.pulseRegimen as any);
    });

    if (plan.length === 0) {
      console.debug('[PrescriptionBuilder] translateForPreview: no translatable fields');
      setTranslationsMap({});
      return;
    }
    try {
      const target = (language === 'HI' ? 'HI' : 'TE') as 'HI' | 'TE';
      toast({
        title: 'Translating…',
        description: `Preparing ${plan.length} field(s) in ${target === 'HI' ? 'Hindi' : 'Telugu'}`,
      });
      console.debug('[PrescriptionBuilder] translateForPreview: sending', { target, count: plan.length });
      const { translations } = await apiClient.translateTexts(target, plan.map(p => p.text));
      const map: Record<string, string> = {};
      plan.forEach((p, idx) => {
        map[p.key] = translations[idx] ?? p.text;
      });
      setTranslationsMap(map);
      console.debug('[PrescriptionBuilder] translateForPreview: received', { received: translations.length });
    } catch (e) {
      // Fallback to original content on any error
      const map: Record<string, string> = {};
      plan.forEach((p) => { map[p.key] = p.text; });
      setTranslationsMap(map);
      console.warn('[PrescriptionBuilder] translateForPreview: failed, falling back to originals', e);
      toast({
        variant: 'warning',
        title: 'Translation unavailable',
        description: 'Showing original text. Check server OPENAI_API_KEY and network.',
      });
    }
  }, [language, diagnosis, chiefComplaints, pastHistory, medicationHistory, menstrualHistory, familyHistoryOthers, procedurePlanned, investigations, customSections, items]);

  // Derived flags to show inline UI feedback for auto-included sections
  const hasChiefComplaints = useMemo(() => Boolean(chiefComplaints?.trim()?.length), [chiefComplaints]);
  const hasHistories = useMemo(() => Boolean(
    pastHistory?.trim()?.length || medicationHistory?.trim()?.length || menstrualHistory?.trim()?.length || exTriggers?.trim()?.length || exPriorTx?.trim()?.length
  ), [pastHistory, medicationHistory, menstrualHistory, exTriggers, exPriorTx]);
  
  const hasFamilyHistory = useMemo(() => Boolean(
    familyHistoryDM || familyHistoryHTN || familyHistoryThyroid || familyHistoryOthers?.trim()?.length
  ), [familyHistoryDM, familyHistoryHTN, familyHistoryThyroid, familyHistoryOthers]);
  
  const hasInvestigations = useMemo(() => Array.isArray(investigations) && investigations.length > 0, [investigations]);
  const hasProcedurePlanned = useMemo(() => Boolean(procedurePlanned?.trim()?.length), [procedurePlanned]);
  const validItems = useMemo(() => items.filter((it) => (it.drugName || '').trim().length > 0), [items]);
  const canCreate = useMemo(
    () => Boolean(
      patientId &&
      doctorId &&
      validItems.length > 0 &&
      (visitId || standalone || ensureVisitId)
    ),
    [patientId, visitId, doctorId, validItems.length, standalone, ensureVisitId]
  );

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    const loadVisit = async () => {
      if (!visitId || standalone) return;
      try {
        setLoadingVisit(true);
        const res: any = await apiClient.get(`/visits/${visitId}`);
        setVisitData(res || null);
        // Seed fields from visit if empty
        try {
          const diag = Array.isArray(res?.diagnosis) ? res.diagnosis : (res?.diagnosis ? JSON.parse(res.diagnosis) : []);
          if (!diagnosis && Array.isArray(diag) && diag.length > 0) {
            setDiagnosis(diag.map((d: any) => d?.diagnosis || '').filter(Boolean).join(', '));
          }
        } catch {}
        try {
          const plan = typeof res?.plan === 'object' ? res.plan : (res?.plan ? JSON.parse(res.plan) : {});
          const follow = plan?.dermatology?.followUpDays;
          if (!followUpInstructions && follow) setFollowUpInstructions(`Follow up in ${follow} days`);
        } catch {}
        // Enable sections based on visit content
        setIncludeSections({
          ...includeSections,
          diagnosis: Boolean(res?.diagnosis),
          counseling: Boolean(res?.plan),
          vitals: Boolean(res?.vitals),
        });
      } catch (e) {
        setVisitData(null);
      } finally {
        setLoadingVisit(false);
      }
    };
    void loadVisit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId, refreshKey, standalone, includeSections, setIncludeSections]);

  // Load patient details if visitId is not present or visit payload lacks patient
  useEffect(() => {
    const loadPatient = async () => {
      if (!patientId) return;
      // Only fetch if we don't already have patient info from visit
      if (visitData?.patient?.id === patientId && visitData?.patient?.name) return;
      try {
        const p = await apiClient.get(`/patients/${patientId}`);
        setPatientData(p || null);
      } catch {
        // ignore
      }
    };
    void loadPatient();
  }, [patientId, visitData?.patient?.id, visitData?.patient?.name]);

  // Compute BMI when height/weight update
  useEffect(() => {
    const h = Number(vitalsHeightCm);
    const w = Number(vitalsWeightKg);
    if (h > 0 && w > 0) {
      const meters = h / 100;
      const bmiVal = w / (meters * meters);
      setVitalsBmi(Number(bmiVal.toFixed(1)));
    } else {
      setVitalsBmi('');
    }
  }, [vitalsHeightCm, vitalsWeightKg]);

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const res: any = await apiClient.getPrescriptionTemplates({ limit: 50 });
      setTemplates(res.templates || res.data || []);
    } catch (e) {
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Debounced clinical autocomplete loaders
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        if (!patientId) return;
        const res = await apiClient.autocompletePrescriptionField({ field: 'diagnosis', patientId, visitId: visitId || undefined, q: diagnosis, limit: 8 });
        const server = Array.isArray(res) ? (res as string[]) : [];
        const local = getLocalSuggestions('diagnosis', diagnosis, 8);
        const merged: string[] = [];
        const seen = new Set<string>();
        [...local, ...server].forEach((s) => {
          const k = (s || '').toLowerCase();
          if (!seen.has(k)) { seen.add(k); merged.push(s); }
        });
        setDiagOptions(merged.slice(0, 8));
      } catch {
        setDiagOptions(getLocalSuggestions('diagnosis', diagnosis, 8));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [diagnosis, patientId, visitId]);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        if (!patientId) return;
        const res = await apiClient.autocompletePrescriptionField({ field: 'chiefComplaints', patientId, visitId: visitId || undefined, q: chiefComplaints, limit: 8 });
        const server = Array.isArray(res) ? (res as string[]) : [];
        const local = getLocalSuggestions('chiefComplaints', chiefComplaints, 8);
        const merged: string[] = [];
        const seen = new Set<string>();
        [...local, ...server].forEach((s) => {
          const k = (s || '').toLowerCase();
          if (!seen.has(k)) { seen.add(k); merged.push(s); }
        });
        setComplaintOptions(merged.slice(0, 8));
      } catch {
        setComplaintOptions(getLocalSuggestions('chiefComplaints', chiefComplaints, 8));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [chiefComplaints, patientId, visitId]);

  // removed doctor's personal notes composition and autocomplete logic

  // Debounced drug search (uses prescriptions autocomplete)
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = (drugQuery || '').trim();
      if (q.length < 2) {
        setDrugResults([]);
        return;
      }
      try {
        setLoadingDrugs(true);
        const res: any = await apiClient.get('/prescriptions/drugs/autocomplete', { q, limit: 30 });
        const primary = Array.isArray(res)
          ? res
          : (Array.isArray(res?.data)
            ? res.data
            : (Array.isArray(res?.items)
              ? res.items
              : (Array.isArray(res?.results) ? res.results : [])));
        let list: any[] = primary;
        if (!Array.isArray(list) || list.length === 0) {
          // Fallback to pharmacy autocomplete which supports broader modes
          try {
            const res2: any = await apiClient.get('/drugs/autocomplete', { q, limit: 30, mode: 'all' });
            list = Array.isArray(res2) ? res2 : (Array.isArray(res2?.data) ? res2.data : []);
          } catch {}
        }
        // Sort by relevance if available
        const sorted = sortDrugsByRelevance(Array.isArray(list) ? list : [], q);
        setDrugResults(sorted.slice(0, 10));
      } catch (e) {
        try {
          const res2: any = await apiClient.get('/drugs/autocomplete', { q, limit: 30, mode: 'all' });
          const list2 = Array.isArray(res2) ? res2 : (Array.isArray(res2?.data) ? res2.data : []);
          const sorted2 = sortDrugsByRelevance(Array.isArray(list2) ? list2 : [], q);
          setDrugResults(sorted2.slice(0, 10));
        } catch {
          setDrugResults([]);
        }
      } finally {
        setLoadingDrugs(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [drugQuery]);

  const searchDrugs = (q: string) => {
    setDrugQuery(q);
    pushRecent('drugQueries', q);
  };

  // Highlight matching text in search results
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim() || !text) return text;
    
    const regex = new RegExp(`(${query.split(/\s+/).map(word => 
      word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    ).join('|')})`, 'gi');
    
    const parts = text.split(regex);
    return parts.map((part, index) => 
      regex.test(part) ? 
        <span key={index} className="bg-yellow-200 font-semibold">{part}</span> : 
        part
    );
  };

  // Prefetch remaining stock for a drug by id (uses /drugs/:id, accessible to doctors)
  const prefetchDrugStockById = async (drugId?: string) => {
    if (!drugId) return;
    if (drugStockById[drugId] !== undefined || drugStockLoading[drugId]) return;
    setDrugStockLoading((prev) => ({ ...prev, [drugId]: true }));
    try {
      const detail: any = await apiClient.get(`/drugs/${drugId}`);
      const inv = Array.isArray(detail?.inventoryItems) ? detail.inventoryItems : [];
      const stock = inv.length > 0 ? inv.reduce((sum: number, it: any) => sum + (Number(it?.currentStock || 0) || 0), 0) : 20;
      setDrugStockById((prev) => ({ ...prev, [drugId]: stock }));
    } catch {
      // If inventory not configured or error, default to 20
      setDrugStockById((prev) => ({ ...prev, [drugId]: 20 }));
    } finally {
      setDrugStockLoading((prev) => ({ ...prev, [drugId]: false }));
    }
  };

  // Prefetch remaining stock for a drug by name (used in treatment table rows)
  const prefetchDrugStockByName = async (name?: string) => {
    const query = (name || '').trim();
    if (!query) return;
    const key = query.toLowerCase();
    if (drugStockById[key] !== undefined || drugStockLoading[key]) return;
    setDrugStockLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const res: any = await apiClient.get('/drugs', { search: query, limit: 1, isActive: true });
      const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      const first = list?.[0];
      if (!first?.id) {
        // No match found; assume default stock
        setDrugStockById((prev) => ({ ...prev, [key]: 20 }));
      } else {
        await prefetchDrugStockById(first.id);
        const val = (typeof drugStockById[first.id] === 'number') ? drugStockById[first.id] : 20;
        setDrugStockById((prev) => ({ ...prev, [key]: val }));
      }
    } catch {
      setDrugStockById((prev) => ({ ...prev, [key]: 20 }));
    } finally {
      setDrugStockLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Get relevance badge for search results
  const getRelevanceBadge = (drug: any, query: string, index: number) => {
    if (index === 0) return <Badge variant="default" className="text-xs ml-2 bg-green-100 text-green-800">Best Match</Badge>;
    if (index < 3) return <Badge variant="secondary" className="text-xs ml-2 bg-blue-100 text-blue-800">High Match</Badge>;
    return null;
  };

  // Local recent suggestions (last 50) utilities
  const RECENT_KEY_PREFIX = 'rx_recent:';
  const normalize = (s: string) => (s || '').trim();
  const readRecent = (key: string): string[] => {
    try {
      const raw = localStorage.getItem(RECENT_KEY_PREFIX + key);
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      return Array.isArray(arr) ? arr.filter(Boolean) : [];
    } catch {
      return [];
    }
  };
  const writeRecent = (key: string, list: string[]) => {
    try {
      localStorage.setItem(RECENT_KEY_PREFIX + key, JSON.stringify(list.slice(0, 50)));
    } catch {}
  };
  const pushRecent = (key: string, value?: string) => {
    const v = normalize(value || '');
    if (!v) return;
    const list = readRecent(key);
    const without = list.filter((x) => x.toLowerCase() !== v.toLowerCase());
    writeRecent(key, [v, ...without].slice(0, 50));
  };
  const rankByQuery = (candidates: string[], q: string): string[] => {
    const query = (q || '').toLowerCase().trim();
    if (!query) return candidates;
    return [...candidates]
      .map((c) => {
        const lc = c.toLowerCase();
        let score = 0;
        if (lc.startsWith(query)) score += 100;
        const idx = lc.indexOf(query);
        if (idx >= 0) score += 50 - idx;
        // Shorter strings a bit higher if they match
        score += Math.max(0, 20 - Math.abs(c.length - query.length));
        return { c, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  };
  const getLocalSuggestions = (key: string, q: string, limit = 8): string[] => {
    const list = readRecent(key);
    const ranked = rankByQuery(list, q);
    // de-dup case-insensitive while preserving original casing
    const seen = new Set<string>();
    const uniq: string[] = [];
    for (const s of ranked) {
      const k = s.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        uniq.push(s);
      }
      if (uniq.length >= limit) break;
    }
    return uniq;
  };

  const addItemFromDrug = (drug: any) => {
    const base: PrescriptionItemForm = {
      drugName: drug.name,
      genericName: drug.genericName,
      dosage: 1,
      dosageUnit: 'TABLET',
      frequency: 'ONCE_DAILY',
      duration: 5,
      durationUnit: 'DAYS',
      instructions: '',
      route: 'Oral',
      timing: 'After meals',
      quantity: 5,
      isGeneric: true,
    };
    setItems(prev => [...prev, base]);
    setDrugResults([]);
    setDrugQuery('');
    pushRecent('drugNames', drug.name);
    if (drug.genericName) pushRecent('drugGeneric', drug.genericName);
  };

  const updateItem = (index: number, patch: Partial<PrescriptionItemForm>) => {
    setItems(prev => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const inferFrequencyFromDosePattern = (pattern: string): Frequency | null => {
    const raw = (pattern || '').trim().toLowerCase();
    if (!raw) return null;

    // Common textual shorthands
    const map: Record<string, Frequency> = {
      od: 'ONCE_DAILY',
      qd: 'ONCE_DAILY',
      once: 'ONCE_DAILY',
      hs: 'ONCE_DAILY',
      qhs: 'ONCE_DAILY',
      bid: 'TWICE_DAILY',
      bd: 'TWICE_DAILY',
      twice: 'TWICE_DAILY',
      tid: 'THREE_TIMES_DAILY',
      thrice: 'THREE_TIMES_DAILY',
      qid: 'FOUR_TIMES_DAILY',
    };
    if (map[raw]) return map[raw];

    // Try to infer from numeric pattern like 1-0-1, 0-1-0, 1-1-1, 2-0-2
    const tokens = raw.split(/[^0-9]+/).filter(Boolean);
    if (tokens.length > 0) {
      const doses = tokens.map(t => Number(t)).filter(n => !Number.isNaN(n) && Number.isFinite(n));
      if (doses.length > 0) {
        const total = doses.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
        if (total <= 0) return null;
        if (total === 1) return 'ONCE_DAILY';
        if (total === 2) return 'TWICE_DAILY';
        if (total === 3) return 'THREE_TIMES_DAILY';
        return 'FOUR_TIMES_DAILY';
      }
    }

    return null;
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const addCustomSection = () => {
    const id = `${Date.now()}`;
    setCustomSections(prev => [...prev, { id, title: 'Additional Advice', content: '' }]);
  };

  const updateCustomSection = (id: string, patch: Partial<{ title: string; content: string }>) => {
    setCustomSections(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const removeCustomSection = (id: string) => {
    setCustomSections(prev => prev.filter(s => s.id !== id));
  };

  const totalQuantity = useMemo(() => {
    return validItems.reduce((sum, it) => sum + (Number(it.quantity || 0) || 0), 0);
  }, [validItems]);

  const create = useCallback(async () => {
    if (!canCreate) return;
    try {
      // Prefer IDs from loaded visit if available
      const visitPatientId: string | undefined = (visitData && typeof visitData === 'object')
        ? ((visitData as any).patientId || (visitData as any)?.patient?.id)
        : undefined;
      const visitDoctorId: string | undefined = (visitData && typeof visitData === 'object')
        ? ((visitData as any).doctorId || (visitData as any)?.doctor?.id)
        : undefined;
      const effectivePatientId = (typeof visitPatientId === 'string' && visitPatientId.trim()) ? visitPatientId : patientId;
      const effectiveDoctorId = (typeof visitDoctorId === 'string' && visitDoctorId.trim()) ? visitDoctorId : doctorId;

      // Validate essential IDs
      if (typeof effectivePatientId !== 'string' || !effectivePatientId.trim() || typeof effectiveDoctorId !== 'string' || !effectiveDoctorId.trim()) {
        console.warn('[PrescriptionBuilder] Invalid IDs on create', { patientId: effectivePatientId, doctorId: effectiveDoctorId, visitId });
        toast({
          variant: 'destructive',
          title: 'Invalid IDs',
          description: 'Patient or Doctor ID is missing. Please correct and try again.',
        });
        return;
      }

      // Ensure we have a visit when not in standalone mode
      let ensuredVisitId: string | null = visitId;
      if (!standalone && !ensuredVisitId && ensureVisitId) {
        try {
          ensuredVisitId = await ensureVisitId();
        } catch (e) {
          // If visit creation fails, continue as best-effort without blocking prescription if standalone allowed
          console.warn('[PrescriptionBuilder] Failed to ensure visitId', e);
        }
      }

      // Persist all builder fields to Visit for future autocomplete (DB-backed)
      if (ensuredVisitId) {
        const visitUpdatePayload: Record<string, unknown> = {
          complaints: chiefComplaints || undefined,
          history: {
            pastHistory: pastHistory || undefined,
            medicationHistory: medicationHistory || undefined,
            menstrualHistory: menstrualHistory || undefined,
            triggers: exTriggers || undefined,
            priorTreatments: exPriorTx || undefined,
            familyHistory: {
              dm: familyHistoryDM || undefined,
              htn: familyHistoryHTN || undefined,
              thyroid: familyHistoryThyroid || undefined,
              others: familyHistoryOthers || undefined,
            },
          },
          diagnosis: diagnosis || undefined,
          treatmentPlan: {
            investigations: (investigations && investigations.length) ? investigations : undefined,
            procedurePlanned: procedurePlanned || undefined,
            followUp: followUpInstructions || undefined,
          },
          dermatology: {
            skinConcerns: Array.from(skinConcerns),
          },
          examination: {
            ...(exObjective ? { generalAppearance: exObjective } : {}),
            dermatology: {
              skinType: exSkinType || undefined,
              morphology: Array.from(exMorphology),
              distribution: Array.from(exDistribution),
              acneSeverity: exAcneSeverity || undefined,
              itchScore: exItchScore ? Number(exItchScore) : undefined,
              skinConcerns: Array.from(skinConcerns),
            }
          },
        };
        try {
          await apiClient.updateVisit(ensuredVisitId, visitUpdatePayload);
        } catch (e) {
          // Non-blocking: continue to create prescription even if visit update fails
          console.warn('[PrescriptionBuilder] Failed to persist visit fields', e);
        }
      }

      const payload = {
        patientId: effectivePatientId,
        visitId: standalone ? undefined : (ensuredVisitId || visitId || undefined),
        doctorId: effectiveDoctorId,
        items: validItems.map(it => ({
          drugName: it.drugName,
          genericName: it.genericName || undefined,
          brandName: it.brandName || undefined,
          dosage: Number(it.dosage),
          dosageUnit: it.dosageUnit,
          frequency: it.frequency,
          duration: Number(it.duration),
          durationUnit: it.durationUnit,
          instructions: it.instructions || undefined,
          route: it.route || undefined,
          timing: it.timing || undefined,
          quantity: it.quantity ? Number(it.quantity) : undefined,
          isGeneric: it.isGeneric ?? true,
          applicationSite: it.applicationSite || undefined,
          applicationAmount: it.applicationAmount || undefined,
          dayPart: it.dayPart || undefined,
          leaveOn: typeof it.leaveOn === 'boolean' ? it.leaveOn : undefined,
          washOffAfterMinutes: it.washOffAfterMinutes !== '' ? Number(it.washOffAfterMinutes) : undefined,
          taperSchedule: it.taperSchedule || undefined,
          weightMgPerKgPerDay: it.weightMgPerKgPerDay !== '' ? Number(it.weightMgPerKgPerDay) : undefined,
          calculatedDailyDoseMg: it.calculatedDailyDoseMg !== '' ? Number(it.calculatedDailyDoseMg) : undefined,
          pregnancyWarning: typeof it.pregnancyWarning === 'boolean' ? it.pregnancyWarning : undefined,
          photosensitivityWarning: typeof it.photosensitivityWarning === 'boolean' ? it.photosensitivityWarning : undefined,
          foodInstructions: it.foodInstructions || undefined,
          pulseRegimen: it.pulseRegimen || undefined,
        })),
        diagnosis: diagnosis || undefined,
        language,
        validUntil: reviewDate || undefined,
        followUpInstructions: followUpInstructions || undefined,
        procedureMetrics: Object.keys(procedureMetrics).length ? procedureMetrics : undefined,
        metadata: {
          chiefComplaints: chiefComplaints || undefined,
          histories: {
            pastHistory: pastHistory || undefined,
            medicationHistory: medicationHistory || undefined,
            menstrualHistory: menstrualHistory || undefined,
            triggers: exTriggers || undefined,
            priorTreatments: exPriorTx || undefined,
          },
          familyHistory: {
            dm: familyHistoryDM || undefined,
            htn: familyHistoryHTN || undefined,
            thyroid: familyHistoryThyroid || undefined,
            others: familyHistoryOthers || undefined,
          },
          investigations: investigations && investigations.length ? investigations : undefined,
          procedurePlanned: procedurePlanned || undefined,
        },
      };
      const res: any = standalone
        ? await apiClient.createQuickPrescription({ ...payload, reason: standaloneReason })
        : await apiClient.createPrescription(payload);
      createdPrescriptionIdRef.current = res?.id || null;
      onCreated?.(res?.id);

      if (!standalone) {
        setConfirmPharmacy({
          open: true,
          prescriptionId: res?.id || '',
          summary: {
            medicationsCount: validItems.length,
          },
        });
      }

      toast({
        variant: 'success',
        title: 'Prescription created',
        description: `${validItems.length} medications recorded for the patient.`,
      });

      // Reset form
      setItems([]);
      setDiagnosis('');
      setFollowUpInstructions('');
    } catch (e: any) {
      const msg = getErrorMessage(e) || 'Failed to create prescription';
      toast({
        variant: 'destructive',
        title: 'Unable to create prescription',
        description: msg,
      });
    }
  }, [canCreate, patientId, visitId, doctorId, items, diagnosis, language, reviewDate, followUpInstructions, procedureMetrics, chiefComplaints, pastHistory, medicationHistory, menstrualHistory, familyHistoryDM, familyHistoryHTN, familyHistoryThyroid, familyHistoryOthers, investigations, procedurePlanned, onCreated]);

  const applyTemplateToBuilder = (tpl: any) => {
    try {
      const tItems = Array.isArray(tpl.items) ? tpl.items : JSON.parse(tpl.items || '[]');
      const mapped: PrescriptionItemForm[] = tItems.map((x: any) => ({
        drugName: x.drugName,
        genericName: x.genericName,
        brandName: x.brandName,
        dosage: x.dosage,
        dosageUnit: x.dosageUnit || 'TABLET',
        frequency: x.frequency || 'ONCE_DAILY',
        duration: x.duration,
        durationUnit: x.durationUnit || 'DAYS',
        instructions: x.instructions,
        route: x.route,
        timing: x.timing,
        quantity: x.quantity,
        notes: x.notes,
        isGeneric: x.isGeneric,
        applicationSite: x.applicationSite,
        applicationAmount: x.applicationAmount,
        dayPart: x.dayPart,
        leaveOn: x.leaveOn,
        washOffAfterMinutes: x.washOffAfterMinutes,
        taperSchedule: x.taperSchedule,
        weightMgPerKgPerDay: x.weightMgPerKgPerDay,
        calculatedDailyDoseMg: x.calculatedDailyDoseMg,
        pregnancyWarning: x.pregnancyWarning,
        photosensitivityWarning: x.photosensitivityWarning,
        foodInstructions: x.foodInstructions,
        pulseRegimen: x.pulseRegimen,
      }));
      setItems(prev => [...prev, ...mapped]);
      pushHistory();
      const md = typeof tpl.metadata === 'object' ? tpl.metadata : (tpl.metadata ? JSON.parse(tpl.metadata) : null);
      if (md) {
        if (md.diagnosis) setDiagnosis(md.diagnosis);
        if (md.chiefComplaints) setChiefComplaints(md.chiefComplaints);
        if (md.histories) {
          if (md.histories.pastHistory) setPastHistory(md.histories.pastHistory);
          if (md.histories.medicationHistory) setMedicationHistory(md.histories.medicationHistory);
          if (md.histories.menstrualHistory) setMenstrualHistory(md.histories.menstrualHistory);
          // triggers and prior treatments are no longer applied from templates
        }
        if (md.examination) {
          if (md.examination.generalAppearance) setExObjective(md.examination.generalAppearance);
          if (md.examination.dermatology) {
            const der = md.examination.dermatology;
            if (der.skinType) setExSkinType(der.skinType);
            if (Array.isArray(der.morphology)) setExMorphology(new Set<string>(der.morphology));
            if (Array.isArray(der.distribution)) setExDistribution(new Set<string>(der.distribution));
            if (der.acneSeverity) setExAcneSeverity(der.acneSeverity);
            if (der.itchScore !== undefined && der.itchScore !== null) setExItchScore(String(der.itchScore));
            if (Array.isArray(der.skinConcerns)) setSkinConcerns(new Set<string>(der.skinConcerns));
          }
        }
        if (md.familyHistory) {
          if (typeof md.familyHistory.dm === 'boolean') setFamilyHistoryDM(md.familyHistory.dm);
          if (typeof md.familyHistory.htn === 'boolean') setFamilyHistoryHTN(md.familyHistory.htn);
          if (typeof md.familyHistory.thyroid === 'boolean') setFamilyHistoryThyroid(md.familyHistory.thyroid);
          if (md.familyHistory.others) setFamilyHistoryOthers(md.familyHistory.others);
        }
        // topicals removed
        // postProcedureCare removed
        if (md.investigations) {
          if (Array.isArray(md.investigations)) setInvestigations(md.investigations as string[]);
          else if (typeof md.investigations === 'string') setInvestigations((md.investigations as string).split(',').map(s => s.trim()).filter(Boolean));
        }
        if (md.procedurePlanned) setProcedurePlanned(md.procedurePlanned);
        // procedureParams removed
        // doctor's personal notes removed from builder
      }
      try { void apiClient.recordTemplateUsage?.(tpl?.id, { variant: undefined }); } catch {}
    } catch {}
  };

  const [templatePromptOpen, setTemplatePromptOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [fieldTemplatePromptOpen, setFieldTemplatePromptOpen] = useState(false);
  const [fieldTemplateName, setFieldTemplateName] = useState('');
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [newTplName, setNewTplName] = useState('');
  const [newTplChiefComplaints, setNewTplChiefComplaints] = useState('');
  const [newTplDiagnosis, setNewTplDiagnosis] = useState('');
  const [newTplExObjective, setNewTplExObjective] = useState('');
  const [newTplSkinType, setNewTplSkinType] = useState('');
  const [newTplMorphology, setNewTplMorphology] = useState<Set<string>>(new Set());
  const [newTplDistribution, setNewTplDistribution] = useState<Set<string>>(new Set());
  // Removed triggers and prior treatments from templates (now part of Patient History)
  const [newTplTriggers] = useState('');
  const [newTplPriorTx] = useState('');
  const [newTplItchScore, setNewTplItchScore] = useState<string>('');
  const [newTplSkinConcerns, setNewTplSkinConcerns] = useState<Set<string>>(new Set());
  const [newTplItems, setNewTplItems] = useState<Array<{
    drugName: string;
    dosage?: number | '';
    dosageUnit?: string;
    frequency?: string;
    duration?: number | '';
    durationUnit?: string;
    route?: string;
    instructions?: string;
  }>>([{ drugName: '', dosage: '', dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: '', durationUnit: 'DAYS', route: '', instructions: '' }]);
  const [newTplDrugQuery, setNewTplDrugQuery] = useState('');
  const [newTplDrugResults, setNewTplDrugResults] = useState<any[]>([]);
  const [newTplLoadingDrugs, setNewTplLoadingDrugs] = useState(false);

  const addNewTplItem = () => {
    setNewTplItems((prev) => [...prev, { drugName: '', dosage: '', dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: '', durationUnit: 'DAYS', route: '', instructions: '' }]);
  };
  const removeNewTplItem = (idx: number) => {
    setNewTplItems((prev) => prev.filter((_, i) => i !== idx));
  };
  const setNewTplItemField = (idx: number, field: string, value: any) => {
    setNewTplItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const updateNewTplItem = (index: number, patch: Partial<PrescriptionItemForm>) => {
    setNewTplItems((prev) => prev.map((it: any, i) => (i === index ? { ...it, ...patch } : it)));
  };
  const removeNewTplRxItem = (index: number) => {
    setNewTplItems((prev) => prev.filter((_, i) => i !== index));
  };
  const addItemFromDrugToNewTpl = (drug: any) => {
    const base: PrescriptionItemForm = {
      drugName: drug.name,
      genericName: drug.genericName,
      brandName: drug.brandName,
      dosage: '',
      dosageUnit: 'TABLET',
      frequency: 'ONCE_DAILY',
      dosePattern: '',
      duration: '',
      durationUnit: 'DAYS',
      instructions: '',
      timing: '',
      quantity: '',
      route: drug.route || '',
      notes: '',
      isGeneric: true,
    } as any;
    setNewTplItems((prev: any[]) => [...prev, base as any]);
    // Close the dialog search only upon selection
    setNewTplDrugResults([]);
    setNewTplDrugQuery('');
  };

  // Debounced search for New Template dialog (separate from main builder)
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = (newTplDrugQuery || '').trim();
      if (q.length < 2) {
        setNewTplDrugResults([]);
        return;
      }
      try {
        setNewTplLoadingDrugs(true);
        const res: any = await apiClient.get('/prescriptions/drugs/autocomplete', { q, limit: 30 });
        const primary = Array.isArray(res)
          ? res
          : (Array.isArray(res?.data)
            ? res.data
            : (Array.isArray(res?.items)
              ? res.items
              : (Array.isArray(res?.results) ? res.results : [])));
        let list: any[] = primary;
        if (!Array.isArray(list) || list.length === 0) {
          try {
            const res2: any = await apiClient.get('/drugs/autocomplete', { q, limit: 30, mode: 'all' });
            list = Array.isArray(res2) ? res2 : (Array.isArray(res2?.data) ? res2.data : []);
          } catch {}
        }
        const sorted = sortDrugsByRelevance(Array.isArray(list) ? list : [], q);
        setNewTplDrugResults(sorted.slice(0, 10));
      } catch (e) {
        try {
          const res2: any = await apiClient.get('/drugs/autocomplete', { q, limit: 30, mode: 'all' });
          const list2 = Array.isArray(res2) ? res2 : (Array.isArray(res2?.data) ? res2.data : []);
          const sorted2 = sortDrugsByRelevance(Array.isArray(list2) ? list2 : [], q);
          setNewTplDrugResults(sorted2.slice(0, 10));
        } catch {
          setNewTplDrugResults([]);
        }
      } finally {
        setNewTplLoadingDrugs(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [newTplDrugQuery]);

  const allTemplates = useMemo(() => {
    const server = (templates || []).map((t: any) => ({
      id: String(t.id ?? t._id ?? t.name),
      name: String(t.name || 'Untitled'),
      source: 'server' as const,
      tpl: t,
    }));
    const defaults = (defaultDermTemplates || []).map((t: any) => ({
      id: `default-${t.id}`,
      name: t.name,
      source: 'default' as const,
      tpl: t,
    }));
    // Prepend a "No template" option
    const none = [{ id: 'none', name: 'No template', source: 'none' as const, tpl: { items: [], metadata: {} } }];
    return [...none, ...server, ...defaults];
  }, [templates, defaultDermTemplates]);

  const persistLocalFieldTemplate = useCallback(async (name: string) => {
    // Save as server-side template with no items
    try {
      setSavingFieldsTemplate(true);
      const payload: any = {
        name,
        description: '',
        items: [],
        category: 'Dermatology',
        specialty: 'Dermatology',
        isPublic: true,
        metadata: {
          chiefComplaints,
          diagnosis,
          examination: {
            generalAppearance: exObjective || undefined,
            dermatology: {
              skinType: exSkinType || undefined,
              morphology: Array.from(exMorphology),
              distribution: Array.from(exDistribution),
              acneSeverity: exAcneSeverity || undefined,
              itchScore: exItchScore ? Number(exItchScore) : undefined,
              triggers: exTriggers || undefined,
              priorTreatments: exPriorTx || undefined,
              skinConcerns: Array.from(skinConcerns),
            }
          },
        },
      };
      const doRequest = async () => {
        await apiClient.createPrescriptionTemplate(payload);
        await loadTemplates();
        toast({ variant: 'success', title: 'Fields template saved', description: 'Template stored on server.' });
      };
      await doRequest();
    } catch (e: any) {
      showTemplateCreateError(e, async () => {
        try {
          await apiClient.createPrescriptionTemplate({
            name,
            description: '',
            items: [],
            category: 'Dermatology',
            specialty: 'Dermatology',
            isPublic: true,
            metadata: {
              chiefComplaints,
              diagnosis,
              examination: {
                generalAppearance: exObjective || undefined,
                dermatology: {
                  skinType: exSkinType || undefined,
                  morphology: Array.from(exMorphology),
                  distribution: Array.from(exDistribution),
                  acneSeverity: exAcneSeverity || undefined,
                  itchScore: exItchScore ? Number(exItchScore) : undefined,
                  triggers: exTriggers || undefined,
                  priorTreatments: exPriorTx || undefined,
                  skinConcerns: Array.from(skinConcerns),
                }
              },
            },
          });
          await loadTemplates();
          toast({ variant: 'success', title: 'Fields template saved', description: 'Template stored on server.' });
        } catch (err) {
          showTemplateCreateError(err);
        }
      });
      throw e;
    } finally {
      setSavingFieldsTemplate(false);
    }
  }, [chiefComplaints, diagnosis, exObjective, exSkinType, exMorphology, exDistribution, exAcneSeverity, exItchScore, exTriggers, exPriorTx, skinConcerns, loadTemplates, apiClient, toast, showTemplateCreateError]);

  const persistTemplate = useCallback(async (name: string) => {
    try {
      setCreatingTemplate(true);
      const payload = {
        name,
        description: '',
        items: validItems.map(it => ({
          drugName: it.drugName,
          genericName: it.genericName,
          brandName: it.brandName,
          dosage: Number(it.dosage),
          dosageUnit: it.dosageUnit,
          frequency: it.frequency,
          duration: Number(it.duration),
          durationUnit: it.durationUnit,
          instructions: it.instructions,
          route: it.route,
          timing: it.timing,
          quantity: it.quantity ? Number(it.quantity) : undefined,
          notes: it.notes,
          isGeneric: it.isGeneric ?? true,
        })),
        category: 'Dermatology',
        specialty: 'Dermatology',
        isPublic: true,
        metadata: {
          chiefComplaints,
          diagnosis,
          examination: {
            generalAppearance: exObjective || undefined,
            dermatology: {
              skinType: exSkinType || undefined,
              morphology: Array.from(exMorphology),
              distribution: Array.from(exDistribution),
              acneSeverity: exAcneSeverity || undefined,
              itchScore: exItchScore ? Number(exItchScore) : undefined,
              skinConcerns: Array.from(skinConcerns),
            }
          },
        },
      } as any;
      const doRequest = async () => {
        await apiClient.createPrescriptionTemplate(payload);
        await loadTemplates();
        toast({
          variant: 'success',
          title: 'Template saved',
          description: 'Prescription template stored for future visits.',
        });
      };
      await doRequest();
    } catch (e: any) {
      showTemplateCreateError(e, async () => {
        try {
          await apiClient.createPrescriptionTemplate({
            name,
            description: '',
            items: validItems.map(it => ({
              drugName: it.drugName,
              genericName: it.genericName,
              brandName: it.brandName,
              dosage: Number(it.dosage),
              dosageUnit: it.dosageUnit,
              frequency: it.frequency,
              duration: Number(it.duration),
              durationUnit: it.durationUnit,
              instructions: it.instructions,
              route: it.route,
              timing: it.timing,
              quantity: it.quantity ? Number(it.quantity) : undefined,
              notes: it.notes,
              isGeneric: it.isGeneric ?? true,
            })),
            category: 'Dermatology',
            specialty: 'Dermatology',
            isPublic: true,
            metadata: {
              chiefComplaints,
              diagnosis,
              examination: {
                generalAppearance: exObjective || undefined,
                dermatology: {
                  skinType: exSkinType || undefined,
                  morphology: Array.from(exMorphology),
                  distribution: Array.from(exDistribution),
                  acneSeverity: exAcneSeverity || undefined,
                  itchScore: exItchScore ? Number(exItchScore) : undefined,
                  skinConcerns: Array.from(skinConcerns),
                }
              },
            },
          } as any);
          await loadTemplates();
          toast({
            variant: 'success',
            title: 'Template saved',
            description: 'Prescription template stored for future visits.',
          });
        } catch (err) {
          showTemplateCreateError(err);
        }
      });
      throw e;
    } finally {
      setCreatingTemplate(false);
    }
  }, [
    apiClient,
    items,
    chiefComplaints,
    diagnosis,
    exObjective,
    exSkinType,
    exMorphology,
    exDistribution,
    exAcneSeverity,
    exItchScore,
    exTriggers,
    exPriorTx,
    skinConcerns,
    loadTemplates,
    toast,
    showTemplateCreateError,
  ]);

  useEffect(() => {
    if (!orderOpen) return;
    // Initialize mapping state from current items when dialog opens
    const next = validItems.map((it) => ({ q: it.drugName || '', loading: false, results: [], selection: undefined, qty: Number(it.quantity || 1) || 1 }));
    setOneMgMap(next);
    // Auto-search initial queries
    next.forEach(async (_row, idx) => {
      const q = next[idx].q?.trim();
      if (q && q.length >= 2) {
        try {
          setOneMgMap((prev) => prev.map((r, i) => (i === idx ? { ...r, loading: true } : r)));
          const res = await apiClient.oneMgSearch(q, 8);
          const arr = Array.isArray(res) ? (res as any[]) : [];
          setOneMgMap((prev) => prev.map((r, i) => (i === idx ? { ...r, results: arr, loading: false } : r)));
        } catch {
          setOneMgMap((prev) => prev.map((r, i) => (i === idx ? { ...r, results: [], loading: false } : r)));
        }
      }
    });
  }, [orderOpen]);

  const handleOneMgSearch = async (idx: number, q: string) => {
    setOneMgMap((prev) => prev.map((r, i) => (i === idx ? { ...r, q } : r)));
    const term = q.trim();
    if (!term || term.length < 2) {
      setOneMgMap((prev) => prev.map((r, i) => (i === idx ? { ...r, results: [] } : r)));
      return;
    }
    try {
      setOneMgMap((prev) => prev.map((r, i) => (i === idx ? { ...r, loading: true } : r)));
      const res = await apiClient.oneMgSearch(term, 8);
      const arr = Array.isArray(res) ? (res as any[]) : [];
      setOneMgMap((prev) => prev.map((r, i) => (i === idx ? { ...r, results: arr, loading: false } : r)));
    } catch {
      setOneMgMap((prev) => prev.map((r, i) => (i === idx ? { ...r, results: [], loading: false } : r)));
    }
  };

  const selectOneMgProduct = (idx: number, p: any) => {
    const selection: OneMgSelection = { sku: String(p.sku || p.id || p.code || ''), name: String(p.name || p.title || ''), price: Number(p.price || p.mrp || p.salePrice || 0) || undefined };
    setOneMgMap((prev) => prev.map((r, i) => (i === idx ? { ...r, selection, results: [] } : r)));
  };

  const updateOneMgQty = (idx: number, qty: number) => {
    const safe = qty > 0 ? qty : 1;
    setOneMgMap((prev) => prev.map((r, i) => (i === idx ? { ...r, qty: safe } : r)));
  };

  const checkOneMgInventory = async () => {
    try {
      setOneMgChecking(true);
      const itemsPayload = oneMgMap
        .map((r) => (r.selection ? { sku: r.selection.sku, qty: r.qty } : null))
        .filter(Boolean);
      const res = await apiClient.oneMgCheckInventory({ items: itemsPayload });
      setOneMgTotals(res || {});
    } catch {
      setOneMgTotals(null);
    } finally {
      setOneMgChecking(false);
    }
  };

  const placeOneMgOrder = async () => {
    try {
      const itemsPayload = oneMgMap
        .map((r, idx) => (r.selection ? { rxIndex: idx, sku: r.selection.sku, name: r.selection.name, qty: r.qty, price: r.selection.price } : null))
        .filter(Boolean);
      if (itemsPayload.length === 0) {
        toast({
          variant: 'warning',
          title: 'No products selected',
          description: 'Select at least one product to place an order.',
        });
        return;
      }
      const payload = {
        patientId,
        visitId,
        prescriptionItems: itemsPayload,
        shippingAddress: {},
        paymentMode: 'COD',
      } as any;
      const res: any = await apiClient.oneMgCreateOrder(payload);
      const orderId = res && (res as any).orderId ? `#${(res as any).orderId}` : 'successfully';
      toast({
        variant: 'success',
        title: '1MG order created',
        description: `Prescription items sent to pharmacy ${orderId}.`,
      });
      setOrderOpen(false);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to create 1MG order',
        description: getErrorMessage(e) || 'Please retry shortly.',
      });
    }
  };

  const [assets, setAssets] = useState<any[]>([]);
  const [printerProfiles, setPrinterProfiles] = useState<any[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const undoStackRef = useRef<any[]>([]);
  const redoStackRef = useRef<any[]>([]);
  // Computed effective margins (depend on printer profile and overrides)
  const effectiveTopMarginPx = useMemo(() => {
    const prof = activeProfileId ? (printerProfiles.find((p: any) => p.id === activeProfileId) || {}) : {};
    return (overrideTopMarginPx ?? (prof.topMarginPx ?? printTopMarginPx ?? 150)) as number;
  }, [activeProfileId, printerProfiles, overrideTopMarginPx, printTopMarginPx]);
  const effectiveBottomMarginPx = useMemo(() => {
    const prof = activeProfileId ? (printerProfiles.find((p: any) => p.id === activeProfileId) || {}) : {};
    return (overrideBottomMarginPx ?? (prof.bottomMarginPx ?? printBottomMarginPx ?? 45)) as number;
  }, [activeProfileId, printerProfiles, overrideBottomMarginPx, printBottomMarginPx]);
  const effectiveTopMarginMm = useMemo(() => Math.max(0, Math.round((effectiveTopMarginPx / 3.78) * 10) / 10), [effectiveTopMarginPx]);
  const effectiveBottomMarginMm = useMemo(() => Math.max(0, Math.round((effectiveBottomMarginPx / 3.78) * 10) / 10), [effectiveBottomMarginPx]);

  useEffect(() => {
    (async () => {
      try {
        const [as, pp] = await Promise.all([
          apiClient.getClinicAssets(),
          apiClient.getPrinterProfiles(),
        ]);
        setAssets(Array.isArray(as) ? as : []);
        setPrinterProfiles(Array.isArray(pp) ? pp : []);
        const def = (Array.isArray(pp) ? pp : []).find((p: any) => p.isDefault);
        if (def?.id) setActiveProfileId(def.id);
      } catch {}
    })();
  }, []);

  // Fetch aggregated print/share totals when preview is opened
  useEffect(() => {
    const prescId = (visitData as any)?.prescriptionId || createdPrescriptionIdRef?.current || undefined;
    if (!previewOpen || !prescId) return;
    (async () => {
      try {
        const res: any = await apiClient.getPrescriptionPrintEvents(prescId);
        if (res?.totals) setPrintTotals(res.totals as Record<string, number>);
      } catch {}
    })();
  }, [previewOpen, visitData]);

  // Calculate total pages for paginated preview
  useEffect(() => {
    if (!previewOpen || previewViewMode !== 'paginated') return;
    
    const calculatePages = () => {
      const printRoot = printRef.current;
      if (!printRoot) return;

      // Get page dimensions in pixels (convert mm to px at 96 DPI)
      const mmToPx = 3.78;
      const pageHeightMm = paperPreset === 'LETTER' ? 279 : 297;
      const pageHeightPx = pageHeightMm * mmToPx;
      
      // Account for margins
      const topMarginPx = overrideTopMarginPx ?? (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.topMarginPx ?? printTopMarginPx ?? 150) : (printTopMarginPx ?? 150));
      const bottomMarginPx = overrideBottomMarginPx ?? (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.bottomMarginPx ?? printBottomMarginPx ?? 45) : (printBottomMarginPx ?? 45));
      
      const availableHeightPerPage = pageHeightPx - topMarginPx - bottomMarginPx;
      
      // Get content height
      const contentEl = printRoot.querySelector('#prescription-print-content');
      if (!contentEl) return;
      
      const contentHeight = (contentEl as HTMLElement).scrollHeight;
      
      // Calculate number of pages needed
      const calculatedPages = Math.max(1, Math.ceil(contentHeight / availableHeightPerPage));
      setTotalPreviewPages(calculatedPages);
      
      // Reset to page 1 if current page exceeds total
      if (currentPreviewPage > calculatedPages) {
        setCurrentPreviewPage(1);
      }
    };

    // Delay calculation to allow DOM to settle
    const timer = setTimeout(calculatePages, 300);
    return () => clearTimeout(timer);
  }, [previewOpen, previewViewMode, items, diagnosis, chiefComplaints, investigations, customSections, 
      paperPreset, overrideTopMarginPx, overrideBottomMarginPx, activeProfileId, currentPreviewPage, 
      printTopMarginPx, printBottomMarginPx, printerProfiles]);

  const openInteractions = useCallback(async () => {
    try {
      const res: any = await apiClient.previewDrugInteractions(items as any);
      setInteractions(Array.isArray(res?.interactions) ? res.interactions : []);
      setInteractionsOpen(true);
    } catch {
      setInteractions([]);
      setInteractionsOpen(true);
    }
  }, [items]);

  useEffect(() => {
    if (autoPreview && !previewOpen) setPreviewOpen(true);
  }, [autoPreview, previewOpen]);

  useEffect(() => {
    if (!(previewOpen || autoPreview)) return;
    let t: any;
    const run = () => {
      if (language !== 'EN') void translateForPreview();
      setPreviewJustUpdated(true);
      setTimeout(() => setPreviewJustUpdated(false), 600);
    };
    t = setTimeout(run, 250);
    return () => { if (t) clearTimeout(t); };
  }, [previewOpen, autoPreview, language, rxPrintFormat, items, diagnosis, followUpInstructions, contentOffsetXPx, contentOffsetYPx, printTopMarginPx, printLeftMarginPx, printRightMarginPx, printBottomMarginPx, activeProfileId, overrideTopMarginPx, overrideBottomMarginPx]);

  // Paged.js processing
  useEffect(() => {
    if (!previewOpen || paginationEngine !== 'pagedjs' || !pagedJsContainerRef.current) return;
    
    const processWithPagedJs = async () => {
      try {
        setPagedJsProcessing(true);
        const container = pagedJsContainerRef.current;
        if (!container) return;
        
        // Clear previous content
        container.innerHTML = '';
        
        // Get the prescription content
        const content = printRef.current?.innerHTML || '';
        
        // Create a temporary div with the content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        tempDiv.style.fontFamily = 'Fira Sans, sans-serif';
        tempDiv.style.fontSize = '14px';
        
        // Initialize Paged.js
        const paged = new Previewer();
        
        // Process the content
        await paged.preview(tempDiv, [
          `
          @page {
            size: ${paperPreset === 'LETTER' ? '8.5in 11in' : 'A4'};
            margin-top: ${effectiveTopMarginMm}mm;
            margin-bottom: ${effectiveBottomMarginMm}mm;
            margin-left: ${Math.max(0, (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.leftMarginPx ?? printLeftMarginPx ?? 45) : (printLeftMarginPx ?? 45)))/3.78}mm;
            margin-right: ${Math.max(0, (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.rightMarginPx ?? printRightMarginPx ?? 45) : (printRightMarginPx ?? 45)))/3.78}mm;
          }
          
          body {
            font-family: 'Fira Sans', sans-serif;
            font-size: 14px;
            color: #111827;
          }
          
          .medication-item, .pb-avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          
          .pb-before-page {
            break-before: page;
            page-break-before: always;
          }
          
          table {
            break-inside: auto;
          }
          
          tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          `
        ], container);
        
        // Update total pages count
        const pages = container.querySelectorAll('.pagedjs_page');
        setTotalPreviewPages(pages.length);
        
      } catch (error) {
        console.error('Paged.js error:', error);
        toast({
          title: 'Pagination Error',
          description: 'Failed to process document with Paged.js. Falling back to custom pagination.',
          variant: 'destructive',
        });
        setPaginationEngine('custom');
      } finally {
        setPagedJsProcessing(false);
      }
    };
    
    const timer = setTimeout(processWithPagedJs, 300);
    return () => clearTimeout(timer);
  }, [previewOpen, paginationEngine, items, diagnosis, chiefComplaints, investigations, customSections, 
      paperPreset, effectiveTopMarginMm, effectiveBottomMarginMm, activeProfileId, printerProfiles, 
      printLeftMarginPx, printRightMarginPx]);

  // Handle page navigation for Paged.js
  useEffect(() => {
    if (paginationEngine !== 'pagedjs' || !pagedJsContainerRef.current) return;
    
    const pages = pagedJsContainerRef.current.querySelectorAll('.pagedjs_page');
    if (pages.length === 0 || currentPreviewPage < 1 || currentPreviewPage > pages.length) return;
    
    const targetPage = pages[currentPreviewPage - 1];
    if (targetPage) {
      targetPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [paginationEngine, currentPreviewPage]);

  // Autosave & history
  const draftKey = useMemo(() => `rxDraft:${patientId}:${visitId || 'standalone'}`, [patientId, visitId]);
  const pushHistory = useCallback(() => {
    const snapshot = { items: JSON.parse(JSON.stringify(items)), followUpInstructions };
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    redoStackRef.current = [];
  }, [items, followUpInstructions]);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const data = { items, followUpInstructions };
        localStorage.setItem(draftKey, JSON.stringify(data));
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [draftKey, items, followUpInstructions]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data?.items)) setItems(data.items);
        if (typeof data?.followUpInstructions === 'string') setFollowUpInstructions(data.followUpInstructions);
      }
    } catch {}
    pushHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  const undo = useCallback(() => {
    if (undoStackRef.current.length <= 1) return;
    const cur = undoStackRef.current.pop();
    if (!cur) return;
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    redoStackRef.current.push(cur);
    setItems(JSON.parse(JSON.stringify(prev.items)));
    setFollowUpInstructions(prev.followUpInstructions || '');
  }, []);
  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(next);
    setItems(JSON.parse(JSON.stringify(next.items)));
    setFollowUpInstructions(next.followUpInstructions || '');
  }, []);

  return (
    <div className="space-y-6">
      {!standalone && validItems.length > 0 && (
        <div className="sticky top-0 z-10 bg-white border-b py-2 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const url = `/dashboard/pharmacy?patientId=${encodeURIComponent(patientId)}&doctorId=${encodeURIComponent(doctorId)}${visitId ? `&visitId=${encodeURIComponent(visitId)}` : ''}`;
              window.location.href = url;
            }}
          >
            Go to Pharmacy
          </Button>
        </div>
      )}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Prescription Builder</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {standalone ? 'Prescription Pad' : 'Visit-linked'}
                </Badge>
                {!standalone && (
                  <Button variant="secondary" size="sm" onClick={() => setOrderOpen(true)}>Order via 1MG</Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingVisit && (
              <div className="text-xs text-gray-500">Loading visit details…</div>
            )}

            {/* Templates quick bar */}
            <div className="flex flex-wrap gap-2 items-end">
              <div className="min-w-[240px]">
                <label className="text-xs text-gray-600">Templates</label>
                <Select value={selectedTemplateId} onValueChange={(v: string) => setSelectedTemplateId(v)}>
                  <SelectTrigger><SelectValue placeholder={loadingTemplates ? 'Loading templates…' : 'Select a template'} /></SelectTrigger>
                  <SelectContent>
                    {allTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const entry = allTemplates.find(t => t.id === selectedTemplateId);
                  if (entry) applyTemplateToBuilder(entry.tpl);
                }}
                disabled={!selectedTemplateId}
              >
                Apply
              </Button>
              <Button variant="outline" size="sm" onClick={() => void loadTemplates()} disabled={loadingTemplates}>Refresh</Button>
              <Button variant="ghost" size="sm" onClick={undo}>Undo</Button>
              <Button variant="ghost" size="sm" onClick={redo}>Redo</Button>
              <Button variant="destructive" size="sm" onClick={() => { try { localStorage.removeItem(`rxDraft:${patientId}:${visitId || 'standalone'}`); } catch {}; setItems([]); setFollowUpInstructions(''); pushHistory(); }}>Reset to default</Button>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setTemplatePromptOpen(true)}>Save current</Button>
                <Button variant="outline" size="sm" onClick={() => setFieldTemplatePromptOpen(true)}>Save fields</Button>
                <Button size="sm" onClick={() => setNewTemplateOpen(true)}>New template</Button>
              </div>
            </div>

            {/* Basic Information */}
            {/* Moved to bottom of builder; removed Doctor's Personal Notes field */}

            {/* Clinical Details */}
            <CollapsibleSection title="Clinical Details & Vitals" section="clinical">
              <div className="space-y-3">
                {/* Vitals */}
                <div className="grid grid-cols-3 md:grid-cols-8 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">Height (cm)</label>
                    <Input key="vitals-height" type="number" value={vitalsHeightCm ?? ''} onChange={(e) => setVitalsHeightCm(e.target.value === '' ? '' : Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Weight (kg)</label>
                    <Input key="vitals-weight" type="number" value={vitalsWeightKg ?? ''} onChange={(e) => setVitalsWeightKg(e.target.value === '' ? '' : Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">BMI</label>
                    <Input key="vitals-bmi" value={vitalsBmi ?? ''} readOnly />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">BP (Sys)</label>
                    <Input key="vitals-bp-sys" type="number" value={vitalsBpSys ?? ''} onChange={(e) => setVitalsBpSys(e.target.value === '' ? '' : Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">BP (Dia)</label>
                    <Input key="vitals-bp-dia" type="number" value={vitalsBpDia ?? ''} onChange={(e) => setVitalsBpDia(e.target.value === '' ? '' : Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Pulse (bpm)</label>
                    <Input key="vitals-pulse" type="number" value={vitalsPulse ?? ''} onChange={(e) => setVitalsPulse(e.target.value === '' ? '' : Number(e.target.value))} />
                  </div>
                  <div></div>
                  <div></div>
                </div>

                
              </div>
            </CollapsibleSection>

            {/* Add Drug to DB Dialog */}
            <Dialog open={addDrugOpen} onOpenChange={setAddDrugOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Drug to Database</DialogTitle>
                  <DialogDescription>Quickly add a new drug record and insert into this prescription.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-600">Name</label>
                    <Input value={newDrugForm.name} onChange={(e) => setNewDrugForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g., Paracetamol 500mg Tablet" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Manufacturer</label>
                    <Input value={newDrugForm.manufacturerName} onChange={(e) => setNewDrugForm((p) => ({ ...p, manufacturerName: e.target.value }))} placeholder="e.g., Sun Pharmaceuticals" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-600">Price (₹)</label>
                      <Input type="number" value={newDrugForm.price} onChange={(e) => setNewDrugForm((p) => ({ ...p, price: e.target.value }))} placeholder="e.g., 25" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Pack Size Label</label>
                      <Input value={newDrugForm.packSizeLabel} onChange={(e) => setNewDrugForm((p) => ({ ...p, packSizeLabel: e.target.value }))} placeholder="e.g., strip of 10 tablets" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddDrugOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateDrug}>Save & Add</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Chief Complaints - dedicated card */}
            <CollapsibleSection 
              title="Chief Complaints" 
              section="chief-complaints" 
              highlight={hasChiefComplaints}
              badge={hasChiefComplaints ? 'Has Data' : ''}
            >
              <div className="opacity-100">
                <label className="text-xs text-gray-600 flex items-center gap-1">Chief Complaints{language !== 'EN' && (<Languages className="h-3 w-3 text-blue-600" aria-label="Translated on print" />)}</label>
                <div className="relative complaint-autocomplete flex items-start">
                  <Textarea key="chief-complaints" rows={2} value={chiefComplaints} onChange={(e) => setChiefComplaints(e.target.value)} />
                  <VoiceButton fieldName="chiefComplaints" />
                </div>
                <div className="mt-2">
                  <div className="text-[11px] text-gray-600 mb-1">Skin Concerns</div>
                  <div className="flex flex-wrap gap-2">
                    {SKIN_CONCERNS.map((c) => (
                      <Button
                        key={c}
                        type="button"
                        variant={skinConcerns.has(c) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleSet(skinConcerns, c, setSkinConcerns)}
                      >
                        {c}
                      </Button>
                    ))}
                  </div>
                </div>
                {complaintOptions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow-sm max-h-40 overflow-auto" onMouseDown={(e) => e.preventDefault()}>
                    {complaintOptions.map((opt) => (
                      <div key={opt} className="px-3 py-1 text-sm hover:bg-gray-50 cursor-pointer" onClick={() => { setChiefComplaints(opt); setComplaintOptions([]); pushRecent('chiefComplaints', opt); }}>
                        {opt}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CollapsibleSection>

            {/* Diagnosis */}
            <CollapsibleSection title="Diagnosis" section="diagnosis">
              <div className="opacity-100">
                <label className="text-xs text-gray-600 flex items-center gap-1">Diagnosis{language !== 'EN' && (<Languages className="h-3 w-3 text-blue-600" aria-label="Translated on print" />)}</label>
                <div className="relative diag-autocomplete">
                  <Input key="diagnosis" placeholder="e.g., Acne vulgaris" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
                  {diagOptions.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow-sm max-h-48 overflow-auto" onMouseDown={(e) => e.preventDefault()}>
                      {diagOptions.map((opt) => (
                        <div key={opt} className="px-3 py-1 text-sm hover:bg-gray-50 cursor-pointer" onClick={() => { setDiagnosis(opt); setDiagOptions([]); pushRecent('diagnosis', opt); }}>
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-2 text-xs text-gray-600 flex items-center gap-3">
                  <span>Totals:</span>
                  <span>Prints: {printTotals['PRINT_PREVIEW_PDF'] || 0}</span>
                  <span>WhatsApp shares: {printTotals['WHATSAPP_SHARE'] || 0}</span>
                  <span>Email shares: {printTotals['EMAIL_SHARE'] || 0}</span>
                </div>
              </div>
            </CollapsibleSection>

            {/* Histories */}
            <CollapsibleSection 
              title="Patient History" 
              section="histories" 
              highlight={hasHistories}
              badge={hasHistories ? "Has Data" : ""}
            >
              <div className="opacity-100">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 flex items-center gap-1">Past History{language !== 'EN' && (<Languages className="h-3 w-3 text-blue-600" aria-label="Translated on print" />)}</label>
                    <Textarea key="past-history" rows={2} value={pastHistory} onChange={(e) => setPastHistory(e.target.value)} onBlur={(e) => pushRecent('pastHistory', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 flex items-center gap-1">Medication History{language !== 'EN' && (<Languages className="h-3 w-3 text-blue-600" aria-label="Translated on print" />)}</label>
                    <Textarea key="medication-history" rows={2} value={medicationHistory} onChange={(e) => setMedicationHistory(e.target.value)} onBlur={(e) => pushRecent('medicationHistory', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 flex items-center gap-1">Menstrual History{language !== 'EN' && (<Languages className="h-3 w-3 text-blue-600" aria-label="Translated on print" />)}</label>
                    <Textarea key="menstrual-history" rows={2} value={menstrualHistory} onChange={(e) => setMenstrualHistory(e.target.value)} onBlur={(e) => pushRecent('menstrualHistory', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 flex items-center gap-1">Family History{language !== 'EN' && (<Languages className="h-3 w-3 text-blue-600" aria-label="Translated on print" />)}</label>
                    <div className="flex flex-wrap gap-2 text-xs mt-1">
                      <label className="flex items-center gap-1"><input type="checkbox" checked={familyHistoryDM} onChange={(e) => setFamilyHistoryDM(e.target.checked)} /> DM</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={familyHistoryHTN} onChange={(e) => setFamilyHistoryHTN(e.target.checked)} /> HTN</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={familyHistoryThyroid} onChange={(e) => setFamilyHistoryThyroid(e.target.checked)} /> Thyroid</label>
                    </div>
                    <Input key="family-history-others" className="mt-1" placeholder="Others" value={familyHistoryOthers} onChange={(e) => setFamilyHistoryOthers(e.target.value)} onBlur={(e) => pushRecent('familyHistoryOthers', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="text-xs text-gray-600 flex items-center gap-1">Triggers{language !== 'EN' && (<Languages className="h-3 w-3 text-blue-600" aria-label="Translated on print" />)}</label>
                    <Input placeholder="Heat, stress, cosmetics..." value={exTriggers} onChange={(e) => setExTriggers(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 flex items-center gap-1">Prior Treatments{language !== 'EN' && (<Languages className="h-3 w-3 text-blue-600" aria-label="Translated on print" />)}</label>
                    <Input placeholder="Topicals/systemics tried" value={exPriorTx} onChange={(e) => setExPriorTx(e.target.value)} />
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            {/* On Examination - Dermatology */}
            <CollapsibleSection title="On Examination" section="on-examination">
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">Fitzpatrick Skin Type</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {FITZPATRICK.map(ft => (
                        <Button key={ft} type="button" variant={exSkinType === ft ? 'default' : 'outline'} size="sm" onClick={() => setExSkinType(exSkinType === ft ? '' : ft)}>{ft}</Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Acne Severity</label>
                    <Input placeholder="mild/moderate/severe" value={exAcneSeverity} onChange={(e) => setExAcneSeverity(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Itch Score (0-10)</label>
                    <Input placeholder="0-10" value={exItchScore} onChange={(e) => setExItchScore(e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-600">Morphology</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {MORPHOLOGY.map(m => (
                      <div key={m} className="relative">
                        <Button type="button" variant={exMorphology.has(m) ? 'default' : 'outline'} size="sm" onClick={() => toggleSet(exMorphology, m, setExMorphology)}>{m}</Button>
                        {customMorphology.some(x => x.toLowerCase() === m.toLowerCase()) && (
                          <button
                            type="button"
                            aria-label="Remove custom morphology"
                            className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-white border shadow flex items-center justify-center hover:bg-gray-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              const lowered = m.toLowerCase();
                              setCustomMorphology(prev => prev.filter(x => x.toLowerCase() !== lowered));
                              setExMorphology(prev => {
                                const next = new Set(prev);
                                // also unselect if currently selected
                                for (const val of Array.from(next)) {
                                  if (String(val).toLowerCase() === lowered) next.delete(val);
                                }
                                return next;
                              });
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      placeholder="Type and press Enter to add"
                      value={newMorphology}
                      onChange={(e) => setNewMorphology(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = (newMorphology || '').trim();
                          if (val) {
                            setExMorphology(prev => { const next = new Set(prev); next.add(val); return next; });
                            setCustomMorphology(prev => {
                              const lowered = val.toLowerCase();
                              if (prev.some((x) => x.toLowerCase() === lowered)) return prev;
                              return [val, ...prev].slice(0, 100);
                            });
                            setNewMorphology('');
                          }
                          e.preventDefault();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const val = (newMorphology || '').trim();
                        if (!val) return;
                        setExMorphology(prev => { const next = new Set(prev); next.add(val); return next; });
                        setCustomMorphology(prev => {
                          const lowered = val.toLowerCase();
                          if (prev.some((x) => x.toLowerCase() === lowered)) return prev;
                          return [val, ...prev].slice(0, 100);
                        });
                        setNewMorphology('');
                      }}
                    >Add</Button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-600">Distribution / Body Areas</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {DISTRIBUTION.map(d => (
                      <div key={d} className="relative">
                        <Button type="button" variant={exDistribution.has(d) ? 'default' : 'outline'} size="sm" onClick={() => toggleSet(exDistribution, d, setExDistribution)}>{d}</Button>
                        {customDistribution.some(x => x.toLowerCase() === d.toLowerCase()) && (
                          <button
                            type="button"
                            aria-label="Remove custom distribution"
                            className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-white border shadow flex items-center justify-center hover:bg-gray-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              const lowered = d.toLowerCase();
                              setCustomDistribution(prev => prev.filter(x => x.toLowerCase() !== lowered));
                              setExDistribution(prev => {
                                const next = new Set(prev);
                                for (const val of Array.from(next)) {
                                  if (String(val).toLowerCase() === lowered) next.delete(val);
                                }
                                return next;
                              });
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      placeholder="Type and press Enter to add"
                      value={newDistribution}
                      onChange={(e) => setNewDistribution(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = (newDistribution || '').trim();
                          if (val) {
                            setExDistribution(prev => { const next = new Set(prev); next.add(val); return next; });
                            setCustomDistribution(prev => {
                              const lowered = val.toLowerCase();
                              if (prev.some((x) => x.toLowerCase() === lowered)) return prev;
                              return [val, ...prev].slice(0, 100);
                            });
                            setNewDistribution('');
                          }
                          e.preventDefault();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const val = (newDistribution || '').trim();
                        if (!val) return;
                        setExDistribution(prev => { const next = new Set(prev); next.add(val); return next; });
                        setCustomDistribution(prev => {
                          const lowered = val.toLowerCase();
                          if (prev.some((x) => x.toLowerCase() === lowered)) return prev;
                          return [val, ...prev].slice(0, 100);
                        });
                        setNewDistribution('');
                      }}
                    >Add</Button>
                  </div>
                </div>

                

                <div>
                  <label className="text-xs text-gray-600">Dermatology Diagnoses</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {DERM_DIAGNOSES.map(dx => (
                      <Button key={dx} type="button" variant={exDermDx.has(dx) ? 'default' : 'outline'} size="sm" onClick={() => setExDermDx(prev => { const next = new Set(prev); next.has(dx) ? next.delete(dx) : next.add(dx); return next; })}>{dx}</Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-600">Detailed Examination</label>
                  <div className="flex items-center">
                    <Textarea placeholder="Detailed physical examination findings..." value={exObjective} onChange={(e) => setExObjective(e.target.value)} rows={3} />
                    <VoiceButton fieldName="objective" />
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            {/* Treatment */}
            <CollapsibleSection title="Treatment" section="treatment">
              <div className="space-y-3">
                {/* Drug search to add rows */}
                <div>
                  <label className="text-sm text-gray-700">Add Medicine</label>
                  <Input 
                    key="drug-search"
                    placeholder="Search drug name or brand (min 2 chars)" 
                    value={drugQuery}
                    onChange={(e) => void searchDrugs(e.target.value)}
                  />
                  {canAddDrugToDB && (
                    <div className="mt-1">
                      <Button size="sm" variant="ghost" onClick={openAddDrugDialog}>+ Add to Drug Database</Button>
                    </div>
                  )}
                  {drugQuery.trim().length >= 2 && (
                    <div className="mt-2 border rounded divide-y max-h-48 overflow-auto" onMouseDown={(e) => e.preventDefault()}>
                      {loadingDrugs && (
                        <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
                      )}
                      {!loadingDrugs && drugResults.length === 0 && (
                        <div className="px-3 py-2 text-xs text-gray-500">No results</div>
                      )}
                      {!loadingDrugs && drugResults.length > 0 && (
                        <>
                          {drugResults.map((d: any, index: number) => (
                            <div 
                              key={`${d.id}-${d.name}`} 
                              className={`px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 ${
                                index === 0 ? 'bg-green-50 border-l-4 border-l-green-500' : 
                                index < 3 ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                              }`}
                              onMouseEnter={() => prefetchDrugStockById(d.id)}
                              title={((): string => {
                                const stock = drugStockById[d.id];
                                if (stock === undefined) return 'Checking stock…';
                                return `Remaining stock: ${stock}`;
                              })()}
                            >
                              <div className="flex-1">
                                <div className="flex items-center">
                                  <div className="font-medium">
                                    {highlightMatch(d.name, drugQuery)}
                                  </div>
                                  {getRelevanceBadge(d, drugQuery, index)}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {highlightMatch(d.manufacturer || d.manufacturerName || d.genericName || '', drugQuery)}
                                  {d.packSizeLabel ? ` • ${d.packSizeLabel}` : ''}
                                </div>
                                <div className="text-xs mt-0.5">
                                  <span className="text-gray-500">Stock:</span>{' '}
                                  {drugStockById[d.id] !== undefined ? (
                                    <span className={drugStockById[d.id] <= 5 ? 'text-red-600' : 'text-gray-700'}>
                                      {drugStockById[d.id]}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </div>
                              </div>
                              <Button size="sm" variant="outline" onClick={() => { addItemFromDrug(d); }}>Add</Button>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">Total items: {items.length}</div>
                  <Button size="sm" variant="outline" onClick={() => setItems(prev => [...prev, { drugName: '', dosage: '', dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', dosePattern: '', duration: '', durationUnit: 'DAYS', instructions: '', timing: '', quantity: '' }])}>Add Row</Button>
                </div>
                <div className="overflow-auto border rounded">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Medicine</th>
                        <th className="px-3 py-2 text-left font-medium">Frequency (0-1-0)</th>
                        <th className="px-3 py-2 text-left font-medium">When</th>
                        <th className="px-3 py-2 text-left font-medium">Duration</th>
                        <th className="px-3 py-2 text-left font-medium">Instructions</th>
                        <th className="px-3 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-3 text-center text-gray-500">No items added yet</td>
                        </tr>
                      )}
                      {items.map((it, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-3 py-2 align-top" onMouseEnter={() => prefetchDrugStockByName(it.drugName)} title={(() => { const key = (it.drugName || '').trim().toLowerCase(); const stock = drugStockById[key]; if (stock === undefined) return 'Remaining stock: —'; return `Remaining stock: ${stock}`; })()}>
                            <div className="flex items-center gap-2">
                              <Input value={it.drugName} onChange={(e) => updateItem(idx, { drugName: e.target.value })} placeholder="Medicine name" />
                              <span className="text-xs text-gray-500 whitespace-nowrap">
                                Stock:{' '}
                                {(() => { const key = (it.drugName || '').trim().toLowerCase(); const stock = drugStockById[key]; return stock !== undefined ? <span className={stock <= 5 ? 'text-red-600' : 'text-gray-700'}>{stock}</span> : <span className="text-gray-400">—</span>; })()}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="grid grid-cols-2 gap-1">
                              <Input value={it.dosePattern || ''} onChange={(e) => {
                                const nextPattern = e.target.value;
                                const inferred = inferFrequencyFromDosePattern(nextPattern);
                                if (inferred) {
                                  updateItem(idx, { dosePattern: nextPattern, frequency: inferred });
                                } else {
                                  updateItem(idx, { dosePattern: nextPattern });
                                }
                              }} placeholder="e.g., 1-0-1" />
                              <Select value={it.frequency} onValueChange={(v: Frequency) => updateItem(idx, { frequency: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {['ONCE_DAILY','TWICE_DAILY','THREE_TIMES_DAILY','FOUR_TIMES_DAILY','AS_NEEDED','WEEKLY','MONTHLY'].map(f => (
                                    <SelectItem key={f} value={f as Frequency}>{f.replaceAll('_',' ')}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Select value={it.timing || ''} onValueChange={(v: string) => updateItem(idx, { timing: v })}>
                              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                              <SelectContent>
                                {['AM','PM','After Breakfast','After Lunch','After Dinner','Before Meals','QHS','HS','With Food','Empty Stomach'].map(t => (
                                  <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="grid grid-cols-2 gap-1">
                              <Input type="number" value={it.duration} onChange={(e) => updateItem(idx, { duration: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="#" />
                              <Select value={it.durationUnit} onValueChange={(v: DurationUnit) => updateItem(idx, { durationUnit: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {['DAYS','WEEKS','MONTHS','YEARS'].map(u => (
                                    <SelectItem key={u} value={u as DurationUnit}>{u}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Input value={it.instructions || ''} onChange={(e) => updateItem(idx, { instructions: e.target.value })} placeholder="e.g., Avoid alcohol" />
                          </td>
                          <td className="px-3 py-2 align-top text-right">
                            <Button size="sm" variant="outline" onClick={() => removeItem(idx)}>Remove</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CollapsibleSection>


            {/* Procedures */}
            <CollapsibleSection 
              title="Procedure Planned" 
              section="procedures" 
              highlight={hasProcedurePlanned}
              badge={hasProcedurePlanned ? "Has Data" : ""}
            >
              <div className="space-y-3 opacity-100">
                <label className="text-xs text-gray-600 flex items-center gap-1">Procedure Planned{language !== 'EN' && (<Languages className="h-3 w-3 text-blue-600" aria-label="Translated on print" />)}</label>
                <Textarea rows={2} value={procedurePlanned} onChange={(e) => setProcedurePlanned(e.target.value)} onBlur={(e) => pushRecent('procedurePlanned', e.target.value)} />
              </div>
            </CollapsibleSection>

            {/* Investigations */}
            <CollapsibleSection 
              title={`Investigations${language !== 'EN' ? ' (translates)' : ''}`} 
              section="investigations" 
              highlight={hasInvestigations}
              badge={hasInvestigations ? "Has Data" : ""}
            >
              <div className="opacity-100">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {investigationOptions.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={investigations.includes(opt)} onChange={(e) => setInvestigations((prev) => e.target.checked ? [...prev, opt] : prev.filter((x) => x !== opt))} />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </CollapsibleSection>

            {/* Custom Sections (moved print toggles to Customization tab) */}
            {customSections.length > 0 && (
                <div className="mt-3 space-y-3">
                  {customSections.map((s) => (
                    <Card key={s.id}>
                      <CardContent className="p-3 space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                          <div className="md:col-span-2">
                            <label className="text-xs text-gray-600">Section Title</label>
                            <Input value={s.title} onChange={(e) => updateCustomSection(s.id, { title: e.target.value })} />
                          </div>
                          <div className="md:col-span-3">
                            <label className="text-xs text-gray-600">Content</label>
                            <Input value={s.content} onChange={(e) => updateCustomSection(s.id, { content: e.target.value })} />
                          </div>
                          <div className="md:col-span-1 flex justify-end">
                            <Button variant="outline" onClick={() => removeCustomSection(s.id)}>Remove</Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <Button size="sm" variant="outline" onClick={addCustomSection}>Add Custom Section</Button>
              </div>
            

            {/* Basic Information */}
            <CollapsibleSection title="Basic Information" section="basic">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-sm text-gray-700">Language</label>
                    <Select value={language} onValueChange={(v: Language) => setLanguage(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EN">English</SelectItem>
                        <SelectItem value="TE">Telugu</SelectItem>
                        <SelectItem value="HI">Hindi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {language !== 'EN' && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                    <div className="font-medium mb-1">Translation enabled</div>
                    <div>
                      On print preview, free‑form fields will be translated to {language === 'HI' ? 'Hindi' : 'Telugu'}.
                      This includes: Diagnosis, Chief complaints, Histories, Family history (other), Post‑procedure care,
                      Procedure planned, Investigations, Custom sections, and per‑medication notes. Medication names,
                      numbers, and units remain unchanged.
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-700 flex items-center gap-1">Follow-up Instructions{language !== 'EN' && (<Languages className="h-3.5 w-3.5 text-blue-600" aria-label="Translated on print" />)}</label>
                    <Input key="followup-instructions" placeholder="e.g., Review in 4 weeks" value={followUpInstructions} onChange={(e) => setFollowUpInstructions(e.target.value)} onBlur={(e) => pushRecent('followUp', e.target.value)} />
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            {/* Review Date (bottom of builder) */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 opacity-100">
              <div className="md:col-span-1">
                <label className="text-sm text-gray-700">Review Date</label>
                <Input type="date" value={reviewDate || ''} onChange={(e) => onChangeReviewDate?.(e.target.value)} />
              </div>
            </div>

                          <div className="flex items-center justify-between pt-2 opacity-100">
              <div className="text-sm text-gray-600">Total items: {validItems.length} • Total qty: {totalQuantity}</div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setOrderOpen(true)} disabled={validItems.length === 0}>Order via 1MG</Button>
                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-sm text-gray-700">Print</span>
                  <Select value={rxPrintFormat} onValueChange={(v: 'TEXT' | 'TABLE') => setRxPrintFormat(v)}>
                    <SelectTrigger className="w-36 h-9">
                      <SelectValue placeholder="Format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TABLE">Table</SelectItem>
                      <SelectItem value="TEXT">Text</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (language === 'EN') {
                      console.debug('[PrescriptionBuilder] Print Preview: language EN, skipping translation');
                      toast({ title: 'Print Preview', description: 'Language is English. Skipping translation.' });
                      setTranslationsMap({});
                      setPreviewOpen(true);
                      return;
                    }
                    setTranslatingPreview(true);
                    try {
                      await translateForPreview();
                      setPreviewOpen(true);
                    } finally {
                      setTranslatingPreview(false);
                    }
                  }}
                >
                  {translatingPreview ? 'Preparing…' : 'Print Preview'}
                </Button>
                <Button onClick={create} disabled={!canCreate}>
                  {(visitId || standalone || ensureVisitId) ? 'Create Prescription' : 'Save visit first'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Print Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-[100vw] sm:max-w-[100vw] md:max-w-[100vw] lg:max-w-[100vw] 2xl:max-w-[100vw] w-[100vw] h-[100vh] p-0 overflow-hidden rounded-none border-0">
            <DialogHeader className="sr-only">
              <DialogTitle>Prescription Preview</DialogTitle>
            </DialogHeader>
            <div className="h-full min-h-0 flex flex-row">
              {/* Scoped print CSS to only print the preview container */}
              <style dangerouslySetInnerHTML={{
                __html: `
                @import url('https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600&display=swap');
                @page {
                  size: ${paperPreset === 'LETTER' ? '8.5in 11in' : 'A4'} portrait;
                  margin: 0;
                  @top-left { content: ""; }
                  @top-center { content: ""; }
                  @top-right { content: ""; }
                  @bottom-left { content: ""; }
                  @bottom-center { content: ""; }
                  @bottom-right { content: ""; }
                }
                @media print {
                  * {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                  }
                  /* Explicit page break helpers */
                  .pb-before-page { break-before: page !important; page-break-before: always !important; }
                  .pb-avoid-break { break-inside: avoid !important; page-break-inside: avoid !important; }
                  html, body {
                    margin: 0 !important;
                    padding: 0 !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                  }
                  @page :first {
                    margin-top: 0 !important;
                  }
                  @page :left {
                    margin-left: 0 !important;
                  }
                  @page :right {
                    margin-right: 0 !important;
                  }
                  body *:not(#prescription-print-root):not(#prescription-print-root *) {
                    visibility: hidden !important;
                  }
                  #prescription-print-root, #prescription-print-root * {
                    visibility: visible !important;
                  }
                   #prescription-print-root {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: ${paperPreset === 'LETTER' ? '216mm' : '210mm'} !important;
                    height: ${paperPreset === 'LETTER' ? '279mm' : '297mm'} !important;
                    margin: 0 !important;
                    padding-top: ${effectiveTopMarginMm}mm !important;
                    padding-left: ${Math.max(0, (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.leftMarginPx ?? printLeftMarginPx ?? 45) : (printLeftMarginPx ?? 45)))/3.78}mm !important;
                    padding-right: ${Math.max(0, (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.rightMarginPx ?? printRightMarginPx ?? 45) : (printRightMarginPx ?? 45)))/3.78}mm !important;
                    padding-bottom: ${effectiveBottomMarginMm}mm !important;
                    box-sizing: border-box !important;
                    background: white !important;
                    background-repeat: no-repeat !important;
                    background-position: 0 0 !important;
                    background-size: ${paperPreset === 'LETTER' ? '216mm 279mm' : '210mm 297mm'} !important;
                    ${(printBgUrl ?? '/letterhead.png') ? `background-image: url('${printBgUrl ?? '/letterhead.png'}') !important;` : ''}
                  }
                  #prescription-print-content {
                    width: 100% !important;
                    min-height: calc(${paperPreset === 'LETTER' ? '279mm' : '297mm'} - ${effectiveTopMarginMm}mm - ${effectiveBottomMarginMm}mm${frames?.enabled ? ` - ${frames.headerHeightMm || 0}mm - ${frames.footerHeightMm || 0}mm` : ''}) !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    box-sizing: border-box !important;
                    /* Allow content to flow across pages naturally */
                    page-break-inside: auto !important;
                  }
                }
                ${rxPrintFormat === 'TEXT' ? `
                  /* Text print mode */
                  #prescription-print-content > :not(.rx-text) { display: none !important; }
                  .rx-text { display: block !important; }
                ` : `
                  /* Table/normal mode */
                  .rx-text { display: none !important; }
                `}
                
                /* Paged.js styling */
                #pagedjs-container .pagedjs_page {
                  margin: 20px auto;
                  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                  background: white;
                }
                
                #pagedjs-container .pagedjs_pagebox {
                  background-image: ${(printBgUrl ?? '/letterhead.png') ? `url('${printBgUrl ?? '/letterhead.png'}')` : 'none'};
                  background-repeat: no-repeat;
                  background-position: top left;
                  background-size: ${paperPreset === 'LETTER' ? '216mm 279mm' : '210mm 297mm'};
                }
                `
              }} />
            <div className="flex-1 min-h-0 overflow-auto overflow-x-auto" style={{ position: 'relative' }}>
              {previewJustUpdated && (
                <div className="absolute top-2 right-3 z-20 text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">Updated</div>
              )}
              {/* Page indicator for paginated view */}
              {((previewViewMode === 'paginated' && paginationEngine === 'custom') || paginationEngine === 'pagedjs') && totalPreviewPages > 1 && (
                <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-20 text-xs px-3 py-1.5 rounded-full bg-gray-900 text-white shadow-lg">
                  Page {currentPreviewPage} of {totalPreviewPages} {paginationEngine === 'pagedjs' && '(Paged.js)'}
                </div>
              )}
              <div style={{ 
                transform: `scale(${previewZoom})`, 
                transformOrigin: 'top left',
                ...((previewViewMode === 'paginated' && paginationEngine === 'custom') ? {
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'flex-start',
                  minHeight: '100%',
                  padding: '20px 0'
                } : {})
              }}>
              
              {/* Paged.js Container */}
              {paginationEngine === 'pagedjs' && (
                <div 
                  ref={pagedJsContainerRef}
                  id="pagedjs-container"
                  className="w-full"
                  style={{
                    minHeight: '100vh',
                  }}
                />
              )}
              
              {/* Custom Pagination Container */}
              <div
                id="prescription-print-root"
                ref={printRef}
                className="bg-white text-gray-900"
                style={{
                  display: paginationEngine === 'pagedjs' ? 'none' : 'block',
                  fontFamily: 'Fira Sans, sans-serif',
                  fontSize: '14px',
                  width: paperPreset === 'LETTER' ? '216mm' : '210mm',
                  minHeight: paperPreset === 'LETTER' ? '279mm' : '297mm',
                  ...(previewViewMode === 'paginated' ? {
                    height: paperPreset === 'LETTER' ? '279mm' : '297mm',
                    maxHeight: paperPreset === 'LETTER' ? '279mm' : '297mm',
                    overflow: 'hidden',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    position: 'relative'
                  } : {
                    margin: '0 auto'
                  }),
                  padding: '0',
                  paddingTop: `${effectiveTopMarginMm}mm`,
                  paddingLeft: `${Math.max(0, (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.leftMarginPx ?? printLeftMarginPx ?? 45) : (printLeftMarginPx ?? 45)))/3.78}mm`,
                  paddingRight: `${Math.max(0, (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.rightMarginPx ?? printRightMarginPx ?? 45) : (printRightMarginPx ?? 45)))/3.78}mm`,
                  paddingBottom: `${effectiveBottomMarginMm}mm`,
                  boxSizing: 'border-box',
                  backgroundImage: (printBgUrl ?? '/letterhead.png') ? `url(${printBgUrl ?? '/letterhead.png'})` : undefined,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'top left',
                  backgroundSize: paperPreset === 'LETTER' ? '216mm 279mm' : '210mm 297mm',
                  filter: grayscale ? 'grayscale(100%)' : undefined,
                  transition: 'padding-top 200ms ease, padding-bottom 200ms ease',
                  willChange: 'padding-top, padding-bottom',
                }}
              >
                {showRefillStamp && (
                  <div aria-hidden className="pointer-events-none select-none" style={{ position: 'absolute', right: 12, top: 12, padding: '4px 8px', border: '1px dashed rgba(0,0,0,0.4)', color: '#0a0a0a', background: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                    Refill eligible
                  </div>
                )}
                {bleedSafe?.enabled && (
                  <div aria-hidden className="pointer-events-none" style={{ position: 'absolute', inset: 0, outline: `${Math.max(0, bleedSafe.safeMarginMm) / 3.78}mm solid rgba(255,0,0,0.15)`, outlineOffset: `-${Math.max(0, bleedSafe.safeMarginMm) / 3.78}mm` }} />
                )}
                {/* Header/Footer Frames Overlays */}
                {frames?.enabled && (
                  <>
                    <div aria-hidden className="pointer-events-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${Math.max(0, (frames.headerHeightMm || 0))}mm`, background: 'rgba(0, 123, 255, 0.06)', outline: '1px dashed rgba(0,123,255,0.5)' }} />
                    <div aria-hidden className="pointer-events-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${Math.max(0, (frames.footerHeightMm || 0))}mm`, background: 'rgba(0, 123, 255, 0.06)', outline: '1px dashed rgba(0,123,255,0.5)' }} />
                    {/* Drag handles */}
                    <div
                      role="separator"
                      aria-label="Resize header"
                      style={{ position: 'absolute', left: 0, right: 0, top: `${Math.max(0, frames.headerHeightMm || 0)}mm`, height: 6, cursor: 'row-resize', background: 'transparent' }}
                      onMouseDown={(e) => {
                        if (!(e.buttons & 1)) return;
                        const startY = e.clientY;
                        const startMm = Math.max(0, frames?.headerHeightMm || 0);
                        const move = (ev: MouseEvent) => {
                          const dyPx = ev.clientY - startY;
                          const dyMm = dyPx / 3.78; // px -> mm approx
                          const next = Math.max(0, Math.round((startMm + dyMm) * 10) / 10);
                          onChangeFrames?.({ headerHeightMm: next });
                        };
                        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                        window.addEventListener('mousemove', move);
                        window.addEventListener('mouseup', up);
                      }}
                    />
                    <div
                      role="separator"
                      aria-label="Resize footer"
                      style={{ position: 'absolute', left: 0, right: 0, bottom: `${Math.max(0, frames.footerHeightMm || 0)}mm`, height: 6, cursor: 'row-resize', background: 'transparent' }}
                      onMouseDown={(e) => {
                        if (!(e.buttons & 1)) return;
                        const startY = e.clientY;
                        const startMm = Math.max(0, frames?.footerHeightMm || 0);
                        const move = (ev: MouseEvent) => {
                          const dyPx = startY - ev.clientY; // dragging up increases footer
                          const dyMm = dyPx / 3.78;
                          const next = Math.max(0, Math.round((startMm + dyMm) * 10) / 10);
                          onChangeFrames?.({ footerHeightMm: next });
                        };
                        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                        window.addEventListener('mousemove', move);
                        window.addEventListener('mouseup', up);
                      }}
                    />
                  </>
                )}
                <div 
                  id="prescription-print-content" 
                  className="w-full h-full"
                  style={{
                    position: 'relative',
                    left: `${(activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.contentOffsetXPx ?? contentOffsetXPx ?? 0) : (contentOffsetXPx ?? 0))}px`,
                    top: (() => {
                      const baseOffset = (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.contentOffsetYPx ?? contentOffsetYPx ?? 0) : (contentOffsetYPx ?? 0));
                      
                      // In paginated mode, apply page offset
                      if (previewViewMode === 'paginated' && currentPreviewPage > 1) {
                        const mmToPx = 3.78;
                        const pageHeightMm = paperPreset === 'LETTER' ? 279 : 297;
                        const pageHeightPx = pageHeightMm * mmToPx;
                        const topMarginPx = overrideTopMarginPx ?? (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.topMarginPx ?? printTopMarginPx ?? 150) : (printTopMarginPx ?? 150));
                        const bottomMarginPx = overrideBottomMarginPx ?? (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.bottomMarginPx ?? printBottomMarginPx ?? 45) : (printBottomMarginPx ?? 45));
                        
                        // Calculate offset: shift by full page height per page
                        const availableHeightPerPage = pageHeightPx - topMarginPx - bottomMarginPx;
                        const pageOffset = -((currentPreviewPage - 1) * availableHeightPerPage);
                        return `${baseOffset + pageOffset}px`;
                      }
                      
                      return `${baseOffset}px`;
                    })(),
                    // In paginated mode, use clip-path to hide content in margin areas
                    ...(previewViewMode === 'paginated' ? {
                      minHeight: (() => {
                        const mmToPx = 3.78;
                        const pageHeightMm = paperPreset === 'LETTER' ? 279 : 297;
                        const pageHeightPx = pageHeightMm * mmToPx;
                        const topMarginPx = overrideTopMarginPx ?? (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.topMarginPx ?? printTopMarginPx ?? 150) : (printTopMarginPx ?? 150));
                        const bottomMarginPx = overrideBottomMarginPx ?? (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.bottomMarginPx ?? printBottomMarginPx ?? 45) : (printBottomMarginPx ?? 45));
                        const availableHeightPerPage = pageHeightPx - topMarginPx - bottomMarginPx;
                        // Content needs space for all pages
                        return `${totalPreviewPages * availableHeightPerPage}px`;
                      })(),
                      // Use mask-image with repeating pattern to hide content in margin areas
                      // Black = visible, transparent = hidden
                      WebkitMaskImage: (() => {
                        const mmToPx = 3.78;
                        const pageHeightMm = paperPreset === 'LETTER' ? 279 : 297;
                        const pageHeightPx = pageHeightMm * mmToPx;
                        const topMarginPx = overrideTopMarginPx ?? (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.topMarginPx ?? printTopMarginPx ?? 150) : (printTopMarginPx ?? 150));
                        const bottomMarginPx = overrideBottomMarginPx ?? (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.bottomMarginPx ?? printBottomMarginPx ?? 45) : (printBottomMarginPx ?? 45));
                        const availableHeightPerPage = pageHeightPx - topMarginPx - bottomMarginPx;
                        
                        // Repeating mask: black (visible) for content areas, transparent for margins
                        return `repeating-linear-gradient(
                          to bottom,
                          black 0px,
                          black ${availableHeightPerPage}px,
                          transparent ${availableHeightPerPage}px,
                          transparent ${availableHeightPerPage + 1}px
                        )`;
                      })(),
                      maskImage: (() => {
                        const mmToPx = 3.78;
                        const pageHeightMm = paperPreset === 'LETTER' ? 279 : 297;
                        const pageHeightPx = pageHeightMm * mmToPx;
                        const topMarginPx = overrideTopMarginPx ?? (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.topMarginPx ?? printTopMarginPx ?? 150) : (printTopMarginPx ?? 150));
                        const bottomMarginPx = overrideBottomMarginPx ?? (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.bottomMarginPx ?? printBottomMarginPx ?? 45) : (printBottomMarginPx ?? 45));
                        const availableHeightPerPage = pageHeightPx - topMarginPx - bottomMarginPx;
                        
                        return `repeating-linear-gradient(
                          to bottom,
                          black 0px,
                          black ${availableHeightPerPage}px,
                          transparent ${availableHeightPerPage}px,
                          transparent ${availableHeightPerPage + 1}px
                        )`;
                      })(),
                    } : {
                      maxHeight: (() => {
                        const pageHeightMm = paperPreset === 'LETTER' ? 279 : 297;
                        const totalMarginMm = effectiveTopMarginMm + effectiveBottomMarginMm;
                        const frameHeightMm = frames?.enabled ? (frames.headerHeightMm || 0) + (frames.footerHeightMm || 0) : 0;
                        return `calc(${pageHeightMm}mm - ${totalMarginMm}mm - ${frameHeightMm}mm)`;
                      })(),
                      overflow: 'hidden',
                    }),
                    transition: previewViewMode === 'paginated' ? 'top 0.3s ease-in-out' : undefined,
                  }}
                  onMouseDown={(e) => {
                    if (!(e.buttons & 1)) return; // left button only
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const origX = contentOffsetXPx ?? 0;
                    const origY = contentOffsetYPx ?? 0;
                    const move = (ev: MouseEvent) => {
                      const dx = ev.clientX - startX;
                      const dy = ev.clientY - startY;
                      let nx = Math.round(origX + dx);
                      let ny = Math.round(origY + dy);
                      if (designAids?.enabled && designAids?.snapToGrid) {
                        const gs = Math.max(2, designAids.gridSizePx || 8);
                        nx = Math.round(nx / gs) * gs;
                        ny = Math.round(ny / gs) * gs;
                      }
                      onChangeContentOffset?.(nx, ny);
                    };
                    const up = () => {
                      window.removeEventListener('mousemove', move);
                      window.removeEventListener('mouseup', up);
                    };
                    window.addEventListener('mousemove', move);
                    window.addEventListener('mouseup', up);
                  }}
                  onKeyDown={(e) => {
                    const step = Math.max(1, designAids?.nudgeStepPx || 1);
                    if (e.key === 'ArrowUp') { e.preventDefault(); onChangeContentOffset?.((contentOffsetXPx ?? 0), (contentOffsetYPx ?? 0) - step); }
                    if (e.key === 'ArrowDown') { e.preventDefault(); onChangeContentOffset?.((contentOffsetXPx ?? 0), (contentOffsetYPx ?? 0) + step); }
                    if (e.key === 'ArrowLeft') { e.preventDefault(); onChangeContentOffset?.((contentOffsetXPx ?? 0) - step, (contentOffsetYPx ?? 0)); }
                    if (e.key === 'ArrowRight') { e.preventDefault(); onChangeContentOffset?.((contentOffsetXPx ?? 0) + step, (contentOffsetYPx ?? 0)); }
                  }}
                  tabIndex={0}
                >
                  {/* Design Aids Overlays */}
                  {designAids?.enabled && (
                    <>
                      {designAids.showRulers && (
                        <div aria-hidden className="pointer-events-none" style={{ position: 'absolute', left: - (contentOffsetXPx ?? 0), top: - (contentOffsetYPx ?? 0), right: 0, height: 20, background: 'linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px)', backgroundSize: '40px 20px' }} />
                      )}
                      {designAids.showRulers && (
                        <div aria-hidden className="pointer-events-none" style={{ position: 'absolute', top: - (contentOffsetYPx ?? 0), left: -20 - (contentOffsetXPx ?? 0), width: 20, bottom: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)', backgroundSize: '20px 40px' }} />
                      )}
                      {designAids.showGrid && (
                        <div aria-hidden className="pointer-events-none" style={{ position: 'absolute', inset: '-2000px', backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)`, backgroundSize: `${Math.max(2, designAids.gridSizePx || 8)}px ${Math.max(2, designAids.gridSizePx || 8)}px` }} />
                      )}
                    </>
                  )}
                  {/* Optional plain text preview block (shown only when TEXT format) */}
                  {rxPrintFormat === 'TEXT' && (
                    <div className="rx-text p-4 text-sm whitespace-pre-wrap font-mono border rounded mb-3">
                      {(() => {
                        const headerLines = [
                          'PRESCRIPTION',
                          `${new Date().toLocaleString()}`
                        ];
                        const patientLines = [
                          `Patient: ${visitData?.patient?.name || patientData?.name || '—'}`,
                          `Patient ID: ${visitData?.patient?.id || patientData?.id || '—'}`,
                        ];
                        const medsLines = (items || []).map((it: any, idx: number) => {
                          const parts: string[] = [];
                          parts.push(`${idx + 1}. ${it.drugName}`);
                          if (it.dosage) parts.push(`Dosage: ${it.dosage}${it.dosageUnit ? ' ' + it.dosageUnit.toLowerCase() : ''}`);
                          parts.push(`Freq: ${(it.frequency || '').replaceAll('_',' ').toLowerCase()}`);
                          parts.push(`Duration: ${it.duration} ${String(it.durationUnit || '').toLowerCase()}`);
                          if (it.instructions) parts.push(`Notes: ${it.instructions}`);
                          return parts.join(' | ');
                        });
                        const sections: string[] = [];
                        sections.push(headerLines.join('\n'));
                        sections.push('');
                        sections.push(patientLines.join('\n'));
                        sections.push('');
                        sections.push('Rx:');
                        sections.push(medsLines.length ? medsLines.join('\n') : '—');
                        if ((followUpInstructions || '').trim().length > 0) {
                          sections.push('');
                          sections.push('Follow-up Instructions:');
                          sections.push(tt('followUpInstructions', followUpInstructions));
                        }
                        return sections.join('\n');
                      })()}
                    </div>
                  )}


                  {/* Patient Info */}
                  {includeSections.patientInfo && (
                  <div className="flex justify-between text-sm py-3">
                    <div>
                      <div className="text-gray-600">Patient</div>
                      <div className="font-medium">{visitData?.patient?.name || patientData?.name || '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Patient ID</div>
                      <div className="font-medium">{visitData?.patient?.id || patientData?.id || '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Gender / DOB</div>
                      <div className="font-medium">{(visitData?.patient?.gender || patientData?.gender || '—')} {(visitData?.patient?.dob || patientData?.dob) ? `• ${new Date(visitData?.patient?.dob || patientData?.dob).toLocaleDateString()}` : ''}</div>
                    </div>
                  </div>
                  )}

                {/* Vitals (manual override) */}
                {includeSections.vitals && (vitalsHeightCm || vitalsWeightKg || vitalsBmi || vitalsBpSys || vitalsBpDia || vitalsPulse) && (
                  <div className="py-3">
                    <div className="font-semibold mb-1">Vitals</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                      {((vitalsHeightCm !== '' && vitalsHeightCm != null) || visitVitals?.height || visitVitals?.heightCm) && (
                        <div><span className="text-gray-600 mr-1">Height:</span><span className="font-medium">{(vitalsHeightCm !== '' && vitalsHeightCm != null) ? vitalsHeightCm : (visitVitals?.height || visitVitals?.heightCm)} cm</span></div>
                      )}
                      {((vitalsWeightKg !== '' && vitalsWeightKg != null) || visitVitals?.weight) && (
                        <div><span className="text-gray-600 mr-1">Weight:</span><span className="font-medium">{(vitalsWeightKg !== '' && vitalsWeightKg != null) ? vitalsWeightKg : (visitVitals?.weight)} kg</span></div>
                      )}
                      {(() => {
                        const h = (vitalsHeightCm !== '' && vitalsHeightCm != null) ? Number(vitalsHeightCm) : Number(visitVitals?.height || visitVitals?.heightCm || 0);
                        const w = (vitalsWeightKg !== '' && vitalsWeightKg != null) ? Number(vitalsWeightKg) : Number(visitVitals?.weight || 0);
                        const bmi = (vitalsBmi !== '' && vitalsBmi != null) ? vitalsBmi : (h > 0 && w > 0 ? Number((w / ((h/100)*(h/100))).toFixed(1)) : '');
                        return bmi !== '' ? (<div><span className="text-gray-600 mr-1">BMI:</span><span className="font-medium">{bmi}</span></div>) : null;
                      })()}
                      {(((vitalsBpSys !== '' && vitalsBpSys != null) || (vitalsBpDia !== '' && vitalsBpDia != null)) || visitVitals?.systolicBP || visitVitals?.diastolicBP || visitVitals?.bpSys || visitVitals?.bpDia) && (
                        <div><span className="text-gray-600 mr-1">BP:</span><span className="font-medium">{(vitalsBpSys !== '' && vitalsBpSys != null) ? vitalsBpSys : (visitVitals?.systolicBP || visitVitals?.bpSys || visitVitals?.bpS) || '—'}/{(vitalsBpDia !== '' && vitalsBpDia != null) ? vitalsBpDia : (visitVitals?.diastolicBP || visitVitals?.bpDia || visitVitals?.bpD) || '—'} mmHg</span></div>
                      )}
                      {((vitalsPulse !== '' && vitalsPulse != null) || visitVitals?.heartRate || visitVitals?.pulse || visitVitals?.pr) && (
                        <div><span className="text-gray-600 mr-1">PR:</span><span className="font-medium">{(vitalsPulse !== '' && vitalsPulse != null) ? vitalsPulse : (visitVitals?.heartRate || visitVitals?.pulse || visitVitals?.pr)} bpm</span></div>
                      )}
                    </div>
                  </div>
                )}

                {/* Diagnosis */}
                {includeSections.diagnosis && (
                  <div className="py-3">
                    <div className="font-semibold mb-1">Diagnosis</div>
                    <div className="text-sm">{(diagnosis?.trim() || '').length > 0 ? tt('diagnosis', diagnosis) : '—'}</div>
                  </div>
                )}

                {/* Chief Complaints */}
                {(chiefComplaints?.trim()?.length > 0) && (
                  <div className="py-3">
                    <div className="font-semibold mb-1">Chief Complaints</div>
                    <div className="text-sm whitespace-pre-wrap">{tt('chiefComplaints', chiefComplaints)}</div>
                  </div>
                )}

                {/* Histories */}
                {((pastHistory?.trim()?.length || medicationHistory?.trim()?.length || menstrualHistory?.trim()?.length || exTriggers?.trim()?.length || exPriorTx?.trim()?.length)) && (
                  <div className="py-3">
                    <div className="font-semibold mb-1">History</div>
                    <div className="space-y-1 text-sm">
                      {pastHistory?.trim()?.length ? (<div><span className="text-gray-600">Past:</span> {tt('pastHistory', pastHistory)}</div>) : null}
                      {medicationHistory?.trim()?.length ? (<div><span className="text-gray-600">Medication:</span> {tt('medicationHistory', medicationHistory)}</div>) : null}
                      {menstrualHistory?.trim()?.length ? (<div><span className="text-gray-600">Menstrual:</span> {tt('menstrualHistory', menstrualHistory)}</div>) : null}
                      {exTriggers?.trim()?.length ? (<div><span className="text-gray-600">Triggers:</span> {tt('triggers', exTriggers)}</div>) : null}
                      {exPriorTx?.trim()?.length ? (<div><span className="text-gray-600">Prior Treatments:</span> {tt('priorTreatments', exPriorTx)}</div>) : null}
                    </div>
                  </div>
                )}

                {/* Family History */}
                {(familyHistoryDM || familyHistoryHTN || familyHistoryThyroid || familyHistoryOthers?.trim()?.length) && (
                  <div className="py-3">
                    <div className="font-semibold mb-1">Family History</div>
                    <div className="text-sm">{[familyHistoryDM ? 'DM' : null, familyHistoryHTN ? 'HTN' : null, familyHistoryThyroid ? 'Thyroid disorder' : null, familyHistoryOthers?.trim()?.length ? tt('familyHistoryOthers', familyHistoryOthers) : null].filter(Boolean).join(', ')}</div>
                  </div>
                )}

                {/* Medications */}
                {includeSections.medications && (
                  <div className={`py-3 ${breakBeforeMedications ? 'pb-before-page' : ''}`}>
                    <div className="font-semibold mb-2">Rx</div>
                    {validItems.length > 0 ? (
                      rxPrintFormat === 'TABLE' ? (
                        <div className={`overflow-auto border rounded ${avoidBreakInsideTables ? 'pb-avoid-break' : ''}`}>
                          <table className="min-w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium">Medicine</th>
                                <th className="px-3 py-2 text-left font-medium">Frequency (0-1-0)</th>
                                <th className="px-3 py-2 text-left font-medium">When</th>
                                <th className="px-3 py-2 text-left font-medium">Duration</th>
                                <th className="px-3 py-2 text-left font-medium">Instructions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {validItems.map((it: any, idx: number) => (
                                <tr key={`rx-row-${idx}`} className="border-t">
                                  <td className="px-3 py-2">{it.drugName}</td>
                                  <td className="px-3 py-2">{(it.dosePattern || '').trim() || it.frequency.replaceAll('_',' ').toLowerCase()}</td>
                                  <td className="px-3 py-2">{it.timing || '—'}</td>
                                  <td className="px-3 py-2">{`${it.duration ?? '—'} ${String(it.durationUnit || '').toLowerCase()}`}</td>
                                  <td className="px-3 py-2">{it.instructions ? tt(`items.${idx}.instructions`, it.instructions) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <ol className="list-decimal ml-5 space-y-1 text-sm">
                          {validItems.map((it: any, idx: number) => (
                            <li key={`rx-${idx}`}>
                              <span className="font-medium">{it.drugName}</span>
                              {it.dosage && ` ${it.dosage}${it.dosageUnit ? ' ' + it.dosageUnit.toLowerCase() : ''}`} — {it.frequency.replaceAll('_',' ').toLowerCase()} × {it.duration}{' '}{it.durationUnit.toLowerCase()}
                              {it.instructions && <span> — {tt(`items.${idx}.instructions`, it.instructions)}</span>}
                            </li>
                          ))}
                        </ol>
                      )
                    ) : (
                      <div className="text-sm text-gray-600">—</div>
                    )}
                  </div>
                )}

                {/* Topicals removed */}

        {/* Post Procedure removed */}

                {/* Investigations */}
                {(Array.isArray(investigations) && investigations.length > 0) && (
                  <div className={`py-3 ${breakBeforeInvestigations ? 'pb-before-page' : ''}`}>
                    <div className="font-semibold mb-1">Investigations</div>
                    <ul className="list-disc ml-5 text-sm space-y-1">
                      {investigations.map((inv, i) => (<li key={inv}>{tt(`investigations.${i}`, inv)}</li>))}
                    </ul>
                  </div>
                )}

                {/* Procedure Planned */}
        {(procedurePlanned?.trim()?.length > 0) && (
                  <div className="py-3">
                    <div className="font-semibold mb-1">Procedure Planned</div>
                    <div className="text-sm">{tt('procedurePlanned', procedurePlanned)}</div>
                  </div>
                )}

                {/* Custom Sections */}
                {customSections.length > 0 && customSections.map((s, i) => (
                  (s.title?.trim() || s.content?.trim()) ? (
                    <div key={`cs-${s.id}`} className="py-3">
                      <div className="font-semibold mb-1">{tt(`custom.${i}.title`, s.title)}</div>
                      <div className="text-sm whitespace-pre-wrap">{tt(`custom.${i}.content`, s.content)}</div>
                    </div>
                  ) : null
                ))}

                {/* Follow-up Instructions */}
                {(followUpInstructions?.trim()?.length) ? (
                  <div className={`py-3 ${breakBeforeFollowUp ? 'pb-before-page' : ''}`}>
                    <div className="font-semibold mb-1">Follow-up Instructions</div>
                    <div className="text-sm whitespace-pre-wrap">{tt('followUpInstructions', followUpInstructions)}</div>
                  </div>
                ) : null}

                {/* Signature */}
                {includeSections.doctorSignature && (
                  <div className={`pt-6 mt-4 border-t ${breakBeforeSignature ? 'pb-before-page' : ''}`}>
                    <div className="flex justify-end text-sm">
                      <div className="text-right">
                        <div className="h-10" />
                        <div className="font-medium">Dr. {visitData?.doctor?.firstName} {visitData?.doctor?.lastName}</div>
                        <div className="text-gray-600">Signature</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
              </div>
            </div>
            {/* Right Sidebar Controls */}
            <div className="print:hidden w-full sm:w-96 shrink-0 border-l h-full overflow-auto">
              <div className="p-4 space-y-4">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-sm font-medium text-blue-900 mb-1">📋 Print Settings Tip</div>
                  <div className="text-xs text-blue-700">
                    To remove browser headers/footers: In your browser's print dialog, go to <strong>More settings</strong> → 
                    turn OFF <strong>"Headers and footers"</strong> for a clean prescription print.
                  </div>
                </div>
                <div className="space-y-3">
                  <Button variant="ghost" size="sm" onClick={() => setAutoPreview(v => !v)} className="w-full justify-between">
                    <span>{autoPreview ? 'Live Preview: On' : 'Live Preview: Off'}</span>
                  </Button>
                  
                  {/* Pagination Engine Toggle */}
                  <div className="space-y-2">
                    <span className="text-sm text-gray-700 font-medium">Pagination Engine</span>
                    <div className="flex gap-2">
                      <Button 
                        variant={paginationEngine === 'custom' ? 'default' : 'outline'} 
                        size="sm" 
                        onClick={() => {
                          setPaginationEngine('custom');
                          setCurrentPreviewPage(1);
                        }}
                        className="flex-1"
                        title="Custom pagination (manual overflow handling)"
                      >
                        Custom
                      </Button>
                      <Button 
                        variant={paginationEngine === 'pagedjs' ? 'default' : 'outline'} 
                        size="sm" 
                        onClick={() => {
                          setPaginationEngine('pagedjs');
                          setCurrentPreviewPage(1);
                        }}
                        className="flex-1"
                        title="Paged.js (automatic pagination library)"
                      >
                        Paged.js {pagedJsProcessing && '⏳'}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">
                      {paginationEngine === 'custom' 
                        ? 'Using custom overflow handling' 
                        : 'Using Paged.js library for smart pagination'}
                    </p>
                    {/* Recommendation for multi-page documents */}
                    {paginationEngine === 'custom' && totalPreviewPages >= 3 && (
                      <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                        <div className="font-medium mb-1">💡 Recommendation</div>
                        <div>For documents with 3+ pages, consider using <strong>Paged.js</strong> for better margin awareness and page break control.</div>
                      </div>
                    )}
                  </div>

                  {/* View Mode Toggle - Only show for custom engine */}
                  {paginationEngine === 'custom' && (
                  <div className="space-y-2">
                    <span className="text-sm text-gray-700 font-medium">View Mode</span>
                    <div className="flex gap-2">
                      <Button 
                        variant={previewViewMode === 'scroll' ? 'default' : 'outline'} 
                        size="sm" 
                        onClick={() => {
                          setPreviewViewMode('scroll');
                          setCurrentPreviewPage(1);
                        }}
                        className="flex-1"
                      >
                        Scroll
                      </Button>
                      <Button 
                        variant={previewViewMode === 'paginated' ? 'default' : 'outline'} 
                        size="sm" 
                        onClick={() => {
                          setPreviewViewMode('paginated');
                          setCurrentPreviewPage(1);
                        }}
                        className="flex-1"
                      >
                        Pages
                      </Button>
                    </div>
                  </div>
                  )}

                  {/* Pagination Controls - Show in paginated mode or with Paged.js */}
                  {((previewViewMode === 'paginated' && paginationEngine === 'custom') || paginationEngine === 'pagedjs') && totalPreviewPages > 1 && (
                    <div className="space-y-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Page Navigation</span>
                        <span className="text-xs text-gray-600">{currentPreviewPage} / {totalPreviewPages}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setCurrentPreviewPage(p => Math.max(1, p - 1))}
                          disabled={currentPreviewPage <= 1}
                          className="flex-1"
                        >
                          ← Prev
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setCurrentPreviewPage(p => Math.min(totalPreviewPages, p + 1))}
                          disabled={currentPreviewPage >= totalPreviewPages}
                          className="flex-1"
                        >
                          Next →
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">Go to:</span>
                        <input 
                          type="number" 
                          min={1} 
                          max={totalPreviewPages} 
                          value={currentPreviewPage}
                          onChange={(e) => {
                            const page = parseInt(e.target.value, 10);
                            if (page >= 1 && page <= totalPreviewPages) {
                              setCurrentPreviewPage(page);
                            }
                          }}
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <span>Zoom</span>
                    <input className="flex-1" type="range" min={0.6} max={1.4} step={0.05} value={previewZoom} onChange={(e) => setPreviewZoom(Number(e.target.value))} />
                    <span className="w-10 text-right">{Math.round(previewZoom * 100)}%</span>
                  </div>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div className="flex items-center justify-between">
                      <label className="block">Top margin</label>
                      <span className="tabular-nums">{effectiveTopMarginMm} mm</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={300}
                      step={1}
                      value={overrideTopMarginPx ?? (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.topMarginPx ?? printTopMarginPx ?? 150) : (printTopMarginPx ?? 150))}
                      onChange={(e) => setOverrideTopMarginPx(Number(e.target.value))}
                    />
                    <div className="flex items-center justify-between">
                      <label className="block">Bottom margin</label>
                      <span className="tabular-nums">{effectiveBottomMarginMm} mm</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      step={1}
                      value={overrideBottomMarginPx ?? (activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.bottomMarginPx ?? printBottomMarginPx ?? 45) : (printBottomMarginPx ?? 45))}
                      onChange={(e) => setOverrideBottomMarginPx(Number(e.target.value))}
                    />
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => { setOverrideTopMarginPx(null); setOverrideBottomMarginPx(null); }}>Reset margins</Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-sm text-gray-700">Print Format</span>
                    <Select value={rxPrintFormat} onValueChange={(v: 'TEXT' | 'TABLE') => setRxPrintFormat(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TABLE">Table</SelectItem>
                        <SelectItem value="TEXT">Text</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-sm text-gray-700">Page Breaks</span>
                    <div className="space-y-2 text-sm text-gray-700">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={breakBeforeMedications} onChange={(e) => setBreakBeforeMedications(e.target.checked)} /> Break before Rx</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={breakBeforeInvestigations} onChange={(e) => setBreakBeforeInvestigations(e.target.checked)} /> Break before Investigations</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={breakBeforeFollowUp} onChange={(e) => setBreakBeforeFollowUp(e.target.checked)} /> Break before Follow-up</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={breakBeforeSignature} onChange={(e) => setBreakBeforeSignature(e.target.checked)} /> Break before Signature</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={avoidBreakInsideTables} onChange={(e) => setAvoidBreakInsideTables(e.target.checked)} /> Avoid breaks inside tables</label>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-sm text-gray-700">Printer profile</span>
                    <Select value={activeProfileId || ''} onValueChange={(v: string) => setActiveProfileId(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select profile" />
                      </SelectTrigger>
                      <SelectContent>
                        {printerProfiles.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}{p.isDefault ? ' (Default)' : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="text-sm text-gray-700 flex items-center gap-2">
                    <input type="checkbox" checked={showRefillStamp} onChange={(e) => setShowRefillStamp(e.target.checked)} />
                    Refill stamp
                  </label>
                </div>
                <div className="pt-2 grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
                  <Button variant="outline" onClick={() => void openInteractions()}>Interactions</Button>
                  <Button variant="secondary" onClick={async () => {
                    try {
                      const prescId = visitData?.prescriptionId || createdPrescriptionIdRef?.current || undefined;
                      if (!prescId) return;
                      await apiClient.sharePrescription(prescId, { channel: 'EMAIL', to: (visitData?.patient?.email || '') as string, message: 'Your prescription is ready.' });
                      toast({ title: 'Email sent', description: 'Prescription email queued.' });
                    } catch (e) {
                      toast({ variant: 'destructive', title: 'Email failed', description: 'Could not send email.' });
                    }
                  }}>Email</Button>
                  <Button variant="secondary" onClick={async () => {
                    try {
                      const prescId = visitData?.prescriptionId || createdPrescriptionIdRef?.current || undefined;
                      if (!prescId) return;
                      const phone = (visitData?.patient?.phone || '').replace(/\s+/g, '');
                      await apiClient.sharePrescription(prescId, { channel: 'WHATSAPP', to: phone.startsWith('+') ? phone : `+91${phone}`, message: 'Your prescription is ready.' });
                      toast({ title: 'WhatsApp queued', description: 'WhatsApp message queued.' });
                    } catch (e) {
                      toast({ variant: 'destructive', title: 'WhatsApp failed', description: 'Could not send message.' });
                    }
                  }}>WhatsApp</Button>
                  <Button variant="ghost" className="col-span-2" onClick={() => document.body.classList.toggle('high-contrast')}>High contrast</Button>
                  <Button className="col-span-1" onClick={() => {
                    try { window.print(); } catch (e) { console.error('Browser print failed', e); }
                  }}>Print</Button>
                  <Button className="col-span-1" onClick={async () => {
                    try {
                      const prescId = visitData?.prescriptionId || createdPrescriptionIdRef?.current || undefined;
                      if (!prescId) return;
                      const { fileUrl, fileName } = await apiClient.generatePrescriptionPdf(prescId, {} as any);
                      try { await apiClient.recordPrescriptionPrintEvent(prescId, { eventType: 'PRINT_PREVIEW_PDF' }); } catch {}
                      const a = document.createElement('a');
                      a.href = fileUrl;
                      a.download = fileName || 'prescription.pdf';
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                    } catch (e) {
                      console.error('PDF generation failed', e);
                      toast({ variant: 'destructive', title: 'PDF failed', description: 'Could not generate PDF. Use Print instead.' });
                    }
                  }}>Download PDF</Button>
            </div>
            </div>
            </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={interactionsOpen} onOpenChange={setInteractionsOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Interaction Summary</DialogTitle>
              <DialogDescription>Preview potential interactions based on current items.</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto text-sm">
              {interactions.length === 0 ? (
                <div className="text-gray-600">No interactions found.</div>
              ) : (
                <ul className="space-y-2">
                  {interactions.map((it, idx) => (
                    <li key={`ix-${idx}`} className="border rounded p-2">
                      <div className="font-medium">{it.drug1} × {it.drug2}</div>
                      <div className="text-xs text-gray-600">Severity: {it.severity}</div>
                      <div className="mt-1">{it.description}</div>
                      {it.recommendation && <div className="mt-1 text-xs text-gray-700">Recommendation: {it.recommendation}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInteractionsOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* New Template Dialog */}
        <Dialog open={newTemplateOpen} onOpenChange={(open: boolean) => {
          setNewTemplateOpen(open);
          if (!open) {
            setNewTplName('');
            setNewTplChiefComplaints('');
            setNewTplDiagnosis('');
            setNewTplExObjective('');
            setNewTplSkinType('');
            setNewTplMorphology(new Set());
            setNewTplDistribution(new Set());
            setNewTplItchScore('');
            setNewTplSkinConcerns(new Set());
            setNewTplItems([{ drugName: '', dosage: '', dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: '', durationUnit: 'DAYS', route: '', instructions: '' }]);
          }
        }}>
          <DialogContent className="sm:max-w-5xl xl:max-w-6xl w-full max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Create New Template</DialogTitle>
              <DialogDescription>Define a reusable template for Chief Complaints, Diagnosis, On Examination, and Treatment.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-600">Name</label>
                <Input value={newTplName} onChange={(e) => setNewTplName(e.target.value)} placeholder="e.g., Acne follow-up (Derm)" />
              </div>
              <div>
                <label className="text-xs text-gray-600">Chief Complaints</label>
                <Textarea rows={2} value={newTplChiefComplaints} onChange={(e) => setNewTplChiefComplaints(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-600">Diagnosis</label>
                <Input value={newTplDiagnosis} onChange={(e) => setNewTplDiagnosis(e.target.value)} placeholder="e.g., Acne vulgaris" />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">On Examination</div>
                <div>
                  <label className="text-xs text-gray-600">General Appearance</label>
                  <Textarea rows={2} value={newTplExObjective} onChange={(e) => setNewTplExObjective(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">Skin Type</label>
                    <Select value={newTplSkinType} onValueChange={setNewTplSkinType}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {FITZPATRICK.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-1">
                    <label className="text-xs text-gray-600">Itch Score (0-10)</label>
                    <Input value={newTplItchScore} onChange={(e) => setNewTplItchScore(e.target.value)} placeholder="e.g., 4" />
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-600 mb-1">Morphology</div>
                  <div className="flex flex-wrap gap-2">
                    {MORPHOLOGY.map(m => (
                      <Button key={m} type="button" variant={newTplMorphology.has(m) ? 'default' : 'outline'} size="sm" onClick={() => toggleSet(newTplMorphology, m, setNewTplMorphology)}>{m}</Button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-600 mb-1">Distribution</div>
                  <div className="flex flex-wrap gap-2">
                    {DISTRIBUTION.map(d => (
                      <Button key={d} type="button" variant={newTplDistribution.has(d) ? 'default' : 'outline'} size="sm" onClick={() => toggleSet(newTplDistribution, d, setNewTplDistribution)}>{d}</Button>
                    ))}
                  </div>
                </div>
                {/* Triggers and prior treatments removed from template form */}
                <div>
                  <div className="text-[11px] text-gray-600 mb-1">Skin Concerns</div>
                  <div className="flex flex-wrap gap-2">
                    {SKIN_CONCERNS.map((c) => (
                      <Button key={c} type="button" variant={newTplSkinConcerns.has(c) ? 'default' : 'outline'} size="sm" onClick={() => toggleSet(newTplSkinConcerns, c, setNewTplSkinConcerns)}>{c}</Button>
                    ))}
                  </div>
                </div>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-700">Add Medicine</label>
                  <Input 
                    key="newtpl-drug-search"
                    placeholder="Search drug name or brand (min 2 chars)" 
                    value={newTplDrugQuery}
                    onChange={(e) => setNewTplDrugQuery(e.target.value)}
                  />
                  {newTplDrugQuery.trim().length >= 2 && (
                    <div className="mt-2 border rounded divide-y max-h-48 overflow-auto" onMouseDown={(e) => e.preventDefault()}>
                      {newTplLoadingDrugs && (
                        <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
                      )}
                      {!newTplLoadingDrugs && newTplDrugResults.length === 0 && (
                        <div className="px-3 py-2 text-xs text-gray-500">No results</div>
                      )}
                      {!newTplLoadingDrugs && newTplDrugResults.length > 0 && (
                        <>
                          {newTplDrugResults.map((d: any, index: number) => (
                            <div 
                              key={`${d.id}-${d.name}`} 
                              className={`px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 ${
                                index === 0 ? 'bg-green-50 border-l-4 border-l-green-500' : 
                                index < 3 ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                              }`}
                              onMouseEnter={() => prefetchDrugStockById(d.id)}
                            >
                              <div className="flex-1">
                                <div className="font-medium">{d.name}</div>
                                <div className="text-xs text-gray-500">{d.manufacturer || d.manufacturerName || d.genericName || ''} {d.packSizeLabel ? ` • ${d.packSizeLabel}` : ''}</div>
                              </div>
                              <Button size="sm" variant="outline" onClick={() => { addItemFromDrugToNewTpl(d); }}>Add</Button>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-600">Total items: {newTplItems.length}</div>
                  <Button size="sm" variant="outline" onClick={addNewTplItem}>Add Row</Button>
                </div>
                <div className="overflow-auto border rounded">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Medicine</th>
                        <th className="px-3 py-2 text-left font-medium">Frequency (0-1-0)</th>
                        <th className="px-3 py-2 text-left font-medium">When</th>
                        <th className="px-3 py-2 text-left font-medium">Duration</th>
                        <th className="px-3 py-2 text-left font-medium">Instructions</th>
                        <th className="px-3 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newTplItems.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-3 text-center text-gray-500">No items added yet</td>
                        </tr>
                      )}
                      {newTplItems.map((it: any, idx: number) => (
                        <tr key={`newtpl-row-${idx}`} className="border-t">
                          <td className="px-3 py-2 align-top">
                            <Input value={it.drugName} onChange={(e) => updateNewTplItem(idx, { drugName: e.target.value })} placeholder="Medicine name" />
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="grid grid-cols-2 gap-1">
                              <Input value={it.dosePattern || ''} onChange={(e) => {
                                const nextPattern = e.target.value;
                                const inferred = inferFrequencyFromDosePattern(nextPattern);
                                if (inferred) {
                                  updateNewTplItem(idx, { dosePattern: nextPattern, frequency: inferred });
                                } else {
                                  updateNewTplItem(idx, { dosePattern: nextPattern });
                                }
                              }} placeholder="e.g., 1-0-1" />
                              <Select value={it.frequency} onValueChange={(v: Frequency) => updateNewTplItem(idx, { frequency: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {['ONCE_DAILY','TWICE_DAILY','THREE_TIMES_DAILY','FOUR_TIMES_DAILY','AS_NEEDED','WEEKLY','MONTHLY'].map(f => (
                                    <SelectItem key={f} value={f as Frequency}>{f.replaceAll('_',' ')}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Select value={it.timing || ''} onValueChange={(v: string) => updateNewTplItem(idx, { timing: v })}>
                              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                              <SelectContent>
                                {['AM','PM','After Breakfast','After Lunch','After Dinner','Before Meals','QHS','HS','With Food','Empty Stomach'].map(t => (
                                  <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="grid grid-cols-2 gap-1">
                              <Input type="number" value={it.duration ?? ''} onChange={(e) => updateNewTplItem(idx, { duration: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="#" />
                              <Select value={it.durationUnit} onValueChange={(v: DurationUnit) => updateNewTplItem(idx, { durationUnit: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {['DAYS','WEEKS','MONTHS','YEARS'].map(u => (
                                    <SelectItem key={u} value={u as DurationUnit}>{u}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Input value={it.instructions || ''} onChange={(e) => updateNewTplItem(idx, { instructions: e.target.value })} placeholder="e.g., Avoid alcohol" />
                          </td>
                          <td className="px-3 py-2 align-top text-right">
                            <Button size="sm" variant="outline" onClick={() => removeNewTplRxItem(idx)}>Remove</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewTemplateOpen(false)}>Cancel</Button>
              <Button
                disabled={creatingTemplate}
                onClick={async () => {
                  const name = newTplName.trim();
                  if (!name) {
                    toast({ variant: 'warning', title: 'Name required', description: 'Please enter a template name.' });
                    return;
                  }
                  const payload: any = {
                    name,
                    description: '',
                    items: newTplItems.filter(it => (it.drugName || '').trim()).map(it => ({
                      drugName: it.drugName,
                      dosage: it.dosage === '' ? undefined : Number(it.dosage),
                      dosageUnit: it.dosageUnit || 'TABLET',
                      frequency: it.frequency || 'ONCE_DAILY',
                      duration: it.duration === '' ? undefined : Number(it.duration),
                      durationUnit: it.durationUnit || 'DAYS',
                      route: it.route || undefined,
                      instructions: it.instructions || undefined,
                    })),
                    category: 'Dermatology',
                    specialty: 'Dermatology',
                    isPublic: true,
                    metadata: {
                      chiefComplaints: newTplChiefComplaints || undefined,
                      diagnosis: newTplDiagnosis || undefined,
                      examination: {
                        generalAppearance: newTplExObjective || undefined,
                        dermatology: {
                          skinType: newTplSkinType || undefined,
                          morphology: Array.from(newTplMorphology),
                          distribution: Array.from(newTplDistribution),
                          acneSeverity: undefined,
                          itchScore: newTplItchScore ? Number(newTplItchScore) : undefined,
                          skinConcerns: Array.from(newTplSkinConcerns),
                        }
                      },
                    },
                  };
                  try {
                    setCreatingTemplate(true);
                    const doCreate = async () => {
                      await apiClient.createPrescriptionTemplate(payload);
                      await loadTemplates();
                      toast({ variant: 'success', title: 'Template created', description: 'New template is ready to use.' });
                      setNewTemplateOpen(false);
                    };
                    await doCreate();
                  } catch (e: any) {
                    showTemplateCreateError(e, async () => {
                      try {
                        await apiClient.createPrescriptionTemplate(payload);
                        await loadTemplates();
                        toast({ variant: 'success', title: 'Template created', description: 'New template is ready to use.' });
                        setNewTemplateOpen(false);
                      } catch (err) {
                        showTemplateCreateError(err);
                      }
                    });
                  } finally {
                    setCreatingTemplate(false);
                  }
                }}
              >
                Create Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={fieldTemplatePromptOpen}
          onOpenChange={(open: boolean) => {
            setFieldTemplatePromptOpen(open);
            if (!open) setFieldTemplateName('');
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Fields as Template</DialogTitle>
              <DialogDescription>Save only Chief Complaints, Diagnosis, and Examination as a reusable template on this device.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="E.g., Derm Fields: Acne follow-up"
                value={fieldTemplateName}
                onChange={(e) => setFieldTemplateName(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setFieldTemplatePromptOpen(false);
                  setFieldTemplateName('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const trimmed = fieldTemplateName.trim();
                  if (!trimmed) {
                    toast({
                      variant: 'warning',
                      title: 'Template name required',
                      description: 'Please enter a name for the fields template.',
                    });
                    return;
                  }
                  await persistLocalFieldTemplate(trimmed);
                  setFieldTemplatePromptOpen(false);
                  setFieldTemplateName('');
                }}
              >
                Save Fields Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={confirmPharmacy.open} onOpenChange={(open: boolean) => setConfirmPharmacy((prev) => ({ ...prev, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Go to Pharmacy?</DialogTitle>
              <DialogDescription>
                {confirmPharmacy.summary?.medicationsCount || 0} medications were added to this prescription. Continue to
                the pharmacy module to bill them now?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmPharmacy({ open: false, prescriptionId: '', summary: null })}
              >
                Stay Here
              </Button>
              <Button
                onClick={() => {
                  if (!confirmPharmacy.prescriptionId) {
                    setConfirmPharmacy({ open: false, prescriptionId: '', summary: null });
                    return;
                  }
                  const url = `/dashboard/pharmacy?patientId=${encodeURIComponent(patientId)}&prescriptionId=${encodeURIComponent(confirmPharmacy.prescriptionId)}&doctorId=${encodeURIComponent(doctorId)}`;
                  window.location.href = url;
                }}
              >
                Yes, go to Pharmacy
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 1MG Order Dialog (placeholder) */}
        <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
          <DialogContent className="sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>Order via 1MG</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="lg:col-span-2 max-h-[60vh] overflow-auto mt-1 pr-1">
                {validItems.map((it, idx) => (
                  <div key={`map-${idx}`} className="border rounded p-2 mb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{it.drugName}</div>
                        <div className="text-xs text-gray-500">{it.frequency?.replaceAll('_',' ')} • {it.duration} {it.durationUnit?.toLowerCase()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">Qty</span>
                        <Input className="h-8 w-20" type="number" min={1} value={oneMgMap[idx]?.qty ?? 1} onChange={(e) => updateOneMgQty(idx, Number(e.target.value) || 1)} />
                      </div>
                    </div>
                    <div className="mt-2">
                      <Input placeholder="Search 1MG product" value={oneMgMap[idx]?.q || ''} onChange={(e) => void handleOneMgSearch(idx, e.target.value)} />
                      {oneMgMap[idx]?.loading && (<div className="text-xs text-gray-500 mt-1">Searching…</div>)}
                      {!oneMgMap[idx]?.loading && (oneMgMap[idx]?.results?.length || 0) > 0 && (
                        <div className="mt-2 border rounded divide-y max-h-40 overflow-auto">
                          {oneMgMap[idx]?.results?.map((p: any) => (
                            <div key={`${p.sku || p.id || p.code}`} className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer" onClick={() => selectOneMgProduct(idx, p)}>
                              <div className="font-medium">{p.name || p.title}</div>
                              <div className="text-xs text-gray-500">{p.manufacturer || ''} {p.mrp ? `• ₹${p.mrp}` : ''}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {oneMgMap[idx]?.selection && (
                      <div className="mt-2 text-xs">
                        Selected: <span className="font-medium">{oneMgMap[idx].selection?.name}</span> {oneMgMap[idx].selection?.price ? `• ₹${oneMgMap[idx].selection?.price}` : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="lg:col-span-1">
                <div className="border rounded p-3 sticky top-2">
                  <div className="font-medium mb-2">Cart Summary</div>
                  <div className="space-y-1 text-sm max-h-[40vh] overflow-auto">
                    {oneMgMap.filter((r) => !!r.selection).length === 0 && (<div className="text-xs text-gray-500">No items selected yet</div>)}
                    {oneMgMap.map((r, i) => r.selection ? (
                      <div key={`sel-${i}`} className="flex items-center justify-between">
                        <div className="mr-2 truncate">
                          <div className="font-medium truncate max-w-[180px]" title={r.selection?.name}>{r.selection?.name}</div>
                          <div className="text-xs text-gray-500">SKU: {r.selection?.sku}</div>
                        </div>
                        <div className="text-right">
                          <div>x{r.qty}</div>
                          {r.selection?.price ? <div className="text-xs text-gray-600">₹{(r.selection.price * r.qty).toFixed(2)}</div> : null}
                        </div>
                      </div>
                    ) : null)}
                  </div>
                  <div className="mt-3">
                    <Button variant="outline" size="sm" className="w-full" onClick={checkOneMgInventory} disabled={oneMgChecking || oneMgMap.filter((r) => !!r.selection).length === 0}>{oneMgChecking ? 'Checking…' : 'Check Inventory & Totals'}</Button>
                    {oneMgTotals && (
                      <div className="mt-2 text-sm">
                        <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span>₹{oneMgTotals?.subtotal ?? '—'}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">Delivery</span><span>₹{oneMgTotals?.delivery ?? '—'}</span></div>
                        <div className="flex justify-between font-medium border-t pt-1"><span>Total</span><span>₹{oneMgTotals?.total ?? '—'}</span></div>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button onClick={placeOneMgOrder} disabled={oneMgMap.filter((r) => !!r.selection).length === 0}>Place Order</Button>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOrderOpen(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={templatePromptOpen}
          onOpenChange={(open: boolean) => {
            setTemplatePromptOpen(open);
            if (!open) setTemplateName('');
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save as Template</DialogTitle>
              <DialogDescription>Provide a name to reuse this prescription layout later.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Dermatology follow-up"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setTemplatePromptOpen(false);
                  setTemplateName('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const trimmed = templateName.trim();
                  if (!trimmed) {
                    toast({
                      variant: 'warning',
                      title: 'Template name required',
                      description: 'Please enter a name for the template.',
                    });
                    return;
                  }
                  await persistTemplate(trimmed);
                  setTemplatePromptOpen(false);
                  setTemplateName('');
                }}
              >
                Save Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default React.memo(PrescriptionBuilder);