'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { sortDrugsByRelevance, calculateDrugRelevanceScore, getErrorMessage } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

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
  onChangeReviewDate?: (v: string) => void;
  refreshKey?: number;
  standalone?: boolean;
  standaloneReason?: string;
}

// Hoisted, memoized collapsible section to prevent remounting on parent re-render
const CollapsibleSection = React.memo(function CollapsibleSection({
  title,
  section,
  children,
  badge,
  highlight = false,
  expanded,
  onToggle,
}: {
  title: string;
  section: string;
  children: React.ReactNode;
  badge?: string;
  highlight?: boolean;
  expanded: boolean;
  onToggle: (s: string) => void;
}) {
  const headingId = `section-${section}-heading`;
  const contentId = `section-${section}-content`;
  return (
    <Card className={highlight ? 'bg-green-50 border-green-300' : ''}>
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex items-center justify-between w-full cursor-pointer"
          onClick={() => onToggle(section)}
          aria-expanded={expanded}
          aria-controls={contentId}
          aria-labelledby={headingId}
        >
          <div className="flex items-center gap-2">
            <CardTitle id={headingId} className="text-base">{title}</CardTitle>
            {badge && <Badge variant="outline" className="text-xs">{badge}</Badge>}
            {highlight && <div className="text-[10px] text-green-700">Auto-included in preview</div>}
          </div>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </CardHeader>
      <CardContent id={contentId} className={`pt-0 ${expanded ? '' : 'hidden'}`}>
        {children}
      </CardContent>
    </Card>
  );
});

