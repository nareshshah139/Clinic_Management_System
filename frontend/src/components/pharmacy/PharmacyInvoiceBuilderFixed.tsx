'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search, 
  Plus, 
  Trash2, 
  Save, 
  Send, 
  Calculator,
  User,
  Phone,
  MapPin,
  CreditCard,
  Pill,
  Package as PackageIcon,
  FileText,
  Receipt
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { sortDrugsByRelevance, calculateDrugRelevanceScore, getErrorMessage } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getGlobalPrintStyleTag } from '@/lib/printStyles';

interface Drug {
  id: string;
  name: string;
  price: number;
  manufacturerName: string;
  packSizeLabel: string;
  composition1?: string;
  composition2?: string;
  category?: string;
  dosageForm?: string;
  strength?: string;
}

interface PharmacyPackage {
  id: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  originalPrice: number;
  packagePrice: number;
  discountPercent: number;
  duration?: string;
  instructions?: string;
  indications?: string;
  contraindications?: string;
  items: {
    id: string;
    drugId: string;
    quantity: number;
    dosage?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
    sequence: number;
    drug: Drug;
  }[];
}

interface Patient {
  id: string;
  name: string;
  phone?: string;
}

interface Doctor {
  id: string;
  firstName: string;
  lastName: string;
  department?: string;
}

