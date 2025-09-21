'use client';

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  X, 
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
  Package
} from 'lucide-react';
import { apiClient } from '@/lib/api';

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

interface Patient {
  id: string;
  name: string;
  phone?: string;
  address?: string;
}

interface Doctor {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
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

interface InvoiceItem {
  id?: string;
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

export function PharmacyInvoiceBuilder() {
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Drug[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchMode, setSearchMode] = useState<'name' | 'ingredient' | 'all'>('all');
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const [dropdownMounted, setDropdownMounted] = useState(false);
  const patientBoxRef = useRef<HTMLDivElement>(null);
  const [patientDropdownMounted, setPatientDropdownMounted] = useState(false);
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [showPatientResults, setShowPatientResults] = useState(false);
  const doctorBoxRef = useRef<HTMLDivElement>(null);
  const [doctorDropdownMounted, setDoctorDropdownMounted] = useState(false);
  const [doctorSearchQuery, setDoctorSearchQuery] = useState('');
  const [doctorResults, setDoctorResults] = useState<Doctor[]>([]);
  const [showDoctorResults, setShowDoctorResults] = useState(false);

  // Invoice state
  const [invoiceData, setInvoiceData] = useState({
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

  const [items, setItems] = useState<InvoiceItem[]>([]);

  // Load initial data
  // Load initial data when component mounts
  useEffect(() => {
    loadPatients();
    loadDoctors();
    // Reset form for new invoice
    setInvoiceData({
      patientId: "",
      doctorId: "",
      prescriptionId: "",
      paymentMethod: "CASH",
      billingName: "",
      billingPhone: "",
      billingAddress: "",
      billingCity: "",
      billingState: "",
      billingPincode: "",
      notes: "",
    });
    setItems([]);
  }, []);
  const loadPatients = async () => {
    try {
      const response = await apiClient.getPatients({ limit: 100 }) as unknown as { data?: any[] };
      setPatients(response.data || []);
    } catch (error) {
      console.error('Failed to load patients:', error);
    }
  };

  const loadDoctors = async () => {
    try {
      const response = await apiClient.getUsers({ role: 'DOCTOR', limit: 100 }) as unknown as { data?: any[]; users?: any[] } | any[];
      const list = Array.isArray(response)
        ? response
        : (response?.users || response?.data || []);
      setDoctors(list || []);
    } catch (error) {
      console.error('Failed to load doctors:', error);
      setDoctors([]);
    }
  };

  const loadInvoice = async (id: string) => {
    try {
      setLoading(true);
      // TODO: Implement load invoice API
      console.log('Loading invoice:', id);
    } catch (error) {
      console.error('Failed to load invoice:', error);
    } finally {
      setLoading(false);
    }
  };

  // Drug search functionality
  const searchDrugs = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    try {
      const params: Record<string, any> = {
        q: query.trim(),
        mode: searchMode,
        limit: Math.min(50, Math.max(1, 10)) // Ensure limit is between 1 and 50
      };
      const response = await apiClient.get<Drug[]>('/drugs/autocomplete', params);
      setSearchResults(response || []);
      setShowSearchResults(true);
    } catch (error) {
      console.error('Failed to search drugs:', error);
      setSearchResults([] as Drug[]);
    }
  };

  // Debounced search
  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (searchQuery) {
        searchDrugs(searchQuery);
      }
    }, 300);

