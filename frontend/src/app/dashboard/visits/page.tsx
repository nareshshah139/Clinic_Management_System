'use client';

type PrescriptionSummaryProps = {
  prescription: unknown;
  onPrint?: () => void;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const formatDateTime = (value?: string | Date | null) => {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

function normalizePrescription(prescription: unknown) {
  if (!isPlainObject(prescription)) {
    return null;
  }

  const itemsRaw = prescription.items;
  let items: Array<Record<string, unknown>> = [];
  if (Array.isArray(itemsRaw)) {
    items = itemsRaw as Array<Record<string, unknown>>;
  } else if (typeof itemsRaw === 'string' && itemsRaw.trim()) {
    try {
      const parsed = JSON.parse(itemsRaw);
      if (Array.isArray(parsed)) {
        items = parsed as Array<Record<string, unknown>>;
      }
    } catch (error) {
      console.error('Failed to parse prescription items', error);
    }
  }

  return {
    id: typeof prescription.id === 'string' ? prescription.id : undefined,
    prescriptionNumber: typeof prescription.prescriptionNumber === 'string' ? prescription.prescriptionNumber : undefined,
    createdAt: formatDateTime(prescription.createdAt as string | Date | undefined),
    status: typeof prescription.status === 'string' ? prescription.status : undefined,
    doctor:
      isPlainObject(prescription.doctor) && typeof prescription.doctor.name === 'string'
        ? prescription.doctor.name
        : undefined,
    patient:
      isPlainObject(prescription.patient) && typeof prescription.patient.name === 'string'
        ? prescription.patient.name
        : undefined,
    notes: typeof prescription.notes === 'string' ? prescription.notes : undefined,
    instructions: typeof prescription.instructions === 'string' ? prescription.instructions : undefined,
    pharmacistNotes: typeof prescription.pharmacistNotes === 'string' ? prescription.pharmacistNotes : undefined,
    reviewDate: formatDateTime((prescription as Record<string, unknown>).reviewDate as string | Date | undefined),
    metadata: isPlainObject(prescription.metadata) ? prescription.metadata : undefined,
    items,
  };
}

function PrescriptionSummary({ prescription, onPrint }: PrescriptionSummaryProps) {
  const normalized = normalizePrescription(prescription);

  if (!normalized) {
    return <p className="text-sm text-red-600">Unable to display prescription data.</p>;
  }

  const {
    id,
    prescriptionNumber,
    createdAt,
    status,
    doctor,
    patient,
    notes,
    instructions,
    pharmacistNotes,
    reviewDate,
    items,
  } = normalized;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Prescription Overview</h3>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {prescriptionNumber && (
            <div>
              <span className="text-gray-600">Prescription #:</span>
              <span className="ml-2 text-gray-900">{prescriptionNumber}</span>
            </div>
          )}
          {id && (
            <div>
              <span className="text-gray-600">ID:</span>
              <span className="ml-2 text-gray-900">{id}</span>
            </div>
          )}
          {status && (
            <div>
              <span className="text-gray-600">Status:</span>
              <span className="ml-2 text-gray-900 capitalize">{status.toLowerCase()}</span>
            </div>
          )}
          {createdAt && (
            <div>
              <span className="text-gray-600">Created:</span>
              <span className="ml-2 text-gray-900">{createdAt}</span>
            </div>
          )}
          {reviewDate && (
            <div>
              <span className="text-gray-600">Review Date:</span>
              <span className="ml-2 text-gray-900">{reviewDate}</span>
            </div>
          )}
          {doctor && (
            <div>
              <span className="text-gray-600">Doctor:</span>
              <span className="ml-2 text-gray-900">{doctor}</span>
            </div>
          )}
          {patient && (
            <div>
              <span className="text-gray-600">Patient:</span>
              <span className="ml-2 text-gray-900">{patient}</span>
            </div>
          )}
        </div>
      </div>

      <div>
        <h4 className="text-md font-medium text-gray-900">Medications</h4>
        {items.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No medication items recorded.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {items.map((item, idx) => {
              const name = typeof item.drugName === 'string' ? item.drugName : typeof item.name === 'string' ? item.name : `Medication ${idx + 1}`;
              const dosage = typeof item.dosage === 'string' ? item.dosage : item.dosage ? String(item.dosage) : undefined;
              const frequency = typeof item.frequency === 'string' ? item.frequency : undefined;
              const duration = typeof item.duration === 'string' ? item.duration : undefined;
              const durationUnit = typeof item.durationUnit === 'string' ? item.durationUnit : undefined;
              const instructionsText = typeof item.instructions === 'string' ? item.instructions : undefined;
              const additional: string[] = [];

              if (typeof item.applicationSite === 'string') {
                additional.push(`Application site: ${item.applicationSite}`);
              }
              if (typeof item.applicationAmount === 'string') {
                additional.push(`Amount: ${item.applicationAmount}`);
              }
              if (typeof item.dayPart === 'string') {
                additional.push(`Day part: ${item.dayPart}`);
              }
              if (typeof item.pulseRegimen === 'string') {
                additional.push(`Pulse regimen: ${item.pulseRegimen}`);
              }
              if (typeof item.foodInstructions === 'string') {
                additional.push(`Food instructions: ${item.foodInstructions}`);
              }
              if (typeof item.taperSchedule === 'string') {
                additional.push(`Taper schedule: ${item.taperSchedule}`);
              }
              if (item.pregnancyWarning) {
                additional.push('Pregnancy warning');
              }
              if (item.photosensitivityWarning) {
                additional.push('Photosensitivity warning');
              }
              if (typeof item.weightMgPerKgPerDay === 'number') {
                additional.push(`Weight-based dose: ${item.weightMgPerKgPerDay} mg/kg/day`);
              }
              if (typeof item.calculatedDailyDoseMg === 'number') {
                additional.push(`Calculated daily dose: ${item.calculatedDailyDoseMg} mg`);
              }
              if (typeof item.washOffAfterMinutes === 'number') {
                additional.push(`Wash off after: ${item.washOffAfterMinutes} minutes`);
              }

              return (
                <div key={idx} className="rounded border border-gray-200 p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{name}</p>
                      <p className="text-sm text-gray-600">
                        {dosage && <span className="mr-2">Dosage: {dosage}</span>}
                        {frequency && <span className="mr-2">Frequency: {frequency.replaceAll('_', ' ')}</span>}
                        {duration && <span className="mr-2">Duration: {duration} {durationUnit ?? ''}</span>}
                      </p>
                      {instructionsText && (
                        <p className="text-sm text-gray-700 mt-1">Instructions: {instructionsText}</p>
                      )}
                      {additional.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                          {additional.map((entry, additionalIdx) => (
                            <li key={additionalIdx}>{entry}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(notes || instructions || pharmacistNotes) && (
        <div className="space-y-3">
          {notes && (
            <div>
              <h4 className="text-md font-medium text-gray-900">Notes</h4>
              <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{notes}</p>
            </div>
          )}
          {instructions && (
            <div>
              <h4 className="text-md font-medium text-gray-900">General Instructions</h4>
              <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{instructions}</p>
            </div>
          )}
          {pharmacistNotes && (
            <div>
              <h4 className="text-md font-medium text-gray-900">Pharmacist Notes</h4>
              <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{pharmacistNotes}</p>
            </div>
          )}
        </div>
      )}

      {onPrint && (
        <DialogFooter>
          <Button variant="outline" onClick={onPrint}>Print</Button>
        </DialogFooter>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { isValidId } from '@/lib/id';
import { isUuid } from '@/lib/id';
import type { ComponentType } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { User, Users, Stethoscope, FileText, Calendar, Activity, ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type {
  Appointment,
  GetPatientsResponse,
  GetUsersResponse,
  Patient,
  PatientVisitHistoryResponse,
  User as UserSummary,
  VisitTimelineEntry,
  VisitSummary,
} from '@/lib/types';

type AppointmentWithVisit = Appointment & { visit?: { id: string } | null };
type DoctorSummary = UserSummary & { specialization?: string };
type PatientMatch = Patient & { name?: string };

type VisitComplaint = {
  complaint?: string;
  [key: string]: unknown;
};

type VisitDiagnosis = {
  diagnosis?: string;
  [key: string]: unknown;
};

type VisitMedication = string | { name?: string; dosage?: string; duration?: string };

type VisitTreatment = {
  medications?: VisitMedication[];
  [key: string]: unknown;
};

type VisitScribeData = {
  visitType?: string;
  notes?: string;
  [key: string]: unknown;
};

const parseJsonArray = <T,>(value: unknown): T[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const parseJsonObject = <T extends Record<string, unknown>>(value: unknown): T | undefined => {
  if (!value) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as T;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as T) : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
};

const normalizePatientVisits = (payload: PatientVisitHistoryResponse): VisitTimelineEntry[] => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    const { visits, data } = payload;
    if (Array.isArray(visits)) return visits;
    if (Array.isArray(data)) return data;
  }
  return [];
};

const PhotosPanel = dynamic<ComponentType<{ visitId: string }>>(
  () => import('@/components/visits/VisitPhotos'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-6 text-sm text-gray-500">
        Loading photos...
      </div>
    ),
  }
);

// Patient History Timeline Component
function PatientHistoryTimeline({ patientId }: { patientId: string }) {
  const [history, setHistory] = useState<VisitTimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewingPrescription, setViewingPrescription] = useState<{
    visitId: string;
    prescriptionId: string;
  } | null>(null);
  const [prescriptionsCache, setPrescriptionsCache] = useState<Record<string, unknown>>({});
  const [prescriptionLoading, setPrescriptionLoading] = useState(false);
  const [prescriptionError, setPrescriptionError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPatientHistory = async () => {
      if (!patientId) return;
      
      try {
        setLoading(true);
        const response = await apiClient.getPatientVisitHistory<PatientVisitHistoryResponse>(patientId, { limit: 10 });
        const visits = normalizePatientVisits(response);
        setHistory(visits);
      } catch (error) {
        console.error('Failed to load patient visit history', error);
        setHistory([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPatientHistory();
  }, [patientId]);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-500 mt-2">Loading visit history...</p>
      </div>
    );
  }

  if (!patientId) {
    return (
      <div className="text-center py-8 text-gray-500">
        <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <p>Select a patient to view their visit history</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <p>No visit history found for this patient</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Patient Visit History</h3>
        <Badge variant="secondary">{history.length} Visits</Badge>
      </div>
      
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
        
        {/* Timeline items */}
        <div className="space-y-6">
          {history.map((visit, index) => {
            const complaints = parseJsonArray<VisitComplaint>(visit.complaints);
            const diagnosis = parseJsonArray<VisitDiagnosis>(visit.diagnosis);
            const treatment = parseJsonObject<VisitTreatment>(visit.plan) ?? {};
            const scribeData = parseJsonObject<VisitScribeData>(visit.scribeJson) ?? {};
            const visitDate = visit.createdAt ? new Date(visit.createdAt) : new Date();
            const chiefComplaint = complaints[0]?.complaint ?? 'No chief complaint recorded';
            const primaryDiagnosis = diagnosis[0]?.diagnosis ?? 'No diagnosis recorded';
            const visitTypeLabel = scribeData.visitType ?? 'OPD Consultation';
            const medicationEntries = (Array.isArray(treatment.medications) ? treatment.medications : []) as VisitMedication[];
            const isProcedure = visitTypeLabel.toLowerCase().includes('procedure');
            const badgeVariant: 'default' | 'destructive' = isProcedure ? 'destructive' : 'default';
            const hasPrescription = !!visit.prescription?.id;
            
            return (
              <div key={visit.id} className="relative flex items-start space-x-4">
                {/* Timeline dot */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                  index === 0 
                    ? 'bg-blue-100 border-blue-500 text-blue-600' 
                    : 'bg-gray-100 border-gray-300 text-gray-500'
                }`}>
                  {isProcedure ? (
                    <Activity className="h-4 w-4" />
                  ) : (
                    <Stethoscope className="h-4 w-4" />
                  )}
                </div>
                
                {/* Visit details */}
                <div className="flex-1 min-w-0">
                  <Card className={`${index === 0 ? 'border-blue-200 bg-blue-50' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900">
                            {visitDate.toLocaleDateString()} at {visitDate.toLocaleTimeString()}
                          </span>
                        </div>
                        <Badge variant={badgeVariant}>
                          {visitTypeLabel}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Doctor: <span className="font-medium text-gray-900">{visit.doctor?.firstName} {visit.doctor?.lastName}</span></p>
                          <p className="text-gray-600">Chief Complaint: <span className="text-gray-900">{chiefComplaint}</span></p>
                        </div>
                        <div>
                          <p className="text-gray-600">Diagnosis: <span className="font-medium text-gray-900">{primaryDiagnosis}</span></p>
                          {visit.followUp && (
                            <p className="text-gray-600">Follow-up: <span className="text-gray-900">{new Date(visit.followUp).toLocaleDateString()}</span></p>
                          )}
                        </div>
                      </div>
                      
                      {treatment.medications && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="text-sm text-gray-600">
                            <span className="font-medium">Treatment:</span>
                            <ul className="list-disc ml-5 mt-1 text-gray-700">
                                {medicationEntries.map((medication, idx) => {
                                  const summary =
                                    typeof medication === 'string'
                                      ? medication
                                      : [medication?.name, medication?.dosage, medication?.duration]
                                          .filter(Boolean)
                                          .join(' • ');
                                  return <li key={idx}>{summary}</li>;
                                })}
                              </ul>
                            </div>
                          </div>
                        )}
                        
                      {scribeData.notes && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <p className="text-sm text-gray-600">
                            <span className="font-medium">Notes:</span> {scribeData.notes}
                          </p>
                        </div>
                      )}

                      {hasPrescription && (
                        <div className="mt-4 pt-3 border-t border-gray-200">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const prescriptionId = visit.prescription!.id;
                              setViewingPrescription({ visitId: visit.id, prescriptionId });
                              if (!prescriptionsCache[prescriptionId]) {
                                setPrescriptionError(null);
                                setPrescriptionLoading(true);
                                void apiClient
                                  .getPrescription(prescriptionId)
                                  .then((data) => {
                                    setPrescriptionsCache((prev) => ({ ...prev, [prescriptionId]: data }));
                                  })
                                  .catch((error: unknown) => {
                                    console.error('Failed to load prescription', error);
                                    setPrescriptionError('Unable to load prescription. Please try again.');
                                  })
                                  .finally(() => {
                                    setPrescriptionLoading(false);
                                  });
                              }
                            }}
                          >
                            View Prescription
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog
        open={!!viewingPrescription}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setViewingPrescription(null);
            setPrescriptionError(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Prescription Details</DialogTitle>
            <DialogDescription>
              Review the medications and instructions issued during this visit.
            </DialogDescription>
          </DialogHeader>

          {prescriptionLoading && <p className="text-sm text-gray-500">Loading prescription...</p>}
          {prescriptionError && <p className="text-sm text-red-600">{prescriptionError}</p>}

          {!prescriptionLoading && viewingPrescription && !prescriptionError && (
            <PrescriptionSummary
              prescription={prescriptionsCache[viewingPrescription.prescriptionId]}
              onPrint={() => window.print()}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VisitsPageInner() {
  const [patients, setPatients] = useState<PatientMatch[]>([]);
  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [currentUserRole, setCurrentUserRole] = useState<string>('DOCTOR');
  const [recentVisitId, setRecentVisitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Autocomplete state for patients
  const [patientQuery, setPatientQuery] = useState('');
  const [patientOptions, setPatientOptions] = useState<PatientMatch[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [showPatientMenu, setShowPatientMenu] = useState(false);
  const [appointmentData, setAppointmentData] = useState<AppointmentWithVisit | null>(null);

  const searchParams = useSearchParams();
  const urlPatientId = searchParams.get('patientId');
  const appointmentIdParam = searchParams.get('appointmentId');
  const autoStartParam = searchParams.get('autoStart') === 'true';

  const extractPatients = useCallback((payload: unknown): PatientMatch[] => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload as PatientMatch[];
    if (typeof payload === 'object' && payload !== null) {
      const data = payload as Partial<GetPatientsResponse> & { data?: PatientMatch[] };
      if (Array.isArray(data.patients)) return data.patients as PatientMatch[];
      if (Array.isArray(data.data)) return data.data as PatientMatch[];
    }
    return [];
  }, []);

  const extractDoctors = useCallback((payload: unknown): DoctorSummary[] => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload as DoctorSummary[];
    if (typeof payload === 'object' && payload !== null) {
      const data = payload as Partial<GetUsersResponse>;
      if (Array.isArray(data.users)) return data.users as DoctorSummary[];
    }
    return [];
  }, []);

  const fetchAppointmentData = useCallback(async (appointmentId: string) => {
    try {
      const appointment = await apiClient.getAppointment<AppointmentWithVisit>(appointmentId);
      setAppointmentData(appointment);
      if (appointment?.doctorId) {
        setSelectedDoctorId(appointment.doctorId);
      }
    } catch (error) {
      console.error('Failed to fetch appointment data:', error);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [patientsRes, usersRes] = await Promise.allSettled([
        apiClient.getPatients({ page: 1, limit: 50 }),
        apiClient.getUsers({ role: 'DOCTOR', limit: 20 })
      ]);

      if (patientsRes.status === 'fulfilled') {
        const patientsData = extractPatients(patientsRes.value);
        setPatients(patientsData);
        setPatientOptions(patientsData.slice(0, 10));
        if (patientsData.length > 0) {
          setSelectedPatientId((prev) => {
            if (prev) return prev;
            if (urlPatientId && isValidId(urlPatientId)) return urlPatientId;
            return patientsData[0]?.id ?? '';
          });
        }
      }

      if (usersRes.status === 'fulfilled') {
        const doctorsData = extractDoctors(usersRes.value);
        setDoctors(doctorsData);
        if (doctorsData.length > 0) {
          const candidate = doctorsData[0]?.id;
          if (!candidate || !isValidId(candidate)) {
            console.warn('[VisitsPage] First doctor has invalid id, requiring manual selection', { candidate });
          }
          setSelectedDoctorId((prev) => prev || (isValidId(candidate) ? candidate : ''));
        }
      }

      try {
        const currentUser = await apiClient.get<{ role?: string }>('/auth/me');
        setCurrentUserRole(currentUser?.role ?? 'DOCTOR');
      } catch (error) {
        console.error('Failed to get current user:', error);
        setCurrentUserRole('DOCTOR');
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [extractDoctors, extractPatients, urlPatientId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle URL parameters for appointment linking
  useEffect(() => {
    if (urlPatientId) {
      setSelectedPatientId(urlPatientId);
      if (appointmentIdParam) {
        void fetchAppointmentData(appointmentIdParam);
      }
      if (autoStartParam) {
        setShowForm(true);
      }
    }
  }, [appointmentIdParam, autoStartParam, fetchAppointmentData, urlPatientId]);

  useEffect(() => {
    const visitId = (appointmentData?.visit && 'id' in appointmentData.visit) ? appointmentData.visit.id : undefined;
    if (typeof visitId === 'string') {
      setRecentVisitId(visitId);
    }
  }, [appointmentData]);

  // Debounced search for patients
  useEffect(() => {
    let timeoutRef: ReturnType<typeof setTimeout>;
    const run = async () => {
      try {
        setSearchingPatients(true);
        const res = await apiClient.getPatients({ search: patientQuery || undefined, limit: 10 });
        const rows = extractPatients(res);
        setPatientOptions(rows);
      } catch (e) {
        setPatientOptions([]);
      } finally {
        setSearchingPatients(false);
      }
    };
    timeoutRef = setTimeout(() => {
      void run();
    }, 250);
    return () => clearTimeout(timeoutRef);
  }, [extractPatients, patientQuery]);

  const roleInfo = useMemo(() => {
    const permissions = {
      THERAPIST: { 
        label: 'Therapist',
        description: 'Can record vitals, capture photos, and basic assessments (20-25% of visit)',
        color: 'bg-blue-100 text-blue-700'
      },
      NURSE: { 
        label: 'Nurse',
        description: 'Can record vitals, capture photos, complaints, and basic assessments',
        color: 'bg-green-100 text-green-700'
      },
      DOCTOR: { 
        label: 'Doctor',
        description: 'Full access to all visit documentation features',
        color: 'bg-purple-100 text-purple-700'
      },
      RECEPTION: { 
        label: 'Reception',
        description: 'Can capture photos and basic patient information',
        color: 'bg-orange-100 text-orange-700'
      },
    };
    return permissions[currentUserRole as keyof typeof permissions] || permissions.DOCTOR;
  }, [currentUserRole]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  );

  const selectedDoctor = useMemo(
    () => doctors.find((d) => d.id === selectedDoctorId) ?? null,
    [doctors, selectedDoctorId]
  );

  const startNewVisit = () => {
    if (selectedPatientId && selectedDoctorId) {
      setShowForm(true);
    }
  };
 
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mr-3" />
        <span className="text-sm text-gray-600">Loading visit management...</span>
      </div>
    );
  }
 
  if (patients.length === 0 || doctors.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Setup Required</CardTitle>
          <CardDescription>
            Please ensure you have patients and doctors in the system before creating visits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {patients.length === 0 && (
              <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                <Users className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-sm font-medium text-red-700">No patients found</p>
                  <p className="text-xs text-red-600">Add at least one patient to create visits</p>
                </div>
              </div>
            )}
            
            {doctors.length === 0 && (
              <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                <Stethoscope className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-sm font-medium text-red-700">No doctors found</p>
                  <p className="text-xs text-red-600">Add at least one doctor to create visits</p>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Link href="/dashboard/patients">
                <Button size="sm">
                  <Users className="h-4 w-4 mr-2" />
                  Manage Patients
                </Button>
              </Link>
              <Link href="/dashboard/users">
                <Button variant="outline" size="sm">
                  <User className="h-4 w-4 mr-2" />
                  Manage Users
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!showForm) {
    return (
      <div className="space-y-6">
        {/* Role Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Visit Documentation
            </CardTitle>
            <CardDescription>
              Create and manage patient visits with role-based documentation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Current Role</h3>
                  <p className="text-xs text-gray-500 mt-1">{roleInfo.description}</p>
                </div>
                <Badge className={roleInfo.color}>
                  {roleInfo.label}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Visit Setup */}
        <Card>
          <CardHeader>
            <CardTitle>Start New Visit</CardTitle>
            <CardDescription>
              Select patient and doctor to begin visit documentation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Select Patient
                </label>
                <div className="relative">
                  <input
                    className="w-full border rounded px-3 py-2 text-sm"
                    placeholder="Search name, phone, or email"
                    value={patientQuery}
                    onChange={(e) => { setPatientQuery(e.target.value); setShowPatientMenu(true); }}
                    onFocus={() => setShowPatientMenu(true)}
                  />
                  {showPatientMenu && (
                    <div className="absolute z-20 mt-1 w-full bg-white border rounded shadow max-h-64 overflow-auto">
                      {searchingPatients && (
                        <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
                      )}
                      {!searchingPatients && patientOptions.length === 0 && (
                        <div className="px-3 py-2 text-xs text-gray-500">No results</div>
                      )}
                      {!searchingPatients && patientOptions.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedPatientId(p.id);
                            setPatientQuery(p.name || p.phone || p.email || p.id);
                            setShowPatientMenu(false);
                          }}
                          className={`w-full text-left px-3 py-2 hover:bg-gray-50 text-sm ${selectedPatientId === p.id ? 'bg-gray-50' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            <div className="flex flex-col">
                              <span className="font-medium">{p.name || `Patient ${p.id?.slice(-4) || ''}`}</span>
                              <div className="flex items-center gap-3 text-xs text-gray-500">
                                <span>ID: {p.id}</span>
                                {p.phone && <span>📞 {p.phone}</span>}
                                {p.email && <span>✉️ {p.email}</span>}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Select Doctor
                </label>
                <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a doctor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((doctor) => (
                      <SelectItem key={doctor.id} value={doctor.id}>
                        <div className="flex items-center gap-2">
                          <Stethoscope className="h-4 w-4" />
                          <span>
                            Dr. {doctor.firstName} {doctor.lastName}
                            {doctor.specialization && (
                              <span className="text-xs text-gray-500 ml-2">
                                {doctor.specialization}
                              </span>
                            )}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Patient History Tab - Always visible when patient is selected */}
            {selectedPatientId && (
              <div className="mt-6">
                <Tabs defaultValue="ready" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="ready">Ready to Start</TabsTrigger>
                    <TabsTrigger value="history">Patient History</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="ready" className="mt-4">
                    {selectedDoctorId && (
                      <div className="pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-medium text-gray-900">Ready to start visit</h4>
                            <p className="text-xs text-gray-500 mt-1">
                              Patient: {selectedPatient?.name ?? 'Unknown'} • 
                              Doctor: Dr. {selectedDoctor?.firstName} {selectedDoctor?.lastName}
                            </p>
                          </div>
                          <Button onClick={startNewVisit}>
                            Start Visit Documentation
                          </Button>
                        </div>
                      </div>
                    )}
                    {!selectedDoctorId && (
                      <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <p className="text-sm text-yellow-800">Please select a doctor to start the visit.</p>
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="history" className="mt-4">
                    <PatientHistoryTimeline patientId={selectedPatientId} />
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Role-based Features Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Available Features</CardTitle>
            <CardDescription>
              Features available for your role: {roleInfo.label}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentUserRole === 'THERAPIST' && (
                <>
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                    <Stethoscope className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium text-blue-700">Vitals Recording</p>
                      <p className="text-xs text-blue-600">BP, HR, Temperature, etc.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                    <User className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium text-blue-700">Photo Capture</p>
                      <p className="text-xs text-blue-600">Document patient conditions</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                    <Users className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium text-blue-700">Basic Assessment</p>
                      <p className="text-xs text-blue-600">Initial observations</p>
                    </div>
                  </div>
                </>
              )}

              {currentUserRole === 'NURSE' && (
                <>
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                    <Stethoscope className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium text-green-700">Full Vitals</p>
                      <p className="text-xs text-green-600">Complete vital signs</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                    <User className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium text-green-700">Photo & Complaints</p>
                      <p className="text-xs text-green-600">Document and record issues</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                    <Users className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium text-green-700">Assessment Notes</p>
                      <p className="text-xs text-green-600">Preliminary findings</p>
                    </div>
                  </div>
                </>
              )}

              {currentUserRole === 'DOCTOR' && (
                <>
                  <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                    <Stethoscope className="h-5 w-5 text-purple-500" />
                    <div>
                      <p className="text-sm font-medium text-purple-700">Complete Documentation</p>
                      <p className="text-xs text-purple-600">Full SOAP notes</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                    <User className="h-5 w-5 text-purple-500" />
                    <div>
                      <p className="text-sm font-medium text-purple-700">Dermatology Specific</p>
                      <p className="text-xs text-purple-600">Specialized assessments</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                    <Users className="h-5 w-5 text-purple-500" />
                    <div>
                      <p className="text-sm font-medium text-purple-700">Treatment Planning</p>
                      <p className="text-xs text-purple-600">Complete care plans</p>
                    </div>
                  </div>
                </>
              )}
        </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-gray-900">Visit Documentation</h1>
            {appointmentData && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                <Calendar className="h-3 w-3 mr-1" />
                From Appointment
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-600">
            Patient: {selectedPatient?.name ?? 'Unknown'} • 
            Doctor: Dr. {selectedDoctor?.firstName} {selectedDoctor?.lastName}
            {appointmentData && (
              <span className="ml-2 text-blue-600">
                • {appointmentData.slot} • {appointmentData.visitType}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {appointmentData && (
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Calendar
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowForm(false)}>
            Back to Setup
          </Button>
        </div>
      </div>

      <MedicalVisitForm 
        patientId={selectedPatientId} 
        doctorId={selectedDoctorId}
        userRole={currentUserRole}
        patientName={selectedPatient?.name || ''}
        visitDate={new Date().toISOString()}
        appointmentId={appointmentData?.id}
        appointmentData={appointmentData}
      />
      
      {recentVisitId && <PhotosPanel visitId={recentVisitId} />}
    </div>
  );
}

export default function VisitsPage() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <VisitsPageInner />
    </Suspense>
  );
} 