interface InvoiceItem {
  id: string;
  drugId?: string;
  packageId?: string;
  itemType: 'DRUG' | 'PACKAGE';
  drug?: Drug;
  package?: PharmacyPackage;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

export function PharmacyInvoiceBuilderFixed({ prefill }: { prefill?: { patientId?: string; prescriptionId?: string; doctorId?: string; visitId?: string } }) {
  console.log('🏥 PharmacyInvoiceBuilderFixed initialized with prefill:', prefill);
  
  const { toast } = useToast();
  const [patients, setPatients] = useState<Patient[]>([]);
  const patientsAllRef = useRef<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [packages, setPackages] = useState<PharmacyPackage[]>([]);
  const [searchResults, setSearchResults] = useState<Drug[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [prescriptionItems, setPrescriptionItems] = useState<InvoiceItem[]>([]);
  const [prescriptionData, setPrescriptionData] = useState<any>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [drugSearchQuery, setDrugSearchQuery] = useState('');
  const [showPatientSearchResults, setShowPatientSearchResults] = useState(false);
  const [showDrugSearchResults, setShowDrugSearchResults] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'drugs' | 'packages'>('drugs');
  const [loading, setLoading] = useState(false);
  const [loadingPrescription, setLoadingPrescription] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);

  // Refs for click-outside handling
  const patientSearchRef = useRef<HTMLDivElement>(null);
  const drugSearchRef = useRef<HTMLDivElement>(null);
  const invoiceItemsRef = useRef<InvoiceItem[]>([]);

  // Invoice state
  const [invoiceData, setInvoiceData] = useState({
    patientId: prefill?.patientId || '',
    doctorId: prefill?.doctorId || '',
    prescriptionId: prefill?.prescriptionId || '',
    paymentMethod: 'CASH',
    billingName: '',
    billingPhone: '',
    billingAddress: '',
    billingCity: '',
    billingState: '',
    billingPincode: '',
    notes: '',
  });

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (prefill?.prescriptionId) {
      setInvoiceData(prev => ({ ...prev, prescriptionId: prefill.prescriptionId as string }));
    }
  }, [prefill?.prescriptionId]);

  

  

  const fetchedPrefillPatientsRef = useRef<Set<string>>(new Set());
  const lastPrefilledPrescriptionIdRef = useRef<string | null>(null);

  const ensurePatientSelected = useCallback(
    async (patientId?: string, fallback?: { name?: string; phone?: string }) => {
      if (!patientId) {
        if (fallback?.name || fallback?.phone) {
          setInvoiceData((prev) => ({
            ...prev,
            billingName: fallback.name || prev.billingName,
            billingPhone: fallback.phone || prev.billingPhone,
          }));
        }
        return;
      }

      const existingPatient = patients.find((p) => p.id === patientId);
      if (existingPatient) {
        setSelectedPatient(existingPatient);
        setPatientSearchQuery(`${existingPatient.name}${existingPatient.phone ? ` (${existingPatient.phone})` : ''}`);
        setInvoiceData((prev) => ({
          ...prev,
          patientId: existingPatient.id,
          billingName: existingPatient.name,
          billingPhone: existingPatient.phone || '',
        }));
        return;
      }

      if (fetchedPrefillPatientsRef.current.has(patientId)) {
        return;
      }

      fetchedPrefillPatientsRef.current.add(patientId);
      try {
        const patient = await apiClient.getPatient(patientId) as Patient;
        if (!patient) {
          throw new Error('Patient not found');
        }
        setPatients((prev) => (prev.some((p) => p.id === patient.id) ? prev : [...prev, patient]));
        setSelectedPatient(patient);
        setPatientSearchQuery(`${patient.name}${patient.phone ? ` (${patient.phone})` : ''}`);
        setInvoiceData((prev) => ({
          ...prev,
          patientId: patient.id,
          billingName: patient.name || fallback?.name || '',
          billingPhone: patient.phone || fallback?.phone || '',
        }));
      } catch (error) {
        console.error('Failed to fetch prefill patient', error);
        toast({
          variant: 'destructive',
          title: 'Unable to prefill patient',
          description: 'We could not load the patient linked to this prescription. Select a patient to continue.',
        });
        if (fallback?.name || fallback?.phone) {
          setInvoiceData((prev) => ({
            ...prev,
            billingName: fallback.name || prev.billingName,
            billingPhone: fallback.phone || prev.billingPhone,
          }));
        }
      }
    },
    [patients, toast]
  );

  const loadPrescriptionData = useCallback(async (prescriptionId: string) => {
    setLoadingPrescription(true);
    setPrefillError(null);
    try {
      console.log('📋 Loading prescription data for ID:', prescriptionId);
      type MinimalPrescription = { id?: string; items?: any[] | string } & Record<string, unknown>;
      const prescription = await apiClient.getPrescription<MinimalPrescription>(prescriptionId);
      console.log('✅ Prescription data loaded:', prescription);

      setPrescriptionData(prescription);

      const previousPrefilledMap = new Map<string, InvoiceItem>(
        invoiceItemsRef.current
          .filter((item) => item.id.startsWith('prescription_'))
          .map((item) => [item.id, item])
      );

      setItems((prevItems) => {
        const filtered = prevItems.filter((item) => !item.id.startsWith('prescription_'));
        invoiceItemsRef.current = filtered;
        return filtered;
      });
      setPrescriptionItems([]);

      const patientFromPrescription = (prescription as any)?.patient;
      const patientIdFromPrescription = (prescription as any)?.patientId || patientFromPrescription?.id;
      await ensurePatientSelected(patientIdFromPrescription, {
        name: patientFromPrescription?.name,
        phone: patientFromPrescription?.phone,
      });

      // Extract and set doctor information from prescription
      const doctorFromPrescription = (prescription as any)?.visit?.doctor || (prescription as any)?.doctor;
      const doctorIdFromPrescription = (prescription as any)?.doctorId || doctorFromPrescription?.id;
      if (doctorIdFromPrescription) {
        console.log('📋 Setting doctor from prescription:', doctorIdFromPrescription);
        setInvoiceData((prev) => ({
          ...prev,
          doctorId: doctorIdFromPrescription,
        }));
        // Try to find and set the selected doctor
        const existingDoctor = doctors.find((d) => d.id === doctorIdFromPrescription);
        if (existingDoctor) {
          setSelectedDoctor(existingDoctor);
        }
      }

      const rawItems = (prescription as any)?.items;
      const prescriptionItemsRaw = Array.isArray(rawItems)
        ? rawItems
        : JSON.parse((rawItems as string | undefined) || '[]');

      if (!Array.isArray(prescriptionItemsRaw) || prescriptionItemsRaw.length === 0) {
        setPrefillError('Prescription has no medications to prefill. Add items manually.');
        toast({
          variant: 'warning',
          title: 'Prescription empty',
          description: 'The linked prescription does not contain any medications.',
        });
        return;
      }

      console.log('💊 Processing prescription items:', prescriptionItemsRaw);

      const invoiceItems: (InvoiceItem | null)[] = await Promise.all(
        prescriptionItemsRaw.map(async (item: any, index: number) => {
          try {
            let drug = null;
            if (item.drugName) {
              const drugSearchResult = await apiClient.get<{ data?: Drug[] } | Drug[]>('/drugs', {
                search: item.drugName,
                limit: 1,
                isActive: true,
              });
              const drugList = Array.isArray((drugSearchResult as any)?.data)
                ? ((drugSearchResult as any).data as Drug[])
                : (Array.isArray(drugSearchResult) ? (drugSearchResult as Drug[]) : []);
              drug = drugList[0] || null;
            }

            const invoiceItemId = `prescription_${prescriptionId}_${index}`;
            const existingItem = previousPrefilledMap.get(invoiceItemId);

            const invoiceItem: InvoiceItem = {
              id: invoiceItemId,
              drugId: drug?.id || existingItem?.drugId || undefined,
              itemType: 'DRUG',
              drug:
                drug ||
                existingItem?.drug || {
                  id: existingItem?.drug?.id || `temp_${Date.now()}_${index}`,
                  name: item.drugName || 'Unknown Drug',
                  price: existingItem?.drug?.price ?? 0,
                  manufacturerName: existingItem?.drug?.manufacturerName ?? '',
                  packSizeLabel: existingItem?.drug?.packSizeLabel ?? '',
                },
              quantity: existingItem?.quantity ?? item.quantity ?? 1,
              unitPrice: existingItem?.unitPrice ?? drug?.price ?? 0,
              discountPercent: existingItem?.discountPercent ?? 0,
              taxPercent: existingItem?.taxPercent ?? 18,
              discountAmount: existingItem?.discountAmount ?? 0,
              taxAmount: existingItem?.taxAmount ?? 0,
              totalAmount: existingItem?.totalAmount ?? 0,
              dosage: item.dosage ? `${item.dosage} ${item.dosageUnit || ''}`.trim() : existingItem?.dosage,
              frequency: item.frequency || existingItem?.frequency,
              duration: item.duration ? `${item.duration} ${item.durationUnit || ''}`.trim() : existingItem?.duration,
              instructions: item.instructions || existingItem?.instructions,
            };

            calculateItemTotal(invoiceItem);
            return invoiceItem;
          } catch (error) {
            console.error('Error processing prescription item:', item, error);
            return null;
          }
        })
      );

      const validItems = invoiceItems.filter((item) => item !== null) as InvoiceItem[];
      console.log('💊 Valid prescription items created:', validItems.length);

      setPrescriptionItems(validItems);
      setItems((prevItems) => {
        const filtered = prevItems.filter((item) => !item.id.startsWith('prescription_'));
        const merged = [...validItems, ...filtered];
        invoiceItemsRef.current = merged;
        return merged;
      });

    } catch (error) {
      console.error('❌ Failed to load prescription data:', error);
      setPrefillError('We could not load the prescription details. You can still bill manually.');
      toast({
        variant: 'destructive',
        title: 'Prescription load failed',
        description: 'The linked prescription could not be loaded. Add items manually or retry.',
      });
    } finally {
      setLoadingPrescription(false);
    }
  }, [ensurePatientSelected, toast]);

  // Ensure patient is selected when patients array is loaded
  useEffect(() => {
    const prefillPatientId = prefill?.patientId;
    if (prefillPatientId && patients.length > 0 && !selectedPatient) {
      void ensurePatientSelected(prefillPatientId);
    }
  }, [prefill?.patientId, patients, selectedPatient, ensurePatientSelected]);

  // Handle visitId prefill: fetch visit to set patient/doctor; if visit has prescription, load items
  useEffect(() => {
    const run = async () => {
      const visitId = prefill?.visitId;
      if (!visitId) return;
      try {
        const visit: any = await apiClient.get(`/visits/${visitId}`);
        const patient = visit?.patient;
        if (patient?.id) {
          await ensurePatientSelected(patient.id, { name: patient.name, phone: patient.phone });
        }
        const doc = visit?.doctor;
        if (doc?.id) {
          setSelectedDoctor((prev) => prev || { id: doc.id, firstName: doc.firstName, lastName: doc.lastName, department: doc.department });
          setInvoiceData(prev => ({ ...prev, doctorId: doc.id }));
        }
        const prescId = visit?.prescription?.id;
        if (prescId) {
          lastPrefilledPrescriptionIdRef.current = prescId;
          await loadPrescriptionData(prescId);
          setInvoiceData(prev => ({ ...prev, prescriptionId: prescId }));
        }
      } catch (e) {
        console.error('Failed to prefill from visitId', e);
      }
    };
    void run();
  }, [prefill?.visitId, ensurePatientSelected, loadPrescriptionData]);

  useEffect(() => {
    const prefillPrescriptionId = prefill?.prescriptionId;
    if (!prefillPrescriptionId) {
      return;
    }
    if (lastPrefilledPrescriptionIdRef.current === prefillPrescriptionId) {
      return;
    }
    lastPrefilledPrescriptionIdRef.current = prefillPrescriptionId;
    void loadPrescriptionData(prefillPrescriptionId);
  }, [prefill?.prescriptionId, loadPrescriptionData]);

  // Ensure doctor is selected when doctors array is loaded or prefill changes
  useEffect(() => {
    const prefillDoctorId = prefill?.doctorId;
    if (!prefillDoctorId || doctors.length === 0) return;
    if (selectedDoctor && selectedDoctor.id === prefillDoctorId) return;
    const match = doctors.find((d) => d.id === prefillDoctorId);
    if (match) {
      setSelectedDoctor(match);
      setInvoiceData((prev) => ({ ...prev, doctorId: match.id }));
    }
  }, [prefill?.doctorId, doctors, selectedDoctor]);

  useEffect(() => {
    invoiceItemsRef.current = items;
  }, [items]);

  // Debounced server-side patient autocomplete
  useEffect(() => {
    const q = patientSearchQuery.trim();
    const handler = setTimeout(async () => {
      try {
        if (q.length < 2) {
          setPatients(patientsAllRef.current);
          return;
        }
        const res = await apiClient.getPatients({ limit: 20, search: q });
        const data = (res as any)?.data || (res as any)?.patients || [];
        if (Array.isArray(data)) {
          setPatients(data);
        }
      } catch (_e) {
        // ignore errors to avoid noisy UX
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [patientSearchQuery]);

  const loadInitialData = async () => {
    try {
      const [patientsRes, doctorsRes, drugsRes, packagesRes] = await Promise.all([
        apiClient.getPatients({ limit: 100 }),
        apiClient.getUsers({ role: 'DOCTOR', limit: 50 }),
        apiClient.get('/drugs', { limit: 100, isActive: true }),
        apiClient.get('/pharmacy/packages', { limit: 100, isActive: true })
      ]);

      const patientsData = (patientsRes as any)?.data || (patientsRes as any)?.patients || [];
      const doctorsData = (doctorsRes as any)?.users || [];
      const drugsData = Array.isArray((drugsRes as any)?.data) ? (drugsRes as any).data : [];
      const packagesData = Array.isArray((packagesRes as any)?.packages)
        ? (packagesRes as any).packages
        : Array.isArray((packagesRes as any)?.data)
        ? (packagesRes as any).data
        : [];

      setPatients(patientsData);
      patientsAllRef.current = patientsData;
      setDoctors(doctorsData);
      setDrugs(drugsData);
      setPackages(packagesData);

      // Set prefilled patient
      if (prefill?.patientId) {
        const patient = patientsData.find((p: Patient) => p.id === prefill.patientId);
        if (patient) {
          setSelectedPatient(patient);
          setPatientSearchQuery(`${patient.name}${patient.phone ? ` (${patient.phone})` : ''}`);
          setInvoiceData(prev => ({
            ...prev,
            patientId: patient.id,
            billingName: patient.name,
            billingPhone: patient.phone || ''
          }));
          console.log('🎯 Pre-selected patient:', patient.name);
        }
      }
      
      // Set prefilled doctor
      if (prefill?.doctorId) {
        const doctor = doctorsData.find((d: Doctor) => d.id === prefill.doctorId);
        if (doctor) {
          setSelectedDoctor(doctor);
          setInvoiceData(prev => ({
            ...prev,
            doctorId: doctor.id
          }));
          console.log('🎯 Pre-selected doctor:', `${doctor.firstName} ${doctor.lastName}`);
        }
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  const loadPatients = async () => {
    try {
      const response = await apiClient.get('/patients', { limit: 100 });
      if (response && Array.isArray((response as any).data)) {
        setPatients((response as any).data);
        patientsAllRef.current = (response as any).data;
      } else {
        console.warn('Invalid patients response format:', response);
        setPatients([]);
        patientsAllRef.current = [];
      }
    } catch (error) {
      console.error('Error loading patients:', error);
      setPatients([]);
      patientsAllRef.current = [];
    }
  };

  const loadDoctors = async () => {
    try {
      const response = await apiClient.get('/users', { role: 'DOCTOR', limit: 100 });
      if (response && Array.isArray((response as any).users)) {
        setDoctors((response as any).users);
      } else {
        console.warn('Invalid doctors response format:', response);
        setDoctors([]);
      }
    } catch (error) {
      console.error('Error loading doctors:', error);
      setDoctors([]);
    }
  };

  const loadPackages = async () => {
    try {
      const response = await apiClient.get('/pharmacy/packages', { category: 'Dermatology', limit: 50 });
      if (response && Array.isArray((response as any).packages)) {
        setPackages((response as any).packages);
      } else {
        console.warn('Invalid packages response format:', response);
        setPackages([]);
      }
    } catch (error) {
      console.error('Error loading packages:', error);
      setPackages([]);
    }
  };

  const searchDrugs = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowDrugSearchResults(false);
      return;
    }

    try {
      const response = await apiClient.get('/drugs', {
        search: query,
        limit: 50, // Increased limit to get more results for better relevance sorting
        isActive: true
      });
      if (response && Array.isArray((response as any).data)) {
        // Apply relevance-based sorting
        const sortedResults = sortDrugsByRelevance((response as any).data, query);
        // Take top 20 most relevant results
        setSearchResults(sortedResults.slice(0, 20));
        setShowDrugSearchResults(true);
      } else {
        console.warn('Invalid drugs response format:', response);
        setSearchResults([]);
        setShowDrugSearchResults(false);
      }
    } catch (error) {
      console.error('Error searching drugs:', error);
      setSearchResults([]);
      setShowDrugSearchResults(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (selectedTab === 'drugs') {
        searchDrugs(drugSearchQuery);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [drugSearchQuery, selectedTab]);

  // Click-outside and keyboard handler for search dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Close patient search dropdown if clicked outside
      if (patientSearchRef.current && !patientSearchRef.current.contains(target)) {
        setShowPatientSearchResults(false);
      }
      
      // Close drug search dropdown if clicked outside
      if (drugSearchRef.current && !drugSearchRef.current.contains(target)) {
        if (selectedTab === 'drugs') {
          setShowDrugSearchResults(false);
        }
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Close dropdowns on Escape key
      if (event.key === 'Escape') {
        setShowPatientSearchResults(false);
        setShowDrugSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedTab]);

  const generateItemId = () => `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Highlight matching text in search results
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim() || !text) return text;
    
    const regex = new RegExp(`(${query.split(/\s+/).map(word => 
      word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    ).join('|')})`, 'gi');
    
    const parts = text.split(regex);
    return parts.map((part, index) => 
      regex.test(part) ? 
        <span key={index} className="bg-yellow-200 font-semibold">{part}</span> : 
        part
    );
  };

  // Get relevance badge for search results
  const getRelevanceBadge = (drug: any, query: string, index: number) => {
    if (index === 0) return <Badge variant="default" className="text-xs ml-2 bg-green-100 text-green-800">Best Match</Badge>;
    if (index < 3) return <Badge variant="secondary" className="text-xs ml-2 bg-blue-100 text-blue-800">High Match</Badge>;
    return null;
  };

  const addDrugToInvoice = (drug: Drug) => {
    const existingItemIndex = items.findIndex(
      item => item.itemType === 'DRUG' && item.drugId === drug.id
    );
    
    if (existingItemIndex !== -1) {
      // Increase quantity if already exists
      const updatedItems = [...items];
      updatedItems[existingItemIndex].quantity += 1;
      calculateItemTotal(updatedItems[existingItemIndex]);
      setItems(updatedItems);
    } else {
      // Add new item
      const newItem: InvoiceItem = {
        id: generateItemId(),
        drugId: drug.id,
        itemType: 'DRUG',
        drug,
        quantity: 1,
        unitPrice: drug.price,
        discountPercent: 0,
        taxPercent: 18, // Default GST
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
      };
      
      calculateItemTotal(newItem);
      setItems([...items, newItem]);
    }

    setDrugSearchQuery('');
    setShowDrugSearchResults(false);
  };

  const addPackageToInvoice = (pkg: PharmacyPackage) => {
    const existingItemIndex = items.findIndex(
      item => item.itemType === 'PACKAGE' && item.packageId === pkg.id
    );
    
    if (existingItemIndex !== -1) {
      // Increase quantity if already exists
      const updatedItems = [...items];
      updatedItems[existingItemIndex].quantity += 1;
      calculateItemTotal(updatedItems[existingItemIndex]);
      setItems(updatedItems);
    } else {
      // Add new item
      const newItem: InvoiceItem = {
        id: generateItemId(),
        packageId: pkg.id,
        itemType: 'PACKAGE',
        package: pkg,
        quantity: 1,
        unitPrice: pkg.packagePrice,
        discountPercent: 0,
        taxPercent: 18, // Default GST
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
        instructions: pkg.instructions,
      };
      
      calculateItemTotal(newItem);
      setItems([...items, newItem]);
    }
  };

  const calculateItemTotal = (item: InvoiceItem) => {
    const subtotal = item.quantity * item.unitPrice;
    item.discountAmount = (subtotal * item.discountPercent) / 100;
    const discountedAmount = subtotal - item.discountAmount;
    item.taxAmount = (discountedAmount * item.taxPercent) / 100;
    item.totalAmount = discountedAmount + item.taxAmount;
  };

  const updateItemQuantity = (itemId: string, quantity: number, itemType: 'DRUG' | 'PACKAGE') => {
    const updatedItems = items.map(item => {
      if (item.id === itemId) {
        const updatedItem = { ...item, quantity: Math.max(1, quantity) };
        calculateItemTotal(updatedItem);
        return updatedItem;
      }
      return item;
    });
    setItems(updatedItems);
  };

  const updateItemDiscount = (itemId: string, discountPercent: number) => {
    const updatedItems = items.map(item => {
      if (item.id === itemId) {
        const updatedItem = { ...item, discountPercent: Math.max(0, Math.min(100, discountPercent)) };
        calculateItemTotal(updatedItem);
        return updatedItem;
      }
      return item;
    });
    setItems(updatedItems);
  };

  const updateItemTax = (itemId: string, taxPercent: number) => {
    const updatedItems = items.map(item => {
      if (item.id === itemId) {
        const updatedItem = { ...item, taxPercent: Math.max(0, Math.min(100, taxPercent)) };
        calculateItemTotal(updatedItem);
        return updatedItem;
      }
      return item;
    });
    setItems(updatedItems);
  };

  const removeItem = (itemId: string) => {
    // Check if this is a prescription item (sticky - cannot be removed)
    const isPrescriptionItem = prescriptionItems.some(item => item.id === itemId);
    if (isPrescriptionItem) {
      toast({
        variant: 'warning',
        title: 'Action not allowed',
        description: 'Prescription items cannot be removed. Adjust quantity or pricing instead.'
      });
      return;
    }
    
    setItems(items.filter(item => item.id !== itemId));
  };

  const calculateInvoiceTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const totalDiscount = items.reduce((sum, item) => sum + item.discountAmount, 0);
    const totalTax = items.reduce((sum, item) => sum + item.taxAmount, 0);
    const grandTotal = subtotal - totalDiscount + totalTax;

    return { subtotal, totalDiscount, totalTax, grandTotal };
  };

  const handleCreateInvoice = async () => {
    try {
      console.log('🔍 Starting invoice creation...');
      console.log('🔍 Current invoice data:', invoiceData);
      console.log('🔍 Current items:', items);
      
      if (!invoiceData.patientId || items.length === 0 || !invoiceData.billingName || !invoiceData.billingPhone) {
        toast({
          title: "Validation Error",
          description: !invoiceData.patientId
            ? "Patient is required"
            : items.length === 0
            ? "At least one item is required"
            : !invoiceData.billingName
            ? "Billing name is required"
            : "Billing phone is required",
          variant: "destructive",
        });
        return;
      }

      // Filter out items with temporary drugIds (not found in DB)
      const validItems = items.filter(item => {
        if (item.itemType === 'PACKAGE') return !!item.packageId;
        // Check if drugId is valid (not temp)
        const hasValidDrugId = item.drugId && !item.drugId.startsWith('temp_');
        return hasValidDrugId;
      });

      if (validItems.length === 0) {
        toast({
          title: "Validation Error",
          description: "No valid items to invoice. Please ensure all drugs exist in the database.",
          variant: "destructive",
        });
        return;
      }

      if (validItems.length < items.length) {
        const skippedCount = items.length - validItems.length;
        toast({
          title: "Warning",
          description: `${skippedCount} item(s) skipped because the drug was not found in the database. Please add missing drugs first.`,
          variant: "destructive",
        });
        return;
      }

      setLoading(true);

      const invoiceItems = validItems
        .filter((it) => (it.itemType === 'DRUG' ? Boolean(it.drugId) : Boolean(it.packageId)))
        .map(item => ({
          drugId: item.drugId,
          packageId: item.packageId,
          itemType: item.itemType,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent,
          taxPercent: item.taxPercent,
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
          instructions: item.instructions,
        }));

      const invoicePayload = {
        ...invoiceData,
        items: invoiceItems,
      };

      console.log('📤 Sending invoice payload:', JSON.stringify(invoicePayload, null, 2));
      console.log('📋 Invoice data includes:', {
        patientId: invoicePayload.patientId,
        doctorId: invoicePayload.doctorId,
        prescriptionId: invoicePayload.prescriptionId,
        itemCount: invoicePayload.items?.length
      });

      const createdInvoice: any = await apiClient.post('/pharmacy/invoices', invoicePayload);

      // Fetch saved invoice to ensure printed data matches backend totals
      let printableInvoice: any = createdInvoice;
      try {
        if (createdInvoice?.id) {
          printableInvoice = await apiClient.getPharmacyInvoiceById(createdInvoice.id);
        }
      } catch (e) {
        // Fallback to created response if fetch fails
      }

      toast({
        title: "Success",
        description: `Invoice ${printableInvoice?.invoiceNumber || ''} created successfully`,
      });

      // Open print preview using saved invoice data
      if (printableInvoice) {
        openPrintPreview(printableInvoice, validItems);
      }

      // Notify dashboard to refresh stats
      if (typeof window !== 'undefined') {
        const ev = new CustomEvent('pharmacy-dashboard-refresh');
        window.dispatchEvent(ev);
        const ev2 = new CustomEvent('pharmacy-invoices-refresh');
        window.dispatchEvent(ev2);
      }

      // Reset form
      setInvoiceData({
        patientId: '',
        doctorId: '',
        prescriptionId: '',
        paymentMethod: 'CASH',
        billingName: '',
        billingPhone: '',
        billingAddress: '',
        billingCity: '',
        billingState: '',
        billingPincode: '',
        notes: '',
      });
      setItems([]);

    } catch (error: any) {
      const message = getErrorMessage(error);
      const status = error?.status;
      const body = error?.body;
      const meta: Record<string, unknown> = {};
      if (typeof status === 'number') meta.status = status;
      if (typeof body === 'string' && body.length > 0) meta.body = body;
      if (body && typeof body === 'object' && Object.keys(body).length > 0) meta.body = body;
      if (Object.keys(meta).length > 0) {
        console.error('❌ Error creating invoice:', message, meta);
      } else {
        console.error('❌ Error creating invoice:', message);
      }
      toast({
        title: "Error Creating Invoice",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderPrintHtml = (invoice: any, itemsData: InvoiceItem[]) => {
    const dateStr = new Date(invoice.createdAt || invoice.invoiceDate || Date.now()).toLocaleDateString();
    
    const itemsRows = itemsData.map((item) => {
      const itemName = item.itemType === 'PACKAGE' 
        ? (item.package?.name || 'Unknown Package')
        : (item.drug?.name || 'Unknown Drug');
      
      return `
        <tr>
          <td style="padding:6px;border:1px solid #ddd;">${itemName}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:center;">${item.quantity}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${item.unitPrice.toFixed(2)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${item.discountPercent || 0}%</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${item.taxPercent || 0}%</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${item.totalAmount.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    const totals = {
      subtotal: invoice.subtotal || 0,
      totalDiscount: invoice.discountAmount || 0,
      totalTax: invoice.taxAmount || 0,
      grandTotal: invoice.totalAmount || 0,
    };

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Invoice ${invoice?.invoiceNumber || ''}</title>
          ${getGlobalPrintStyleTag()}
          <style>
            @media print {
              body { margin: 12mm; }
              .no-print { display: none; }
            }
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            h1 { 
              margin-bottom: 8px;
              color: #1a1a1a;
            }
            .invoice-header {
              border-bottom: 2px solid #333;
              padding-bottom: 12px;
              margin-bottom: 20px;
            }
            .muted { 
              color: #666;
              font-size: 14px;
            }
            .billing-section {
              margin: 20px 0;
              padding: 15px;
              background: #f9f9f9;
              border-radius: 4px;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-top: 20px;
            }
            th { 
              background: #f5f5f5;
              font-weight: bold;
              padding: 10px 6px !important;
            }
            th, td {
              border: 1px solid #ddd;
            }
            .totals-section {
              margin-top: 20px;
              text-align: right;
              padding: 15px;
              background: #f9f9f9;
              border-radius: 4px;
            }
            .totals-section div {
              margin: 8px 0;
            }
            .grand-total {
              font-size: 20px;
              font-weight: bold;
              color: #1a1a1a;
              border-top: 2px solid #333;
              padding-top: 12px;
              margin-top: 12px;
            }
            .print-button {
              margin: 20px 0;
              padding: 12px 24px;
              background: #2563eb;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 16px;
            }
            .print-button:hover {
              background: #1d4ed8;
            }
          </style>
        </head>
        <body style="--print-header-height: 28mm;">
          <div class="print-fixed-header">
            <div class="invoice-header">
              <h1>Pharmacy Invoice</h1>
              <div class="muted">
                <strong>Invoice #:</strong> ${invoice?.invoiceNumber || ''}<br/>
                <strong>Date:</strong> ${dateStr}
              </div>
            </div>
          </div>
          <div class="print-content">
          
          <div class="billing-section">
            <strong>Bill To:</strong><br />
            <div style="margin-top: 8px;">
              ${invoiceData.billingName}<br/>
              ${invoiceData.billingPhone}${invoiceData.billingAddress ? '<br/>' + invoiceData.billingAddress : ''}
            </div>
          </div>

          <button class="print-button no-print" onclick="window.print()">🖨️ Print Invoice</button>

          <table>
            <thead>
              <tr>
                <th style="text-align:left;">Item</th>
                <th style="width: 80px;">Qty</th>
                <th style="text-align:right;width: 100px;">Unit Price</th>
                <th style="text-align:right;width: 80px;">Disc%</th>
                <th style="text-align:right;width: 80px;">Tax%</th>
                <th style="text-align:right;width: 120px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div class="totals-section">
            <div><strong>Subtotal:</strong> ₹${totals.subtotal.toFixed(2)}</div>
            <div><strong>Discount:</strong> -₹${totals.totalDiscount.toFixed(2)}</div>
            <div><strong>Tax:</strong> ₹${totals.totalTax.toFixed(2)}</div>
            <div class="grand-total"><strong>Grand Total:</strong> ₹${totals.grandTotal.toFixed(2)}</div>
          </div>

          ${invoiceData.notes ? `
            <div style="margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 4px;">
              <strong>Notes:</strong><br/>
              ${invoiceData.notes}
            </div>
          ` : ''}
          </div>
        </body>
      </html>
    `;
  };

  const openPrintPreview = (invoice: any, itemsData: InvoiceItem[]) => {
    try {
      const win = window.open('', '_blank');
      if (!win) {
        toast({
          title: "Print Preview Blocked",
          description: "Please allow pop-ups to view the invoice",
          variant: "destructive",
        });
        return;
      }
      const html = renderPrintHtml(invoice, itemsData);
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (e) {
      console.error('Failed to open print preview', e);
      toast({
        title: "Error",
        description: "Failed to open print preview",
        variant: "destructive",
      });
    }
  };

  const { subtotal, totalDiscount, totalTax, grandTotal } = calculateInvoiceTotals();

  const isPrescriptionItem = (itemId: string) => {
    return prescriptionItems.some(item => item.id === itemId);
  };

  const renderPrescriptionHeader = () => {
    if (!prescriptionData) return null;
    
    return (
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-blue-800">Linked Prescription</h3>
        </div>
        <div className="text-sm text-blue-700">
          <p><strong>Prescription ID:</strong> {prescriptionData.id}</p>
          <p><strong>Items from prescription:</strong> {prescriptionItems.length}</p>
          <p className="mt-2 text-xs text-blue-600">
            💡 Items from prescription are marked with 📋 and cannot be removed (only quantities/pricing can be adjusted)
          </p>
        </div>
      </div>
    );
  };

  return (
    <Card>
      {loadingPrescription && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600"></div>
            <span className="text-yellow-800">Loading prescription data...</span>
          </div>
        </div>
      )}
      
      {renderPrescriptionHeader()}
      
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Pill className="h-5 w-5" />
          New Pharmacy Invoice with Packages
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {prefillError && (
            <div className="lg:col-span-3">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900">
                {prefillError}
              </div>
            </div>
          )}
          {/* Left Column - Invoice Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Patient & Doctor Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Patient & Doctor Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="patient">Patient *</Label>
                    <div className="relative" ref={patientSearchRef}>
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="patient"
                        placeholder="Search patients by name or phone..."
                        className="pl-8"
                        value={patientSearchQuery}
                        onChange={(e) => setPatientSearchQuery(e.target.value)}
                        onFocus={() => setShowPatientSearchResults(true)}
                      />
                      {showPatientSearchResults && (
                        <div className="absolute z-20 mt-1 w-full bg-white border rounded-md max-h-64 overflow-auto shadow-lg transition-all duration-200 ease-in-out animate-in fade-in-0 slide-in-from-top-1">
                          {patients
                            .filter(p => {
                              const q = patientSearchQuery.trim().toLowerCase();
                              if (!q) return true;
                              return p.name.toLowerCase().includes(q) || (p.phone || '').includes(q);
                            })
                            .slice(0, 20)
                            .map(p => (
                            <div
                              key={p.id}
                              className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                              onMouseDown={() => {
                                setInvoiceData(prev => ({ ...prev, patientId: p.id, billingName: p.name, billingPhone: p.phone || '' }));
                                setPatientSearchQuery(`${p.name}${p.phone ? ` (${p.phone})` : ''}`);
                                setShowPatientSearchResults(false);
                              }}
                            >
                              <div className="font-medium">{p.name}</div>
                              <div className="text-xs text-muted-foreground">{p.phone || ''}</div>
                            </div>
                          ))}
                          {patients.length === 0 && (
                            <div className="px-3 py-2 text-sm text-muted-foreground">No patients found</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="doctor">Doctor</Label>
                     <Select 
                      value={invoiceData.doctorId} 
                      onValueChange={(value: string) => setInvoiceData(prev => ({ ...prev, doctorId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select doctor" />
                      </SelectTrigger>
                      <SelectContent>
                        {doctors.map(doctor => (
                          <SelectItem key={doctor.id} value={doctor.id}>
                            Dr. {doctor.firstName} {doctor.lastName}
                            {doctor.department && ` (${doctor.department})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Add Items */}
            <Card>
              <CardHeader>
                <CardTitle>Add Items to Invoice</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs value={selectedTab} onValueChange={(value: 'drugs' | 'packages') => setSelectedTab(value)}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="drugs" className="flex items-center gap-2">
                      <Pill className="h-4 w-4" />
                      Individual Drugs
                    </TabsTrigger>
                    <TabsTrigger value="packages" className="flex items-center gap-2">
                      <PackageIcon className="h-4 w-4" />
                      Treatment Packages
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="drugs" className="space-y-4">
                    <div ref={drugSearchRef}>
                      <Label htmlFor="drugSearch">Search Drugs</Label>
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="drugSearch"
                          placeholder="Search by drug name, manufacturer, or ingredient..."
                          value={drugSearchQuery}
                          onChange={(e) => setDrugSearchQuery(e.target.value)}
                          className="pl-8"
                        />
                      </div>
                    </div>
                    
                    {showDrugSearchResults && searchResults.length > 0 && (
                      <div className="border rounded-md max-h-60 overflow-y-auto transition-all duration-200 ease-in-out animate-in fade-in-0 slide-in-from-top-1">
                        {searchResults.map((drug, index) => (
                          <div
                            key={drug.id}
                            className={`p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 ${
                              index === 0 ? 'bg-green-50 border-l-4 border-l-green-500' : 
                              index < 3 ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                            }`}
                            onClick={() => addDrugToInvoice(drug)}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center">
                                  <h4 className="font-medium">
                                    {highlightMatch(drug.name, drugSearchQuery)}
                                  </h4>
                                  {getRelevanceBadge(drug, drugSearchQuery, index)}
                                </div>
                                <p className="text-sm text-gray-600">
                                  {highlightMatch(drug.manufacturerName || '', drugSearchQuery)} • {drug.packSizeLabel}
                                </p>
                                {drug.composition1 && (
                                  <p className="text-xs text-gray-500">
                                    {highlightMatch(drug.composition1, drugSearchQuery)}
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="font-semibold">₹{drug.price}</div>
                                {drug.category && (
                                  <Badge variant="outline" className="text-xs">
                                    {highlightMatch(drug.category, drugSearchQuery)}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="packages" className="space-y-4">
                    <div className="space-y-3">
                      {packages.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <PackageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No packages available</p>
                        </div>
                      ) : (
                        packages.map((pkg) => (
                          <div
                            key={pkg.id}
                            className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                            onClick={() => addPackageToInvoice(pkg)}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <h4 className="font-medium">{pkg.name}</h4>
                                <p className="text-sm text-gray-600">{pkg.description}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="secondary" className="text-xs">
                                    {pkg.subcategory}
                                  </Badge>
                                  <span className="text-xs text-gray-500">
                                    {pkg.items.length} items
                                  </span>
                                  {pkg.duration && (
                                    <span className="text-xs text-gray-500">
                                      • {pkg.duration}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm text-gray-500 line-through">
                                  ₹{pkg.originalPrice.toFixed(2)}
                                </div>
                                <div className="font-semibold">
                                  ₹{pkg.packagePrice.toFixed(2)}
                                </div>
                                <Badge variant="destructive" className="text-xs">
                                  {pkg.discountPercent.toFixed(0)}% OFF
                                </Badge>
                              </div>
                            </div>
                            
                            {pkg.indications && (
                              <p className="text-xs text-gray-500 mt-2">
                                <strong>For:</strong> {pkg.indications}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Invoice Items */}
            {items.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Invoice Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {items.map((item) => (
                      <Card key={item.id} className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {isPrescriptionItem(item.id) && (
                                <span className="text-blue-600 text-lg" title="From Prescription">📋</span>
                              )}
                              {item.itemType === 'DRUG' ? (
                                <Pill className="h-4 w-4 text-blue-500" />
                              ) : (
                                <PackageIcon className="h-4 w-4 text-green-500" />
                              )}
                              <h4 className="font-medium">
                                {item.itemType === 'DRUG' ? item.drug?.name : item.package?.name}
                              </h4>
                              {item.drugId && item.drugId.startsWith('temp_') && (
                                <Badge variant="destructive" className="text-xs">
                                  ⚠️ Not in DB
                                </Badge>
                              )}
                              <Badge variant={item.itemType === 'DRUG' ? 'outline' : 'default'}>
                                {item.itemType}
                              </Badge>
                              {isPrescriptionItem(item.id) && (
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                  Prescription
                                </Badge>
                              )}
                            </div>
                            {item.itemType === 'DRUG' && item.drug && (
                              <p className="text-sm text-gray-600">
                                {item.drug.manufacturerName} • {item.drug.packSizeLabel}
                              </p>
                            )}
                            {item.itemType === 'PACKAGE' && item.package && (
                              <p className="text-sm text-gray-600">
                                {item.package.description} • {item.package.items.length} items
                              </p>
                            )}
                            
                            {/* Prescription-specific information */}
                            {isPrescriptionItem(item.id) && (
                              <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
                                {item.dosage && <div><strong>Dosage:</strong> {item.dosage}</div>}
                                {item.frequency && <div><strong>Frequency:</strong> {item.frequency}</div>}
                                {item.duration && <div><strong>Duration:</strong> {item.duration}</div>}
                                {item.instructions && <div><strong>Instructions:</strong> {item.instructions}</div>}
                              </div>
                            )}
                          </div>
                          {isPrescriptionItem(item.id) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled
                              title="Prescription items cannot be removed"
                              className="text-gray-400 cursor-not-allowed"
                            >
                              🔒
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItem(item.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          <div>
                            <Label className="text-xs">Quantity</Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateItemQuantity(item.id, parseInt(e.target.value) || 1, item.itemType)}
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Unit Price</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.unitPrice}
                              readOnly
                              className="h-8 bg-gray-50"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Discount %</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={item.discountPercent}
                              onChange={(e) => updateItemDiscount(item.id, parseFloat(e.target.value) || 0)}
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Tax %</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={item.taxPercent}
                              onChange={(e) => updateItemTax(item.id, parseFloat(e.target.value) || 0)}
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Total</Label>
                            <Input
                              value={`₹${item.totalAmount.toFixed(2)}`}
                              readOnly
                              className="h-8 bg-gray-50 font-medium"
                            />
                          </div>
                        </div>

                        {item.itemType === 'PACKAGE' && item.package && (
                          <div className="mt-3 p-3 bg-gray-50 rounded">
                            <h5 className="text-sm font-medium mb-2">Package Contents:</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                              {item.package.items
                                .sort((a, b) => a.sequence - b.sequence)
                                .map((packageItem) => (
                                <div key={packageItem.id} className="flex justify-between">
                                  <span>{packageItem.drug.name}</span>
                                  <span>×{packageItem.quantity}</span>
                                </div>
                              ))}
                            </div>
                            {item.package.instructions && (
                              <p className="text-xs text-gray-600 mt-2">
                                <strong>Instructions:</strong> {item.package.instructions}
                              </p>
                            )}
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Summary & Billing */}
          <div className="space-y-6">
            {/* Invoice Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Invoice Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Discount:</span>
                    <span>-₹{totalDiscount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax:</span>
                    <span>₹{totalTax.toFixed(2)}</span>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Total:</span>
                      <span>₹{grandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Billing Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Billing Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="billingName">Billing Name *</Label>
                  <Input
                    id="billingName"
                    value={invoiceData.billingName}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, billingName: e.target.value }))}
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <Label htmlFor="billingPhone">Phone *</Label>
                  <Input
                    id="billingPhone"
                    value={invoiceData.billingPhone}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, billingPhone: e.target.value }))}
                    placeholder="Phone number"
                  />
                </div>
                <div>
                  <Label htmlFor="paymentMethod">Payment Method</Label>
                  <Select 
                    value={invoiceData.paymentMethod} 
                    onValueChange={(value: 'CASH' | 'CARD' | 'UPI' | 'NETBANKING') => setInvoiceData(prev => ({ ...prev, paymentMethod: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="CARD">Card</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="NETBANKING">Net Banking</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={invoiceData.notes}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Additional notes..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="space-y-2">
              <Button
                onClick={handleCreateInvoice}
                disabled={loading || !invoiceData.patientId || items.length === 0}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating Invoice...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Create Invoice
                  </>
                )}
              </Button>
              <p className="text-xs text-gray-500 text-center">
                {items.length} items • ₹{grandTotal.toFixed(2)} total
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 