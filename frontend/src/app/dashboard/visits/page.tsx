'use client';


import { LoadingSkeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { isValidId } from '@/lib/id';
import type { ComponentType } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { getGlobalPrintStyleTag } from '@/lib/printStyles';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import PatientProgressTracker from '@/components/patients/PatientProgressTracker';
import { usePatientHistory } from '@/components/visits/usePatientHistory';
import PatientHistoryVisitCard from '@/components/visits/PatientHistoryVisitCard';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { User, Users, Stethoscope, FileText, Calendar, Activity, ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { QuickGuide } from '@/components/common/QuickGuide';
import { formatPatientName } from '@/lib/utils';
import { VisitIdentityBar } from '@/components/visits/VisitIdentityBar';
import { useRecordById } from '@/components/visits/useRecordById';
import { PatientHistoryTimeline } from '@/components/visits/PatientHistoryTimeline';
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

const PhotosPanel = dynamic<ComponentType<{ visitId: string }>>(
  () => import('@/components/visits/VisitPhotos'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-6 text-sm text-gray-500">
        Loading photos…
      </div>
    ),
  }
);


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
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [appointmentData, setAppointmentData] = useState<AppointmentWithVisit | null>(null);

  const [loadError, setLoadError] = useState(false);

  const searchParams = useSearchParams();
  const urlPatientId = searchParams.get('patientId');
  const appointmentIdParam = searchParams.get('appointmentId');
  const urlDoctorId = searchParams.get('doctorId');
  const urlVisitId = searchParams.get('visitId');
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
      if (appointment?.doctorId) {
        setSelectedDoctorId(appointment.doctorId);
      }
    } catch (error) {
      console.error('Failed to fetch appointment data:', error);
    }
  }, []);

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
      setPatientOptions(patientsData.slice(0, 10));

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
        setSelectedDoctorId(urlDoctorId);
      }
      if (appointmentIdParam) {
        void fetchAppointmentData(appointmentIdParam);
      }
      if (autoStartParam) {
        setShowForm(true);
      }
    }
  }, [appointmentIdParam, autoStartParam, fetchAppointmentData, urlDoctorId, urlPatientId]);

  // Handle direct visit resume via visitId in URL
  useEffect(() => {
    const run = async () => {
      if (!urlVisitId || !isValidId(urlVisitId)) return;
      try {
        const visit: any = await apiClient.get(`/visits/${urlVisitId}`);
        const pid = visit?.patient?.id;
        const did = visit?.doctor?.id;
        if (typeof pid === 'string') setSelectedPatientId(pid);
        if (typeof did === 'string') setSelectedDoctorId(did);
        // Populate appointment context if present (non-blocking)
        const apptId = visit?.appointment?.id;
        if (typeof apptId === 'string') {
          try {
            const appt = await apiClient.getAppointment<AppointmentWithVisit>(apptId);
            setAppointmentData(appt);
            if (appt?.doctorId) setSelectedDoctorId(appt.doctorId);
          } catch {}
        }
        setShowForm(true);
        setRecentVisitId(urlVisitId);
      } catch (e) {
        // If visit fetch fails, ignore and proceed with normal flow
        console.warn('[VisitsPage] Failed to load visit by id', e);
      }
    };
    void run();
  }, [urlVisitId]);

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

  const selectedPatient = useRecordById<PatientMatch>(selectedPatientId, fetchPatientById);
  const selectedDoctor = useRecordById<DoctorSummary>(selectedDoctorId, fetchDoctorById);

  const startNewVisit = () => {
    if (selectedPatientId && selectedDoctorId) {
      setShowForm(true);
    }
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
                  "View patient history in the 'Patient History' tab",
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
        
        {/* Role Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Your Role & Permissions
            </CardTitle>
            <CardDescription>
              Features available based on your role: {roleInfo.label}
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
                          setSelectedPatientId(sel.id);
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
                        <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
                      )}
                      {!searchingPatients && patientOptions.length === 0 && (
                        <div className="px-3 py-2 text-xs text-gray-500">No results</div>
                      )}
                      {!searchingPatients && patientOptions.map((p, idx) => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          onClick={() => {
                            setSelectedPatientId(p.id);
                            setPatientQuery(p.name || p.phone || p.email || p.id);
                            setShowPatientMenu(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm ${selectedPatientId === p.id ? 'bg-gray-50' : ''} ${idx === highlightedIndex ? 'bg-blue-50' : ''}`}
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
                            <VisitIdentityBar
                              className="mt-1 !text-xs !text-gray-500"
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 max-w-full">
          <div className="flex flex-wrap items-center gap-2">
            <PageHeader title={<>Visit Documentation</>} />
            {appointmentData && (
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
                  "Save progress automatically as you work",
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

      <div className="sticky -top-4 z-30 -mx-4 md:-top-6 border-b bg-background px-4 py-2 md:-mx-6 md:px-6">
        <VisitIdentityBar
          patient={selectedPatient}
          doctor={selectedDoctor}
          appointment={appointmentData}
        />
      </div>

      <MedicalVisitForm
        key={`${selectedPatientId}:${urlVisitId || appointmentData?.id || "new"}`}
        patientId={selectedPatientId} 
        doctorId={selectedDoctorId}
        userRole={currentUserRole}
        patientName={selectedPatient.status === 'ready' ? formatPatientName(selectedPatient.record) : ''}
        visitDate={new Date().toISOString()}
        appointmentId={appointmentData?.id}
        appointmentData={appointmentData}
        initialVisitId={urlVisitId || (appointmentData?.visit && 'id' in (appointmentData as any).visit ? (appointmentData as any).visit.id : undefined)}
      />
      
      {/* Show standalone photos panel only when the form is not open to avoid duplicate rendering */}
      {!showForm && recentVisitId && <PhotosPanel visitId={recentVisitId} />}
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
