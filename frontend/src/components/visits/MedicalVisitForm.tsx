'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Camera, Upload, X, Eye, Clock, User, Stethoscope, FileText, Image, History } from 'lucide-react';
import { apiClient } from '@/lib/api';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';

interface Props {
  patientId: string;
  doctorId: string;
  userRole?: string;
  visitNumber?: number;
  patientName?: string;
  visitDate?: string; // ISO string; falls back to today if not provided
}

interface VisitPhoto {
  id: string;
  url: string;
  description: string;
  capturedBy: string;
  capturedAt: string;
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

export default function MedicalVisitForm({ patientId, doctorId, userRole = 'DOCTOR', visitNumber = 1, patientName = '', visitDate }: Props) {
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
  const [basicComplaints, setBasicComplaints] = useState('');
  const [painScore, setPainScore] = useState('');
  const [skinConcerns, setSkinConcerns] = useState<Set<string>>(new Set());
  
  // Photos
  const [photos, setPhotos] = useState<VisitPhoto[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Ensure camera is stopped on unmount and when the page loses visibility
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        stopCamera();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopCamera();
    };
  }, []);

  // Stop camera when navigating away from Photos tab
  useEffect(() => {
    if (activeTab !== 'photos' && isCapturing) {
      stopCamera();
    }
  }, [activeTab, isCapturing]);

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
  const [followUpDays, setFollowUpDays] = useState<string>('');
  
  // Patient history
  const [patientHistory, setPatientHistory] = useState<PatientHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [saving, setSaving] = useState(false);

  // Check permissions for current user role
  const hasPermission = (section: string) => {
    const permissions = ROLE_PERMISSIONS[userRole as keyof typeof ROLE_PERMISSIONS] || [];
    return permissions.includes('all') || permissions.includes(section);
  };

  // Load visit number and patient history
  useEffect(() => {
    loadPatientHistory();
  }, [patientId]);

  const loadPatientHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await apiClient.get(`/visits/patient/${patientId}/history`);
      setPatientHistory(response.visits || []);
      setCurrentVisitNumber((response.visits?.length || 0) + 1);
    } catch (error) {
      console.error('Failed to load patient history:', error);
      setPatientHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Camera functionality
  const startCamera = async () => {
    try {
      // If an old stream exists, stop it before starting anew
      if (videoRef.current?.srcObject) {
        const oldStream = videoRef.current.srcObject as MediaStream;
        oldStream.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
      setIsCapturing(true);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } // Use back camera if available
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait for metadata and ensure playback to get valid frames
        await new Promise<void>((resolve) => {
          const v = videoRef.current!;
          const onReady = () => {
            v.removeEventListener('loadedmetadata', onReady);
            v.play().then(() => resolve()).catch(() => resolve());
          };
          if (v.readyState >= 1) {
            v.play().then(() => resolve()).catch(() => resolve());
          } else {
            v.addEventListener('loadedmetadata', onReady, { once: true });
          }
        });
      }
    } catch (error) {
      console.error('Failed to start camera:', error);
      alert('Failed to access camera. Please check permissions.');
      setIsCapturing(false);
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Ensure a frame is available
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    // Render the current frame
    context.drawImage(video, 0, 0);

    // Convert to blob
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      // Auto-generate default name: PatientName_VisitDate_X
      const safeName = (patientName || 'Patient')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^A-Za-z0-9_\-]/g, '');
      const dateObj = visitDate ? new Date(visitDate) : new Date();
      const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      const idx = photos.length + 1;
      const baseName = `${safeName}_${dateStr}_${idx}`;
      const description = baseName;
      
      try {
        // Ensure we have a visit to attach photos to
        let activeVisitId = visitId;
        if (!activeVisitId) {
          const newVisit = await apiClient.createVisit(buildPayload());
          activeVisitId = newVisit.id;
          setVisitId(activeVisitId);
        }

        // Upload photo to /visits/:id/photos using FormData field 'files'
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const fd = new FormData();
        fd.append('files', blob, `${baseName}.jpg`);
        await fetch(`${baseUrl}/visits/${activeVisitId}/photos`, {
          method: 'POST',
          body: fd,
          headers: token ? { Authorization: `Bearer ${token}` } as any : undefined,
          credentials: 'include',
        });
        
        const newPhoto: VisitPhoto = {
          id: `temp-${Date.now()}`,
          url: URL.createObjectURL(blob),
          description,
          capturedBy: userRole,
          capturedAt: new Date().toISOString(),
        };

        setPhotos(prev => [...prev, newPhoto]);
        stopCamera();
      } catch (error) {
        console.error('Failed to upload photo:', error);
        alert('Failed to save photo. Please try again.');
      }
    }, 'image/jpeg', 0.8);
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCapturing(false);
  };

  const removePhoto = (photoId: string) => {
    setPhotos(prev => prev.filter(p => p.id !== photoId));
  };

  const toggleSet = (s: Set<string>, value: string, setter: (next: Set<string>) => void) => {
    const next = new Set(s);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
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
      visitNumber: currentVisitNumber,
      status: visitStatus,
      complaints: basicComplaints || subjective ? 
        [{ complaint: basicComplaints || subjective }] : 
        [{ complaint: 'General consultation' }],
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
      photos: photos.map(p => ({
        url: p.url,
        description: p.description,
        capturedBy: p.capturedBy,
        capturedAt: p.capturedAt,
      })),
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
        setVisitId(visit.id);
      }
      
      if (complete) {
        await apiClient.completeVisit(visit.id, {});
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
    }

    tabs.push({ id: 'history', label: 'History', icon: History, always: true });

    return tabs;
  };

  return (
    <div className="space-y-6">
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
              </CardTitle>
              <CardDescription>
                Medical Visit Documentation • Role: {userRole} • Progress: {getProgress()}%
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{photos.length} Photos</Badge>
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
                      <span className="text-sm font-medium">{photos.length}</span>
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
                    <label className="text-sm font-medium text-gray-700">SpO2</label>
                    <Input 
                      placeholder="%" 
                      value={vitals.spo2} 
                      onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })} 
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
                  <div>
                    <label className="text-sm font-medium text-gray-700">Basic Complaints</label>
                    <Textarea 
                      placeholder="Patient's main concerns..." 
                      value={basicComplaints} 
                      onChange={(e) => setBasicComplaints(e.target.value)} 
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => markSectionComplete('vitals')}>
                    Mark Vitals Complete
                  </Button>
                </div>
              </TabsContent>
            )}

            {/* Photos Tab */}
            {(hasPermission('photos') || hasPermission('all')) && (
              <TabsContent value="photos" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Visit Photos ({photos.length})</h3>
                  <div className="flex gap-2">
                    {!isCapturing ? (
                      <Button onClick={startCamera}>
                        <Camera className="h-4 w-4 mr-2" />
                        Start Camera
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button onClick={capturePhoto}>
                          <Camera className="h-4 w-4 mr-2" />
                          Capture
                        </Button>
                        <Button variant="outline" onClick={stopCamera}>
                          <X className="h-4 w-4 mr-2" />
                          Stop
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Camera View */}
                {isCapturing && (
                  <div className="relative bg-black rounded-lg overflow-hidden">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      muted
                      className="w-full h-64 object-contain"
                    />
                    <canvas ref={canvasRef} className="hidden" />
                  </div>
                )}

                {/* Photos Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {photos.map((photo) => (
                    <div key={photo.id} className="relative group">
                      <img 
                        src={photo.url} 
                        alt={photo.description}
                        className="w-full h-32 object-contain bg-black rounded-lg border"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all rounded-lg flex items-center justify-center">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removePhoto(photo.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="mt-2">
                        <p className="text-xs text-gray-600 truncate">{photo.description}</p>
                        <p className="text-xs text-gray-400">By: {photo.capturedBy}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {photos.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Image className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No photos captured yet</p>
                    <p className="text-sm">Use the camera to document the visit</p>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button onClick={() => markSectionComplete('photos')}>
                    Mark Photos Complete
                  </Button>
                </div>
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
                  <Textarea 
                    placeholder="Basic observations, patient concerns, preliminary findings..."
                    value={subjective}
                    onChange={(e) => setSubjective(e.target.value)}
                    rows={4}
                  />
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
              <div>
                    <label className="text-sm font-medium text-gray-700">Follow-up (days)</label>
                    <Input 
                      placeholder="e.g., 30" 
                      value={followUpDays} 
                      onChange={(e) => setFollowUpDays(e.target.value)} 
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
                  <Textarea 
                    placeholder="Detailed physical examination findings..."
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    rows={3}
                  />
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
                      onCreated={() => markSectionComplete('prescription')}
                    />
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
                                  <span className="text-gray-600">Dr. {(visit.doctor?.firstName || '')} {(visit.doctor?.lastName || visit.doctor?.name || '')}</span>
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
  );
} 