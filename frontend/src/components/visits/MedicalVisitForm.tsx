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

const DERM_DIAGNOSES = [
  'Acne vulgaris','Atopic dermatitis','Psoriasis','Tinea corporis','Melasma','Post-inflammatory hyperpigmentation','Urticaria','Rosacea','Seborrheic dermatitis','Lichen planus','Vitiligo'
];

const MORPHOLOGY = ['Macule','Papule','Pustule','Nodule','Plaque','Vesicle','Scale','Erosion','Ulcer','Comedo'];
const DISTRIBUTION = ['Face','Scalp','Neck','Trunk','Arms','Legs','Hands','Feet','Flexures','Extensors','Generalized'];
const FITZPATRICK = ['I','II','III','IV','V','VI'];

export default function MedicalVisitForm({ patientId, doctorId }: Props) {
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [vitals, setVitals] = useState({
    bpS: '', bpD: '', hr: '', temp: '', weight: '', height: '', spo2: '', rr: ''
  });

  // Dermatology-oriented state
  const [skinType, setSkinType] = useState<string>('');
  const [morphology, setMorphology] = useState<Set<string>>(new Set());
  const [distribution, setDistribution] = useState<Set<string>>(new Set());
  const [acneSeverity, setAcneSeverity] = useState<string>('');
  const [itchScore, setItchScore] = useState<string>(''); // 0-10
  const [triggers, setTriggers] = useState<string>('');
  const [priorTx, setPriorTx] = useState<string>('');
  const [dermDx, setDermDx] = useState<Set<string>>(new Set());
  const [procType, setProcType] = useState<string>('');
  const [fluence, setFluence] = useState<string>('');
  const [spotSize, setSpotSize] = useState<string>('');
  const [passes, setPasses] = useState<string>('');
  const [topicals, setTopicals] = useState<string>('');
  const [systemics, setSystemics] = useState<string>('');
  const [counseling, setCounseling] = useState<string>('');
  const [followUpDays, setFollowUpDays] = useState<string>('');

  const [saving, setSaving] = useState(false);

  const toggleSet = (s: Set<string>, value: string, setter: (next: Set<string>) => void) => {
    const next = new Set(s);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
  };

  const buildPayload = () => {
    const payload: any = {
      patientId,
      doctorId,
      complaints: subjective ? [{ complaint: subjective }] : [{ complaint: 'General consultation' }],
      examination: {
        ...(objective ? { generalAppearance: objective } : {}),
        dermatology: {
          skinType: skinType || undefined,
          morphology: Array.from(morphology),
          distribution: Array.from(distribution),
          acneSeverity: acneSeverity || undefined,
          itchScore: itchScore ? Number(itchScore) : undefined,
          triggers: triggers || undefined,
          priorTreatments: priorTx || undefined,
        }
      },
      diagnosis: (dermDx.size > 0 ? Array.from(dermDx) : (assessment ? [assessment] : []))
        .map((dx: string) => ({ diagnosis: dx, icd10Code: 'R69', type: 'Primary' })),
      treatmentPlan: {
        ...(plan ? { notes: plan } : {}),
        dermatology: {
          procedures: procType ? [{ type: procType, fluence: fluence ? Number(fluence) : undefined, spotSize: spotSize ? Number(spotSize) : undefined, passes: passes ? Number(passes) : undefined }] : [],
          medications: {
            topicals: topicals || undefined,
            systemics: systemics || undefined,
          },
          counseling: counseling || undefined,
          followUpDays: followUpDays ? Number(followUpDays) : undefined,
        }
      },
      vitals: {
        systolicBP: vitals.bpS ? Number(vitals.bpS) : undefined,
        diastolicBP: vitals.bpD ? Number(vitals.bpD) : undefined,
        heartRate: vitals.hr ? Number(vitals.hr) : undefined,
        temperature: vitals.temp ? Number(vitals.temp) : undefined,
        weight: vitals.weight ? Number(vitals.weight) : undefined,
        height: vitals.height ? Number(vitals.height) : undefined,
        oxygenSaturation: vitals.spo2 ? Number(vitals.spo2) : undefined,
        respiratoryRate: vitals.rr ? Number(vitals.rr) : undefined,
      },
    };
    return payload;
  };

  const save = async (complete = false) => {
    try {
      setSaving(true);
      const payload = buildPayload();
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
        <CardDescription>SOAP notes with dermatology-focused details</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="DERM">
          <TabsList className="mb-4 flex flex-wrap gap-2">
            <TabsTrigger value="DERM">Dermatology</TabsTrigger>
            <TabsTrigger value="S">Subjective</TabsTrigger>
            <TabsTrigger value="O">Objective</TabsTrigger>
            <TabsTrigger value="A">Assessment</TabsTrigger>
            <TabsTrigger value="P">Plan</TabsTrigger>
            <TabsTrigger value="V">Vitals</TabsTrigger>
          </TabsList>

          <TabsContent value="DERM" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-sm text-gray-700">Fitzpatrick Skin Type</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {FITZPATRICK.map(ft => (
                    <Button key={ft} type="button" variant={skinType === ft ? 'default' : 'outline'} size="sm" onClick={() => setSkinType(skinType === ft ? '' : ft)}>{ft}</Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-700">Acne Severity</label>
                <Input placeholder="(e.g., mild/moderate/severe)" value={acneSeverity} onChange={(e) => setAcneSeverity(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-700">Itch Score (0-10)</label>
                <Input placeholder="0-10" value={itchScore} onChange={(e) => setItchScore(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-700">Follow-up (days)</label>
                <Input placeholder="e.g., 30" value={followUpDays} onChange={(e) => setFollowUpDays(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-700">Morphology</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {MORPHOLOGY.map(m => (
                  <Button key={m} type="button" variant={morphology.has(m) ? 'default' : 'outline'} size="sm" onClick={() => toggleSet(morphology, m, setMorphology)}>{m}</Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-700">Distribution / Body Areas</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {DISTRIBUTION.map(d => (
                  <Button key={d} type="button" variant={distribution.has(d) ? 'default' : 'outline'} size="sm" onClick={() => toggleSet(distribution, d, setDistribution)}>{d}</Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-700">Triggers</label>
                <Input placeholder="Heat, stress, cosmetics..." value={triggers} onChange={(e) => setTriggers(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-700">Prior Treatments</label>
                <Input placeholder="Topicals/systemics tried" value={priorTx} onChange={(e) => setPriorTx(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-700">Dermatology Diagnoses</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {DERM_DIAGNOSES.map(dx => (
                  <Button key={dx} type="button" variant={dermDx.has(dx) ? 'default' : 'outline'} size="sm" onClick={() => toggleSet(dermDx, dx, setDermDx)}>{dx}</Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-700">Planned Procedure</label>
                <Input placeholder="e.g., Q-switched Nd:YAG, IPL, CO2, Diode" value={procType} onChange={(e) => setProcType(e.target.value)} />
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-700">Topicals</label>
                <Textarea placeholder="e.g., Adapalene, Benzoyl peroxide, Azelaic acid" value={topicals} onChange={(e) => setTopicals(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-700">Systemics</label>
                <Textarea placeholder="e.g., Doxycycline, Isotretinoin, Antihistamines" value={systemics} onChange={(e) => setSystemics(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-700">Counseling / Lifestyle Advice</label>
              <Textarea placeholder="Sun protection, emollients, trigger avoidance, adherence" value={counseling} onChange={(e) => setCounseling(e.target.value)} />
            </div>
          </TabsContent>

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
              <Input placeholder="Resp. Rate" value={vitals.rr} onChange={(e) => setVitals({ ...vitals, rr: e.target.value })} />
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