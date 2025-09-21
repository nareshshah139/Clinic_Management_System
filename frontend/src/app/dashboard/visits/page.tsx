'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';
import VisitPhotos from '@/components/visits/VisitPhotos';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { User, Users, Stethoscope, Clock, FileText, Calendar, Activity, ArrowLeft } from 'lucide-react';

// Patient History Timeline Component
function PatientHistoryTimeline({ patientId }: { patientId: string }) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchPatientHistory = async () => {
      if (!patientId) return;
      
      try {
        setLoading(true);
        console.log('🏥 Fetching patient visit history for:', patientId);
        const response = await apiClient.getPatientVisitHistory(patientId, { limit: 10 });
        console.log('🏥 Patient visit history response:', response);
        
        // Extract visits from response
        const visits = response?.visits || response?.data || response || [];
        console.log('🏥 Processed visit history:', visits);
        setHistory(visits);
      } catch (error) {
        console.error('❌ Error fetching patient visit history:', error);
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
            // Handle JSON fields - some are already parsed, others need parsing
            const complaints = Array.isArray(visit.complaints) ? visit.complaints : (visit.complaints ? JSON.parse(visit.complaints) : []);
            const diagnosis = Array.isArray(visit.diagnosis) ? visit.diagnosis : (visit.diagnosis ? JSON.parse(visit.diagnosis) : []);
            const treatment = typeof visit.plan === 'object' ? visit.plan : (visit.plan ? JSON.parse(visit.plan) : {});
            const rawScribe = typeof visit.scribeJson === 'object' ? visit.scribeJson : (visit.scribeJson ? JSON.parse(visit.scribeJson) : {});
            const scribeData = rawScribe && typeof rawScribe === 'object' ? rawScribe : {};
            const vitals = typeof visit.vitals === 'object' ? visit.vitals : (visit.vitals ? JSON.parse(visit.vitals) : {});
            
            const visitDate = new Date(visit.createdAt);
            const chiefComplaint = complaints.length > 0 ? complaints[0].complaint : 'No chief complaint recorded';
            const primaryDiagnosis = diagnosis.length > 0 ? diagnosis[0].diagnosis : 'No diagnosis recorded';
            const visitType = (scribeData as any)?.visitType || 'OPD Consultation';
            
            return (
              <div key={visit.id} className="relative flex items-start space-x-4">
                {/* Timeline dot */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                  index === 0 
                    ? 'bg-blue-100 border-blue-500 text-blue-600' 
                    : 'bg-gray-100 border-gray-300 text-gray-500'
                }`}>
                  {visitType === 'Procedure' ? (
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
                        <Badge variant={visitType === 'Procedure' ? 'destructive' : 'default'}>
                          {visitType}
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
                              {(Array.isArray(treatment.medications) ? treatment.medications : []).map((m: any, idx: number) => (
                                <li key={idx}>
                                  {typeof m === 'string' ? m : [m?.name, m?.dosage, m?.duration].filter(Boolean).join(' • ')}
                                </li>
                              ))}
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
                    </CardContent>
                  </Card>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function VisitsPage() {
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [currentUserRole, setCurrentUserRole] = useState<string>('DOCTOR');
  const [recentVisitId, setRecentVisitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Autocomplete state for patients
  const [patientQuery, setPatientQuery] = useState('');
  const [patientOptions, setPatientOptions] = useState<any[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [showPatientMenu, setShowPatientMenu] = useState(false);
  const [appointmentData, setAppointmentData] = useState<any>(null);

  const searchParams = useSearchParams();
  const urlPatientId = searchParams.get('patientId');

  useEffect(() => {
    loadData();
  }, []);

  // Handle URL parameters for appointment linking
  useEffect(() => {
    const patientId = urlPatientId;
    const appointmentId = searchParams.get('appointmentId');
    const autoStart = searchParams.get('autoStart') === 'true';

    console.log('🔗 URL Parameters:', { patientId, appointmentId, autoStart });

    if (patientId) {
      console.log('🎯 Setting patient from URL:', patientId);
      setSelectedPatientId(patientId);
      
      // If we have an appointment ID, fetch appointment details
      if (appointmentId) {
        fetchAppointmentData(appointmentId);
      }
      
      // Auto-start visit documentation if requested
      if (autoStart) {
        setShowForm(true);
      }
    }
  }, [searchParams]);

  const fetchAppointmentData = async (appointmentId: string) => {
    try {
      const appointment = await apiClient.getAppointment(appointmentId);
      setAppointmentData(appointment);
      
      // Set doctor from appointment
      if (appointment.doctorId) {
        setSelectedDoctorId(appointment.doctorId);
      }
    } catch (error) {
      console.error('Failed to fetch appointment data:', error);
    }
  };

  const loadData = async () => {
      setLoading(true);
      try {
        const [patientsRes, usersRes] = await Promise.allSettled([
        apiClient.getPatients({ page: 1, limit: 50 }),
        apiClient.getUsers({ role: 'DOCTOR', limit: 20 }),
        ]);

        if (patientsRes.status === 'fulfilled') {
        console.log('🏥 Patients API response:', patientsRes.value);
        const patientsData = (patientsRes.value as any)?.data || (patientsRes.value as any)?.patients || (patientsRes.value as any) || [];
        console.log('🏥 Processed patients data:', patientsData);
        setPatients(patientsData);
        setPatientOptions(patientsData.slice(0, 10));
        // Only set default patient if no URL patient ID is present
        if (patientsData.length > 0 && !selectedPatientId && !urlPatientId) {
          console.log('🔄 Setting default patient (no URL patient):', patientsData[0].id);
          setSelectedPatientId(patientsData[0].id);
          }
        }

        if (usersRes.status === 'fulfilled') {
        const doctorsData = (usersRes.value as any)?.users || [];
        setDoctors(doctorsData);
        if (doctorsData.length > 0 && !selectedDoctorId) {
          setSelectedDoctorId(doctorsData[0].id);
        }
      }

      // Get current user role (in a real app, this would come from auth context)
      try {
        const currentUser = await apiClient.get('/auth/me');
        setCurrentUserRole(currentUser.role || 'DOCTOR');
      } catch (error) {
        console.error('Failed to get current user:', error);
        setCurrentUserRole('DOCTOR');
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

  // Debounced search for patients
  useEffect(() => {
    let t: any;
    const run = async () => {
      try {
        setSearchingPatients(true);
        const res: any = await apiClient.getPatients({ search: patientQuery || undefined, limit: 10 });
        const rows = res?.data || res?.patients || res || [];
        setPatientOptions(rows);
      } catch (e) {
        setPatientOptions([]);
      } finally {
        setSearchingPatients(false);
      }
    };
    t = setTimeout(() => void run(), 250);
    return () => clearTimeout(t);
  }, [patientQuery]);

  const startNewVisit = () => {
    if (selectedPatientId && selectedDoctorId) {
      setShowForm(true);
    }
  };

  const getRolePermissions = () => {
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
    const roleInfo = getRolePermissions();
    
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
                              Patient: {patients.find(p => p.id === selectedPatientId)?.name} • 
                              Doctor: Dr. {doctors.find(d => d.id === selectedDoctorId)?.firstName} {doctors.find(d => d.id === selectedDoctorId)?.lastName}
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
            Patient: {patients.find(p => p.id === selectedPatientId)?.name} • 
            Doctor: Dr. {doctors.find(d => d.id === selectedDoctorId)?.firstName} {doctors.find(d => d.id === selectedDoctorId)?.lastName}
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
        patientName={patients.find(p => p.id === selectedPatientId)?.name || ''}
        visitDate={new Date().toISOString()}
        appointmentId={appointmentData?.id}
        appointmentData={appointmentData}
      />
      
      {recentVisitId && <VisitPhotos visitId={recentVisitId} />}
    </div>
  );
} 