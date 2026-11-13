'use client';

import { LoadingSkeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { isValidId } from '@/lib/id';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getGlobalPrintStyleTag } from '@/lib/printStyles';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import PatientProgressTracker from '@/components/patients/PatientProgressTracker';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { User, Users, Stethoscope, Calendar, ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { QuickGuide } from '@/components/common/QuickGuide';
import { formatPatientName } from '@/lib/utils';
import { VisitIdentityBar } from '@/components/visits/VisitIdentityBar';
import { useRecordById } from '@/components/visits/useRecordById';
import { PatientHistoryTimeline } from '@/components/visits/PatientHistoryTimeline';
import PatientPicker from '@/components/visits/PatientPicker';
import type {
  Appointment,
  GetPatientsResponse,
  GetUsersResponse,
  Patient,
  User as UserSummary,
} from '@/lib/types';

type AppointmentWithVisit = Appointment & { visit?: { id: string } | null };
type DoctorSummary = UserSummary & { specialization?: string };
type PatientMatch = Patient & { name?: string };

const fetchPatientById = (id: string) => apiClient.getPatient(id);
const fetchDoctorById = (id: string) => apiClient.getUser(id);

type FormSaveStatus = 'idle' | 'unsaved' | 'autosaving' | 'saved' | 'saving' | 'error';
type VisitBinding = { patientId: string; doctorId: string; visitId?: string; appointment?: AppointmentWithVisit };
type LinkNotice = { text: string; patientId: string };

const LINK_NOTICES = {
  visit: 'That visit could not be opened. Search for the patient to continue.',
  patient: 'That patient could not be loaded. Search for the patient to continue.',
  appointment: 'That appointment could not be opened. Search for the patient to continue.',
} as const;
const UNSAVED_STATUSES: FormSaveStatus[] = ['unsaved', 'saving', 'autosaving', 'error'];

const clearVisitLink = () => {
  if (window.location.search) window.history.replaceState(null, '', '/dashboard/visits');
};


function VisitsPageInner() {
  const [patients, setPatients] = useState<PatientMatch[]>([]);
  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [currentUserRole, setCurrentUserRole] = useState<string>('DOCTOR');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [binding, setBinding] = useState<VisitBinding | null>(null);
  const [linkNotice, setLinkNotice] = useState<LinkNotice | null>(null);
  const [openRequestPatientId, setOpenRequestPatientId] = useState<string | null>(null);
  const [formSaveStatus, setFormSaveStatus] = useState<FormSaveStatus>('idle');
  const [pendingLeave, setPendingLeave] = useState<'setup' | 'calendar' | null>(null);
  const [formSession, setFormSession] = useState({ key: '', visitDate: '' });
  const processedLinkRef = useRef<string | null>(null);
  const currentLinkRef = useRef('');
  const selectedPatientIdRef = useRef(selectedPatientId);
  selectedPatientIdRef.current = selectedPatientId;
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  // The form reports 'unsaved' on an untouched new visit (and keeps it, since autosave needs a
  // visitId), so the leave dialog also requires an edit by the user during this form session.
  const formTouchedRef = useRef(false);

  const [loadError, setLoadError] = useState(false);

  const searchParams = useSearchParams();

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

  const failLink = useCallback((text: string, patientId: string = selectedPatientIdRef.current) => {
    setShowForm(false);
    setOpenRequestPatientId(null);
    setBinding(null);
    setSelectedPatientId(patientId);
    setLinkNotice({ text, patientId });
    clearVisitLink();
  }, []);

  const openBoundVisit = useCallback((next: VisitBinding) => {
    setSelectedPatientId(next.patientId);
    setSelectedDoctorId(next.doctorId);
    setBinding(next);
    setLinkNotice(null);
    setOpenRequestPatientId(null);
    setShowForm(true);
  }, []);

  const processVisitLink = useCallback(async (params: URLSearchParams, isCurrent: () => boolean) => {
    const visitId = params.get('visitId');
    const patientId = params.get('patientId') || undefined;
    const doctorId = params.get('doctorId');
    const appointmentId = params.get('appointmentId');
    const fetchAppointment = (id: string) =>
      apiClient.getAppointment<AppointmentWithVisit>(id).catch((error) => {
        console.warn('[VisitsPage] Failed to load appointment', error);
        return null;
      });

    if (visitId) {
      if (!isValidId(visitId)) {
        failLink(LINK_NOTICES.visit, patientId);
        return;
      }
      try {
        const visit = await apiClient.get<{ patient?: { id?: string }; doctor?: { id?: string }; appointment?: { id?: string } | null }>(`/visits/${visitId}`);
        const visitPatientId = visit?.patient?.id;
        let visitDoctorId = visit?.doctor?.id;
        if (!visitPatientId || !visitDoctorId) throw new Error('Visit has no patient or doctor');
        const linkedAppointmentId = visit.appointment?.id || appointmentId;
        const fetched = linkedAppointmentId ? await fetchAppointment(linkedAppointmentId) : null;
        const appointment = fetched && fetched.patientId === visitPatientId ? fetched : undefined;
        if (appointment?.doctorId) visitDoctorId = appointment.doctorId;
        if (!isCurrent()) return;
        openBoundVisit({ patientId: visitPatientId, doctorId: visitDoctorId, visitId, appointment });
      } catch (error) {
        console.warn('[VisitsPage] Failed to load visit by id', error);
        if (isCurrent()) failLink(LINK_NOTICES.visit, patientId);
      }
      return;
    }

    if (patientId) {
      setLinkNotice(null);
      setSelectedPatientId(patientId);
      if (doctorId && isValidId(doctorId)) setSelectedDoctorId(doctorId);
      const fetched = appointmentId ? await fetchAppointment(appointmentId) : null;
      if (!isCurrent()) return;
      if (fetched && fetched.patientId === patientId && fetched.doctorId) {
        openBoundVisit({ patientId, doctorId: fetched.doctorId, visitId: fetched.visit?.id, appointment: fetched });
        return;
      }
      setBinding(null);
      setOpenRequestPatientId(patientId);
      return;
    }

    if (appointmentId) {
      const appointment = await fetchAppointment(appointmentId);
      if (!isCurrent()) return;
      if (!appointment?.patientId || !appointment.doctorId) {
        failLink(LINK_NOTICES.appointment);
        return;
      }
      openBoundVisit({ patientId: appointment.patientId, doctorId: appointment.doctorId, visitId: appointment.visit?.id, appointment });
    }
  }, [failLink, openBoundVisit]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [patientsRes, usersRes, meRes] = await Promise.allSettled([
        apiClient.getPatients({ page: 1, limit: 1 }),
        loadDoctors(),
        apiClient.get<{ id?: string; role?: string }>('/auth/me'),
      ]);

      if (patientsRes.status === 'rejected' || usersRes.status === 'rejected') {
        console.error('Failed to load visit setup:', patientsRes.status === 'rejected' ? patientsRes.reason : (usersRes as PromiseRejectedResult).reason);
        setLoadError(true);
        return;
      }

      const patientsData = extractPatients(patientsRes.value);
      setPatients(patientsData);

      const doctorsData = usersRes.value;
      setDoctors(doctorsData);
      if (doctorsData.length > 0) {
        const meId = meRes.status === 'fulfilled' ? meRes.value?.id : undefined;
        const signedIn = meId ? doctorsData.find((doctor) => doctor.id === meId)?.id : undefined;
        const candidate = signedIn || doctorsData[0]?.id;
        if (!candidate) {
          console.warn('[VisitsPage] First doctor missing id, requiring manual selection');
        }
        setSelectedDoctorId((prev) => prev || (candidate || ''));
      }

      if (meRes.status === 'fulfilled') {
        setCurrentUserRole(meRes.value?.role ?? 'DOCTOR');
      } else {
        console.error('Failed to get current user:', meRes.reason);
        setCurrentUserRole('DOCTOR');
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [loadDoctors, extractPatients]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Each distinct query string is processed once. Strict Mode re-runs this effect, so in-flight
  // work is never cancelled from a cleanup; stale results are dropped by comparing query strings.
  const linkQuery = searchParams.toString();
  useEffect(() => {
    currentLinkRef.current = linkQuery;
    if (processedLinkRef.current === linkQuery) return;
    processedLinkRef.current = linkQuery;
    if (!linkQuery) return;
    void processVisitLink(new URLSearchParams(linkQuery), () => currentLinkRef.current === linkQuery);
  }, [linkQuery, processVisitLink]);

  useEffect(() => {
    if (linkNotice && linkNotice.patientId !== selectedPatientId) setLinkNotice(null);
  }, [linkNotice, selectedPatientId]);

  const selectedPatient = useRecordById<PatientMatch>(selectedPatientId, fetchPatientById);
  const selectedDoctor = useRecordById<DoctorSummary>(selectedDoctorId, fetchDoctorById);

  // A patient link opens the form once, as soon as a doctor is known.
  useEffect(() => {
    if (!openRequestPatientId || openRequestPatientId !== selectedPatientId || !selectedDoctorId) return;
    setOpenRequestPatientId(null);
    setShowForm(true);
  }, [openRequestPatientId, selectedPatientId, selectedDoctorId]);

  useEffect(() => {
    if (selectedPatient.status !== 'missing') return;
    if (!showForm && openRequestPatientId !== selectedPatientId) return;
    failLink(LINK_NOTICES.patient, '');
  }, [selectedPatient.status, showForm, openRequestPatientId, selectedPatientId, failLink]);

  /**
   * @cc [owner:nareshshah139,label:product] visit-form-patient-binding
   * The visit form MUST receive a linked visit or appointment only while the selected
   * patient and doctor are the ones that visit or appointment belongs to; otherwise it
   * MUST open as a new visit.
   */
  const bindingApplies = binding !== null && binding.patientId === selectedPatientId && binding.doctorId === selectedDoctorId;
  const boundAppointment = bindingApplies ? binding.appointment : undefined;
  const boundVisitId = bindingApplies ? binding.visitId || boundAppointment?.visit?.id || undefined : undefined;
  const formKey = `${selectedPatientId}:${boundVisitId || boundAppointment?.id || 'new'}`;

  // One visit date and a fresh save status per form opening.
  const formSessionKey = showForm ? formKey : '';
  if (formSession.key !== formSessionKey) {
    setFormSession({ key: formSessionKey, visitDate: new Date().toISOString() });
    setFormSaveStatus('idle');
    formTouchedRef.current = false;
  }

  const handleSaveStatusChange = useCallback((status: FormSaveStatus) => {
    if (status === 'saved') formTouchedRef.current = false;
    setFormSaveStatus(status);
  }, []);
  const markFormTouched = () => { formTouchedRef.current = true; };
  const markFormTouchedByClick = (event: { target: EventTarget }) => {
    if (!(event.target instanceof Element && event.target.closest('[role="tab"]'))) formTouchedRef.current = true;
  };

  const startNewVisit = () => {
    if (selectedPatientId && selectedDoctorId) {
      setLinkNotice(null);
      setOpenRequestPatientId(null);
      setShowForm(true);
    }
  };

  const leaveForm = (target: 'setup' | 'calendar') => {
    setPendingLeave(null);
    if (target === 'calendar') {
      window.history.back();
      return;
    }
    setShowForm(false);
    clearVisitLink();
  };

  const requestLeave = (target: 'setup' | 'calendar') => {
    if (formTouchedRef.current && UNSAVED_STATUSES.includes(formSaveStatus)) setPendingLeave(target);
    else leaveForm(target);
  };
 
  if (loading) {
    return (
      <LoadingSkeleton variant="cards" label="Loading visit form…" />
    );
  }
 
  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Couldn&apos;t load visit setup</CardTitle>
          <CardDescription>
            Patients or doctors could not be loaded. Check your connection and try again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="sm" onClick={() => void loadData()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (!patients.some(patient => patient.id) || !doctors.some(doctor => doctor.id)) {
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
        {/* Header with Guide */}
        <PageHeader title={<>Visit Documentation</>} description={<>Create and manage patient visits with role-based documentation</>} actions={<><QuickGuide
            title="Visit Documentation Guide"
            sections={[
              {
                title: "Starting a Visit",
                items: [
                  "Select a patient from the search bar or dropdown",
                  "Choose the consulting doctor",
                  "Review past visits below the Start button",
                  "Click 'Start Visit Documentation' to begin"
                ]
              },
              {
                title: "Role-Based Access",
                items: [
                  "Therapist: Record vitals, photos, and basic assessments (20-25%)",
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
            {linkNotice && <p role="alert" className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{linkNotice.text}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PatientPicker
                selectedPatientId={selectedPatientId}
                selectedLabel={selectedPatient.status === 'ready' ? formatPatientName(selectedPatient.record) : undefined}
                onSelect={(patient) => setSelectedPatientId(patient.id)}
                onClear={() => setSelectedPatientId('')}
              />

              <div>
                <label htmlFor="visit-doctor" className="text-sm font-medium text-gray-700 mb-2 block">
                  Select Doctor
                </label>
                <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
                  <SelectTrigger id="visit-doctor">
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

            {/* Start row and history: Start stays above the history */}
            {selectedPatientId && (
              <div className="mt-6 space-y-4">
                {selectedDoctorId ? (
                  <div className="pt-4 border-t flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">Ready to start visit</h4>
                      <VisitIdentityBar
                        className="mt-1 !text-xs !text-gray-500"
                        patient={selectedPatient}
                        doctor={selectedDoctor}
                      />
                    </div>
                    <Button className="w-full sm:w-auto" onClick={startNewVisit}>
                      Start Visit Documentation
                    </Button>
                  </div>
                ) : (
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-sm text-yellow-800">Please select a doctor to start the visit.</p>
                  </div>
                )}
                <div className="border-t pt-4">
                  <PatientHistoryTimeline patientId={selectedPatientId} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 max-w-full">
          <div className="flex flex-wrap items-center gap-2">
            <PageHeader title={<>Visit Documentation</>} />
            {boundAppointment && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                <Calendar className="h-3 w-3 mr-1" />
                From Appointment
              </Badge>
            )}
          </div>
          {/* Minimal inline tracker for current patient */}
          {selectedPatientId && (
            <div className="mt-2">
              <PatientProgressTracker patientId={selectedPatientId} compact />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <QuickGuide
            title="Visit Documentation Guide"
            triggerVariant="ghost"
            sections={[
              {
                title: "Documenting the Visit",
                items: [
                  "Fill out sections in order: Vitals → History → Examination → Assessment → Plan",
                  "Use expandable sections to keep the form organized",
                  "New visits are kept once you click Save Draft; after that, changes save automatically",
                  "Mark visit as complete when finished"
                ]
              },
              {
                title: "Prescriptions",
                items: [
                  "Add medications from the drug database",
                  "Configure dosage, frequency, and duration",
                  "Add special dermatology instructions (application site, timing, etc.)",
                  "Preview and print prescription for the patient"
                ]
              },
              {
                title: "Photos & Documentation",
                items: [
                  "Upload photos to document patient condition",
                  "Photos are automatically attached to the visit",
                  "Use photos to track treatment progress",
                  "All photos are stored securely in patient records"
                ]
              }
            ]}
          />
          {boundAppointment && (
            <Button variant="outline" onClick={() => requestLeave('calendar')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Calendar
            </Button>
          )}
          <Button variant="outline" onClick={() => requestLeave('setup')}>
            Back to Setup
          </Button>
        </div>
      </div>

      <div className="sticky -top-4 z-30 -mx-4 md:-top-6 border-b bg-background px-4 py-2 md:-mx-6 md:px-6">
        <VisitIdentityBar
          patient={selectedPatient}
          doctor={selectedDoctor}
          appointment={boundAppointment}
        />
      </div>

      <div className="contents" onInputCapture={markFormTouched} onChangeCapture={markFormTouched} onClickCapture={markFormTouchedByClick}>
      <MedicalVisitForm
        key={formKey}
        patientId={selectedPatientId}
        doctorId={selectedDoctorId}
        userRole={currentUserRole}
        patientName={selectedPatient.status === 'ready' ? formatPatientName(selectedPatient.record) : ''}
        visitDate={formSession.visitDate}
        appointmentId={boundAppointment?.id}
        appointmentData={boundAppointment}
        initialVisitId={boundVisitId}
        onSaveStatusChange={handleSaveStatusChange}
      />
      </div>

      <Dialog open={pendingLeave !== null} onOpenChange={(open: boolean) => { if (!open) setPendingLeave(null); }}>
        <DialogContent
          className="max-w-md"
          showCloseButton={false}
          onOpenAutoFocus={(event: Event) => { event.preventDefault(); keepEditingRef.current?.focus(); }}
        >
          <DialogHeader>
            <DialogTitle>Leave without saving?</DialogTitle>
            <DialogDescription>Some changes in this visit are not saved yet. Use Save Draft to keep them.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button ref={keepEditingRef} variant="outline" className="w-full sm:w-auto" onClick={() => setPendingLeave(null)}>
              Keep editing
            </Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={() => pendingLeave && leaveForm(pendingLeave)}>
              Leave without saving
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function VisitsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton label="Loading visits…" />}>
      {/* Inject global print CSS used by prescription/invoice previews (fixed headers, page-break helpers) */}
      <div dangerouslySetInnerHTML={{ __html: getGlobalPrintStyleTag() }} />
      <VisitsPageInner />
    </Suspense>
  );
} 
