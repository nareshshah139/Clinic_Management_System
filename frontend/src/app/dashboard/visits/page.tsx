'use client';

import { displayClinicDateTime, displayUtcDate } from '@/lib/date-display';

type PrescriptionSummaryProps = {
  prescription: unknown;
  onPrint?: () => void;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}


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
    prescriptionNumber: typeof prescription.prescriptionNumber === 'string' ? prescription.prescriptionNumber : undefined,
    createdAt: displayClinicDateTime(prescription.createdAt as string | Date | undefined, '') || null,
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
    reviewDate: displayUtcDate((prescription as Record<string, unknown>).reviewDate as string | Date | undefined, '') || null,
    metadata: isPlainObject(prescription.metadata) ? prescription.metadata : undefined,
    items,
  };
}

function PrescriptionSummary({ prescription, onPrint }: PrescriptionSummaryProps) {
  const normalized = normalizePrescription(prescription);

  if (!normalized) {
    return <p className="text-sm text-destructive-text">Unable to display prescription data.</p>;
  }

  const {
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
        <h3 className="text-lg font-medium text-foreground">Prescription Overview</h3>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {prescriptionNumber && (
            <div>
              <span className="text-muted-foreground">Prescription #:</span>
              <span className="ml-2 text-foreground">{prescriptionNumber}</span>
            </div>
          )}
          {status && (
            <div>
              <span className="text-muted-foreground">Status:</span>
              <span className="ml-2 text-foreground capitalize">{status.toLowerCase()}</span>
            </div>
          )}
          {createdAt && (
            <div>
              <span className="text-muted-foreground">Created:</span>
              <span className="ml-2 text-foreground">{createdAt}</span>
            </div>
          )}
          {reviewDate && (
            <div>
              <span className="text-muted-foreground">Review Date:</span>
              <span className="ml-2 text-foreground">{reviewDate}</span>
            </div>
          )}
          {doctor && (
            <div>
              <span className="text-muted-foreground">Doctor:</span>
              <span className="ml-2 text-foreground">{doctor}</span>
            </div>
          )}
          {patient && (
            <div>
              <span className="text-muted-foreground">Patient:</span>
              <span className="ml-2 text-foreground">{patient}</span>
            </div>
          )}
        </div>
      </div>

      <div>
        <h4 className="text-md font-medium text-foreground">Medications</h4>
        {items.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No medication items recorded.</p>
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
                <div key={idx} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-foreground">{name}</p>
                      <p className="text-sm text-muted-foreground">
                        {dosage && <span className="mr-2">Dosage: {dosage}</span>}
                        {frequency && <span className="mr-2">Frequency: {prescriptionLabel('frequency', frequency)}</span>}
                        {duration && <span className="mr-2">Duration: {duration} {prescriptionLabel('durationUnit', durationUnit)}</span>}
                      </p>
                      {instructionsText && (
                        <p className="text-sm text-foreground mt-1">Instructions: {instructionsText}</p>
                      )}
                      {additional.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
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
              <h4 className="text-md font-medium text-foreground">Notes</h4>
              <p className="mt-1 text-sm text-foreground whitespace-pre-line">{notes}</p>
            </div>
          )}
          {instructions && (
            <div>
              <h4 className="text-md font-medium text-foreground">General Instructions</h4>
              <p className="mt-1 text-sm text-foreground whitespace-pre-line">{instructions}</p>
            </div>
          )}
          {pharmacistNotes && (
            <div>
              <h4 className="text-md font-medium text-foreground">Pharmacist Notes</h4>
              <p className="mt-1 text-sm text-foreground whitespace-pre-line">{pharmacistNotes}</p>
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

import { LoadingSkeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { isValidId } from '@/lib/id';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ensureGlobalPrintStyles } from '@/lib/printStyles';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { usePatientHistory } from '@/components/visits/usePatientHistory';
import PatientHistoryVisitCard from '@/components/visits/PatientHistoryVisitCard';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { User, Users, Stethoscope, FileText, Calendar, Activity, ArrowLeft } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { prescriptionLabel } from '@/lib/prescription-labels';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { QuickGuide } from '@/components/common/QuickGuide';
import { UserRole } from '@cms/shared-types';
import { resolveDefaultDoctorId } from '@/lib/default-visit-doctor';
import { VisitIdentityBar } from '@/components/visits/VisitIdentityBar';
import { useRecordById, type RecordState } from '@/components/visits/useRecordById';
import type {
  Appointment,
  GetPatientsResponse,
  GetUsersResponse,
  Patient,
  PatientVisitHistoryResponse,
  User as UserSummary,
  VisitTimelineEntry,
} from '@/lib/types';

type AppointmentWithVisit = Appointment & { visit?: { id: string } | null };
type DoctorSummary = UserSummary & { specialization?: string };
type PatientMatch = Patient & { name?: string };

const fetchPatientById = (id: string) => apiClient.getPatient(id);
const fetchDoctorById = (id: string) => apiClient.getUser(id);

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

// Patient History Timeline Component
function PatientHistoryTimeline({ patientId }: { patientId: string }) {
  const { entries: history, loading, error: historyError, refresh } = usePatientHistory(patientId);
  const [viewingPrescription, setViewingPrescription] = useState<{
    visitId: string;
    prescriptionId: string;
  } | null>(null);
  const [prescriptionsCache, setPrescriptionsCache] = useState<Record<string, unknown>>({});
  const [prescriptionLoading, setPrescriptionLoading] = useState(false);
  const [prescriptionError, setPrescriptionError] = useState<string | null>(null);

  if (historyError) return <div role="alert" className="p-4 text-destructive-text">Unable to load patient history. {historyError} <Button onClick={() => void refresh()}>Retry</Button></div>;

  if (loading) {
    return (
      <LoadingSkeleton label="Loading visit history…" />
    );
  }

  if (!patientId) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
        <p>Select a patient to view their visit history</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
        <p>No documented history to show</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-foreground">Patient History</h3><Button variant="outline" onClick={() => void refresh()}>Refresh</Button>
        <Badge variant="secondary">{history.length} Records</Badge>
      </div>
      
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-muted"></div>
        
        {/* Timeline items */}
        <div className="space-y-6">
          {history.map((visit, index) => {
            const isProcedure = JSON.stringify(visit.scribeJson ?? visit.visitType ?? '')
              .toLowerCase()
              .includes('procedure');
            const hasPrescription = !!visit.prescription?.id;
            
            return (
              <div key={visit.id} className="relative flex items-start space-x-4">
                {/* Timeline dot */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                  index === 0 
                    ? 'bg-info-soft border-info text-info-text'
                    : 'bg-muted border-border text-muted-foreground'
                }`}>
                  {isProcedure ? (
                    <Activity className="h-4 w-4" />
                  ) : (
                    <Stethoscope className="h-4 w-4" />
                  )}
                </div>
                
                {/* Visit details */}
                <div className="flex-1 min-w-0">
                  <PatientHistoryVisitCard
                    visit={visit as unknown as Record<string, unknown>}
                    visitLabel={visit.entryType === 'appointment' ? 'Appointment' : index === 0 ? 'Most recent record' : undefined}
                    highlight={index === 0}
                    onResume={
                      visit.id
                        ? () => {
                            window.location.href = `/dashboard/visits?visitId=${encodeURIComponent(visit.id)}`;
                          }
                        : undefined
                    }
                    footerActions={
                      hasPrescription ? (
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
                                  setPrescriptionsCache((prev) => ({
                                    ...prev,
                                    [prescriptionId]: data,
                                  }));
                                })
                                .catch((error: unknown) => {
                                  console.error('Failed to load prescription', error);
                                  setPrescriptionError(
                                    'Unable to load prescription. Please try again.'
                                  );
                                })
                                .finally(() => {
                                  setPrescriptionLoading(false);
                                });
                            }
                          }}
                        >
                          View Prescription
                        </Button>
                      ) : undefined
                    }
                  />
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

          {prescriptionLoading && <p className="text-sm text-muted-foreground">Loading prescription…</p>}
          {prescriptionError && <p className="text-sm text-destructive-text">{prescriptionError}</p>}

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
  const [chosenDoctorId, setChosenDoctorId] = useState<string>('');
  const { user: signedInUser, loading: userLoading } = useDashboardUser();
  const currentUser: { id?: string; role?: string } | null = userLoading ? null : { id: signedInUser?.id, role: signedInUser?.role };
  const currentUserRole = signedInUser?.role ?? UserRole.DOCTOR;
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Autocomplete state for patients
  const [patientQuery, setPatientQuery] = useState('');
  const [patientOptions, setPatientOptions] = useState<PatientMatch[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [showPatientMenu, setShowPatientMenu] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [appointmentData, setAppointmentData] = useState<AppointmentWithVisit | null>(null);
  const [appointmentFailed, setAppointmentFailed] = useState(false);
  const [startedVisitId, setStartedVisitId] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const urlPatientId = searchParams.get('patientId');
  const appointmentIdParam = searchParams.get('appointmentId');
  const urlDoctorId = searchParams.get('doctorId');
  const urlVisitId = searchParams.get('visitId');

  /**
   * @cc [owner:nareshshah139,label:product] visit-appointment-follows-patient
   * The appointment from the URL or the resumed visit applies exactly while its patient is selected.
   * Picking another patient detaches it; picking its patient again restores it, so the visit saves
   * with its appointment link.
   */
  const appointmentPatientId = appointmentData?.patientId ?? urlPatientId;
  const appointmentActive = Boolean(selectedPatientId) && selectedPatientId === appointmentPatientId;
  const activeAppointment = appointmentActive ? appointmentData : null;
  const appointmentDoctorId = activeAppointment?.doctorId;
  const appointmentPending = Boolean(
    appointmentActive && appointmentIdParam && !appointmentData && !appointmentFailed,
  );
  const selectedDoctorId = resolveDefaultDoctorId({
    role: currentUser?.role,
    userId: currentUser?.id,
    current: chosenDoctorId,
    appointmentDoctorId,
    appointmentPending,
  });

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

  /**
   * @cc [owner:nareshshah139,label:product] visits-doctor-pages
   * The visit doctor picker MUST load every page of the branch doctor list; a failed page
   * MUST fail the load rather than silently present a partial list.
   */
  const loadDoctors = useCallback(async () => {
    const doctorsById = new Map<string, DoctorSummary>();
    let page = 1;
    let totalPages = 1;
    do {
      const response = await apiClient.get<GetUsersResponse & { pagination?: { totalPages: number } }>(
        '/users', { role: 'DOCTOR', page, limit: 100 },
      );
      extractDoctors(response).forEach((doctor) => doctorsById.set(doctor.id, doctor));
      const count = response.pagination?.totalPages;
      if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) totalPages = count;
      page += 1;
    } while (page <= totalPages);
    return Array.from(doctorsById.values());
  }, [extractDoctors]);

  const fetchAppointmentData = useCallback(async (appointmentId: string) => {
    try {
      const appointment = await apiClient.getAppointment<AppointmentWithVisit>(appointmentId);
      setAppointmentData(appointment);
    } catch (error) {
      console.error('Failed to fetch appointment data:', error);
      setAppointmentFailed(true);
    }
  }, []);

  const deepLinked = Boolean(urlPatientId || urlVisitId);
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [patientsRes, usersRes] = await Promise.allSettled([
        deepLinked ? Promise.resolve([]) : apiClient.getPatients({ page: 1, limit: 1 }),
        loadDoctors()
      ]);

      if (patientsRes.status === 'fulfilled') {
        const patientsData = extractPatients(patientsRes.value);
        setPatients(patientsData);
        setPatientOptions(patientsData.slice(0, 10));
        if (patientsData.length > 0) {
          setSelectedPatientId((prev) => {
            if (prev) return prev;
            if (urlPatientId && isValidId(urlPatientId)) return urlPatientId;
            return ''; // Require an explicit patient selection on the setup screen.
          });
        }
      }

      if (usersRes.status === 'fulfilled') {
        const doctorsData = usersRes.value;
        setDoctors(doctorsData);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [loadDoctors, extractPatients, urlPatientId, deepLinked]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Deep links open documentation; selecting a patient in setup keeps history accessible.
  useEffect(() => {
    if (urlPatientId && selectedPatientId === urlPatientId && selectedDoctorId) {
      setShowForm(true);
    }
  }, [selectedPatientId, selectedDoctorId, urlPatientId]);

  // Handle URL parameters for appointment linking
  useEffect(() => {
    if (urlPatientId) {
      setSelectedPatientId(urlPatientId);
      if (urlDoctorId && isValidId(urlDoctorId)) {
        setChosenDoctorId(urlDoctorId);
      }
      if (appointmentIdParam) {
        void fetchAppointmentData(appointmentIdParam);
      }
    }
  }, [appointmentIdParam, fetchAppointmentData, urlDoctorId, urlPatientId]);

  // Handle direct visit resume via visitId in URL
  useEffect(() => {
    const run = async () => {
      if (!urlVisitId || !isValidId(urlVisitId)) return;
      try {
        const visit: any = await apiClient.get(`/visits/${urlVisitId}`);
        const pid = visit?.patient?.id;
        const did = visit?.doctor?.id;
        if (typeof pid === 'string') setSelectedPatientId(pid);
        if (typeof did === 'string') setChosenDoctorId(did);
        // Populate appointment context if present (non-blocking)
        const apptId = visit?.appointment?.id;
        if (typeof apptId === 'string') {
          try {
            const appt = await apiClient.getAppointment<AppointmentWithVisit>(apptId);
            setAppointmentData(appt);
          } catch {}
        }
        setShowForm(true);
      } catch (e) {
        // If visit fetch fails, ignore and proceed with normal flow
        console.warn('[VisitsPage] Failed to load visit by id', e);
      }
    };
    void run();
  }, [urlVisitId]);

  // Debounced search for patients
  const landingVisible = !loading && !userLoading && !showForm;
  useEffect(() => {
    if (!landingVisible) return;
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
  }, [extractPatients, patientQuery, landingVisible]);

  const selectedPatient = useRecordById<PatientMatch>(selectedPatientId, fetchPatientById);
  const listedDoctor = doctors.find((doctor) => doctor.id === selectedDoctorId);
  const fetchedDoctor = useRecordById<DoctorSummary>(listedDoctor ? '' : selectedDoctorId, fetchDoctorById);
  const selectedDoctor: RecordState<DoctorSummary> = listedDoctor ? { status: 'ready', record: listedDoctor } : fetchedDoctor;

  const doctorNameById = (id: string | undefined) => {
    const doctor = doctors.find((d) => d.id === id);
    return doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}`.trim() : undefined;
  };
  const selectedDoctorName =
    doctorNameById(selectedDoctorId) ??
    (selectedDoctor.status === 'ready'
      ? `Dr. ${selectedDoctor.record.firstName} ${selectedDoctor.record.lastName}`.trim()
      : undefined);
  const bookedWithName =
    appointmentDoctorId &&
    currentUser?.role === UserRole.DOCTOR &&
    currentUser.id &&
    currentUser.id !== appointmentDoctorId
      ? doctorNameById(appointmentDoctorId)
      : undefined;

  const visitAlreadyStarted = Boolean(
    urlVisitId || startedVisitId || (activeAppointment?.visit && 'id' in activeAppointment.visit),
  );
  const doctorLocked = Boolean(appointmentDoctorId) || visitAlreadyStarted;

  const pickPatient = (id: string) => {
    if (id !== selectedPatientId) setStartedVisitId(null);
    setSelectedPatientId(id);
  };

  const startNewVisit = () => {
    if (selectedPatientId && selectedDoctorId) {
      setShowForm(true);
    }
  };
 
  if (loading || userLoading) {
    return (
      <LoadingSkeleton variant="cards" label="Loading visit form…" />
    );
  }
 
  if ((!deepLinked && !patients.some(patient => patient.id)) || !doctors.some(doctor => doctor.id)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Setup Required</CardTitle>
          <CardDescription>
            No patients or doctors found. Please add at least one to create a visit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {!deepLinked && patients.length === 0 && (
              <div className="flex items-center gap-3 p-3 bg-destructive-soft rounded-lg">
                <Users className="h-5 w-5 text-destructive" />
                <div>
                  <p className="text-sm font-medium text-destructive-text">No patients found</p>
                  <p className="text-xs text-destructive-text">Add at least one patient to create visits</p>
                </div>
              </div>
            )}
            
            {doctors.length === 0 && (
              <div className="flex items-center gap-3 p-3 bg-destructive-soft rounded-lg">
                <Stethoscope className="h-5 w-5 text-destructive" />
                <div>
                  <p className="text-sm font-medium text-destructive-text">No doctors found</p>
                  <p className="text-xs text-destructive-text">Add at least one doctor to create visits</p>
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
        {/* Header with Guide */}
        <PageHeader title={<>Visit Documentation</>} description={<>Create and manage patient visits with role-based documentation</>} actions={<><QuickGuide
            title="Visit Documentation Guide"
            sections={[
              {
                title: "Starting a Visit",
                items: [
                  "Select a patient from the search bar or dropdown",
                  "Choose the consulting doctor",
                  "View patient history in the 'Patient History' tab",
                  "Click 'Start Visit Documentation' to begin"
                ]
              },
              {
                title: "Role-Based Access",
                items: [
                  "Nurse: Record vitals, photos, complaints, and assessments",
                  "Doctor: Complete SOAP documentation and prescriptions",
                  "Each role sees features appropriate to their scope"
                ]
              },
              {
                title: "Visit Documentation",
                items: [
                  "Follow the SOAP format: Subjective, Objective, Assessment, Plan",
                  "Record vitals, complaints, examination findings",
                  "Add dermatology-specific assessments and procedures",
                  "Create prescriptions with medications and instructions",
                  "Upload photos to document patient condition",
                  "Set follow-up appointments and review dates"
                ]
              },
              {
                title: "Patient History",
                items: [
                  "View complete timeline of past visits",
                  "See previous diagnoses and treatments",
                  "Access past prescriptions and photos",
                  "Resume incomplete visits from history",
                  "Track patient progress over time"
                ]
              }
            ]}
          /></>} />
        
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
                <label htmlFor="visit-landing-patient" className="text-sm font-medium text-foreground mb-2 block">
                  Select Patient
                </label>
                <div className="relative">
                  <input id="visit-landing-patient"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={showPatientMenu}
                    aria-controls="visit-landing-patient-options"
                    aria-activedescendant={showPatientMenu && patientOptions[highlightedIndex] ? `visit-landing-patient-option-${highlightedIndex}` : undefined}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    placeholder="Search name, phone, or email"
                    value={patientQuery}
                    onChange={(e) => { setPatientQuery(e.target.value); setShowPatientMenu(true); setHighlightedIndex(0); }}
                    onFocus={() => setShowPatientMenu(true)}
                    onKeyDown={(e) => {
                      if (!showPatientMenu) return;
                      const max = patientOptions.length;
                      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex(i => Math.min(max - 1, i + 1)); }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex(i => Math.max(0, i - 1)); }
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const sel = patientOptions[highlightedIndex];
                        if (sel) {
                          pickPatient(sel.id);
                          setPatientQuery(sel.name || sel.phone || sel.email || sel.id);
                          setShowPatientMenu(false);
                        }
                      }
                      if (e.key === 'Escape') { setShowPatientMenu(false); }
                    }}
                  />
                  {showPatientMenu && (
                    <div className="absolute z-20 mt-1 w-full bg-white border rounded-md shadow-sm max-h-64 overflow-auto">
                      {searchingPatients && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
                      )}
                      {!searchingPatients && patientOptions.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">No results</div>
                      )}
                      <div id="visit-landing-patient-options" role="listbox" aria-label="Patients">
                      {!searchingPatients && patientOptions.map((p, idx) => (
                        <button
                          key={p.id}
                          id={`visit-landing-patient-option-${idx}`}
                          type="button"
                          role="option"
                          aria-selected={idx === highlightedIndex}
                          tabIndex={-1}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          onClick={() => {
                            pickPatient(p.id);
                            setPatientQuery(p.name || p.phone || p.email || p.id);
                            setShowPatientMenu(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm ${selectedPatientId === p.id ? 'bg-muted' : ''} ${idx === highlightedIndex ? 'bg-info-soft' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            <div className="flex flex-col">
                              <span className="font-medium">{p.name || `Patient ${p.id?.slice(-4) || ''}`}</span>
                              <div className="flex items-center gap-3 text-xs text-foreground/70">
                                {p.phone && <span>{p.phone}</span>}
                                {p.email && <span>{p.email}</span>}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="visit-landing-doctor" className="text-sm font-medium text-foreground mb-2 block">
                  Select Doctor
                </label>
                <Select value={selectedDoctorId} onValueChange={setChosenDoctorId} disabled={doctorLocked}>
                  <SelectTrigger id="visit-landing-doctor">
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
                              <span className="text-xs text-muted-foreground ml-2">
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
                            <h3 className="text-sm font-medium text-foreground">Ready to start visit</h3>
                            <VisitIdentityBar
                              className="mt-1 !text-xs !text-muted-foreground"
                              patient={selectedPatient}
                              doctor={selectedDoctor}
                            />
                          </div>
                          <Button onClick={startNewVisit}>
                            Start Visit Documentation
                          </Button>
                        </div>
                      </div>
                    )}
                    {!selectedDoctorId && (
                      <div className="p-4 bg-warning-soft rounded-lg border border-warning-border">
                        <p className="text-sm text-warning-text">Please select a doctor to start the visit.</p>
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
      </div>
    );
  }

  return (
    <MedicalVisitForm
      key={`${selectedPatientId}:${urlVisitId || activeAppointment?.id || "new"}`}
      patientId={selectedPatientId}
      doctorId={selectedDoctorId}
      doctorName={selectedDoctorName}
      userRole={currentUserRole}
      patient={selectedPatient.status === 'ready' ? selectedPatient.record : null}
      doctorRecord={listedDoctor ?? null}
      visitDate={new Date().toISOString()}
      appointmentId={activeAppointment?.id}
      appointmentData={activeAppointment}
      onVisitIdChange={setStartedVisitId}
      initialVisitId={urlVisitId || (activeAppointment?.visit && 'id' in activeAppointment.visit ? activeAppointment.visit.id : undefined)}
      identity={
        <>
          <h1 className="sr-only">Visit Documentation</h1>
          <Button variant="ghost" size="icon" className="-ml-2 h-8 w-8" aria-label="Back to Setup" title="Back to setup" onClick={() => setShowForm(false)}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <VisitIdentityBar className="min-w-0 truncate" patient={selectedPatient} doctor={selectedDoctor} appointment={activeAppointment} hideDoctor />
        </>
      }
      doctorControl={
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="visit-doctor" className="text-sm font-medium text-foreground">
            Attending doctor
          </label>
          <Select value={selectedDoctorId} onValueChange={setChosenDoctorId} disabled={doctorLocked}>
            <SelectTrigger id="visit-doctor" className="h-9 w-60" aria-label="Attending doctor">
              <SelectValue placeholder="Choose a doctor..." />
            </SelectTrigger>
            <SelectContent>
              {doctors.map((doctor) => (
                <SelectItem key={doctor.id} value={doctor.id}>
                  Dr. {doctor.firstName} {doctor.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bookedWithName && (
            <span className="text-sm text-muted-foreground">
              Booked with {bookedWithName}. Change the appointment&apos;s doctor to see this patient yourself.
            </span>
          )}
        </div>
      }
      visitActions={activeAppointment ? (
        <DropdownMenuItem onSelect={() => window.history.back()}>
          <Calendar className="mr-2 h-4 w-4" aria-hidden="true" />
          Back to calendar
        </DropdownMenuItem>
      ) : null}
    />
  );
}

export default function VisitsPage() {
  useEffect(() => { ensureGlobalPrintStyles(); }, []);
  return (
    <Suspense fallback={<LoadingSkeleton label="Loading visits…" />}>
      <VisitsPageInner />
    </Suspense>
  );
} 
