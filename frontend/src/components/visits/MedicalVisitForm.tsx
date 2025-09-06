'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiClient } from '@/lib/api';

interface Props {
  patientId: string;
  doctorId: string;
}

export default function MedicalVisitForm({ patientId, doctorId }: Props) {
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [vitals, setVitals] = useState({
    bpS: '', bpD: '', hr: '', temp: '', weight: '', height: '', spo2: ''
  });
  const [saving, setSaving] = useState(false);

  const save = async (complete = false) => {
    try {
      setSaving(true);
      const payload: any = {
        patientId,
        doctorId,
        chiefComplaint: subjective,
        physicalExamination: objective,
        diagnosis: [{ code: 'R69', description: 'Clinical findings', type: 'PRIMARY' }],
        treatmentPlan: plan,
        vitals: {
          bloodPressureSystolic: Number(vitals.bpS) || undefined,
          bloodPressureDiastolic: Number(vitals.bpD) || undefined,
          heartRate: Number(vitals.hr) || undefined,
          temperature: Number(vitals.temp) || undefined,
          weight: Number(vitals.weight) || undefined,
          height: Number(vitals.height) || undefined,
          oxygenSaturation: Number(vitals.spo2) || undefined,
        },
      };
      const visit = await apiClient.createVisit(payload);
      if (complete) {
        await apiClient.completeVisit(visit.id, {});
      }
      alert(complete ? 'Visit saved and completed' : 'Visit saved');
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('Failed to save visit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Medical Visit Documentation</CardTitle>
        <CardDescription>SOAP notes with vitals and plan</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="S">
          <TabsList className="mb-4">
            <TabsTrigger value="S">Subjective</TabsTrigger>
            <TabsTrigger value="O">Objective</TabsTrigger>
            <TabsTrigger value="A">Assessment</TabsTrigger>
            <TabsTrigger value="P">Plan</TabsTrigger>
            <TabsTrigger value="V">Vitals</TabsTrigger>
          </TabsList>
          <TabsContent value="S">
            <Textarea placeholder="Chief complaint, HPI..." value={subjective} onChange={(e) => setSubjective(e.target.value)} />
          </TabsContent>
          <TabsContent value="O">
            <Textarea placeholder="Physical examination findings..." value={objective} onChange={(e) => setObjective(e.target.value)} />
          </TabsContent>
          <TabsContent value="A">
            <Textarea placeholder="Diagnosis and assessments..." value={assessment} onChange={(e) => setAssessment(e.target.value)} />
          </TabsContent>
          <TabsContent value="P">
            <Textarea placeholder="Treatment plan and follow-up..." value={plan} onChange={(e) => setPlan(e.target.value)} />
          </TabsContent>
          <TabsContent value="V">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Input placeholder="BP Systolic" value={vitals.bpS} onChange={(e) => setVitals({ ...vitals, bpS: e.target.value })} />
              <Input placeholder="BP Diastolic" value={vitals.bpD} onChange={(e) => setVitals({ ...vitals, bpD: e.target.value })} />
              <Input placeholder="Heart Rate" value={vitals.hr} onChange={(e) => setVitals({ ...vitals, hr: e.target.value })} />
              <Input placeholder="Temperature" value={vitals.temp} onChange={(e) => setVitals({ ...vitals, temp: e.target.value })} />
              <Input placeholder="Weight" value={vitals.weight} onChange={(e) => setVitals({ ...vitals, weight: e.target.value })} />
              <Input placeholder="Height" value={vitals.height} onChange={(e) => setVitals({ ...vitals, height: e.target.value })} />
              <Input placeholder="SpO2" value={vitals.spo2} onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })} />
            </div>
          </TabsContent>
        </Tabs>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => void save(false)} disabled={saving}>Save</Button>
          <Button onClick={() => void save(true)} disabled={saving}>Complete Visit</Button>
        </div>
      </CardContent>
    </Card>
  );
} 