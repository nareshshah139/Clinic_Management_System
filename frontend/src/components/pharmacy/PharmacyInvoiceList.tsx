'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  Download,
  Calendar,
  CreditCard,
  FileText,
  DollarSign,
  CheckCircle,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import type {
  PharmacyInvoiceListResponse,
  PharmacyInvoiceSummary,
} from '@/lib/types';
import {
  PharmacyInvoiceStatus,
  PharmacyPaymentStatus,
  PharmacyPaymentMethod,
  PharmacyInvoiceStatusLabels,
  PharmacyPaymentStatusLabels,
  PharmacyPaymentMethodLabels,
  getEnumValues,
  type PharmacyInvoiceStatus as PharmacyInvoiceStatusType,
  type PharmacyPaymentStatus as PharmacyPaymentStatusType,
  type PharmacyPaymentMethod as PharmacyPaymentMethodType,
} from '@/lib/api-enums';
import { getGlobalPrintStyleTag } from '@/lib/printStyles';

type StatusFilter = PharmacyInvoiceStatusType | 'all';
type PaymentStatusFilter = PharmacyPaymentStatusType | 'all';
type PaymentMethodFilter = PharmacyPaymentMethodType | 'all';
type DateRange = 'all' | 'today' | 'week' | 'month' | 'quarter';

const STATUS_COLORS: Record<PharmacyInvoiceStatusType, string> = {
  [PharmacyInvoiceStatus.DRAFT]: 'bg-gray-100 text-gray-800',
  [PharmacyInvoiceStatus.PENDING]: 'bg-yellow-100 text-yellow-800',
  [PharmacyInvoiceStatus.CONFIRMED]: 'bg-blue-100 text-blue-800',
  [PharmacyInvoiceStatus.DISPENSED]: 'bg-green-100 text-green-800',
  [PharmacyInvoiceStatus.COMPLETED]: 'bg-green-100 text-green-800',
  [PharmacyInvoiceStatus.CANCELLED]: 'bg-red-100 text-red-800',
};

const PAYMENT_STATUS_COLORS: Record<PharmacyPaymentStatusType, string> = {
  [PharmacyPaymentStatus.PENDING]: 'bg-yellow-100 text-yellow-800',
  [PharmacyPaymentStatus.COMPLETED]: 'bg-green-100 text-green-800',
  [PharmacyPaymentStatus.FAILED]: 'bg-red-100 text-red-800',
  [PharmacyPaymentStatus.REFUNDED]: 'bg-purple-100 text-purple-800',
  [PharmacyPaymentStatus.PARTIALLY_PAID]: 'bg-orange-100 text-orange-800',
};

