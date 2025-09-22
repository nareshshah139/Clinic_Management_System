'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Mic, 
  MicOff, 
  Save, 
  FileText, 
  User, 
  Clock, 
  Stethoscope, 
  Activity, 
  Heart, 
  Thermometer, 
  Scale, 
  Gauge,
  Plus,
  X,
  Check,
  AlertCircle,
  Calendar,
  MapPin,
  Phone,
  Mail,
  FileImage,
  Trash2,
  Eye,
  Download,
  Edit,
  Copy,
  CheckCircle,
  XCircle,
  Printer,
  Camera,
  Upload,
  ChevronUp,
  ChevronDown,
  History,
  Image
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import VisitPhotos from '@/components/visits/VisitPhotos';

interface Props {
  patientId: string;
  doctorId: string;
  userRole?: string;
  visitNumber?: number;
  patientName?: string;
  visitDate?: string; // ISO string; falls back to today if not provided
  appointmentId?: string;
  appointmentData?: any;
}

interface PatientHistory {
  id: string;
  date: string;
  doctor: string;
  visitType: string;
  diagnosis: string[];
  status: string;
  photos: number;
}

const DERM_DIAGNOSES = [
  'Acne vulgaris','Atopic dermatitis','Psoriasis','Tinea corporis','Melasma','Post-inflammatory hyperpigmentation','Urticaria','Rosacea','Seborrheic dermatitis','Lichen planus','Vitiligo'
];

const MORPHOLOGY = ['Macule','Papule','Pustule','Nodule','Plaque','Vesicle','Scale','Erosion','Ulcer','Comedo'];
const DISTRIBUTION = ['Face','Scalp','Neck','Trunk','Arms','Legs','Hands','Feet','Flexures','Extensors','Generalized'];
const FITZPATRICK = ['I','II','III','IV','V','VI'];

const ROLE_PERMISSIONS = {
  THERAPIST: ['vitals', 'photos', 'basic-assessment'],
  NURSE: ['vitals', 'photos', 'basic-assessment', 'complaints'],
  DOCTOR: ['all'],
  RECEPTION: ['photos', 'basic-info'],
  ADMIN: ['all'],
  OWNER: ['all'],
};

