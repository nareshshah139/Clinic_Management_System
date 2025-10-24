'use client';

import { Suspense, useCallback, useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import { getGlobalPrintStyleTag } from '@/lib/printStyles';
import { apiClient } from '@/lib/api';
import type { Patient, User } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, Search, User as UserIcon, Stethoscope } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn, formatPatientName } from '@/lib/utils';
import { isValidId } from '@/lib/id';
import { QuickGuide } from '@/components/common/QuickGuide';

function PrescriptionPadSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Prescription Pad</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-10 bg-muted rounded animate-pulse" />
          <div className="h-10 bg-muted rounded animate-pulse" />
          <div className="h-20 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
      <Card className="animate-pulse">
        <CardHeader>
          <CardTitle className="h-6 bg-muted rounded" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-10 bg-muted rounded" />
          <div className="h-10 bg-muted rounded" />
          <div className="h-48 bg-muted rounded" />
        </CardContent>
      </Card>
    </div>
  );
}

function DoctorSelector({ doctors, selectedDoctorId, onSelect }: { doctors: User[]; selectedDoctorId?: string; onSelect: (id: string) => void }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
        <Stethoscope className="h-4 w-4 text-blue-500" /> Doctor
      </label>
      <div className="mt-2 space-y-1">
        {doctors.length === 0 ? (
          <div className="text-xs text-gray-500">No doctors available.</div>
        ) : (
          doctors.map((doctor) => {
            const label = `${doctor.firstName ?? ''} ${doctor.lastName ?? ''}`.trim() || doctor.email;
            return (
              <button
                key={doctor.id}
                type="button"
                onClick={() => onSelect(doctor.id)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded border transition-colors text-sm',
                  selectedDoctorId === doctor.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                )}
              >
                <div className="font-medium">{label}</div>
                <div className="text-xs text-gray-500">{doctor.designation || 'Doctor'}</div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function PatientSearch({ onSelect }: { onSelect: (patient: Patient) => void }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Patient[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      try {
        setLoading(true);
        const res = await apiClient.getPatients({ search: query, limit: 12 });
        const data = (res as any)?.data || (res as any)?.patients || [];
        setResults(data);
      } catch (error) {
        console.error('Patient search failed', error);
        toast({
          variant: 'destructive',
          title: 'Unable to search patients',
          description: 'Please try again.',
        });
      } finally {
        setLoading(false);
      }
    };

    timer = setTimeout(() => {
      void run();
    }, 250);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [query, toast]);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
        <UserIcon className="h-4 w-4 text-blue-500" /> Patient
      </label>
      <div className="relative">
        <Input
          placeholder="Search by name, phone, or ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      </div>
      {loading && (
        <div className="flex items-center text-xs text-gray-500 gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Searching...
        </div>
      )}
      <div className="max-h-60 overflow-auto border border-dashed border-gray-200 rounded-lg">
        {results.length === 0 && !loading ? (
          <div className="text-sm text-gray-500 px-3 py-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            No matching patients found. Try different keywords.
          </div>
        ) : (
          results.map((patient) => (
            <button
              key={patient.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b last:border-b-0"
              onClick={() => onSelect(patient)}
            >
              <div className="font-medium text-sm">{formatPatientName(patient)}</div>
              <div className="text-xs text-gray-500">{patient.phone || 'No phone'} • {patient.gender}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function PrescriptionPadContent() {
  const { toast } = useToast();
  const [doctors, setDoctors] = useState<User[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchDoctors = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.getUsers({ role: 'DOCTOR', limit: 25 });
      const data = (res as any)?.users || [];
      setDoctors(data);
      if (data.length > 0) {
        setSelectedDoctorId((prev) => prev || data[0]?.id || '');
      }
    } catch (error) {
      console.error('Failed to load doctors', error);
      toast({
        variant: 'destructive',
        title: 'Unable to load doctors',
        description: 'Please refresh the page.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchDoctors();
  }, [fetchDoctors]);

  const handlePatientSelect = useCallback((patient: Patient) => {
    setSelectedPatient(patient);
    toast({
      variant: 'default',
      title: 'Patient selected',
      description: formatPatientName(patient),
    });
  }, [toast]);

  const canCreate = useMemo(() => Boolean(isValidId(selectedDoctorId) && selectedPatient), [selectedDoctorId, selectedPatient]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Quick Prescription Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="patient">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="patient">Patient</TabsTrigger>
                <TabsTrigger value="doctor">Doctor</TabsTrigger>
              </TabsList>
              <TabsContent value="patient" className="mt-4">
                <PatientSearch onSelect={handlePatientSelect} />
                {selectedPatient && (
                  <div className="mt-3 text-sm space-y-1 border rounded-lg p-3 bg-blue-50 border-blue-200">
                    <div className="font-semibold text-blue-900">{formatPatientName(selectedPatient)}</div>
                    <div className="text-xs text-blue-700">
                      {selectedPatient.phone || 'No phone'} • {selectedPatient.gender}
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="doctor" className="mt-4">
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading doctors...
                  </div>
                ) : (
                  <DoctorSelector 
                    doctors={doctors} 
                    selectedDoctorId={selectedDoctorId} 
                    onSelect={(id: string) => {
                      if (isValidId(id)) {
                        setSelectedDoctorId(id);
                      } else {
                        console.warn('[PrescriptionPad] Invalid Doctor ID selection', { id });
                        toast({
                          variant: 'destructive',
                          title: 'Invalid Doctor ID',
                          description: 'Selected doctor does not have a valid ID. Please choose another.',
                        });
                      }
                    }} 
                  />
                )}
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Reason / Note (optional)</label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g., Phone consult follow-up"
              />
            </div>

            {!canCreate && (
              <div className="text-xs text-red-600 border border-red-200 bg-red-50 px-3 py-2 rounded">
                Select both a patient and doctor to enable the prescription pad.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Prescription Pad</CardTitle>
          </CardHeader>
          <CardContent>
            {canCreate ? (
              <PrescriptionBuilder
                patientId={selectedPatient!.id}
                doctorId={selectedDoctorId}
                visitId={null}
                standalone
                standaloneReason={reason}
                    printBgUrl={"/letterhead.png"}
                    paperPreset={'A4'}
                onCreated={() => {
                  setReason('');
                  toast({
                    variant: 'success',
                    title: 'Prescription recorded',
                    description: 'You can download or print it from the preview.',
                  });
                }}
              />
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-gray-400 gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-5 w-5" />
                  Select a patient and doctor to begin.
                </div>
                <Button variant="outline" disabled>
                  Start Prescription
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function PrescriptionPadPage() {
  return (
    <Suspense fallback={<PrescriptionPadSkeleton />}>
      {/* Inject global print CSS used by preview/printing (fixed headers, page helpers) */}
      <div dangerouslySetInnerHTML={{ __html: getGlobalPrintStyleTag() }} />
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Prescription Pad</h1>
            <p className="text-gray-600">Create standalone prescriptions for patients</p>
          </div>
          <QuickGuide
            title="Prescription Pad Guide"
            sections={[
              {
                title: "Creating Prescriptions",
                items: [
                  "Search and select a patient from the search box",
                  "Choose the prescribing doctor",
                  "Add optional reason or note for the prescription",
                  "Add medications using the prescription builder"
                ]
              },
              {
                title: "Adding Medications",
                items: [
                  "Search for drugs by name or use templates",
                  "Specify dosage, frequency, and duration",
                  "Add special instructions for each medication",
                  "Configure dermatology-specific options if needed"
                ]
              },
              {
                title: "Printing & Export",
                items: [
                  "Preview prescription before finalizing",
                  "Print prescription on clinic letterhead",
                  "Download as PDF for digital records",
                  "Prescriptions are automatically saved in patient records"
                ]
              }
            ]}
          />
        </div>
        <PrescriptionPadContent />
      </div>
    </Suspense>
  );
}