export function PharmacyInvoiceList() {
  const [invoices, setInvoices] = useState<PharmacyInvoiceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<PaymentStatusFilter>('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<PaymentMethodFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  });

  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true);

      const page = Math.max(1, pagination.page);
      const limit = Math.min(100, Math.max(1, pagination.limit));

      const params: Record<string, unknown> = {
        page,
        limit,
        sortBy: 'invoiceDate',
        sortOrder: 'desc',
      };

      const trimmedSearch = searchQuery.trim();
      if (trimmedSearch) params.search = trimmedSearch;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (paymentStatusFilter !== 'all') params.paymentStatus = paymentStatusFilter;
      if (paymentMethodFilter !== 'all') params.paymentMethod = paymentMethodFilter;

      if (dateRange !== 'all') {
        const now = new Date();
        let startDate: Date | undefined;
        switch (dateRange) {
          case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'quarter':
            startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
            break;
        }
        if (startDate) params.startDate = startDate.toISOString();
      }

      const response: PharmacyInvoiceListResponse = await apiClient.getPharmacyInvoices(params);
      const list = Array.isArray(response?.data) ? response.data : [];
      const pg = response?.pagination ?? {
        page,
        limit,
        total: list.length,
        pages: Math.max(1, Math.ceil(list.length / limit)),
      };

      setInvoices(list);
      setPagination(prev => ({
        ...prev,
        page: pg.page ?? page,
        limit: pg.limit ?? limit,
        total: pg.total ?? list.length,
        pages: pg.pages ?? Math.max(1, Math.ceil((pg.total ?? list.length) / (pg.limit ?? limit))),
      }));
    } catch (error) {
      console.error('Failed to load invoices:', error);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange, pagination.limit, pagination.page, paymentMethodFilter, paymentStatusFilter, searchQuery, statusFilter]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    const handler = () => {
      // Reset to first page, keep filters, ensure dateRange is today
      setDateRange('today');
      setPagination(prev => ({ ...prev, page: 1 }));
    };
    window.addEventListener('pharmacy-invoices-refresh', handler);
    return () => window.removeEventListener('pharmacy-invoices-refresh', handler);
  }, []);

  const renderPrintHtml = (invoice: any) => {
    const dateStr = new Date(invoice.createdAt || invoice.invoiceDate || Date.now()).toLocaleDateString();
    
    const itemsRows = (invoice.items || []).map((item: any) => {
      const itemName = item.itemType === 'PACKAGE' 
        ? (item.package?.name || 'Unknown Package')
        : (item.drug?.name || 'Unknown Drug');
      
      return `
        <tr>
          <td style="padding:6px;border:1px solid #ddd;">${itemName}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:center;">${item.quantity}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${item.unitPrice?.toFixed(2) || '0.00'}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${item.discountPercent || 0}%</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${item.taxPercent || 0}%</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">₹${item.totalAmount?.toFixed(2) || '0.00'}</td>
        </tr>
      `;
    }).join('');

    const patientName = invoice.patient?.name || invoice.billingName || 'N/A';
    const patientPhone = invoice.patient?.phone || invoice.billingPhone || 'N/A';
    const billingAddress = invoice.billingAddress || invoice.patient?.address || '';

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
                <strong>Date:</strong> ${dateStr}<br/>
                <strong>Status:</strong> ${invoice?.status || 'N/A'}
              </div>
            </div>
          </div>
          <div class="print-content">
          
          <div class="billing-section">
            <strong>Bill To:</strong><br />
            <div style="margin-top: 8px;">
              ${patientName}<br/>
              ${patientPhone}${billingAddress ? '<br/>' + billingAddress : ''}
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
            <div><strong>Subtotal:</strong> ₹${invoice.subtotal?.toFixed(2) || '0.00'}</div>
            <div><strong>Discount:</strong> -₹${invoice.discountAmount?.toFixed(2) || '0.00'}</div>
            <div><strong>Tax:</strong> ₹${invoice.taxAmount?.toFixed(2) || '0.00'}</div>
            <div class="grand-total"><strong>Grand Total:</strong> ₹${invoice.totalAmount?.toFixed(2) || '0.00'}</div>
          </div>

          ${invoice.notes ? `
            <div style="margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 4px;">
              <strong>Notes:</strong><br/>
              ${invoice.notes}
            </div>
          ` : ''}
          </div>
        </body>
      </html>
    `;
  };

  const handleViewInvoice = async (invoiceId: string) => {
    try {
      setLoading(true);
      const invoice = await apiClient.get(`/pharmacy/invoices/${invoiceId}`);
      
      const win = window.open('', '_blank');
      if (!win) {
        alert('Please allow pop-ups to view the invoice');
        return;
      }
      const html = renderPrintHtml(invoice);
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (error) {
      console.error('Failed to load invoice:', error);
      alert('Failed to load invoice. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditInvoice = (invoiceId: string) => {
    // Dispatch event to trigger edit mode in PharmacyInvoiceBuilder
    window.dispatchEvent(new CustomEvent('pharmacy-invoice-edit', {
      detail: { invoiceId }
    }));
    
    // Scroll to the invoice builder (assuming it's on the same page)
    // If it's in a different tab/page, you might need to navigate there first
    const builderElement = document.querySelector('[data-pharmacy-invoice-builder]');
    if (builderElement) {
      builderElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleConfirmInvoice = async (invoiceId: string) => {
    if (!confirm('Confirm this invoice? This will mark it as finalized and include it in stock predictions.')) {
      return;
    }

    try {
      await apiClient.patch(`/pharmacy/invoices/${invoiceId}/status`, { status: 'CONFIRMED' });
      await loadInvoices();
    } catch (error: any) {
      const message = error?.body?.message || error?.message || 'Failed to confirm invoice';
      alert(`Error: ${message}`);
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;

    try {
      await apiClient.delete(`/pharmacy/invoices/${invoiceId}`);
      await loadInvoices();
      alert('Invoice deleted successfully');
    } catch (error) {
      console.error('Failed to delete invoice:', error);
      alert('Failed to delete invoice. Please try again.');
    }
  };

  const handleDownloadInvoice = async (invoiceId: string) => {
    try {
      setLoading(true);
      const invoice = await apiClient.get(`/pharmacy/invoices/${invoiceId}`);
      
      // For now, open print dialog which allows save as PDF
      const win = window.open('', '_blank');
      if (!win) {
        alert('Please allow pop-ups to download the invoice');
        return;
      }
      const html = renderPrintHtml(invoice);
      win.document.open();
      win.document.write(html);
      win.document.close();
      
      // Auto-trigger print dialog
      setTimeout(() => {
        win.focus();
        win.print();
      }, 500);
    } catch (error) {
      console.error('Failed to download invoice:', error);
      alert('Failed to download invoice. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsPaid = async (invoice: PharmacyInvoiceSummary) => {
    if (!confirm(`Mark invoice ${invoice.invoiceNumber} as paid?\n\nAmount: ₹${invoice.totalAmount?.toFixed(2) || '0.00'}`)) {
      return;
    }

    try {
      setLoading(true);
      
      // Add a payment for the full amount
      await apiClient.post(`/pharmacy/invoices/${invoice.id}/payments`, {
        amount: invoice.totalAmount || 0,
        method: invoice.paymentMethod || 'CASH',
        reference: `Payment for ${invoice.invoiceNumber}`,
      });

      // Reload invoices to show updated status
      await loadInvoices();
      alert('Invoice marked as paid successfully');
    } catch (error) {
      console.error('Failed to mark invoice as paid:', error);
      alert('Failed to mark invoice as paid. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setPaymentStatusFilter('all');
    setPaymentMethodFilter('all');
    setDateRange('all');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const stats = useMemo(() => {
    const totalAmount = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const completedInvoices = invoices.filter(inv => inv.paymentStatus === 'COMPLETED').length;
    const pendingAmount = invoices
      .filter(inv => inv.paymentStatus === 'PENDING')
      .reduce((sum, inv) => sum + inv.totalAmount, 0);

    return { totalAmount, completedInvoices, pendingAmount };
  }, [invoices]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Pharmacy Invoices</h2>
          <p className="text-gray-600">Manage and track pharmacy billing</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Invoices</p>
                <p className="text-2xl font-bold">{invoices.length}</p>
              </div>
              <FileText className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Amount</p>
                <p className="text-2xl font-bold">₹{stats.totalAmount.toFixed(2)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Completed</p>
                <p className="text-2xl font-bold">{stats.completedInvoices}</p>
              </div>
              <Calendar className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending Amount</p>
                <p className="text-2xl font-bold">₹{stats.pendingAmount.toFixed(2)}</p>
              </div>
              <CreditCard className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Invoice number, patient..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPagination(prev => ({ ...prev, page: 1 }));
                  }}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div>
              <Label>Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(value: string) => {
                  setStatusFilter(value as StatusFilter);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {getEnumValues(PharmacyInvoiceStatus).map((status) => (
                    <SelectItem key={status} value={status}>
                      {PharmacyInvoiceStatusLabels[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Payment Status</Label>
              <Select
                value={paymentStatusFilter}
                onValueChange={(value: string) => {
                  setPaymentStatusFilter(value as PaymentStatusFilter);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All payments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payments</SelectItem>
                  {getEnumValues(PharmacyPaymentStatus).map((status) => (
                    <SelectItem key={status} value={status}>
                      {PharmacyPaymentStatusLabels[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Payment Method</Label>
              <Select
                value={paymentMethodFilter}
                onValueChange={(value: string) => {
                  setPaymentMethodFilter(value as PaymentMethodFilter);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All methods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  {getEnumValues(PharmacyPaymentMethod).map((method) => (
                    <SelectItem key={method} value={method}>
                      {PharmacyPaymentMethodLabels[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Date Range</Label>
              <Select
                value={dateRange}
                onValueChange={(value: string) => {
                  setDateRange(value as DateRange);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All dates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All dates</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button variant="outline" onClick={clearFilters} className="w-full">
                <Filter className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoices List */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices ({pagination.total})</CardTitle>
          <CardDescription>
            Showing {invoices.length} of {pagination.total} invoices
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-gray-500">Loading invoices...</p>
              </div>
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No invoices found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{invoice.invoiceNumber}</h3>
                        <Badge className={STATUS_COLORS[invoice.status]}>
                          {invoice.status}
                        </Badge>
                        <Badge className={PAYMENT_STATUS_COLORS[invoice.paymentStatus]}>
                          {invoice.paymentStatus}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div>
                          <p><strong>Patient:</strong> {invoice.patient.name}</p>
                          <p><strong>Phone:</strong> {invoice.billingPhone}</p>
                        </div>
                        <div>
                          {invoice.doctor && (
                            <p><strong>Doctor:</strong> {invoice.doctor.firstName} {invoice.doctor.lastName}</p>
                          )}
                          <p><strong>Payment:</strong> {invoice.paymentMethod}</p>
                        </div>
                        <div>
                          <p><strong>Items:</strong> {invoice.items.length}</p>
                          <p><strong>Date:</strong> {formatDate(invoice.invoiceDate)}</p>
                        </div>
                        <div>
                          <p><strong>Subtotal:</strong> ₹{invoice.subtotal.toFixed(2)}</p>
                          <p><strong>Total:</strong> ₹{invoice.totalAmount.toFixed(2)}</p>
                        </div>
                      </div>
                      
                      {/* Items Preview */}
                      <div className="mt-3 p-3 bg-gray-50 rounded-md">
                        <p className="text-sm font-medium mb-2">Items:</p>
                        <div className="space-y-1">
                          {invoice.items.slice(0, 2).map((item) => (
                            <p key={item.id} className="text-sm text-gray-600">
                              • {((item as any)?.drug?.name) || ((item as any)?.package?.name) || 'Item'} - Qty: {item.quantity} - ₹{item.totalAmount.toFixed(2)}
                            </p>
                          ))}
                          {invoice.items.length > 2 && (
                            <p className="text-sm text-gray-500">
                              +{invoice.items.length - 2} more items...
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewInvoice(invoice.id)}
                        title="View Invoice"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadInvoice(invoice.id)}
                        title="Download Invoice"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {(invoice.paymentStatus === 'PENDING' || invoice.paymentStatus === 'PARTIALLY_PAID') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkAsPaid(invoice)}
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          title="Mark as Paid"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {invoice.status === 'DRAFT' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleConfirmInvoice(invoice.id)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            title="Confirm Invoice"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditInvoice(invoice.id)}
                            title="Edit Invoice"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteInvoice(invoice.id)}
                        className="text-red-500 hover:text-red-700"
                        title="Delete Invoice"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Pagination */}
              {pagination.pages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page === 1}
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  >
                    Previous
                  </Button>
                  
                  <span className="text-sm text-gray-600">
                    Page {pagination.page} of {pagination.pages}
                  </span>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page === pagination.pages}
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 