'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Mic, 
  MicOff, 
  Save, 
  FileText, 
  User, 
  Clock, 
  Stethoscope, 
  Activity, 
  Heart, 
  Thermometer, 
  Scale, 
  Gauge,
  Plus,
  X,
  Check,
  AlertCircle,
  Calendar,
  MapPin,
  Phone,
  Mail,
  FileImage,
  Trash2,
  Eye,
  Download,
  Edit,
  Copy,
  CheckCircle,
  XCircle,
  Printer,
  Camera,
  Upload,
  ChevronUp,
  ChevronDown,
  History,
  Image
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import VisitPhotos from '@/components/visits/VisitPhotos';
import type { Patient, VisitDetails, VisitPatientSummary, VisitSummary } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { isUuid } from '@/lib/id';

interface Props {
  patientId: string;
  doctorId: string;
  userRole?: string;
  visitNumber?: number;
  patientName?: string;
  visitDate?: string; // ISO string; falls back to today if not provided
  appointmentId?: string;
  appointmentData?: VisitDetails | null;
  initialVisitId?: string;
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

type MedicalVisitDraftState = {
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
  triggers: string;
  priorTx: string;
  dermDx: string[];
  procType: string;
  fluence: string;
  spotSize: string;
  passes: string;
  topicals: string;
  systemics: string;
  counseling: string;
  reviewDate: string;
  activeTab: string;
  completedSections: string[];
  visitStatus: 'draft' | 'in-progress' | 'completed';
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

export default function MedicalVisitForm({ patientId, doctorId, userRole = 'DOCTOR', visitNumber = 1, patientName = '', visitDate, appointmentId, appointmentData, initialVisitId }: Props) {
  // Parse helper
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

  // Core visit data
  const [visitId, setVisitId] = useState<string | null>(initialVisitId || null);
  const [currentVisitNumber, setCurrentVisitNumber] = useState(visitNumber);
  const [visitStatus, setVisitStatus] = useState<'draft' | 'in-progress' | 'completed'>('draft');
  
  // Form sections state
  const [activeTab, setActiveTab] = useState('overview');
  const [completedSections, setCompletedSections] = useState<Set<string>>(new Set());
  
  // Basic info (Therapist/Nurse level - 20-25%)
  const [vitals, setVitals] = useState<VitalsState>({ ...INITIAL_VITALS });
  const [painScore, setPainScore] = useState('');
  const [skinConcerns, setSkinConcerns] = useState<Set<string>>(new Set());
  
  // Complaints (Nurse+ level - 35-40%)
  const [complaints, setComplaints] = useState<string[]>([]);

  // Doctor level (remaining 75-80%)
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');

  // Dermatology-specific
  const [skinType, setSkinType] = useState<string>('');
  const [morphology, setMorphology] = useState<Set<string>>(new Set());
  const [distribution, setDistribution] = useState<Set<string>>(new Set());
  const [acneSeverity, setAcneSeverity] = useState<string>('');
  const [itchScore, setItchScore] = useState<string>('');
  const [triggers, setTriggers] = useState<string>('');
  const [priorTx, setPriorTx] = useState<string>('');
  const [dermDx, setDermDx] = useState<Set<string>>(new Set());
  const [procType, setProcType] = useState<string>('');
  const [fluence, setFluence] = useState<string>('');
  const [spotSize, setSpotSize] = useState<string>('');
  const [passes, setPasses] = useState<string>('');
  const [topicals, setTopicals] = useState<string>('');
  const [systemics, setSystemics] = useState<string>('');
  const [counseling, setCounseling] = useState<string>('');
  const [reviewDate, setReviewDate] = useState<string>('');
  
  // Lab Tests (Investigations)
  const investigationOptions: string[] = useMemo(() => (
    ['CBC','ESR','CRP','LFT','Fasting lipid profile','RFT','Creatinine','FBS','Fasting Insulin','HbA1c','RBS','CUE','Stool examination','Total Testosterone','S. Prolactin','Vitamin B12','Vitamin D','Ferritin','TSH','Thyroid profile','HIV-I,II','HbS Ag','Anti HCV','VDRL','RPR','TPHA','TB Gold Quantiferon Test','Montoux Test','Chest Xray PA view','2D Echo','Skin Biopsy']
  ), []);
  const [labSelections, setLabSelections] = useState<string[]>([]);
  const [labResults, setLabResults] = useState<LabResultsMap>({});
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
    setLabResults((prev) => {
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
    });
  }, [labSelections, COMPOSITE_TESTS, SIMPLE_TEST_UNITS]);

