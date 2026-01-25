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
import { ChevronDown, ChevronUp, Languages, X, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { handleUnauthorizedRedirect } from '@/lib/authRedirect';
import { sortDrugsByRelevance, calculateDrugRelevanceScore, getErrorMessage, formatDob } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { ensureGlobalPrintStyles } from '@/lib/printStyles';
import { FREQUENCY_OPTIONS, DOSE_PATTERN_OPTIONS, inferTimingFromDosePattern } from '@/lib/frequency';
// ID format validation is relaxed; backend accepts string IDs (cuid/uuid/custom)

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

// Use centralized options from lib/frequency

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
  onPreview?: () => void;
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
  onChangeChiefComplaints?: (value: string) => void;
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
    <Card className={`overflow-visible ${highlight ? 'bg-green-50 border-green-300' : ''}`}>
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
      <CardContent id={contentId} className="pt-0 overflow-visible">
        {children}
      </CardContent>
    </Card>
  );
});

function PrescriptionBuilder({ patientId, visitId, doctorId, userRole = 'DOCTOR', onCreated, onPreview, reviewDate, printBgUrl, printTopMarginPx, printLeftMarginPx, printRightMarginPx, printBottomMarginPx, contentOffsetXPx, contentOffsetYPx, onChangeReviewDate, refreshKey, standalone = false, standaloneReason, includeSections: includeSectionsProp, onChangeIncludeSections, ensureVisitId, onChangeChiefComplaints, onChangeContentOffset, designAids, paperPreset, grayscale, bleedSafe, frames, onChangeFrames }: Props) {
  const { toast } = useToast();
  useEffect(() => { ensureGlobalPrintStyles(); }, []);
  const [language, setLanguage] = useState<Language>('EN');
  const [diagnosis, setDiagnosis] = useState('');
  // Removed doctor's personal notes field from UI; retain no top-level notes state
  const [followUpInstructions, setFollowUpInstructions] = useState('');

  const [items, setItems] = useState<PrescriptionItemForm[]>([]);
  const [loadingPrevMeds, setLoadingPrevMeds] = useState(false);
  const [customSections, setCustomSections] = useState<Array<{ id: string; title: string; content: string }>>([]);
  const [procedureMetrics, setProcedureMetrics] = useState<{ device?: string; wavelengthNm?: number | ''; fluenceJcm2?: number | ''; spotSizeMm?: number | ''; pulseMs?: number | ''; shots?: number | ''; cooling?: string; area?: string; peelAgent?: string; peelConcentration?: string; peelContactTimeMin?: number | ''; frosting?: string; needleDepthMm?: string; passes?: number | ''; anesthetic?: string }>({});

  // Allow creating a drug in DB for doctors, admins, pharmacists
  const canAddDrugToDB = useMemo(() => ['ADMIN', 'PHARMACIST', 'DOCTOR'].includes(String(userRole || '').toUpperCase()), [userRole]);
  const [addDrugOpen, setAddDrugOpen] = useState(false);
  const [newDrugForm, setNewDrugForm] = useState<{ name: string; manufacturerName: string; price: string; packSizeLabel: string }>({ name: '', manufacturerName: '', price: '', packSizeLabel: '' });
  const openAddDrugDialog = () => {
    // No global drug query anymore, start with empty form
    setNewDrugForm({ name: '', manufacturerName: '', price: '', packSizeLabel: '' });
    setAddDrugOpen(true);
  };
  const [activeRowIdx, setActiveRowIdx] = useState<number | null>(null);
  const pendingFocusRef = useRef<number | null>(null);
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
      // Immediately add to current prescription items (add a new row)
      const newRow: PrescriptionItemForm = {
        drugName: created?.name || '',
        genericName: '',
        dosage: 1,
        dosageUnit: 'TABLET',
        frequency: 'ONCE_DAILY',
        duration: 5,
        durationUnit: 'DAYS',
        instructions: '',
        route: 'Oral',
        timing: '',
        quantity: 5,
        isGeneric: true,
      };
      setItems(prev => [...prev, newRow]);
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

  // Bubble chief complaint changes up so parent (visit form) stays in sync
  useEffect(() => {
    onChangeChiefComplaints?.(chiefComplaints);
  }, [chiefComplaints, onChangeChiefComplaints]);

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
        description = "You've made too many requests. Please wait a moment and retry.";
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

    if (!navigator.mediaDevices || !(window as any).MediaRecorder) {
      toast({
        variant: 'warning',
        title: 'Voice capture unavailable',
        description: 'Microphone recording is not supported in this browser.',
      });
      return;
    }

    setIsListening(true);
    setActiveVoiceField(fieldName);
    try {
      // Request audio with better quality settings
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true, // Automatically adjust volume
          sampleRate: 48000,     // Higher quality
        }
      });
      streamRef.current = stream;

      const mimeType = (window as any).MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ((window as any).MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } as any : undefined);
      recorderRef.current = recorder;
      // Accumulate chunks instead of sending individually (MediaRecorder chunks aren't standalone files)
      const chunksAccumulator: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (!e.data || e.data.size <= 0) return;
        // Accumulate all chunks - MediaRecorder fragments need to be combined into a complete file
        chunksAccumulator.push(e.data);
        // eslint-disable-next-line no-console
        console.log(`Accumulated chunk ${chunksAccumulator.length}: ${e.data.size} bytes`);
      };
      recorder.onstop = async () => {
        try { stream.getTracks().forEach(t => t.stop()); } catch {}
        streamRef.current = null;
        recorderRef.current = null;
        try {
          // Combine all accumulated chunks into a single complete audio file
          if (chunksAccumulator.length === 0) {
            toast({ variant: 'warning', title: 'No audio recorded', description: 'Please try recording again.' });
            return;
          }

          // Create a single Blob from all chunks
          const completeAudio = new Blob(chunksAccumulator, { type: mimeType || 'audio/webm' });
          // eslint-disable-next-line no-console
          console.log(`Sending complete audio file: ${completeAudio.size} bytes from ${chunksAccumulator.length} chunks`);

          // Upload the complete audio file using the simple transcribe endpoint
          const recordedType: string = mimeType || 'audio/webm';
          const filename = recordedType === 'audio/mp4' ? 'recording.m4a' : 'recording.webm';
          const fd = new FormData();
          fd.append('file', completeAudio, filename);

          const transcribeRes = await fetch(`/api/visits/transcribe`, {
            method: 'POST',
            body: fd,
            credentials: 'include',
          });

          if (!transcribeRes.ok) {
            handleUnauthorizedRedirect(transcribeRes);
            let errText = '';
            try { errText = await transcribeRes.text(); } catch {}
            // eslint-disable-next-line no-console
            console.error('Transcription failed:', transcribeRes.status, errText);
            toast({ 
              variant: 'warning', 
              title: 'Transcription failed', 
              description: `Server returned ${transcribeRes.status}. ${errText ? errText.slice(0, 100) : ''}` 
            });
            return;
          }

          const data = await transcribeRes.json();
          const combinedText = (data?.text as string) || '';
          const patientOnly = (data?.speakers?.patientText as string) || '';
          const appendText = patientOnly || combinedText;

          if (appendText) {
            switch (fieldName) {
              case 'chiefComplaints':
                setChiefComplaints(prev => (prev ? prev + ' ' : '') + appendText);
                break;
            }
          } else {
            toast({ variant: 'info', title: 'No speech detected', description: 'The recording may have been too quiet or contained only silence. Try speaking louder and closer to the microphone.' });
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
      // Record in chunks (e.g., every 30s)
      recorder.start(30000);
      // Auto-stop after up to 10 minutes or when button clicked again (toggle)
      setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, 600000);
    } catch (e) {
      setIsListening(false);
      setActiveVoiceField(null);
      try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
      recorderRef.current = null;
      streamRef.current = null;
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
  const defaultInvestigationOptions: string[] = [
    'CBC', 'ESR', 'CRP', 'LFT', 'Fasting lipid profile', 'RFT', 'Creatinine', 'FBS', 'Fasting Insulin', 'HbA1c', 'RBS', 'CUE', 'Stool examination', 'Total Testosterone', 'S. Prolactin', 'Vitamin B12', 'Vitamin D', 'Ferritin', 'TSH', 'Thyroid profile', 'HIV-I,II', 'HbS Ag', 'Anti HCV', 'VDRL', 'RPR', 'TPHA', 'TB Gold Quantiferon Test', 'Montoux Test', 'Chest Xray PA view', '2D Echo', 'Skin Biopsy'
  ];
  const [customInvestigationOptions, setCustomInvestigationOptions] = useState<string[]>([]);
  const [newCustomInvestigation, setNewCustomInvestigation] = useState<string>('');
  const investigationOptions = useMemo(() => [...defaultInvestigationOptions, ...customInvestigationOptions], [customInvestigationOptions]);
  const [investigations, setInvestigations] = useState<string[]>([]);
  const [procedures, setProcedures] = useState<string>('');
  const [procedurePlanned, setProcedurePlanned] = useState<string>('');
  // Vitals (with BMI)
  const [vitalsHeightCm, setVitalsHeightCm] = useState<number | ''>('');
  const [vitalsWeightKg, setVitalsWeightKg] = useState<number | ''>('');
  const [vitalsBmi, setVitalsBmi] = useState<number | ''>('');
  const [vitalsBpSys, setVitalsBpSys] = useState<number | ''>('');
  const [vitalsBpDia, setVitalsBpDia] = useState<number | ''>('');
  const [vitalsPulse, setVitalsPulse] = useState<number | ''>('');
  // Restore drug search states (now per-row)
  const [rowDrugQueries, setRowDrugQueries] = useState<Record<number, string>>({});
  const [rowDrugResults, setRowDrugResults] = useState<Record<number, any[]>>({});
  const [rowLoadingDrugs, setRowLoadingDrugs] = useState<Record<number, boolean>>({});
  const [activeSearchRow, setActiveSearchRow] = useState<number | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [drugStockById, setDrugStockById] = useState<Record<string, number>>({});
  const [drugStockLoading, setDrugStockLoading] = useState<Record<string, boolean>>({});
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const lastTemplateApplyRef = useRef<number>(0);
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
  const [rxPrintFormat, setRxPrintFormat] = useState<'TEXT' | 'TABLE'>('TABLE');
  const [spaceOptimized, setSpaceOptimized] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [translatingPreview, setTranslatingPreview] = useState(false);
  const [translationsMap, setTranslationsMap] = useState<Record<string, string>>({});
  // Translation cache: content hash -> translations map
  const translationCacheRef = useRef<Map<string, Record<string, string>>>(new Map());
  // Multi-page preview state - now unified with Paged.js
  const [currentPreviewPage, setCurrentPreviewPage] = useState(1);
  const [totalPreviewPages, setTotalPreviewPages] = useState(1);
  const [pagedJsProcessing, setPagedJsProcessing] = useState(false);
  const pagedJsRunningRef = useRef(false);
  const pagedJsPendingRef = useRef(false);
  const pagedJsContainerRef = useRef<HTMLDivElement>(null);
  const pagedInstanceRef = useRef<any>(null); // Store paged.js instance for cleanup
  const isPrintingRef = useRef(false);
  const pagedJsPreloadedRef = useRef(false);
  const prevPreviewOpenRef = useRef(previewOpen);
  // Refs to track previous values for change detection to prevent unnecessary refreshes
  const prevDepsRef = useRef<{
    items: string;
    diagnosis: string;
    followUpInstructions: string;
    chiefComplaints: string;
    investigations: string;
    customSections: string;
    contentOffsetXPx: number | undefined;
    contentOffsetYPx: number | undefined;
    printTopMarginPx: number | undefined;
    printLeftMarginPx: number | undefined;
    printRightMarginPx: number | undefined;
    printBottomMarginPx: number | undefined;
    activeProfileId: string | null;
    overrideTopMarginPx: number | null;
    overrideBottomMarginPx: number | null;
    spaceOptimized: boolean;
  } | null>(null);
  const previewRefreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Change detection refs to prevent flickering - track if initial render is done and last content hash
  const initialRenderDoneRef = useRef(false);
  const lastContentHashRef = useRef<string | null>(null);
  const [showRefillStamp, setShowRefillStamp] = useState<boolean>(false);
  // Letterhead selection: 'default' uses printBgUrl prop or /letterhead.png, 'none' removes it
  const [letterheadOption, setLetterheadOption] = useState<'default' | 'none'>('default');
  const useLetterheadForDownload = useMemo(() => letterheadOption !== 'none', [letterheadOption]);
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
  const [confirmPharmacy, setConfirmPharmacy] = useState<{
    open: boolean;
    prescriptionId: string;
    summary: { medicationsCount: number } | null;
  }>({ open: false, prescriptionId: '', summary: null });

  // Warm up Paged.js chunk during idle time to avoid first-use delay
  useEffect(() => {
    let cancelled = false;
    const warm = () => {
      import('pagedjs')
        .then(() => {
          if (!cancelled) pagedJsPreloadedRef.current = true;
        })
        .catch(() => {
          // non-fatal; preview flow will still dynamically import on demand
        });
    };
    if (typeof window !== 'undefined' && (window as any).requestIdleCallback) {
      (window as any).requestIdleCallback(warm, { timeout: 2000 });
    } else {
      setTimeout(warm, 1000);
    }
    return () => { cancelled = true; };
  }, []);

  // Track previous previewOpen to detect first-open transitions and mark completion
  useEffect(() => {
    if (previewOpen && !prevPreviewOpenRef.current) {
      onPreview?.();
    }
    prevPreviewOpenRef.current = previewOpen;
  }, [previewOpen, onPreview]);

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

  const counselingText = useMemo(() => {
    try {
      const plan: any = visitPlan || null;
      const derm: any = (plan && typeof plan === 'object') ? (plan.dermatology || {}) : {};
      const fromPlan = (plan?.notes || derm?.counseling || '');
      const fromSummary = (visitData as any)?.planSummary?.counseling || '';
      return String(fromPlan || fromSummary || '');
    } catch {
      return '';
    }
  }, [visitPlan, visitData]);

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

  // Keep rx layout consistent in space-optimized mode
  useEffect(() => {
    if (spaceOptimized && rxPrintFormat !== 'TABLE') {
      setRxPrintFormat('TABLE');
    }
  }, [spaceOptimized, rxPrintFormat]);

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
    pushIf('counseling', counselingText);
    pushIf('procedures', procedures);
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
    
    // Check cache: create content hash from plan texts
    const contentHash = `${language}:${plan.map(p => p.text).join('|')}`;
    const cached = translationCacheRef.current.get(contentHash);
    if (cached) {
      console.debug('[PrescriptionBuilder] translateForPreview: using cached translations');
      setTranslationsMap(cached);
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
      // Cache the result
      translationCacheRef.current.set(contentHash, map);
      // Limit cache size to prevent memory issues
      if (translationCacheRef.current.size > 50) {
        const firstKey = translationCacheRef.current.keys().next().value;
        if (firstKey) translationCacheRef.current.delete(firstKey);
      }
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
  }, [language, diagnosis, chiefComplaints, pastHistory, medicationHistory, menstrualHistory, familyHistoryOthers, procedures, procedurePlanned, investigations, customSections, items, counselingText]);

  // Derived flags to show inline UI feedback for auto-included sections
  const hasDiagnosis = useMemo(() => Boolean(diagnosis?.trim()?.length), [diagnosis]);
  const hasChiefComplaints = useMemo(() => Boolean(chiefComplaints?.trim()?.length), [chiefComplaints]);
  const hasHistories = useMemo(() => Boolean(
    pastHistory?.trim()?.length || medicationHistory?.trim()?.length || menstrualHistory?.trim()?.length || exTriggers?.trim()?.length || exPriorTx?.trim()?.length
  ), [pastHistory, medicationHistory, menstrualHistory, exTriggers, exPriorTx]);
  
  const hasFamilyHistory = useMemo(() => Boolean(
    familyHistoryDM || familyHistoryHTN || familyHistoryThyroid || familyHistoryOthers?.trim()?.length
  ), [familyHistoryDM, familyHistoryHTN, familyHistoryThyroid, familyHistoryOthers]);
  
  const hasInvestigations = useMemo(() => Array.isArray(investigations) && investigations.length > 0, [investigations]);
  const hasProcedures = useMemo(() => Boolean(procedures?.trim()?.length), [procedures]);
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

  const patientName = useMemo(() => visitData?.patient?.name || patientData?.name || '—', [visitData, patientData]);
  const patientCodeDisplay = useMemo(() => visitData?.patient?.patientCode || patientData?.patientCode || '', [visitData, patientData]);
  const reviewDateDisplay = useMemo(() => {
    if (!reviewDate) return '';
    const parsed = new Date(reviewDate);
    return Number.isNaN(parsed.getTime()) ? reviewDate : parsed.toLocaleDateString();
  }, [reviewDate]);
  const patientGender = useMemo(() => visitData?.patient?.gender || patientData?.gender || '', [visitData, patientData]);
  const patientDob = useMemo(() => visitData?.patient?.dob || patientData?.dob || '', [visitData, patientData]);
  const patientAgeYears = useMemo(() => {
    if (!patientDob) return '';
    const birthDate = new Date(patientDob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
    return age >= 0 ? `${age} yrs` : '';
  }, [patientDob]);
  const patientAgeSex = useMemo(() => {
    const parts = [];
    if (patientAgeYears) parts.push(patientAgeYears);
    if (patientGender) parts.push(patientGender);
    return parts.join(' / ');
  }, [patientAgeYears, patientGender]);
  const todayStr = useMemo(() => new Date().toLocaleDateString(), []);

  const historyLine = useMemo(() => {
    const parts: string[] = [];
    if (pastHistory?.trim()) parts.push(`Past: ${tt('pastHistory', pastHistory)}`);
    if (medicationHistory?.trim()) parts.push(`Medication: ${tt('medicationHistory', medicationHistory)}`);
    if (menstrualHistory?.trim()) parts.push(`Menstrual: ${tt('menstrualHistory', menstrualHistory)}`);
    if (exTriggers?.trim()) parts.push(`Triggers: ${tt('triggers', exTriggers)}`);
    if (exPriorTx?.trim()) parts.push(`Prior Tx: ${tt('priorTreatments', exPriorTx)}`);
    return parts.join(' | ');
  }, [pastHistory, medicationHistory, menstrualHistory, exTriggers, exPriorTx, tt]);

  const familyHistoryLine = useMemo(() => {
    const parts: string[] = [];
    if (familyHistoryDM) parts.push('DM');
    if (familyHistoryHTN) parts.push('HTN');
    if (familyHistoryThyroid) parts.push('Thyroid disorder');
    if (familyHistoryOthers?.trim()) parts.push(tt('familyHistoryOthers', familyHistoryOthers));
    return parts.join(', ');
  }, [familyHistoryDM, familyHistoryHTN, familyHistoryThyroid, familyHistoryOthers, tt]);

  const mapCreateErrorToToast = (error: any): { title: string; description: string; variant?: 'destructive' | 'warning' | 'default' | 'success' | 'secondary' } => {
    const status = error?.status;
    const msg = getErrorMessage(error);
    const lower = (msg || '').toLowerCase();

    if (status === 409 || lower.includes('already exists')) {
      return {
        title: 'Prescription already exists',
        description: 'A prescription is already linked to this visit. Open the existing Rx from the visit or Pharmacy tab instead of creating a new one.',
      };
    }
    if (status === 404 && lower.includes('visit not found')) {
      return {
        title: 'Visit not found',
        description: 'The visit session could not be found for this patient. Save or reopen the visit, then retry.',
        variant: 'warning',
      };
    }
    if (status === 404 && lower.includes('patient not found')) {
      return {
        title: 'Patient unavailable in this branch',
        description: 'This patient is not available in the current branch. Switch branch or pick the correct patient record.',
        variant: 'warning',
      };
    }
    if (status === 400 && lower.includes('doctor must belong')) {
      return {
        title: 'Doctor not assigned to branch',
        description: 'Select a doctor who belongs to this branch, or switch to the doctor’s branch and try again.',
        variant: 'warning',
      };
    }
    if (status === 404 && lower.includes('doctor not found')) {
      return {
        title: 'Doctor not found',
        description: 'The selected doctor record is missing. Re-select the doctor and try again.',
        variant: 'warning',
      };
    }
    if (status === 400 && lower.includes('at least one prescription item')) {
      return {
        title: 'Add a medicine',
        description: 'Add at least one medication before creating the prescription.',
        variant: 'warning',
      };
    }
    if (status === 408 || lower.includes('timed out')) {
      return {
        title: 'Connection timed out',
        description: 'Network was slow while saving. Please retry in a few seconds.',
        variant: 'warning',
      };
    }
    if (status === 401) {
      return {
        title: 'Signed out',
        description: 'Your session expired. Log in again and retry.',
        variant: 'warning',
      };
    }

    return {
      title: 'Unable to create prescription',
      description: msg || 'Please try again.',
      variant: 'destructive',
    };
  };

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
          const diagArr = Array.isArray(res?.diagnosis) ? res.diagnosis : (res?.diagnosis ? JSON.parse(res.diagnosis) : []);
          if (!diagnosis && Array.isArray(diagArr) && diagArr.length > 0) {
            setDiagnosis(diagArr.map((d: any) => d?.diagnosis || '').filter(Boolean).join(', '));
          }
        } catch {}
        try {
          // Complaints
          const complaintsArr = Array.isArray(res?.complaints) ? res.complaints : (res?.complaints ? JSON.parse(res.complaints) : []);
          if (!chiefComplaints && Array.isArray(complaintsArr) && complaintsArr.length > 0) {
            setChiefComplaints(complaintsArr.map((c: any) => c?.complaint || '').filter(Boolean).join(', '));
          }
        } catch {}
        try {
          // History & family history
          const historyObj = typeof res?.history === 'object' ? res.history : (res?.history ? JSON.parse(res.history) : null);
          if (historyObj) {
            if (!pastHistory && typeof historyObj.pastHistory === 'string') setPastHistory(historyObj.pastHistory);
            if (!medicationHistory && typeof historyObj.medicationHistory === 'string') setMedicationHistory(historyObj.medicationHistory);
            if (!menstrualHistory && typeof historyObj.menstrualHistory === 'string') setMenstrualHistory(historyObj.menstrualHistory);
            if (!exTriggers && typeof historyObj.triggers === 'string') setExTriggers(historyObj.triggers);
            if (!exPriorTx && typeof historyObj.priorTreatments === 'string') setExPriorTx(historyObj.priorTreatments);
            const fam = historyObj.familyHistory || {};
            if (familyHistoryDM === false && typeof fam.dm === 'boolean') setFamilyHistoryDM(!!fam.dm);
            if (familyHistoryHTN === false && typeof fam.htn === 'boolean') setFamilyHistoryHTN(!!fam.htn);
            if (familyHistoryThyroid === false && typeof fam.thyroid === 'boolean') setFamilyHistoryThyroid(!!fam.thyroid);
            if (!familyHistoryOthers && typeof fam.others === 'string') setFamilyHistoryOthers(fam.others);
          }
        } catch {}
        try {
          // Examination
          const examObj = typeof res?.exam === 'object' ? res.exam : (res?.exam ? JSON.parse(res.exam) : null);
          if (examObj) {
            if (!exObjective && typeof examObj.generalAppearance === 'string') setExObjective(examObj.generalAppearance);
            const derm = examObj.dermatology || {};
            if (!exSkinType && typeof derm.skinType === 'string') setExSkinType(derm.skinType);
            if (exMorphology.size === 0 && Array.isArray(derm.morphology)) setExMorphology(new Set(derm.morphology));
            if (exDistribution.size === 0 && Array.isArray(derm.distribution)) setExDistribution(new Set(derm.distribution));
            if (!exAcneSeverity && typeof derm.acneSeverity === 'string') setExAcneSeverity(derm.acneSeverity);
            if (!exItchScore && (typeof derm.itchScore === 'string' || typeof derm.itchScore === 'number')) setExItchScore(String(derm.itchScore));
            if (skinConcerns.size === 0 && Array.isArray(derm.skinConcerns)) setSkinConcerns(new Set(derm.skinConcerns));
          }
        } catch {}
        try {
          // Plan and dermatology sub-plan
          const planObj = typeof res?.plan === 'object' ? res.plan : (res?.plan ? JSON.parse(res.plan) : {});
          const dermaPlan = planObj?.dermatology || {};
          const follow = dermaPlan?.followUpDays;
          if (!followUpInstructions && follow) setFollowUpInstructions(`Follow up in ${follow} days`);
          if (Array.isArray(dermaPlan.investigations) && investigations.length === 0) {
            setInvestigations(dermaPlan.investigations);
            // Extract custom investigations that aren't in the default list
            const customInvs = dermaPlan.investigations.filter((inv: string) => !defaultInvestigationOptions.includes(inv));
            if (customInvs.length > 0) {
              setCustomInvestigationOptions(customInvs);
            }
          }
          if (!procedures && Array.isArray(dermaPlan.procedures) && dermaPlan.procedures.length > 0) {
            const procLine = dermaPlan.procedures.map((p: any) => p?.type).filter(Boolean).join(', ');
            if (procLine) setProcedures(procLine);
          }
          if (!procedurePlanned && typeof dermaPlan.procedurePlanned === 'string') setProcedurePlanned(dermaPlan.procedurePlanned);
        } catch {}
        try {
          // Vitals
          const vitalsObj = typeof res?.vitals === 'object' ? res.vitals : (res?.vitals ? JSON.parse(res.vitals) : null);
          if (vitalsObj) {
            if (vitalsHeightCm === '' && vitalsObj.height != null) setVitalsHeightCm(Number(vitalsObj.height));
            if (vitalsWeightKg === '' && vitalsObj.weight != null) setVitalsWeightKg(Number(vitalsObj.weight));
            if (vitalsBpSys === '' && vitalsObj.systolicBP != null) setVitalsBpSys(Number(vitalsObj.systolicBP));
            if (vitalsBpDia === '' && vitalsObj.diastolicBP != null) setVitalsBpDia(Number(vitalsObj.diastolicBP));
            if (vitalsPulse === '' && vitalsObj.heartRate != null) setVitalsPulse(Number(vitalsObj.heartRate));
          }
        } catch {}
        // Enable sections based on visit content OR current form state
        // Only update if visit has content, otherwise preserve user's current settings
        setIncludeSections({
          ...includeSections,
          // Show diagnosis if visit has it OR if form already has diagnosis entered
          diagnosis: Boolean(res?.diagnosis) || Boolean(diagnosis?.trim()),
          counseling: Boolean(res?.plan) || Boolean(counselingText?.trim()),
          vitals: Boolean(res?.vitals) || Boolean(vitalsHeightCm || vitalsWeightKg || vitalsBpSys || vitalsBpDia || vitalsPulse),
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

  // Debounced drug search per row
  useEffect(() => {
    if (activeSearchRow === null) return;
    
    const t = setTimeout(async () => {
      const q = (rowDrugQueries[activeSearchRow] || '').trim();
      if (q.length < 2) {
        setRowDrugResults(prev => ({ ...prev, [activeSearchRow]: [] }));
        return;
      }
      try {
        setRowLoadingDrugs(prev => ({ ...prev, [activeSearchRow]: true }));
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
        setRowDrugResults(prev => ({ ...prev, [activeSearchRow]: sorted.slice(0, 10) }));
      } catch (e) {
        try {
          const res2: any = await apiClient.get('/drugs/autocomplete', { q, limit: 30, mode: 'all' });
          const list2 = Array.isArray(res2) ? res2 : (Array.isArray(res2?.data) ? res2.data : []);
          const sorted2 = sortDrugsByRelevance(Array.isArray(list2) ? list2 : [], q);
          setRowDrugResults(prev => ({ ...prev, [activeSearchRow]: sorted2.slice(0, 10) }));
        } catch {
          setRowDrugResults(prev => ({ ...prev, [activeSearchRow]: [] }));
        }
      } finally {
        setRowLoadingDrugs(prev => ({ ...prev, [activeSearchRow]: false }));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [rowDrugQueries, activeSearchRow]);

  const searchDrugsForRow = (rowIdx: number, q: string) => {
    setRowDrugQueries(prev => ({ ...prev, [rowIdx]: q }));
    setActiveSearchRow(rowIdx);
    
    // Calculate dropdown position based on input element
    const inputEl = inputRefs.current[rowIdx];
    if (inputEl) {
      const rect = inputEl.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: Math.max(500, rect.width)
      });
    }
    
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

  // Suggestions for per-item Instructions, combining per-drug and global recents
  const [instrFocusIdx, setInstrFocusIdx] = useState<number | null>(null);
  const getInstructionSuggestions = useCallback((drugName: string, q: string, limit = 8): string[] => {
    const byDrugKey = 'instr:' + normalize((drugName || '').toLowerCase());
    const byDrug = readRecent(byDrugKey);
    const global = readRecent('instructions');
    const merged: string[] = [...byDrug, ...global];
    // de-dup then rank by query
    const seen = new Set<string>();
    const uniq = merged.filter((s) => {
      const k = (s || '').toLowerCase();
      if (seen.has(k)) return false; seen.add(k); return true;
    });
    const ranked = rankByQuery(uniq, q);
    return ranked.slice(0, limit);
  }, []);

  // Ensure we always have a trailing blank row when user starts typing a drug
  const createBlankItem = (): PrescriptionItemForm => ({
    drugName: '',
    dosage: '',
    dosageUnit: 'TABLET',
    frequency: 'ONCE_DAILY',
    dosePattern: '',
    duration: '',
    durationUnit: 'DAYS',
    instructions: '',
    timing: '',
    quantity: ''
  });

  useEffect(() => {
    if (pendingFocusRef.current != null) {
      const idx = pendingFocusRef.current;
      pendingFocusRef.current = null;
      setTimeout(() => {
        const el = inputRefs.current[idx];
        if (el) el.focus();
      }, 10);
    }
  }, [items.length]);

  const hasTrailingBlank = (list: PrescriptionItemForm[]): boolean => {
    if (!list || list.length === 0) return false;
    const last = list[list.length - 1];
    return !((last.drugName || '').trim());
  };

  const normalizeHistoryResponse = (res: any): any[] => {
    if (Array.isArray(res)) return res;
    if (res && typeof res === 'object') {
      if (Array.isArray(res.visits)) return res.visits;
      if (Array.isArray(res.data)) return res.data;
    }
    return [];
  };

  const normalizeFrequency = (raw: any, pattern?: string): Frequency => {
    const upper = typeof raw === 'string' ? raw.toUpperCase() : '';
    const fromList = (FREQUENCY_OPTIONS as readonly string[]).find((f) => f === upper);
    if (fromList) return fromList as Frequency;
    const inferred = pattern ? inferFrequencyFromDosePattern(pattern) : null;
    return (inferred as Frequency) || 'ONCE_DAILY';
  };

  const normalizeDurationUnit = (raw: any): DurationUnit => {
    const upper = typeof raw === 'string' ? raw.toUpperCase() : '';
    if (upper === 'DAYS' || upper === 'WEEKS' || upper === 'MONTHS' || upper === 'YEARS') return upper as DurationUnit;
    return 'DAYS';
  };

  const numberOrBlank = (val: any): number | '' => {
    const n = Number(val);
    return Number.isFinite(n) ? n : '';
  };

  const mapPrevRxItem = (raw: any): PrescriptionItemForm | null => {
    const name = String(raw?.drugName || raw?.name || raw?.medicine || '').trim();
    if (!name) return null;
    const dosePattern = raw?.dosePattern || raw?.dose_pattern || '';
    const durationUnit = normalizeDurationUnit(raw?.durationUnit);
    const frequency = normalizeFrequency(raw?.frequency, dosePattern);
    const timing = raw?.timing || inferTimingFromDosePattern(dosePattern || '') || '';
    const dosageUnitRaw = typeof raw?.dosageUnit === 'string' ? raw.dosageUnit.toUpperCase() : '';
    const dosageUnit: DosageUnit = (['MG','ML','MCG','IU','TABLET','CAPSULE','DROP','SPRAY','PATCH','INJECTION'] as const).includes(dosageUnitRaw as DosageUnit)
      ? (dosageUnitRaw as DosageUnit)
      : 'TABLET';

    return {
      drugName: name,
      dosePattern: dosePattern || '',
      frequency,
      timing,
      duration: numberOrBlank(raw?.duration),
      durationUnit,
      instructions: raw?.instructions ? String(raw.instructions) : '',
      dosage: numberOrBlank(raw?.dosage),
      dosageUnit,
      quantity: numberOrBlank(raw?.quantity),
      route: raw?.route ? String(raw.route) : '',
      isGeneric: Boolean(raw?.isGeneric),
    };
  };

  const addPreviousMedications = async () => {
    if (!patientId) {
      toast({
        variant: 'warning',
        title: 'Select a patient',
        description: 'Choose a patient before importing previous medications.',
      });
      return;
    }
    setLoadingPrevMeds(true);
    try {
      const res = await apiClient.getPatientVisitHistory<any>(patientId, { limit: 5 });
      const visits = normalizeHistoryResponse(res)
        .sort((a, b) => {
          const at = a?.createdAt ? Date.parse(String(a.createdAt)) : 0;
          const bt = b?.createdAt ? Date.parse(String(b.createdAt)) : 0;
          return bt - at; // newest first
        });
      const prevWithRx = visits.find((v) => v && v.id !== visitId && Array.isArray((v as any).prescriptionItems) && (v as any).prescriptionItems.length > 0);
      const rawItems: any[] = prevWithRx ? (prevWithRx as any).prescriptionItems : [];
      const mapped = rawItems
        .map(mapPrevRxItem)
        .filter((it): it is PrescriptionItemForm => Boolean(it && (it as PrescriptionItemForm).drugName));
      if (!mapped.length) {
        toast({
          variant: 'warning',
          title: 'No previous medications found',
          description: 'Could not find medications in the last visits for this patient.',
        });
        return;
      }
      setItems((prev) => {
        const base = prev.filter((it) => (it.drugName || '').trim());
        const existingKeys = new Set(base.map((it) => `${it.drugName.toLowerCase()}|${it.frequency}|${it.dosePattern || ''}|${it.timing || ''}|${it.duration}|${it.durationUnit}`));
        const merged = [...base];
        for (const m of mapped) {
          const key = `${m.drugName.toLowerCase()}|${m.frequency}|${m.dosePattern || ''}|${m.timing || ''}|${m.duration}|${m.durationUnit}`;
          if (!existingKeys.has(key)) {
            merged.push(m);
            existingKeys.add(key);
          }
        }
        if (!hasTrailingBlank(merged)) merged.push(createBlankItem());
        return merged;
      });
      toast({
        variant: 'success',
        title: 'Previous medications added',
        description: `Added ${mapped.length} item${mapped.length === 1 ? '' : 's'} from the last visit.`,
      });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Unable to load previous medications',
        description: getErrorMessage(e) || 'Please try again.',
      });
    } finally {
      setLoadingPrevMeds(false);
    }
  };

  // Throttle consecutive adds of the same drug (guards double/triple add)
  const lastDrugAddRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const shouldAllowDrugAdd = (drug: any): boolean => {
    const key = String(drug?.id || drug?.name || '').toLowerCase();
    const now = Date.now();
    if (key && lastDrugAddRef.current.key === key && now - lastDrugAddRef.current.at < 600) {
      return false;
    }
    lastDrugAddRef.current = { key, at: now };
    return true;
  };

  // Helper function to infer dosageUnit from drug's dosageForm
  const inferDosageUnitFromDosageForm = (dosageForm?: string): DosageUnit => {
    if (!dosageForm) return 'TABLET';
    const form = dosageForm.toLowerCase().trim();
    if (form.includes('tablet')) return 'TABLET';
    if (form.includes('capsule')) return 'CAPSULE';
    if (form.includes('drop')) return 'DROP';
    if (form.includes('spray')) return 'SPRAY';
    if (form.includes('patch')) return 'PATCH';
    if (form.includes('injection') || form.includes('injectable')) return 'INJECTION';
    if (form.includes('ml') || form.includes('liquid') || form.includes('syrup') || form.includes('suspension')) return 'ML';
    if (form.includes('mg')) return 'MG';
    if (form.includes('mcg')) return 'MCG';
    if (form.includes('iu')) return 'IU';
    // Default to TABLET if no match
    return 'TABLET';
  };

  const addItemFromDrugToRow = (rowIdx: number, drug: any) => {
    if (!shouldAllowDrugAdd(drug)) return;
    const base: Partial<PrescriptionItemForm> = {
      drugName: drug.name,
      genericName: drug.genericName,
      dosage: 1,
      dosageUnit: inferDosageUnitFromDosageForm(drug.dosageForm),
      frequency: 'ONCE_DAILY',
      duration: 5,
      durationUnit: 'DAYS',
      instructions: '',
      route: 'Oral',
      timing: '',
      quantity: 5,
      isGeneric: true,
    };
    // Update the specific row with drug data
    updateItem(rowIdx, base);
    
    // Clear search results for this row
    setRowDrugResults(prev => ({ ...prev, [rowIdx]: [] }));
    setRowDrugQueries(prev => ({ ...prev, [rowIdx]: '' }));
    setActiveSearchRow(null);
    
    pushRecent('drugNames', drug.name);
    if (patientId) pushRecent(`drugNames:${patientId}`, drug.name);
    if (drug.genericName) pushRecent('drugGeneric', drug.genericName);
  };

  const updateItem = (index: number, patch: Partial<PrescriptionItemForm>) => {
    setItems(prev => {
      const next = prev.map((it, i) => (i === index ? { ...it, ...patch } : it));
      // If user types a drug name into the last row, append a new blank row
      const isLastRow = index === prev.length - 1;
      const newDrugName = typeof patch.drugName === 'string' ? patch.drugName : undefined;
      if (isLastRow && typeof newDrugName === 'string' && newDrugName.trim() && !hasTrailingBlank(next)) {
        next.push(createBlankItem());
      }
      return next;
    });
  };

  const addRowAndFocus = () => {
    setItems(prev => {
      const next = [...prev, createBlankItem()];
      pendingFocusRef.current = next.length - 1;
      return next;
    });
  };

  const applyPresetToRow = (rowIdx: number, preset: Partial<PrescriptionItemForm>) => {
    if (rowIdx < 0 || rowIdx >= items.length) return;
    updateItem(rowIdx, preset);
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
      q4h: 'EVERY_4_HOURS',
      'every 4 hours': 'EVERY_4_HOURS',
      q6h: 'EVERY_6_HOURS',
      'every 6 hours': 'EVERY_6_HOURS',
      q8h: 'EVERY_8_HOURS',
      'every 8 hours': 'EVERY_8_HOURS',
      q12h: 'EVERY_12_HOURS',
      'every 12 hours': 'EVERY_12_HOURS',
      prn: 'AS_NEEDED',
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

  const previewPatientName = useMemo(() => {
    return (visitData as any)?.patient?.name || (patientData as any)?.name || patientId || '—';
  }, [visitData, patientData, patientId]);

  const previewDoctorName = useMemo(() => {
    const doc = (visitData as any)?.doctor;
    if (doc) return `Dr. ${(doc.firstName ?? '')} ${(doc.lastName ?? '')}`.trim();
    return doctorId ? `Doctor ${String(doctorId).slice(0, 6)}` : 'Doctor';
  }, [visitData, doctorId]);

  const summaryChips = useMemo(() => {
    return [
      { label: 'Rx', value: validItems.length },
      { label: 'Investigations', value: Array.isArray(investigations) ? investigations.length : 0 },
      { label: 'Follow-up', value: followUpInstructions?.trim()?.length ? 'Yes' : '—' },
    ];
  }, [validItems.length, investigations, followUpInstructions]);

  const recentDrugsForPatient = useMemo(() => patientId ? getLocalSuggestions(`drugNames:${patientId}`, '', 5) : [], [patientId]);
  const recentDrugsGlobal = useMemo(() => getLocalSuggestions('drugNames', '', 5), []);
  const frequencyPresets: Array<{ label: string; pattern?: string; frequency?: Frequency }> = [
    { label: '1-0-1', pattern: '1-0-1' },
    { label: '0-1-0', pattern: '0-1-0' },
    { label: '1-1-1', pattern: '1-1-1' },
    { label: 'HS', frequency: 'ONCE_DAILY' },
  ];
  const durationPresets: Array<{ label: string; duration: number; unit: DurationUnit }> = [
    { label: '5d', duration: 5, unit: 'DAYS' },
    { label: '7d', duration: 7, unit: 'DAYS' },
    { label: '14d', duration: 14, unit: 'DAYS' },
    { label: '4w', duration: 4, unit: 'WEEKS' },
  ];

  const create = useCallback(async () => {
    if (!canCreate) {
      const missing: string[] = [];
      if (!patientId) missing.push('patient');
      if (!doctorId) missing.push('doctor');
      if (validItems.length === 0) missing.push('at least one medication');
      if (!standalone && !visitId && !ensureVisitId) missing.push('an active visit');
      const description = missing.length
        ? `Add ${missing.join(', ')} to create a prescription.`
        : 'Missing required information. Please check patient, doctor, visit, and medications.';
      toast({
        variant: 'destructive',
        title: 'Cannot create prescription',
        description,
      });
      return;
    }
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
          toast({
            variant: 'warning',
            title: 'Visit not linked',
            description: 'Unable to create or resume the visit. The prescription will save without linking unless you retry.',
          });
        }
      }

      // Persist all builder fields to Visit for future autocomplete (DB-backed)
      if (ensuredVisitId) {
        const visitUpdatePayload: Record<string, unknown> = {
          vitals: (vitalsBpSys !== '' || vitalsBpDia !== '' || vitalsPulse !== '' || vitalsWeightKg !== '' || vitalsHeightCm !== '') ? {
            ...(vitalsBpSys !== '' ? { systolicBP: Number(vitalsBpSys) } : {}),
            ...(vitalsBpDia !== '' ? { diastolicBP: Number(vitalsBpDia) } : {}),
            ...(vitalsPulse !== '' ? { heartRate: Number(vitalsPulse) } : {}),
            ...(vitalsWeightKg !== '' ? { weight: Number(vitalsWeightKg) } : {}),
            ...(vitalsHeightCm !== '' ? { height: Number(vitalsHeightCm) } : {}),
          } : undefined,
          complaints: chiefComplaints ? [{ complaint: chiefComplaints }] : undefined,
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
            dermatology: procedures?.trim()?.length ? { procedures: [{ type: procedures.trim() }] } : undefined,
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
          procedures: procedures || undefined,
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
      const { title, description, variant } = mapCreateErrorToToast(e);
      toast({
        variant: variant || 'destructive',
        title,
        description,
      });
    }
  }, [canCreate, patientId, visitId, doctorId, items, diagnosis, language, reviewDate, followUpInstructions, procedureMetrics, chiefComplaints, pastHistory, medicationHistory, menstrualHistory, familyHistoryDM, familyHistoryHTN, familyHistoryThyroid, familyHistoryOthers, investigations, procedures, procedurePlanned, onCreated]);

  const applyTemplateToBuilder = (tpl: any) => {
    const nowTs = Date.now();
    if (nowTs - lastTemplateApplyRef.current < 800) return;
    lastTemplateApplyRef.current = nowTs;
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
      setItems(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        const hasBlankLast = last && !((last?.drugName || '').trim());
        if (hasBlankLast && mapped.length > 0) {
          next[next.length - 1] = mapped[0];
          if (mapped.length > 1) next.push(...mapped.slice(1));
        } else {
          next.push(...mapped);
        }
        if (!hasTrailingBlank(next)) next.push(createBlankItem());
        return next;
      });
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
          let invs: string[] = [];
          if (Array.isArray(md.investigations)) invs = md.investigations as string[];
          else if (typeof md.investigations === 'string') invs = (md.investigations as string).split(',').map(s => s.trim()).filter(Boolean);
          setInvestigations(invs);
          // Extract custom investigations that aren't in the default list
          const customInvs = invs.filter((inv: string) => !defaultInvestigationOptions.includes(inv));
          if (customInvs.length > 0) {
            setCustomInvestigationOptions(customInvs);
          }
        }
        if (md.procedures) {
          const procVal = Array.isArray(md.procedures) ? md.procedures.join(', ') : md.procedures;
          if (typeof procVal === 'string') setProcedures(procVal);
        }
        if (md.procedurePlanned) setProcedurePlanned(md.procedurePlanned);
        // procedureParams removed
        // doctor's personal notes removed from builder
      }
      try { void apiClient.recordTemplateUsage?.(tpl?.id, { variant: undefined }).catch(() => {}); } catch {}
    } catch {}
  };

  const [templatePromptOpen, setTemplatePromptOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateNameError, setTemplateNameError] = useState('');
  // Default to explicit "none" option to avoid Radix cycling refs on missing value
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('none');
  const [fieldTemplatePromptOpen, setFieldTemplatePromptOpen] = useState(false);
  const [fieldTemplateName, setFieldTemplateName] = useState('');
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [newTplName, setNewTplName] = useState('');
  const [newTplNameError, setNewTplNameError] = useState('');
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
  const lastNewTplAddRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });

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
    const key = String(drug?.id || drug?.name || '').toLowerCase();
    const now = Date.now();
    if (key && lastNewTplAddRef.current.key === key && now - lastNewTplAddRef.current.at < 600) {
      return;
    }
    lastNewTplAddRef.current = { key, at: now };
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