    return () => clearTimeout(delayedSearch);
  }, [searchQuery, searchMode]);

  // Debounced patient search
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = patientSearchQuery.trim();
      if (q.length < 2) {
        setPatientResults([]);
        setShowPatientResults(false);
        return;
      }
      try {
        const res = await apiClient.get<{ data?: Patient[] }>('/patients', { limit: 10, search: q });
        setPatientResults(res?.data || []);
        setShowPatientResults(true);
      } catch (err) {
        setPatientResults([]);
        setShowPatientResults(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [patientSearchQuery]);

  // Debounced doctor search
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = doctorSearchQuery.trim();
      if (q.length < 2) {
        setDoctorResults([]);
        setShowDoctorResults(false);
        return;
      }
      try {
        const res = await apiClient.get<{ data?: Doctor[] }>('/users', { limit: 10, role: 'DOCTOR', search: q });
        setDoctorResults(res?.data || []);
        setShowDoctorResults(true);
      } catch (err) {
        setDoctorResults([]);
        setShowDoctorResults(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [doctorSearchQuery]);

  useEffect(() => {
    if (showSearchResults) {
      setDropdownMounted(true);
      return;
    }
    const t = setTimeout(() => setDropdownMounted(false), 150);
    return () => clearTimeout(t);
  }, [showSearchResults]);

  useEffect(() => {
    if (showPatientResults) {
      setPatientDropdownMounted(true);
      return;
    }
    const t = setTimeout(() => setPatientDropdownMounted(false), 150);
    return () => clearTimeout(t);
  }, [showPatientResults]);

  useEffect(() => {
    if (showDoctorResults) {
      setDoctorDropdownMounted(true);
      return;
    }
    const t = setTimeout(() => setDoctorDropdownMounted(false), 150);
    return () => clearTimeout(t);
  }, [showDoctorResults]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (searchBoxRef.current && !searchBoxRef.current.contains(target)) {
        setShowSearchResults(false);
      }
      if (patientBoxRef.current && !patientBoxRef.current.contains(target)) {
        setShowPatientResults(false);
      }
      if (doctorBoxRef.current && !doctorBoxRef.current.contains(target)) {
        setShowDoctorResults(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSearchResults(false);
        setShowPatientResults(false);
        setShowDoctorResults(false);
        searchInputRef.current?.blur();
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const addDrugToInvoice = (drug: Drug) => {
    const existingItem = items.find(item => item.drugId === drug.id && item.itemType === 'DRUG');
    
    if (existingItem && existingItem.drugId) {
      // Increase quantity if already exists
      updateItemQuantity(existingItem.drugId, existingItem.quantity + 1, 'DRUG');
    } else {
      // Add new item
      const newItem: InvoiceItem = {
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

    setSearchQuery('');
    setShowSearchResults(false);
    searchInputRef.current?.focus();
  };

  const updateItemQuantity = (itemId: string, quantity: number, itemType: 'DRUG' | 'PACKAGE' = 'DRUG') => {
    setItems(items.map(item => {
      if ((itemType === 'DRUG' && item.drugId === itemId) || (itemType === 'PACKAGE' && item.packageId === itemId)) {
        const updatedItem = { ...item, quantity: Math.max(1, quantity) };
        calculateItemTotal(updatedItem);
        return updatedItem;
      }
      return item;
    }));
  };

  const updateItemDiscount = (drugId: string, discountPercent: number) => {
    setItems(items.map(item => {
      if (item.drugId === drugId) {
        const updatedItem = { ...item, discountPercent: Math.max(0, Math.min(100, discountPercent)) };
        calculateItemTotal(updatedItem);
        return updatedItem;
      }
      return item;
    }));
  };

  const updateItemTax = (drugId: string, taxPercent: number) => {
    setItems(items.map(item => {
      if (item.drugId === drugId) {
        const updatedItem = { ...item, taxPercent: Math.max(0, taxPercent) };
        calculateItemTotal(updatedItem);
        return updatedItem;
      }
      return item;
    }));
  };

  const updateItemInstructions = (drugId: string, field: string, value: string) => {
    setItems(items.map(item => {
      if (item.drugId === drugId) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const calculateItemTotal = (item: InvoiceItem) => {
    const subtotal = item.quantity * item.unitPrice;
    const discountAmount = (subtotal * item.discountPercent) / 100;
    const discountedAmount = subtotal - discountAmount;
    const taxAmount = (discountedAmount * item.taxPercent) / 100;
    const totalAmount = discountedAmount + taxAmount;

    item.discountAmount = discountAmount;
    item.taxAmount = taxAmount;
    item.totalAmount = totalAmount;
  };

  const removeItem = (drugId: string) => {
    setItems(items.filter(item => item.drugId !== drugId));
  };

  // Calculate invoice totals
  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const totalDiscount = items.reduce((sum, item) => sum + item.discountAmount, 0);
    const totalTax = items.reduce((sum, item) => sum + item.taxAmount, 0);
    const grandTotal = items.reduce((sum, item) => sum + item.totalAmount, 0);

    return { subtotal, totalDiscount, totalTax, grandTotal };
  };

  const handleSelectPatient = (patient: Patient) => {
    setInvoiceData(prev => ({
      ...prev,
      patientId: patient.id,
      billingName: patient.name || prev.billingName,
      billingPhone: patient.phone || prev.billingPhone,
      billingAddress: patient.address || prev.billingAddress,
    }));
    setPatientSearchQuery(patient.name || '');
    setShowPatientResults(false);
  };

  const handleSelectDoctor = (doctor: Doctor) => {
    const displayName = doctor.name || `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim();
    setInvoiceData(prev => ({ ...prev, doctorId: doctor.id }));
    setDoctorSearchQuery(displayName);
    setShowDoctorResults(false);
  };

  const saveInvoice = async (status: 'DRAFT' | 'CONFIRMED') => {
    if (!invoiceData.patientId || items.length === 0) {
      alert('Please select a patient and add at least one item');
      return;
    }

    if (!invoiceData.billingName || !invoiceData.billingPhone) {
      alert('Please fill billing name and phone');
      return;
    }

    try {
      setLoading(true);
      const invoicePayload = {
        patientId: invoiceData.patientId,
        doctorId: invoiceData.doctorId || undefined,
        prescriptionId: invoiceData.prescriptionId || undefined,
        billingName: invoiceData.billingName,
        billingPhone: invoiceData.billingPhone,
        billingAddress: invoiceData.billingAddress || undefined,
        billingCity: invoiceData.billingCity || undefined,
        billingState: invoiceData.billingState || undefined,
        billingPincode: invoiceData.billingPincode || undefined,
        paymentMethod: invoiceData.paymentMethod,
        notes: invoiceData.notes || undefined,
        items: items.map(item => ({
          drugId: item.drugId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent || 0,
          taxPercent: item.taxPercent || 0,
          dosage: item.dosage || undefined,
          frequency: item.frequency || undefined,
          duration: item.duration || undefined,
          instructions: item.instructions || undefined,
        })),
      };

      const created = await apiClient.post<any>('/pharmacy/invoices', invoicePayload);

      // If confirmed, update status
      if (status === 'CONFIRMED' && created?.id) {
        await apiClient.patch(`/pharmacy/invoices/${created.id}`, { status: 'CONFIRMED' });
        openPrintPreview(created);
      }

      alert(`Invoice ${created?.invoiceNumber || created?.id || ''} ${status === 'CONFIRMED' ? 'confirmed' : 'saved as draft'} successfully`);

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
      setPatientSearchQuery('');
      setDoctorSearchQuery('');
      setItems([]);
      setShowSearchResults(false);
      setShowPatientResults(false);
      setShowDoctorResults(false);
    } catch (error: any) {
      console.error('Failed to save invoice:', error);
      alert(`Failed to save invoice. ${error?.body?.message || error?.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  const totals = calculateTotals();

  const renderPrintHtml = (invoice: any) => {
    const dateStr = new Date().toLocaleString();
    const itemsRows = items.map((it) => `
      <tr>
        <td style="padding:6px;border:1px solid #ddd;">${it.drug?.name || ''}</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:center;">${it.quantity}</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${it.unitPrice.toFixed(2)}</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:right;">${it.discountPercent || 0}%</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:right;">${it.taxPercent || 0}%</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${it.totalAmount.toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Invoice ${invoice?.invoiceNumber || ''}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h1 { margin-bottom: 4px; }
            .muted { color: #555; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th { background: #f5f5f5; }
          </style>
        </head>
        <body>
          <h1>Pharmacy Invoice</h1>
          <div class="muted">${invoice?.invoiceNumber || ''} • ${dateStr}</div>
          <hr />
          <div>
            <strong>Bill To:</strong><br />
            ${invoiceData.billingName}<br/>
            ${invoiceData.billingPhone}<br/>
            ${invoiceData.billingAddress || ''}
          </div>
          <table>
            <thead>
              <tr>
                <th style="padding:6px;border:1px solid #ddd;text-align:left;">Item</th>
                <th style="padding:6px;border:1px solid #ddd;">Qty</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:right;">Unit</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:right;">Disc%</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:right;">Tax%</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>
          <div style="margin-top:12px;text-align:right;">
            <div>Subtotal: <strong>₹${totals.subtotal.toFixed(2)}</strong></div>
            <div>Discount: <strong>-₹${totals.totalDiscount.toFixed(2)}</strong></div>
            <div>Tax: <strong>₹${totals.totalTax.toFixed(2)}</strong></div>
            <div style="font-size:18px;">Grand Total: <strong>₹${totals.grandTotal.toFixed(2)}</strong></div>
          </div>
        </body>
      </html>
    `;
  };

  const openPrintPreview = (created: any) => {
    try {
      const win = window.open('', '_blank');
      if (!win) return;
      const html = renderPrintHtml(created);
      win.document.open();
      win.document.write(html);
      win.document.close();
      // Give the browser a tick to render before printing
      setTimeout(() => {
        win.focus();
        win.print();
      }, 200);
    } catch (e) {
      console.error('Failed to open print preview', e);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Pill className="h-5 w-5" />
          New Pharmacy Invoice
        </CardTitle>
      </CardHeader>
      <CardContent>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                    <div className="relative" ref={patientBoxRef}>
                      <Search className="absolute left-3 top-10 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="patient"
                        placeholder="Search patient by name or phone"
                        value={patientSearchQuery}
                        onChange={(e) => setPatientSearchQuery(e.target.value)}
                        onFocus={() => patientSearchQuery && setShowPatientResults(true)}
                        className="pl-10"
                      />
                      {patientDropdownMounted && patientResults.length > 0 && (
                        <div className={`absolute top-full left-0 right-0 z-50 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto transition ease-out duration-150 transform origin-top ${showPatientResults ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
                          {patientResults.map((p) => (
                            <div
                              key={p.id}
                              className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                              onMouseDown={() => handleSelectPatient(p)}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="font-medium text-sm">{p.name}</div>
                                  {p.phone && (
                                    <div className="text-xs text-gray-500">{p.phone}</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="doctor">Doctor (Optional)</Label>
                    <Select value={invoiceData.doctorId} onValueChange={(value: string) => setInvoiceData(prev => ({ ...prev, doctorId: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select doctor" />
                      </SelectTrigger>
                      <SelectContent>
                        {doctors.map((doctor) => (
                          <SelectItem key={doctor.id} value={doctor.id}>
                            Dr. {doctor.firstName} {doctor.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Drug Search & Add */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Add Drugs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative" ref={searchBoxRef}>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        ref={searchInputRef}
                        placeholder="Search drugs by name, manufacturer, or composition..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => searchQuery && setShowSearchResults(true)}
                        className="pl-10"
                      />
                    </div>
                    <div className="w-48">
                      <Label htmlFor="search-mode" className="sr-only">Search Mode</Label>
                      <Select value={searchMode} onValueChange={(v: string) => setSearchMode(v as 'name' | 'ingredient' | 'all')}>
                        <SelectTrigger id="search-mode">
                          <SelectValue placeholder="Search mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="name">Name</SelectItem>
                          <SelectItem value="ingredient">Ingredient</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Search Results Dropdown */}
                  {dropdownMounted && searchResults.length > 0 && (
                    <div className={`absolute top-full left-0 right-0 z-50 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto transition ease-out duration-150 transform origin-top ${showSearchResults ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
                       {searchResults.map((drug) => (
                         <div
                           key={drug.id}
                           className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                           onMouseDown={() => addDrugToInvoice(drug)}
                         >
                           <div className="flex justify-between items-start">
                             <div className="flex-1">
                               <div className="font-medium text-sm">{drug.name}</div>
                               <div className="text-xs text-gray-500">
                                 {drug.manufacturerName} • {drug.packSizeLabel}
                               </div>
                               {drug.composition1 && (
                                 <div className="text-xs text-blue-600 mt-1">
                                   {drug.composition1}
                                   {drug.composition2 && ` • ${drug.composition2}`}
                                 </div>
                               )}
                             </div>
                             <div className="text-sm font-medium">₹{drug.price.toFixed(2)}</div>
                           </div>
                         </div>
                       ))}
                     </div>
                   )}
                </div>
              </CardContent>
            </Card>

            {/* Invoice Items */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Invoice Items ({items.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Pill className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No items added yet. Search and add drugs above.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {items.map((item) => (
                      <div key={item.drugId} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h4 className="font-medium">{item.drug?.name}</h4>
                            <p className="text-sm text-gray-500">
                              {item.drug?.manufacturerName} • {item.drug?.packSizeLabel}
                            </p>
                            {item.drug?.composition1 && (
                              <p className="text-xs text-blue-600 mt-1">
                                {item.drug?.composition1}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(item.drugId)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          <div>
                            <Label className="text-xs">Quantity</Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateItemQuantity(item.drugId, parseInt(e.target.value) || 1)}
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Unit Price</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.unitPrice}
                              disabled
                              className="h-8 bg-gray-50"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Discount %</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={item.discountPercent}
                              onChange={(e) => updateItemDiscount(item.drugId, parseFloat(e.target.value) || 0)}
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Tax %</Label>
                            <Input
                              type="number"
                              min="0"
                              value={item.taxPercent}
                              onChange={(e) => updateItemTax(item.drugId, parseFloat(e.target.value) || 0)}
                              className="h-8"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                          <div>
                            <Label className="text-xs">Dosage</Label>
                            <Input
                              placeholder="e.g., 1 tablet"
                              value={item.dosage || ''}
                              onChange={(e) => updateItemInstructions(item.drugId, 'dosage', e.target.value)}
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Frequency</Label>
                            <Input
                              placeholder="e.g., Twice daily"
                              value={item.frequency || ''}
                              onChange={(e) => updateItemInstructions(item.drugId, 'frequency', e.target.value)}
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Duration</Label>
                            <Input
                              placeholder="e.g., 7 days"
                              value={item.duration || ''}
                              onChange={(e) => updateItemInstructions(item.drugId, 'duration', e.target.value)}
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Total</Label>
                            <div className="h-8 px-3 py-1 bg-gray-50 border rounded-md flex items-center text-sm font-semibold">
                              ₹{item.totalAmount.toFixed(2)}
                            </div>
                          </div>
                        </div>

                        {(item.dosage || item.frequency || item.duration) && (
                          <div>
                            <Label className="text-xs">Instructions</Label>
                            <Input
                              placeholder="Additional instructions (e.g., Take after meals)"
                              value={item.instructions || ''}
                              onChange={(e) => updateItemInstructions(item.drugId, 'instructions', e.target.value)}
                              className="h-8 mt-1"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Billing Details & Summary */}
          <div className="space-y-6">
            {/* Billing Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Billing Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="billingName">Name *</Label>
                  <Input
                    id="billingName"
                    value={invoiceData.billingName}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, billingName: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="billingPhone">Phone *</Label>
                  <Input
                    id="billingPhone"
                    value={invoiceData.billingPhone}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, billingPhone: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="billingAddress">Address</Label>
                  <Textarea
                    id="billingAddress"
                    value={invoiceData.billingAddress}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, billingAddress: e.target.value }))}
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="billingCity">City</Label>
                    <Input
                      id="billingCity"
                      value={invoiceData.billingCity}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, billingCity: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="billingPincode">Pincode</Label>
                    <Input
                      id="billingPincode"
                      value={invoiceData.billingPincode}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, billingPincode: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="billingState">State</Label>
                  <Input
                    id="billingState"
                    value={invoiceData.billingState}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, billingState: e.target.value }))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Payment Method */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Payment Method
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select 
                  value={invoiceData.paymentMethod} 
                  onValueChange={(value: string) => setInvoiceData(prev => ({ ...prev, paymentMethod: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CARD">Card</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="NETBANKING">Net Banking</SelectItem>
                    <SelectItem value="WALLET">Wallet</SelectItem>
                    <SelectItem value="INSURANCE">Insurance</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Invoice Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Invoice Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>₹{totals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>Discount</span>
                  <span>-₹{totals.totalDiscount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax (GST)</span>
                  <span>₹{totals.totalTax.toFixed(2)}</span>
                </div>
                <hr />
                <div className="flex justify-between text-lg font-bold">
                  <span>Grand Total</span>
                  <span>₹{totals.grandTotal.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Additional notes or instructions..."
                  value={invoiceData.notes}
                  onChange={(e) => setInvoiceData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="space-y-3">
              <Button 
                onClick={() => saveInvoice('DRAFT')} 
                variant="outline" 
                className="w-full"
                disabled={loading}
              >
                <Save className="h-4 w-4 mr-2" />
                Save as Draft
              </Button>
              <Button 
                onClick={() => saveInvoice('CONFIRMED')} 
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={loading || items.length === 0}
              >
                <Send className="h-4 w-4 mr-2" />
                Confirm & Generate Invoice
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 