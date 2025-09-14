'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiClient } from '@/lib/api';

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
  onCreated?: (id?: string) => void;
}

export default function PrescriptionBuilder({ patientId, visitId, doctorId, onCreated }: Props) {
  const [language, setLanguage] = useState<Language>('EN');
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpInstructions, setFollowUpInstructions] = useState('');
  const [maxRefills, setMaxRefills] = useState<number>(0);
  const [validUntil, setValidUntil] = useState<string>('');

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
  const [investigations, setInvestigations] = useState<string>('');
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
  // Autocomplete state for clinical fields
  const [diagOptions, setDiagOptions] = useState<string[]>([]);
  const [complaintOptions, setComplaintOptions] = useState<string[]>([]);
  const [notesOptions, setNotesOptions] = useState<string[]>([]);
  const [loadingVisit, setLoadingVisit] = useState(false);
  const [visitData, setVisitData] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

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

  const [includeSections, setIncludeSections] = useState<Record<string, boolean>>({
    header: true,
    patientInfo: true,
    diagnosis: true,
    medications: true,
    procedures: true,
    counseling: true,
    vitals: false,
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

  // Derived flags to show inline UI feedback for auto-included sections
  const hasChiefComplaints = Boolean(chiefComplaints?.trim()?.length);
  const hasHistories = Boolean(
    pastHistory?.trim()?.length || medicationHistory?.trim()?.length || menstrualHistory?.trim()?.length
  );
  const hasFamilyHistory = Boolean(
    familyHistoryDM || familyHistoryHTN || familyHistoryThyroid || familyHistoryOthers?.trim()?.length
  );
  const hasTopicals = Boolean(
    topicalFacewash.frequency || topicalFacewash.timing || topicalFacewash.duration || topicalFacewash.instructions ||
    topicalMoisturiserSunscreen.frequency || topicalMoisturiserSunscreen.timing || topicalMoisturiserSunscreen.duration || topicalMoisturiserSunscreen.instructions ||
    topicalActives.frequency || topicalActives.timing || topicalActives.duration || topicalActives.instructions
  );
  const hasPostProcedure = Boolean(postProcedureCare?.trim()?.length);
  const hasInvestigations = Boolean(investigations?.trim()?.length);
  const hasProcedurePlanned = Boolean(procedurePlanned?.trim()?.length);
  const hasProcedureParams = Boolean(
    procedureParams.passes || procedureParams.power || procedureParams.machineUsed || procedureParams.others
  );

  const canCreate = Boolean(patientId && visitId && doctorId && items.length > 0);

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    const loadVisit = async () => {
      if (!visitId) return;
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
  }, [visitId]);

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

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        if (!patientId) return;
        const res = await apiClient.autocompletePrescriptionField({ field: 'notes', patientId, visitId: visitId || undefined, q: notes, limit: 8 });
        setNotesOptions(Array.isArray(res) ? (res as string[]) : []);
      } catch {
        setNotesOptions([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [notes, patientId, visitId]);

  const searchDrugs = async (q: string) => {
    setDrugQuery(q);
    if (!q || q.length < 2) {
      setDrugResults([]);
      return;
    }
    try {
      setLoadingDrugs(true);
      const res: any = await apiClient.searchDrugs({ query: q, limit: 10 });
      setDrugResults(res || []);
    } catch (e) {
      setDrugResults([]);
    } finally {
      setLoadingDrugs(false);
    }
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

  const create = async () => {
    if (!canCreate) return;
    try {
      const payload = {
        patientId,
        visitId,
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
        validUntil: validUntil || undefined,
        maxRefills,
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
          investigations: investigations || undefined,
          procedurePlanned: procedurePlanned || undefined,
          procedureParams: procedureParams,
        },
      };
      const res: any = await apiClient.createPrescription(payload);
      onCreated?.(res?.id);
      setItems([]);
      setDiagnosis('');
      setNotes('');
      setFollowUpInstructions('');
      setValidUntil('');
      setMaxRefills(0);
      alert('Prescription created');
    } catch (e: any) {
      const msg = e?.body?.message || 'Failed to create prescription';
      alert(msg);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Prescription Builder</span>
            <Badge variant="outline" className="text-xs">Visit-linked</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingVisit && (
            <div className="text-xs text-gray-500">Loading visit details…</div>
          )}
          {/* Formatting & Meta */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <div>
              <label className="text-sm text-gray-700">Valid Until</label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-700">Max Refills</label>
              <Input type="number" min={0} max={5} value={maxRefills} onChange={(e) => setMaxRefills(Number(e.target.value) || 0)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-700">Diagnosis (optional)</label>
              <div className="relative">
                <Input placeholder="e.g., Acne vulgaris" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
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
              <Input placeholder="e.g., Review in 4 weeks" value={followUpInstructions} onChange={(e) => setFollowUpInstructions(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-700">Notes (patient-facing)</label>
            <div className="relative">
              <Textarea rows={3} placeholder="Instructions, cautions, lifestyle advice..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              {notesOptions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow-sm max-h-48 overflow-auto">
                  {notesOptions.map((opt) => (
                    <div key={opt} className="px-3 py-1 text-sm hover:bg-gray-50 cursor-pointer" onClick={() => setNotes(opt)}>
                      {opt}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Clinical Details */}
          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="font-medium">Clinical Details</div>
              {/* Vitals */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                <div>
                  <label className="text-xs text-gray-600">Height (cm)</label>
                  <Input type="number" value={vitalsHeightCm ?? ''} onChange={(e) => setVitalsHeightCm(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Weight (kg)</label>
                  <Input type="number" value={vitalsWeightKg ?? ''} onChange={(e) => setVitalsWeightKg(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">BMI</label>
                  <Input value={vitalsBmi ?? ''} readOnly />
                </div>
                <div>
                  <label className="text-xs text-gray-600">BP (Sys)</label>
                  <Input type="number" value={vitalsBpSys ?? ''} onChange={(e) => setVitalsBpSys(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">BP (Dia)</label>
                  <Input type="number" value={vitalsBpDia ?? ''} onChange={(e) => setVitalsBpDia(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Pulse (bpm)</label>
                  <Input type="number" value={vitalsPulse ?? ''} onChange={(e) => setVitalsPulse(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
              </div>

              {/* Chief Complaints */}
              <div className={`relative ${hasChiefComplaints ? 'bg-green-50 border border-green-300 rounded p-2' : ''}`}>
                {hasChiefComplaints && (
                  <div className="absolute right-2 top-2 text-[10px] text-green-700">Auto-included in preview</div>
                )}
                <label className="text-xs text-gray-600">Chief Complaints</label>
                <div className="relative">
                  <Textarea rows={2} value={chiefComplaints} onChange={(e) => setChiefComplaints(e.target.value)} />
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

              {/* Histories */}
              <div className={`relative ${hasHistories ? 'bg-green-50 border border-green-300 rounded p-2' : ''}`}>
                {hasHistories && (
                  <div className="absolute right-2 top-2 text-[10px] text-green-700">Auto-included in preview</div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">Past History</label>
                    <Textarea rows={2} value={pastHistory} onChange={(e) => setPastHistory(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Medication History</label>
                    <Textarea rows={2} value={medicationHistory} onChange={(e) => setMedicationHistory(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Menstrual History</label>
                    <Textarea rows={2} value={menstrualHistory} onChange={(e) => setMenstrualHistory(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Family History */}
              <div className={`relative ${hasFamilyHistory ? 'bg-green-50 border border-green-300 rounded p-2' : ''}`}>
                {hasFamilyHistory && (
                  <div className="absolute right-2 top-2 text-[10px] text-green-700">Auto-included in preview</div>
                )}
                <label className="text-xs text-gray-600">Family History</label>
                <div className="flex flex-wrap gap-4 text-sm mt-1">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={familyHistoryDM} onChange={(e) => setFamilyHistoryDM(e.target.checked)} /> DM</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={familyHistoryHTN} onChange={(e) => setFamilyHistoryHTN(e.target.checked)} /> HTN</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={familyHistoryThyroid} onChange={(e) => setFamilyHistoryThyroid(e.target.checked)} /> Thyroid disorder</label>
                </div>
                <Input className="mt-2" placeholder="Others" value={familyHistoryOthers} onChange={(e) => setFamilyHistoryOthers(e.target.value)} />
              </div>

              {/* Topicals */}
              <div className={`relative ${hasTopicals ? 'bg-green-50 border border-green-300 rounded p-2' : ''}`}>
                {hasTopicals && (
                  <div className="absolute right-2 top-2 text-[10px] text-green-700">Auto-included in preview</div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                </div>
              </div>

              {/* Post Procedure */}
              <div className={`relative ${hasPostProcedure ? 'bg-green-50 border border-green-300 rounded p-2' : ''}`}>
                {hasPostProcedure && (
                  <div className="absolute right-2 top-2 text-[10px] text-green-700">Auto-included in preview</div>
                )}
                <label className="text-xs text-gray-600">Post Procedure Care (5-7 days)</label>
                <Textarea rows={2} value={postProcedureCare} onChange={(e) => setPostProcedureCare(e.target.value)} />
              </div>

              {/* Investigations */}
              <div className={`relative ${hasInvestigations ? 'bg-green-50 border border-green-300 rounded p-2' : ''}`}>
                {hasInvestigations && (
                  <div className="absolute right-2 top-2 text-[10px] text-green-700">Auto-included in preview</div>
                )}
                <label className="text-xs text-gray-600">Investigations</label>
                <Textarea rows={2} value={investigations} onChange={(e) => setInvestigations(e.target.value)} />
              </div>

              {/* Procedure Planned */}
              <div className={`relative ${hasProcedurePlanned ? 'bg-green-50 border border-green-300 rounded p-2' : ''}`}>
                {hasProcedurePlanned && (
                  <div className="absolute right-2 top-2 text-[10px] text-green-700">Auto-included in preview</div>
                )}
                <label className="text-xs text-gray-600">Procedure Planned</label>
                <Input value={procedurePlanned} onChange={(e) => setProcedurePlanned(e.target.value)} />
              </div>

              {/* Procedure Parameters (additional) */}
              <div className={`relative ${hasProcedureParams ? 'bg-green-50 border border-green-300 rounded p-2' : ''}`}>
                {hasProcedureParams && (
                  <div className="absolute right-2 top-2 text-[10px] text-green-700">Auto-included in preview</div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
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
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section Toggles */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">Sections</div>
              <Button size="sm" variant="outline" onClick={addCustomSection}>Add Custom Section</Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              {Object.keys(includeSections).map((k) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" checked={includeSections[k]} onChange={(e) => setIncludeSections({ ...includeSections, [k]: e.target.checked })} />
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
          </div>

          {/* Templates */}
          <div className="flex items-center justify-between">
            <div className="font-medium">Templates</div>
            <Button variant="outline" size="sm" onClick={() => void loadTemplates()} disabled={loadingTemplates}>
              {loadingTemplates ? 'Loading…' : 'Refresh'}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(templates || []).slice(0, 8).map((t) => (
              <Button
                key={t.id}
                variant="outline"
                size="sm"
                onClick={() => {
                  try {
                    const tItems = Array.isArray(t.items) ? t.items : JSON.parse(t.items || '[]');
                    const mapped: PrescriptionItemForm[] = tItems.map((x: any) => ({
                      drugName: x.drugName,
                      genericName: x.genericName,
                      brandName: x.brandName,
                      dosage: x.dosage,
                      dosageUnit: x.dosageUnit,
                      frequency: x.frequency,
                      duration: x.duration,
                      durationUnit: x.durationUnit,
                      instructions: x.instructions,
                      route: x.route,
                      timing: x.timing,
                      quantity: x.quantity,
                      notes: x.notes,
                      isGeneric: x.isGeneric,
                    }));
                    setItems(prev => [...prev, ...mapped]);
                  } catch {}
                }}
              >{t.name}</Button>
            ))}
          </div>

          {/* Drug search */}
          <div>
            <label className="text-sm text-gray-700">Add Drug</label>
            <Input 
              placeholder="Search drug name or brand (min 2 chars)" 
              value={drugQuery}
              onChange={(e) => void searchDrugs(e.target.value)}
            />
            {loadingDrugs && <div className="text-xs text-gray-500 mt-1">Searching…</div>}
            {!loadingDrugs && drugResults.length > 0 && (
              <div className="mt-2 border rounded divide-y max-h-48 overflow-auto">
                {drugResults.map((d: any) => (
                  <div key={`${d.id}-${d.name}`} className="px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50">
                    <div>
                      <div className="font-medium">{d.name}</div>
                      <div className="text-xs text-gray-500">{d.genericName} • {Array.isArray(d.brandNames) ? d.brandNames.join(', ') : ''}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => addItemFromDrug(d)}>Add</Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Items table */}
          <div className="space-y-3">
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

          {/* Procedure Metrics (optional, overrides/extends visit data) */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="font-medium">Procedure Metrics</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-600">Device</label>
                  <Input value={procedureMetrics.device || ''} onChange={(e) => setProcedureMetrics({ ...procedureMetrics, device: e.target.value })} placeholder="e.g., QS Nd:YAG" />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Wavelength (nm)</label>
                  <Input type="number" value={procedureMetrics.wavelengthNm ?? ''} onChange={(e) => setProcedureMetrics({ ...procedureMetrics, wavelengthNm: e.target.value === '' ? '' : Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Fluence (J/cm²)</label>
                  <Input type="number" value={procedureMetrics.fluenceJcm2 ?? ''} onChange={(e) => setProcedureMetrics({ ...procedureMetrics, fluenceJcm2: e.target.value === '' ? '' : Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Spot Size (mm)</label>
                  <Input type="number" value={procedureMetrics.spotSizeMm ?? ''} onChange={(e) => setProcedureMetrics({ ...procedureMetrics, spotSizeMm: e.target.value === '' ? '' : Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Pulse (ms)</label>
                  <Input type="number" value={procedureMetrics.pulseMs ?? ''} onChange={(e) => setProcedureMetrics({ ...procedureMetrics, pulseMs: e.target.value === '' ? '' : Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Shots</label>
                  <Input type="number" value={procedureMetrics.shots ?? ''} onChange={(e) => setProcedureMetrics({ ...procedureMetrics, shots: e.target.value === '' ? '' : Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Cooling</label>
                  <Input value={procedureMetrics.cooling || ''} onChange={(e) => setProcedureMetrics({ ...procedureMetrics, cooling: e.target.value })} placeholder="contact/air/cryogen" />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Area</label>
                  <Input value={procedureMetrics.area || ''} onChange={(e) => setProcedureMetrics({ ...procedureMetrics, area: e.target.value })} placeholder="e.g., Full face" />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Peel Agent</label>
                  <Input value={procedureMetrics.peelAgent || ''} onChange={(e) => setProcedureMetrics({ ...procedureMetrics, peelAgent: e.target.value })} placeholder="e.g., TCA, GA" />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Peel %</label>
                  <Input value={procedureMetrics.peelConcentration || ''} onChange={(e) => setProcedureMetrics({ ...procedureMetrics, peelConcentration: e.target.value })} placeholder="e.g., 20%" />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Contact Time (min)</label>
                  <Input type="number" value={procedureMetrics.peelContactTimeMin ?? ''} onChange={(e) => setProcedureMetrics({ ...procedureMetrics, peelContactTimeMin: e.target.value === '' ? '' : Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Frosting</label>
                  <Input value={procedureMetrics.frosting || ''} onChange={(e) => setProcedureMetrics({ ...procedureMetrics, frosting: e.target.value })} placeholder="Grade I/II/III" />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Needle Depth (mm)</label>
                  <Input value={procedureMetrics.needleDepthMm || ''} onChange={(e) => setProcedureMetrics({ ...procedureMetrics, needleDepthMm: e.target.value })} placeholder="e.g., 0.5–2.0" />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Passes</label>
                  <Input type="number" value={procedureMetrics.passes ?? ''} onChange={(e) => setProcedureMetrics({ ...procedureMetrics, passes: e.target.value === '' ? '' : Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Anesthetic</label>
                  <Input value={procedureMetrics.anesthetic || ''} onChange={(e) => setProcedureMetrics({ ...procedureMetrics, anesthetic: e.target.value })} placeholder="e.g., LMX 4% 30 min" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between pt-2">
            <div className="text-sm text-gray-600">Total items: {items.length} • Total qty: {totalQuantity}</div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreviewOpen(true)}>Print Preview</Button>
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
          <div className="h-full flex flex-col">
            <DialogHeader className="px-6 pt-4 pb-2">
              <DialogTitle>Prescription Preview</DialogTitle>
            </DialogHeader>
          {/* Scoped print CSS to only print the preview container */}
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600&display=swap');
            @media print {
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
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
              }
            }
          `}</style>
          <div className="flex-1 overflow-auto overflow-x-auto">
            <div id="prescription-print-root" ref={printRef} className="bg-white text-gray-900 p-6 w-full" style={{ fontFamily: 'Fira Sans, sans-serif', fontSize: '14px' }}>
              <div className="mx-auto w-[1400px] min-w-[1100px]">
                {/* Header */}
                {includeSections.header && (
                  <div className="flex items-start justify-between pb-4 border-b">
                    <div>
                      <div className="text-xl font-bold">Clinic Prescription</div>
                      <div className="text-sm text-gray-600">{new Date().toLocaleDateString()}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-medium">Dr. {visitData?.doctor?.firstName} {visitData?.doctor?.lastName}</div>
                      {visitData?.doctor?.specialization && (
                        <div className="text-gray-600">{visitData?.doctor?.specialization}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Patient Info */}
                {includeSections.patientInfo && (
                <div className="flex justify-between text-sm py-3">
                  <div>
                    <div className="text-gray-600">Patient</div>
                    <div className="font-medium">{visitData?.patient?.name || '—'}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Patient ID</div>
                    <div className="font-medium">{visitData?.patient?.id || '—'}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Gender / DOB</div>
                    <div className="font-medium">{visitData?.patient?.gender || '—'} {visitData?.patient?.dob ? `• ${new Date(visitData.patient.dob).toLocaleDateString()}` : ''}</div>
                  </div>
                </div>
              )}

              {/* Vitals (manual override) */}
              {includeSections.vitals && (vitalsHeightCm || vitalsWeightKg || vitalsBmi || vitalsBpSys || vitalsBpDia || vitalsPulse) && (
                <div className="py-3">
                  <div className="font-semibold mb-1">Vitals</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    {vitalsHeightCm !== '' && <div><span className="text-gray-600 mr-1">Height:</span><span className="font-medium">{vitalsHeightCm} cm</span></div>}
                    {vitalsWeightKg !== '' && <div><span className="text-gray-600 mr-1">Weight:</span><span className="font-medium">{vitalsWeightKg} kg</span></div>}
                    {vitalsBmi !== '' && <div><span className="text-gray-600 mr-1">BMI:</span><span className="font-medium">{vitalsBmi}</span></div>}
                    {(vitalsBpSys !== '' || vitalsBpDia !== '') && <div><span className="text-gray-600 mr-1">BP:</span><span className="font-medium">{vitalsBpSys || '—'}/{vitalsBpDia || '—'} mmHg</span></div>}
                    {vitalsPulse !== '' && <div><span className="text-gray-600 mr-1">PR:</span><span className="font-medium">{vitalsPulse} bpm</span></div>}
                  </div>
                </div>
              )}

              {/* Diagnosis */}
              {includeSections.diagnosis && (
                <div className="py-3">
                  <div className="font-semibold mb-1">Diagnosis</div>
                  <div className="text-sm">{(diagnosis?.trim() || '').length > 0 ? diagnosis : '—'}</div>
                </div>
              )}

              {/* Chief Complaints */}
              {(chiefComplaints?.trim()?.length > 0) && (
                <div className="py-3">
                  <div className="font-semibold mb-1">Chief Complaints</div>
                  <div className="text-sm whitespace-pre-wrap">{chiefComplaints}</div>
                </div>
              )}

              {/* Histories */}
              {((pastHistory?.trim()?.length || medicationHistory?.trim()?.length || menstrualHistory?.trim()?.length)) && (
                <div className="py-3">
                  <div className="font-semibold mb-1">History</div>
                  <div className="space-y-1 text-sm">
                    {pastHistory?.trim()?.length ? (<div><span className="text-gray-600">Past:</span> {pastHistory}</div>) : null}
                    {medicationHistory?.trim()?.length ? (<div><span className="text-gray-600">Medication:</span> {medicationHistory}</div>) : null}
                    {menstrualHistory?.trim()?.length ? (<div><span className="text-gray-600">Menstrual:</span> {menstrualHistory}</div>) : null}
                  </div>
                </div>
              )}

              {/* Family History */}
              {(familyHistoryDM || familyHistoryHTN || familyHistoryThyroid || familyHistoryOthers?.trim()?.length) && (
                <div className="py-3">
                  <div className="font-semibold mb-1">Family History</div>
                  <div className="text-sm">{[familyHistoryDM ? 'DM' : null, familyHistoryHTN ? 'HTN' : null, familyHistoryThyroid ? 'Thyroid disorder' : null, familyHistoryOthers?.trim()?.length ? familyHistoryOthers : null].filter(Boolean).join(', ')}</div>
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
                          {it.instructions && <span> — {it.instructions}</span>}
                          {/* Dermatology addenda */}
                          {(it.applicationSite || it.applicationAmount || it.dayPart) && (
                            <div className="text-gray-600">
                              {it.applicationSite && <span> • Site: {it.applicationSite}</span>}
                              {it.applicationAmount && <span> • Amount: {it.applicationAmount}</span>}
                              {it.dayPart && <span> • {it.dayPart}</span>}
                            </div>
                          )}
                          {it.leaveOn === false && it.washOffAfterMinutes !== '' && (
                            <div className="text-gray-600"> • Wash off after {it.washOffAfterMinutes} min</div>
                          )}
                          {it.taperSchedule && (
                            <div className="text-gray-600"> • Taper: {it.taperSchedule}</div>
                          )}
                          {(it.pregnancyWarning || it.photosensitivityWarning) && (
                            <div className="text-red-600">{it.pregnancyWarning ? 'Pregnancy warning. ' : ''}{it.photosensitivityWarning ? 'Photosensitivity — use sunscreen.' : ''}</div>
                          )}
                          {it.foodInstructions && (
                            <div className="text-gray-600">Food: {it.foodInstructions}</div>
                          )}
                          {it.pulseRegimen && (
                            <div className="text-gray-600">Pulse: {it.pulseRegimen}</div>
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
                  <div className="text-sm whitespace-pre-wrap">{postProcedureCare}</div>
                </div>
              )}

              {/* Investigations */}
              {(investigations?.trim()?.length > 0) && (
                <div className="py-3">
                  <div className="font-semibold mb-1">Investigations</div>
                  <div className="text-sm whitespace-pre-wrap">{investigations}</div>
                </div>
              )}

              {/* Procedure Planned */}
              {(procedurePlanned?.trim()?.length > 0) && (
                <div className="py-3">
                  <div className="font-semibold mb-1">Procedure Planned</div>
                  <div className="text-sm">{procedurePlanned}</div>
                </div>
              )}

              {/* Procedures */}
              {includeSections.procedures && (
                <div className="py-3">
                  <div className="font-semibold mb-1">Procedures</div>
                  {(visitPlan?.dermatology?.procedures?.length > 0) ? (
                    <ul className="list-disc ml-5 text-sm">
                      {visitPlan.dermatology.procedures.map((p: any, i: number) => (
                        <li key={i}>{[p?.type, p?.fluence && `${p.fluence} J/cm²`, p?.spotSize && `${p.spotSize} mm`, p?.passes && `${p.passes} passes`].filter(Boolean).join(' • ')}</li>
                      ))}
                    </ul>
                  ) : null}
                  {Object.keys(procedureMetrics).length > 0 ? (
                    <div className="mt-2 text-sm">
                      <div className="font-medium">Recorded Metrics</div>
                      <ul className="list-disc ml-5">
                        {procedureMetrics.device && <li>Device: {procedureMetrics.device}</li>}
                        {procedureMetrics.wavelengthNm !== '' && <li>Wavelength: {procedureMetrics.wavelengthNm} nm</li>}
                        {procedureMetrics.fluenceJcm2 !== '' && <li>Fluence: {procedureMetrics.fluenceJcm2} J/cm²</li>}
                        {procedureMetrics.spotSizeMm !== '' && <li>Spot Size: {procedureMetrics.spotSizeMm} mm</li>}
                        {procedureMetrics.pulseMs !== '' && <li>Pulse: {procedureMetrics.pulseMs} ms</li>}
                        {procedureMetrics.shots !== '' && <li>Shots: {procedureMetrics.shots}</li>}
                        {procedureMetrics.cooling && <li>Cooling: {procedureMetrics.cooling}</li>}
                        {procedureMetrics.area && <li>Area: {procedureMetrics.area}</li>}
                        {procedureMetrics.peelAgent && <li>Peel: {procedureMetrics.peelAgent} {procedureMetrics.peelConcentration ? `(${procedureMetrics.peelConcentration})` : ''}</li>}
                        {procedureMetrics.peelContactTimeMin !== '' && <li>Contact Time: {procedureMetrics.peelContactTimeMin} min</li>}
                        {procedureMetrics.frosting && <li>Frosting: {procedureMetrics.frosting}</li>}
                        {procedureMetrics.needleDepthMm && <li>Needle Depth: {procedureMetrics.needleDepthMm} mm</li>}
                        {procedureMetrics.passes !== '' && <li>Passes: {procedureMetrics.passes}</li>}
                        {procedureMetrics.anesthetic && <li>Anesthetic: {procedureMetrics.anesthetic}</li>}
                      </ul>
                    </div>
                  ) : null}
                  {(!(visitPlan?.dermatology?.procedures?.length > 0) && Object.keys(procedureMetrics).length === 0) && (
                    <div className="text-sm text-gray-600">—</div>
                  )}
                </div>
              )}

              {/* Procedure Parameters (additional) */}
              {(procedureParams.passes || procedureParams.power || procedureParams.machineUsed || procedureParams.others) && (
                <div className="py-3">
                  <div className="font-semibold mb-1">Procedure Parameters</div>
                  <ul className="list-disc ml-5 text-sm">
                    {procedureParams.passes && <li>Passes: {procedureParams.passes}</li>}
                    {procedureParams.power && <li>Power: {procedureParams.power}</li>}
                    {procedureParams.machineUsed && <li>Machine Used: {procedureParams.machineUsed}</li>}
                    {procedureParams.others && <li>Other Params: {procedureParams.others}</li>}
                  </ul>
                </div>
              )}

              {/* Counseling */}
              {includeSections.counseling && (
                <div className="py-3">
                  <div className="font-semibold mb-1">Counseling / Advice</div>
                  <div className="text-sm whitespace-pre-wrap">{(notes || visitPlan?.dermatology?.counseling) ? (notes || visitPlan?.dermatology?.counseling) : '—'}</div>
                </div>
              )}

              {/* Vitals */}
              {includeSections.vitals && visitVitals && (
                <div className="py-3">
                  <div className="font-semibold mb-1">Vitals</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    {Object.entries(visitVitals).map(([k, v]: any) => (
                      v ? <div key={k}><span className="text-gray-600 mr-1">{k}:</span><span className="font-medium">{v}</span></div> : null
                    ))}
                  </div>
                </div>
              )}

              {/* Follow Up */}
              {includeSections.followUp && (
                <div className="py-3">
                  <div className="font-semibold mb-1">Follow Up</div>
                  <div className="text-sm">{followUpInstructions || '—'}</div>
                </div>
              )}

              {/* Notes */}
              {includeSections.notes && (
                <div className="py-3">
                  <div className="font-semibold mb-1">Notes</div>
                  <div className="text-sm whitespace-pre-wrap">{notes || '—'}</div>
                </div>
              )}

              {/* Custom Sections */}
              {customSections.length > 0 && customSections.map((s) => (
                (s.title?.trim() || s.content?.trim()) ? (
                  <div key={`cs-${s.id}`} className="py-3">
                    <div className="font-semibold mb-1">{s.title}</div>
                    <div className="text-sm whitespace-pre-wrap">{s.content}</div>
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
          <div className="print:hidden border-t px-6 py-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
            <Button onClick={() => window.print()}>Print</Button>
          </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 