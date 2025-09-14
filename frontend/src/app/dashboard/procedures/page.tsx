'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api';

export default function ProceduresPage() {
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');

  // Procedure state
  const [procType, setProcType] = useState<string>('');
  const [fluence, setFluence] = useState<string>('');
  const [spotSize, setSpotSize] = useState<string>('');
  const [passes, setPasses] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    const run = async () => {
      try {
        const [p, d] = await Promise.all([
          apiClient.getPatients({ limit: 50 }),
          apiClient.getUsers({ role: 'DOCTOR', limit: 20 }),
        ]);
        const pdata = (p as any)?.patients || (p as any)?.data || (p as any) || [];
        const ddata = (d as any)?.users || [];
        setPatients(pdata);
        setDoctors(ddata);
        if (pdata.length > 0) setSelectedPatientId(pdata[0].id);
        if (ddata.length > 0) setSelectedDoctorId(ddata[0].id);
      } catch {
        setPatients([]);
        setDoctors([]);
      }
    };
    void run();
  }, []);

  const savePlannedProcedure = async () => {
    if (!selectedPatientId || !selectedDoctorId) return alert('Select patient and doctor');
    try {
      const payload: any = {
        patientId: selectedPatientId,
        doctorId: selectedDoctorId,
        treatmentPlan: {
          dermatology: {
            procedures: procType ? [{ type: procType, fluence: fluence ? Number(fluence) : undefined, spotSize: spotSize ? Number(spotSize) : undefined, passes: passes ? Number(passes) : undefined }] : [],
          },
          notes: notes || undefined,
        },
      };
      await apiClient.createVisit(payload);
      alert('Planned procedure saved to a new visit');
      setProcType(''); setFluence(''); setSpotSize(''); setPasses(''); setNotes('');
    } catch (e: any) {
      alert(e?.body?.message || 'Failed to save procedure');
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Procedures</CardTitle>
          <CardDescription>Plan and record dermatology procedures</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-700">Patient</label>
              <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name || p.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-gray-700">Doctor</label>
              <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
                <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-700">Planned Procedure</label>
              <Input placeholder="e.g., QS Nd:YAG, IPL, CO2" value={procType} onChange={(e) => setProcType(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm text-gray-700">Fluence</label>
                <Input placeholder="J/cm²" value={fluence} onChange={(e) => setFluence(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-700">Spot Size</label>
                <Input placeholder="mm" value={spotSize} onChange={(e) => setSpotSize(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-700">Passes</label>
                <Input placeholder="#" value={passes} onChange={(e) => setPasses(e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-700">Notes</label>
            <Textarea rows={3} placeholder="Any additional details..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex justify-end">
            <Button onClick={savePlannedProcedure}>Save Planned Procedure</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 