'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiClient } from '@/lib/api';
import { Zap, User, Activity, Settings, Save, Plus, Trash2 } from 'lucide-react';

// Machine configurations
const MACHINES = {
  'endymed-pro-max': {
    name: 'Endymed Pro Max',
    icon: '⚡',
    parameters: ['Intensity', 'RF', 'Depth', 'Area Treated', 'Mode'],
    maxPasses: 8
  },
  'fotona-starwalker': {
    name: 'Fotona Starwalker',
    icon: '✨',
    parameters: ['Area', 'Spot Size', 'Energy', 'Fluency', 'Frequency', 'Wavelength', 'PTP Mode', 'Area'],
    maxPasses: 8
  },
  'soprano-platinum-lhr': {
    name: 'Soprano Platinum LHR',
    icon: '💫',
    parameters: ['Area', 'Fluence', 'Spot Size'],
    maxPasses: 8
  },
  'hydrafacial': {
    name: 'Hydrafacial',
    icon: '💧',
    parameters: ['Actives Used', 'Area'],
    maxPasses: 1
  }
};

const SKIN_TYPES = {
  fitzpatrick: ['I', 'II', 'III', 'IV', 'V', 'VI'],
  robert: ['Type 1', 'Type 2', 'Type 3', 'Type 4'],
  scar: ['Atrophic', 'Hypertrophic', 'Keloid', 'Rolling', 'Boxcar', 'Ice Pick'],
  herpes: ['Active', 'Inactive', 'History', 'None']
};

const BODY_PARTS = [
  'Face', 'Forehead', 'Cheeks', 'Nose', 'Chin', 'Neck', 'Chest', 'Back', 
  'Arms', 'Legs', 'Hands', 'Feet', 'Abdomen', 'Shoulders', 'Other'
];

interface ProcedureData {
  // Basic Info
  patientId: string;
  doctorId: string;
  therapistId: string; // Actually stores nurse ID (for backend compatibility)
  sessionNo: number;
  bodyPart: string[];
  indications: string;
  
  // Skin Types
  fitzpatrickType: string;
  robertType: string;
  scarType: string;
  herpesStatus: string;
  
  // Shot Counts
  shotCountBegin: number;
  shotCountEnd: number;
  
  // Machine & Parameters
  selectedMachine: string;
  machineParameters: Record<string, any>;
  
  // Notes
  notes: string;
}

