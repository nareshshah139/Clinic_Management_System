'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';
import VisitPhotos from '@/components/visits/VisitPhotos';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { User, Users, Stethoscope } from 'lucide-react';

export default function VisitsPage() {
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [currentUserRole, setCurrentUserRole] = useState<string>('DOCTOR');
  const [recentVisitId, setRecentVisitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [patientsRes, usersRes] = await Promise.allSettled([
        apiClient.getPatients({ page: 1, limit: 50 }),
        apiClient.getUsers({ role: 'DOCTOR', limit: 20 }),
      ]);

      if (patientsRes.status === 'fulfilled') {
        const patientsData = (patientsRes.value as any)?.data || [];
        setPatients(patientsData);
        if (patientsData.length > 0 && !selectedPatientId) {
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
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Select Patient
                </label>
                <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a patient..." />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>
                            {patient.firstName} {patient.lastName}
                            {patient.phone && (
                              <span className="text-xs text-gray-500 ml-2">
                                {patient.phone}
                              </span>
                            )}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

            {selectedPatientId && selectedDoctorId && (
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Ready to start visit</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Patient: {patients.find(p => p.id === selectedPatientId)?.firstName} {patients.find(p => p.id === selectedPatientId)?.lastName} • 
                      Doctor: Dr. {doctors.find(d => d.id === selectedDoctorId)?.firstName} {doctors.find(d => d.id === selectedDoctorId)?.lastName}
                    </p>
                  </div>
                  <Button onClick={startNewVisit}>
                    Start Visit Documentation
                  </Button>
                </div>
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
          <h1 className="text-2xl font-semibold text-gray-900">Visit Documentation</h1>
          <p className="text-sm text-gray-600">
            Patient: {patients.find(p => p.id === selectedPatientId)?.firstName} {patients.find(p => p.id === selectedPatientId)?.lastName} • 
            Doctor: Dr. {doctors.find(d => d.id === selectedDoctorId)?.firstName} {doctors.find(d => d.id === selectedDoctorId)?.lastName}
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowForm(false)}>
          Back to Setup
        </Button>
      </div>

      <MedicalVisitForm 
        patientId={selectedPatientId} 
        doctorId={selectedDoctorId}
        userRole={currentUserRole}
      />
      
      {recentVisitId && <VisitPhotos visitId={recentVisitId} />}
    </div>
  );
} 