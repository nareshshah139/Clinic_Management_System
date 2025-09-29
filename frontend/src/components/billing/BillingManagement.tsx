'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, AlertCircle, Package, Trash2, ShoppingCart, Printer } from 'lucide-react';
import { apiClient } from '@/lib/api';
import type { Invoice } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Dermatology packages and services
const DERMATOLOGY_PACKAGES = [
  {
    id: 'acne-complete',
    name: 'Complete Acne Treatment Package',
    description: '4 sessions of acne treatment with consultation and follow-up',
    price: 8000,
    sessions: 4,
    services: [
      { name: 'Initial Consultation', price: 800 },
      { name: 'Acne Treatment Session (4x)', price: 6000 },
      { name: 'Follow-up Consultation', price: 600 },
      { name: 'Skincare Kit', price: 600 }
    ]
  },
  {
    id: 'laser-hair-removal',
    name: 'Laser Hair Removal - Full Package',
    description: '6 sessions for complete hair removal with maintenance',
    price: 12000,
    sessions: 6,
    services: [
      { name: 'Consultation & Patch Test', price: 500 },
      { name: 'Laser Sessions (6x)', price: 10500 },
      { name: 'Post-care Products', price: 1000 }
    ]
  },
  {
    id: 'anti-aging',
    name: 'Anti-Aging Premium Package',
    description: 'Comprehensive anti-aging treatment with PRP and chemical peels',
    price: 15000,
    sessions: 3,
    services: [
      { name: 'Skin Analysis & Consultation', price: 1000 },
      { name: 'PRP Therapy (3 sessions)', price: 9000 },
      { name: 'Chemical Peel (2 sessions)', price: 4000 },
      { name: 'Premium Skincare Kit', price: 1000 }
    ]
  },
  {
    id: 'pigmentation',
    name: 'Pigmentation Treatment Package',
    description: 'Complete pigmentation removal with laser and peels',
    price: 10000,
    sessions: 4,
    services: [
      { name: 'Pigmentation Analysis', price: 800 },
      { name: 'Laser Pigmentation Treatment (3x)', price: 7500 },
      { name: 'Lightening Peel', price: 1200 },
      { name: 'Maintenance Products', price: 500 }
    ]
  }
];

const INDIVIDUAL_SERVICES = [
  { name: 'Dermatology Consultation', price: 800, category: 'Consultation' },
  { name: 'Follow-up Consultation', price: 600, category: 'Consultation' },
  { name: 'Skin Analysis', price: 1000, category: 'Diagnosis' },
  { name: 'Chemical Peel - Light', price: 2000, category: 'Treatment' },
  { name: 'Chemical Peel - Medium', price: 3500, category: 'Treatment' },
  { name: 'Chemical Peel - Deep', price: 5000, category: 'Treatment' },
  { name: 'Laser Hair Removal - Small Area', price: 1500, category: 'Laser' },
  { name: 'Laser Hair Removal - Medium Area', price: 2500, category: 'Laser' },
  { name: 'Laser Hair Removal - Large Area', price: 4000, category: 'Laser' },
  { name: 'PRP Therapy - Face', price: 4000, category: 'Treatment' },
  { name: 'PRP Therapy - Scalp', price: 6000, category: 'Treatment' },
  { name: 'Botox - Forehead', price: 8000, category: 'Injectable' },
  { name: 'Botox - Crow\'s Feet', price: 6000, category: 'Injectable' },
  { name: 'Dermal Fillers - Lips', price: 12000, category: 'Injectable' },
  { name: 'Dermal Fillers - Cheeks', price: 15000, category: 'Injectable' },
  { name: 'Mole Removal', price: 3000, category: 'Minor Surgery' },
  { name: 'Wart Removal', price: 2500, category: 'Minor Surgery' },
  { name: 'Skin Tag Removal', price: 2000, category: 'Minor Surgery' },
  { name: 'Cryotherapy', price: 1500, category: 'Treatment' },
  { name: 'Microneedling', price: 3500, category: 'Treatment' },
  { name: 'HydraFacial', price: 4500, category: 'Facial' },
  { name: 'Medical Facial', price: 2500, category: 'Facial' },
  { name: 'Acne Scar Treatment', price: 5000, category: 'Treatment' },
  { name: 'Stretch Mark Treatment', price: 4000, category: 'Treatment' }
];

interface InvoiceItem {
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  gstRate: number;
  total: number;
}