export default function SmartProceduresPage() {
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [nurses, setNurses] = useState<any[]>([]);
  const [procedures, setProcedures] = useState<ProcedureData[]>([]);
  const [activeTab, setActiveTab] = useState('new');
  const [visits, setVisits] = useState<any[]>([]);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<any>(null);
  
  // Form state
  const [procedureData, setProcedureData] = useState<ProcedureData>({
    patientId: '',
    doctorId: '',
    therapistId: '', // Keep as therapistId for backend compatibility
    sessionNo: 1,
    bodyPart: [],
    indications: '',
    fitzpatrickType: '',
    robertType: '',
    scarType: '',
    herpesStatus: '',
    shotCountBegin: 0,
    shotCountEnd: 0,
    selectedMachine: '',
    machineParameters: {},
    notes: ''
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [patientsRes, doctorsRes, nursesRes] = await Promise.all([
        apiClient.getPatients({ limit: 100 }),
        apiClient.getUsers({ role: 'DOCTOR', limit: 50 }),
        apiClient.getUsers({ role: 'NURSE', limit: 50 })
      ]);
      
      const patientsData = (patientsRes as any)?.data || (patientsRes as any)?.patients || [];
      const doctorsData = (doctorsRes as any)?.users || [];
      const nursesData = (nursesRes as any)?.users || [];
      
      setPatients(patientsData);
      setDoctors(doctorsData);
      setNurses(nursesData);
      
      // Set defaults
      if (patientsData.length > 0) {
        setProcedureData(prev => ({ ...prev, patientId: patientsData[0].id }));
        loadVisitsWithProcedures(patientsData[0].id);
      }
      if (doctorsData.length > 0) {
        setProcedureData(prev => ({ ...prev, doctorId: doctorsData[0].id }));
      }
      if (nursesData.length > 0) {
        setProcedureData(prev => ({ ...prev, therapistId: nursesData[0].id }));
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const loadVisitsWithProcedures = async (patientId?: string) => {
    if (!patientId) return;
    
    setLoadingVisits(true);
    try {
      console.log('🔍 Loading visits with procedures for patient:', patientId);
      const response = await apiClient.get(`/visits?patientId=${patientId}&limit=50`);
      const visitsData = (response as any)?.visits || (response as any)?.data || [];
      
      // Filter visits that have procedure data
      const visitsWithProcedures = visitsData.filter((visit: any) => {
        const plan = typeof visit.plan === 'string' ? JSON.parse(visit.plan) : visit.plan;
        return plan?.dermatology?.procedures?.length > 0 || plan?.notes;
      });
      
      console.log('📋 Found visits with procedures:', visitsWithProcedures.length);
      setVisits(visitsWithProcedures);
    } catch (error) {
      console.error('❌ Failed to load visits:', error);
      setVisits([]);
    } finally {
      setLoadingVisits(false);
    }
  };

  const updateProcedureData = (field: keyof ProcedureData, value: any) => {
    // If patient changes, reload their visits
    if (field === 'patientId' && value !== procedureData.patientId) {
      loadVisitsWithProcedures(value);
    }
    
    setProcedureData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const updateMachineParameter = (parameterName: string, passNo: number, value: string) => {
    setProcedureData(prev => ({
      ...prev,
      machineParameters: {
        ...prev.machineParameters,
        [parameterName]: {
          ...prev.machineParameters[parameterName],
          [passNo]: value
        }
      }
    }));
  };

  const toggleBodyPart = (part: string) => {
    setProcedureData(prev => ({
      ...prev,
      bodyPart: prev.bodyPart.includes(part)
        ? prev.bodyPart.filter(p => p !== part)
        : [...prev.bodyPart, part]
    }));
  };

  const saveProcedure = async () => {
    if (!procedureData.patientId || !procedureData.doctorId || !procedureData.selectedMachine) {
      alert('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        patientId: procedureData.patientId,
        doctorId: procedureData.doctorId,
        therapistId: procedureData.therapistId,
        treatmentPlan: {
          dermatology: {
            procedures: [{
              type: MACHINES[procedureData.selectedMachine as keyof typeof MACHINES]?.name,
              sessionNo: procedureData.sessionNo,
              bodyPart: procedureData.bodyPart,
              indications: procedureData.indications,
              skinTypes: {
                fitzpatrick: procedureData.fitzpatrickType,
                robert: procedureData.robertType,
                scar: procedureData.scarType,
                herpes: procedureData.herpesStatus
              },
              shotCounts: {
                begin: procedureData.shotCountBegin,
                end: procedureData.shotCountEnd
              },
              machine: procedureData.selectedMachine,
              parameters: procedureData.machineParameters
            }]
          },
          notes: procedureData.notes
        }
      };

      await apiClient.createVisit(payload);
      alert('Procedure saved successfully!');
      
      // Reset form
      setProcedureData({
        ...procedureData,
        sessionNo: procedureData.sessionNo + 1,
        shotCountBegin: 0,
        shotCountEnd: 0,
        machineParameters: {},
        notes: ''
      });
    } catch (error) {
      console.error('Failed to save procedure:', error);
      alert('Failed to save procedure. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const loadProcedureFromVisit = (visit: any) => {
    try {
      const plan = typeof visit.plan === 'string' ? JSON.parse(visit.plan) : visit.plan;
      const exam = typeof visit.exam === 'string' ? JSON.parse(visit.exam) : visit.exam;
      const vitals = typeof visit.vitals === 'string' ? JSON.parse(visit.vitals) : visit.vitals;
      
      const procedure = plan?.dermatology?.procedures?.[0];
      if (!procedure) return;

      // Extract Fitzpatrick type from examination data
      const fitzpatrickType = exam?.dermatology?.skinType || '';
      
      // Map visit data to procedure form
      setProcedureData(prev => ({
        ...prev,
        patientId: visit.patientId,
        doctorId: visit.doctorId,
        sessionNo: 1, // Default since we don't track this in visits yet
        indications: plan?.notes || '',
        fitzpatrickType: fitzpatrickType,
        // Map basic procedure parameters if available
        selectedMachine: procedure.type?.toLowerCase().includes('endymed') ? 'endymed-pro-max' :
                        procedure.type?.toLowerCase().includes('fotona') ? 'fotona-starwalker' :
                        procedure.type?.toLowerCase().includes('soprano') ? 'soprano-platinum-lhr' :
                        procedure.type?.toLowerCase().includes('hydra') ? 'hydrafacial' : '',
        notes: plan?.notes || ''
      }));
      
      // Switch to new procedure tab for editing
      setActiveTab('new');
      setSelectedVisit(visit);
    } catch (error) {
      console.error('Failed to load procedure from visit:', error);
    }
  };
 
  const renderVisitProcedureCard = (visit: any) => {
    try {
      const plan = typeof visit.plan === 'string' ? JSON.parse(visit.plan) : visit.plan;
      const procedure = plan?.dermatology?.procedures?.[0];
      const patient = patients.find(p => p.id === visit.patientId);
      const doctor = doctors.find(d => d.id === visit.doctorId);
      
      return (
        <Card key={visit.id} className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{patient?.name || 'Unknown Patient'}</CardTitle>
                <CardDescription>
                  {new Date(visit.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </CardDescription>
              </div>
              <Badge variant="outline">
                {procedure?.type || 'Procedure'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User className="h-4 w-4" />
                <span>Dr. {doctor?.firstName} {doctor?.lastName}</span>
              </div>
              
              {procedure && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {procedure.fluence && (
                    <div>
                      <span className="text-gray-500">Fluence:</span> {procedure.fluence} J/cm²
                    </div>
                  )}
                  {procedure.spotSize && (
                    <div>
                      <span className="text-gray-500">Spot Size:</span> {procedure.spotSize} mm
                    </div>
                  )}
                  {procedure.passes && (
                    <div>
                      <span className="text-gray-500">Passes:</span> {procedure.passes}
                    </div>
                  )}
                </div>
              )}
              
              {plan?.notes && (
                <p className="text-sm text-gray-600 line-clamp-2">{plan.notes}</p>
              )}
            </div>
            
            <div className="flex gap-2 mt-4">
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => loadProcedureFromVisit(visit)}
              >
                Load & Edit
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => setSelectedVisit(visit)}
              >
                View Details
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    } catch (error) {
      console.error('Error rendering visit card:', error);
      return null;
    }
  };
 
  const renderMachineParametersTable = () => {
    if (!procedureData.selectedMachine) return null;
 
    const machine = MACHINES[procedureData.selectedMachine as keyof typeof MACHINES];
    if (!machine) return null;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-2xl">{machine.icon}</span>
            {machine.name} Parameters
          </CardTitle>
          <CardDescription>Configure parameters for each pass</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 p-2 text-left font-medium">Parameter</th>
                  {Array.from({ length: machine.maxPasses }, (_, i) => (
                    <th key={i} className="border border-gray-300 p-2 text-center font-medium">
                      Pass {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {machine.parameters.map((param, paramIndex) => (
                  <tr key={paramIndex} className={paramIndex % 2 === 0 ? 'bg-white' : 'bg-gray-25'}>
                    <td className="border border-gray-300 p-2 font-medium text-gray-700">
                      {param}
                    </td>
                    {Array.from({ length: machine.maxPasses }, (_, passIndex) => (
                      <td key={passIndex} className="border border-gray-300 p-1">
                        <Input
                          placeholder={`${param.toLowerCase()}`}
                          value={procedureData.machineParameters[param]?.[passIndex + 1] || ''}
                          onChange={(e) => updateMachineParameter(param, passIndex + 1, e.target.value)}
                          className="text-xs"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-blue-600" />
            Smart Procedures Management
          </CardTitle>
          <CardDescription>
            Advanced procedure planning and tracking with machine-specific parameters
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="new">New Procedure</TabsTrigger>
          <TabsTrigger value="history">Procedure History</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Patient *</label>
                <Select value={procedureData.patientId} onValueChange={(value: string) => updateProcedureData('patientId', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Doctor *</label>
                <Select value={procedureData.doctorId} onValueChange={(value: string) => updateProcedureData('doctorId', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        Dr. {d.firstName} {d.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Nurse/Therapist</label>
                <Select value={procedureData.therapistId} onValueChange={(value: string) => updateProcedureData('therapistId', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select nurse" />
                  </SelectTrigger>
                  <SelectContent>
                    {nurses.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.firstName} {t.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Procedure Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Procedure Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Session No.</label>
                  <Input placeholder="Session number" value={procedureData.sessionNo} onChange={(e) => updateProcedureData('sessionNo', parseInt(e.target.value) || 1)} />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Shot Count (Begin)</label>
                  <Input placeholder="e.g. 50" value={procedureData.shotCountBegin} onChange={(e) => updateProcedureData('shotCountBegin', parseInt(e.target.value) || 0)} />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Shot Count (End)</label>
                  <Input placeholder="e.g. 50" value={procedureData.shotCountEnd} onChange={(e) => updateProcedureData('shotCountEnd', parseInt(e.target.value) || 0)} />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Total Shots</label>
                  <Input
                    value={procedureData.shotCountEnd - procedureData.shotCountBegin}
                    disabled
                    className="bg-gray-50"
                  />
                </div>
              </div>

              {/* Body Parts */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Body Parts</label>
                <div className="flex flex-wrap gap-2">
                  {BODY_PARTS.map((part) => (
                    <Button
                      key={part}
                      type="button"
                      variant={procedureData.bodyPart.includes(part) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleBodyPart(part)}
                    >
                      {part}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Indications */}
              <div>
                <label className="text-sm font-medium text-gray-700">Indications</label>
                <Textarea
                  placeholder="Enter procedure indications..."
                  value={procedureData.indications}
                  onChange={(e) => updateProcedureData('indications', e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Skin Types */}
          <Card>
            <CardHeader>
              <CardTitle>Skin Type Assessment</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Fitzpatrick Type</label>
                <Select value={procedureData.fitzpatrickType} onValueChange={(value: string) => updateProcedureData('fitzpatrickType', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SKIN_TYPES.fitzpatrick.map((type) => (
                      <SelectItem key={type} value={type}>
                        Type {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Robert Type</label>
                <Select value={procedureData.robertType} onValueChange={(value: string) => updateProcedureData('robertType', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SKIN_TYPES.robert.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Scar Type</label>
                <Select value={procedureData.scarType} onValueChange={(value: string) => updateProcedureData('scarType', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SKIN_TYPES.scar.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Herpes Status</label>
                <Select value={procedureData.herpesStatus} onValueChange={(value: string) => updateProcedureData('herpesStatus', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {SKIN_TYPES.herpes.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Machine Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Machine Selection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {Object.entries(MACHINES).map(([key, machine]) => (
                  <Button
                    key={key}
                    type="button"
                    variant={procedureData.selectedMachine === key ? 'default' : 'outline'}
                    className="h-20 flex flex-col items-center justify-center"
                    onClick={() => updateProcedureData('selectedMachine', key)}
                  >
                    <span className="text-2xl mb-1">{machine.icon}</span>
                    <span className="text-xs text-center">{machine.name}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Machine Parameters Table */}
          {renderMachineParametersTable()}

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Enter any additional notes or observations..."
                value={procedureData.notes}
                onChange={(e) => updateProcedureData('notes', e.target.value)}
                rows={4}
              />
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button 
              onClick={saveProcedure} 
              disabled={saving}
              size="lg"
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Procedure'}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Procedure History</h3>
              <p className="text-sm text-gray-600">
                Procedures captured from visits ({visits.length} found)
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => loadVisitsWithProcedures(procedureData.patientId)}
              disabled={loadingVisits}
            >
              {loadingVisits ? 'Loading...' : 'Refresh'}
            </Button>
          </div>

          {loadingVisits ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-gray-500">Loading procedure history...</p>
            </div>
          ) : visits.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visits.map(renderVisitProcedureCard)}
            </div>
          ) : (
            <Card>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <Activity className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No procedure history found for this patient</p>
                  <p className="text-sm">Procedures from visits will appear here</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Procedure Analytics</CardTitle>
              <CardDescription>Insights and statistics about procedures</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <Activity className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>Analytics dashboard coming soon</p>
                <p className="text-sm">Track procedure outcomes and performance metrics</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 