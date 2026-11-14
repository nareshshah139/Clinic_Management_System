'use client';

import { displayClinicTime } from '@/lib/date-display';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { PRESCRIPTION_TOP_MARGIN_PX, PRESCRIPTION_BOTTOM_MARGIN_PX, printBackgroundKey, savedPrintBackground } from '@/lib/prescription-letterhead';
import { useDoctorLetterhead } from '@/hooks/useDoctorLetterhead';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/ui/status-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Mic, 
  MicOff,
  Save, 
  Heart, 
  Thermometer, 
  Scale, 
  Gauge,
  Plus,
  Check,
  AlertCircle,
  MapPin,
  Phone,
  Mail,
  FileImage,
  Trash2,
  Download,
  Edit,
  Copy,
  CheckCircle,
  XCircle,
  Printer,
  Upload,
  History,
  Image,
  Keyboard,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Circle,
  CheckCircle2,
  MoreHorizontal
} from 'lucide-react';
import { TELE_VIDEO_CONSENT_REQUIRED, type ConsultationType } from '@/lib/tele-consultation';
import { apiClient } from '@/lib/api';
import { track } from '@/lib/analytics';
import { handleUnauthorizedRedirect } from '@/lib/authRedirect';
import { compactClinicalPatch, mergeClinicalPatch, useClinicalState, acknowledgedVisitVersion } from '@/lib/clinical-patch';
import { usePatientHistory, loadPatientHistory as fetchPatientHistory, visitEntries } from './usePatientHistory';
import { encounterTime } from '@/lib/patient-history';
import PatientHistoryVisitCard from '@/components/visits/PatientHistoryVisitCard';
import PrescriptionBuilder, { type ConsultationSummary } from '@/components/visits/PrescriptionBuilder';
import { COMPLETION_RULE, canCompleteVisit, completionSteps } from '@/lib/visit-completion';
import type VisitPhotosPanel from '@/components/visits/VisitPhotos';
import type { Patient, VisitStatus, VisitDetails, VisitPatientSummary, VisitSummary } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { ToastAction } from '@/components/ui/toast';
import { appointmentsHref } from '@/lib/appointments-link';
import { reviewBookingMessage, type ReviewBooking } from '@/lib/review-booking';
import { isUuid } from '@/lib/id';
import { appendSpeechToText, pickSpeechToTextInsert } from '@/lib/speech-to-text';
import { useSpeechToTextRecorder } from '@/hooks/useSpeechToTextRecorder';
import { NativeSelect } from '@/components/ui/native-select';

const VisitPhotos = dynamic<ComponentProps<typeof VisitPhotosPanel>>(() => import('@/components/visits/VisitPhotos'), {
  ssr: false,
  loading: () => <p className="py-6 text-sm text-muted-foreground" role="status">Loading photos…</p>,
});
const DoctorTour = dynamic(() => import('@/components/tours/DoctorTour').then((module) => module.DoctorTour), { ssr: false });

const CONSULTATION_SECTIONS = [
  { id: 'clinical', label: 'Vitals' },
  { id: 'chief-complaints', label: 'Complaints' },
  { id: 'diagnosis', label: 'Diagnosis' },
  { id: 'treatment', label: 'Treatment' },
  { id: 'investigations', label: 'Investigations' },
  { id: 'basic', label: 'Follow-up' },
] as const;

const EMPTY_CONSULTATION: ConsultationSummary = { complaint: false, diagnosis: false, plan: false, medicines: 0, vitals: false };

type VisitContextPatient = { id: string; allergies?: string | null; medicalHistory?: string | null };

interface Props {
  patientId: string;
  doctorId: string;
  doctorName?: string;
  userRole?: string;
  visitNumber?: number;
  visitDate?: string; // ISO string; falls back to today if not provided
  appointmentId?: string;
  appointmentData?: { patient?: VisitPatientSummary } | null;
  initialVisitId?: string;
  onVisitIdChange?: (visitId: string | null) => void;
  identity?: ReactNode;
  doctorControl?: ReactNode;
  visitActions?: ReactNode;
  patient?: VisitContextPatient | null;
  doctorRecord?: { id?: string; metadata?: unknown } | null;
}

interface PatientHistory {
  id: string;
  date: string;
  doctor: string;
  visitType: string;
  diagnosis: string[];
  status: string;
  photos: number;
}

type VitalsState = {
  bpS: string;
  bpD: string;
  hr: string;
  temp: string;
  weight: string;
  height: string;
  spo2: string;
  rr: string;
};

// Helper types for labs
type SimpleLabValue = { value?: string; unit?: string };
type CompositeLabValue = Record<string, SimpleLabValue>;
type LabResultsMap = Record<string, SimpleLabValue | CompositeLabValue>;
const hasLabValue = (entry: unknown): boolean => {
  if (!entry || typeof entry !== 'object') return false;
  if ('value' in entry) return String((entry as SimpleLabValue).value ?? '').trim() !== '';
  return Object.values(entry).some(hasLabValue);
};

type MedicalVisitDraftState = {
  dirtyClinicalFields?: string[];
  visitVersion?: number;
  saveConflict?: boolean;
  consultationType?: ConsultationType;
  teleVideoConsent?: boolean;
  prescriptionClinical?: Record<string, unknown>;
  labSelections?: string[];
  labResults?: LabResultsMap;
  vitals: VitalsState;
  painScore: string;
  skinConcerns: string[];
  complaints: string[];
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  skinType: string;
  morphology: string[];
  distribution: string[];
  acneSeverity: string;
  itchScore: string;
  dermDx: string[];
  procType: string;
  fluence: string;
  spotSize: string;
  passes: string;
  topicals: string;
  systemics: string;
  counseling: string;
  reviewDate: string;
  visitStatus: VisitStatus | 'draft';
};

const INITIAL_VITALS: VitalsState = {
  bpS: '',
  bpD: '',
  hr: '',
  temp: '',
  weight: '',
  height: '',
  spo2: '',
  rr: '',
};

const AUTO_SAVE_INTERVAL_MS = 8000;
const AUTO_SAVE_RETRY_MS = 15000;
const DRAFT_STORAGE_VERSION = 1;

const createDraftStorageKey = (
  doctorId: string,
  patientId: string,
  visitId?: string | null,
  appointmentId?: string,
  visitDate?: string
) => {
  const parts = ['clinic', 'visit-draft', doctorId || 'unknown-doctor', patientId || 'unknown-patient'];
  if (visitId) {
    parts.push(`visit-${visitId}`);
  } else if (appointmentId) {
    parts.push(`appt-${appointmentId}`);
  } else if (visitDate) {
    parts.push(`date-${visitDate}`);
  } else {
    parts.push('new');
  }
  return parts.join(':');
};

const DERM_DIAGNOSES = [
  'Acne vulgaris','Atopic dermatitis','Psoriasis','Tinea corporis','Melasma','Post-inflammatory hyperpigmentation','Urticaria','Rosacea','Seborrheic dermatitis','Lichen planus','Vitiligo'
];

const MORPHOLOGY = ['Macule','Papule','Pustule','Nodule','Plaque','Vesicle','Scale','Erosion','Ulcer','Comedo'];
const DISTRIBUTION = ['Face','Scalp','Neck','Trunk','Arms','Legs','Hands','Feet','Flexures','Extensors','Generalized'];
const FITZPATRICK = ['I','II','III','IV','V','VI'];

const ROLE_PERMISSIONS = {
  THERAPIST: ['vitals', 'photos', 'basic-assessment'],
  NURSE: ['vitals', 'photos', 'basic-assessment', 'complaints'],
  DOCTOR: ['all'],
  RECEPTION: ['photos', 'basic-info'],
  ADMIN: ['all'],
  OWNER: ['all'],
};

/**
 * @cc [owner:nareshshah139,label:product] visit-save-version
 * Existing-visit saves MUST send the version loaded or acknowledged by this form.
 * A conflict MUST preserve edits and stop automatic retries, including after new
 * edits and reopening. Only explicit discard may replace a conflicting draft
 * with a fresh server baseline. Mutation receipts MUST NOT rebase a known
 * conflict; otherwise delayed successes MUST NOT lower its version.
 * Completed status MUST come from the server, including walk-ins and drafts.
 */
/**
 * @cc [owner:nareshshah139,label:product] consultation-consent-form
 * New visits default to In-person. Tele-video saves and exports MUST be blocked
 * until consent is checked; visit recovery MUST restore the consultation choice.
 */