  // Load previous visit's lab results for comparison
  useEffect(() => {
    let isActive = true;
    const loadPrev = async () => {
      try {
        if (!patientId) return;
        const resp = await apiClient.getPatientVisitHistory<any>(patientId, { limit: 2 });
        const list = Array.isArray(resp)
          ? resp
          : Array.isArray((resp as any)?.visits)
            ? (resp as any).visits
            : Array.isArray((resp as any)?.data)
              ? (resp as any).data
              : [];
        // Assuming newest-first; previous is index 1
        const prev = list[1];
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
  }, [patientId]);
  
  // Patient history
  const [patientHistory, setPatientHistory] = useState<VisitSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [saving, setSaving] = useState(false);

  // Print customization (moved from PrescriptionBuilder)
  const [printBgUrl, setPrintBgUrl] = useState<string>('/letterhead.png');
  const [printTopMarginPx, setPrintTopMarginPx] = useState<number>(150);
  const [printLeftMarginPx, setPrintLeftMarginPx] = useState<number>(45);
  const [printRightMarginPx, setPrintRightMarginPx] = useState<number>(45);
  const [printBottomMarginPx, setPrintBottomMarginPx] = useState<number>(45);
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

  // Persist customization locally so users keep their letterhead and layout
  useEffect(() => {
    try {
      const bg = localStorage.getItem('rx_print_bg_url');
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
      if (bg) setPrintBgUrl(bg);
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
  useEffect(() => { try { localStorage.setItem('rx_print_bg_url', printBgUrl || ''); } catch {} }, [printBgUrl]);
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
  const [builderRefreshKey, setBuilderRefreshKey] = useState(0);
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

  const isInitialLoadRef = useRef(true);
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
  const stableHash = useCallback((input: string): string => {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash) + input.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }, []);

  const buildIdempotencyKey = useCallback((method: 'POST' | 'PATCH', rid: string | null, payload: Record<string, unknown>) => {
    const base = JSON.stringify(payload);
    const scope = rid ? `visits:${rid}` : `visits:create:${patientId}:${doctorId}:${appointmentId || ''}`;
    return `cms:${method}:${scope}:${stableHash(base)}`;
  }, [appointmentId, doctorId, patientId, stableHash]);

  const clearAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  const serializeDraft = useCallback((): MedicalVisitDraftState => ({
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
    triggers,
    priorTx,
    dermDx: Array.from(dermDx),
    procType,
    fluence,
    spotSize,
    passes,
    topicals,
    systemics,
    counseling,
    reviewDate,
    activeTab,
    completedSections: Array.from(completedSections),
    visitStatus,
  }), [
    activeTab,
    assessment,
    complaints,
    completedSections,
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
    priorTx,
    procType,
    reviewDate,
    skinConcerns,
    skinType,
    spotSize,
    subjective,
    systemics,
    topicals,
    triggers,
    vitals,
    visitStatus,
    acneSeverity,
  ]);

  const applyDraft = useCallback((draft: MedicalVisitDraftState) => {
    setVitals(draft.vitals || { ...INITIAL_VITALS });
    setPainScore(draft.painScore || '');
    setSkinConcerns(new Set(draft.skinConcerns || []));
    setComplaints(draft.complaints || []);
    setSubjective(draft.subjective || '');
    setObjective(draft.objective || '');
    setAssessment(draft.assessment || '');
    setPlan(draft.plan || '');
    setSkinType(draft.skinType || '');
    setMorphology(new Set(draft.morphology || []));
    setDistribution(new Set(draft.distribution || []));
    setAcneSeverity(draft.acneSeverity || '');
    setItchScore(draft.itchScore || '');
    setTriggers(draft.triggers || '');
    setPriorTx(draft.priorTx || '');
    setDermDx(new Set(draft.dermDx || []));
    setProcType(draft.procType || '');
    setFluence(draft.fluence || '');
    setSpotSize(draft.spotSize || '');
    setPasses(draft.passes || '');
    setTopicals(draft.topicals || '');
    setSystemics(draft.systemics || '');
    setCounseling(draft.counseling || '');
    setReviewDate(draft.reviewDate || '');
    setActiveTab(draft.activeTab || 'overview');
    setCompletedSections(new Set(draft.completedSections || []));
    setVisitStatus(draft.visitStatus || 'draft');
  }, []);

  const persistDraftToStorage = useCallback(
    (force = false, draftOverride?: MedicalVisitDraftState) => {
      if (!draftStorageKey || typeof window === 'undefined') return false;
      try {
    const payload = draftOverride ?? serializeDraft();
    const record = {
      version: DRAFT_STORAGE_VERSION,
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

  // Calculate overall progress (moved up to avoid TDZ issues)
  const getProgress = useCallback(() => {
    const totalSections = hasPermission('all') ? 5 : 3; // Doctor vs Therapist/Nurse (Treatment tab removed)
    return Math.round((completedSections.size / totalSections) * 100);
  }, [completedSections.size, hasPermission]);

  // Build payload for save/update (moved up to avoid TDZ issues)
  const buildPayload = useCallback(() => {
    // Convert Fahrenheit (UI unit) to Celsius for backend validation/storage
    let temperatureC: number | undefined = undefined;
    if (vitals.temp !== '') {
      const n = Number(vitals.temp);
      if (!Number.isNaN(n)) {
        temperatureC = ((n - 32) * 5) / 9;
      }
    }
    const payload: Record<string, unknown> = {
      patientId,
      doctorId,
      appointmentId, // Include appointment ID if available
      visitNumber: currentVisitNumber,
      status: visitStatus,
      complaints: (complaints.length > 0 ? complaints : (subjective ? [subjective] : ['General consultation']))
        .map((complaint) => ({ complaint })),
      examination: {
        ...(objective ? { generalAppearance: objective } : {}),
        dermatology: {
          skinType: skinType || undefined,
          morphology: Array.from(morphology),
          distribution: Array.from(distribution),
          acneSeverity: acneSeverity || undefined,
          itchScore: itchScore ? Number(itchScore) : undefined,
          painScore: painScore ? Number(painScore) : undefined,
          triggers: triggers || undefined,
          priorTreatments: priorTx || undefined,
          skinConcerns: Array.from(skinConcerns),
        }
      },
      diagnosis: (dermDx.size > 0 ? Array.from(dermDx) : assessment ? [assessment] : [])
        .map((dx) => ({ diagnosis: dx, icd10Code: 'R69', type: 'Primary' })),
      treatmentPlan: {
        ...(plan ? { notes: plan } : {}),
        dermatology: {
          procedures: procType ? [{ 
            type: procType, 
            fluence: fluence ? Number(fluence) : undefined, 
            spotSize: spotSize ? Number(spotSize) : undefined, 
            passes: passes ? Number(passes) : undefined 
          }] : [],
          medications: {
            topicals: topicals || undefined,
            systemics: systemics || undefined,
          },
          counseling: counseling || undefined,
          investigations: labSelections.length ? labSelections : undefined,
          labResults: labResults && Object.keys(labResults).length ? labResults : undefined,
          // follow-up date handled at visit completion; prescription gets reviewDate via prop
        }
      },
      vitals: {
        systolicBP: vitals.bpS ? Number(vitals.bpS) : undefined,
        diastolicBP: vitals.bpD ? Number(vitals.bpD) : undefined,
        heartRate: vitals.hr ? Number(vitals.hr) : undefined,
        temperature: temperatureC,
        weight: vitals.weight ? Number(vitals.weight) : undefined,
        height: vitals.height ? Number(vitals.height) : undefined,
        respiratoryRate: vitals.rr ? Number(vitals.rr) : undefined,
        oxygenSaturation: vitals.spo2 ? Number(vitals.spo2) : undefined,
      },
      photos: [], // Photos are now managed by VisitPhotos component
      metadata: {
        capturedBy: userRole,
        sections: Array.from(completedSections),
        progress: getProgress(),
      }
    };

    if (reviewDate) {
      payload.followUp = { date: reviewDate };
    }

    return payload;
  }, [assessment, complaints, counseling, dermDx, doctorId, fluence, passes, patientId, plan, priorTx, procType, reviewDate, skinConcerns, skinType, subjective, systemics, topicals, currentVisitNumber, visitStatus, appointmentId, morphology, distribution, acneSeverity, itchScore, painScore, getProgress, completedSections, userRole, vitals, objective]);

  const runAutoSave = useCallback(async () => {
    if (!visitId || !hasUnsavedChangesRef.current) {
      return;
    }

    const persisted = persistDraftToStorage();

    if (autoSavePromiseRef.current) {
      return;
    }

    const payload = buildPayload();
    autoSavePromiseRef.current = (async () => {
      try {
        // Reuse same idempotency key for retries of the same payload
        let idemKey = lastIdempotencyKeyRef.current;
        const currentKey = buildIdempotencyKey('PATCH', visitId, payload as any);
        if (idemKey !== currentKey) {
          idemKey = currentKey;
          lastIdempotencyKeyRef.current = idemKey;
        }
        await apiClient.updateVisit(visitId, payload, { idempotencyKey: idemKey });
        hasUnsavedChangesRef.current = false;
        autoSaveFailureNotifiedRef.current = false;
        justSavedRef.current = true;
        if (!persisted) {
          persistDraftToStorage(true);
        }
      } catch (error) {
        console.error('Auto-save failed:', error);
        hasUnsavedChangesRef.current = true;
        toast({
          variant: 'warning',
          title: 'Auto-save failed',
          description: getErrorMessage(error) || 'We will retry shortly.',
        });
        clearAutoSaveTimer();
        autoSaveTimerRef.current = window.setTimeout(() => {
          autoSaveTimerRef.current = null;
          void runAutoSave();
        }, AUTO_SAVE_RETRY_MS);
      } finally {
        autoSavePromiseRef.current = null;
      }
    })();
  }, [buildPayload, clearAutoSaveTimer, persistDraftToStorage, toast, visitId]);

  const scheduleAutoSave = useCallback(
    (delay = AUTO_SAVE_INTERVAL_MS) => {
      if (typeof window === 'undefined') {
        return;
      }
      if (!hasUnsavedChangesRef.current) {
        return;
      }
      if (justSavedRef.current) {
        clearAutoSaveTimer();
        autoSaveTimerRef.current = window.setTimeout(() => {
          autoSaveTimerRef.current = null;
          justSavedRef.current = false;
          void runAutoSave();
        }, delay);
        return;
      }
      clearAutoSaveTimer();
      autoSaveTimerRef.current = window.setTimeout(() => {
        autoSaveTimerRef.current = null;
        void runAutoSave();
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
          data?: MedicalVisitDraftState;
          visitId?: string | null;
          appointmentId?: string | null;
          patientId?: string;
          doctorId?: string;
        };
        if (parsed?.version === DRAFT_STORAGE_VERSION && parsed.data) {
          applyDraft(parsed.data);
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
  }, [draftStorageKey, applyDraft]);

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
        const list = (res?.visits || res?.data || []) as Array<{ id?: string }>;
        const existingId = Array.isArray(list) && list.length > 0 ? list[0]?.id : undefined;
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
        const res: any = await apiClient.get(`/visits/${visitId}`);
        // Prefill complaints, vitals, exam, diagnosis, plan when empty
        try {
          const complaintsArr = Array.isArray(res?.complaints) ? res.complaints : (res?.complaints ? JSON.parse(res.complaints) : []);
          if (Array.isArray(complaintsArr) && complaints.length === 0) {
            setComplaints(complaintsArr.map((c: any) => c?.complaint).filter(Boolean));
          }
        } catch {}
        try {
          const v = typeof res?.vitals === 'object' ? res.vitals : (res?.vitals ? JSON.parse(res.vitals) : undefined);
          if (v && Object.keys(v).length && JSON.stringify(vitals) === JSON.stringify(INITIAL_VITALS)) {
            setVitals({
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
          const exam = typeof res?.exam === 'object' ? res.exam : (res?.exam ? JSON.parse(res.exam) : undefined);
          if (exam?.generalAppearance && !objective) setObjective(String(exam.generalAppearance));
          const derm = exam?.dermatology || {};
          if (derm?.skinType && !skinType) setSkinType(String(derm.skinType));
          if (Array.isArray(derm?.morphology) && morphology.size === 0) setMorphology(new Set(derm.morphology));
          if (Array.isArray(derm?.distribution) && distribution.size === 0) setDistribution(new Set(derm.distribution));
          if (derm?.acneSeverity && !acneSeverity) setAcneSeverity(String(derm.acneSeverity));
          if (derm?.itchScore && !itchScore) setItchScore(String(derm.itchScore));
          if (Array.isArray(derm?.skinConcerns) && skinConcerns.size === 0) setSkinConcerns(new Set(derm.skinConcerns));
        } catch {}
        try {
          const diagArr = Array.isArray(res?.diagnosis) ? res.diagnosis : (res?.diagnosis ? JSON.parse(res.diagnosis) : []);
          if (Array.isArray(diagArr) && dermDx.size === 0 && !assessment) {
            const vals = diagArr.map((d: any) => d?.diagnosis).filter(Boolean);
            setDermDx(new Set(vals));
            if (vals[0]) setAssessment(String(vals[0]));
          }
        } catch {}
        try {
          const planObj = typeof res?.plan === 'object' ? res.plan : (res?.plan ? JSON.parse(res.plan) : {});
          if (planObj?.notes && !plan) setPlan(String(planObj.notes));
          const derm = planObj?.dermatology || {};
          if (Array.isArray(derm?.investigations) && labSelections.length === 0) setLabSelections(derm.investigations);
          if (derm?.procedures && Array.isArray(derm.procedures) && derm.procedures.length && !procType) {
            const p = derm.procedures[0];
            if (p?.type) setProcType(String(p.type));
            if (p?.fluence) setFluence(String(p.fluence));
            if (p?.spotSize) setSpotSize(String(p.spotSize));
            if (p?.passes) setPasses(String(p.passes));
          }
          if (derm?.medications) {
            if (derm.medications.topicals && !topicals) setTopicals(String(derm.medications.topicals));
            if (derm.medications.systemics && !systemics) setSystemics(String(derm.medications.systemics));
          }
          if (derm?.counseling && !counseling) setCounseling(String(derm.counseling));
        } catch {}
      } catch {
        // ignore
      }
    };
    void load();
  }, [visitId]);

  useEffect(() => {
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }

    if (justSavedRef.current) {
      justSavedRef.current = false;
      return;
    }

    hasUnsavedChangesRef.current = true;
    autoSaveFailureNotifiedRef.current = false;
    const changed = persistDraftToStorage();
    if (changed) {
      scheduleAutoSave();
    }
  }, [
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
    triggers,
    priorTx,
    dermDx,
    procType,
    fluence,
    spotSize,
    passes,
    topicals,
    systemics,
    counseling,
    reviewDate,
    activeTab,
    completedSections,
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
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [persistDraftToStorage]);
  // Patient context sidebar
  const [showPatientContext, setShowPatientContext] = useState(true);
  const [patientDetails, setPatientDetails] = useState<VisitPatientSummary | null>(null);
  const [recentVisits, setRecentVisits] = useState<VisitSummary[]>([]);

  // Quick templates for common scenarios
  const [showQuickTemplates, setShowQuickTemplates] = useState(false);
  
  // Voice-to-text functionality
  const [isListening, setIsListening] = useState(false);
  const [activeVoiceField, setActiveVoiceField] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
   
  // Do not access JWT on client; rely on HttpOnly cookie sent automatically
 
  const startVoiceInput = useCallback(async (fieldName: string) => {
    // Toggle: if already recording the same field, stop and finalize
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const chunks: BlobPart[] = [];
      const mimeType = (window as any).MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
        ((window as any).MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } as any : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        try { stream.getTracks().forEach(t => t.stop()); } catch {}
        streamRef.current = null;
        recorderRef.current = null;
        // Use the actual recording mimeType to avoid server-side "Unsupported audio type"
        const recordedType: string = mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: recordedType });
        try {
           const baseUrl = '/api';
           const fd = new FormData();
           // Preserve a sensible filename extension matching the recorded mime type
           const filename = recordedType === 'audio/mp4' ? 'speech.m4a' : 'speech.webm';
           fd.append('file', blob, filename);
           const res = await fetch(`${baseUrl}/visits/transcribe`, {
             method: 'POST',
             body: fd,
             credentials: 'include',
           });
           if (!res.ok) {
             let errText = '';
             try { errText = await res.text(); } catch {}
             console.error('Transcription request failed:', res.status, errText);
             toast({
               variant: 'warning',
               title: 'Transcription failed',
               description: `Speech-to-text request returned ${res.status}.`,
             });
             return;
           }
           const data = await res.json();
           const text = (data?.text as string) || '';
           if (text) {
             switch (fieldName) {
               case 'subjective':
                 setSubjective(prev => (prev ? prev + ' ' : '') + text);
                 break;
               case 'objective':
                 setObjective(prev => (prev ? prev + ' ' : '') + text);
                 break;
               case 'assessment':
                 setAssessment(prev => (prev ? prev + ' ' : '') + text);
                 break;
               case 'plan':
                 setPlan(prev => (prev ? prev + ' ' : '') + text);
                 break;
             }
           }
        } catch (e) {
          console.error('Speech-to-text error:', e);
          toast({
            variant: 'warning',
            title: 'Speech-to-text error',
            description: getErrorMessage(e) || 'Please try again.',
          });
        } finally {
          setIsListening(false);
          setActiveVoiceField(null);
        }
      };
      recorder.start();
      // Auto-stop after 30s or when button clicked again (toggle)
      setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, 300000);
    } catch (e) {
      setIsListening(false);
      setActiveVoiceField(null);
      try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
      recorderRef.current = null;
      streamRef.current = null;
      toast({
        variant: 'warning',
        title: 'Microphone access denied',
        description: getErrorMessage(e) || 'Check browser permissions and try again.',
      });
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

  const toggleSet = useCallback(<T,>(current: Set<T>, item: T, updater: (next: Set<T>) => void) => {
    const next = new Set(current);
    if (next.has(item)) {
      next.delete(item);
    } else {
      next.add(item);
    }
    updater(next);
  }, []);

  const quickTemplates = useMemo(() => ([
    {
      name: 'Acne Follow-up',
      condition: () => recentVisits.some((visit) => {
        const diagnosisEntries = Array.isArray(visit.diagnosis) ? visit.diagnosis : [];
        return diagnosisEntries.some((d: any) => {
          const label = typeof d === 'string' ? d : d?.diagnosis;
          return label ? label.toLowerCase().includes('acne') : false;
        });
      }),
      apply: () => {
        setSubjective('Follow-up for acne treatment. Patient reports improvement/worsening.');
        setDermDx(new Set(['Acne vulgaris']));
        setMorphology(new Set(['Papule', 'Pustule', 'Comedo']));
        setDistribution(new Set(['Face']));
      }
    },
    {
      name: 'Routine Dermatology Check',
      condition: () => true,
      apply: () => {
        setSubjective('General dermatological consultation. Patient seeking skin assessment.');
        setSkinConcerns(new Set(['General assessment']));
      }
    },
    {
      name: 'Pigmentation Concern',
      condition: () => recentVisits.some((visit) => {
        const diagnosisEntries = Array.isArray(visit.diagnosis) ? visit.diagnosis : [];
        return diagnosisEntries.some((d: any) => {
          const label = typeof d === 'string' ? d : d?.diagnosis;
          return label ? label.toLowerCase().includes('melasma') || label.toLowerCase().includes('pigment') : false;
        });
      }),
      apply: () => {
        setSubjective('Pigmentation concerns. Patient reports dark spots/patches.');
        setDermDx(new Set(['Melasma', 'Post-inflammatory hyperpigmentation']));
        setMorphology(new Set(['Macule']));
        setDistribution(new Set(['Face']));
      }
    }
  ]), [parseJsonValue, recentVisits]);

  // Load visit number and patient history
  const loadPatientContext = useCallback(async () => {
    if (!patientId) {
      return;
    }

    try {
      const [patient, visits] = await Promise.all([
        apiClient.getPatient(patientId),
        apiClient.getPatientVisitHistory<VisitSummary[] | { visits?: VisitSummary[]; data?: VisitSummary[] }>(patientId, { limit: 3 })
      ]);

      const visitList = Array.isArray(visits)
        ? visits
        : visits?.visits || visits?.data || [];

      setPatientDetails(patient as VisitPatientSummary);
      setRecentVisits(visitList as VisitSummary[]);
    } catch (error) {
      console.error('Failed to load patient context:', error);
      if (appointmentData && 'patient' in appointmentData && appointmentData.patient) {
        setPatientDetails(appointmentData.patient as VisitPatientSummary);
      }
    }
  }, [appointmentData, patientId]);

  const loadPatientHistory = useCallback(async () => {
    if (!patientId) {
      return;
    }

    try {
      setLoadingHistory(true);
      const response = await apiClient.getPatientVisitHistory<VisitSummary[] | { visits?: VisitSummary[]; data?: VisitSummary[] }>(patientId);
      const responseDataArray = Array.isArray(response) ? response : response?.visits || response?.data || [];
      const historyEntries = responseDataArray as VisitSummary[];
      setPatientHistory(historyEntries);
      setCurrentVisitNumber(historyEntries.length + 1);
    } catch (error) {
      console.error('Failed to load patient history:', error);
      setPatientHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [patientId]);

  useEffect(() => {
    void loadPatientHistory();
    void loadPatientContext();
  }, [loadPatientContext, loadPatientHistory]);

  // Section completion tracking
  const markSectionComplete = (section: string) => {
    setCompletedSections(prev => new Set([...prev, section]));
  };

  const isSectionComplete = (section: string) => {
    return completedSections.has(section);
  };


  const save = async (complete = false) => {
    try {
      setSaving(true);
      const payload = buildPayload();
      
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
          // If a visit already exists for the appointment, resume it instead of failing
          if (status === 409 && appointmentId) {
            try {
              const res: any = await apiClient.getVisits({ appointmentId });
              const list = (res?.visits || res?.data || []) as Array<{ id?: string }>;
              const existingId = Array.isArray(list) && list.length > 0 ? list[0]?.id : undefined;
              if (existingId && typeof existingId === 'string') {
                setVisitId(existingId);
                const patchKey = buildIdempotencyKey('PATCH', existingId, payload as any);
                visit = await apiClient.updateVisit(existingId, payload, { idempotencyKey: patchKey });
              } else {
                throw err;
              }
            } catch (e2) {
              throw e2;
            }
          } else {
            throw err;
          }
        }
      }
      
      if (complete) {
        const completePayload: Record<string, unknown> = {};
        if (reviewDate) completePayload.followUpDate = reviewDate;
        const completeId = (visit as VisitDetails).id;
        const idemKey = buildIdempotencyKey('POST', completeId, completePayload as any);
        await apiClient.completeVisit(completeId, completePayload, { idempotencyKey: idemKey });
        setVisitStatus('completed');
        if (typeof window !== 'undefined' && draftStorageKey) {
          try {
            window.localStorage.removeItem(draftStorageKey);
          } catch {}
        }
        lastDraftJsonRef.current = null;
        hasUnsavedChangesRef.current = false;
      } else {
        setVisitStatus('in-progress');
        hasUnsavedChangesRef.current = false;
        justSavedRef.current = true;
        clearAutoSaveTimer();
        persistDraftToStorage(true);
      }
      
      toast({
        variant: 'success',
        title: complete ? 'Visit completed' : 'Visit saved',
        description: complete
          ? 'All documentation has been marked complete.'
          : 'Your draft was saved safely.',
      });

      void loadPatientHistory();
    } catch (e) {
      console.error('Save failed:', e);
      toast({
        variant: 'destructive',
        title: 'Unable to save visit',
        description: getErrorMessage(e) || 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Render tabs based on user role
  const renderTabs = () => {
    const tabs = [
      { id: 'overview', label: 'Overview', icon: Eye, always: true },
    ];

    if (hasPermission('vitals') || hasPermission('all')) {
      tabs.push({ id: 'vitals', label: 'Vitals', icon: Stethoscope, always: false });
    }

    if (hasPermission('photos') || hasPermission('all')) {
      tabs.push({ id: 'photos', label: 'Photos', icon: Camera, always: false });
    }

    // Assessment tab removed; moved into Prescription's Chief Complaints

    if (hasPermission('all')) {
      tabs.push({ id: 'prescription', label: 'Prescription', icon: FileText, always: false });
      tabs.push({ id: 'labs', label: 'Lab Tests', icon: Activity, always: false });
      tabs.push({ id: 'customization', label: 'Customization', icon: FileText, always: false });
    }

    tabs.push({ id: 'history', label: 'History', icon: History, always: true });

    // On Examination is now part of Prescription tab UI

    return tabs;
  };

  return (
    <div className="flex gap-6">
      {/* Patient Context Sidebar */}
      {showPatientContext && (
        <div className="w-80 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Patient Context</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowPatientContext(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {patientDetails && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">{patientDetails.name}</span>
                    <Badge variant="outline" className="text-xs">ID: {patientId}</Badge>
                  </div>
                  <div className="text-sm text-gray-600">
                    Age: {patientDetails.dob ? new Date().getFullYear() - new Date(patientDetails.dob).getFullYear() : 'N/A'} • {patientDetails.gender || 'N/A'}
                  </div>
                  <div className="text-sm text-gray-600">
                    Phone: {patientDetails.phone || 'N/A'}
                  </div>
                  {patientDetails.allergies && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded">
                      <div className="text-xs font-medium text-red-800">⚠️ ALLERGIES</div>
                      <div className="text-sm text-red-700">{patientDetails.allergies}</div>
                    </div>
                  )}
                  {patientDetails.medicalHistory && (
                    <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                      <div className="text-xs font-medium text-blue-800">Medical History</div>
                      <div className="text-sm text-blue-700">{patientDetails.medicalHistory}</div>
                    </div>
                  )}
                </div>
              )}
              
              {!patientDetails && patientId && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <div className="text-xs font-medium text-yellow-800">⚠️ Patient Loading</div>
                  <div className="text-sm text-yellow-700">
                    Loading patient data for ID: {patientId}
                    {patientName && <div className="mt-1">Name: {patientName}</div>}
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="mt-2"
                    onClick={loadPatientContext}
                  >
                    Retry Loading
                  </Button>
                </div>
              )}
              
              {!patientDetails && !patientId && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded">
                  <div className="text-xs font-medium text-gray-600">No Patient Selected</div>
                  <div className="text-sm text-gray-500">
                    Patient context will appear when a patient is selected
                  </div>
                </div>
              )}
              
              {recentVisits.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Recent Visits</div>
                  {recentVisits.slice(0, 2).map((visit, index) => {
                    const timestamp = visit.createdAt || (visit as any).date;
                    const displayDate = timestamp ? new Date(timestamp).toLocaleDateString() : 'Unknown date';
                    const diagnoses = Array.isArray(visit.diagnosis)
                      ? visit.diagnosis
                      : [];
                    const diagnosesList = diagnoses
                      .map((dx: any) => (typeof dx === 'string' ? dx : dx?.diagnosis))
                      .filter(Boolean)
                      .slice(0, 2)
                      .join(', ');
                    return (
                    <div key={visit.id || index} className="p-2 bg-gray-50 rounded text-xs">
                        <div className="font-medium">
                          {displayDate}
                        </div>
                        <div className="text-gray-600">
                          {diagnosesList || 'No diagnosis'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Main Content */}
      <div className={`flex-1 space-y-6 ${showPatientContext ? '' : 'max-w-none'}`}>
        {!showPatientContext && (
          <Button variant="outline" size="sm" onClick={() => setShowPatientContext(true)} className="mb-4">
            <User className="h-4 w-4 mr-2" />
            Show Patient Context
          </Button>
        )}
        
        {/* Quick Templates */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Quick Start Templates</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowQuickTemplates(!showQuickTemplates)}>
                {showQuickTemplates ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          {showQuickTemplates && (
            <CardContent className="pt-0">
              <div className="space-y-2">
                {quickTemplates
                  .filter(template => template.condition())
                  .map((template, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={template.apply}
                    >
                      <FileText className="h-3 w-3 mr-2" />
                      {template.name}
                    </Button>
                  ))}
              </div>
            </CardContent>
          )}
        </Card>

      {/* Visit Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Visit #{currentVisitNumber}
                <Badge variant={visitStatus === 'completed' ? 'default' : visitStatus === 'in-progress' ? 'secondary' : 'outline'}>
                  {visitStatus.replace('-', ' ').toUpperCase()}
                </Badge>
                {appointmentData && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    <Calendar className="h-3 w-3 mr-1" />
                    Linked to Appointment
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Medical Visit Documentation • Role: {userRole} • Progress: {getProgress()}%
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{photoCount} Photos</Badge>
              <div className="w-20 bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${getProgress()}%` }}
                />
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Form */}
      <Card>
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6 flex flex-wrap gap-2">
              {renderTabs().map(tab => {
                const IconComponent = tab.icon;
                return (
                  <TabsTrigger 
                    key={tab.id} 
                    value={tab.id}
                    className="flex items-center gap-2"
                  >
                    <IconComponent className="h-4 w-4" />
                    {tab.label}
                    {isSectionComplete(tab.id) && (
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4" forceMount>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Visit Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Visit Number:</span>
                      <Badge variant="outline">#{currentVisitNumber}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Status:</span>
                      <Badge variant={visitStatus === 'completed' ? 'default' : 'secondary'}>
                        {visitStatus.replace('-', ' ').toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Photos Captured:</span>
                      <span className="text-sm font-medium">0</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Captured By:</span>
                      <span className="text-sm font-medium">{userRole}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Progress Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {renderTabs().filter(tab => tab.id !== 'overview' && tab.id !== 'history').map(tab => (
                        <div key={tab.id} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{tab.label}:</span>
                          <div className="flex items-center gap-2">
                            {isSectionComplete(tab.id) ? (
                              <Badge variant="default" className="text-xs">Complete</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">Pending</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Overall Progress:</span>
                        <span className="text-sm font-bold text-blue-600">{getProgress()}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${getProgress()}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Quick Actions */}
    <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {hasPermission('vitals') && (
                      <Button variant="outline" onClick={() => setActiveTab('vitals')}>
                        <Stethoscope className="h-4 w-4 mr-2" />
                        Record Vitals
                      </Button>
                    )}
                    {hasPermission('photos') && (
                      <Button variant="outline" onClick={() => setActiveTab('photos')}>
                        <Camera className="h-4 w-4 mr-2" />
                        Capture Photos
                      </Button>
                    )}
                    {/* On Examination is now inside Prescription tab */}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Vitals Tab */}
            {(hasPermission('vitals') || hasPermission('all')) && (
              <TabsContent value="vitals" className="space-y-4" forceMount>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                    <label className="text-sm font-medium text-gray-700">BP Systolic</label>
                    <Input 
                      placeholder="mmHg" 
                      value={vitals.bpS} 
                      onChange={(e) => setVitals({ ...vitals, bpS: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">BP Diastolic</label>
                    <Input 
                      placeholder="mmHg" 
                      value={vitals.bpD} 
                      onChange={(e) => setVitals({ ...vitals, bpD: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Heart Rate</label>
                    <Input 
                      placeholder="bpm" 
                      value={vitals.hr} 
                      onChange={(e) => setVitals({ ...vitals, hr: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Temperature</label>
                    <Input 
                      placeholder="°F"
                      value={vitals.temp} 
                      onChange={(e) => setVitals({ ...vitals, temp: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Weight</label>
                    <Input 
                      placeholder="kg" 
                      value={vitals.weight} 
                      onChange={(e) => setVitals({ ...vitals, weight: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Height</label>
                    <Input 
                      placeholder="cm" 
                      value={vitals.height} 
                      onChange={(e) => setVitals({ ...vitals, height: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">BMI</label>
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
                    <label className="text-sm font-medium text-gray-700">Resp. Rate</label>
                    <Input 
                      placeholder="/min" 
                      value={vitals.rr} 
                      onChange={(e) => setVitals({ ...vitals, rr: e.target.value })} 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Pain Score (0-10)</label>
                    <Input 
                      placeholder="0-10" 
                      value={painScore} 
                      onChange={(e) => setPainScore(e.target.value)} 
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={async () => { await save(false); markSectionComplete('vitals'); setBuilderRefreshKey((k) => k + 1); }}>
                    Mark Vitals Complete
                  </Button>
                </div>
              </TabsContent>
            )}

            {/* Lab Tests Tab - Reception + Doctor */}
            {(hasPermission('all') || hasPermission('basic-info')) && (
              <TabsContent value="labs" className="space-y-4" forceMount>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Lab Tests (Investigations)</CardTitle>
                    <CardDescription>Select tests and enter results with units. You can also autofill from a photo.</CardDescription>
                    <div className="mt-2">
                      <label className="flex items-center gap-2 text-sm text-gray-600">
                        <input type="checkbox" checked={compareLabs} onChange={(e) => setCompareLabs(e.target.checked)} />
                        Compare with previous visit
                      </label>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {investigationOptions.map((opt) => (
                          <label key={opt} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={labSelections.includes(opt)}
                              onChange={(e) => setLabSelections((prev) => e.target.checked ? [...prev, opt] : prev.filter((x) => x !== opt))}
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {labSelections.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-sm font-medium">Enter Results</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {labSelections.map((test) => {
                            const entry = labResults[test] as any;
                            const isComposite = entry && typeof entry === 'object' && !('value' in entry) && !('unit' in entry);
                            return (
                              <div key={test} className="border rounded p-3">
                                <div className="text-sm font-semibold mb-2">{test}</div>
                                {!isComposite ? (
                                  <div className="flex gap-2 items-center">
                                    <Input
                                      placeholder="Value"
                                      value={(entry?.value ?? '') as string}
                                      onChange={(e) => setLabResults((prev) => ({ ...prev, [test]: { value: e.target.value, unit: (prev[test] as any)?.unit || '' } }))}
                                    />
                                    <Input
                                      placeholder="Unit"
                                      value={(entry?.unit ?? '') as string}
                                      onChange={(e) => setLabResults((prev) => ({ ...prev, [test]: { value: (prev[test] as any)?.value || '', unit: e.target.value } }))}
                                    />
                                    {compareLabs && (() => {
                                      const prev = prevLabResults[test] as any;
                                      const prevVal = typeof prev === 'object' && prev && 'value' in prev ? (prev.value ?? '') : '';
                                      const currNum = Number((entry?.value ?? '').toString());
                                      const prevNum = Number((prevVal ?? '').toString());
                                      const hasNums = !Number.isNaN(currNum) && !Number.isNaN(prevNum);
                                      const delta = hasNums ? (currNum - prevNum) : null;
                                      return (
                                        <div className="text-xs text-gray-600">
                                          {hasNums ? (
                                            <span>Δ {delta! >= 0 ? '+' : ''}{delta}</span>
                                          ) : (
                                            <span className="text-gray-400">—</span>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {Object.keys(entry || {}).map((sub) => (
                                      <div key={sub} className="flex items-center gap-2">
                                        <span className="text-xs w-28">{sub}</span>
                                        <Input
                                          placeholder="Value"
                                          value={(entry?.[sub]?.value ?? '') as string}
                                          onChange={(e) => setLabResults((prev) => ({
                                            ...prev,
                                            [test]: { ...(prev[test] as any), [sub]: { value: e.target.value, unit: (prev[test] as any)?.[sub]?.unit || '' } },
                                          }))}
                                        />
                                        <Input
                                          placeholder="Unit"
                                          value={(entry?.[sub]?.unit ?? '') as string}
                                          onChange={(e) => setLabResults((prev) => ({
                                            ...prev,
                                            [test]: { ...(prev[test] as any), [sub]: { value: (prev[test] as any)?.[sub]?.value || '', unit: e.target.value } },
                                          }))}
                                        />
                                        {compareLabs && (() => {
                                          const prev = (prevLabResults[test] as any)?.[sub];
                                          const prevVal = typeof prev === 'object' ? (prev?.value ?? '') : '';
                                          const currNum = Number((((entry as any)?.[sub]?.value ?? '') as string).toString());
                                          const prevNum = Number((prevVal ?? '').toString());
                                          const hasNums = !Number.isNaN(currNum) && !Number.isNaN(prevNum);
                                          const delta = hasNums ? (currNum - prevNum) : null;
                                          return (
                                            <div className="text-xs text-gray-600">
                                              {hasNums ? (
                                                <span>Δ {delta! >= 0 ? '+' : ''}{delta}</span>
                                              ) : (
                                                <span className="text-gray-400">—</span>
                                              )}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="text-xs text-gray-500">Selections and results are saved under Treatment Plan → Dermatology.</div>
                      <div className="flex gap-2">
                        <label className="text-sm">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              try {
                                setLabsAutofillLoading(true);
                                const fd = new FormData();
                                fd.append('file', f);
                                const res = await fetch('/api/visits/labs/autofill', { method: 'POST', body: fd, credentials: 'include' });
                                if (!res.ok) {
                                  let t = '';
                                  try { t = await res.text(); } catch {}
                                  throw new Error(`AI autofill failed: ${res.status} ${t}`);
                                }
                                const data = await res.json();
                                const labs = (data?.labs as any) || {};
                                const newSelections = new Set(labSelections);
                                const newResults: typeof labResults = { ...labResults };
                                Object.keys(labs).forEach((name) => {
                                  newSelections.add(name);
                                  newResults[name] = labs[name];
                                });
                                setLabSelections(Array.from(newSelections));
                                setLabResults(newResults);
                                toast({ variant: 'success', title: 'Autofill complete', description: 'Extracted results inserted.' });
                              } catch (err) {
                                console.error(err);
                                toast({ variant: 'warning', title: 'Autofill failed', description: getErrorMessage(err) || 'Try another image.' });
                              } finally {
                                setLabsAutofillLoading(false);
                                try { (e.target as any).value = ''; } catch {}
                              }
                            }}
                          />
                        </label>
                        <Button type="button" variant="outline" disabled={labsAutofillLoading} onClick={async () => { await save(false); markSectionComplete('labs'); }}>
                          {labsAutofillLoading ? 'Processing…' : 'Save Labs'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
            {/* Photos Tab */}
            {(hasPermission('photos') || hasPermission('all')) && (
              <TabsContent value="photos" className="space-y-4">
                <VisitPhotos 
                  visitId={visitId || 'temp'} 
                  patientId={patientId}
                  allowDelete={hasPermission('photos') || hasPermission('all')}
                  onChangeCount={(c) => { setPhotoCount(c); }}
                  onVisitNeeded={async () => {
                    if (!visitId) {
                      const minimalPayload: Record<string, unknown> = {
                        patientId,
                        doctorId,
                        appointmentId,
                        visitNumber: currentVisitNumber,
                        status: 'in-progress',
                        complaints: [{ complaint: 'Photo documentation visit' }], // Minimal required complaint
                        vitals: {},
                        examination: {},
                        diagnosis: [],
                        treatmentPlan: {},
                        photos: [],
                        metadata: {
                          capturedBy: userRole,
                          sections: ['photos'],
                          progress: 10, // Minimal progress
                          createdForPhotos: true, // Flag to indicate this was created for photos
                        }
                      };
                      const newVisit = await apiClient.createVisit(minimalPayload);
                      const newVisitId = (newVisit as VisitDetails).id;
                      setVisitId(newVisitId);
                      return newVisitId;
                    }
                    return visitId;
                  }}
                />
              </TabsContent>
            )}

            


            {/* Treatment Tab removed; handled within Prescription where relevant */}

            {/* Prescription Tab - Doctor Only */}
            {hasPermission('all') && (
              <TabsContent value="prescription" className="space-y-4" forceMount>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Prescription</CardTitle>
                    <CardDescription>Create and format prescriptions tied to this visit</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PrescriptionBuilder 
                      patientId={patientId}
                      doctorId={doctorId}
                      visitId={visitId}
                      ensureVisitId={async () => {
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
                        const minimalPayload: any = {
                          patientId,
                          doctorId,
                          visitType: 'consultation',
                          status: 'in-progress',
                          complaints: [{ complaint: 'Consultation' }],
                          diagnosis: [],
                          plan: {},
                          treatmentPlan: {},
                          photos: [],
                          metadata: {
                            capturedBy: userRole,
                            sections: ['prescription'],
                            progress: 10,
                            createdForPrescription: true,
                          }
                        };
                        const newVisit = await apiClient.createVisit(minimalPayload);
                        const newVisitId = (newVisit as VisitDetails).id;
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
                      onChangeContentOffset={(x, y) => { setContentOffsetXPx(x); setContentOffsetYPx(y); }}
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
                      onChangeFrames={(next) => {
                        if (typeof next.enabled === 'boolean') setFramesEnabled(next.enabled);
                        if (typeof next.headerHeightMm === 'number') setHeaderHeightMm(next.headerHeightMm);
                        if (typeof next.footerHeightMm === 'number') setFooterHeightMm(next.footerHeightMm);
                      }}
                      onChangeReviewDate={setReviewDate}
                      onCreated={() => markSectionComplete('prescription')}
                      refreshKey={builderRefreshKey}
                      includeSections={rxIncludeSections}
                      onChangeIncludeSections={setRxIncludeSections}
                    />
                  </CardContent>
                </Card>
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
                        <label className="text-sm text-gray-700">Print Background Image URL (optional)</label>
                        <Input placeholder="https://.../letterhead.png" value={printBgUrl} onChange={(e) => setPrintBgUrl(e.target.value)} />
                        <div className="flex items-center gap-2 text-sm">
                          <input
                            type="file"
                            accept="image/*"
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
                          <Button type="button" variant="outline" onClick={() => setPrintBgUrl('')}>Clear</Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-gray-700">Top Margin (px)</label>
                        <Input type="number" min={0} value={printTopMarginPx} onChange={(e) => setPrintTopMarginPx(Number(e.target.value) || 0)} />
                        <label className="text-sm text-gray-700">Bottom Margin (px)</label>
                        <Input type="number" min={0} value={printBottomMarginPx} onChange={(e) => setPrintBottomMarginPx(Number(e.target.value) || 0)} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-gray-700">Left Margin (px)</label>
                        <Input type="number" min={0} value={printLeftMarginPx} onChange={(e) => setPrintLeftMarginPx(Number(e.target.value) || 0)} />
                        <label className="text-sm text-gray-700">Right Margin (px)</label>
                        <Input type="number" min={0} value={printRightMarginPx} onChange={(e) => setPrintRightMarginPx(Number(e.target.value) || 0)} />
                      </div>
                      <div className="md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                        <div>
                          <label className="text-sm text-gray-700">Content X Offset (px)</label>
                          <Input type="number" value={contentOffsetXPx} onChange={(e) => setContentOffsetXPx(Number(e.target.value) || 0)} />
                        </div>
                        <div>
                          <label className="text-sm text-gray-700">Content Y Offset (px)</label>
                          <Input type="number" value={contentOffsetYPx} onChange={(e) => setContentOffsetYPx(Number(e.target.value) || 0)} />
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" onClick={() => setContentOffsetYPx((v) => v - 1)}>↑</Button>
                          <Button type="button" variant="outline" onClick={() => setContentOffsetYPx((v) => v + 1)}>↓</Button>
                          <Button type="button" variant="outline" onClick={() => setContentOffsetXPx((v) => v - 1)}>←</Button>
                          <Button type="button" variant="outline" onClick={() => setContentOffsetXPx((v) => v + 1)}>→</Button>
                        </div>
                        <div>
                          <Button type="button" variant="secondary" onClick={() => { setContentOffsetXPx(0); setContentOffsetYPx(0); }}>Reset Offsets</Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:col-span-3">
                        <div>
                          <label className="text-sm text-gray-700">Paper Preset</label>
                          <select className="border rounded px-2 py-1 w-full" value={paperPreset} onChange={(e) => setPaperPreset(e.target.value === 'LETTER' ? 'LETTER' : 'A4')}>
                            <option value="A4">A4 (210x297mm)</option>
                            <option value="LETTER">Letter (8.5x11in)</option>
                          </select>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={grayscaleMode} onChange={(e) => setGrayscaleMode(e.target.checked)} /> Grayscale Mode
                        </label>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={showBleedSafe} onChange={(e) => setShowBleedSafe(e.target.checked)} /> Show Safe Margin
                          </label>
                          <Input className="w-28" type="number" min={0} value={safeMarginMm} onChange={(e) => setSafeMarginMm(Number(e.target.value) || 0)} />
                          <span className="text-sm text-gray-600">mm</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:col-span-3">
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={framesEnabled} onChange={(e) => setFramesEnabled(e.target.checked)} /> Enable Header/Footer Frames
                          </label>
                        </div>
                        <div>
                          <label className="text-sm text-gray-700">Header Height (mm)</label>
                          <Input type="number" min={0} value={headerHeightMm} onChange={(e) => setHeaderHeightMm(Number(e.target.value) || 0)} disabled={!framesEnabled} />
                        </div>
                        <div>
                          <label className="text-sm text-gray-700">Footer Height (mm)</label>
                          <Input type="number" min={0} value={footerHeightMm} onChange={(e) => setFooterHeightMm(Number(e.target.value) || 0)} disabled={!framesEnabled} />
                        </div>
                        <div className="md:col-span-3">
                          <Button type="button" variant="outline" onClick={() => { setHeaderHeightMm(20); setFooterHeightMm(20); }}>Reset Frames</Button>
                        </div>
                      </div>
                      <div className="md:col-span-3 border-t pt-3 mt-2">
                        <div className="flex items-center gap-3 mb-2">
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
                            <label className="text-sm text-gray-700">Grid Size (px)</label>
                            <Input type="number" min={2} value={designGridSizePx} onChange={(e) => setDesignGridSizePx(Number(e.target.value) || 8)} disabled={!designAidsEnabled} />
                          </div>
                          <div>
                            <label className="text-sm text-gray-700">Nudge Step (px)</label>
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
                    <label className="text-sm text-gray-700">Print Sections</label>
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
                <Button variant="outline" onClick={loadPatientHistory} disabled={loadingHistory}>
                  {loadingHistory ? 'Loading...' : 'Refresh'}
                </Button>
              </div>

              {loadingHistory ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
                  <p>Loading patient history...</p>
                </div>
              ) : patientHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No previous visits found</p>
                  <p className="text-sm">This will be the patient's first visit</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Timeline */}
                  <div className="relative">
                    {patientHistory.map((visit, index) => (
                      <div key={visit.id} className="relative flex items-start space-x-3 pb-4">
                        {/* Timeline line */}
                        {index !== patientHistory.length - 1 && (
                          <div className="absolute left-4 top-8 w-0.5 h-full bg-gray-200" />
                        )}
                        
                        {/* Timeline dot */}
                        <div className={`relative flex items-center justify-center w-8 h-8 rounded-full ${
                          visit.status === 'completed' ? 'bg-green-100 text-green-600' : 
                          visit.status === 'in-progress' ? 'bg-blue-100 text-blue-600' : 
                          'bg-gray-100 text-gray-600'
                        }`}>
                          <div className="w-3 h-3 rounded-full bg-current" />
                        </div>

                        {/* Visit details */}
                        <div className="flex-1 min-w-0">
                          <Card>
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <h4 className="text-sm font-semibold">
                                    Visit #{patientHistory.length - index}
                                  </h4>
                                  <p className="text-xs text-gray-500">
                                    {new Date(visit.createdAt || (visit as any).date || Date.now()).toLocaleDateString('en-US', {
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {(() => {
                                    const normalizedStatus = typeof visit.status === 'string'
                                      ? visit.status.toLowerCase()
                                      : 'unknown';
                                    const badgeVariant = normalizedStatus === 'completed'
                                      ? 'default'
                                      : normalizedStatus === 'in-progress'
                                      ? 'secondary'
                                      : 'outline';
                                    const statusLabel = typeof visit.status === 'string'
                                      ? visit.status.replace(/-/g, ' ').toUpperCase()
                                      : 'UNKNOWN';
                                    return (
                                      <Badge variant={badgeVariant}>
                                        {statusLabel}
                                      </Badge>
                                    );
                                  })()}
                                  {/* photos may be absent in VisitSummary; show if present */}
                                  {typeof (visit as any).photos !== 'undefined' && Number((visit as any).photos || 0) > 0 && (
                                    <Badge variant="outline" className="text-xs">
                                      {Number((visit as any).photos)} Photos
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              
                              <div className="space-y-2">
                                <div className="flex items-center text-sm">
                                  <User className="h-4 w-4 mr-2 text-gray-400" />
                                  <span className="text-gray-600">Dr. {(visit as any)?.doctor?.firstName || ''} {(visit as any)?.doctor?.lastName || ''}</span>
                                </div>
                                
                                <div className="flex items-center text-sm">
                                  <FileText className="h-4 w-4 mr-2 text-gray-400" />
                                  <span className="text-gray-600">{visit.visitType}</span>
                                </div>
                                
                                {Array.isArray(visit.diagnosis) && visit.diagnosis.length > 0 && (
                                  <div className="flex items-start text-sm">
                                    <Stethoscope className="h-4 w-4 mr-2 text-gray-400 mt-0.5" />
                                    <div className="flex-1">
                                      <span className="text-gray-600">Diagnosis:</span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {(visit.diagnosis as unknown[]).map((dx: unknown, i: number) => {
                                          const label = typeof dx === 'string' ? dx : (dx && typeof dx === 'object' && 'diagnosis' in (dx as any)) ? String((dx as any).diagnosis) : '';
                                          if (!label) return null;
                                          return (
                                            <Badge key={i} variant="outline" className="text-xs">
                                              {label}
                                            </Badge>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </TabsContent>
          </Tabs>

          {/* Action Buttons */}
          <div className="flex justify-between items-center pt-6 border-t">
            <div className="text-sm text-gray-500">
              Progress: {getProgress()}% • {completedSections.size} of {hasPermission('all') ? 5 : 3} sections complete
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void save(false)} disabled={saving}>
                {saving ? 'Saving...' : 'Save Draft'}
              </Button>
              {hasPermission('all') && (
                <Button onClick={() => void save(true)} disabled={saving || getProgress() < 80}>
                  {saving ? 'Completing...' : 'Complete Visit'}
                </Button>
              )}
            </div>
        </div>
      </CardContent>
    </Card>
    </div>
  </div>
  );
} 