// Prevent redundant template selection state updates that can recurse during ref detaches
const handleTemplateChange = React.useCallback(
  (v: string) => setSelectedTemplateId((prev) => (prev === v ? prev : v)),
  []
);

// Ensure the select value always exists in options to avoid Radix ref churn
const templateSelectValue = useMemo(() => {
  if (allTemplates.some((t) => t.id === selectedTemplateId)) return selectedTemplateId;
  return 'none';
}, [allTemplates, selectedTemplateId]);

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
          dosage: it.dosage === '' || it.dosage === undefined || it.dosage === null ? undefined : Number(it.dosage),
          dosageUnit: it.dosageUnit,
          frequency: it.frequency,
          duration: it.duration === '' || it.duration === undefined || it.duration === null ? undefined : Number(it.duration),
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
      const idemKey = `tpl-${name}-${String(Date.now())}`;
      const doRequest = async () => {
        await apiClient.post('/prescriptions/templates', payload, { idempotencyKey: idemKey });
        await loadTemplates();
        toast({
          variant: 'success',
          title: 'Template saved',
          description: 'Prescription template stored for future visits.',
        });
      };
      await doRequest();
    } catch (e: any) {
      // Inline field highlights for common cases
      if (e?.status === 409) {
        setTemplateNameError('A template with this name already exists.');
      } else if (e?.status === 400) {
        const msg = getErrorMessage(e);
        if (msg && /name/i.test(String(msg))) {
          setTemplateNameError(msg);
        }
      }
      const idemKey = `tpl-${name}-${String(Date.now())}`;
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
    skinConcerns,
    loadTemplates,
    toast,
    showTemplateCreateError,
    setTemplateNameError,
  ]);

  const [assets, setAssets] = useState<any[]>([]);
  const [printerProfiles, setPrinterProfiles] = useState<any[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const undoStackRef = useRef<any[]>([]);
  const redoStackRef = useRef<any[]>([]);
  // Computed effective margins (depend on printer profile and overrides)
  const effectiveTopMarginPx = useMemo(() => {
    const prof = activeProfileId ? (printerProfiles.find((p: any) => p.id === activeProfileId) || {}) : {};
    return (overrideTopMarginPx ?? (prof.topMarginPx ?? printTopMarginPx ?? 170)) as number;
  }, [activeProfileId, printerProfiles, overrideTopMarginPx, printTopMarginPx]);
  const effectiveBottomMarginPx = useMemo(() => {
    const prof = activeProfileId ? (printerProfiles.find((p: any) => p.id === activeProfileId) || {}) : {};
    return (overrideBottomMarginPx ?? (prof.bottomMarginPx ?? printBottomMarginPx ?? 45)) as number;
  }, [activeProfileId, printerProfiles, overrideBottomMarginPx, printBottomMarginPx]);
  const effectiveTopMarginMm = useMemo(() => Math.max(0, Math.round((effectiveTopMarginPx / 3.78) * 10) / 10), [effectiveTopMarginPx]);
  const effectiveBottomMarginMm = useMemo(() => Math.max(0, Math.round((effectiveBottomMarginPx / 3.78) * 10) / 10), [effectiveBottomMarginPx]);

  // Memoize slider values to prevent frequent re-renders of sidebar
  const activeProfile = useMemo(() => {
    return activeProfileId ? printerProfiles.find((p:any)=>p.id===activeProfileId) : null;
  }, [activeProfileId, printerProfiles]);

  const topMarginSliderValue = useMemo(() => {
    return overrideTopMarginPx ?? (activeProfile?.topMarginPx ?? printTopMarginPx ?? 170);
  }, [overrideTopMarginPx, activeProfile, printTopMarginPx]);

  const bottomMarginSliderValue = useMemo(() => {
    return overrideBottomMarginPx ?? (activeProfile?.bottomMarginPx ?? printBottomMarginPx ?? 45);
  }, [overrideBottomMarginPx, activeProfile, printBottomMarginPx]);

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


  // Old custom pagination removed - now using unified Paged.js system

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

  // Memoize array dependencies to prevent unnecessary re-renders
  const itemsStringified = useMemo(() => JSON.stringify(items), [items]);
  const investigationsStringified = useMemo(() => JSON.stringify(investigations), [investigations]);
  const customSectionsStringified = useMemo(() => JSON.stringify(customSections), [customSections]);

  useEffect(() => {
    // Avoid Paged.js DOM work during print preview to prevent internal nextSibling errors
    const handleBeforePrint = () => {
      isPrintingRef.current = true;
      // Also clear any pending re-runs to avoid race conditions during print preview
      pagedJsPendingRef.current = false;
      console.warn('⏭️ Pausing Paged.js during print preview');
    };
    const handleAfterPrint = () => { isPrintingRef.current = false; };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    if (!(previewOpen || autoPreview)) {
      // Clear any pending refresh when preview closes
      if (previewRefreshTimeoutRef.current) {
        clearTimeout(previewRefreshTimeoutRef.current);
        previewRefreshTimeoutRef.current = null;
      }
      // Reset prevDepsRef when preview closes to ensure fresh comparison when reopening
      prevDepsRef.current = null;
      return;
    }

    // Create a snapshot of current dependencies for comparison
    const currentDeps = {
      items: itemsStringified,
      diagnosis,
      followUpInstructions,
      chiefComplaints,
      investigations: investigationsStringified,
      customSections: customSectionsStringified,
      contentOffsetXPx,
      contentOffsetYPx,
      printTopMarginPx,
      printLeftMarginPx,
      printRightMarginPx,
      printBottomMarginPx,
      activeProfileId,
      overrideTopMarginPx,
      overrideBottomMarginPx,
      spaceOptimized,
    };

    // Check if dependencies actually changed
    const prevDeps = prevDepsRef.current;
    if (prevDeps) {
      const hasChanged = Object.keys(currentDeps).some(key => {
        const currentKey = key as keyof typeof currentDeps;
        return prevDeps[currentKey] !== currentDeps[currentKey];
      });
      
      if (!hasChanged) {
        // Dependencies haven't changed, skip refresh
        return;
      }
    }

    // Update ref with current dependencies
    prevDepsRef.current = currentDeps;

    // Clear any existing timeout
    if (previewRefreshTimeoutRef.current) {
      clearTimeout(previewRefreshTimeoutRef.current);
    }

    // Debounce the preview refresh to prevent rapid-fire updates
    previewRefreshTimeoutRef.current = setTimeout(() => {
      if (language !== 'EN') void translateForPreview();
      setPreviewJustUpdated(true);
      setTimeout(() => setPreviewJustUpdated(false), 600);
      previewRefreshTimeoutRef.current = null;
    }, 300); // Increased from 50ms to 300ms to prevent spam

    return () => {
      if (previewRefreshTimeoutRef.current) {
        clearTimeout(previewRefreshTimeoutRef.current);
        previewRefreshTimeoutRef.current = null;
      }
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [previewOpen, autoPreview, language, rxPrintFormat, itemsStringified, diagnosis, followUpInstructions, chiefComplaints, investigationsStringified, customSectionsStringified, contentOffsetXPx, contentOffsetYPx, printTopMarginPx, printLeftMarginPx, printRightMarginPx, printBottomMarginPx, activeProfileId, overrideTopMarginPx, overrideBottomMarginPx, spaceOptimized, translateForPreview]);

  // Globally suppress Paged.js internal DOM errors while preview is active or in autoPreview mode
  useEffect(() => {
    if (!(previewOpen || autoPreview)) return;
    const globalHandler = (event: ErrorEvent | PromiseRejectionEvent) => {
      const message = 'message' in event ? event.message : String((event as PromiseRejectionEvent).reason);
      const stack = event instanceof ErrorEvent && event.error?.stack ? event.error.stack : '';
      if (
        message?.includes('nextSibling') ||
        stack?.includes('dom.js') ||
        stack?.includes('pagedjs') ||
        stack?.includes('Layout.findEndToken') ||
        stack?.includes('checkUnderflowAfterResize')
      ) {
        event.preventDefault?.();
        console.warn('🔇 Suppressed pagedjs DOM error (global during preview)');
        return true;
      }
    };
    window.addEventListener('error', globalHandler as EventListener);
    window.addEventListener('unhandledrejection', globalHandler as EventListener);
    return () => {
      window.removeEventListener('error', globalHandler as EventListener);
      window.removeEventListener('unhandledrejection', globalHandler as EventListener);
    };
  }, [previewOpen, autoPreview]);

  // Unified Paged.js processing with custom controls integration
  useEffect(() => {
    console.log('🔄 Paged.js useEffect triggered', { 
      previewOpen,
      autoPreview,
      hasRef: !!pagedJsContainerRef.current,
      effectiveTopMarginMm,
      effectiveBottomMarginMm,
      overrideTopMarginPx,
      overrideBottomMarginPx
    });
    
    // Only proceed in preview or autoPreview mode; container may not be mounted yet
    if (!(previewOpen || autoPreview)) {
      console.log('⚠️ Early return from paged.js effect - preview disabled');
      // Reset change detection when preview closes so next open gets fresh render
      initialRenderDoneRef.current = false;
      lastContentHashRef.current = null;
      return;
    }
    
    // Create a content hash of values that actually affect the rendered output
    // This prevents re-processing when React re-renders but content hasn't changed
    const contentHash = JSON.stringify({
      items: itemsStringified,
      diagnosis,
      chiefComplaints,
      investigations: investigationsStringified,
      customSections: customSectionsStringified,
      followUpInstructions,
      paperPreset,
      topMargin: effectiveTopMarginMm,
      bottomMargin: effectiveBottomMarginMm,
      leftMargin: printLeftMarginPx,
      rightMargin: printRightMarginPx,
      offsetX: contentOffsetXPx,
      offsetY: contentOffsetYPx,
      showRefillStamp,
      grayscale,
      letterheadOption,
      rxPrintFormat,
      spaceOptimized,
    });
    
    // Skip processing if: initial render is done AND content hash hasn't changed
    if (initialRenderDoneRef.current && lastContentHashRef.current === contentHash) {
      console.log('⏭️ Skipping Paged.js - content unchanged');
      return;
    }
    
    const processWithPagedJs = async () => {
      // Skip processing if a print dialog/preview is active
      if (isPrintingRef.current) {
        console.warn('⏭️ Skipping Paged.js processing during print');
        return;
      }
      if (pagedJsRunningRef.current) {
        // Flag a pending run; the current run will trigger it in finally
        pagedJsPendingRef.current = true;
        return;
      }
      pagedJsRunningRef.current = true;
      console.log('⏱️  Starting paged.js processing (after 100ms debounce)...');
      
      // Store error handler reference for cleanup
      let errorHandler: ((event: ErrorEvent | PromiseRejectionEvent) => void) | null = null;
      // Keep a handle to the temp content node so we can always clean it up
      let tempDiv: HTMLDivElement | null = null;
      
      try {
        setPagedJsProcessing(true);
        const container = pagedJsContainerRef.current || document.getElementById('pagedjs-container');
        if (!container) {
          console.error('⚠️ Container ref is null at processing time!');
          return;
        }
        // If the container is not connected or currently not visible/measurable, delay processing
        try {
          const isConnected = (container as any).isConnected ?? document.body.contains(container);
          const style = window.getComputedStyle(container as Element);
          const rect = (container as Element).getBoundingClientRect();
          if (!isConnected || style.display === 'none' || rect.width === 0 || rect.height === 0) {
            console.warn('⏸️ Paged.js container not ready (invisible or zero-size). Delaying processing...');
            setPagedJsProcessing(false);
            pagedJsRunningRef.current = false;
            setTimeout(() => {
              // Re-run once the container is likely visible
              if (previewOpen || autoPreview) void processWithPagedJs();
            }, 50); // Reduced from 150ms to 50ms
            return;
          }
        } catch {
          // If any measurement throws, bail out gracefully and retry shortly
          setPagedJsProcessing(false);
          pagedJsRunningRef.current = false;
          setTimeout(() => {
            if (previewOpen || autoPreview) void processWithPagedJs();
          }, 50); // Reduced from 150ms to 50ms
          return;
        }
        
        // Clear previous content and force cleanup (only if not printing)
        if (!isPrintingRef.current) {
          container.innerHTML = '';
        }
        
        // Force garbage collection of previous paged.js instance
        // by ensuring we get a fresh container state
        const previousPages = container.querySelectorAll('.pagedjs_page');
        previousPages.forEach(page => page.remove());
        
        // Get the prescription content
        const content = printRef.current?.innerHTML || '';
        
        console.log('📄 Source content length:', content.length, 'chars');
        console.log('📋 Medications check:', {
          includeSections_medications: includeSections.medications,
          validItems_length: validItems.length,
          rxPrintFormat,
          content_includes_Rx: content.includes('Rx') || content.includes('rx-row') || content.includes('Medicine'),
        });
        
        if (!content || content.length < 50) {
          console.warn('⚠️ Source content is empty or too short, skipping paged.js processing');
          setPagedJsProcessing(false);
          return;
        }
        
        // Create a temporary div with the content
        tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        tempDiv.style.fontFamily = 'Fira Sans, sans-serif';
        tempDiv.style.fontSize = '14px';
        // Attach offscreen to DOM so Paged.js can safely measure layout
        tempDiv.style.position = 'fixed';
        tempDiv.style.left = '-10000px';
        tempDiv.style.top = '0';
        if (document && document.body) {
          try {
            document.body.appendChild(tempDiv);
          } catch (e) {
            console.warn('⚠️ Failed to append temp content to body:', e);
          }
        } else {
          console.warn('⏸️ document.body not ready; delaying Paged.js processing');
          setPagedJsProcessing(false);
          pagedJsRunningRef.current = false;
          setTimeout(() => {
            if (previewOpen || autoPreview) void processWithPagedJs();
          }, 50); // Reduced from 150ms to 50ms
          return;
        }
        if (!tempDiv.isConnected) {
          console.warn('⏸️ Temp content not connected; delaying Paged.js processing');
          setPagedJsProcessing(false);
          pagedJsRunningRef.current = false;
          setTimeout(() => {
            if (previewOpen || autoPreview) void processWithPagedJs();
          }, 50); // Reduced from 150ms to 50ms
          return;
        }
        
        // Calculate margins in mm for @page rule
        const topMarginMm = effectiveTopMarginMm;
        const bottomMarginMm = effectiveBottomMarginMm;
        const leftMarginMm = Math.max(0, Math.round((activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.leftMarginPx ?? printLeftMarginPx ?? 45) : (printLeftMarginPx ?? 45))/3.78 * 10) / 10);
        const rightMarginMm = Math.max(0, Math.round((activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.rightMarginPx ?? printRightMarginPx ?? 45) : (printRightMarginPx ?? 45))/3.78 * 10) / 10);
        
        // Debug log for margin verification
        console.log('📐 Paged.js Processing - Margins:', { 
          topMarginMm, 
          bottomMarginMm, 
          leftMarginMm, 
          rightMarginMm,
          overrideTopMarginPx,
          overrideBottomMarginPx,
          effectiveTopMarginPx,
          effectiveBottomMarginPx
        });
        
        console.log('🎯 @page rule that will be passed to Paged.js:', `margin-top: ${topMarginMm}mm`);
        
        // Clean up previous paged.js instance if it exists
        if (pagedInstanceRef.current) {
          try {
            // Remove all pagedjs-generated pages to clean up event listeners
            const existingPages = container.querySelectorAll('.pagedjs_page');
            existingPages.forEach(page => {
              page.remove();
            });
            if (!isPrintingRef.current && container) {
              container.innerHTML = '';
            }
            pagedInstanceRef.current = null;
          } catch (e) {
            console.warn('Error cleaning up previous paged.js instance:', e);
          }
        }
        
        // Initialize a fresh Paged.js instance - use preloaded module if available
        let Previewer;
        if (pagedJsPreloadedRef.current) {
          // Module already loaded, use it directly (faster)
          const pagedModule = await import('pagedjs');
          Previewer = pagedModule.Previewer;
        } else {
          // First-time load
          const { Previewer: P } = await import('pagedjs');
          Previewer = P;
          pagedJsPreloadedRef.current = true;
        }
        const paged = new Previewer();
        pagedInstanceRef.current = paged;
        
        // Add error handlers to suppress pagedjs resize errors
        errorHandler = (event: ErrorEvent | PromiseRejectionEvent) => {
          const message = 'message' in event ? event.message : String(event.reason);
          const stack = event instanceof ErrorEvent && event.error?.stack ? event.error.stack : '';
          
          // Check if this is a pagedjs internal error
          if (message?.includes('nextSibling') || 
              stack?.includes('dom.js') ||
              stack?.includes('pagedjs') ||
              stack?.includes('Layout.findEndToken') ||
              stack?.includes('checkUnderflowAfterResize')) {
            // Suppress pagedjs DOM errors that occur during/after processing
            event.preventDefault?.();
            console.warn('🔇 Suppressed pagedjs DOM error (expected during re-processing)');
            return true;
          }
        };
        
        // Handle both regular errors and unhandled promise rejections
        window.addEventListener('error', errorHandler as EventListener);
        window.addEventListener('unhandledrejection', errorHandler as EventListener);
        
        // Build CSS string with page rules
        // Note: @page rules must be passed to Paged.js through the CSS parameter, not inline styles
        const pageRulesCSS = `
          @page {
            size: ${paperPreset === 'LETTER' ? '8.5in 11in' : 'A4'};
            margin-top: ${topMarginMm}mm !important;
            margin-bottom: ${bottomMarginMm}mm !important;
            margin-left: ${leftMarginMm}mm !important;
            margin-right: ${rightMarginMm}mm !important;
          }
        `;
        
        // Content styling (can be inline or in CSS string)
        const contentCSS = `
          body { font-family: 'Fira Sans', sans-serif; font-size: 14px; color: #111827; }
          .medication-item, .pb-avoid-break { break-inside: avoid; page-break-inside: avoid; }
          .pb-before-page { break-before: page; page-break-before: always; }
          table { break-inside: auto; }
          tr { break-inside: avoid; page-break-inside: avoid; }
        `;
        
        // Add content styles as inline style tag
        const styleEl = document.createElement('style');
        styleEl.setAttribute('type', 'text/css');
        styleEl.appendChild(document.createTextNode(contentCSS));
        tempDiv.prepend(styleEl);

        // Process with Paged.js - pass @page rules via a Blob URL stylesheet
        // Raw CSS strings are treated as URLs by Paged.js; use an object URL instead
        const pageRulesBlob = new Blob([pageRulesCSS], { type: 'text/css' });
        const pageRulesUrl = URL.createObjectURL(pageRulesBlob);
        // Ensure a stable pages host element exists for Paged.js to render into
        let pagesHost = container.querySelector('.pagedjs_pages') as HTMLElement | null;
        if (!pagesHost) {
          pagesHost = document.createElement('div');
          pagesHost.className = 'pagedjs_pages';
          container.appendChild(pagesHost);
        }

        // Double-check container is still connected and measurable before rendering
        const stillConnected = (container as any).isConnected ?? document.body.contains(container);
        if (!stillConnected) {
          console.warn('⏸️ Container disconnected before Paged.js render; aborting.');
          return;
        }
        let flow: any;
        try {
          flow = await paged.preview(tempDiv, [pageRulesUrl], pagesHost);
        } finally {
          URL.revokeObjectURL(pageRulesUrl);
        }
        
        console.log('📦 Paged.js flow result:', flow);
        
        // Update total pages count
        const pages = container.querySelectorAll('.pagedjs_page');
        setTotalPreviewPages(pages.length);
        console.log('✅ Paged.js processing complete - Generated', pages.length, 'pages');
        
        // Mark initial render as done and update content hash to prevent flickering
        initialRenderDoneRef.current = true;
        lastContentHashRef.current = contentHash;
        console.log('📏 Container dimensions:', {
          width: container.offsetWidth,
          height: container.offsetHeight,
          scrollHeight: container.scrollHeight,
          childElementCount: container.childElementCount,
          innerHTML_length: container.innerHTML.length
        });
        
        // Check if pages are actually in the DOM with the right margins
        if (pages.length > 0) {
          const firstPage = pages[0] as HTMLElement;
          const pageStyle = window.getComputedStyle(firstPage);
          console.log('🎨 First page computed styles:', {
            width: pageStyle.width,
            height: pageStyle.height,
            display: pageStyle.display,
            visibility: pageStyle.visibility,
            marginTop: pageStyle.marginTop,
            marginBottom: pageStyle.marginBottom,
            marginLeft: pageStyle.marginLeft,
            marginRight: pageStyle.marginRight
          });
          
          // Check the page box (content area) margins
          const pageBox = firstPage.querySelector('.pagedjs_pagebox') as HTMLElement;
          if (pageBox) {
            const boxStyle = window.getComputedStyle(pageBox);
            console.log('📦 First page box margins:', {
              paddingTop: boxStyle.paddingTop,
              paddingBottom: boxStyle.paddingBottom,
              paddingLeft: boxStyle.paddingLeft,
              paddingRight: boxStyle.paddingRight
            });
          }
        }
        
        // Note: Avoid forcing React re-render here to prevent resize races
        
        // Apply custom overlays to each page
        pages.forEach((page, idx) => {
          const pagebox = page.querySelector('.pagedjs_pagebox');
          if (!pagebox) {
            console.warn(`⚠️ Page ${idx} has no pagebox!`);
            return;
          }
          
          // Log the page content area dimensions
          const pageContent = page.querySelector('.pagedjs_page_content') as HTMLElement;
          if (pageContent && idx === 0) {
            console.log('📄 First page content area:', {
              marginTop: window.getComputedStyle(pageContent).marginTop,
              marginBottom: window.getComputedStyle(pageContent).marginBottom,
              paddingTop: window.getComputedStyle(pageContent).paddingTop,
              paddingBottom: window.getComputedStyle(pageContent).paddingBottom,
              height: pageContent.offsetHeight
            });
          }
          
          // Apply content offset (for design positioning)
          const contentArea = page.querySelector('.pagedjs_page_content');
          if (contentArea) {
            const offsetX = activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.contentOffsetXPx ?? contentOffsetXPx ?? 0) : (contentOffsetXPx ?? 0);
            const offsetY = activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.contentOffsetYPx ?? contentOffsetYPx ?? 0) : (contentOffsetYPx ?? 0);
            (contentArea as HTMLElement).style.transform = `translate(${offsetX}px, ${offsetY}px)`;
          }
          
          // Add bleed-safe overlay if enabled
          if (bleedSafe?.enabled) {
            const safeOverlay = document.createElement('div');
            safeOverlay.style.cssText = `
              position: absolute;
              inset: 0;
              outline: ${Math.max(0, bleedSafe.safeMarginMm) / 3.78}mm solid rgba(255,0,0,0.15);
              outline-offset: -${Math.max(0, bleedSafe.safeMarginMm) / 3.78}mm;
              pointer-events: none;
              z-index: 100;
            `;
            safeOverlay.setAttribute('aria-hidden', 'true');
            (pagebox as HTMLElement).style.position = 'relative';
            pagebox.appendChild(safeOverlay);
          }
          
          // Add frame overlays if enabled
          if (frames?.enabled) {
            // Header frame - positioned from top of page box
            const headerFrame = document.createElement('div');
            headerFrame.style.cssText = `
              position: absolute;
              left: 0;
              right: 0;
              top: ${topMarginMm}mm;
              height: ${Math.max(0, (frames.headerHeightMm || 0))}mm;
              background: rgba(0, 123, 255, 0.06);
              outline: 1px dashed rgba(0,123,255,0.5);
              pointer-events: none;
              z-index: 99;
            `;
            headerFrame.setAttribute('aria-hidden', 'true');
            headerFrame.setAttribute('data-frame', 'header');
            (pagebox as HTMLElement).style.position = 'relative';
            pagebox.appendChild(headerFrame);
            
            // Footer frame - positioned from bottom of page box
            const footerFrame = document.createElement('div');
            footerFrame.style.cssText = `
              position: absolute;
              left: 0;
              right: 0;
              bottom: ${bottomMarginMm}mm;
              height: ${Math.max(0, (frames.footerHeightMm || 0))}mm;
              background: rgba(0, 123, 255, 0.06);
              outline: 1px dashed rgba(0,123,255,0.5);
              pointer-events: none;
              z-index: 99;
            `;
            footerFrame.setAttribute('aria-hidden', 'true');
            footerFrame.setAttribute('data-frame', 'footer');
            pagebox.appendChild(footerFrame);
          }
          
          // Add design aids if enabled
          if (designAids?.enabled) {
            const designContainer = document.createElement('div');
            designContainer.style.cssText = `
              position: absolute;
              inset: 0;
              pointer-events: none;
              z-index: 98;
            `;
            designContainer.setAttribute('aria-hidden', 'true');
            
            if (designAids.showGrid) {
              const gridOverlay = document.createElement('div');
              gridOverlay.style.cssText = `
                position: absolute;
                inset: -200px;
                background-image: linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px),
                                  linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px);
                background-size: ${Math.max(2, designAids.gridSizePx || 8)}px ${Math.max(2, designAids.gridSizePx || 8)}px;
              `;
              designContainer.appendChild(gridOverlay);
            }
            
            if (designAids.showRulers) {
              // Horizontal ruler
              const hRuler = document.createElement('div');
              hRuler.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                right: 0;
                height: 20px;
                background: linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px);
                background-size: 40px 20px;
              `;
              designContainer.appendChild(hRuler);
              
              // Vertical ruler
              const vRuler = document.createElement('div');
              vRuler.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 20px;
                bottom: 0;
                background: linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px);
                background-size: 20px 40px;
              `;
              designContainer.appendChild(vRuler);
            }
            
            (pagebox as HTMLElement).style.position = 'relative';
            pagebox.appendChild(designContainer);
          }
          
          // Add refill stamp to first page if enabled
          if (idx === 0 && showRefillStamp) {
            const stamp = document.createElement('div');
            stamp.style.cssText = `
              position: absolute;
              right: 12px;
              top: 12px;
              padding: 4px 8px;
              border: 1px dashed rgba(0,0,0,0.4);
              color: #0a0a0a;
              background: rgba(255,255,255,0.8);
              font-size: 12px;
              pointer-events: none;
              z-index: 101;
            `;
            stamp.textContent = 'Refill eligible';
            stamp.setAttribute('aria-hidden', 'true');
            (pagebox as HTMLElement).style.position = 'relative';
            pagebox.appendChild(stamp);
          }
        });
        
      } catch (error) {
        console.error('❌ Paged.js processing error:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        toast({
          title: 'Pagination Error',
          description: 'Failed to process document. Please check your content and try again.',
          variant: 'destructive',
        });
      } finally {
        console.log('🏁 Paged.js processing finished (finally block)');
        // Ensure the temporary content node is removed from DOM
        try {
          if (tempDiv && tempDiv.parentNode) {
            tempDiv.parentNode.removeChild(tempDiv);
          }
        } catch {}
        
        // Remove the error handlers
        if (errorHandler) {
          window.removeEventListener('error', errorHandler as EventListener);
          window.removeEventListener('unhandledrejection', errorHandler as EventListener);
          errorHandler = null;
        }
        
        setPagedJsProcessing(false);
        pagedJsRunningRef.current = false;
        if (pagedJsPendingRef.current) {
          // Clear flag and immediately re-run with the latest state
          pagedJsPendingRef.current = false;
          // Run in microtask to let state settle
          setTimeout(() => processWithPagedJs(), 0);
        }
      }
    };
    
    // Wait for container to mount if needed, then process
    let cancelled = false;
    const ensureAndProcess = () => {
      const container = pagedJsContainerRef.current || document.getElementById('pagedjs-container');
      if (!container) {
        if (!cancelled) setTimeout(ensureAndProcess, 50);
        return;
      }
      void processWithPagedJs();
    };
    const justOpened = (previewOpen && !prevPreviewOpenRef.current);
    // Reduced debounce from 300ms to 100ms for faster response
    const timer = setTimeout(ensureAndProcess, justOpened ? 0 : 100);
    
    return () => {
      cancelled = true;
      clearTimeout(timer);
      // Only clear the reference, not the container content
      // The container will be cleared by processWithPagedJs when it runs next
    };
  }, [previewOpen, autoPreview, itemsStringified, diagnosis, chiefComplaints, investigationsStringified, customSectionsStringified, followUpInstructions,
      paperPreset, effectiveTopMarginMm, effectiveBottomMarginMm, overrideTopMarginPx, overrideBottomMarginPx,
      activeProfileId, printerProfiles, printLeftMarginPx, printRightMarginPx, contentOffsetXPx, contentOffsetYPx, 
      designAids, frames, bleedSafe, showRefillStamp, letterheadOption, grayscale, translationsMap]); // Added translationsMap to re-process when translations complete

  // Handle page navigation
  useEffect(() => {
    if (!pagedJsContainerRef.current) return;
    
    const pages = pagedJsContainerRef.current.querySelectorAll('.pagedjs_page');
    if (pages.length === 0 || currentPreviewPage < 1 || currentPreviewPage > pages.length) return;
    
    const targetPage = pages[currentPreviewPage - 1];
    if (targetPage) {
      targetPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentPreviewPage]);

  // Autosave & history
  const draftKey = useMemo(() => `rxDraft:${patientId}:${visitId || 'standalone'}`, [patientId, visitId]);
  const pushHistory = useCallback(() => {
    const snapshot = { items: JSON.parse(JSON.stringify(items)), followUpInstructions };
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    redoStackRef.current = [];
  }, [items, followUpInstructions]);
  const saveDraftNow = useCallback(() => {
    try {
      const data = {
        items,
        followUpInstructions,
        chiefComplaints,
        diagnosis,
        pastHistory,
        medicationHistory,
        menstrualHistory,
        exObjective,
        procedures,
        procedurePlanned,
        investigations,
        customInvestigationOptions,
        vitalsHeightCm,
        vitalsWeightKg,
        vitalsBmi,
        vitalsBpSys,
        vitalsBpDia,
        vitalsPulse,
        skinConcerns: Array.from(skinConcerns),
        exSkinType,
        exMorphology: Array.from(exMorphology),
        exDistribution: Array.from(exDistribution),
        exAcneSeverity,
        exItchScore,
        exTriggers,
        exPriorTx,
        familyHistoryDM,
        familyHistoryHTN,
        familyHistoryThyroid,
        familyHistoryOthers,
        customSections,
        // Customization settings
        overrideTopMarginPx,
        overrideBottomMarginPx,
        activeProfileId,
        showRefillStamp,
        letterheadOption,
        breakBeforeMedications,
        breakBeforeInvestigations,
        breakBeforeFollowUp,
        breakBeforeSignature,
        avoidBreakInsideTables,
      };
      localStorage.setItem(draftKey, JSON.stringify(data));
    } catch {}
  }, [draftKey, items, followUpInstructions, chiefComplaints, diagnosis, pastHistory, medicationHistory, menstrualHistory, exObjective, procedures, procedurePlanned, investigations, customInvestigationOptions, vitalsHeightCm, vitalsWeightKg, vitalsBmi, vitalsBpSys, vitalsBpDia, vitalsPulse, skinConcerns, exSkinType, exMorphology, exDistribution, exAcneSeverity, exItchScore, exTriggers, exPriorTx, familyHistoryDM, familyHistoryHTN, familyHistoryThyroid, familyHistoryOthers, customSections, overrideTopMarginPx, overrideBottomMarginPx, activeProfileId, showRefillStamp, letterheadOption, breakBeforeMedications, breakBeforeInvestigations, breakBeforeFollowUp, breakBeforeSignature, avoidBreakInsideTables]);
  useEffect(() => {
    const t = setTimeout(() => { saveDraftNow(); }, 600);
    return () => clearTimeout(t);
  }, [saveDraftNow]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data?.items)) setItems(data.items);
        if (typeof data?.followUpInstructions === 'string') setFollowUpInstructions(data.followUpInstructions);
        if (typeof data?.chiefComplaints === 'string') setChiefComplaints(data.chiefComplaints);
        if (typeof data?.diagnosis === 'string') setDiagnosis(data.diagnosis);
        if (typeof data?.pastHistory === 'string') setPastHistory(data.pastHistory);
        if (typeof data?.medicationHistory === 'string') setMedicationHistory(data.medicationHistory);
        if (typeof data?.menstrualHistory === 'string') setMenstrualHistory(data.menstrualHistory);
        if (typeof data?.exObjective === 'string') setExObjective(data.exObjective);
        if (typeof data?.procedures === 'string') setProcedures(data.procedures);
        if (typeof data?.procedurePlanned === 'string') setProcedurePlanned(data.procedurePlanned);
        if (Array.isArray(data?.investigations)) {
          setInvestigations(data.investigations);
          // Extract custom investigations that aren't in the default list
          const customInvs = data.investigations.filter((inv: string) => !defaultInvestigationOptions.includes(inv));
          if (customInvs.length > 0) {
            setCustomInvestigationOptions(customInvs);
          }
        }
        // Also load saved custom investigation options (in case they were added but not selected)
        if (Array.isArray(data?.customInvestigationOptions)) {
          const savedCustomInvs = data.customInvestigationOptions.filter((inv: string) => !defaultInvestigationOptions.includes(inv));
          if (savedCustomInvs.length > 0) {
            setCustomInvestigationOptions((prev) => {
              const combined = [...prev, ...savedCustomInvs];
              // Remove duplicates
              return Array.from(new Set(combined));
            });
          }
        }
        if (data?.vitalsHeightCm !== undefined) setVitalsHeightCm(data.vitalsHeightCm);
        if (data?.vitalsWeightKg !== undefined) setVitalsWeightKg(data.vitalsWeightKg);
        if (data?.vitalsBmi !== undefined) setVitalsBmi(data.vitalsBmi);
        if (data?.vitalsBpSys !== undefined) setVitalsBpSys(data.vitalsBpSys);
        if (data?.vitalsBpDia !== undefined) setVitalsBpDia(data.vitalsBpDia);
        if (data?.vitalsPulse !== undefined) setVitalsPulse(data.vitalsPulse);
        if (Array.isArray(data?.skinConcerns)) setSkinConcerns(new Set(data.skinConcerns));
        if (typeof data?.exSkinType === 'string') setExSkinType(data.exSkinType);
        if (Array.isArray(data?.exMorphology)) setExMorphology(new Set(data.exMorphology));
        if (Array.isArray(data?.exDistribution)) setExDistribution(new Set(data.exDistribution));
        if (typeof data?.exAcneSeverity === 'string') setExAcneSeverity(data.exAcneSeverity);
        if (typeof data?.exItchScore === 'string') setExItchScore(data.exItchScore);
        if (typeof data?.exTriggers === 'string') setExTriggers(data.exTriggers);
        if (typeof data?.exPriorTx === 'string') setExPriorTx(data.exPriorTx);
        if (typeof data?.familyHistoryDM === 'boolean') setFamilyHistoryDM(data.familyHistoryDM);
        if (typeof data?.familyHistoryHTN === 'boolean') setFamilyHistoryHTN(data.familyHistoryHTN);
        if (typeof data?.familyHistoryThyroid === 'boolean') setFamilyHistoryThyroid(data.familyHistoryThyroid);
        if (typeof data?.familyHistoryOthers === 'string') setFamilyHistoryOthers(data.familyHistoryOthers);
        if (Array.isArray(data?.customSections)) setCustomSections(data.customSections);
        // Restore customization settings
        if (typeof data?.overrideTopMarginPx === 'number') setOverrideTopMarginPx(data.overrideTopMarginPx);
        if (typeof data?.overrideBottomMarginPx === 'number') setOverrideBottomMarginPx(data.overrideBottomMarginPx);
        if (typeof data?.activeProfileId === 'string') setActiveProfileId(data.activeProfileId);
        if (typeof data?.showRefillStamp === 'boolean') setShowRefillStamp(data.showRefillStamp);
        if (data?.letterheadOption === 'default' || data?.letterheadOption === 'none') setLetterheadOption(data.letterheadOption);
        if (typeof data?.breakBeforeMedications === 'boolean') setBreakBeforeMedications(data.breakBeforeMedications);
        if (typeof data?.breakBeforeInvestigations === 'boolean') setBreakBeforeInvestigations(data.breakBeforeInvestigations);
        if (typeof data?.breakBeforeFollowUp === 'boolean') setBreakBeforeFollowUp(data.breakBeforeFollowUp);
        if (typeof data?.breakBeforeSignature === 'boolean') setBreakBeforeSignature(data.breakBeforeSignature);
        if (typeof data?.avoidBreakInsideTables === 'boolean') setAvoidBreakInsideTables(data.avoidBreakInsideTables);
      }
    } catch {}
    pushHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  // Flush draft on nav/unload/back
  useEffect(() => {
    const handler = () => saveDraftNow();
    const visHandler = () => { if (document.visibilityState === 'hidden') saveDraftNow(); };
    window.addEventListener('pagehide', handler);
    window.addEventListener('beforeunload', handler);
    document.addEventListener('visibilitychange', visHandler);
    return () => {
      window.removeEventListener('pagehide', handler);
      window.removeEventListener('beforeunload', handler);
      document.removeEventListener('visibilitychange', visHandler);
    };
  }, [saveDraftNow]);
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
    <div className="space-y-6 overflow-visible">
      <div className="space-y-6">
        <div className="space-y-4">
          {/* Templates quick bar */}
            <div className="flex flex-wrap gap-2 items-end">
              <div className="min-w-[240px]">
                <label className="text-xs text-gray-600">Templates</label>
                <Select value={templateSelectValue} onValueChange={handleTemplateChange}>
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
            <CollapsibleSection 
              title="Diagnosis" 
              section="diagnosis" 
              highlight={hasDiagnosis}
              badge={hasDiagnosis ? 'Has Data' : ''}
            >
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
              <div className="space-y-3 overflow-visible">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-600">Total items: {items.length}</div>
                  <div className="flex gap-2">
                    {canAddDrugToDB && (
                      <Button size="sm" variant="ghost" onClick={openAddDrugDialog}>+ Add to Drug Database</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={addPreviousMedications} disabled={loadingPrevMeds}>
                      {loadingPrevMeds ? 'Adding...' : 'Add previous meds'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={addRowAndFocus}>Add Row</Button>
                  </div>
                </div>
                <div className="flex flex-col gap-2 text-xs">
                  {(recentDrugsForPatient.length > 0 || recentDrugsGlobal.length > 0) && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-gray-600">Recent meds:</span>
                      {(recentDrugsForPatient.length ? recentDrugsForPatient : recentDrugsGlobal).map((d) => (
                        <Button key={d} size="sm" variant="outline" onClick={() => {
                          const target = activeRowIdx ?? (items.length > 0 ? items.length - 1 : 0);
                          updateItem(target, { drugName: d });
                          if (patientId) pushRecent(`drugNames:${patientId}`, d);
                          pushRecent('drugNames', d);
                        }}>
                          {d}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-gray-600">Presets:</span>
                    {frequencyPresets.map((p) => (
                      <Button
                        key={p.label}
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const target = activeRowIdx ?? (items.length > 0 ? items.length - 1 : 0);
                          applyPresetToRow(target, {
                            dosePattern: p.pattern,
                            frequency: p.frequency ?? (p.pattern ? inferFrequencyFromDosePattern(p.pattern) ?? 'ONCE_DAILY' : undefined),
                            timing: p.pattern ? inferTimingFromDosePattern(p.pattern) || undefined : undefined,
                          });
                        }}
                      >
                        {p.label}
                      </Button>
                    ))}
                    {durationPresets.map((p) => (
                      <Button
                        key={p.label}
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const target = activeRowIdx ?? (items.length > 0 ? items.length - 1 : 0);
                          applyPresetToRow(target, { duration: p.duration, durationUnit: p.unit });
                        }}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="overflow-visible border rounded">
                  <div className="overflow-x-auto">
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
                              <Input 
                                ref={(el) => { inputRefs.current[idx] = el; }}
                                value={it.drugName} 
                                onChange={(e) => {
                                  const val = e.target.value;
                                  updateItem(idx, { drugName: val });
                                  searchDrugsForRow(idx, val);
                                }}
                                onFocus={(e) => {
                                  setActiveRowIdx(idx);
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setDropdownPosition({
                                    top: rect.bottom + window.scrollY + 4,
                                    left: rect.left + window.scrollX,
                                    width: Math.max(500, rect.width)
                                  });
                                  if (it.drugName.trim().length >= 2) {
                                    searchDrugsForRow(idx, it.drugName);
                                  }
                                }}
                                onBlur={() => {
                                  if (it.drugName.trim()) {
                                    pushRecent('drugNames', it.drugName);
                                    if (patientId) pushRecent(`drugNames:${patientId}`, it.drugName);
                                  }
                                  setTimeout(() => {
                                    if (activeSearchRow === idx) {
                                      setActiveSearchRow(null);
                                      setDropdownPosition(null);
                                    }
                                  }, 200);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    addRowAndFocus();
                                  }
                                }}
                                placeholder="Search medicine name..." 
                              />
                              <span className="text-xs text-gray-500 whitespace-nowrap">
                                Stock:{' '}
                                {(() => { const key = (it.drugName || '').trim().toLowerCase(); const stock = drugStockById[key]; return stock !== undefined ? <span className={stock <= 5 ? 'text-red-600' : 'text-gray-700'}>{stock}</span> : <span className="text-gray-400">—</span>; })()}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="grid grid-cols-2 gap-1">
                              <Select value={it.dosePattern || ''} onOpenChange={() => setActiveRowIdx(idx)} onValueChange={(v: string) => {
                                const inferred = inferFrequencyFromDosePattern(v);
                                const inferredTiming = inferTimingFromDosePattern(v);
                                const patch: any = { dosePattern: v };
                                if (inferred) patch.frequency = inferred;
                                // Only set timing if empty
                                if (!it.timing && inferredTiming) patch.timing = inferredTiming;
                                updateItem(idx, patch);
                              }}>
                                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                <SelectContent>
                                  {DOSE_PATTERN_OPTIONS.map(p => (
                                    <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select value={it.frequency} onOpenChange={() => setActiveRowIdx(idx)} onValueChange={(v: Frequency) => updateItem(idx, { frequency: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {FREQUENCY_OPTIONS.map(f => (
                                    <SelectItem key={f} value={f as Frequency}>{f.replaceAll('_',' ')}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Select value={it.timing || ''} onOpenChange={() => setActiveRowIdx(idx)} onValueChange={(v: string) => updateItem(idx, { timing: v })}>
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
                              <Input type="number" value={it.duration} onFocus={() => setActiveRowIdx(idx)} onChange={(e) => updateItem(idx, { duration: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="#" />
                              <Select value={it.durationUnit} onOpenChange={() => setActiveRowIdx(idx)} onValueChange={(v: DurationUnit) => updateItem(idx, { durationUnit: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {['DAYS','WEEKS','MONTHS','YEARS'].map(u => (
                                    <SelectItem key={u} value={u as DurationUnit}>{u}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top relative">
                            <div className="space-y-1">
                              <Input
                                value={it.instructions || ''}
                                onFocus={() => { setInstrFocusIdx(idx); setActiveRowIdx(idx); }}
                                onBlur={(e) => {
                                  setTimeout(() => setInstrFocusIdx((cur) => (cur === idx ? null : cur)), 120);
                                  updateItem(idx, { instructions: e.target.value });
                                  pushRecent('instructions', e.target.value);
                                  const byDrugKey = 'instr:' + (it.drugName || '').trim().toLowerCase();
                                  pushRecent(byDrugKey, e.target.value);
                                }}
                                onChange={(e) => updateItem(idx, { instructions: e.target.value })}
                                placeholder="e.g., Avoid alcohol"
                              />
                              {instrFocusIdx === idx && !!getInstructionSuggestions(it.drugName, it.instructions || '').length && (
                                <div className="absolute z-50 mt-1 w-[260px] bg-white border rounded shadow max-h-48 overflow-auto">
                                  {getInstructionSuggestions(it.drugName, it.instructions || '').map((s) => (
                                    <div
                                      key={s}
                                      className="px-3 py-1 text-sm hover:bg-gray-50 cursor-pointer"
                                      onMouseDown={() => {
                                        updateItem(idx, { instructions: s });
                                        const byDrugKey = 'instr:' + (it.drugName || '').trim().toLowerCase();
                                        pushRecent('instructions', s);
                                        pushRecent(byDrugKey, s);
                                        setInstrFocusIdx(null);
                                      }}
                                    >
                                      {s}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
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
              </div>
            </CollapsibleSection>


            {/* Procedures */}
            <CollapsibleSection 
              title="Procedures" 
              section="procedures" 
              highlight={hasProcedures || hasProcedurePlanned}
              badge={(hasProcedures || hasProcedurePlanned) ? "Has Data" : ""}
            >
              <div className="space-y-3 opacity-100">
                <div>
                  <label className="text-xs text-gray-600 flex items-center gap-1">Procedures{language !== 'EN' && (<Languages className="h-3 w-3 text-blue-600" aria-label="Translated on print" />)}</label>
                  <Textarea rows={2} value={procedures} onChange={(e) => setProcedures(e.target.value)} onBlur={(e) => pushRecent('procedures', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-600 flex items-center gap-1">Procedure Planned{language !== 'EN' && (<Languages className="h-3 w-3 text-blue-600" aria-label="Translated on print" />)}</label>
                  <Textarea rows={2} value={procedurePlanned} onChange={(e) => setProcedurePlanned(e.target.value)} onBlur={(e) => pushRecent('procedurePlanned', e.target.value)} />
                </div>
              </div>
            </CollapsibleSection>

            {/* Investigations */}
            <CollapsibleSection 
              title={`Investigations${language !== 'EN' ? ' (translates)' : ''}`} 
              section="investigations" 
              highlight={hasInvestigations}
              badge={hasInvestigations ? "Has Data" : ""}
            >
              <div className="opacity-100 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {investigationOptions.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={investigations.includes(opt)} onChange={(e) => setInvestigations((prev) => e.target.checked ? [...prev, opt] : prev.filter((x) => x !== opt))} />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 items-end pt-2 border-t">
                  <div className="flex-1">
                    <label className="text-xs text-gray-600 mb-1 block">Add Custom Investigation</label>
                    <Input
                      placeholder="e.g., MRI Brain, CT Scan"
                      value={newCustomInvestigation}
                      onChange={(e) => setNewCustomInvestigation(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newCustomInvestigation.trim()) {
                          e.preventDefault();
                          const trimmed = newCustomInvestigation.trim();
                          if (!investigationOptions.includes(trimmed)) {
                            setCustomInvestigationOptions((prev) => [...prev, trimmed]);
                            setInvestigations((prev) => [...prev, trimmed]);
                            setNewCustomInvestigation('');
                          }
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                          const trimmed = newCustomInvestigation.trim();
                          if (trimmed && !investigationOptions.includes(trimmed)) {
                            setCustomInvestigationOptions((prev) => [...prev, trimmed]);
                            setInvestigations((prev) => [...prev, trimmed]);
                            setNewCustomInvestigation('');
                          }
                    }}
                    disabled={!newCustomInvestigation.trim() || investigationOptions.includes(newCustomInvestigation.trim())}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
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
                      Procedures, Procedure planned, Investigations, Custom sections, and per‑medication notes. Medication names,
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
                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-sm text-gray-700">Print</span>
                  <Select value={rxPrintFormat} onValueChange={(v: 'TEXT' | 'TABLE') => setRxPrintFormat(v)} disabled={spaceOptimized}>
                    <SelectTrigger className="w-36 h-9">
                      <SelectValue placeholder="Format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TABLE">Table</SelectItem>
                      <SelectItem value="TEXT" disabled={spaceOptimized}>Text</SelectItem>
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
                {!standalone && validItems.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const url = `/dashboard/pharmacy?patientId=${encodeURIComponent(patientId)}&doctorId=${encodeURIComponent(doctorId)}${visitId ? `&visitId=${encodeURIComponent(visitId)}` : ''}`;
                      window.location.href = url;
                    }}
                  >
                    Go to Pharmacy
                  </Button>
                )}
              </div>
            </div>
        </div>

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
                /* Print is handled by opening a new window - no @media print rules needed here */
                /* Ensure a print-safe font stack with bullet glyph support */
                #pagedjs-container, #pagedjs-container * {
                  font-family: 'Fira Sans', 'Segoe UI Symbol', 'Arial Unicode MS', system-ui, sans-serif !important;
                }
                #prescription-print-root, #prescription-print-root * {
                  font-family: 'Fira Sans', 'Segoe UI Symbol', 'Arial Unicode MS', system-ui, sans-serif !important;
                  /* Ensure source content is never hidden - Paged.js needs full content */
                  visibility: visible !important;
                }
                #prescription-print-root {
                  display: none !important; /* Only hide the root container itself */
                }
                ${rxPrintFormat === 'TEXT' ? `
                  /* Text print mode - hide non-text content in Paged.js output only */
                  .pagedjs_page_content > *:not(.rx-text) { 
                    display: none !important; 
                  }
                  .pagedjs_page_content .rx-text { 
                    display: block !important; 
                  }
                ` : `
                  /* Table/normal mode - hide text format in Paged.js output */
                  .pagedjs_page_content .rx-text { 
                    display: none !important; 
                  }
                `}
                
                /* Unified Paged.js styling */
                #pagedjs-container .pagedjs_page {
                  margin: 20px auto !important;
                  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                  background: white;
                  ${grayscale ? 'filter: grayscale(100%);' : ''}
                }
                
                #pagedjs-container .pagedjs_pagebox {
                  background-image: ${letterheadOption === 'none' ? 'none' : `url('${printBgUrl ?? '/letterhead.png'}')`};
                  background-repeat: no-repeat;
                  background-position: top left;
                  background-size: ${paperPreset === 'LETTER' ? '216mm 279mm' : '210mm 297mm'};
                }
                
                /* Ensure paged.js respects @page margins */
                #pagedjs-container .pagedjs_page_content {
                  box-sizing: border-box !important;
                }
                `
              }} />
            <div id="print-preview-scroll" className="flex-1 min-h-0 overflow-auto overflow-x-auto" style={{ position: 'relative' }}>
              <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-white/90 backdrop-blur border-b text-sm">
                <div className="space-y-0.5">
                  <div className="flex flex-wrap gap-2 items-center text-gray-800">
                    <span className="font-semibold">{previewPatientName}</span>
                    <span className="text-gray-500">•</span>
                    <span>{previewDoctorName}</span>
                  </div>
                  <div className="text-xs text-gray-600">
                    Date: {new Date().toLocaleDateString()} {standaloneReason ? `• Reason: ${standaloneReason}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {summaryChips.map((chip) => (
                    <Badge key={chip.label} variant="secondary" className="text-xs">
                      {chip.label}: {chip.value}
                    </Badge>
                  ))}
                </div>
              </div>
              {previewJustUpdated && (
                <div className="absolute top-2 right-3 z-20 text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">Updated</div>
              )}
              {/* Page indicator */}
              {totalPreviewPages > 1 && (
                <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-20 text-xs px-3 py-1.5 rounded-full bg-gray-900 text-white shadow-lg">
                  Page {currentPreviewPage} of {totalPreviewPages}
                </div>
              )}
              <div style={{ 
                transform: `scale(${previewZoom})`, 
                transformOrigin: 'top left'
              }}>
              
              {/* Unified Paged.js Container (always shown) */}
                <div 
                  ref={pagedJsContainerRef}
                  id="pagedjs-container"
                  className="w-full"
                  style={{
                    minHeight: '100vh',
                  }}
                />
              
              {/* Hidden source content for Paged.js processing (overlays applied to Paged.js output) */}
              <div
                id="prescription-print-root"
                ref={printRef}
                className="bg-white text-gray-900"
                style={{
                  display: 'none', // Hidden - used only as source for Paged.js
                  fontFamily: "Fira Sans, 'Segoe UI Symbol', 'Arial Unicode MS', system-ui, sans-serif",
                  fontSize: '14px',
                }}
              >
                <div id="prescription-print-content">
                  {!spaceOptimized && (
                    <div className="text-sm text-gray-700 mb-2">{todayStr}</div>
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
                          `Patient Code: ${patientCodeDisplay || '—'}`,
                          reviewDateDisplay ? `Review Date: ${reviewDateDisplay}` : null,
                          (followUpInstructions || '').trim().length ? `Follow-up Instructions: ${tt('followUpInstructions', followUpInstructions)}` : null,
                        ].filter(Boolean);
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
                        if ((procedures || '').trim().length > 0) {
                          sections.push('');
                          sections.push('Procedures:');
                          sections.push(tt('procedures', procedures));
                        }
                        if ((procedurePlanned || '').trim().length > 0) {
                          sections.push('');
                          sections.push('Procedure Planned:');
                          sections.push(tt('procedurePlanned', procedurePlanned));
                        }
                        const printableCustomSections = (customSections || []).filter(
                          (s) => (s?.title || '').trim().length > 0 || (s?.content || '').trim().length > 0
                        );
                        if (printableCustomSections.length) {
                          sections.push('');
                          sections.push('Custom Sections:');
                          printableCustomSections.forEach((s, idx) => {
                            const title = (s.title || '').trim();
                            const content = (s.content || '').trim();
                            if (title && content) {
                              sections.push(`${tt(`custom.${idx}.title`, title)}: ${tt(`custom.${idx}.content`, content)}`);
                            } else if (title) {
                              sections.push(tt(`custom.${idx}.title`, title));
                            } else if (content) {
                              sections.push(tt(`custom.${idx}.content`, content));
                            }
                          });
                        }
                        if ((counselingText || '').trim().length > 0) {
                          sections.push('');
                          sections.push('Counseling:');
                          sections.push(tt('counseling', counselingText));
                        }
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
                    spaceOptimized ? (
                      <div className="py-2 text-sm flex flex-wrap gap-x-4 gap-y-1 items-baseline">
                        <span className="text-gray-800">{todayStr}</span>
                        <span className="font-semibold">{patientName}</span>
                        {patientAgeSex ? <span className="text-gray-700">{patientAgeSex}</span> : null}
                        {patientCodeDisplay ? <span className="text-gray-700">{patientCodeDisplay}</span> : <span className="text-gray-500">—</span>}
                        {reviewDateDisplay ? <span className="text-gray-700">Review: {reviewDateDisplay}</span> : null}
                      </div>
                    ) : (
                      <div className="flex justify-between text-sm py-3">
                        <div>
                          <div className="text-gray-600">Patient</div>
                          <div className="font-medium">{patientName}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Patient Code</div>
                          <div className="font-medium">{patientCodeDisplay || '—'}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Review Date</div>
                          <div className="font-medium">{reviewDateDisplay || '—'}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Gender / Age</div>
                          <div className="font-medium">{patientAgeSex || '—'}</div>
                        </div>
                      </div>
                    )
                  )}

                {/* Vitals (manual override) */}
                {includeSections.vitals && (vitalsHeightCm || vitalsWeightKg || vitalsBmi || vitalsBpSys || vitalsBpDia || vitalsPulse) && (
                  (() => {
                    const entries: Array<{ label: string; value: React.ReactNode }> = [];
                    if ((vitalsHeightCm !== '' && vitalsHeightCm != null) || visitVitals?.height || visitVitals?.heightCm) {
                      entries.push({ label: 'Height', value: <>{(vitalsHeightCm !== '' && vitalsHeightCm != null) ? vitalsHeightCm : (visitVitals?.height || visitVitals?.heightCm)} cm</> });
                    }
                    if ((vitalsWeightKg !== '' && vitalsWeightKg != null) || visitVitals?.weight) {
                      entries.push({ label: 'Weight', value: <>{(vitalsWeightKg !== '' && vitalsWeightKg != null) ? vitalsWeightKg : (visitVitals?.weight)} kg</> });
                    }
                    const h = (vitalsHeightCm !== '' && vitalsHeightCm != null) ? Number(vitalsHeightCm) : Number(visitVitals?.height || visitVitals?.heightCm || 0);
                    const w = (vitalsWeightKg !== '' && vitalsWeightKg != null) ? Number(vitalsWeightKg) : Number(visitVitals?.weight || 0);
                    const bmi = (vitalsBmi !== '' && vitalsBmi != null) ? vitalsBmi : (h > 0 && w > 0 ? Number((w / ((h/100)*(h/100))).toFixed(1)) : '');
                    if (bmi !== '' && bmi != null) {
                      entries.push({ label: 'BMI', value: <>{bmi}</> });
                    }
                    if (((vitalsBpSys !== '' && vitalsBpSys != null) || (vitalsBpDia !== '' && vitalsBpDia != null)) || visitVitals?.systolicBP || visitVitals?.diastolicBP || visitVitals?.bpSys || visitVitals?.bpDia) {
                      entries.push({ label: 'BP', value: <>{(vitalsBpSys !== '' && vitalsBpSys != null) ? vitalsBpSys : (visitVitals?.systolicBP || visitVitals?.bpSys || visitVitals?.bpS) || '—'}/{(vitalsBpDia !== '' && vitalsBpDia != null) ? vitalsBpDia : (visitVitals?.diastolicBP || visitVitals?.bpDia || visitVitals?.bpD) || '—'} mmHg</> });
                    }
                    if ((vitalsPulse !== '' && vitalsPulse != null) || visitVitals?.heartRate || visitVitals?.pulse || visitVitals?.pr) {
                      entries.push({ label: 'PR', value: <>{(vitalsPulse !== '' && vitalsPulse != null) ? vitalsPulse : (visitVitals?.heartRate || visitVitals?.pulse || visitVitals?.pr)} bpm</> });
                    }
                    return (
                      <div className="py-3">
                        <div className="font-semibold mb-1">Vitals</div>
                        {spaceOptimized ? (
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                            {entries.map((e, idx) => (
                              <span key={`vitals-${idx}`} className="text-gray-800"><span className="text-gray-600 mr-1">{e.label}:</span>{e.value}</span>
                            ))}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                            {entries.map((e, idx) => (
                              <div key={`vitals-${idx}`}><span className="text-gray-600 mr-1">{e.label}:</span><span className="font-medium">{e.value}</span></div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}

                {/* Diagnosis */}
                {includeSections.diagnosis && (
                  <div className="py-3 text-sm">
                    <div className={`flex flex-wrap gap-2 items-start ${spaceOptimized ? '' : 'mb-1'}`}>
                      <span className="font-semibold">Diagnosis:</span>
                      <span className="flex-1 min-w-[200px] whitespace-pre-wrap">{(diagnosis?.trim() || '').length > 0 ? tt('diagnosis', diagnosis) : '—'}</span>
                    </div>
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
                  <div className="py-3 text-sm">
                    <div className="flex flex-wrap gap-2 items-start">
                      <span className="font-semibold">History:</span>
                      <span className="flex-1 min-w-[200px] whitespace-pre-wrap">{historyLine || '—'}</span>
                    </div>
                  </div>
                )}

                {/* Family History */}
                {(familyHistoryDM || familyHistoryHTN || familyHistoryThyroid || familyHistoryOthers?.trim()?.length) && (
                  <div className="py-3 text-sm">
                    <div className="flex flex-wrap gap-2 items-start">
                      <span className="font-semibold">Family History:</span>
                      <span className="flex-1 min-w-[200px] whitespace-pre-wrap">{familyHistoryLine || '—'}</span>
                    </div>
                  </div>
                )}

                {/* Medications */}
                {includeSections.medications && (
                  <div className={`py-3 ${breakBeforeMedications ? 'pb-before-page' : ''}`}>
                    <div className="font-semibold mb-2">Rx</div>
                    {validItems.length > 0 ? (
                      rxPrintFormat === 'TABLE' ? (
                        <div className={`overflow-auto border rounded ${avoidBreakInsideTables || spaceOptimized ? 'pb-avoid-break' : ''}`}>
                          <table className="min-w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium">Medicine</th>
                                <th className="px-3 py-2 text-left font-medium">Frequency</th>
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
                    <div className="text-sm flex flex-wrap gap-2 items-start">
                      <span className="font-semibold">Investigations:</span>
                      <span className="flex-1 min-w-[200px] whitespace-pre-wrap">{investigations.map((inv, i) => tt(`investigations.${i}`, inv)).join(', ')}</span>
                    </div>
                  </div>
                )}

                {/* Counseling / Advice */}
                {(counselingText?.trim()?.length) ? (
                  <div className="py-3">
                    <div className="font-semibold mb-1">Counseling</div>
                    <div className="text-sm whitespace-pre-wrap">{tt('counseling', counselingText)}</div>
                  </div>
                ) : null}

                {/* Procedures */}
                {(procedures?.trim()?.length > 0) && (
                  <div className="py-3 text-sm">
                    <div className="flex flex-wrap gap-2 items-start">
                      <span className="font-semibold">Procedures:</span>
                      <span className="flex-1 min-w-[200px] whitespace-pre-wrap">{tt('procedures', procedures)}</span>
                    </div>
                  </div>
                )}

                {/* Procedure Planned */}
        {(procedurePlanned?.trim()?.length > 0) && (
                  <div className="py-3 text-sm">
                    <div className="flex flex-wrap gap-2 items-start">
                      <span className="font-semibold">Procedure Planned:</span>
                      <span className="flex-1 min-w-[200px] whitespace-pre-wrap">{tt('procedurePlanned', procedurePlanned)}</span>
                    </div>
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

                {/* Review Date */}
                {reviewDateDisplay ? (
                  <div className="py-3">
                    <div className="font-semibold mb-1">Review Date</div>
                    <div className="text-sm">{reviewDateDisplay}</div>
                  </div>
                ) : null}

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
                        {!spaceOptimized && <div className="text-gray-600">Signature</div>}
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
                  
                  {/* Unified Pagination Info */}
                  {pagedJsProcessing && (
                    <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                      <div className="flex items-center gap-2">
                        <span className="animate-spin">⏳</span>
                        <span>Processing pagination...</span>
                      </div>
                    </div>
                  )}

                  {/* Page Navigation Controls */}
                  {totalPreviewPages > 1 && (
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
                      value={topMarginSliderValue}
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
                      value={bottomMarginSliderValue}
                      onChange={(e) => setOverrideBottomMarginPx(Number(e.target.value))}
                    />
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => { setOverrideTopMarginPx(null); setOverrideBottomMarginPx(null); }}>Reset margins</Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={spaceOptimized} onChange={(e) => setSpaceOptimized(e.target.checked)} />
                      Space-optimized layout
                    </label>
                    <p className="text-xs text-gray-500">Inline headers for patient info, vitals, diagnosis, histories, and procedures. Forces Rx table format.</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-sm text-gray-700">Print Format</span>
                    <Select value={rxPrintFormat} onValueChange={(v: 'TEXT' | 'TABLE') => setRxPrintFormat(v)} disabled={spaceOptimized}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TABLE">Table</SelectItem>
                        <SelectItem value="TEXT" disabled={spaceOptimized}>Text</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-sm text-gray-700">Letterhead</span>
                    <Select value={letterheadOption} onValueChange={(v: 'default' | 'none') => setLetterheadOption(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select letterhead" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Letterhead ({printBgUrl ? 'Custom' : 'letterhead.png'})</SelectItem>
                        <SelectItem value="none">None (Plain)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">Applies to preview and PDF download.</p>
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
                      await apiClient.sharePrescription(prescId, { channel: 'WHATSAPP', to: phone.startsWith('+') ? phone : `+${phone}`, message: 'Your prescription is ready.' });
                      toast({ title: 'WhatsApp queued', description: 'WhatsApp message queued.' });
                    } catch (e) {
                      toast({ variant: 'destructive', title: 'WhatsApp failed', description: 'Could not send message.' });
                    }
                  }}>WhatsApp</Button>
                  <Button variant="ghost" className="col-span-2" onClick={() => document.body.classList.toggle('high-contrast')}>High contrast</Button>
                  <Button className="col-span-1" onClick={() => {
                    try {
                      // Get the rendered Paged.js content
                      const container = document.getElementById('pagedjs-container');
                      if (!container) {
                        toast({ variant: 'destructive', title: 'Print failed', description: 'No content to print.' });
                        return;
                      }
                      
                      // Collect all stylesheets from the current page
                      const stylesheets: string[] = [];
                      document.querySelectorAll('style').forEach(style => {
                        stylesheets.push(style.outerHTML);
                      });
                      document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                        stylesheets.push(link.outerHTML);
                      });
                      
                      // Open a new window with just the print content
                      const printWindow = window.open('', '_blank', 'width=800,height=600');
                      if (!printWindow) {
                        toast({ variant: 'destructive', title: 'Print blocked', description: 'Please allow popups to print.' });
                        return;
                      }
                      const closePreview = () => {
                        try { printWindow.close(); } catch {}
                        setPreviewOpen(false);
                      };
                      
                      // Write the print content to the new window with all styles from current page
                      printWindow.document.write(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                          <title>Prescription</title>
                          <link href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600&display=swap" rel="stylesheet">
                          ${stylesheets.join('\n')}
                          <style>
                            @page {
                              size: ${paperPreset === 'LETTER' ? '8.5in 11in' : 'A4'};
                              margin: 0;
                            }
                            * {
                              -webkit-print-color-adjust: exact !important;
                              print-color-adjust: exact !important;
                            }
                            html, body {
                              margin: 0;
                              padding: 0;
                            }
                            /* Remove page shadows and ensure clean print */
                            .pagedjs_page {
                              margin: 0 !important;
                              box-shadow: none !important;
                              page-break-after: always;
                            }
                            .pagedjs_page:last-child {
                              page-break-after: auto;
                            }
                            .pagedjs_pagebox {
                              background-image: ${letterheadOption === 'none' ? 'none' : `url('${printBgUrl ?? '/letterhead.png'}')`};
                              background-repeat: no-repeat;
                              background-position: top left;
                              background-size: ${paperPreset === 'LETTER' ? '216mm 279mm' : '210mm 297mm'};
                            }
                            ${grayscale ? '.pagedjs_page { filter: grayscale(100%); }' : ''}
                          </style>
                        </head>
                        <body>
                          ${container.innerHTML}
                        </body>
                        </html>
                      `);
                      printWindow.document.close();
                      
                      // Wait for fonts and images to load, then print
                      printWindow.onload = () => {
                        setTimeout(() => {
                          try { printWindow.print(); } catch (e) { console.error('Print dialog failed', e); }
                        }, 500);
                      };
                      // Ensure cleanup after print
                      printWindow.onafterprint = closePreview;
                      // Fallback if onload doesn't fire or afterprint never fires
                      setTimeout(() => {
                        try { printWindow.print(); } catch {}
                        setTimeout(closePreview, 1500);
                      }, 1000);
                    } catch (e) {
                      console.error('Browser print failed', e);
                      toast({ variant: 'destructive', title: 'Print failed', description: 'Could not open print dialog.' });
                    }
                  }}>Print</Button>
                  <Button className="col-span-1" onClick={async () => {
                    try {
                      const prescId = visitData?.prescriptionId || createdPrescriptionIdRef?.current || undefined;
                      if (!prescId) return;
                      const { fileUrl, fileName } = await apiClient.generatePrescriptionPdf(prescId, { includeAssets: useLetterheadForDownload, grayscale });
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
            setNewTplNameError('');
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
                <Input 
                  value={newTplName} 
                  onChange={(e) => { setNewTplName(e.target.value); if (newTplNameError) setNewTplNameError(''); }} 
                  placeholder="e.g., Acne follow-up (Derm)"
                  aria-invalid={!!newTplNameError}
                  aria-describedby={newTplNameError ? 'new-tpl-name-error' : undefined}
                />
                {newTplNameError ? (
                  <p id="new-tpl-name-error" className="text-sm text-red-600">{newTplNameError}</p>
                ) : null}
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
                              <Select value={it.dosePattern || ''} onValueChange={(v: string) => {
                                const inferred = inferFrequencyFromDosePattern(v);
                                const inferredTiming = inferTimingFromDosePattern(v);
                                const patch: any = { dosePattern: v };
                                if (inferred) patch.frequency = inferred;
                                if (!it.timing && inferredTiming) patch.timing = inferredTiming;
                                updateNewTplItem(idx, patch);
                              }}>
                                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                <SelectContent>
                                  {DOSE_PATTERN_OPTIONS.map(p => (
                                    <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select value={it.frequency} onValueChange={(v: Frequency) => updateNewTplItem(idx, { frequency: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {FREQUENCY_OPTIONS.map(f => (
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
                    setNewTplNameError('Template name is required');
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
                    const idemKey = `tpl-${name}-${String(Date.now())}`;
                    const doCreate = async () => {
                      await apiClient.post('/prescriptions/templates', payload, { idempotencyKey: idemKey });
                      await loadTemplates();
                      toast({ variant: 'success', title: 'Template created', description: 'New template is ready to use.' });
                      setNewTemplateOpen(false);
                      setNewTplName('');
                      setNewTplNameError('');
                    };
                    await doCreate();
                  } catch (e: any) {
                    // Inline highlighting on common errors
                    if (e?.status === 409) {
                      setNewTplNameError('A template with this name already exists.');
                    } else if (e?.status === 400) {
                      const msg = getErrorMessage(e);
                      if (msg && /name/i.test(String(msg))) setNewTplNameError(msg);
                    }
                    showTemplateCreateError(e, async () => {
                      try {
                        await apiClient.createPrescriptionTemplate(payload);
                        await loadTemplates();
                        toast({ variant: 'success', title: 'Template created', description: 'New template is ready to use.' });
                        setNewTemplateOpen(false);
                        setNewTplName('');
                        setNewTplNameError('');
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
              onChange={(e) => { setTemplateName(e.target.value); if (templateNameError) setTemplateNameError(''); }}
                autoFocus
              aria-invalid={!!templateNameError}
              aria-describedby={templateNameError ? 'template-name-error' : undefined}
              />
            {templateNameError ? (
              <p id="template-name-error" className="text-sm text-red-600">{templateNameError}</p>
            ) : null}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setTemplatePromptOpen(false);
                  setTemplateName('');
                setTemplateNameError('');
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={creatingTemplate}
                onClick={async () => {
                  const trimmed = templateName.trim();
                  if (!trimmed) {
                    toast({
                      variant: 'warning',
                      title: 'Template name required',
                      description: 'Please enter a name for the template.',
                    });
                  setTemplateNameError('Template name is required');
                    return;
                  }
                  await persistTemplate(trimmed);
                  setTemplatePromptOpen(false);
                  setTemplateName('');
                setTemplateNameError('');
                }}
              >
                Save Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Fixed position drug search dropdown - rendered outside table structure */}
      {activeSearchRow !== null && dropdownPosition && (rowDrugQueries[activeSearchRow] || '').trim().length >= 2 && (
        <div 
          className="fixed z-[10000] bg-white border-2 border-blue-500 rounded-lg shadow-2xl max-h-64 overflow-auto"
          style={{ 
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {rowLoadingDrugs[activeSearchRow] && (
            <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
          )}
          {!rowLoadingDrugs[activeSearchRow] && (!rowDrugResults[activeSearchRow] || rowDrugResults[activeSearchRow].length === 0) && (
            <div className="px-3 py-2 text-xs text-gray-500">No results found</div>
          )}
          {!rowLoadingDrugs[activeSearchRow] && rowDrugResults[activeSearchRow] && rowDrugResults[activeSearchRow].length > 0 && (
            <>
              {rowDrugResults[activeSearchRow].map((d: any, index: number) => (
                <div 
                  key={`${d.id}-${d.name}`} 
                  className={`px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 cursor-pointer border-b last:border-b-0 ${
                    index === 0 ? 'bg-green-50 border-l-4 border-l-green-500' : 
                    index < 3 ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                  }`}
                  onMouseEnter={() => prefetchDrugStockById(d.id)}
                  onClick={() => { addItemFromDrugToRow(activeSearchRow, d); }}
                  title={((): string => {
                    const stock = drugStockById[d.id];
                    if (stock === undefined) return 'Checking stock…';
                    return `Remaining stock: ${stock}`;
                  })()}
                >
                  <div className="flex-1">
                    <div className="flex items-center">
                      <div className="font-medium">
                        {highlightMatch(d.name, rowDrugQueries[activeSearchRow])}
                      </div>
                      {getRelevanceBadge(d, rowDrugQueries[activeSearchRow], index)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {highlightMatch(d.manufacturer || d.manufacturerName || d.genericName || '', rowDrugQueries[activeSearchRow])}
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); addItemFromDrugToRow(activeSearchRow, d); }}
                  >
                    Select
                  </Button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default React.memo(PrescriptionBuilder);