export default function MedicalVisitForm({ patientId, doctorId, userRole = 'DOCTOR', visitNumber = 1, patientName = '', visitDate, appointmentId, appointmentData }: Props) {
  console.log('🏥 MedicalVisitForm props:', { patientId, patientName, appointmentId, appointmentData: !!appointmentData });
  
  // Core visit data
  const [visitId, setVisitId] = useState<string | null>(null);
  const [currentVisitNumber, setCurrentVisitNumber] = useState(visitNumber);
  const [visitStatus, setVisitStatus] = useState<'draft' | 'in-progress' | 'completed'>('draft');
  
  // Form sections state
  const [activeTab, setActiveTab] = useState('overview');
  const [completedSections, setCompletedSections] = useState<Set<string>>(new Set());
  
  // Basic info (Therapist/Nurse level - 20-25%)
  const [vitals, setVitals] = useState({
    bpS: '', bpD: '', hr: '', temp: '', weight: '', height: '', spo2: '', rr: ''
  });
  const [painScore, setPainScore] = useState('');
  const [skinConcerns, setSkinConcerns] = useState<Set<string>>(new Set());
  
  // Complaints (Nurse+ level - 35-40%)
  const [complaints, setComplaints] = useState<string[]>([]);

  // Doctor level (remaining 75-80%)
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');

  // Dermatology-specific
  const [skinType, setSkinType] = useState<string>('');
  const [morphology, setMorphology] = useState<Set<string>>(new Set());
  const [distribution, setDistribution] = useState<Set<string>>(new Set());
  const [acneSeverity, setAcneSeverity] = useState<string>('');
  const [itchScore, setItchScore] = useState<string>('');
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
  const [reviewDate, setReviewDate] = useState<string>('');
  
  // Patient history
  const [patientHistory, setPatientHistory] = useState<PatientHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [saving, setSaving] = useState(false);

  // Print customization (moved from PrescriptionBuilder)
  const [printBgUrl, setPrintBgUrl] = useState<string>('/letterhead.png');
  const [printTopMarginPx, setPrintTopMarginPx] = useState<number>(150);
  const [builderRefreshKey, setBuilderRefreshKey] = useState(0);

  // Patient context sidebar
  const [showPatientContext, setShowPatientContext] = useState(true);
  const [patientDetails, setPatientDetails] = useState<any>(null);
  const [recentVisits, setRecentVisits] = useState<any[]>([]);

  // Quick templates for common scenarios
  const [showQuickTemplates, setShowQuickTemplates] = useState(false);
  
  // Voice-to-text functionality
  const [isListening, setIsListening] = useState(false);
  const [activeVoiceField, setActiveVoiceField] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
   
  // Do not access JWT on client; rely on HttpOnly cookie sent automatically
 
  const startVoiceInput = async (fieldName: string) => {
    // Toggle: if already recording the same field, stop and finalize
    if (isListening && activeVoiceField === fieldName && recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch {}
      return;
    }

    if (!navigator.mediaDevices || !(window as any).MediaRecorder) {
      alert('Microphone recording is not supported in this browser');
      return;
    }
    setIsListening(true);
    setActiveVoiceField(fieldName);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const chunks: BlobPart[] = [];
      const mimeType = (window as any).MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
        ((window as any).MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } as any : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        try { stream.getTracks().forEach(t => t.stop()); } catch {}
        streamRef.current = null;
        recorderRef.current = null;
        const blob = new Blob(chunks, { type: 'audio/webm' });
        try {
           const baseUrl = '/api';
           const fd = new FormData();
           fd.append('file', blob, mimeType === 'audio/mp4' ? 'speech.m4a' : 'speech.webm');
           const res = await fetch(`${baseUrl}/visits/transcribe`, {
             method: 'POST',
             body: fd,
             credentials: 'include',
           });
           if (!res.ok) {
             let errText = '';
             try { errText = await res.text(); } catch {}
             console.error('Transcription request failed:', res.status, errText);
             alert(`Transcription failed (${res.status}).`);
             return;
           }
           const data = await res.json();
           const text = (data?.text as string) || '';
           if (text) {
             switch (fieldName) {
               case 'subjective':
                 setSubjective(prev => (prev ? prev + ' ' : '') + text);
                 break;
               case 'objective':
                 setObjective(prev => (prev ? prev + ' ' : '') + text);
                 break;
               case 'assessment':
                 setAssessment(prev => (prev ? prev + ' ' : '') + text);
                 break;
               case 'plan':
                 setPlan(prev => (prev ? prev + ' ' : '') + text);
                 break;
             }
           }
        } catch (e) {
          console.error('Speech-to-text error:', e);
          alert('Speech-to-text failed. Please try again.');
        } finally {
          setIsListening(false);
          setActiveVoiceField(null);
        }
      };
      recorder.start();
      // Auto-stop after 30s or when button clicked again (toggle)
      setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, 30000);
    } catch (e) {
      setIsListening(false);
      setActiveVoiceField(null);
      try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
      recorderRef.current = null;
      streamRef.current = null;
    }
  };
  
  const VoiceButton = ({ fieldName }: { fieldName: string }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`ml-2 ${activeVoiceField === fieldName ? 'bg-red-100 text-red-600' : ''}`}
      onClick={() => startVoiceInput(fieldName)}
      disabled={isListening && activeVoiceField !== fieldName}
    >
      {activeVoiceField === fieldName ? '🔴' : '🎤'}
    </Button>
  );

  const quickTemplates = [
    {
      name: 'Acne Follow-up',
      condition: () => recentVisits.some(v => v.diagnosis?.some((d: string) => d.toLowerCase().includes('acne'))),
      apply: () => {
        setSubjective('Follow-up for acne treatment. Patient reports improvement/worsening.');
        setDermDx(new Set(['Acne vulgaris']));
        setMorphology(new Set(['Papule', 'Pustule', 'Comedo']));
        setDistribution(new Set(['Face']));
      }
    },
    {
      name: 'Routine Dermatology Check',
      condition: () => true,
      apply: () => {
        setSubjective('General dermatological consultation. Patient seeking skin assessment.');
        setSkinConcerns(new Set(['General assessment']));
      }
    },
    {
      name: 'Pigmentation Concern',
      condition: () => recentVisits.some(v => v.diagnosis?.some((d: string) => d.toLowerCase().includes('melasma') || d.toLowerCase().includes('pigment'))),
      apply: () => {
        setSubjective('Pigmentation concerns. Patient reports dark spots/patches.');
        setDermDx(new Set(['Melasma', 'Post-inflammatory hyperpigmentation']));
        setMorphology(new Set(['Macule']));
        setDistribution(new Set(['Face']));
      }
    }
  ];

  // Check permissions for current user role
  const hasPermission = (section: string) => {
    const permissions = ROLE_PERMISSIONS[userRole as keyof typeof ROLE_PERMISSIONS] || [];
    return permissions.includes('all') || permissions.includes(section);
  };

  // Load visit number and patient history
  useEffect(() => {
    loadPatientHistory();
    loadPatientContext();
  }, [patientId]);

  // Reload patient context when patientId changes (for appointment transitions)
  useEffect(() => {
    if (patientId && patientId !== patientDetails?.id) {
      console.log('�� Patient ID changed, reloading context. New ID:', patientId, 'Current:', patientDetails?.id);
      loadPatientContext();
    }
  }, [patientId, patientDetails?.id]);

  const loadPatientContext = async () => {
    if (!patientId) {
      console.warn('⚠️ No patientId provided for patient context loading');
      return;
    }
    
    console.log('📥 Loading patient context for patientId:', patientId);
    try {
      const [patient, visits] = await Promise.all([
        apiClient.getPatient(patientId),
        apiClient.get(`/visits/patient/${patientId}/history?limit=3`)
      ]);
      console.log('✅ Patient data loaded:', patient);
      console.log('📚 Recent visits loaded:', visits);
      setPatientDetails(patient);
      setRecentVisits((visits as any).visits || []);
    } catch (error) {
      console.error('❌ Failed to load patient context:', error);
      // Try to get basic patient info from appointment data if available
      if (appointmentData?.patient) {
        console.log('�� Using patient data from appointment:', appointmentData.patient);
        setPatientDetails(appointmentData.patient);
      }
    }
  };

  const loadPatientHistory = async () => {
    if (!patientId) {
      console.warn('No patientId provided for patient history loading');
      return;
    }
    
    try {
      setLoadingHistory(true);
      const response = await apiClient.get(`/visits/patient/${patientId}/history`);
      const responseData = response as any;
      setPatientHistory(responseData.visits || []);
      setCurrentVisitNumber((responseData.visits?.length || 0) + 1);
    } catch (error) {
      console.error('Failed to load patient history:', error);
      setPatientHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Section completion tracking
  const markSectionComplete = (section: string) => {
    setCompletedSections(prev => new Set([...prev, section]));
  };

  const isSectionComplete = (section: string) => {
    return completedSections.has(section);
  };

  // Calculate overall progress
  const getProgress = () => {
    const totalSections = hasPermission('all') ? 6 : 3; // Doctor vs Therapist/Nurse
    return Math.round((completedSections.size / totalSections) * 100);
  };

  const buildPayload = () => {
    const payload: any = {
      patientId,
      doctorId,
      appointmentId, // Include appointment ID if available
      visitNumber: currentVisitNumber,
      status: visitStatus,
      complaints: (complaints.length > 0 ? complaints : (subjective && subjective.trim()) ?
        [{ complaint: subjective }] :
        [{ complaint: 'General consultation' }]),
      examination: {
        ...(objective ? { generalAppearance: objective } : {}),
        dermatology: {
          skinType: skinType || undefined,
          morphology: Array.from(morphology),
          distribution: Array.from(distribution),
          acneSeverity: acneSeverity || undefined,
          itchScore: itchScore ? Number(itchScore) : undefined,
          painScore: painScore ? Number(painScore) : undefined,
          triggers: triggers || undefined,
          priorTreatments: priorTx || undefined,
          skinConcerns: Array.from(skinConcerns),
        }
      },
      diagnosis: (dermDx.size > 0 ? Array.from(dermDx) : (assessment ? [assessment] : []))
        .map((dx: string) => ({ diagnosis: dx, icd10Code: 'R69', type: 'Primary' })),
      treatmentPlan: {
        ...(plan ? { notes: plan } : {}),
        dermatology: {
          procedures: procType ? [{ 
            type: procType, 
            fluence: fluence ? Number(fluence) : undefined, 
            spotSize: spotSize ? Number(spotSize) : undefined, 
            passes: passes ? Number(passes) : undefined 
          }] : [],
          medications: {
            topicals: topicals || undefined,
            systemics: systemics || undefined,
          },
          counseling: counseling || undefined,
          // follow-up date handled at visit completion; prescription gets reviewDate via prop
        }
      },
      vitals: {
        systolicBP: vitals.bpS ? Number(vitals.bpS) : undefined,
        diastolicBP: vitals.bpD ? Number(vitals.bpD) : undefined,
        heartRate: vitals.hr ? Number(vitals.hr) : undefined,
        temperature: vitals.temp ? Number(vitals.temp) : undefined,
        weight: vitals.weight ? Number(vitals.weight) : undefined,
        height: vitals.height ? Number(vitals.height) : undefined,
        respiratoryRate: vitals.rr ? Number(vitals.rr) : undefined,
      },
      photos: [], // Photos are now managed by VisitPhotos component
      metadata: {
        capturedBy: userRole,
        sections: Array.from(completedSections),
        progress: getProgress(),
      }
    };
    return payload;
  };

  const save = async (complete = false) => {
    try {
      setSaving(true);
      const payload = buildPayload();
      
      let visit;
      if (visitId) {
        visit = await apiClient.updateVisit(visitId, payload);
      } else {
        visit = await apiClient.createVisit(payload);
        setVisitId((visit as any).id);
      }
      
      if (complete) {
        const completePayload: any = {};
        if (reviewDate) completePayload.followUpDate = reviewDate;
        await apiClient.completeVisit((visit as any).id, completePayload);
        setVisitStatus('completed');
      } else {
        setVisitStatus('in-progress');
      }
      
      alert(complete ? 'Visit completed successfully!' : 'Visit saved successfully!');
      
      // Refresh patient history
      loadPatientHistory();
    } catch (e) {
      console.error('Save failed:', e);
      alert('Failed to save visit. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Render tabs based on user role
  const renderTabs = () => {
    const tabs = [
      { id: 'overview', label: 'Overview', icon: Eye, always: true },
    ];

    if (hasPermission('vitals') || hasPermission('all')) {
      tabs.push({ id: 'vitals', label: 'Vitals', icon: Stethoscope, always: false });
    }

    if (hasPermission('photos') || hasPermission('all')) {
      tabs.push({ id: 'photos', label: 'Photos', icon: Camera, always: false });
    }

    if (hasPermission('basic-assessment') || hasPermission('all')) {
      tabs.push({ id: 'assessment', label: 'Assessment', icon: FileText, always: false });
    }

    if (hasPermission('all')) {
      tabs.push(
        { id: 'dermatology', label: 'Dermatology', icon: User, always: false },
        { id: 'treatment', label: 'Treatment', icon: FileText, always: false }
      );
      tabs.push({ id: 'prescription', label: 'Prescription', icon: FileText, always: false });
      tabs.push({ id: 'customization', label: 'Customization', icon: FileText, always: false });
    }

    tabs.push({ id: 'history', label: 'History', icon: History, always: true });

    return tabs;
  };

  return (
    <div className="flex gap-6">
      {/* Patient Context Sidebar */}
      {showPatientContext && (
        <div className="w-80 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Patient Context</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowPatientContext(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {patientDetails && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">{patientDetails.name}</span>
                    <Badge variant="outline" className="text-xs">ID: {patientId}</Badge>
                  </div>
                  <div className="text-sm text-gray-600">
                    Age: {patientDetails.dob ? new Date().getFullYear() - new Date(patientDetails.dob).getFullYear() : 'N/A'} • {patientDetails.gender || 'N/A'}
                  </div>
                  <div className="text-sm text-gray-600">
                    Phone: {patientDetails.phone || 'N/A'}
                  </div>
                  {patientDetails.allergies && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded">
                      <div className="text-xs font-medium text-red-800">⚠️ ALLERGIES</div>
                      <div className="text-sm text-red-700">{patientDetails.allergies}</div>
                    </div>
                  )}
                  {patientDetails.medicalHistory && (
                    <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                      <div className="text-xs font-medium text-blue-800">Medical History</div>
                      <div className="text-sm text-blue-700">{patientDetails.medicalHistory}</div>
                    </div>
                  )}
                </div>
              )}
              
              {!patientDetails && patientId && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <div className="text-xs font-medium text-yellow-800">⚠️ Patient Loading</div>
                  <div className="text-sm text-yellow-700">
                    Loading patient data for ID: {patientId}
                    {patientName && <div className="mt-1">Name: {patientName}</div>}
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="mt-2"
                    onClick={loadPatientContext}
                  >
                    Retry Loading
                  </Button>
                </div>
              )}
              
              {!patientDetails && !patientId && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded">
                  <div className="text-xs font-medium text-gray-600">No Patient Selected</div>
                  <div className="text-sm text-gray-500">
                    Patient context will appear when a patient is selected
                  </div>
                </div>
              )}
              
              {recentVisits.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Recent Visits</div>
                  {recentVisits.slice(0, 2).map((visit, index) => (
                    <div key={visit.id} className="p-2 bg-gray-50 rounded text-xs">
                      <div className="font-medium">
                        {new Date(visit.date).toLocaleDateString()}
                      </div>
                      <div className="text-gray-600">
                        {visit.diagnosis?.slice(0, 2).join(', ') || 'No diagnosis'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Main Content */}
      <div className={`flex-1 space-y-6 ${showPatientContext ? '' : 'max-w-none'}`}>
        {!showPatientContext && (
          <Button variant="outline" size="sm" onClick={() => setShowPatientContext(true)} className="mb-4">
            <User className="h-4 w-4 mr-2" />
            Show Patient Context
          </Button>
        )}
        
        {/* Quick Templates */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Quick Start Templates</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowQuickTemplates(!showQuickTemplates)}>
                {showQuickTemplates ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          {showQuickTemplates && (
            <CardContent className="pt-0">
              <div className="space-y-2">
                {quickTemplates
                  .filter(template => template.condition())
                  .map((template, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={template.apply}
                    >
                      <FileText className="h-3 w-3 mr-2" />
                      {template.name}
                    </Button>
                  ))}
              </div>
            </CardContent>
          )}
        </Card>

      {/* Visit Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Visit #{currentVisitNumber}
                <Badge variant={visitStatus === 'completed' ? 'default' : visitStatus === 'in-progress' ? 'secondary' : 'outline'}>
                  {visitStatus.replace('-', ' ').toUpperCase()}
                </Badge>
                {appointmentData && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    <Calendar className="h-3 w-3 mr-1" />
                    Linked to Appointment
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Medical Visit Documentation • Role: {userRole} • Progress: {getProgress()}%
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">0 Photos</Badge>
              <div className="w-20 bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${getProgress()}%` }}
                />
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Form */}
      <Card>
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6 flex flex-wrap gap-2">
              {renderTabs().map(tab => {
                const IconComponent = tab.icon;
                return (
                  <TabsTrigger 
                    key={tab.id} 
                    value={tab.id}
                    className="flex items-center gap-2"
                  >
                    <IconComponent className="h-4 w-4" />
                    {tab.label}
                    {isSectionComplete(tab.id) && (
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Visit Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Visit Number:</span>
                      <Badge variant="outline">#{currentVisitNumber}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Status:</span>
                      <Badge variant={visitStatus === 'completed' ? 'default' : 'secondary'}>
                        {visitStatus.replace('-', ' ').toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Photos Captured:</span>
                      <span className="text-sm font-medium">0</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Captured By:</span>
                      <span className="text-sm font-medium">{userRole}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Progress Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      {renderTabs().slice(1, -1).map(tab => (
                        <div key={tab.id} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{tab.label}:</span>
                          <div className="flex items-center gap-2">
                            {isSectionComplete(tab.id) ? (
                              <Badge variant="default" className="text-xs">Complete</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">Pending</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Overall Progress:</span>
                        <span className="text-sm font-bold text-blue-600">{getProgress()}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${getProgress()}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Quick Actions */}
    <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {hasPermission('vitals') && (
                      <Button variant="outline" onClick={() => setActiveTab('vitals')}>
                        <Stethoscope className="h-4 w-4 mr-2" />
                        Record Vitals
                      </Button>
                    )}
                    {hasPermission('photos') && (
                      <Button variant="outline" onClick={() => setActiveTab('photos')}>
                        <Camera className="h-4 w-4 mr-2" />
                        Capture Photos
                      </Button>
                    )}
                    {hasPermission('all') && (
                      <Button variant="outline" onClick={() => setActiveTab('dermatology')}>
                        <User className="h-4 w-4 mr-2" />
                        Dermatology Assessment
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Vitals Tab */}
            {(hasPermission('vitals') || hasPermission('all')) && (
              <TabsContent value="vitals" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                    <label className="text-sm font-medium text-gray-700">BP Systolic</label>
                    <Input 
                      placeholder="mmHg" 
                      value={vitals.bpS} 
                      onChange={(e) => setVitals({ ...vitals, bpS: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">BP Diastolic</label>
                    <Input 
                      placeholder="mmHg" 
                      value={vitals.bpD} 
                      onChange={(e) => setVitals({ ...vitals, bpD: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Heart Rate</label>
                    <Input 
                      placeholder="bpm" 
                      value={vitals.hr} 
                      onChange={(e) => setVitals({ ...vitals, hr: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Temperature</label>
                    <Input 
                      placeholder="°F" 
                      value={vitals.temp} 
                      onChange={(e) => setVitals({ ...vitals, temp: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Weight</label>
                    <Input 
                      placeholder="kg" 
                      value={vitals.weight} 
                      onChange={(e) => setVitals({ ...vitals, weight: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Height</label>
                    <Input 
                      placeholder="cm" 
                      value={vitals.height} 
                      onChange={(e) => setVitals({ ...vitals, height: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">BMI</label>
                    <Input
                      placeholder="kg/m²"
                      readOnly
                      value={(() => {
                        const h = Number(vitals.height);
                        const w = Number(vitals.weight);
                        if (h > 0 && w > 0) {
                          const m = h / 100;
                          const bmi = w / (m * m);
                          return bmi.toFixed(1);
                        }
                        return '';
                      })()}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Resp. Rate</label>
                    <Input 
                      placeholder="/min" 
                      value={vitals.rr} 
                      onChange={(e) => setVitals({ ...vitals, rr: e.target.value })} 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Pain Score (0-10)</label>
                    <Input 
                      placeholder="0-10" 
                      value={painScore} 
                      onChange={(e) => setPainScore(e.target.value)} 
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={async () => { await save(false); markSectionComplete('vitals'); setBuilderRefreshKey((k) => k + 1); }}>
                    Mark Vitals Complete
                  </Button>
                </div>
              </TabsContent>
            )}

            {/* Photos Tab */}
            {(hasPermission('photos') || hasPermission('all')) && (
              <TabsContent value="photos" className="space-y-4">
                <VisitPhotos 
                  visitId={visitId || 'temp'} 
                  onVisitNeeded={async () => {
                    if (!visitId) {
                      const payload = buildPayload();
                      const newVisit = await apiClient.createVisit(payload);
                      const newVisitId = (newVisit as any).id;
                      setVisitId(newVisitId);
                      return newVisitId;
                    }
                    return visitId;
                  }}
                />
              </TabsContent>
            )}

            {/* Assessment Tab - Basic for Therapist/Nurse */}
            {(hasPermission('basic-assessment') || hasPermission('all')) && (
              <TabsContent value="assessment" className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Skin Concerns</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['Acne', 'Pigmentation', 'Aging', 'Dryness', 'Sensitivity', 'Redness', 'Scarring'].map(concern => (
                      <Button
                        key={concern}
                        type="button"
                        variant={skinConcerns.has(concern) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleSet(skinConcerns, concern, setSkinConcerns)}
                      >
                        {concern}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Initial Assessment Notes</label>
                  <div className="flex items-center">
                    <Textarea 
                      placeholder="Basic observations, patient concerns, preliminary findings..."
                      value={subjective}
                      onChange={(e) => setSubjective(e.target.value)}
                      rows={4}
                    />
                    <VoiceButton fieldName="subjective" />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => markSectionComplete('assessment')}>
                    Mark Assessment Complete
                  </Button>
                </div>
              </TabsContent>
            )}

            {/* Dermatology Tab - Doctor Only */}
            {hasPermission('all') && (
              <TabsContent value="dermatology" className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Fitzpatrick Skin Type</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {FITZPATRICK.map(ft => (
                        <Button 
                          key={ft} 
                          type="button" 
                          variant={skinType === ft ? 'default' : 'outline'} 
                          size="sm" 
                          onClick={() => setSkinType(skinType === ft ? '' : ft)}
                        >
                          {ft}
                        </Button>
                  ))}
                </div>
              </div>
              <div>
                    <label className="text-sm font-medium text-gray-700">Acne Severity</label>
                    <Input 
                      placeholder="mild/moderate/severe" 
                      value={acneSeverity} 
                      onChange={(e) => setAcneSeverity(e.target.value)} 
                    />
              </div>
              <div>
                    <label className="text-sm font-medium text-gray-700">Itch Score (0-10)</label>
                    <Input 
                      placeholder="0-10" 
                      value={itchScore} 
                      onChange={(e) => setItchScore(e.target.value)} 
                    />
              </div>
            </div>

            <div>
                  <label className="text-sm font-medium text-gray-700">Morphology</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {MORPHOLOGY.map(m => (
                      <Button 
                        key={m} 
                        type="button" 
                        variant={morphology.has(m) ? 'default' : 'outline'} 
                        size="sm" 
                        onClick={() => toggleSet(morphology, m, setMorphology)}
                      >
                        {m}
                      </Button>
                ))}
              </div>
            </div>

            <div>
                  <label className="text-sm font-medium text-gray-700">Distribution / Body Areas</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {DISTRIBUTION.map(d => (
                      <Button 
                        key={d} 
                        type="button" 
                        variant={distribution.has(d) ? 'default' : 'outline'} 
                        size="sm" 
                        onClick={() => toggleSet(distribution, d, setDistribution)}
                      >
                        {d}
                      </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                    <label className="text-sm font-medium text-gray-700">Triggers</label>
                    <Input 
                      placeholder="Heat, stress, cosmetics..." 
                      value={triggers} 
                      onChange={(e) => setTriggers(e.target.value)} 
                    />
              </div>
              <div>
                    <label className="text-sm font-medium text-gray-700">Prior Treatments</label>
                    <Input 
                      placeholder="Topicals/systemics tried" 
                      value={priorTx} 
                      onChange={(e) => setPriorTx(e.target.value)} 
                    />
              </div>
            </div>

            <div>
                  <label className="text-sm font-medium text-gray-700">Dermatology Diagnoses</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {DERM_DIAGNOSES.map(dx => (
                      <Button 
                        key={dx} 
                        type="button" 
                        variant={dermDx.has(dx) ? 'default' : 'outline'} 
                        size="sm" 
                        onClick={() => toggleSet(dermDx, dx, setDermDx)}
                      >
                        {dx}
                      </Button>
                ))}
              </div>
            </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Detailed Examination</label>
                  <div className="flex items-center">
                    <Textarea 
                      placeholder="Detailed physical examination findings..."
                      value={objective}
                      onChange={(e) => setObjective(e.target.value)}
                      rows={3}
                    />
                    <VoiceButton fieldName="objective" />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => markSectionComplete('dermatology')}>
                    Mark Dermatology Complete
                  </Button>
                </div>
              </TabsContent>
            )}

            {/* Treatment Tab - Doctor Only */}
            {hasPermission('all') && (
              <TabsContent value="treatment" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                    <label className="text-sm font-medium text-gray-700">Planned Procedure</label>
                    <Input 
                      placeholder="e.g., Q-switched Nd:YAG, IPL, CO2, Diode" 
                      value={procType} 
                      onChange={(e) => setProcType(e.target.value)} 
                    />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                      <label className="text-sm font-medium text-gray-700">Fluence</label>
                      <Input 
                        placeholder="J/cm²" 
                        value={fluence} 
                        onChange={(e) => setFluence(e.target.value)} 
                      />
                </div>
                <div>
                      <label className="text-sm font-medium text-gray-700">Spot Size</label>
                      <Input 
                        placeholder="mm" 
                        value={spotSize} 
                        onChange={(e) => setSpotSize(e.target.value)} 
                      />
                </div>
                <div>
                      <label className="text-sm font-medium text-gray-700">Passes</label>
                      <Input 
                        placeholder="#" 
                        value={passes} 
                        onChange={(e) => setPasses(e.target.value)} 
                      />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                    <label className="text-sm font-medium text-gray-700">Topicals</label>
                    <Textarea 
                      placeholder="e.g., Adapalene, Benzoyl peroxide, Azelaic acid" 
                      value={topicals} 
                      onChange={(e) => setTopicals(e.target.value)} 
                    />
              </div>
              <div>
                    <label className="text-sm font-medium text-gray-700">Systemics</label>
                    <Textarea 
                      placeholder="e.g., Doxycycline, Isotretinoin, Antihistamines" 
                      value={systemics} 
                      onChange={(e) => setSystemics(e.target.value)} 
                    />
              </div>
            </div>

            <div>
                  <label className="text-sm font-medium text-gray-700">Treatment Plan</label>
                  <Textarea 
                    placeholder="Comprehensive treatment plan and recommendations..."
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    rows={3}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Counseling / Lifestyle Advice</label>
                  <Textarea 
                    placeholder="Sun protection, emollients, trigger avoidance, adherence" 
                    value={counseling} 
                    onChange={(e) => setCounseling(e.target.value)} 
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => markSectionComplete('treatment')}>
                    Mark Treatment Complete
                  </Button>
            </div>
          </TabsContent>
            )}

            {/* Prescription Tab - Doctor Only */}
            {hasPermission('all') && (
              <TabsContent value="prescription" className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Prescription</CardTitle>
                    <CardDescription>Create and format prescriptions tied to this visit</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PrescriptionBuilder 
                      patientId={patientId}
                      doctorId={doctorId}
                      visitId={visitId}
                      reviewDate={reviewDate}
                      printBgUrl={printBgUrl}
                      printTopMarginPx={printTopMarginPx}
                      onChangeReviewDate={setReviewDate}
                      onCreated={() => markSectionComplete('prescription')}
                      refreshKey={builderRefreshKey}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Customization Tab - Doctor Only */}
            {hasPermission('all') && (
              <TabsContent value="customization" className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Customization Options</CardTitle>
                    <CardDescription>Configure print background and layout (affects Prescription Preview)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <label className="text-sm text-gray-700">Print Background Image URL (optional)</label>
                        <Input placeholder="https://.../letterhead.png" value={printBgUrl} onChange={(e) => setPrintBgUrl(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-sm text-gray-700">Top Margin (px)</label>
                        <Input type="number" min={0} value={printTopMarginPx} onChange={(e) => setPrintTopMarginPx(Number(e.target.value) || 0)} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Patient History Tab */}
            <TabsContent value="history" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Patient Visit History</h3>
                <Button variant="outline" onClick={loadPatientHistory} disabled={loadingHistory}>
                  {loadingHistory ? 'Loading...' : 'Refresh'}
                </Button>
              </div>

              {loadingHistory ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
                  <p>Loading patient history...</p>
                </div>
              ) : patientHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No previous visits found</p>
                  <p className="text-sm">This will be the patient's first visit</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Timeline */}
                  <div className="relative">
                    {patientHistory.map((visit, index) => (
                      <div key={visit.id} className="relative flex items-start space-x-3 pb-4">
                        {/* Timeline line */}
                        {index !== patientHistory.length - 1 && (
                          <div className="absolute left-4 top-8 w-0.5 h-full bg-gray-200" />
                        )}
                        
                        {/* Timeline dot */}
                        <div className={`relative flex items-center justify-center w-8 h-8 rounded-full ${
                          visit.status === 'completed' ? 'bg-green-100 text-green-600' : 
                          visit.status === 'in-progress' ? 'bg-blue-100 text-blue-600' : 
                          'bg-gray-100 text-gray-600'
                        }`}>
                          <div className="w-3 h-3 rounded-full bg-current" />
                        </div>

                        {/* Visit details */}
                        <div className="flex-1 min-w-0">
                          <Card>
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <h4 className="text-sm font-semibold">
                                    Visit #{patientHistory.length - index}
                                  </h4>
                                  <p className="text-xs text-gray-500">
                                    {new Date(visit.date).toLocaleDateString('en-US', {
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {(() => {
                                    const normalizedStatus = typeof visit.status === 'string'
                                      ? visit.status.toLowerCase()
                                      : 'unknown';
                                    const badgeVariant = normalizedStatus === 'completed'
                                      ? 'default'
                                      : normalizedStatus === 'in-progress'
                                      ? 'secondary'
                                      : 'outline';
                                    const statusLabel = typeof visit.status === 'string'
                                      ? visit.status.replace(/-/g, ' ').toUpperCase()
                                      : 'UNKNOWN';
                                    return (
                                      <Badge variant={badgeVariant}>
                                        {statusLabel}
                                      </Badge>
                                    );
                                  })()}
                                  {Number(visit.photos || 0) > 0 && (
                                    <Badge variant="outline" className="text-xs">
                                      {Number(visit.photos)} Photos
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              
                              <div className="space-y-2">
                                <div className="flex items-center text-sm">
                                  <User className="h-4 w-4 mr-2 text-gray-400" />
                                  <span className="text-gray-600">Dr. {typeof visit.doctor === 'string' ? visit.doctor : `${(visit.doctor as any)?.firstName || ''} ${(visit.doctor as any)?.lastName || ''}`}</span>
                                </div>
                                
                                <div className="flex items-center text-sm">
                                  <FileText className="h-4 w-4 mr-2 text-gray-400" />
                                  <span className="text-gray-600">{visit.visitType}</span>
                                </div>
                                
                                {visit.diagnosis.length > 0 && (
                                  <div className="flex items-start text-sm">
                                    <Stethoscope className="h-4 w-4 mr-2 text-gray-400 mt-0.5" />
                                    <div className="flex-1">
                                      <span className="text-gray-600">Diagnosis:</span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {visit.diagnosis.map((dx, i) => (
                                          <Badge key={i} variant="outline" className="text-xs">
                                            {dx}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </TabsContent>
          </Tabs>

          {/* Action Buttons */}
          <div className="flex justify-between items-center pt-6 border-t">
            <div className="text-sm text-gray-500">
              Progress: {getProgress()}% • {completedSections.size} of {hasPermission('all') ? 6 : 3} sections complete
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void save(false)} disabled={saving}>
                {saving ? 'Saving...' : 'Save Draft'}
              </Button>
              {hasPermission('all') && (
                <Button onClick={() => void save(true)} disabled={saving || getProgress() < 80}>
                  {saving ? 'Completing...' : 'Complete Visit'}
                </Button>
              )}
            </div>
        </div>
      </CardContent>
    </Card>
    </div>
  </div>
  );
} 