export default function BillingManagement() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ patientId: '', description: '', amount: '', gstRate: 18 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('simple');

  // Invoice builder state
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string>('');
  const [customDiscount, setCustomDiscount] = useState<number>(0);
  const [invoiceNotes, setInvoiceNotes] = useState('');

  // Print state
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printInvoice, setPrintInvoice] = useState<any>(null);
  const [printFormat, setPrintFormat] = useState<'TABLE' | 'TEXT'>('TABLE');

  // Autocomplete state for patient selection
  const [patientQuery, setPatientQuery] = useState('');
  const [patientOptions, setPatientOptions] = useState<any[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [showPatientMenu, setShowPatientMenu] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const res: any = await apiClient.getInvoices({ limit: 50 });
      setInvoices(res?.invoices || res?.data || res || []);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch invoices', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchInvoices(); }, []);

  // Debounced search for patients
  useEffect(() => {
    if (!open) return;
    let t: any;
    const run = async () => {
      try {
        setSearchingPatients(true);
        const res: any = await apiClient.getPatients({ search: patientQuery || undefined, limit: 10 });
        const rows = res?.data || res?.patients || res || [];
        setPatientOptions(rows);
      } catch (e) {
        setPatientOptions([]);
      } finally {
        setSearchingPatients(false);
      }
    };
    t = setTimeout(() => void run(), 250);
    return () => clearTimeout(t);
  }, [patientQuery, open]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.patient-dropdown')) {
        setShowPatientMenu(false);
      }
    };

    if (showPatientMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showPatientMenu]);

  const calculateInvoiceTotal = () => {
    const subtotal = invoiceItems.reduce((sum, item) => sum + item.total, 0);
    const discountAmount = (customDiscount / 100) * subtotal;
    const discountedSubtotal = subtotal - discountAmount;
    const gstAmount = invoiceItems.reduce((sum, item) => {
      const itemSubtotal = item.total - (item.discount / 100 * item.total);
      return sum + (itemSubtotal * item.gstRate / 100);
    }, 0);
    const finalTotal = discountedSubtotal + gstAmount;
    
    return { subtotal, discountAmount, gstAmount, finalTotal };
  };

  const addPackageToInvoice = (packageId: string) => {
    const pkg = DERMATOLOGY_PACKAGES.find(p => p.id === packageId);
    if (!pkg) return;

    const newItems: InvoiceItem[] = pkg.services.map(service => ({
      name: service.name,
      description: `Part of ${pkg.name}`,
      quantity: 1,
      unitPrice: service.price,
      discount: 0,
      gstRate: 18,
      total: service.price
    }));

    setInvoiceItems([...invoiceItems, ...newItems]);
    setSelectedPackage('');
  };

  const addServiceToInvoice = (serviceName: string, price: number) => {
    const newItem: InvoiceItem = {
      name: serviceName,
      description: '',
      quantity: 1,
      unitPrice: price,
      discount: 0,
      gstRate: 18,
      total: price
    };

    setInvoiceItems([...invoiceItems, newItem]);
  };

  const updateInvoiceItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const updatedItems = [...invoiceItems];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    // Recalculate total for the item
    if (field === 'quantity' || field === 'unitPrice' || field === 'discount') {
      const item = updatedItems[index];
      const baseTotal = item.quantity * item.unitPrice;
      const discountAmount = (item.discount / 100) * baseTotal;
      updatedItems[index].total = baseTotal - discountAmount;
    }
    
    setInvoiceItems(updatedItems);
  };

  const removeInvoiceItem = (index: number) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!form.patientId) {
      newErrors.patientId = 'Please select a patient';
    }
    
    if (activeTab === 'simple') {
      // For simple invoice
      if (!form.description?.trim()) {
        newErrors.description = 'Description is required';
      }
      if (!form.amount || Number(form.amount) <= 0) {
        newErrors.amount = 'Amount must be greater than 0';
      }
    } else {
      // For invoice builder
      if (invoiceItems.length === 0) {
        newErrors.items = 'Please add at least one service or package';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resetForm = () => {
    setForm({ patientId: '', description: '', amount: '', gstRate: 18 });
    setPatientQuery('');
    setSelectedPatient(null);
    setInvoiceItems([]);
    setSelectedPackage('');
    setCustomDiscount(0);
    setInvoiceNotes('');
    setErrors({});
    setSuccess('');
    setActiveTab('simple');
  };

  const createInvoice = async () => {
    console.log('🔥 Create Invoice button clicked!');
    console.log('Form data:', form);
    console.log('Selected patient:', selectedPatient);
    console.log('Active tab:', activeTab);
    console.log('Invoice items:', invoiceItems);
    
    if (!validateForm()) {
      console.log('❌ Validation failed, errors:', errors);
      return;
    }

    console.log('✅ Validation passed, proceeding with invoice creation...');
    let items: any[] = [];

    try {
      setLoading(true);
      setErrors({});
      
      if (activeTab === 'builder' && invoiceItems.length > 0) {
        // Use invoice builder items
        items = invoiceItems.map(item => ({
          name: item.name,
          description: item.description || item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          gstRate: item.gstRate
        }));
      } else {
        // Use simple form
        items = [{
          name: form.description.trim(),
          description: form.description.trim(),
          quantity: 1,
          unitPrice: Number(form.amount),
          discount: 0,
          gstRate: form.gstRate || 18
        }];
      }
      
      const newInvoice = await apiClient.createInvoice({
        patientId: form.patientId,
        items,
        discount: activeTab === 'builder' ? customDiscount : 0,
        notes: activeTab === 'builder' ? (invoiceNotes || undefined) : undefined,
      });
      
      setSuccess('Invoice created successfully!');
      setTimeout(() => setSuccess(''), 3000);
      setOpen(false);
      resetForm();
      await fetchInvoices();
      
      // Show print option for new invoice
      if (newInvoice) {
        setPrintInvoice({
          ...newInvoice,
          patient: selectedPatient,
          items: items
        });
        setTimeout(() => setShowPrintPreview(true), 500);
      }
    } catch (e: any) {
      console.error('❌ Invoice creation error:', e);
      console.error('📊 Error status:', e.status);
      console.error('📋 Error body:', e.body);
      console.error('📤 Sent data:', {
        patientId: form.patientId,
        items,
        discount: activeTab === 'builder' ? customDiscount : 0,
        notes: activeTab === 'builder' ? (invoiceNotes || undefined) : undefined,
      });
      console.error('🔍 Full error object:', {
        name: e.name,
        message: e.message,
        stack: e.stack,
        ...e
      });
      // eslint-disable-next-line no-console
      console.error('Failed to create invoice', e);
      
      // Handle specific error messages
      if (e?.body?.message) {
        if (e.body.message.includes('Patient not found')) {
          setErrors({ patientId: 'Selected patient not found' });
        } else if (e.body.message.includes('validation')) {
          setErrors({ general: 'Please check all required fields' });
        } else {
          setErrors({ general: e.body.message });
        }
      } else {
        setErrors({ general: 'Failed to create invoice. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePatientSelect = (patient: any) => {
    setForm({ ...form, patientId: patient.id });
    setPatientQuery(patient.name || patient.phone || patient.email || patient.id);
    setSelectedPatient(patient);
    setShowPatientMenu(false);
    setErrors({ ...errors, patientId: '' });
  };

  const handleDialogOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      resetForm();
    }
  };

  const handlePrintInvoice = async (invoice: any) => {
    try {
      // Fetch the complete invoice details including items
      const fullInvoice = await apiClient.getInvoiceById(invoice.id);
      setPrintInvoice(fullInvoice);
      setShowPrintPreview(true);
    } catch (e) {
      console.error('Failed to fetch invoice details:', e);
      // Fallback to the invoice data we have
      setPrintInvoice(invoice);
      setShowPrintPreview(true);
    }
  };

  const generatePrintContent = () => {
    if (!printInvoice) return '';

    // Handle different data sources: builder mode vs existing invoice
    const itemsToDisplay = activeTab === 'builder' ? invoiceItems : 
      (printInvoice.items?.map((item: any) => ({
        name: item.name || 'Service',
        description: item.description || '',
        quantity: item.qty || 1,
        unitPrice: item.unitPrice || 0,
        discount: item.discount || 0,
        gstRate: item.gstRate || 18,
        total: item.total || (item.qty * item.unitPrice)
      })) || [{
        name: form.description || 'Service',
        description: form.description || '',
        quantity: 1,
        unitPrice: Number(form.amount) || 0,
        discount: 0,
        gstRate: 18,
        total: Number(form.amount) || 0
      }]);

    const { subtotal, discountAmount, gstAmount, finalTotal } = activeTab === 'builder' ? calculateInvoiceTotal() : {
      subtotal: itemsToDisplay.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0),
      discountAmount: itemsToDisplay.reduce((sum: number, item: any) => sum + ((item.quantity * item.unitPrice * item.discount) / 100), 0),
      gstAmount: itemsToDisplay.reduce((sum: number, item: any) => {
        const itemSubtotal = (item.quantity * item.unitPrice) - ((item.quantity * item.unitPrice * item.discount) / 100);
        return sum + (itemSubtotal * (item.gstRate / 100));
      }, 0),
      finalTotal: printInvoice.total || itemsToDisplay.reduce((sum: number, item: any) => sum + item.total, 0)
    };

    if (printFormat === 'TEXT') {
      const headerLines = [
        'DERMATOLOGY CLINIC',
        'Advanced Skin Care & Aesthetic Treatments',
        'Hyderabad, India | +91 9876543210 | info@dermclinic.com',
        'GSTIN: 36XXXXX1234X1ZX | License: DL-12345'
      ];

      const billToLines = [
        `Bill To: ${printInvoice.patient?.name || selectedPatient?.name || 'Patient'}`,
        `ID: ${printInvoice.patient?.id || selectedPatient?.id || 'N/A'}`,
        ...(printInvoice.patient?.phone || selectedPatient?.phone ? [`Phone: ${printInvoice.patient?.phone || selectedPatient?.phone}`] : []),
        ...(printInvoice.patient?.email || selectedPatient?.email ? [`Email: ${printInvoice.patient?.email || selectedPatient?.email}`] : [])
      ];

      const detailsLines = [
        `Invoice #: ${printInvoice.invoiceNo || 'DRAFT'}`,
        `Date: ${new Date().toLocaleDateString('en-IN')}`,
        `Time: ${new Date().toLocaleTimeString('en-IN')}`,
        ...(invoiceNotes ? [`Notes: ${invoiceNotes}`] : [])
      ];

      const itemsLines = itemsToDisplay.map((item: any, idx: number) => {
        const amount = item.total.toLocaleString('en-IN');
        return `${idx + 1}. ${item.name} | Qty: ${item.quantity} | Rate: ₹${item.unitPrice.toLocaleString('en-IN')} | Disc: ${item.discount}% | GST: ${item.gstRate}% | Amt: ₹${amount}`;
      });

      const totalsLines = [
        `Subtotal: ₹${subtotal.toLocaleString('en-IN')}`,
        ...(discountAmount > 0 ? [`Discount (${customDiscount}%): -₹${discountAmount.toLocaleString('en-IN')}`] : []),
        `GST: ₹${gstAmount.toLocaleString('en-IN')}`,
        `Total Amount: ₹${finalTotal.toLocaleString('en-IN')}`
      ];

      const footerLines = [
        'Thank you for choosing our dermatology services!',
        'For queries: info@dermclinic.com or +91 9876543210',
        'This is a computer-generated invoice and does not require a signature.'
      ];

      return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice - ${printInvoice.invoiceNo || 'New Invoice'}</title>
        <meta charset="utf-8" />
        <style>
          @media print { body { margin: 12mm; } }
          body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; white-space: pre-wrap; line-height: 1.5; }
          .section { margin-bottom: 12px; }
          .divider { margin: 8px 0; border-top: 1px dashed #999; }
        </style>
      </head>
      <body>
<div class="section">${headerLines.join('\n')}</div>
<div class="divider"></div>
<div class="section">${billToLines.join('\n')}</div>
<div class="section">${detailsLines.join('\n')}</div>
<div class="divider"></div>
<div class="section">Items:\n${itemsLines.join('\n')}</div>
<div class="divider"></div>
<div class="section">${totalsLines.join('\n')}</div>
${invoiceNotes ? `\nNotes:\n${invoiceNotes}\n` : ''}
<div class="divider"></div>
<div class="section">${footerLines.join('\n')}</div>
      </body>
      </html>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice - ${printInvoice.invoiceNo || 'New Invoice'}</title>
        <style>
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
          body { 
            font-family: Arial, sans-serif; 
            margin: 20px; 
            line-height: 1.4;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 8px;
          }
          .header h1 { margin: 0; font-size: 28px; }
          .header p { margin: 5px 0; font-size: 14px; opacity: 0.9; }
          .invoice-details {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
          }
          .invoice-details div {
            flex: 1;
          }
          .invoice-details h3 {
            margin-top: 0;
            color: #333;
            border-bottom: 2px solid #667eea;
            padding-bottom: 5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
          }
          th {
            background-color: #f8f9fa;
            font-weight: 600;
            color: #333;
          }
          .text-right { text-align: right; }
          .total-section {
            margin-top: 30px;
            border-top: 2px solid #667eea;
            padding-top: 20px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
          }
          .total-row.final {
            font-size: 18px;
            font-weight: bold;
            color: #667eea;
            border-top: 1px solid #ddd;
            padding-top: 10px;
            margin-top: 15px;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
          }
          .notes {
            margin: 20px 0;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 5px;
            border-left: 4px solid #667eea;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>DERMATOLOGY CLINIC</h1>
          <p>Advanced Skin Care & Aesthetic Treatments</p>
          <p>📍 Hyderabad, India | 📞 +91 9876543210 | ✉️ info@dermclinic.com</p>
          <p>GSTIN: 36XXXXX1234X1ZX | License: DL-12345</p>
        </div>

        <div class="invoice-details">
          <div>
            <h3>Bill To:</h3>
            <p><strong>${printInvoice.patient?.name || selectedPatient?.name || 'Patient'}</strong></p>
            <p>ID: ${printInvoice.patient?.id || selectedPatient?.id || 'N/A'}</p>
            ${printInvoice.patient?.phone || selectedPatient?.phone ? `<p>📞 ${printInvoice.patient?.phone || selectedPatient?.phone}</p>` : ''}
            ${printInvoice.patient?.email || selectedPatient?.email ? `<p>✉️ ${printInvoice.patient?.email || selectedPatient?.email}</p>` : ''}
          </div>
          <div>
            <h3>Invoice Details:</h3>
            <p><strong>Invoice #:</strong> ${printInvoice.invoiceNo || 'DRAFT'}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString('en-IN')}</p>
            <p><strong>Time:</strong> ${new Date().toLocaleTimeString('en-IN')}</p>
            ${invoiceNotes ? `<p><strong>Notes:</strong> ${invoiceNotes}</p>` : ''}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Description</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Rate (₹)</th>
              <th class="text-right">Disc %</th>
              <th class="text-right">GST %</th>
              <th class="text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsToDisplay.map((item: any) => `
              <tr>
                <td><strong>${item.name}</strong></td>
                <td>${item.description || '-'}</td>
                <td class="text-right">${item.quantity}</td>
                <td class="text-right">₹${item.unitPrice.toLocaleString('en-IN')}</td>
                <td class="text-right">${item.discount}%</td>
                <td class="text-right">${item.gstRate}%</td>
                <td class="text-right">₹${item.total.toLocaleString('en-IN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-section">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>₹${subtotal.toLocaleString('en-IN')}</span>
          </div>
          ${discountAmount > 0 ? `
            <div class="total-row" style="color: #dc3545;">
              <span>Discount (${customDiscount}%):</span>
              <span>-₹${discountAmount.toLocaleString('en-IN')}</span>
            </div>
          ` : ''}
          <div class="total-row">
            <span>GST:</span>
            <span>₹${gstAmount.toLocaleString('en-IN')}</span>
          </div>
          <div class="total-row final">
            <span>Total Amount:</span>
            <span>₹${finalTotal.toLocaleString('en-IN')}</span>
          </div>
        </div>

        ${invoiceNotes ? `
          <div class="notes">
            <strong>Additional Notes:</strong><br>
            ${invoiceNotes}
          </div>
        ` : ''}

        <div class="footer">
          <p><strong>Thank you for choosing our dermatology services!</strong></p>
          <p>For any queries, please contact us at info@dermclinic.com or +91 9876543210</p>
          <p>This is a computer-generated invoice and does not require a signature.</p>
        </div>
      </body>
      </html>
    `;
  };

  const printInvoiceDocument = () => {
    const printContent = generatePrintContent();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    }
  };

  const { subtotal, discountAmount, gstAmount, finalTotal } = calculateInvoiceTotal();

  return (
    <div className="space-y-4">
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-center gap-2 text-green-800">
          <AlertCircle className="h-4 w-4" />
          {success}
        </div>
      )}
      
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-gray-900">Invoices</h2>
        <div className="flex gap-2">
          <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Create Invoice</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
              
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="simple">Simple Invoice</TabsTrigger>
                  <TabsTrigger value="builder">Invoice Builder</TabsTrigger>
                </TabsList>
                
                <TabsContent value="simple" className="space-y-4">
                  {errors.general && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800 text-sm">
                      {errors.general}
                    </div>
                  )}
                  
                  <div className="relative patient-dropdown">
                    <Label>Patient *</Label>
                    <div className="relative">
                      <Input
                        placeholder="Search patient by name, phone, or email"
                        value={patientQuery}
                        onChange={(e) => { 
                          setPatientQuery(e.target.value); 
                          setShowPatientMenu(true);
                          if (e.target.value === '') {
                            setForm({ ...form, patientId: '' });
                            setSelectedPatient(null);
                          }
                        }}
                        onFocus={() => setShowPatientMenu(true)}
                        className={errors.patientId ? 'border-red-500' : ''}
                      />
                      {showPatientMenu && (
                        <div className="absolute z-20 mt-1 w-full bg-white border rounded shadow max-h-64 overflow-auto">
                          {searchingPatients && (
                            <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
                          )}
                          {!searchingPatients && patientOptions.length === 0 && patientQuery && (
                            <div className="px-3 py-2 text-xs text-gray-500">No results found</div>
                          )}
                          {!searchingPatients && patientOptions.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handlePatientSelect(p)}
                              className={`w-full text-left px-3 py-2 hover:bg-gray-50 text-sm ${form.patientId === p.id ? 'bg-blue-50' : ''}`}
                            >
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col">
                                  <span className="font-medium">{p.name || `Patient ${p.id?.slice(-4) || ''}`}</span>
                                  <div className="flex items-center gap-3 text-xs text-gray-500">
                                    <span>ID: {p.id}</span>
                                    {p.phone && <span>📞 {p.phone}</span>}
                                    {p.email && <span>✉️ {p.email}</span>}
                                  </div>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedPatient && (
                      <div className="text-xs text-green-600 mt-1">
                        ✓ Selected: {selectedPatient.name} (ID: {selectedPatient.id})
                      </div>
                    )}
                    {errors.patientId && (
                      <div className="text-xs text-red-600 mt-1">{errors.patientId}</div>
                    )}
                  </div>
                  
                  <div>
                    <Label>Service Description *</Label>
                    <Input 
                      value={form.description} 
                      onChange={(e) => {
                        setForm({ ...form, description: e.target.value });
                        setErrors({ ...errors, description: '' });
                      }}
                      placeholder="e.g., Dermatology Consultation"
                      className={errors.description ? 'border-red-500' : ''}
                    />
                    {errors.description && (
                      <div className="text-xs text-red-600 mt-1">{errors.description}</div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Amount (₹) *</Label>
                      <Input 
                        type="number" 
                        value={form.amount} 
                        onChange={(e) => {
                          setForm({ ...form, amount: e.target.value });
                          setErrors({ ...errors, amount: '' });
                        }}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className={errors.amount ? 'border-red-500' : ''}
                      />
                      {errors.amount && (
                        <div className="text-xs text-red-600 mt-1">{errors.amount}</div>
                      )}
                    </div>
                    
                    <div>
                      <Label>GST Rate (%)</Label>
                      <Input 
                        type="number" 
                        value={form.gstRate || 18} 
                        onChange={(e) => {
                          setForm({ ...form, gstRate: Number(e.target.value) });
                        }}
                        placeholder="18"
                        min="0"
                        max="30"
                        step="0.01"
                      />
                      <div className="text-xs text-gray-500 mt-1">Default: 18%</div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="builder" className="space-y-4">
                  {errors.general && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800 text-sm">
                      {errors.general}
                    </div>
                  )}
                  
                  {/* Patient Selection - Same as simple form */}
                  <div className="relative patient-dropdown">
                    <Label>Patient *</Label>
                    <div className="relative">
                      <Input
                        placeholder="Search patient by name, phone, or email"
                        value={patientQuery}
                        onChange={(e) => { 
                          setPatientQuery(e.target.value); 
                          setShowPatientMenu(true);
                          if (e.target.value === '') {
                            setForm({ ...form, patientId: '' });
                            setSelectedPatient(null);
                          }
                        }}
                        onFocus={() => setShowPatientMenu(true)}
                        className={errors.patientId ? 'border-red-500' : ''}
                      />
                      {showPatientMenu && (
                        <div className="absolute z-20 mt-1 w-full bg-white border rounded shadow max-h-64 overflow-auto">
                          {searchingPatients && (
                            <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
                          )}
                          {!searchingPatients && patientOptions.length === 0 && patientQuery && (
                            <div className="px-3 py-2 text-xs text-gray-500">No results found</div>
                          )}
                          {!searchingPatients && patientOptions.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handlePatientSelect(p)}
                              className={`w-full text-left px-3 py-2 hover:bg-gray-50 text-sm ${form.patientId === p.id ? 'bg-blue-50' : ''}`}
                            >
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col">
                                  <span className="font-medium">{p.name || `Patient ${p.id?.slice(-4) || ''}`}</span>
                                  <div className="flex items-center gap-3 text-xs text-gray-500">
                                    <span>ID: {p.id}</span>
                                    {p.phone && <span>📞 {p.phone}</span>}
                                    {p.email && <span>✉️ {p.email}</span>}
                                  </div>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedPatient && (
                      <div className="text-xs text-green-600 mt-1">
                        ✓ Selected: {selectedPatient.name} (ID: {selectedPatient.id})
                      </div>
                    )}
                    {errors.patientId && (
                      <div className="text-xs text-red-600 mt-1">{errors.patientId}</div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Dermatology Packages */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Dermatology Packages
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {DERMATOLOGY_PACKAGES.map(pkg => (
                          <div key={pkg.id} className="border rounded-lg p-3 hover:bg-gray-50">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h4 className="font-medium text-sm">{pkg.name}</h4>
                                <p className="text-xs text-gray-600">{pkg.description}</p>
                                <p className="text-xs text-blue-600">{pkg.sessions} sessions</p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold">₹{pkg.price.toLocaleString('en-IN')}</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => addPackageToInvoice(pkg.id)}
                                  className="mt-1"
                                >
                                  Add
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    {/* Individual Services */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <ShoppingCart className="h-4 w-4" />
                          Individual Services
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                        {Object.entries(
                          INDIVIDUAL_SERVICES.reduce((acc, service) => {
                            if (!acc[service.category]) acc[service.category] = [];
                            acc[service.category].push(service);
                            return acc;
                          }, {} as Record<string, typeof INDIVIDUAL_SERVICES>)
                        ).map(([category, services]) => (
                          <div key={category}>
                            <h5 className="font-medium text-xs text-gray-700 mb-1">{category}</h5>
                            {services.map(service => (
                              <div key={service.name} className="flex justify-between items-center py-1 px-2 hover:bg-gray-50 rounded">
                                <span className="text-sm">{service.name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">₹{service.price.toLocaleString('en-IN')}</span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => addServiceToInvoice(service.name, service.price)}
                                  >
                                    +
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Invoice Items */}
                  {invoiceItems.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Invoice Items</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {/* Header row */}
                          <div className="grid grid-cols-12 gap-2 items-center text-xs font-medium text-gray-600 px-3 py-2 bg-gray-50 rounded">
                            <div className="col-span-3">Service</div>
                            <div className="col-span-1">Qty</div>
                            <div className="col-span-2">Price (₹)</div>
                            <div className="col-span-2">Disc (%)</div>
                            <div className="col-span-2">GST (%)</div>
                            <div className="col-span-1">Total</div>
                            <div className="col-span-1">Action</div>
                          </div>
                          
                          {invoiceItems.map((item, index) => (
                            <div key={index} className="grid grid-cols-12 gap-2 items-center p-3 border rounded">
                              <div className="col-span-3">
                                <Input
                                  value={item.name}
                                  onChange={(e) => updateInvoiceItem(index, 'name', e.target.value)}
                                  placeholder="Service name"
                                  className="text-sm"
                                />
                              </div>
                              <div className="col-span-1">
                                <Input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => updateInvoiceItem(index, 'quantity', Number(e.target.value))}
                                  placeholder="Qty"
                                  min="1"
                                  className="text-sm"
                                />
                              </div>
                              <div className="col-span-2">
                                <Input
                                  type="number"
                                  value={item.unitPrice}
                                  onChange={(e) => updateInvoiceItem(index, 'unitPrice', Number(e.target.value))}
                                  placeholder="Price"
                                  min="0"
                                  className="text-sm"
                                />
                              </div>
                              <div className="col-span-2">
                                <Input
                                  type="number"
                                  value={item.discount}
                                  onChange={(e) => updateInvoiceItem(index, 'discount', Number(e.target.value))}
                                  placeholder="Disc %"
                                  min="0"
                                  max="100"
                                  className="text-sm"
                                />
                              </div>
                              <div className="col-span-2">
                                <Input
                                  type="number"
                                  value={item.gstRate}
                                  onChange={(e) => updateInvoiceItem(index, 'gstRate', Number(e.target.value))}
                                  placeholder="GST %"
                                  min="0"
                                  max="30"
                                  className="text-sm"
                                />
                              </div>
                              <div className="col-span-1">
                                <span className="text-sm font-medium">₹{item.total.toLocaleString('en-IN')}</span>
                              </div>
                              <div className="col-span-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => removeInvoiceItem(index)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Invoice Summary */}
                        <div className="mt-4 p-3 bg-gray-50 rounded">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Overall Discount (%)</Label>
                              <Input
                                type="number"
                                value={customDiscount}
                                onChange={(e) => setCustomDiscount(Number(e.target.value))}
                                placeholder="0"
                                min="0"
                                max="100"
                              />
                            </div>
                            <div>
                              <Label>Notes</Label>
                              <Input
                                value={invoiceNotes}
                                onChange={(e) => setInvoiceNotes(e.target.value)}
                                placeholder="Additional notes"
                              />
                            </div>
                          </div>
                          
                          <div className="mt-3 space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span>Subtotal:</span>
                              <span>₹{subtotal.toLocaleString('en-IN')}</span>
                            </div>
                            {discountAmount > 0 && (
                              <div className="flex justify-between text-red-600">
                                <span>Discount ({customDiscount}%):</span>
                                <span>-₹{discountAmount.toLocaleString('en-IN')}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span>GST:</span>
                              <span>₹{gstAmount.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between font-semibold text-lg border-t pt-1">
                              <span>Total:</span>
                              <span>₹{finalTotal.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {errors.items && (
                    <div className="text-xs text-red-600">{errors.items}</div>
                  )}
                </TabsContent>
              </Tabs>
              
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => handleDialogOpenChange(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button onClick={createInvoice} disabled={loading}>
                  {loading ? 'Creating...' : 'Create Invoice'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button 
            variant="outline" 
            onClick={async () => { 
              setLoading(true); 
              try { 
                await apiClient.generateSampleInvoices({ maxPatients: 5, perPatient: 3 }); 
                await fetchInvoices();
                setSuccess('Sample invoices generated successfully!');
                setTimeout(() => setSuccess(''), 3000);
              } catch (e) { 
                setErrors({ general: 'Failed to generate sample invoices' });
              } finally { 
                setLoading(false); 
              } 
            }}
            disabled={loading}
          >
            {loading ? 'Generating...' : 'Generate sample invoices'}
          </Button>
        </div>
      </div>

      {/* Print Preview Dialog */}
      <Dialog open={showPrintPreview} onOpenChange={setShowPrintPreview}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice Preview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Label>Print Format</Label>
                <Select value={printFormat} onValueChange={(v) => setPrintFormat(v as 'TABLE' | 'TEXT')}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TABLE">Table</SelectItem>
                    <SelectItem value="TEXT">Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowPrintPreview(false)}>
                  Close
                </Button>
                <Button onClick={printInvoiceDocument} className="flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  Print Invoice
                </Button>
              </div>
            </div>
            <div 
              className="border rounded p-4 bg-white"
              dangerouslySetInnerHTML={{ __html: generatePrintContent() }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>All Invoices</CardTitle>
          <CardDescription>Latest 50 invoices</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[...Array(6)].map((_, i) => (<div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />))}</div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No invoices found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{(inv as any).invoiceNo || (inv as any).invoiceNumber}</TableCell>
                      <TableCell>{(inv as any).patient?.name || `${(inv as any).patient?.firstName || ''} ${(inv as any).patient?.lastName || ''}`.trim() || 'Unknown'}</TableCell>
                      <TableCell>
                        <Badge variant={
                          (inv as any).balance === 0 ? 'default' : 
                          (inv as any).received > 0 ? 'secondary' : 
                          'outline'
                        }>
                          {(inv as any).balance === 0 ? 'PAID' : ((inv as any).received > 0 ? 'PARTIAL' : 'PENDING')}
                        </Badge>
                      </TableCell>
                      <TableCell>₹{((inv as any).total ?? (inv as any).totalAmount)?.toLocaleString?.('en-IN') || '0'}</TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {new Date((inv as any).createdAt).toLocaleDateString('en-IN')}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePrintInvoice(inv)}
                          className="flex items-center gap-1"
                        >
                          <Printer className="h-3 w-3" />
                          Print
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 