function PrescriptionBuilder({ patientId, visitId, doctorId, userRole = 'DOCTOR', onCreated, reviewDate, printBgUrl, printTopMarginPx, onChangeReviewDate, refreshKey, standalone = false, standaloneReason }: Props) {
  const { toast } = useToast();
  const [language, setLanguage] = useState<Language>('EN');
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpInstructions, setFollowUpInstructions] = useState('');

  const [items, setItems] = useState<PrescriptionItemForm[]>([]);
  const [customSections, setCustomSections] = useState<Array<{ id: string; title: string; content: string }>>([]);
  const [procedureMetrics, setProcedureMetrics] = useState<{ device?: string; wavelengthNm?: number | ''; fluenceJcm2?: number | ''; spotSizeMm?: number | ''; pulseMs?: number | ''; shots?: number | ''; cooling?: string; area?: string; peelAgent?: string; peelConcentration?: string; peelContactTimeMin?: number | ''; frosting?: string; needleDepthMm?: string; passes?: number | ''; anesthetic?: string }>({});

  // Additional clinical fields per requirements
  const [chiefComplaints, setChiefComplaints] = useState<string>('');
  const [pastHistory, setPastHistory] = useState<string>('');
  const [medicationHistory, setMedicationHistory] = useState<string>('');
  const [menstrualHistory, setMenstrualHistory] = useState<string>('');
  const [familyHistoryDM, setFamilyHistoryDM] = useState<boolean>(false);
  const [familyHistoryHTN, setFamilyHistoryHTN] = useState<boolean>(false);
  const [familyHistoryThyroid, setFamilyHistoryThyroid] = useState<boolean>(false);
  const [familyHistoryOthers, setFamilyHistoryOthers] = useState<string>('');
  // Topicals
  const [topicalFacewash, setTopicalFacewash] = useState<{ frequency?: string; timing?: string; duration?: string; instructions?: string }>({});
  const [topicalMoisturiserSunscreen, setTopicalMoisturiserSunscreen] = useState<{ frequency?: string; timing?: string; duration?: string; instructions?: string }>({});
  const [topicalActives, setTopicalActives] = useState<{ frequency?: string; timing?: string; duration?: string; instructions?: string }>({});
  const [postProcedureCare, setPostProcedureCare] = useState<string>('');
  const investigationOptions: string[] = [
    'CBC', 'ESR', 'CRP', 'LFT', 'Fasting lipid profile', 'RFT', 'Creatinine', 'FBS', 'Fasting Insulin', 'HbA1c', 'RBS', 'CUE', 'Stool examination', 'Total Testosterone', 'S. Prolactin', 'Vitamin B12', 'Vitamin D', 'Ferritin', 'TSH', 'Thyroid profile', 'HIV-I,II', 'HbS Ag', 'Anti HCV', 'VDRL', 'RPR', 'TPHA', 'TB Gold Quantiferon Test', 'Montoux Test', 'Chest Xray PA view', '2D Echo', 'Skin Biopsy'
  ];
  const [investigations, setInvestigations] = useState<string[]>([]);
  const [procedurePlanned, setProcedurePlanned] = useState<string>('');
  const [procedureParams, setProcedureParams] = useState<{ passes?: string; power?: string; machineUsed?: string; others?: string }>({});
  // Vitals (with BMI)
  const [vitalsHeightCm, setVitalsHeightCm] = useState<number | ''>('');
  const [vitalsWeightKg, setVitalsWeightKg] = useState<number | ''>('');
  const [vitalsBmi, setVitalsBmi] = useState<number | ''>('');
  const [vitalsBpSys, setVitalsBpSys] = useState<number | ''>('');
  const [vitalsBpDia, setVitalsBpDia] = useState<number | ''>('');
  const [vitalsPulse, setVitalsPulse] = useState<number | ''>('');
  // Restore drug search states
  const [drugQuery, setDrugQuery] = useState('');
  const [drugResults, setDrugResults] = useState<any[]>([]);
  const [loadingDrugs, setLoadingDrugs] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  // Default dermatology templates (client-side suggestions)
  const defaultDermTemplates: Array<any> = [
    {
      id: 'derm-acne-mild',
      name: 'Acne (Mild) — Topical regimen',
      description: 'Adapalene night + BPO morning + gentle facewash + sunscreen',
      items: [
        { drugName: 'Adapalene 0.1% Gel', dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 12, durationUnit: 'WEEKS', timing: 'Bedtime', route: 'Topical', instructions: 'Apply a pea-sized amount to entire face at night' },
        { drugName: 'Benzoyl Peroxide 2.5% Gel', dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 12, durationUnit: 'WEEKS', timing: 'Morning', route: 'Topical', instructions: 'Apply thin layer to affected areas in the morning' },
      ],
      metadata: {
        chiefComplaints: 'Acne lesions on face',
        histories: {},
        topicals: {
          facewash: { frequency: '2×/day', timing: 'AM/PM', duration: 'ongoing', instructions: 'Gentle, non-comedogenic' },
          moisturiserSunscreen: { frequency: '2×/day', timing: 'AM/PM', duration: 'ongoing', instructions: 'Non-comedogenic, SPF 30+' },
          actives: { frequency: 'as advised', timing: 'night', duration: '12 weeks', instructions: 'Introduce slowly, moisturize' },
        },
        procedurePlanned: '',
        procedureParams: {},
        postProcedureCare: '',
        investigations: [],
      },
    },
    {
      id: 'derm-fungal-tinea',
      name: 'Tinea (Fungal) — Topical + Hygiene',
      description: 'Clotrimazole cream + hygiene advice',
      items: [
        { drugName: 'Clotrimazole 1% Cream', dosage: 1, dosageUnit: 'TABLET', frequency: 'TWICE_DAILY', duration: 4, durationUnit: 'WEEKS', route: 'Topical', instructions: 'Apply to affected area and 2 cm beyond' },
      ],
      metadata: {
        chiefComplaints: 'Itchy annular rash in folds',
        histories: {},
        notes: 'Keep area dry; separate towels/clothes; iron clothes; avoid steroids',
        topicals: {
          facewash: {},
          moisturiserSunscreen: {},
          actives: {},
        },
        postProcedureCare: '',
        investigations: [],
      },
    },
    {
      id: 'derm-eczema-care',
      name: 'Eczema — Emollients + Low-potency steroid',
      description: 'Hydrocortisone short course + moisturizers',
      items: [
        { drugName: 'Hydrocortisone 1% Cream', dosage: 1, dosageUnit: 'TABLET', frequency: 'TWICE_DAILY', duration: 14, durationUnit: 'DAYS', route: 'Topical', instructions: 'Thin layer to affected areas for 1-2 weeks then taper' },
      ],
      metadata: {
        chiefComplaints: 'Itchy scaly patches',
        histories: {},
        notes: 'Liberal emollients; avoid hot water; fragrance-free products',
        topicals: {
          facewash: { frequency: 'as needed', timing: '—', duration: 'ongoing', instructions: 'Syndet gentle cleanser' },
          moisturiserSunscreen: { frequency: '3-4×/day', timing: '—', duration: 'ongoing', instructions: 'Thick bland emollient' },
          actives: {},
        },
        investigations: ['CBC', 'ESR', 'CRP'],
      },
    },
  ];
  // Autocomplete state for clinical fields
  const [diagOptions, setDiagOptions] = useState<string[]>([]);
  const [complaintOptions, setComplaintOptions] = useState<string[]>([]);
  const [notesOptions, setNotesOptions] = useState<string[]>([]);
  const [loadingVisit, setLoadingVisit] = useState(false);
  const [visitData, setVisitData] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [translatingPreview, setTranslatingPreview] = useState(false);
  const [translationsMap, setTranslationsMap] = useState<Record<string, string>>({});
  const [orderOpen, setOrderOpen] = useState(false);
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
    clinical: false,
    histories: false,
    topicals: false,
    procedures: false,
    investigations: false,
    templates: false,
    sections: false,
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

  const [includeSections, setIncludeSections] = useState<Record<string, boolean>>({
    patientInfo: true,
    diagnosis: true,
    medications: true,
    procedures: true,
    counseling: true,
    vitals: true,
    followUp: true,
    notes: true,
    doctorSignature: true,
    chiefComplaints: true,
    histories: true,
    familyHistory: true,
    topicals: true,
    postProcedure: true,
    investigations: true,
    procedurePlanned: true,
    procedureParameters: true,
  });

  const tt = useCallback((key: string, fallback?: string) => {
    if (language === 'EN') return fallback ?? '';
    return translationsMap[key] ?? (fallback ?? '');
  }, [language, translationsMap]);

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
    pushIf('postProcedureCare', postProcedureCare);
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
      setTranslationsMap({});
      return;
    }
    try {
      const target = (language === 'HI' ? 'HI' : 'TE') as 'HI' | 'TE';
      const { translations } = await apiClient.translateTexts(target, plan.map(p => p.text));
      const map: Record<string, string> = {};
      plan.forEach((p, idx) => {
        map[p.key] = translations[idx] ?? p.text;
      });
      setTranslationsMap(map);
    } catch (e) {
      // Fallback to original content on any error
      const map: Record<string, string> = {};
      plan.forEach((p) => { map[p.key] = p.text; });
      setTranslationsMap(map);
    }
  }, [language, diagnosis, chiefComplaints, pastHistory, medicationHistory, menstrualHistory, familyHistoryOthers, postProcedureCare, procedurePlanned, investigations, customSections, items]);

  // Derived flags to show inline UI feedback for auto-included sections
  const hasChiefComplaints = useMemo(() => Boolean(chiefComplaints?.trim()?.length), [chiefComplaints]);
  const hasHistories = useMemo(() => Boolean(
    pastHistory?.trim()?.length || medicationHistory?.trim()?.length || menstrualHistory?.trim()?.length
  ), [pastHistory, medicationHistory, menstrualHistory]);
  
  const hasFamilyHistory = useMemo(() => Boolean(
    familyHistoryDM || familyHistoryHTN || familyHistoryThyroid || familyHistoryOthers?.trim()?.length
  ), [familyHistoryDM, familyHistoryHTN, familyHistoryThyroid, familyHistoryOthers]);
  
  const hasTopicals = useMemo(() => Boolean(
    topicalFacewash.frequency || topicalFacewash.timing || topicalFacewash.duration || topicalFacewash.instructions ||
    topicalMoisturiserSunscreen.frequency || topicalMoisturiserSunscreen.timing || topicalMoisturiserSunscreen.duration || topicalMoisturiserSunscreen.instructions ||
    topicalActives.frequency || topicalActives.timing || topicalActives.duration || topicalActives.instructions
  ), [topicalFacewash, topicalMoisturiserSunscreen, topicalActives]);
  
  const hasPostProcedure = useMemo(() => Boolean(postProcedureCare?.trim()?.length), [postProcedureCare]);
  const hasInvestigations = useMemo(() => Array.isArray(investigations) && investigations.length > 0, [investigations]);
  const hasProcedurePlanned = useMemo(() => Boolean(procedurePlanned?.trim()?.length), [procedurePlanned]);
  
  const hasProcedureParams = useMemo(() => Boolean(
    procedureParams.passes || procedureParams.power || procedureParams.machineUsed || procedureParams.others
  ), [procedureParams]);

  const canCreate = useMemo(() => Boolean(patientId && doctorId && items.length > 0 && (visitId || standalone)), [patientId, visitId, doctorId, items.length, standalone]);

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
          const counseling = plan?.dermatology?.counseling;
          if (!notes && counseling) setNotes(String(counseling));
        } catch {}
        // Enable sections based on visit content
        setIncludeSections((prev) => ({
          ...prev,
          diagnosis: Boolean(res?.diagnosis),
          counseling: Boolean(res?.plan),
          vitals: Boolean(res?.vitals),
        }));
      } catch (e) {
        setVisitData(null);
      } finally {
        setLoadingVisit(false);
      }
    };
    void loadVisit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId, refreshKey, standalone]);

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
        setDiagOptions(Array.isArray(res) ? (res as string[]) : []);
      } catch {
        setDiagOptions([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [diagnosis, patientId, visitId]);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        if (!patientId) return;
        const res = await apiClient.autocompletePrescriptionField({ field: 'chiefComplaints', patientId, visitId: visitId || undefined, q: chiefComplaints, limit: 8 });
        setComplaintOptions(Array.isArray(res) ? (res as string[]) : []);
      } catch {
        setComplaintOptions([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [chiefComplaints, patientId, visitId]);

  const [isComposingNotes, setIsComposingNotes] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (isComposingNotes) return;
    const q = (notes || '').trim();
    if (q.length < 2) {
      setNotesOptions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        if (!patientId) return;
        const res = await apiClient.autocompletePrescriptionField({ field: 'notes', patientId, visitId: visitId || undefined, q, limit: 8 });
        setNotesOptions(Array.isArray(res) ? (res as string[]) : []);
      } catch {
        setNotesOptions([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [notes, patientId, visitId, isComposingNotes]);

  // Debounced drug search with relevance-based sorting
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = (drugQuery || '').trim();
      if (q.length < 2) {
        setDrugResults([]);
        return;
      }
      try {
        setLoadingDrugs(true);
        const res: any = await apiClient.get('/drugs', { search: q, limit: 30, isActive: true }); // Increased limit for better sorting
        const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
        // Apply relevance-based sorting and take top 10 results
        const sortedResults = sortDrugsByRelevance(list, q);
        setDrugResults(sortedResults.slice(0, 10));
      } catch (e) {
        setDrugResults([]);
      } finally {
        setLoadingDrugs(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [drugQuery]);

  const searchDrugs = (q: string) => {
    setDrugQuery(q);
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

  // Get relevance badge for search results
  const getRelevanceBadge = (drug: any, query: string, index: number) => {
    if (index === 0) return <Badge variant="default" className="text-xs ml-2 bg-green-100 text-green-800">Best Match</Badge>;
    if (index < 3) return <Badge variant="secondary" className="text-xs ml-2 bg-blue-100 text-blue-800">High Match</Badge>;
    return null;
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
  };

  const updateItem = (index: number, patch: Partial<PrescriptionItemForm>) => {
    setItems(prev => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
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
    return items.reduce((sum, it) => sum + (Number(it.quantity || 0) || 0), 0);
  }, [items]);

  const create = useCallback(async () => {
    if (!canCreate) return;
    try {
      const payload = {
        patientId,
        visitId: standalone ? undefined : visitId,
        doctorId,
        items: items.map(it => ({
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
          notes: it.notes || undefined,
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
        notes: notes || undefined,
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
          },
          familyHistory: {
            dm: familyHistoryDM || undefined,
            htn: familyHistoryHTN || undefined,
            thyroid: familyHistoryThyroid || undefined,
            others: familyHistoryOthers || undefined,
          },
          topicals: {
            facewash: topicalFacewash,
            moisturiserSunscreen: topicalMoisturiserSunscreen,
            actives: topicalActives,
          },
          postProcedureCare: postProcedureCare || undefined,
          investigations: investigations && investigations.length ? investigations : undefined,
          procedurePlanned: procedurePlanned || undefined,
          procedureParams: procedureParams,
        },
      };
      const res: any = standalone
        ? await apiClient.createQuickPrescription({ ...payload, reason: standaloneReason })
        : await apiClient.createPrescription(payload);
      onCreated?.(res?.id);

      if (!standalone) {
        setConfirmPharmacy({
          open: true,
          prescriptionId: res?.id || '',
          summary: {
            medicationsCount: items.length,
          },
        });
      }

      toast({
        variant: 'success',
        title: 'Prescription created',
        description: `${items.length} medications recorded for the patient.`,
      });

      // Reset form
      setItems([]);
      setDiagnosis('');
      setNotes('');
      setFollowUpInstructions('');
    } catch (e: any) {
      const msg = getErrorMessage(e) || 'Failed to create prescription';
      toast({
        variant: 'destructive',
        title: 'Unable to create prescription',
        description: msg,
      });
    }
  }, [canCreate, patientId, visitId, doctorId, items, diagnosis, notes, language, reviewDate, followUpInstructions, procedureMetrics, chiefComplaints, pastHistory, medicationHistory, menstrualHistory, familyHistoryDM, familyHistoryHTN, familyHistoryThyroid, familyHistoryOthers, topicalFacewash, topicalMoisturiserSunscreen, topicalActives, postProcedureCare, investigations, procedurePlanned, procedureParams, onCreated]);

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

      const md = typeof tpl.metadata === 'object' ? tpl.metadata : (tpl.metadata ? JSON.parse(tpl.metadata) : null);
      if (md) {
        if (md.chiefComplaints) setChiefComplaints(md.chiefComplaints);
        if (md.histories) {
          if (md.histories.pastHistory) setPastHistory(md.histories.pastHistory);
          if (md.histories.medicationHistory) setMedicationHistory(md.histories.medicationHistory);
          if (md.histories.menstrualHistory) setMenstrualHistory(md.histories.menstrualHistory);
        }
        if (md.familyHistory) {
          if (typeof md.familyHistory.dm === 'boolean') setFamilyHistoryDM(md.familyHistory.dm);
          if (typeof md.familyHistory.htn === 'boolean') setFamilyHistoryHTN(md.familyHistory.htn);
          if (typeof md.familyHistory.thyroid === 'boolean') setFamilyHistoryThyroid(md.familyHistory.thyroid);
          if (md.familyHistory.others) setFamilyHistoryOthers(md.familyHistory.others);
        }
        if (md.topicals) {
          if (md.topicals.facewash) setTopicalFacewash(md.topicals.facewash);
          if (md.topicals.moisturiserSunscreen) setTopicalMoisturiserSunscreen(md.topicals.moisturiserSunscreen);
          if (md.topicals.actives) setTopicalActives(md.topicals.actives);
        }
        if (md.postProcedureCare) setPostProcedureCare(md.postProcedureCare);
        if (md.investigations) {
          if (Array.isArray(md.investigations)) setInvestigations(md.investigations as string[]);
          else if (typeof md.investigations === 'string') setInvestigations((md.investigations as string).split(',').map(s => s.trim()).filter(Boolean));
        }
        if (md.procedurePlanned) setProcedurePlanned(md.procedurePlanned);
        if (md.procedureParams) setProcedureParams(md.procedureParams);
        if (md.notes) setNotes((prev) => prev || md.notes);
      }
    } catch {}
  };

  const [templatePromptOpen, setTemplatePromptOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const persistTemplate = useCallback(async (name: string) => {
    try {
      const payload = {
        name,
        description: '',
        items: items.map(it => ({
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
          applicationSite: it.applicationSite,
          applicationAmount: it.applicationAmount,
          dayPart: it.dayPart,
          leaveOn: it.leaveOn,
          washOffAfterMinutes: it.washOffAfterMinutes !== '' ? Number(it.washOffAfterMinutes) : undefined,
          taperSchedule: it.taperSchedule,
          weightMgPerKgPerDay: it.weightMgPerKgPerDay !== '' ? Number(it.weightMgPerKgPerDay) : undefined,
          calculatedDailyDoseMg: it.calculatedDailyDoseMg !== '' ? Number(it.calculatedDailyDoseMg) : undefined,
          pregnancyWarning: it.pregnancyWarning,
          photosensitivityWarning: it.photosensitivityWarning,
          foodInstructions: it.foodInstructions,
          pulseRegimen: it.pulseRegimen,
        })),
        category: 'Dermatology',
        specialty: 'Dermatology',
        isPublic: true,
        metadata: {
          chiefComplaints,
          histories: { pastHistory, medicationHistory, menstrualHistory },
          familyHistory: { dm: familyHistoryDM, htn: familyHistoryHTN, thyroid: familyHistoryThyroid, others: familyHistoryOthers },
          topicals: { facewash: topicalFacewash, moisturiserSunscreen: topicalMoisturiserSunscreen, actives: topicalActives },
          postProcedureCare,
          investigations,
          procedurePlanned,
          procedureParams,
          notes,
        },
      } as any;
      await apiClient.createPrescriptionTemplate(payload);
      await loadTemplates();
      toast({
        variant: 'success',
        title: 'Template saved',
        description: 'Prescription template stored for future visits.',
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to save template',
        description: getErrorMessage(e) || 'Please try again later.',
      });
      throw e;
    }
  }, [
    apiClient,
    items,
    chiefComplaints,
    pastHistory,
    medicationHistory,
    menstrualHistory,
    familyHistoryDM,
    familyHistoryHTN,
    familyHistoryThyroid,
    familyHistoryOthers,
    topicalFacewash,
    topicalMoisturiserSunscreen,
    topicalActives,
    postProcedureCare,
    investigations,
    procedurePlanned,
    procedureParams,
    notes,
    loadTemplates,
    toast,
  ]);

  useEffect(() => {
    if (!orderOpen) return;
    // Initialize mapping state from current items when dialog opens
    const next = items.map((it) => ({ q: it.drugName || '', loading: false, results: [], selection: undefined, qty: Number(it.quantity || 1) || 1 }));
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

  return (
    <div className="space-y-6">
      {!standalone && items.length > 0 && (
        <div className="sticky top-0 z-10 bg-white border-b py-2 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const url = `/dashboard/pharmacy?patientId=${encodeURIComponent(patientId)}${visitId ? `&visitId=${encodeURIComponent(visitId)}` : ''}`;
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
            {/* Basic Information */}
            <CollapsibleSection title="Basic Information" section="basic" expanded={expandedSections.basic} onToggle={toggleSection}>
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm text-gray-700">Diagnosis (optional)</label>
                    <div className="relative">
                      <Input key="diagnosis" placeholder="e.g., Acne vulgaris" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
                      {diagOptions.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow-sm max-h-48 overflow-auto">
                          {diagOptions.map((opt) => (
                            <div key={opt} className="px-3 py-1 text-sm hover:bg-gray-50 cursor-pointer" onClick={() => setDiagnosis(opt)}>
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-700">Follow-up Instructions</label>
                    <Input key="followup-instructions" placeholder="e.g., Review in 4 weeks" value={followUpInstructions} onChange={(e) => setFollowUpInstructions(e.target.value)} />
                  </div>
                  <div></div>
                </div>

                <div>
                  <label className="text-sm text-gray-700">Doctor's Personal Notes</label>
                  <div className="relative">
                    <Textarea
                      key="doctor-notes"
                      rows={3}
                      placeholder="Instructions, cautions, lifestyle advice..."
                      value={notes}
                      ref={notesRef}
                      onCompositionStart={() => setIsComposingNotes(true)}
                      onCompositionEnd={() => setIsComposingNotes(false)}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    {notesOptions.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow-sm max-h-48 overflow-auto" role="listbox" onMouseDown={(e) => e.preventDefault()}>
                        {notesOptions.map((opt) => (
                          <div key={opt} className="px-3 py-1 text-sm hover:bg-gray-50 cursor-pointer" role="option" onClick={() => setNotes(opt)}>
                             {opt}
                           </div>
                         ))}
                       </div>
                     )}
                   </div>
                </div>
              </div>
            </CollapsibleSection>

            {/* Clinical Details */}
            <CollapsibleSection title="Clinical Details & Vitals" section="clinical" expanded={expandedSections.clinical} onToggle={toggleSection}>
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

                {/* Chief Complaints */}
                <div className="opacity-100">
                  <label className="text-xs text-gray-600">Chief Complaints</label>
                  <div className="relative">
                    <Textarea key="chief-complaints" rows={2} value={chiefComplaints} onChange={(e) => setChiefComplaints(e.target.value)} />
                    {complaintOptions.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow-sm max-h-40 overflow-auto">
                        {complaintOptions.map((opt) => (
                          <div key={opt} className="px-3 py-1 text-sm hover:bg-gray-50 cursor-pointer" onClick={() => setChiefComplaints(opt)}>
                            {opt}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            {/* Histories */}
            <CollapsibleSection 
              title="Patient History" 
              section="histories" 
              highlight={hasHistories}
              badge={hasHistories ? "Has Data" : ""}
              expanded={expandedSections.histories}
              onToggle={toggleSection}
            >
              <div className="opacity-100">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-gray-600">Past History</label>
                    <Textarea key="past-history" rows={2} value={pastHistory} onChange={(e) => setPastHistory(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Medication History</label>
                    <Textarea key="medication-history" rows={2} value={medicationHistory} onChange={(e) => setMedicationHistory(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Menstrual History</label>
                    <Textarea key="menstrual-history" rows={2} value={menstrualHistory} onChange={(e) => setMenstrualHistory(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Family History</label>
                    <div className="flex flex-wrap gap-2 text-xs mt-1">
                      <label className="flex items-center gap-1"><input type="checkbox" checked={familyHistoryDM} onChange={(e) => setFamilyHistoryDM(e.target.checked)} /> DM</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={familyHistoryHTN} onChange={(e) => setFamilyHistoryHTN(e.target.checked)} /> HTN</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={familyHistoryThyroid} onChange={(e) => setFamilyHistoryThyroid(e.target.checked)} /> Thyroid</label>
                    </div>
                    <Input key="family-history-others" className="mt-1" placeholder="Others" value={familyHistoryOthers} onChange={(e) => setFamilyHistoryOthers(e.target.value)} />
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            {/* Topicals */}
            <CollapsibleSection 
              title="Topical Care Instructions" 
              section="topicals" 
              highlight={hasTopicals}
              badge={hasTopicals ? "Has Data" : ""}
              expanded={expandedSections.topicals}
              onToggle={toggleSection}
            >
              <div className="opacity-100">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <div className="font-medium text-sm">Facewash/Soap</div>
                    <Input placeholder="Frequency" value={topicalFacewash.frequency || ''} onChange={(e) => setTopicalFacewash({ ...topicalFacewash, frequency: e.target.value })} />
                    <Input placeholder="Timing" value={topicalFacewash.timing || ''} onChange={(e) => setTopicalFacewash({ ...topicalFacewash, timing: e.target.value })} />
                    <Input placeholder="Duration" value={topicalFacewash.duration || ''} onChange={(e) => setTopicalFacewash({ ...topicalFacewash, duration: e.target.value })} />
                    <Input placeholder="Instructions" value={topicalFacewash.instructions || ''} onChange={(e) => setTopicalFacewash({ ...topicalFacewash, instructions: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <div className="font-medium text-sm">Moisturiser & Sunscreen</div>
                    <Input placeholder="Frequency" value={topicalMoisturiserSunscreen.frequency || ''} onChange={(e) => setTopicalMoisturiserSunscreen({ ...topicalMoisturiserSunscreen, frequency: e.target.value })} />
                    <Input placeholder="Timing" value={topicalMoisturiserSunscreen.timing || ''} onChange={(e) => setTopicalMoisturiserSunscreen({ ...topicalMoisturiserSunscreen, timing: e.target.value })} />
                    <Input placeholder="Duration" value={topicalMoisturiserSunscreen.duration || ''} onChange={(e) => setTopicalMoisturiserSunscreen({ ...topicalMoisturiserSunscreen, duration: e.target.value })} />
                    <Input placeholder="Instructions" value={topicalMoisturiserSunscreen.instructions || ''} onChange={(e) => setTopicalMoisturiserSunscreen({ ...topicalMoisturiserSunscreen, instructions: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <div className="font-medium text-sm">Actives</div>
                    <Input placeholder="Frequency" value={topicalActives.frequency || ''} onChange={(e) => setTopicalActives({ ...topicalActives, frequency: e.target.value })} />
                    <Input placeholder="Timing" value={topicalActives.timing || ''} onChange={(e) => setTopicalActives({ ...topicalActives, timing: e.target.value })} />
                    <Input placeholder="Duration" value={topicalActives.duration || ''} onChange={(e) => setTopicalActives({ ...topicalActives, duration: e.target.value })} />
                    <Input placeholder="Instructions" value={topicalActives.instructions || ''} onChange={(e) => setTopicalActives({ ...topicalActives, instructions: e.target.value })} />
                  </div>
                  <div></div>
                </div>
              </div>
            </CollapsibleSection>

            {/* Procedures */}
            <CollapsibleSection 
              title="Procedures & Post-Care" 
              section="procedures" 
              highlight={hasPostProcedure || hasProcedurePlanned || hasProcedureParams}
              badge={(hasPostProcedure || hasProcedurePlanned || hasProcedureParams) ? "Has Data" : ""}
              expanded={expandedSections.procedures}
              onToggle={toggleSection}
            >
              <div className="space-y-3 opacity-100">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600">Post Procedure Care (5-7 days)</label>
                    <Textarea rows={2} value={postProcedureCare} onChange={(e) => setPostProcedureCare(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Procedure Planned</label>
                    <Input value={procedurePlanned} onChange={(e) => setProcedurePlanned(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">Passes</label>
                    <Input value={procedureParams.passes || ''} onChange={(e) => setProcedureParams({ ...procedureParams, passes: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Power</label>
                    <Input value={procedureParams.power || ''} onChange={(e) => setProcedureParams({ ...procedureParams, power: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Machine Used</label>
                    <Input value={procedureParams.machineUsed || ''} onChange={(e) => setProcedureParams({ ...procedureParams, machineUsed: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Others</label>
                    <Input value={procedureParams.others || ''} onChange={(e) => setProcedureParams({ ...procedureParams, others: e.target.value })} />
                  </div>
                  <div></div>
                  <div></div>
                </div>
              </div>
            </CollapsibleSection>

            {/* Investigations */}
            <CollapsibleSection 
              title="Investigations" 
              section="investigations" 
              highlight={hasInvestigations}
              badge={hasInvestigations ? "Has Data" : ""}
              expanded={expandedSections.investigations}
              onToggle={toggleSection}
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

            {/* Section Toggles */}
            <CollapsibleSection title="Print Sections" section="sections" expanded={expandedSections.sections} onToggle={toggleSection}>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-sm">
                {Object.keys(includeSections).map((k) => (
                  <label key={k} className="flex items-center gap-2">
                    <input type="checkbox" checked={includeSections[k]} onChange={(e) => setIncludeSections(prev => ({ ...prev, [k]: e.target.checked }))} />
                    <span className="capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                  </label>
                ))}
              </div>
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
            </CollapsibleSection>

            {/* Templates Panel */}
            <CollapsibleSection title="Templates" section="templates" expanded={expandedSections.templates} onToggle={toggleSection}>
              <div className="space-y-2">
                <div className="flex gap-2 mb-3">
                  <Button variant="outline" size="sm" onClick={() => void loadTemplates()} disabled={loadingTemplates}>
                    {loadingTemplates ? 'Loading…' : 'Refresh'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setTemplatePromptOpen(true)}>Save current</Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(templates || []).slice(0, 6).map((t) => (
                    <div key={`srv-${t.id}`} className="border rounded p-2">
                      <div className="font-medium text-sm">{t.name}</div>
                      {t.description && <div className="text-xs text-gray-600 mb-1">{t.description}</div>}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => applyTemplateToBuilder(t)}>Apply</Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-2 text-xs text-gray-600">Suggested Templates</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {defaultDermTemplates.map((t) => (
                    <div key={t.id} className="border rounded p-2">
                      <div className="font-medium text-sm">{t.name}</div>
                      {t.description && <div className="text-xs text-gray-600 mb-1">{t.description}</div>}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => applyTemplateToBuilder(t)}>Apply</Button>
                        <Button variant="outline" size="sm" onClick={async () => { await apiClient.createPrescriptionTemplate({ name: t.name, description: t.description, items: t.items, category: 'Dermatology', specialty: 'Dermatology', isPublic: true, metadata: t.metadata }); await loadTemplates(); }}>Save</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CollapsibleSection>

            {/* Drug search */}
            <div className="opacity-100">
              <label className="text-sm text-gray-700">Add Drug</label>
              <Input 
                key="drug-search"
                placeholder="Search drug name or brand (min 2 chars)" 
                value={drugQuery}
                onChange={(e) => void searchDrugs(e.target.value)}
              />
              {loadingDrugs && <div className="text-xs text-gray-500 mt-1">Searching…</div>}
              {!loadingDrugs && drugResults.length > 0 && (
                <div className="mt-2 border rounded divide-y max-h-48 overflow-auto">
                  {drugResults.map((d: any, index: number) => (
                    <div 
                      key={`${d.id}-${d.name}`} 
                      className={`px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 ${
                        index === 0 ? 'bg-green-50 border-l-4 border-l-green-500' : 
                        index < 3 ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center">
                          <div className="font-medium">
                            {highlightMatch(d.name, drugQuery)}
                          </div>
                          {getRelevanceBadge(d, drugQuery, index)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {highlightMatch(d.manufacturerName || d.genericName || '', drugQuery)}
                          {d.packSizeLabel ? ` • ${d.packSizeLabel}` : ''}
                        </div>
                        {d.composition1 && (
                          <div className="text-xs text-gray-400 mt-1">
                            {highlightMatch(d.composition1, drugQuery)}
                          </div>
                        )}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => addItemFromDrug(d)}>Add</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Items table */}
            <div className="space-y-3 opacity-100">
              {items.length === 0 && (
                <div className="text-sm text-gray-500">No items added yet</div>
              )}
              {items.map((it, idx) => (
                <Card key={idx}>
                  <CardContent className="p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                    <div className="md:col-span-3">
                      <label className="text-xs text-gray-600">Drug</label>
                      <Input value={it.drugName} onChange={(e) => updateItem(idx, { drugName: e.target.value })} />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-600">Dosage</label>
                      <div className="grid grid-cols-2 gap-1">
                        <Input type="number" value={it.dosage} onChange={(e) => updateItem(idx, { dosage: e.target.value === '' ? '' : Number(e.target.value) })} />
                        <Select value={it.dosageUnit} onValueChange={(v: DosageUnit) => updateItem(idx, { dosageUnit: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['MG','ML','MCG','IU','TABLET','CAPSULE','DROP','SPRAY','PATCH','INJECTION'].map(u => (
                              <SelectItem key={u} value={u as DosageUnit}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-600">Frequency</label>
                      <Select value={it.frequency} onValueChange={(v: Frequency) => updateItem(idx, { frequency: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['ONCE_DAILY','TWICE_DAILY','THREE_TIMES_DAILY','FOUR_TIMES_DAILY','EVERY_4_HOURS','EVERY_6_HOURS','EVERY_8_HOURS','EVERY_12_HOURS','AS_NEEDED','WEEKLY','MONTHLY'].map(f => (
                            <SelectItem key={f} value={f as Frequency}>{f.replaceAll('_',' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-600">Duration</label>
                      <div className="grid grid-cols-2 gap-1">
                        <Input type="number" value={it.duration} onChange={(e) => updateItem(idx, { duration: e.target.value === '' ? '' : Number(e.target.value) })} />
                        <Select value={it.durationUnit} onValueChange={(v: DurationUnit) => updateItem(idx, { durationUnit: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['DAYS','WEEKS','MONTHS','YEARS'].map(u => (
                              <SelectItem key={u} value={u as DurationUnit}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-600">Qty</label>
                      <Input type="number" value={it.quantity ?? ''} onChange={(e) => updateItem(idx, { quantity: e.target.value === '' ? '' : Number(e.target.value) })} />
                    </div>
                    <div className="md:col-span-10">
                      <label className="text-xs text-gray-600">Instructions</label>
                      <Input value={it.instructions || ''} onChange={(e) => updateItem(idx, { instructions: e.target.value })} placeholder="e.g., After meals, avoid alcohol" />
                    </div>
                    {/* Dermatology-specific fields */}
                    <div className="md:col-span-3">
                      <label className="text-xs text-gray-600">Application Site</label>
                      <Input value={it.applicationSite || ''} onChange={(e) => updateItem(idx, { applicationSite: e.target.value })} placeholder="Face / Scalp / Folds" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-600">Amount</label>
                      <Input value={it.applicationAmount || ''} onChange={(e) => updateItem(idx, { applicationAmount: e.target.value })} placeholder="e.g., 1 FTU" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-600">Day Part</label>
                      <Input value={it.dayPart || ''} onChange={(e) => updateItem(idx, { dayPart: e.target.value })} placeholder="AM/PM/QHS" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-600">Leave-on</label>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={!!it.leaveOn} onChange={(e) => updateItem(idx, { leaveOn: e.target.checked })} />
                        <span className="text-xs text-gray-600">If unchecked, set wash-off time</span>
                      </div>
                    </div>
                    <div className="md:col-span-3">
                      <label className="text-xs text-gray-600">Wash-off After (min)</label>
                      <Input type="number" value={it.washOffAfterMinutes ?? ''} onChange={(e) => updateItem(idx, { washOffAfterMinutes: e.target.value === '' ? '' : Number(e.target.value) })} />
                    </div>
                    <div className="md:col-span-6">
                      <label className="text-xs text-gray-600">Taper Schedule (Steroids)</label>
                      <Input value={it.taperSchedule || ''} onChange={(e) => updateItem(idx, { taperSchedule: e.target.value })} placeholder="e.g., OD×7d → Alt days×7d" />
                    </div>
                    <div className="md:col-span-3">
                      <label className="text-xs text-gray-600">Isotretinoin mg/kg/day</label>
                      <Input type="number" value={it.weightMgPerKgPerDay ?? ''} onChange={(e) => updateItem(idx, { weightMgPerKgPerDay: e.target.value === '' ? '' : Number(e.target.value) })} />
                    </div>
                    <div className="md:col-span-3">
                      <label className="text-xs text-gray-600">Calculated Daily Dose (mg)</label>
                      <Input type="number" value={it.calculatedDailyDoseMg ?? ''} onChange={(e) => updateItem(idx, { calculatedDailyDoseMg: e.target.value === '' ? '' : Number(e.target.value) })} />
                    </div>
                    <div className="md:col-span-3">
                      <label className="text-xs text-gray-600">Pregnancy Warning</label>
                      <div className="flex items-center gap-2"><input type="checkbox" checked={!!it.pregnancyWarning} onChange={(e) => updateItem(idx, { pregnancyWarning: e.target.checked })} /><span className="text-xs">Show warning</span></div>
                    </div>
                    <div className="md:col-span-3">
                      <label className="text-xs text-gray-600">Photosensitivity</label>
                      <div className="flex items-center gap-2"><input type="checkbox" checked={!!it.photosensitivityWarning} onChange={(e) => updateItem(idx, { photosensitivityWarning: e.target.checked })} /><span className="text-xs">Show warning</span></div>
                    </div>
                    <div className="md:col-span-6">
                      <label className="text-xs text-gray-600">Food Instructions</label>
                      <Input value={it.foodInstructions || ''} onChange={(e) => updateItem(idx, { foodInstructions: e.target.value })} placeholder="With food / avoid dairy / hydrate well" />
                    </div>
                    <div className="md:col-span-6">
                      <label className="text-xs text-gray-600">Pulse Regimen</label>
                      <Input value={it.pulseRegimen || ''} onChange={(e) => updateItem(idx, { pulseRegimen: e.target.value })} placeholder="e.g., Itraconazole 200 mg BD 1 week/month × 3 months" />
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                      <Button variant="outline" onClick={() => removeItem(idx)}>Remove</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Review Date (bottom of builder) */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 opacity-100">
              <div className="md:col-span-1">
                <label className="text-sm text-gray-700">Review Date</label>
                <Input type="date" value={reviewDate || ''} onChange={(e) => onChangeReviewDate?.(e.target.value)} />
              </div>
            </div>

                          <div className="flex items-center justify-between pt-2 opacity-100">
              <div className="text-sm text-gray-600">Total items: {items.length} • Total qty: {totalQuantity}</div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setOrderOpen(true)} disabled={items.length === 0}>Order via 1MG</Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (language === 'EN') {
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
                  {visitId ? 'Create Prescription' : 'Save visit first'}
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
            <div className="h-full min-h-0 flex flex-col">
              {/* Scoped print CSS to only print the preview container */}
              <style dangerouslySetInnerHTML={{
                __html: `
                @import url('https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600&display=swap');
                @page {
                  size: A4 portrait;
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
                    width: 210mm !important;
                    height: 297mm !important;
                    margin: 0 !important;
                    padding: 12mm !important;
                    padding-top: ${12 + Math.max(0, (printTopMarginPx ?? 150))/3.78}mm !important;
                    box-sizing: border-box !important;
                    background: white !important;
                    background-repeat: no-repeat !important;
                    background-position: 0 0 !important;
                    background-size: 210mm 297mm !important;
                    ${(printBgUrl ?? '/letterhead.png') ? `background-image: url('${printBgUrl ?? '/letterhead.png'}') !important;` : ''}
                  }
                  #prescription-print-content {
                    width: 100% !important;
                    height: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    box-sizing: border-box !important;
                  }
                }
                `
              }} />
            <div className="flex-1 min-h-0 overflow-auto overflow-x-auto">
              <div
                id="prescription-print-root"
                ref={printRef}
                className="bg-white text-gray-900"
                style={{
                  fontFamily: 'Fira Sans, sans-serif',
                  fontSize: '14px',
                  width: '210mm',
                  minHeight: '297mm',
                  margin: '0 auto',
                  padding: '0',
                  paddingTop: `${Math.max(0, (printTopMarginPx ?? 150))/3.78}mm`,
                  paddingLeft: '12mm',
                  paddingRight: '12mm',
                  paddingBottom: '12mm',
                  boxSizing: 'border-box',
                  backgroundImage: (printBgUrl ?? '/letterhead.png') ? `url(${printBgUrl ?? '/letterhead.png'})` : undefined,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'top left',
                  backgroundSize: '210mm 297mm',
                }}
              >
                <div 
                  id="prescription-print-content" 
                  className="w-full h-full"
                >


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
                {((pastHistory?.trim()?.length || medicationHistory?.trim()?.length || menstrualHistory?.trim()?.length)) && (
                  <div className="py-3">
                    <div className="font-semibold mb-1">History</div>
                    <div className="space-y-1 text-sm">
                      {pastHistory?.trim()?.length ? (<div><span className="text-gray-600">Past:</span> {tt('pastHistory', pastHistory)}</div>) : null}
                      {medicationHistory?.trim()?.length ? (<div><span className="text-gray-600">Medication:</span> {tt('medicationHistory', medicationHistory)}</div>) : null}
                      {menstrualHistory?.trim()?.length ? (<div><span className="text-gray-600">Menstrual:</span> {tt('menstrualHistory', menstrualHistory)}</div>) : null}
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
                  <div className="py-3">
                    <div className="font-semibold mb-2">Rx</div>
                    {items.length > 0 ? (
                      <ol className="list-decimal ml-5 space-y-1 text-sm">
                        {items.map((it, idx) => (
                          <li key={`rx-${idx}`}>
                            <span className="font-medium">{it.drugName}</span>
                            {it.dosage && ` ${it.dosage}${it.dosageUnit ? ' ' + it.dosageUnit.toLowerCase() : ''}`} — {it.frequency.replaceAll('_',' ').toLowerCase()} × {it.duration}{' '}{it.durationUnit.toLowerCase()}
                            {it.instructions && <span> — {tt(`items.${idx}.instructions`, it.instructions)}</span>}
                            {/* Dermatology addenda */}
                            {(it.applicationSite || it.applicationAmount || it.dayPart) && (
                              <div className="text-gray-600">
                                {it.applicationSite && <span> • Site: {tt(`items.${idx}.applicationSite`, it.applicationSite)}</span>}
                                {it.applicationAmount && <span> • Amount: {tt(`items.${idx}.applicationAmount`, it.applicationAmount)}</span>}
                                {it.dayPart && <span> • {tt(`items.${idx}.dayPart`, it.dayPart)}</span>}
                              </div>
                            )}
                            {it.leaveOn === false && it.washOffAfterMinutes !== '' && (
                              <div className="text-gray-600"> • Wash off after {it.washOffAfterMinutes} min</div>
                            )}
                            {it.taperSchedule && (
                              <div className="text-gray-600"> • Taper: {tt(`items.${idx}.taperSchedule`, it.taperSchedule)}</div>
                            )}
                            {(it.pregnancyWarning || it.photosensitivityWarning) && (
                              <div className="text-red-600">{it.pregnancyWarning ? 'Pregnancy warning. ' : ''}{it.photosensitivityWarning ? 'Photosensitivity — use sunscreen.' : ''}</div>
                            )}
                            {it.foodInstructions && (
                              <div className="text-gray-600">Food: {tt(`items.${idx}.foodInstructions`, it.foodInstructions)}</div>
                            )}
                            {it.pulseRegimen && (
                              <div className="text-gray-600">Pulse: {tt(`items.${idx}.pulseRegimen`, it.pulseRegimen)}</div>
                            )}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className="text-sm text-gray-600">—</div>
                    )}
                  </div>
                )}

                {/* Topicals */}
                {(
                  (topicalFacewash.frequency || topicalFacewash.timing || topicalFacewash.duration || topicalFacewash.instructions || topicalMoisturiserSunscreen.frequency || topicalMoisturiserSunscreen.timing || topicalMoisturiserSunscreen.duration || topicalMoisturiserSunscreen.instructions || topicalActives.frequency || topicalActives.timing || topicalActives.duration || topicalActives.instructions) && (
                    <div className="py-3">
                      <div className="font-semibold mb-1">Topicals</div>
                      <ul className="list-disc ml-5 text-sm space-y-1">
                        {(topicalFacewash.frequency || topicalFacewash.timing || topicalFacewash.duration || topicalFacewash.instructions) && (
                          <li><span className="font-medium">Facewash/Soap:</span> {[topicalFacewash.frequency, topicalFacewash.timing, topicalFacewash.duration, topicalFacewash.instructions].filter(Boolean).join(' • ')}</li>
                        )}
                        {(topicalMoisturiserSunscreen.frequency || topicalMoisturiserSunscreen.timing || topicalMoisturiserSunscreen.duration || topicalMoisturiserSunscreen.instructions) && (
                          <li><span className="font-medium">Moisturiser & Sunscreen:</span> {[topicalMoisturiserSunscreen.frequency, topicalMoisturiserSunscreen.timing, topicalMoisturiserSunscreen.duration, topicalMoisturiserSunscreen.instructions].filter(Boolean).join(' • ')}</li>
                        )}
                        {(topicalActives.frequency || topicalActives.timing || topicalActives.duration || topicalActives.instructions) && (
                          <li><span className="font-medium">Actives:</span> {[topicalActives.frequency, topicalActives.timing, topicalActives.duration, topicalActives.instructions].filter(Boolean).join(' • ')}</li>
                        )}
                      </ul>
                    </div>
                  )
                )}

                {/* Post Procedure */}
                {(postProcedureCare?.trim()?.length > 0) && (
                  <div className="py-3">
                    <div className="font-semibold mb-1">Post Procedure</div>
                    <div className="text-sm whitespace-pre-wrap">{tt('postProcedureCare', postProcedureCare)}</div>
                  </div>
                )}

                {/* Investigations */}
                {(Array.isArray(investigations) && investigations.length > 0) && (
                  <div className="py-3">
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

                {/* Signature */}
                {includeSections.doctorSignature && (
                  <div className="pt-6 mt-4 border-t">
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
            <div className="print:hidden sticky bottom-0 bg-white border-t px-6 py-3 z-10">
              <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm font-medium text-blue-900 mb-1">📋 Print Settings Tip</div>
                <div className="text-xs text-blue-700">
                  To remove browser headers/footers: In your browser's print dialog, go to <strong>More settings</strong> → 
                  turn OFF <strong>"Headers and footers"</strong> for a clean prescription print.
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
                <Button onClick={() => window.print()}>Print</Button>
              </div>
            </div>
            </div>
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
                  const url = `/dashboard/pharmacy?patientId=${encodeURIComponent(patientId)}&prescriptionId=${encodeURIComponent(confirmPharmacy.prescriptionId)}`;
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
                {items.map((it, idx) => (
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
        <Dialog open={confirmPharmacy.open} onOpenChange={(open: boolean) => setConfirmPharmacy((prev) => ({ ...prev, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Go to Pharmacy?</DialogTitle>
              <DialogDescription>
                {confirmPharmacy.summary?.medicationsCount || 0} medications were added to this prescription. Continue to the pharmacy module to bill them now?
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
                  const url = `/dashboard/pharmacy?patientId=${encodeURIComponent(patientId)}&prescriptionId=${encodeURIComponent(confirmPharmacy.prescriptionId)}`;
                  window.location.href = url;
                }}
              >
                Yes, go to Pharmacy
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default React.memo(PrescriptionBuilder);