function MedicalVisitFormEditor({ patientId, doctorId, doctorName, userRole = 'DOCTOR', visitNumber = 1, visitDate, appointmentId, appointmentData, initialVisitId, onVisitIdChange, identity, doctorControl, visitActions, patient, doctorRecord, initialVisitSnapshot, onDiscardLocalDraft }: Props & { initialVisitSnapshot?: VisitDetails; onDiscardLocalDraft: (saved: VisitDetails) => void }) {
  const visitVersionRef = useRef<number | undefined>(undefined);
  const restoredDraftVersion = useRef<number | undefined>(undefined);
  const automaticSaveBlocked = useRef(false);
  const acknowledgeMutationVersion = useCallback((version: number | undefined) => {
    if (!automaticSaveBlocked.current) {
      visitVersionRef.current = acknowledgedVisitVersion(visitVersionRef.current, version);
    }
  }, []);
  const discardDraftRef = useRef(false);
  const [saveConflict, setSaveConflict] = useState(false);
  const [reloadingSavedVisit, setReloadingSavedVisit] = useState(false);
  const dirtyClinicalFields = useRef(new Set<string>());
  const clinicalField = <T,>(field: string, value: T): T | undefined => Array.from(dirtyClinicalFields.current).some(path => path === field || path.startsWith(`${field}.`)) ? value : undefined;
  const parseJsonValue = useCallback(<T,>(value: unknown): T | undefined => {
    if (!value) return undefined;
    if (typeof value === 'object') return value as T;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }, []);

  const [consultationType, setConsultationType] = useState<ConsultationType | undefined>(initialVisitId || appointmentId ? undefined : 'IN_PERSON');
  const [teleVideoConsent, setTeleVideoConsent] = useState(false);
  const consentMissing = consultationType === 'TELE_VIDEO' && !teleVideoConsent;

  // Core visit data
  const [visitId, setVisitId] = useState<string | null>(initialVisitSnapshot?.id || initialVisitId || null);
  useEffect(() => {
    onVisitIdChange?.(visitId);
  }, [visitId, onVisitIdChange]);
  const [currentVisitNumber, setCurrentVisitNumber] = useState(visitNumber);
  const [visitStatus, setVisitStatus] = useState<VisitStatus | 'draft'>('draft');
  
  const [activeTab, setActiveTab] = useState(() => {
    const permissions: string[] = ROLE_PERMISSIONS[userRole as keyof typeof ROLE_PERMISSIONS] || [];
    if (permissions.includes('all')) return 'consultation';
    return ['vitals', 'photos'].find((tab) => permissions.includes(tab)) ?? 'history';
  });
  const [consultation, setConsultation] = useState<ConsultationSummary>(EMPTY_CONSULTATION);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  const receiveConsultationSummary = useCallback((next: ConsultationSummary) => {
    setConsultation((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, []);
  
  // Basic info (Therapist/Nurse level - 20-25%)
  const [vitals, setVitals, hydrateVitals] = useClinicalState<VitalsState>({ ...INITIAL_VITALS }, 'vitals', dirtyClinicalFields);
  const [painScore, setPainScore, hydratePainScore] = useClinicalState('', 'painScore', dirtyClinicalFields);
  const [skinConcerns, setSkinConcerns, hydrateSkinConcerns] = useClinicalState<Set<string>>(new Set(), 'skinConcerns', dirtyClinicalFields);
  
  // Complaints (Nurse+ level - 35-40%)
  const [complaints, setComplaints, hydrateComplaints] = useClinicalState<string[]>([], 'complaints', dirtyClinicalFields);

  // Doctor level (remaining 75-80%)
  const [subjective, setSubjective, hydrateSubjective] = useClinicalState('', 'subjective', dirtyClinicalFields);
  const [objective, setObjective, hydrateObjective] = useClinicalState('', 'objective', dirtyClinicalFields);
  const [assessment, setAssessment, hydrateAssessment] = useClinicalState('', 'assessment', dirtyClinicalFields);
  const [plan, setPlan, hydratePlan] = useClinicalState('', 'plan', dirtyClinicalFields);

  // Dermatology-specific
  const [skinType, setSkinType, hydrateSkinType] = useClinicalState<string>('', 'skinType', dirtyClinicalFields);
  const [morphology, setMorphology, hydrateMorphology] = useClinicalState<Set<string>>(new Set(), 'morphology', dirtyClinicalFields);
  const [distribution, setDistribution, hydrateDistribution] = useClinicalState<Set<string>>(new Set(), 'distribution', dirtyClinicalFields);
  const [acneSeverity, setAcneSeverity, hydrateAcneSeverity] = useClinicalState<string>('', 'acneSeverity', dirtyClinicalFields);
  const [itchScore, setItchScore, hydrateItchScore] = useClinicalState<string>('', 'itchScore', dirtyClinicalFields);
  const [dermDx, setDermDx, hydrateDermDx] = useClinicalState<Set<string>>(new Set(), 'dermDx', dirtyClinicalFields);
  const [procType, setProcType, hydrateProcType] = useClinicalState<string>('', 'procType', dirtyClinicalFields);
  const [fluence, setFluence, hydrateFluence] = useClinicalState<string>('', 'fluence', dirtyClinicalFields);
  const [spotSize, setSpotSize, hydrateSpotSize] = useClinicalState<string>('', 'spotSize', dirtyClinicalFields);
  const [passes, setPasses, hydratePasses] = useClinicalState<string>('', 'passes', dirtyClinicalFields);
  const [topicals, setTopicals, hydrateTopicals] = useClinicalState<string>('', 'topicals', dirtyClinicalFields);
  const [systemics, setSystemics, hydrateSystemics] = useClinicalState<string>('', 'systemics', dirtyClinicalFields);
  const [counseling, setCounseling, hydrateCounseling] = useClinicalState<string>('', 'counseling', dirtyClinicalFields);
  const [reviewDate, setReviewDate, hydrateReviewDate] = useClinicalState<string>('', 'reviewDate', dirtyClinicalFields);
  
  const [labSelections, setLabSelections, hydrateLabSelections] = useClinicalState<string[]>([], 'labSelections', dirtyClinicalFields);
  const [labResults, setLabResults, hydrateLabResults] = useClinicalState<LabResultsMap>({}, 'labResults', dirtyClinicalFields);
  const [labsAutofillLoading, setLabsAutofillLoading] = useState(false);
  const [compareLabs, setCompareLabs] = useState(false);
  const [prevLabResults, setPrevLabResults] = useState<LabResultsMap>({});

  // Default units and composite breakdowns for common investigations
  const SIMPLE_TEST_UNITS: Record<string, string> = useMemo(() => ({
    ESR: 'mm/hr',
    CRP: 'mg/L',
    Creatinine: 'mg/dL',
    FBS: 'mg/dL',
    RBS: 'mg/dL',
    'Fasting Insulin': 'µIU/mL',
    HbA1c: '%',
    'Vitamin D': 'ng/mL',
    'Vitamin B12': 'pg/mL',
    Ferritin: 'ng/mL',
    TSH: 'µIU/mL',
  }), []);

  const COMPOSITE_TESTS: Record<string, Record<string, string>> = useMemo(() => ({
    CBC: { 'Hemoglobin': 'g/dL', 'WBC': '10^9/L', 'Platelets': '10^9/L' },
    LFT: { 'AST (SGOT)': 'U/L', 'ALT (SGPT)': 'U/L', 'Bilirubin Total': 'mg/dL', 'Bilirubin Direct': 'mg/dL', 'Bilirubin Indirect': 'mg/dL' },
    RFT: { 'Urea': 'mg/dL', 'Creatinine': 'mg/dL' },
    'Fasting lipid profile': { 'Total Cholesterol': 'mg/dL', 'Triglycerides': 'mg/dL', 'HDL': 'mg/dL', 'LDL': 'mg/dL' },
    'Thyroid profile': { 'TSH': 'µIU/mL', 'T3': 'ng/dL', 'T4': 'ng/dL' },
  }), []);

  useEffect(() => {
    // Ensure labResults has entries for selected tests with default units/subtests
    const reconcile = (prev: LabResultsMap) => {
      const next: typeof prev = { ...prev };
      // Add new selections
      for (const test of labSelections) {
        if (!next[test]) {
          if (COMPOSITE_TESTS[test]) {
            const subs = COMPOSITE_TESTS[test];
            const subObj: Record<string, { value?: string; unit?: string }> = {};
            Object.keys(subs).forEach((sub) => { subObj[sub] = { value: '', unit: subs[sub] }; });
            next[test] = subObj;
          } else {
            next[test] = { value: '', unit: SIMPLE_TEST_UNITS[test] || '' };
          }
        }
      }
      // Remove deselections
      Object.keys(next).forEach((k) => { if (!labSelections.includes(k)) delete next[k]; });
      return next;
    };
    if (dirtyClinicalFields.current.has('labSelections')) setLabResults(reconcile);
    else hydrateLabResults(reconcile(labResults));
  }, [labSelections, COMPOSITE_TESTS, SIMPLE_TEST_UNITS]);

  // Load previous visit's lab results for comparison
  useEffect(() => {
    let isActive = true;
    const loadPrev = async () => {
      try {
        if (!patientId) return;
        const list: any[] = visitEntries(await fetchPatientHistory(patientId));
        // When resuming an older visit, compare with its predecessor, not a future visit.
        const currentIndex = list.findIndex((entry: any) => entry.id === visitId);
        const prev = list[currentIndex < 0 ? 0 : currentIndex + 1];
        let prevPlan: any = undefined;
        if (prev && prev.plan) {
          if (typeof prev.plan === 'string') {
            try { prevPlan = JSON.parse(prev.plan); } catch {}
          } else if (typeof prev.plan === 'object') {
            prevPlan = prev.plan;
          }
        }
        const prevDerm = prevPlan?.dermatology || {};
        const labs: LabResultsMap = (prevDerm?.labResults && typeof prevDerm.labResults === 'object') ? prevDerm.labResults as LabResultsMap : {};
        if (isActive) setPrevLabResults(labs || {});
      } catch {
        if (isActive) setPrevLabResults({});
      }
    };
    loadPrev();
    return () => { isActive = false; };
  }, [patientId, visitId]);
  
  // Patient history
  const timeline = usePatientHistory(patientId);
  const prescriptionClinicalRef = useRef<Record<string, unknown>>({});
  const [prescriptionClinical, setPrescriptionClinical] = useState<Record<string, unknown>>({});
  const receiveClinicalData = useCallback((patch: Record<string, unknown>) => {
    const next = patch || {};
    if (JSON.stringify(next) === JSON.stringify(prescriptionClinicalRef.current)) return;
    // Both tabs edit vitals. Apply only changed editor fields to the shared values,
    // so an unrelated editor change cannot restore an older blood-pressure reading.
    const previousVitals = (prescriptionClinicalRef.current.vitals || {}) as Record<string, unknown>;
    const nextVitals = (next.vitals || {}) as Record<string, unknown>;
    const vitalKeys: Record<string, keyof VitalsState> = { systolicBP: 'bpS', diastolicBP: 'bpD', heartRate: 'hr', temperature: 'temp', weight: 'weight', height: 'height', oxygenSaturation: 'spo2', respiratoryRate: 'rr' };
    const changes: Partial<VitalsState> = {};
    for (const [key, value] of Object.entries(nextVitals)) {
      if (vitalKeys[key] && value !== previousVitals[key]) {
        changes[vitalKeys[key]] = value == null || value === '' ? '' : String(key === 'temperature' ? Number(value) * 9 / 5 + 32 : value);
      }
    }
    if (Object.keys(changes).length) setVitals(current => ({ ...current, ...changes }));
    prescriptionClinicalRef.current = next;
    setPrescriptionClinical(next);
  }, []);
  useEffect(() => { prescriptionClinicalRef.current = {}; setPrescriptionClinical({}); }, [patientId]);
  const [patientHistory, setPatientHistory] = useState<VisitSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'unsaved' | 'autosaving' | 'saved' | 'saving' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Print customization (moved from PrescriptionBuilder)
  // Custom background override; empty means the doctor's own letterhead.
  const [printBgUrl, setPrintBgUrl] = useState<string>('');
  const [printTopMarginPx, setPrintTopMarginPx] = useState<number>(PRESCRIPTION_TOP_MARGIN_PX);
  const [printLeftMarginPx, setPrintLeftMarginPx] = useState<number>(45);
  const [printRightMarginPx, setPrintRightMarginPx] = useState<number>(45);
  const [printBottomMarginPx, setPrintBottomMarginPx] = useState<number>(PRESCRIPTION_BOTTOM_MARGIN_PX);
  const [contentOffsetXPx, setContentOffsetXPx] = useState<number>(0);
  const [contentOffsetYPx, setContentOffsetYPx] = useState<number>(0);
  const [designAidsEnabled, setDesignAidsEnabled] = useState<boolean>(false);
  const [designShowGrid, setDesignShowGrid] = useState<boolean>(true);
  const [designShowRulers, setDesignShowRulers] = useState<boolean>(true);
  const [designSnapToGrid, setDesignSnapToGrid] = useState<boolean>(true);
  const [designGridSizePx, setDesignGridSizePx] = useState<number>(8);
  const [designNudgeStepPx, setDesignNudgeStepPx] = useState<number>(1);
  const [paperPreset, setPaperPreset] = useState<'A4' | 'LETTER'>('A4');
  const [showBleedSafe, setShowBleedSafe] = useState<boolean>(false);
  const [safeMarginMm, setSafeMarginMm] = useState<number>(5);
  const [grayscaleMode, setGrayscaleMode] = useState<boolean>(false);
  const [framesEnabled, setFramesEnabled] = useState<boolean>(false);
  const [headerHeightMm, setHeaderHeightMm] = useState<number>(20);
  const [footerHeightMm, setFooterHeightMm] = useState<number>(20);

  // File picker for print background image
  const printBgFileRef = useRef<HTMLInputElement>(null);

  // Persist customization locally so users keep their letterhead and layout
  useEffect(() => {
    try {
      const top = localStorage.getItem('rx_margin_top_px');
      const left = localStorage.getItem('rx_margin_left_px');
      const right = localStorage.getItem('rx_margin_right_px');
      const bottom = localStorage.getItem('rx_margin_bottom_px');
      const offx = localStorage.getItem('rx_offset_x_px');
      const offy = localStorage.getItem('rx_offset_y_px');
      const daEnabled = localStorage.getItem('rx_da_enabled');
      const daGrid = localStorage.getItem('rx_da_grid');
      const daRulers = localStorage.getItem('rx_da_rulers');
      const daSnap = localStorage.getItem('rx_da_snap');
      const daGridSize = localStorage.getItem('rx_da_grid_size');
      const daNudge = localStorage.getItem('rx_da_nudge');
      const preset = localStorage.getItem('rx_paper_preset');
      const bleed = localStorage.getItem('rx_show_bleed_safe');
      const safe = localStorage.getItem('rx_safe_margin_mm');
      const gray = localStorage.getItem('rx_grayscale');
      const frames = localStorage.getItem('rx_frames_enabled');
      const headerMm = localStorage.getItem('rx_header_mm');
      const footerMm = localStorage.getItem('rx_footer_mm');
      if (top) setPrintTopMarginPx(Number(top));
      if (left) setPrintLeftMarginPx(Number(left));
      if (right) setPrintRightMarginPx(Number(right));
      if (bottom) setPrintBottomMarginPx(Number(bottom));
      if (offx) setContentOffsetXPx(Number(offx));
      if (offy) setContentOffsetYPx(Number(offy));
      if (daEnabled) setDesignAidsEnabled(daEnabled === '1');
      if (daGrid) setDesignShowGrid(daGrid === '1');
      if (daRulers) setDesignShowRulers(daRulers === '1');
      if (daSnap) setDesignSnapToGrid(daSnap === '1');
      if (daGridSize) setDesignGridSizePx(Number(daGridSize));
      if (daNudge) setDesignNudgeStepPx(Number(daNudge));
      if (preset === 'LETTER' || preset === 'A4') setPaperPreset(preset);
      if (bleed) setShowBleedSafe(bleed === '1');
      if (safe) setSafeMarginMm(Number(safe));
      if (gray) setGrayscaleMode(gray === '1');
      if (frames) setFramesEnabled(frames === '1');
      if (headerMm) setHeaderHeightMm(Number(headerMm));
      if (footerMm) setFooterHeightMm(Number(footerMm));
    } catch {}
  }, []);
  /** Applies a doctor's saved print layout (margins, offsets, design aids); the letterhead is resolved separately. */
  /**
   * @cc [owner:nareshshah139,label:product] doctor-print-layout-default
   * Opening a visit MUST apply the visit doctor's saved print layout when one exists, so each
   * doctor prints with their own margins without loading it by hand. Without a saved layout the
   * existing browser settings stay in effect.
   */
  const applyDoctorPrintLayout = useCallback((p: any) => {
    if (p.margins) {
      if (typeof p.margins.topPx === 'number') setPrintTopMarginPx(p.margins.topPx);
      if (typeof p.margins.leftPx === 'number') setPrintLeftMarginPx(p.margins.leftPx);
      if (typeof p.margins.rightPx === 'number') setPrintRightMarginPx(p.margins.rightPx);
      if (typeof p.margins.bottomPx === 'number') setPrintBottomMarginPx(p.margins.bottomPx);
    }
    if (p.contentOffset) {
      if (typeof p.contentOffset.xPx === 'number') setContentOffsetXPx(p.contentOffset.xPx);
      if (typeof p.contentOffset.yPx === 'number') setContentOffsetYPx(p.contentOffset.yPx);
    }
    if (p.designAids) {
      if (typeof p.designAids.enabled === 'boolean') setDesignAidsEnabled(p.designAids.enabled);
      if (typeof p.designAids.showGrid === 'boolean') setDesignShowGrid(p.designAids.showGrid);
      if (typeof p.designAids.showRulers === 'boolean') setDesignShowRulers(p.designAids.showRulers);
      if (typeof p.designAids.snapToGrid === 'boolean') setDesignSnapToGrid(p.designAids.snapToGrid);
      if (typeof p.designAids.gridSizePx === 'number') setDesignGridSizePx(p.designAids.gridSizePx);
      if (typeof p.designAids.nudgeStepPx === 'number') setDesignNudgeStepPx(p.designAids.nudgeStepPx);
    }
  }, []);

  useEffect(() => {
    if (!doctorId) return;
    let cancelled = false;
    (async () => {
      try {
        const u = (doctorRecord?.id === doctorId ? doctorRecord : await apiClient.get(`/users/${encodeURIComponent(doctorId)}`)) as any;
        const p = (u && (u.metadata || u?.user?.metadata)?.rxPrintProfile) || u?.rxPrintProfile;
        if (!cancelled && p) applyDoctorPrintLayout(p);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [doctorId, doctorRecord, applyDoctorPrintLayout]);

  // The background override is kept per doctor so one doctor's choice never prints on another's prescriptions.
  const { letterhead: doctorLetterhead, loading: doctorLetterheadLoading } = useDoctorLetterhead(doctorId);
  const printBgLoadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (doctorLetterheadLoading) return;
    let saved = '';
    try { saved = savedPrintBackground(localStorage, doctorId, doctorLetterhead?.source); } catch {}
    setPrintBgUrl(saved);
    printBgLoadedFor.current = doctorId;
  }, [doctorId, doctorLetterhead?.source, doctorLetterheadLoading]);
  useEffect(() => {
    if (printBgLoadedFor.current !== doctorId) return;
    try { localStorage.setItem(printBackgroundKey(doctorId), printBgUrl || ''); } catch {}
  }, [doctorId, printBgUrl]);
  useEffect(() => { try { localStorage.setItem('rx_margin_top_px', String(printTopMarginPx)); } catch {} }, [printTopMarginPx]);
  useEffect(() => { try { localStorage.setItem('rx_margin_left_px', String(printLeftMarginPx)); } catch {} }, [printLeftMarginPx]);
  useEffect(() => { try { localStorage.setItem('rx_margin_right_px', String(printRightMarginPx)); } catch {} }, [printRightMarginPx]);
  useEffect(() => { try { localStorage.setItem('rx_margin_bottom_px', String(printBottomMarginPx)); } catch {} }, [printBottomMarginPx]);
  useEffect(() => { try { localStorage.setItem('rx_offset_x_px', String(contentOffsetXPx)); } catch {} }, [contentOffsetXPx]);
  useEffect(() => { try { localStorage.setItem('rx_offset_y_px', String(contentOffsetYPx)); } catch {} }, [contentOffsetYPx]);
  useEffect(() => { try { localStorage.setItem('rx_da_enabled', designAidsEnabled ? '1' : '0'); } catch {} }, [designAidsEnabled]);
  useEffect(() => { try { localStorage.setItem('rx_da_grid', designShowGrid ? '1' : '0'); } catch {} }, [designShowGrid]);
  useEffect(() => { try { localStorage.setItem('rx_da_rulers', designShowRulers ? '1' : '0'); } catch {} }, [designShowRulers]);
  useEffect(() => { try { localStorage.setItem('rx_da_snap', designSnapToGrid ? '1' : '0'); } catch {} }, [designSnapToGrid]);
  useEffect(() => { try { localStorage.setItem('rx_da_grid_size', String(designGridSizePx)); } catch {} }, [designGridSizePx]);
  useEffect(() => { try { localStorage.setItem('rx_da_nudge', String(designNudgeStepPx)); } catch {} }, [designNudgeStepPx]);
  useEffect(() => { try { localStorage.setItem('rx_paper_preset', paperPreset); } catch {} }, [paperPreset]);
  useEffect(() => { try { localStorage.setItem('rx_show_bleed_safe', showBleedSafe ? '1' : '0'); } catch {} }, [showBleedSafe]);
  useEffect(() => { try { localStorage.setItem('rx_safe_margin_mm', String(safeMarginMm)); } catch {} }, [safeMarginMm]);
  useEffect(() => { try { localStorage.setItem('rx_grayscale', grayscaleMode ? '1' : '0'); } catch {} }, [grayscaleMode]);
  useEffect(() => { try { localStorage.setItem('rx_frames_enabled', framesEnabled ? '1' : '0'); } catch {} }, [framesEnabled]);
  useEffect(() => { try { localStorage.setItem('rx_header_mm', String(headerHeightMm)); } catch {} }, [headerHeightMm]);
  useEffect(() => { try { localStorage.setItem('rx_footer_mm', String(footerHeightMm)); } catch {} }, [footerHeightMm]);
  const [rxIncludeSections, setRxIncludeSections] = useState<Record<string, boolean>>({
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

  const { toast } = useToast();

  // Live photo count from VisitPhotos
  const [photoCount, setPhotoCount] = useState<number>(0);

  const draftStorageKey = useMemo(
    () => createDraftStorageKey(doctorId, patientId, visitId, appointmentId, visitDate),
    [doctorId, patientId, visitId, appointmentId, visitDate]
  );

  const hasUnsavedChangesRef = useRef(false);
  const autoSaveTimerRef = useRef<number | null>(null);
  const autoSavePromiseRef = useRef<Promise<void> | null>(null);
  const autoSaveSuccessNotifiedRef = useRef(false);
  const autoSaveFailureNotifiedRef = useRef(false);
  const lastDraftJsonRef = useRef<string | null>(null);
  const lastStorageKeyRef = useRef<string | null>(null);
  const justSavedRef = useRef(false);
  const lastIdempotencyKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const lastEditSignatureRef = useRef<string | null>(null);
  const editBaselineRef = useRef<string | null>(null);
  const hydratedValues = useRef(new Map<string, string>());

  const visitSaveAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  /**
   * @cc [owner:nareshshah139,label:product] visit-save-attempt-identity
   * Retries of one failed payload reuse a key, but a later save after success or
   * a changed payload MUST use a new key, including Tele-video/In-person reversals.
   */
  const buildIdempotencyKey = useCallback((method: 'POST' | 'PATCH', rid: string | null, payload: Record<string, unknown>) => {
    const base = JSON.stringify(payload);
    const scope = rid ? `visits:${rid}` : `visits:create:${patientId}:${doctorId}:${appointmentId || ''}`;
    const fingerprint = `${method}:${scope}:${base}`;
    if (visitSaveAttempt.current?.fingerprint !== fingerprint) {
      const nonce = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      visitSaveAttempt.current = { fingerprint, key: `cms:${method}:${scope}:${nonce}` };
    }
    return visitSaveAttempt.current.key;
  }, [appointmentId, doctorId, patientId]);

  const clearAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  const serializeDraft = useCallback((): MedicalVisitDraftState => ({
    dirtyClinicalFields: Array.from(dirtyClinicalFields.current),
    visitVersion: visitVersionRef.current,
    saveConflict: automaticSaveBlocked.current,
    consultationType,
    teleVideoConsent,
    prescriptionClinical,
    labSelections,
    labResults,
    vitals,
    painScore,
    skinConcerns: Array.from(skinConcerns),
    complaints,
    subjective,
    objective,
    assessment,
    plan,
    skinType,
    morphology: Array.from(morphology),
    distribution: Array.from(distribution),
    acneSeverity,
    itchScore,
    dermDx: Array.from(dermDx),
    procType,
    fluence,
    spotSize,
    passes,
    topicals,
    systemics,
    counseling,
    reviewDate,
    visitStatus,
  }), [
    prescriptionClinical,
    labSelections,
    labResults,
    assessment,
    complaints,
    counseling,
    dermDx,
    distribution,
    fluence,
    itchScore,
    morphology,
    objective,
    painScore,
    passes,
    plan,
    procType,
    reviewDate,
    skinConcerns,
    skinType,
    spotSize,
    subjective,
    systemics,
    topicals,
    vitals,
    visitStatus,
    acneSeverity,
    consultationType,
    teleVideoConsent,
    dirtyClinicalFields.current,
  ]);

  /**
   * @cc [owner:nareshshah139,label:product] visit-unsaved-means-edited
   * Unsaved changes MUST mean the doctor edited a field since the visit loaded or
   * last saved. Server loads, restored saved drafts, save receipts and the
   * prescription editor's echoed consultation type and personal history MUST NOT.
   */
  const editSignature = useCallback((draft: MedicalVisitDraftState) => {
    const sinceHydration = (key: string, value: unknown) => {
      if (value === undefined) return undefined;
      const json = JSON.stringify(value);
      if (!hydratedValues.current.has(key)) hydratedValues.current.set(key, json);
      return hydratedValues.current.get(key) === json ? undefined : value;
    };
    const { consultationType: _type, teleVideoConsent: _consent, history, ...rx } = draft.prescriptionClinical ?? {};
    const { personalHistory, ...rxHistory } = (history ?? {}) as Record<string, unknown>;
    const valueAt = (path: string) => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], draft);
    return JSON.stringify({
      edited: [...(draft.dirtyClinicalFields ?? [])].sort().map((path) => [path, valueAt(path)]),
      consultation: sinceHydration('consultation', draft.consultationType && [draft.consultationType, draft.teleVideoConsent]),
      rx: { ...rx, history: rxHistory, personalHistory: sinceHydration('personalHistory', personalHistory) },
    });
  }, []);

  const latestDraftStateRef = useRef(serializeDraft());
  latestDraftStateRef.current = serializeDraft();

  const applyDraft = useCallback((draft: MedicalVisitDraftState) => {
    if (visitVersionRef.current === undefined && draft.visitVersion !== undefined) {
      visitVersionRef.current = draft.visitVersion;
      restoredDraftVersion.current = draft.visitVersion;
    }
    if (draft.saveConflict) {
      automaticSaveBlocked.current = true;
      setSaveConflict(true);
    }
    if (draft.consultationType) {
      setConsultationType(draft.consultationType);
      setTeleVideoConsent(draft.consultationType === 'TELE_VIDEO' && draft.teleVideoConsent === true);
    }
    if (draft.prescriptionClinical) receiveClinicalData(draft.prescriptionClinical);
    if (draft.labSelections) hydrateLabSelections(draft.labSelections, draft.dirtyClinicalFields ?? 'populated');
    if (draft.labResults) hydrateLabResults(draft.labResults, draft.dirtyClinicalFields ?? 'populated');
    hydrateVitals(draft.vitals || { ...INITIAL_VITALS }, draft.dirtyClinicalFields ?? 'populated');
    hydratePainScore(draft.painScore || '', draft.dirtyClinicalFields ?? 'populated');
    hydrateSkinConcerns(new Set(draft.skinConcerns || []), draft.dirtyClinicalFields ?? 'populated');
    hydrateComplaints(draft.complaints || [], draft.dirtyClinicalFields ?? 'populated');
    hydrateSubjective(draft.subjective || '', draft.dirtyClinicalFields ?? 'populated');
    hydrateObjective(draft.objective || '', draft.dirtyClinicalFields ?? 'populated');
    hydrateAssessment(draft.assessment || '', draft.dirtyClinicalFields ?? 'populated');
    hydratePlan(draft.plan || '', draft.dirtyClinicalFields ?? 'populated');
    hydrateSkinType(draft.skinType || '', draft.dirtyClinicalFields ?? 'populated');
    hydrateMorphology(new Set(draft.morphology || []), draft.dirtyClinicalFields ?? 'populated');
    hydrateDistribution(new Set(draft.distribution || []), draft.dirtyClinicalFields ?? 'populated');
    hydrateAcneSeverity(draft.acneSeverity || '', draft.dirtyClinicalFields ?? 'populated');
    hydrateItchScore(draft.itchScore || '', draft.dirtyClinicalFields ?? 'populated');
    hydrateDermDx(new Set(draft.dermDx || []), draft.dirtyClinicalFields ?? 'populated');
    hydrateProcType(draft.procType || '', draft.dirtyClinicalFields ?? 'populated');
    hydrateFluence(draft.fluence || '', draft.dirtyClinicalFields ?? 'populated');
    hydrateSpotSize(draft.spotSize || '', draft.dirtyClinicalFields ?? 'populated');
    hydratePasses(draft.passes || '', draft.dirtyClinicalFields ?? 'populated');
    hydrateTopicals(draft.topicals || '', draft.dirtyClinicalFields ?? 'populated');
    hydrateSystemics(draft.systemics || '', draft.dirtyClinicalFields ?? 'populated');
    hydrateCounseling(draft.counseling || '', draft.dirtyClinicalFields ?? 'populated');
    hydrateReviewDate(draft.reviewDate || '', draft.dirtyClinicalFields ?? 'populated');

  }, [receiveClinicalData]);

  const persistDraftToStorage = useCallback(
    (force = false, draftOverride?: MedicalVisitDraftState) => {
      if (discardDraftRef.current || !draftStorageKey || typeof window === 'undefined') return false;
      try {
    const payload = draftOverride ?? serializeDraft();
    const record = {
      version: DRAFT_STORAGE_VERSION,
      saved: force || !hasUnsavedChangesRef.current,
      visitId,
      doctorId,
      patientId,
      appointmentId,
      visitDate,
      data: payload,
    };
    const serialized = JSON.stringify(record);
        if (!force && serialized === lastDraftJsonRef.current) {
          return false;
        }
        window.localStorage.setItem(draftStorageKey, serialized);
        lastDraftJsonRef.current = serialized;
        lastStorageKeyRef.current = draftStorageKey;
        if (force) {
          hasUnsavedChangesRef.current = false;
        }
        return true;
      } catch (error) {
        console.warn('Failed to persist draft locally', error);
        return false;
      }
    },
    [
      draftStorageKey,
      serializeDraft,
      visitId,
      doctorId,
      patientId,
      appointmentId,
      visitDate,
    ]
  );

  // Check permissions for current user role (moved up to avoid TDZ issues)
  const hasPermission = useCallback((section: string) => {
    const permissions = ROLE_PERMISSIONS[userRole as keyof typeof ROLE_PERMISSIONS] || [];
    return permissions.includes('all') || permissions.includes(section);
  }, [userRole]);

  const labsRecorded = Object.values(labResults).some(hasLabValue);
  const formVitalsRecorded = Object.values(vitals).some((value) => value !== '');
  const steps = useMemo(() => completionSteps({
    complaint: consultation.complaint || complaints.some((complaint) => complaint.trim()),
    diagnosis: consultation.diagnosis || dermDx.size > 0,
    plan: consultation.plan || Boolean(plan.trim() || topicals.trim() || systemics.trim()),
    prescription: consultation.medicines > 0,
    vitals: consultation.vitals || formVitalsRecorded,
    photos: photoCount > 0,
    labs: labsRecorded,
  }), [consultation, complaints, dermDx, plan, topicals, systemics, formVitalsRecorded, photoCount, labsRecorded]);
  const canComplete = canCompleteVisit(steps);
  const recordedSections = useMemo(() => steps.filter((step) => step.done).map((step) => step.key), [steps]);

  /**
   * @cc [owner:nareshshah139,label:product] dirty-clinical-save
   * Untouched diagnoses, vitals, examination, and plan fields MUST be omitted.
   * Edited empty values MUST survive the request, and editor patches MUST NOT
   * overwrite newer shared-vitals edits. Personal history retains its visit snapshot.
   */
  /**
   * @cc [owner:nareshshah139,label:product] empty-visit-complaints
   * A new visit with no recorded complaints MUST send an empty complaints array,
   * never a placeholder complaint. Existing visits MUST omit untouched complaints.
   */
  const buildPayload = useCallback(() => {
    const field = clinicalField;
    const number = (value: string) => value === '' ? null : Number(value);
    const payload = compactClinicalPatch({
      patientId, doctorId, appointmentId, visitNumber: currentVisitNumber, version: visitVersionRef.current,
      complaints: field('complaints', complaints.map(complaint => ({ complaint })))
        ?? (!visitId ? [] : undefined),
      history: { subjective: field('subjective', subjective) },
      scribeJson: { assessment: field('assessment', assessment) },
      examination: {
        generalAppearance: field('objective', objective),
        dermatology: {
          skinType: field('skinType', skinType), morphology: field('morphology', Array.from(morphology)),
          distribution: field('distribution', Array.from(distribution)), acneSeverity: field('acneSeverity', acneSeverity),
          itchScore: field('itchScore', number(itchScore)), painScore: field('painScore', number(painScore)),
          skinConcerns: field('skinConcerns', Array.from(skinConcerns)),
        },
      },
      diagnosis: field('dermDx', Array.from(dermDx).map(diagnosis => ({ diagnosis }))),
      treatmentPlan: {
        notes: field('plan', plan), followUpDate: field('reviewDate', reviewDate || null),
        dermatology: {
          procedures: ['procType', 'fluence', 'spotSize', 'passes'].some(key => dirtyClinicalFields.current.has(key))
            ? (procType ? [{ type: procType, fluence: number(fluence), spotSize: number(spotSize), passes: number(passes) }] : []) : undefined,
          medications: { topicals: field('topicals', topicals), systemics: field('systemics', systemics) },
          counseling: field('counseling', counseling), investigations: field('labSelections', labSelections),
          labResults: field('labResults', labResults),
        },
      },
      vitals: {
        systolicBP: field('vitals.bpS', number(vitals.bpS)), diastolicBP: field('vitals.bpD', number(vitals.bpD)),
        heartRate: field('vitals.hr', number(vitals.hr)), weight: field('vitals.weight', number(vitals.weight)),
        height: field('vitals.height', number(vitals.height)), respiratoryRate: field('vitals.rr', number(vitals.rr)),
        oxygenSaturation: field('vitals.spo2', number(vitals.spo2)),
        temperature: field('vitals.temp', vitals.temp === '' ? null : (Number(vitals.temp) - 32) * 5 / 9),
      },
      metadata: { capturedBy: userRole, sections: recordedSections },
    });
    const merged = mergeClinicalPatch(payload, prescriptionClinicalRef.current);
    if (payload.vitals) merged.vitals = { ...merged.vitals, ...payload.vitals };
    if (consultationType) {
      merged.consultationType = consultationType;
      merged.teleVideoConsent = teleVideoConsent;
    }
    return merged;
  }, [dirtyClinicalFields.current, consultationType, teleVideoConsent, prescriptionClinical, labSelections, labResults, spotSize, assessment, complaints, counseling, dermDx, doctorId, fluence, passes, patientId, plan, procType, reviewDate, skinConcerns, skinType, subjective, systemics, topicals, currentVisitNumber, appointmentId, morphology, distribution, acneSeverity, itchScore, painScore, recordedSections, userRole, vitals, objective, visitId]);

  const latestPayload = useRef(buildPayload);
  latestPayload.current = buildPayload;
  const manualSaveInFlight = useRef(false);
  const autoSaveRunner = useRef<() => Promise<void>>(async () => {});
  const latestDraftWriter = useRef(persistDraftToStorage);
  latestDraftWriter.current = persistDraftToStorage;

  /**
   * @cc [owner:nareshshah139,label:product] shared-clinical-conflict-gate
   * A conflict from any clinical mutation MUST immediately freeze this draft's
   * version, cancel autosave, and persist its conflict state before later receipts.
   */
  const blockAutomaticSave = useCallback(() => {
    automaticSaveBlocked.current = true;
    clearAutoSaveTimer();
    setSaveConflict(true);
    setSaveStatus('error');
    latestDraftWriter.current();
  }, [clearAutoSaveTimer]);

  /**
   * @cc [owner:nareshshah139,label:product] conflict-requires-reconciliation
   * Further visit and prescription saves MUST be rejected after a known conflict
   * until explicit recovery, including creation races with no acknowledged version.
   */
  const getClinicalSavePatch = useCallback(() => {
    if (automaticSaveBlocked.current) {
      throw Object.assign(new Error('Visit changed; reconcile the saved visit before saving'), { status: 409 });
    }
    return latestPayload.current();
  }, []);

  /**
   * @cc [owner:nareshshah139,label:reliability] rejected-draft-retries
   * Deterministic HTTP 4xx failures MUST pause automatic resubmission while retaining
   * the draft. New edits may retry ordinary rejections, but version conflicts remain
   * blocked until explicit reconciliation under visit-save-version. 408, 425 and 429 may retry.
   */
  const runAutoSave = useCallback(async () => {
    if (!visitId || !hasUnsavedChangesRef.current || manualSaveInFlight.current || automaticSaveBlocked.current) {
      return;
    }

    persistDraftToStorage();

    if (autoSavePromiseRef.current) {
      return;
    }

    const payload = buildPayload();
    const savedSignature = editSignature(latestDraftStateRef.current);
    if (payload.consultationType === 'TELE_VIDEO' && payload.teleVideoConsent !== true) {
      setSaveStatus('unsaved');
      return;
    }
    autoSavePromiseRef.current = (async () => {
      let retryAllowed = true;
      try {
        setSaveStatus((prev) => (prev === 'saving' ? 'saving' : 'autosaving'));
        // Reuse same idempotency key for retries of the same payload
        let idemKey = lastIdempotencyKeyRef.current;
        const currentKey = buildIdempotencyKey('PATCH', visitId, payload as any);
        if (idemKey !== currentKey) {
          idemKey = currentKey;
          lastIdempotencyKeyRef.current = idemKey;
        }
        const saved = await apiClient.updateVisit(visitId, payload, { idempotencyKey: idemKey }) as VisitDetails;
        const newerChanges = JSON.stringify(payload) !== JSON.stringify(latestPayload.current());
        acknowledgeMutationVersion(saved.version);
        editBaselineRef.current = savedSignature;
        visitSaveAttempt.current = null;
        latestDraftWriter.current(!newerChanges);
        if (newerChanges) {
          hasUnsavedChangesRef.current = true;
          setSaveStatus('unsaved');
          return;
        }
        hasUnsavedChangesRef.current = false;
        autoSaveFailureNotifiedRef.current = false;
        justSavedRef.current = true;
        setSaveStatus('saved');
        setLastSavedAt(Date.now());
      } catch (error) {
        console.error('Auto-save failed:', error);
        hasUnsavedChangesRef.current = true;
        setSaveStatus('error');
        const status = (error as { status?: number })?.status;
        retryAllowed = !status || status >= 500 || [408, 425, 429].includes(status);
        clearAutoSaveTimer();
        // If unauthorized, prompt sign-in and do not retry
        if ((error as any)?.status === 409) {
          blockAutomaticSave();
          retryAllowed = false;
          toast({ variant: 'warning', title: 'Visit changed elsewhere', description: 'Your draft is retained and autosave is paused. Use the conflict notice to discard it and reload the saved visit.' });
        } else if ((error as any)?.status === 401) {
          retryAllowed = false;
          toast({
            variant: 'destructive',
            title: 'Not signed in',
            description: 'Your session expired. Please sign in to continue.',
          });
          clearAutoSaveTimer();
        } else {
          toast({
            variant: 'warning',
            title: 'Auto-save failed',
            description: getErrorMessage(error) || 'We will retry shortly.',
          });
          clearAutoSaveTimer();
          if (retryAllowed) {
            autoSaveTimerRef.current = window.setTimeout(() => {
              autoSaveTimerRef.current = null;
              void autoSaveRunner.current();
            }, AUTO_SAVE_RETRY_MS);
          }
        }
      } finally {
        autoSavePromiseRef.current = null;
        if (retryAllowed && hasUnsavedChangesRef.current && !autoSaveTimerRef.current && !manualSaveInFlight.current) {
          autoSaveTimerRef.current = window.setTimeout(() => {
            autoSaveTimerRef.current = null;
            void autoSaveRunner.current();
          }, AUTO_SAVE_INTERVAL_MS);
        }
      }
    })();
  }, [blockAutomaticSave, buildPayload, clearAutoSaveTimer, editSignature, persistDraftToStorage, toast, visitId]);

  autoSaveRunner.current = runAutoSave;

  const scheduleAutoSave = useCallback(
    (delay = AUTO_SAVE_INTERVAL_MS) => {
      if (typeof window === 'undefined') {
        return;
      }
      if (!hasUnsavedChangesRef.current || automaticSaveBlocked.current) {
        return;
      }
      if (justSavedRef.current) {
        clearAutoSaveTimer();
        autoSaveTimerRef.current = window.setTimeout(() => {
          autoSaveTimerRef.current = null;
          justSavedRef.current = false;
          void autoSaveRunner.current();
        }, delay);
        return;
      }
      clearAutoSaveTimer();
      autoSaveTimerRef.current = window.setTimeout(() => {
        autoSaveTimerRef.current = null;
        void autoSaveRunner.current();
      }, delay);
    },
    [clearAutoSaveTimer, runAutoSave]
  );

  // Warn if another tab modifies this draft key
  useEffect(() => {
    if (typeof window === 'undefined' || !draftStorageKey) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === draftStorageKey && e.newValue && e.newValue !== lastDraftJsonRef.current) {
        // Only notify while mounted
        if (mountedRef.current) {
          toast({ variant: 'warning', title: 'Draft changed in another tab', description: 'Your local form may be out of date.' });
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [draftStorageKey, toast]);

  useEffect(() => {
    if (typeof window === 'undefined' || !draftStorageKey) {
      return;
    }

    try {
      let stored = window.localStorage.getItem(draftStorageKey);
      if (
        !stored &&
        lastDraftJsonRef.current &&
        lastStorageKeyRef.current &&
        lastStorageKeyRef.current !== draftStorageKey
      ) {
        stored = lastDraftJsonRef.current;
        if (stored) {
          window.localStorage.setItem(draftStorageKey, stored);
          try {
            window.localStorage.removeItem(lastStorageKeyRef.current);
          } catch {}
        }
      }

      if (stored) {
        lastDraftJsonRef.current = stored;
        const parsed = JSON.parse(stored) as {
          version?: number;
          saved?: boolean;
          data?: MedicalVisitDraftState;
          visitId?: string | null;
          appointmentId?: string | null;
          patientId?: string;
          doctorId?: string;
        };
        if (parsed?.version === DRAFT_STORAGE_VERSION && parsed.data) {
          applyDraft(parsed.data);
          if (parsed.saved) editBaselineRef.current = editSignature(parsed.data);
          if (parsed.visitId && typeof parsed.visitId === 'string') {
            setVisitId(parsed.visitId);
          }
          hasUnsavedChangesRef.current = false;
        }
      }
    } catch (error) {
      console.warn('Failed to restore visit draft', error);
    }

    lastStorageKeyRef.current = draftStorageKey;
  }, [draftStorageKey, applyDraft, editSignature]);

  // Unmount cleanup/guards
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearAutoSaveTimer();
    };
  }, [clearAutoSaveTimer]);

  // If linked to an appointment and no visitId yet, try to fetch existing visit by appointment to resume editing
  useEffect(() => {
    (async () => {
      if (!appointmentId || visitId) return;
      try {
        const res: any = await apiClient.getVisits({ appointmentId });
        const list = (res?.visits || res?.data || []) as any[];
        const existingId = list.find(v => v.patientId === patientId && (v.appointmentId === appointmentId || v.appointment?.id === appointmentId))?.id;
        if (existingId && typeof existingId === 'string') {
          setVisitId(existingId);
          // Ensure the draft record reflects the resolved visitId
          try { persistDraftToStorage(true); } catch {}
        }
      } catch (e) {
        // Non-blocking
        console.warn('Failed to lookup existing visit by appointmentId', e);
      }
    })();
  }, [appointmentId, visitId, persistDraftToStorage]);

  // If initialVisitId is provided, load existing visit data to prefill controls
  useEffect(() => {
    const load = async () => {
      if (!visitId) return;
      try {
        const res: any = initialVisitSnapshot ?? await apiClient.get<VisitDetails>(`/visits/${visitId}`);
        if (restoredDraftVersion.current !== undefined && res.version !== undefined && restoredDraftVersion.current !== res.version) {
          blockAutomaticSave();
        }
        if (visitVersionRef.current === undefined && !automaticSaveBlocked.current) visitVersionRef.current = res.version;
        if (res.status) setVisitStatus(res.status);
        if (!latestDraftStateRef.current.consultationType) {
          setConsultationType(res?.consultationType === 'TELE_VIDEO' ? 'TELE_VIDEO' : 'IN_PERSON');
          setTeleVideoConsent(res?.consultationType === 'TELE_VIDEO' && !!res.teleVideoConsentById && !!res.teleVideoConsentAt);
        }

        // Prefill complaints, vitals, exam, diagnosis, plan when empty
        try {
          const complaintsArr = Array.isArray(res?.complaints) ? res.complaints : (res?.complaints ? JSON.parse(res.complaints) : []);
          if (Array.isArray(complaintsArr) && complaints.length === 0) {
            hydrateComplaints(complaintsArr.map((c: any) => c?.complaint).filter(Boolean));
          }
        } catch {}
        try {
          const v = typeof res?.vitals === 'object' ? res.vitals : (res?.vitals ? JSON.parse(res.vitals) : undefined);
          if (v && Object.keys(v).length && JSON.stringify(vitals) === JSON.stringify(INITIAL_VITALS)) {
            hydrateVitals({
              bpS: v.systolicBP ? String(v.systolicBP) : '',
              bpD: v.diastolicBP ? String(v.diastolicBP) : '',
              hr: v.heartRate ? String(v.heartRate) : '',
              // Backend stores Celsius; convert to Fahrenheit for UI
              temp: v.temperature ? String(((Number(v.temperature) * 9) / 5) + 32) : '',
              weight: v.weight ? String(v.weight) : '',
              height: v.height ? String(v.height) : '',
              spo2: v.oxygenSaturation ? String(v.oxygenSaturation) : '',
              rr: v.respiratoryRate ? String(v.respiratoryRate) : '',
            });
          }
        } catch {}
        try {
          const savedHistory = typeof res?.history === 'string' ? JSON.parse(res.history) : res?.history;
          if (savedHistory?.subjective && !subjective) hydrateSubjective(savedHistory.subjective);
          const savedScribe = typeof res?.scribeJson === 'string' ? JSON.parse(res.scribeJson) : res?.scribeJson;
          if (savedScribe?.assessment && !assessment) hydrateAssessment(savedScribe.assessment);
          const exam = typeof res?.exam === 'object' ? res.exam : (res?.exam ? JSON.parse(res.exam) : undefined);
          if (exam?.generalAppearance && !objective) hydrateObjective(String(exam.generalAppearance));
          const derm = exam?.dermatology || {};
          if (derm?.skinType && !skinType) hydrateSkinType(String(derm.skinType));
          if (Array.isArray(derm?.morphology) && morphology.size === 0) hydrateMorphology(new Set(derm.morphology));
          if (Array.isArray(derm?.distribution) && distribution.size === 0) hydrateDistribution(new Set(derm.distribution));
          if (derm?.acneSeverity && !acneSeverity) hydrateAcneSeverity(String(derm.acneSeverity));
          if (derm?.itchScore != null && !itchScore) hydrateItchScore(String(derm.itchScore));
          if (derm?.painScore != null && !painScore) hydratePainScore(String(derm.painScore));
          if (Array.isArray(derm?.skinConcerns) && skinConcerns.size === 0) hydrateSkinConcerns(new Set(derm.skinConcerns));
        } catch {}
        try {
          const diagArr = Array.isArray(res?.diagnosis) ? res.diagnosis : (res?.diagnosis ? JSON.parse(res.diagnosis) : []);
          if (Array.isArray(diagArr) && dermDx.size === 0 && !assessment) {
            const vals = diagArr.map((d: any) => d?.diagnosis).filter(Boolean);
            hydrateDermDx(new Set(vals));
            if (vals[0]) hydrateAssessment(String(vals[0]));
          }
        } catch {}
        try {
          const planObj = typeof res?.plan === 'object' ? res.plan : (res?.plan ? JSON.parse(res.plan) : {});
          if (planObj?.notes && !plan) hydratePlan(String(planObj.notes));
          const derm = planObj?.dermatology || {};
          if (planObj?.followUpDate && !reviewDate) hydrateReviewDate(String(planObj.followUpDate).slice(0, 10));
          if (derm?.labResults && !Object.keys(labResults).length) hydrateLabResults(derm.labResults);
          if (Array.isArray(derm?.investigations) && labSelections.length === 0) hydrateLabSelections(derm.investigations);
          if (derm?.procedures && Array.isArray(derm.procedures) && derm.procedures.length && !procType) {
            const p = derm.procedures[0];
            if (p?.type) hydrateProcType(String(p.type));
            if (p?.fluence) hydrateFluence(String(p.fluence));
            if (p?.spotSize) hydrateSpotSize(String(p.spotSize));
            if (p?.passes) hydratePasses(String(p.passes));
          }
          if (derm?.medications) {
            if (derm.medications.topicals && !topicals) hydrateTopicals(String(derm.medications.topicals));
            if (derm.medications.systemics && !systemics) hydrateSystemics(String(derm.medications.systemics));
          }
          if (derm?.counseling && !counseling) hydrateCounseling(String(derm.counseling));
        } catch {}
      } catch {
        // ignore
      }
    };
    void load();
  }, [visitId]);

  useEffect(() => {
    const signature = editSignature(serializeDraft());
    editBaselineRef.current ??= signature;
    if (justSavedRef.current) justSavedRef.current = false;
    if (signature === lastEditSignatureRef.current) return;
    lastEditSignatureRef.current = signature;

    if (signature === editBaselineRef.current) {
      if (hasUnsavedChangesRef.current && !manualSaveInFlight.current && !autoSavePromiseRef.current && !automaticSaveBlocked.current) {
        hasUnsavedChangesRef.current = false;
        clearAutoSaveTimer();
        setSaveStatus((status) => (status === 'unsaved' ? 'idle' : status));
        persistDraftToStorage();
      }
      return;
    }

    hasUnsavedChangesRef.current = true;
    setSaveStatus(automaticSaveBlocked.current ? 'error' : 'unsaved');
    autoSaveFailureNotifiedRef.current = false;
    const changed = persistDraftToStorage();
    if (changed) {
      scheduleAutoSave();
    }
  }, [
    editSignature,
    clearAutoSaveTimer,
    serializeDraft,
    persistDraftToStorage,
    scheduleAutoSave,
    vitals,
    painScore,
    skinConcerns,
    complaints,
    subjective,
    objective,
    assessment,
    plan,
    skinType,
    morphology,
    distribution,
    acneSeverity,
    itchScore,
    dermDx,
    procType,
    fluence,
    spotSize,
    passes,
    topicals,
    systemics,
    counseling,
    reviewDate,
    visitStatus,
  ]);

  useEffect(() => {
    return () => {
      clearAutoSaveTimer();
      try {
        persistDraftToStorage();
      } catch {}
    };
  }, [clearAutoSaveTimer, persistDraftToStorage]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChangesRef.current) {
        return;
      }
      try {
        persistDraftToStorage();
      } catch {}
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    const handleKeyDown = (e: KeyboardEvent) => {
      const isSave = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's';
      const isComplete = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's';
      if (isSave || isComplete) {
        e.preventDefault();
        if (!saving) {
          void save(isComplete);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [persistDraftToStorage]);
  const patientDetails: VisitContextPatient | null = patient ?? appointmentData?.patient ?? null;

  
  
  // Voice-to-text functionality
  const { activeVoiceField, isListening, isTranscribing, startVoiceInput } = useSpeechToTextRecorder({
    toast,
    resolveText: (_fieldName, response) => pickSpeechToTextInsert(response, 'full-transcript'),
    applyText: (fieldName, text) => {
      switch (fieldName) {
        case 'subjective':
          setSubjective((prev) => appendSpeechToText(prev, text));
          break;
        case 'objective':
          setObjective((prev) => appendSpeechToText(prev, text));
          break;
        case 'assessment':
          setAssessment((prev) => appendSpeechToText(prev, text));
          break;
        case 'plan':
          setPlan((prev) => appendSpeechToText(prev, text));
          break;
      }
    },
  });
  
  const VoiceButton = useCallback(({ fieldName }: { fieldName: string }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`ml-2 ${activeVoiceField === fieldName ? 'bg-destructive-soft text-destructive-text' : ''}`}
      onClick={() => void startVoiceInput(fieldName)}
      disabled={isTranscribing || (isListening && activeVoiceField !== fieldName)}
      aria-label={
        activeVoiceField === fieldName
          ? isListening
            ? 'Stop voice input'
            : 'Transcribing recording'
          : 'Start voice input'
      }
      title={
        activeVoiceField === fieldName
          ? isListening
            ? 'Stop voice input'
            : 'Transcribing recording'
          : 'Start voice input'
      }
    >
      {activeVoiceField === fieldName ? (
        isListening ? <MicOff className="h-4 w-4" /> : <Spinner className="h-4 w-4 " />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  ), [activeVoiceField, isListening, isTranscribing, startVoiceInput]);

  const toggleSet = useCallback(<T,>(current: Set<T>, item: T, updater: (next: Set<T>) => void) => {
    const next = new Set(current);
    if (next.has(item)) {
      next.delete(item);
    } else {
      next.add(item);
    }
    updater(next);
  }, []);

  


  const loadPatientHistory = useCallback(async (fresh = false) => {
    if (!patientId) {
      return;
    }

    try {
      setLoadingHistory(true);
      const response = visitEntries(await fetchPatientHistory(patientId, fresh ? performance.now() : undefined)) as VisitSummary[];
      const historyEntries = response.slice().sort((a, b) => {
        const at = encounterTime(a);
        const bt = encounterTime(b);
        return bt - at;
      });
      setPatientHistory(historyEntries);

      // For new visits (no visitId yet), suggest next visit number.
      // For existing visits (resuming), preserve the original visit number when available.
      if (!visitId) {
        setCurrentVisitNumber(historyEntries.length + 1);
      } else {
        const current = historyEntries.find((v: any) => v && v.id === visitId);
        if (current && typeof (current as any).photos === 'number') {
          setPhotoCount((count) => count || (current as any).photos);
        }
        if (current) {
          const scribe = parseJsonValue<Record<string, unknown>>(current.scribeJson);
          const fromScribe = scribe && typeof (scribe as any).visitNumber !== 'undefined' ? Number((scribe as any).visitNumber) : undefined;
          if (fromScribe && !Number.isNaN(fromScribe)) {
            setCurrentVisitNumber(fromScribe);
          } else {
            const idx = historyEntries.findIndex((v: any) => v && v.id === visitId);
            setCurrentVisitNumber(idx >= 0 ? historyEntries.length - idx : historyEntries.length + 1);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load patient history:', error);
      setPatientHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [patientId, visitId, parseJsonValue]);

  useEffect(() => {
    void loadPatientHistory();
  }, [loadPatientHistory]);


  const save = async (complete = false, requireLatest = false) => {
    if (manualSaveInFlight.current) return;
    if (consentMissing) {
      toast({ variant: 'destructive', title: 'Patient consent required', description: TELE_VIDEO_CONSENT_REQUIRED });
      return;
    }
    if (!patientId || !doctorId) {
      toast({
        variant: 'destructive',
        title: 'Missing patient or doctor',
        description: 'Select both a patient and a doctor before saving the visit.',
      });
      return;
    }
    if (complete) {
      if (!hasPermission('all')) {
        toast({
          variant: 'warning',
          title: 'Doctor access required',
          description: 'Only doctors can complete a visit. Save a draft instead.',
        });
        return;
      }
      if (!canComplete) {
        toast({ variant: 'warning', title: 'Not ready to complete', description: COMPLETION_RULE });
        return;
      }
    }
    try {
      manualSaveInFlight.current = true;
      clearAutoSaveTimer();
      setSaving(true);
      await autoSavePromiseRef.current;
      latestDraftWriter.current();
      setSaveStatus('saving');
      const payload = getClinicalSavePatch();
      const savedSignature = editSignature(latestDraftStateRef.current);

      let visit;
      if (visitId) {
        const idemKey = buildIdempotencyKey('PATCH', visitId, payload as any);
        visit = await apiClient.updateVisit(visitId, payload, { idempotencyKey: idemKey });
      } else {
        const idemKey = buildIdempotencyKey('POST', null, payload as any);
        try {
          visit = await apiClient.createVisit(payload, { idempotencyKey: idemKey });
          setVisitId((visit as VisitDetails).id);
        } catch (err: any) {
          const status = (err && typeof err === 'object' && 'status' in err) ? (err as any).status : undefined;
          if (status === 409 && appointmentId) {
            blockAutomaticSave();
            const res: any = await apiClient.getVisits({ appointmentId });
            const list = (res?.visits || res?.data || []) as any[];
            const existingId = list.find(v => v.patientId === patientId && (v.appointmentId === appointmentId || v.appointment?.id === appointmentId))?.id;
            if (existingId && typeof existingId === 'string') setVisitId(existingId);
          }
          throw err;
        }
      }
      
      if (!(visit as VisitDetails)?.id) throw new Error('The server did not confirm the saved visit. Your draft is still available.');
      visitSaveAttempt.current = null;
      const newerChanges = JSON.stringify(payload) !== JSON.stringify(latestPayload.current());
      acknowledgeMutationVersion((visit as VisitDetails).version);
      editBaselineRef.current = savedSignature;
      if ((complete || requireLatest) && newerChanges) throw new Error('New changes were entered while saving. Please save again before completing or exporting.');
      let reviewOutcome: ReviewBooking | undefined;
      if (complete) {
        const completePayload: Record<string, unknown> = { version: visitVersionRef.current };
        if (reviewDate) completePayload.followUpDate = reviewDate;
        const completeId = (visit as VisitDetails).id;
        const idemKey = buildIdempotencyKey('POST', completeId, completePayload as any);
        const completedVisit = await apiClient.completeVisit(completeId, completePayload, { idempotencyKey: idemKey });
        if (completedVisit.status !== 'COMPLETED') throw new Error('The server did not confirm visit completion. Please retry.');
        reviewOutcome = (completedVisit as { reviewAppointment?: ReviewBooking }).reviewAppointment;
        track('visit_completed', { follow_up_set: Boolean(reviewDate) });
        setVisitStatus(completedVisit.status);
        acknowledgeMutationVersion(completedVisit.version);
        if (typeof window !== 'undefined' && draftStorageKey) {
          try {
            window.localStorage.removeItem(draftStorageKey);
          } catch {}
        }
        lastDraftJsonRef.current = null;
        hasUnsavedChangesRef.current = false;
      } else {
        if ((visit as VisitDetails).status) setVisitStatus((visit as VisitDetails).status!);
        hasUnsavedChangesRef.current = newerChanges;
        justSavedRef.current = true;
        clearAutoSaveTimer();
        latestDraftWriter.current(!newerChanges);
      }
      
      const review = complete ? reviewBookingMessage(reviewOutcome, reviewDate) : null;
      toast({
        variant: review?.needsAction ? 'warning' : 'success',
        title: complete ? 'Visit completed' : newerChanges ? 'Earlier changes saved' : 'Visit saved',
        description: review
          ? review.text
          : complete
            ? 'All documentation has been marked complete.'
            : newerChanges ? 'New edits are still waiting to save.' : 'Your draft was saved safely.',
        ...(review?.needsAction
          ? {
              action: (
                <ToastAction altText="Open Appointments" asChild>
                  <Link href={appointmentsHref(reviewDate, doctorId, patientId)}>Open Appointments</Link>
                </ToastAction>
              ),
            }
          : {}),
      });
      setSaveStatus(newerChanges ? 'unsaved' : 'saved');
      setLastSavedAt(Date.now());

      void loadPatientHistory(true);
      return (visit as VisitDetails).id;
    } catch (e) {
      console.error('Save failed:', e);
      if ((e as { status?: number })?.status === 409) {
        blockAutomaticSave();
      }
      setSaveStatus('error');
      toast({
        variant: 'destructive',
        title: 'Unable to save visit',
        description: getErrorMessage(e) || 'Please try again.',
      });
      return false;
    } finally {
      manualSaveInFlight.current = false;
      setSaving(false);
      if (hasUnsavedChangesRef.current && !automaticSaveBlocked.current) scheduleAutoSave();
    }
  };

  /**
   * @cc [owner:nareshshah139,label:product] discard-conflicting-draft
   * Only an explicit discard after a successful visit fetch may remove local
   * clinical drafts and reset their version. Failed fetches MUST retain edits.
   */
  const discardAndReloadSavedVisit = async () => {
    if (!visitId || reloadingSavedVisit) return;
    setReloadingSavedVisit(true);
    try {
      const saved = await apiClient.get<VisitDetails>(`/visits/${visitId}`);
      if (saved.id !== visitId) throw new Error('The saved visit could not be loaded.');
      clearAutoSaveTimer();
      discardDraftRef.current = true;
      window.localStorage.removeItem(draftStorageKey);
      window.localStorage.removeItem(`rxDraft:${patientId}:${visitId}`);
      onDiscardLocalDraft(saved);
    } catch (error) {
      discardDraftRef.current = false;
      toast({ variant: 'destructive', title: 'Unable to reload saved visit', description: getErrorMessage(error) || 'Your draft is still available. Please try again.' });
      setReloadingSavedVisit(false);
    }
  };

  const tabs = hasPermission('all')
    ? [
        { id: 'consultation', label: 'Consultation' },
        { id: 'photos', label: 'Photos' },
        { id: 'history', label: 'History' },
        { id: 'customization', label: 'Print setup' },
      ]
    : [
        ...(hasPermission('vitals') ? [{ id: 'vitals', label: 'Vitals' }] : []),
        ...(hasPermission('photos') ? [{ id: 'photos', label: 'Photos' }] : []),
        { id: 'history', label: 'History' },
      ];


  const labTemplate = (test: string): SimpleLabValue | CompositeLabValue => {
    const subs = COMPOSITE_TESTS[test];
    if (!subs) return { value: '', unit: SIMPLE_TEST_UNITS[test] || '' };
    return Object.fromEntries(Object.entries(subs).map(([sub, unit]) => [sub, { value: '', unit }]));
  };
  const editLabResult = (test: string, update: (entry: any) => SimpleLabValue | CompositeLabValue) => {
    if (!labSelections.includes(test)) setLabSelections((prev) => [...prev, test]);
    setLabResults((prev) => ({ ...prev, [test]: update(prev[test] ?? labTemplate(test)) }));
  };
  const labDelta = (current: unknown, previous: unknown) => {
    const currentNumber = Number(String(current ?? ''));
    const previousNumber = Number(String(previous ?? ''));
    if (String(current ?? '') === '' || String(previous ?? '') === '' || Number.isNaN(currentNumber) || Number.isNaN(previousNumber)) return '—';
    const delta = currentNumber - previousNumber;
    return `Δ ${delta >= 0 ? '+' : ''}${delta}`;
  };
  const autofillLabs = async (file: File) => {
    try {
      setLabsAutofillLoading(true);
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/visits/labs/autofill', { method: 'POST', body: fd, credentials: 'include' });
      if (res.status === 401) handleUnauthorizedRedirect(res);
      if (!res.ok) {
        let t = '';
        try { t = await res.text(); } catch {}
        throw new Error(`AI autofill failed: ${res.status} ${t}`);
      }
      const data = await res.json();
      const labs = (data?.labs as any) || {};
      setLabSelections((prev) => Array.from(new Set([...prev, ...Object.keys(labs)])));
      setLabResults((prev) => ({ ...prev, ...labs }));
      toast({ variant: 'success', title: 'Autofill complete', description: 'Extracted results inserted.' });
    } catch (err) {
      console.error(err);
      toast({ variant: 'warning', title: 'Autofill failed', description: getErrorMessage(err) || 'Try another file.' });
    } finally {
      setLabsAutofillLoading(false);
    }
  };
  const renderLabResults = (ordered: string[]) => {
    const tests = Array.from(new Set([...ordered, ...labSelections]));
    return (
      <div className="space-y-3 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Lab results</h3>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={compareLabs} onChange={(e) => setCompareLabs(e.target.checked)} />
            Compare with previous visit
          </label>
        </div>
        {tests.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tick a test above to record its result here, or read results from a report.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {tests.map((test) => {
              const entry: any = labResults[test] ?? labTemplate(test);
              const composite = !('value' in entry) && !('unit' in entry);
              const rows: Array<[string | null, any, any]> = composite
                ? Object.keys(entry).map((sub) => [sub, entry[sub], (prevLabResults[test] as any)?.[sub]])
                : [[null, entry, prevLabResults[test]]];
              return (
                <div key={test} className="rounded-md border p-3">
                  <div className="mb-2 text-sm font-semibold">{test}</div>
                  <div className="space-y-2">
                    {rows.map(([sub, row, previous]) => {
                      const name = sub ? `${test} ${sub}` : test;
                      const write = (field: 'value' | 'unit', value: string) => editLabResult(test, (current) => {
                        if (!sub) return { value: current?.value ?? '', unit: current?.unit ?? '', [field]: value };
                        return { ...current, [sub]: { value: current?.[sub]?.value ?? '', unit: current?.[sub]?.unit ?? '', [field]: value } };
                      });
                      return (
                        <div key={name} className="flex items-center gap-2">
                          {sub && <span className="w-28 text-xs">{sub}</span>}
                          <Input aria-label={`${name} result`} placeholder="Value" value={row?.value ?? ''} onChange={(e) => write('value', e.target.value)} />
                          <Input aria-label={`${name} unit`} placeholder="Unit" value={row?.unit ?? ''} onChange={(e) => write('unit', e.target.value)} />
                          {compareLabs && <span className="text-xs text-muted-foreground">{labDelta(row?.value, previous?.value)}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="visit-lab-report" className="text-muted-foreground">Read results from a report (JPG, PNG or PDF)</label>
          <input
            id="visit-lab-report"
            type="file"
            className="max-w-full"
            accept="image/*,application/pdf"
            disabled={labsAutofillLoading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void autofillLabs(file);
            }}
          />
          {labsAutofillLoading && <span role="status" className="text-xs text-muted-foreground">Reading report…</span>}
        </div>
      </div>
    );
  };

  const vitalsExtra = (
    <>
      <div>
        <label htmlFor="visit-vitals-temp" className="text-xs text-muted-foreground">Temp (°F)</label>
        <Input id="visit-vitals-temp" type="number" inputMode="decimal" value={vitals.temp} onChange={(e) => setVitals({ ...vitals, temp: e.target.value })} />
      </div>
      <div>
        <label htmlFor="visit-vitals-rr" className="text-xs text-muted-foreground">Resp. (/min)</label>
        <Input id="visit-vitals-rr" type="number" value={vitals.rr} onChange={(e) => setVitals({ ...vitals, rr: e.target.value })} />
      </div>
      <div>
        <label htmlFor="visit-pain-score" className="text-xs text-muted-foreground">Pain (0–10)</label>
        <Input id="visit-pain-score" type="number" min={0} max={10} value={painScore} onChange={(e) => setPainScore(e.target.value)} />
      </div>
    </>
  );

  const jumpToSection = (id: string) => {
    const target = document.getElementById(`consult-${id}`);
    if (!target) return;
    target.scrollIntoView({ block: 'start' });
    target.querySelector<HTMLElement>('input, textarea, button, [tabindex]')?.focus({ preventScroll: true });
  };
  const requiredSteps = steps.filter((step) => step.required);
  const optionalSteps = steps.filter((step) => !step.required);
  const stepItem = (step: (typeof steps)[number]) => (
    <li key={step.key} className={`inline-flex items-center gap-1 ${step.done ? 'text-success-text' : step.required ? 'text-foreground' : 'text-muted-foreground'}`}>
      {step.done ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5" aria-hidden="true" />}
      {step.label}
      <span className="sr-only">{step.done ? ' recorded' : ' not recorded'}</span>
    </li>
  );

  return (
    <div className="min-w-0 space-y-4">
      <div data-visit-bar className="sticky -top-4 z-30 -mx-4 space-y-1.5 border-b bg-background px-4 py-1.5 md:-top-6 md:-mx-6 md:px-6">
        <div className="flex items-center justify-between gap-x-4">
          <div className="flex min-w-0 flex-1 items-center gap-x-3">
            {identity}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
              {saveStatus === 'saving' && 'Saving…'}
              {saveStatus === 'autosaving' && 'Auto-saving…'}
              {saveStatus === 'unsaved' && 'Unsaved changes'}
              {(saveStatus === 'saved' || (saveStatus === 'idle' && visitId)) && (lastSavedAt ? `Saved ${displayClinicTime(new Date(lastSavedAt))}` : 'Saved')}
              {saveStatus === 'error' && <span className="text-destructive-text">Save failed</span>}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="More visit actions"><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
                  <Keyboard className="mr-2 h-4 w-4" aria-hidden="true" />
                  Keyboard shortcuts
                </DropdownMenuItem>
                {visitActions}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => void save(false)} disabled={saving}>
              {saving ? 'Saving...' : 'Save Draft'}
            </Button>
            {hasPermission('all') && (
              <Button size="sm" onClick={() => void save(true)} disabled={saving || !canComplete} aria-describedby={!canComplete ? 'visit-completion-help' : undefined}>
                {saving ? 'Completing...' : 'Complete Visit'}
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {doctorControl}
          <div className="flex items-center gap-2">
            <label htmlFor="visit-consultation-type" className="text-sm font-medium">Consultation type</label>
            <NativeSelect id="visit-consultation-type"
              value={consultationType || 'IN_PERSON'} onChange={event => {
                setConsultationType(event.target.value as ConsultationType);
                setTeleVideoConsent(false);
              }}>
              <option value="IN_PERSON">In-person</option>
              <option value="TELE_VIDEO">Tele-video</option>
            </NativeSelect>
          </div>
          {patientDetails?.allergies && (
            <span className="inline-flex max-w-xs items-center gap-1 truncate rounded-md border border-destructive-border bg-destructive-soft px-2 py-1 text-xs font-medium text-destructive-text" title={patientDetails.allergies}>
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Allergies: {patientDetails.allergies}</span>
            </span>
          )}
          {patientDetails?.medicalHistory && (
            <span className="max-w-xs truncate text-xs text-muted-foreground" title={patientDetails.medicalHistory}>History: {patientDetails.medicalHistory}</span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              Visit #{currentVisitNumber}
              <StatusBadge domain="visit" status={visitStatus} />
            </span>
            <DoctorTour autoStart={false} />
          </div>
        </div>
        {hasPermission('all') && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <ol aria-label="Needed to complete" className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {requiredSteps.map(stepItem)}
            </ol>
            <span className="text-muted-foreground">Optional:</span>
            <ul aria-label="Optional" className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {optionalSteps.map(stepItem)}
            </ul>
            {!canComplete && <p id="visit-completion-help" className="text-muted-foreground">{COMPLETION_RULE}</p>}
          </div>
        )}
        {consultationType === 'TELE_VIDEO' && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" className="h-4 w-4" checked={teleVideoConsent}
                required aria-describedby="tele-video-consent-help" onChange={event => setTeleVideoConsent(event.target.checked)} />
              Patient consented to tele-video consultation
            </label>
            <span id="tele-video-consent-help" className={consentMissing ? 'text-destructive' : 'text-muted-foreground'}>
              {consentMissing ? TELE_VIDEO_CONSENT_REQUIRED : 'Consent will be recorded with your account and the save time.'}
            </span>
          </div>
        )}
      </div>

      {saveConflict && (
        <div role="alert" className="space-y-3 rounded-md border border-warning-border bg-warning-soft p-4 text-warning-text">
          <p className="font-medium">This visit changed elsewhere. Your local draft is retained.</p>
          <p className="text-sm">Autosave is paused. You can keep these edits here, or discard them and load the saved visit.</p>
          <Button variant="outline" onClick={() => void discardAndReloadSavedVisit()} disabled={reloadingSavedVisit || saving}>
            {reloadingSavedVisit ? 'Loading saved visit…' : 'Discard draft and reload saved visit'}
          </Button>
        </div>
      )}

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
            <DialogDescription>Speed up documentation with these shortcuts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>Save Draft</span>
              <span className="font-mono text-xs bg-muted px-2 py-1 rounded-md">Cmd/Ctrl + S</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Complete Visit</span>
              <span className="font-mono text-xs bg-muted px-2 py-1 rounded-md">Cmd/Ctrl + Shift + S</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Patient Search Navigate</span>
              <span className="font-mono text-xs bg-muted px-2 py-1 rounded-md">↑ / ↓</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Patient Search Select</span>
              <span className="font-mono text-xs bg-muted px-2 py-1 rounded-md">Enter</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Close Menus</span>
              <span className="font-mono text-xs bg-muted px-2 py-1 rounded-md">Esc</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="flex flex-wrap gap-1">
            {tabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>
          <div ref={setToolbarTarget} className={activeTab === 'consultation' ? 'flex flex-wrap items-center gap-2' : 'hidden'} />
        </div>

            {/* Vitals Tab */}
            {!hasPermission('all') && hasPermission('vitals') && (
              <TabsContent value="vitals" className="space-y-4" forceMount>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                    <label className="text-sm font-medium text-foreground">BP Systolic</label>
                    <Input 
                      placeholder="mmHg" 
                      value={vitals.bpS} 
                      onChange={(e) => setVitals({ ...vitals, bpS: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">BP Diastolic</label>
                    <Input 
                      placeholder="mmHg" 
                      value={vitals.bpD} 
                      onChange={(e) => setVitals({ ...vitals, bpD: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Heart Rate</label>
                    <Input 
                      placeholder="bpm" 
                      value={vitals.hr} 
                      onChange={(e) => setVitals({ ...vitals, hr: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Temperature</label>
                    <Input 
                      placeholder="°F"
                      value={vitals.temp} 
                      onChange={(e) => setVitals({ ...vitals, temp: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Weight</label>
                    <Input 
                      placeholder="kg" 
                      value={vitals.weight} 
                      onChange={(e) => setVitals({ ...vitals, weight: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Height</label>
                    <Input 
                      placeholder="cm" 
                      value={vitals.height} 
                      onChange={(e) => setVitals({ ...vitals, height: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">BMI</label>
                    <Input
                      placeholder="kg/m²"
                      readOnly
                      value={(() => {
                        const h = Number(vitals.height);
                        const w = Number(vitals.weight);
                        if (h > 0 && w > 0) {
                          const m = h / 100;
                          const bmi = w / (m * m);
                          return bmi.toFixed(1);
                        }
                        return '';
                      })()}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Resp. Rate</label>
                    <Input 
                      placeholder="/min" 
                      value={vitals.rr} 
                      onChange={(e) => setVitals({ ...vitals, rr: e.target.value })} 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground">Pain Score (0-10)</label>
                    <Input 
                      placeholder="0-10" 
                      value={painScore} 
                      onChange={(e) => setPainScore(e.target.value)} 
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => void save(false)} disabled={saving}>
                    Save vitals
                  </Button>
                </div>
              </TabsContent>
            )}

            {hasPermission('all') && (
              <TabsContent value="consultation" forceMount className="mt-4">
                <div className="min-[1360px]:grid min-[1360px]:grid-cols-[8.5rem_minmax(0,1fr)] min-[1360px]:gap-6">
                  <nav aria-label="Consultation sections" className="hidden min-[1360px]:block">
                    <ul className="sticky top-32 space-y-1 text-sm">
                      {CONSULTATION_SECTIONS.map((section) => (
                        <li key={section.id}>
                          <a
                            href={`#consult-${section.id}`}
                            className="block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                            onClick={(event) => { event.preventDefault(); jumpToSection(section.id); }}
                          >
                            {section.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                  <div className="min-w-0">
                    <PrescriptionBuilder 
                      patientId={patientId}
                      patient={patientDetails}
                      onSummaryChange={receiveConsultationSummary}
                      vitalsExtra={vitalsExtra}
                      investigationResults={renderLabResults}
                      toolbarTarget={toolbarTarget}
                      doctorId={doctorId}
                      doctorName={doctorName}
                      visitId={visitId}
                      consultationType={consultationType}
                      teleVideoConsent={teleVideoConsent}
                      onClinicalDataChange={receiveClinicalData}
                      getClinicalSavePatch={getClinicalSavePatch}
                      shouldPersistDraft={() => !discardDraftRef.current}
                      initialVisitSnapshot={initialVisitSnapshot}
                      onClinicalConflict={blockAutomaticSave}
                      onVisitSaved={(saved) => {
                        acknowledgeMutationVersion(saved.version);
                        if (saved.status) setVisitStatus(saved.status);
                        latestDraftWriter.current();
                      }}
                      onBeforeExport={async () => {
                        const savedId = await save(false, true);
                        if (!savedId) {
                          throw new Error('The latest visit details could not be saved. Please retry before exporting.');
                        }
                        return savedId;
                      }}
                      onChangeChiefComplaints={(value) => setComplaints(value?.trim() ? [value.trim()] : [])}
                      ensureVisitId={async () => {
                        if (consentMissing) throw new Error(TELE_VIDEO_CONSENT_REQUIRED);
                        if (visitId) return visitId;
                        if (typeof patientId !== 'string' || typeof doctorId !== 'string') {
                          console.warn('[MedicalVisitForm] Missing IDs when ensuring visit', { patientId, doctorId });
                          toast({
                            variant: 'destructive',
                            title: 'Invalid IDs',
                            description: 'Patient or Doctor ID is missing. Please select valid records and try again.',
                          });
                          throw new Error('Missing IDs');
                        }
                        const minimalPayload = getClinicalSavePatch();
                        let newVisit: any;
                        try {
                          newVisit = await apiClient.createVisit(minimalPayload);
                        } catch (error: any) {
                          if (error?.status !== 409 || !appointmentId) throw error;
                          blockAutomaticSave();
                          const response: any = await apiClient.getVisits({ appointmentId });
                          const existing = (response.visits || response.data || []).find((v: any) => v.patientId === patientId && (v.appointmentId === appointmentId || v.appointment?.id === appointmentId));
                          if (existing?.id) setVisitId(existing.id);
                          throw error;
                        }
                        const newVisitId = (newVisit as VisitDetails).id;
                        acknowledgeMutationVersion((newVisit as VisitDetails).version);
                        setVisitId(newVisitId);
                        return newVisitId;
                      }}
                      reviewDate={reviewDate}
                      printBgUrl={printBgUrl}
                      printTopMarginPx={printTopMarginPx}
                      printLeftMarginPx={printLeftMarginPx}
                      printRightMarginPx={printRightMarginPx}
                      printBottomMarginPx={printBottomMarginPx}
                      contentOffsetXPx={contentOffsetXPx}
                      contentOffsetYPx={contentOffsetYPx}
                      onChangeContentOffset={(x: number, y: number) => { setContentOffsetXPx(x); setContentOffsetYPx(y); }}
                      designAids={{
                        enabled: designAidsEnabled,
                        showGrid: designShowGrid,
                        showRulers: designShowRulers,
                        snapToGrid: designSnapToGrid,
                        gridSizePx: designGridSizePx,
                        nudgeStepPx: designNudgeStepPx,
                      }}
                      paperPreset={paperPreset}
                      grayscale={grayscaleMode}
                      bleedSafe={{ enabled: showBleedSafe, safeMarginMm }}
                      frames={{ enabled: framesEnabled, headerHeightMm, footerHeightMm }}
                      onChangeFrames={(next: { enabled?: boolean; headerHeightMm?: number; footerHeightMm?: number }) => {
                        if (typeof next.enabled === 'boolean') setFramesEnabled(next.enabled);
                        if (typeof next.headerHeightMm === 'number') setHeaderHeightMm(next.headerHeightMm);
                        if (typeof next.footerHeightMm === 'number') setFooterHeightMm(next.footerHeightMm);
                      }}
                      onChangeReviewDate={setReviewDate}
                      includeSections={rxIncludeSections}
                      onChangeIncludeSections={setRxIncludeSections}
                    />
                  </div>
                </div>
              </TabsContent>
            )}

            {/* Photos Tab */}
            {(hasPermission('photos') || hasPermission('all')) && (
              <TabsContent value="photos" className="space-y-4">
                <VisitPhotos 
                  visitId={visitId || 'temp'} 
                  patientId={patientId}
                  allowDelete={hasPermission('photos') || hasPermission('all')}
                  onChangeCount={setPhotoCount}
                  onClinicalConflict={blockAutomaticSave}
                  onVisitVersion={(version?: number) => {
                    acknowledgeMutationVersion(version);
                    latestDraftWriter.current();
                  }}
                  onVisitNeeded={async () => {
                    if (consentMissing) throw new Error(TELE_VIDEO_CONSENT_REQUIRED);
                    if (!visitId) {
                      const minimalPayload = getClinicalSavePatch();
                      const newVisit = await apiClient.createVisit(minimalPayload);
                      const newVisitId = (newVisit as VisitDetails).id;
                      acknowledgeMutationVersion((newVisit as VisitDetails).version);
                      setVisitId(newVisitId);
                      return newVisitId;
                    }
                    return visitId;
                  }}
                />
              </TabsContent>
            )}

            


            {/* Customization Tab - Doctor Only */}
            {hasPermission('all') && (
              <TabsContent value="customization" className="space-y-4" forceMount>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Customization Options</CardTitle>
                    <CardDescription>Configure print background and layout (affects Prescription Preview)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-sm text-foreground">Print Background Image URL (optional)</label>
                        <p className="text-xs text-muted-foreground">Leave empty to print on the doctor&apos;s own letterhead. Doctors upload theirs in Settings.</p>
                        <Input placeholder="https://.../letterhead.png" value={printBgUrl} onChange={(e) => setPrintBgUrl(e.target.value)} />
                        <div className="flex items-center gap-2 text-sm">
                          <input
                            ref={printBgFileRef}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const reader = new FileReader();
                              reader.onload = () => {
                                const dataUrl = String(reader.result || '');
                                if (dataUrl) setPrintBgUrl(dataUrl);
                              };
                              reader.readAsDataURL(f);
                            }}
                          />
                          <Button type="button" onClick={() => printBgFileRef.current?.click()}>
                            Choose File
                          </Button>
                          <Button type="button" variant="outline" onClick={() => setPrintBgUrl('')}>Clear</Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-foreground">Top Margin (px)</label>
                        <Input type="number" min={0} value={printTopMarginPx} onChange={(e) => setPrintTopMarginPx(Number(e.target.value) || 0)} />
                        <label className="text-sm text-foreground">Bottom Margin (px)</label>
                        <Input type="number" min={0} value={printBottomMarginPx} onChange={(e) => setPrintBottomMarginPx(Number(e.target.value) || 0)} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-foreground">Left Margin (px)</label>
                        <Input type="number" min={0} value={printLeftMarginPx} onChange={(e) => setPrintLeftMarginPx(Number(e.target.value) || 0)} />
                        <label className="text-sm text-foreground">Right Margin (px)</label>
                        <Input type="number" min={0} value={printRightMarginPx} onChange={(e) => setPrintRightMarginPx(Number(e.target.value) || 0)} />
                      </div>
                      <div className="md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                        <div>
                          <label className="text-sm text-foreground">Content X Offset (px)</label>
                          <Input type="number" value={contentOffsetXPx} onChange={(e) => setContentOffsetXPx(Number(e.target.value) || 0)} />
                        </div>
                        <div>
                          <label className="text-sm text-foreground">Content Y Offset (px)</label>
                          <Input type="number" value={contentOffsetYPx} onChange={(e) => setContentOffsetYPx(Number(e.target.value) || 0)} />
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="icon" aria-label="Move content up" onClick={() => setContentOffsetYPx((v) => v - 1)}><ArrowUp /></Button>
                          <Button type="button" variant="outline" size="icon" aria-label="Move content down" onClick={() => setContentOffsetYPx((v) => v + 1)}><ArrowDown /></Button>
                          <Button type="button" variant="outline" size="icon" aria-label="Move content left" onClick={() => setContentOffsetXPx((v) => v - 1)}><ArrowLeft /></Button>
                          <Button type="button" variant="outline" size="icon" aria-label="Move content right" onClick={() => setContentOffsetXPx((v) => v + 1)}><ArrowRight /></Button>
                        </div>
                        <div>
                          <Button type="button" variant="secondary" onClick={() => { setContentOffsetXPx(0); setContentOffsetYPx(0); }}>Reset Offsets</Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:col-span-3">
                        <div>
                          <label className="text-sm text-foreground">Paper Preset</label>
                          <NativeSelect aria-label="Paper Preset" className="w-full" value={paperPreset} onChange={(e) => setPaperPreset(e.target.value === 'LETTER' ? 'LETTER' : 'A4')}>
                            <option value="A4">A4 (210x297mm)</option>
                            <option value="LETTER">Letter (8.5x11in)</option>
                          </NativeSelect>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={grayscaleMode} onChange={(e) => setGrayscaleMode(e.target.checked)} /> Grayscale Mode
                        </label>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={showBleedSafe} onChange={(e) => setShowBleedSafe(e.target.checked)} /> Show Safe Margin
                          </label>
                          <Input className="w-28" type="number" min={0} value={safeMarginMm} onChange={(e) => setSafeMarginMm(Number(e.target.value) || 0)} />
                          <span className="text-sm text-muted-foreground">mm</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:col-span-3">
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={framesEnabled} onChange={(e) => setFramesEnabled(e.target.checked)} /> Enable Header/Footer Frames
                          </label>
                        </div>
                        <div>
                          <label className="text-sm text-foreground">Header Height (mm)</label>
                          <Input type="number" min={0} value={headerHeightMm} onChange={(e) => setHeaderHeightMm(Number(e.target.value) || 0)} disabled={!framesEnabled} />
                        </div>
                        <div>
                          <label className="text-sm text-foreground">Footer Height (mm)</label>
                          <Input type="number" min={0} value={footerHeightMm} onChange={(e) => setFooterHeightMm(Number(e.target.value) || 0)} disabled={!framesEnabled} />
                        </div>
                        <div className="md:col-span-3">
                          <Button type="button" variant="outline" onClick={() => { setHeaderHeightMm(20); setFooterHeightMm(20); }}>Reset Frames</Button>
                        </div>
                      </div>
                      <div className="md:col-span-3 border-t pt-3 mt-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                          <label className="text-sm font-medium">Design Aids</label>
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={designAidsEnabled} onChange={(e) => setDesignAidsEnabled(e.target.checked)} /> Enable
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={designShowGrid} onChange={(e) => setDesignShowGrid(e.target.checked)} disabled={!designAidsEnabled} /> Grid
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={designShowRulers} onChange={(e) => setDesignShowRulers(e.target.checked)} disabled={!designAidsEnabled} /> Rulers
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={designSnapToGrid} onChange={(e) => setDesignSnapToGrid(e.target.checked)} disabled={!designAidsEnabled} /> Snap
                          </label>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div>
                            <label className="text-sm text-foreground">Grid Size (px)</label>
                            <Input type="number" min={2} value={designGridSizePx} onChange={(e) => setDesignGridSizePx(Number(e.target.value) || 8)} disabled={!designAidsEnabled} />
                          </div>
                          <div>
                            <label className="text-sm text-foreground">Nudge Step (px)</label>
                            <Input type="number" min={1} value={designNudgeStepPx} onChange={(e) => setDesignNudgeStepPx(Number(e.target.value) || 1)} disabled={!designAidsEnabled} />
                          </div>
                        </div>
                      </div>
                      <div className="md:col-span-3 border-t pt-3 mt-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">Per-doctor Letterhead Profile</label>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  if (!doctorId) { toast({ variant: 'destructive', title: 'No doctor selected' }); return; }
                                  const existing = await apiClient.get(`/users/${doctorId}`) as any;
                                  const currentMeta = (existing && (existing.metadata || existing?.user?.metadata)) || {};
                                  const nextMeta = {
                                    ...currentMeta,
                                    rxPrintProfile: {
                                      printBgUrl,
                                      margins: {
                                        topPx: printTopMarginPx,
                                        leftPx: printLeftMarginPx,
                                        rightPx: printRightMarginPx,
                                        bottomPx: printBottomMarginPx,
                                      },
                                      contentOffset: { xPx: contentOffsetXPx, yPx: contentOffsetYPx },
                                      designAids: {
                                        enabled: designAidsEnabled,
                                        showGrid: designShowGrid,
                                        showRulers: designShowRulers,
                                        snapToGrid: designSnapToGrid,
                                        gridSizePx: designGridSizePx,
                                        nudgeStepPx: designNudgeStepPx,
                                      },
                                    },
                                  };
                                  await apiClient.updateUserProfile(doctorId, { metadata: nextMeta });
                                  toast({ variant: 'success', title: 'Saved', description: 'Doctor profile updated' });
                                } catch (e) {
                                  console.error('Save profile failed', e);
                                  toast({ variant: 'destructive', title: 'Failed to save doctor profile' });
                                }
                              }}
                            >Save Doctor Default</Button>
                            <Button
                              type="button"
                              onClick={async () => {
                                try {
                                  if (!doctorId) { toast({ variant: 'destructive', title: 'No doctor selected' }); return; }
                                  const u = await apiClient.get(`/users/${doctorId}`) as any;
                                  const p = (u && (u.metadata || u?.user?.metadata)?.rxPrintProfile) || (u?.rxPrintProfile);
                                  if (!p) { toast({ title: 'No profile found', description: 'Save a profile first' }); return; }
                                  if (p.printBgUrl) setPrintBgUrl(p.printBgUrl);
                                  applyDoctorPrintLayout(p);
                                  toast({ variant: 'success', title: 'Loaded', description: 'Doctor profile applied' });
                                } catch (e) {
                                  console.error('Load profile failed', e);
                                  toast({ variant: 'destructive', title: 'Failed to load doctor profile' });
                                }
                              }}
                            >Load Doctor Default</Button>
                          </div>
                        </div>
                      </div>
                  <div className="md:col-span-3">
                    <label className="text-sm text-foreground">Print Sections</label>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-sm mt-1">
                      {Object.keys(rxIncludeSections).map((k) => (
                        <label key={k} className="flex items-center gap-2">
                          <input type="checkbox" checked={rxIncludeSections[k]} onChange={(e) => setRxIncludeSections(prev => ({ ...prev, [k]: e.target.checked }))} />
                          <span className="capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Patient History Tab */}
            <TabsContent value="history" className="space-y-4" forceMount>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Patient Visit History</h3>
                <Button variant="outline" onClick={() => void timeline.refresh()} disabled={timeline.loading}>
                  {timeline.loading ? 'Loading…' : 'Refresh'}
                </Button>
              </div>

              {timeline.error ? (<p role="alert" className="text-destructive-text">Unable to load history. {timeline.error}</p>) : timeline.loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Spinner className=" h-8 w-8     mx-auto mb-2" />
                  <LoadingSkeleton label="Loading patient history…" />
                </div>
              ) : timeline.entries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No documented history to show.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Timeline */}
                  <div className="relative">
                    {timeline.entries.map((visit, index) => (
                      <div key={visit.id} className="relative flex items-start space-x-3 pb-4">
                        {/* Timeline line */}
                        {index !== timeline.entries.length - 1 && (
                          <div className="absolute left-4 top-8 w-0.5 h-full bg-muted" />
                        )}
                        
                        {/* Timeline dot */}
                        <div className={`relative flex items-center justify-center w-8 h-8 rounded-full ${
                          visit.status === 'COMPLETED' ? 'bg-success-soft text-success-text' :
                          visit.status === 'IN_PROGRESS' ? 'bg-info-soft text-info-text' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          <div className="w-3 h-3 rounded-full bg-current" />
                        </div>

                        {/* Visit details */}
                        <div className="flex-1 min-w-0">
                          <PatientHistoryVisitCard
                            visit={visit as unknown as Record<string, unknown>}
                            visitLabel={visit.entryType === 'appointment' ? 'Appointment' : 'Visit'}
                            onResume={() => {
                              window.location.href = `/dashboard/visits?visitId=${encodeURIComponent(visit.id)}&patientId=${encodeURIComponent(patientId)}`;
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </TabsContent>
      </Tabs>
    </div>
  );
} 

export default function MedicalVisitForm(props: Props) {
  const [editor, setEditor] = useState<{ generation: number; snapshot?: VisitDetails }>({ generation: 0 });
  return <MedicalVisitFormEditor
    key={editor.generation}
    {...props}
    initialVisitSnapshot={editor.snapshot}
    onDiscardLocalDraft={snapshot => setEditor(previous => ({ generation: previous.generation + 1, snapshot }))}
  />;
}
