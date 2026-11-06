'use client';

import { displayClinicDate } from '@/lib/date-display';
import { StatusBadge } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { renderPharmacyInvoiceHtml } from '@/lib/pharmacy-invoice-print';

type StatusFilter = PharmacyInvoiceStatusType | 'all';
type PaymentStatusFilter = PharmacyPaymentStatusType | 'all';
type PaymentMethodFilter = PharmacyPaymentMethodType | 'all';
type DateRange = 'all' | 'today' | 'week' | 'month' | 'quarter';

const initialSearch = () => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('search') || '');

export function PharmacyInvoiceList() {
  const [invoices, setInvoices] = useState<PharmacyInvoiceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const paymentInFlight = useRef(false);
  const [pendingPaymentIds, setPendingPaymentIds] = useState<string[]>([]);
  useEffect(() => {
    setPendingPaymentIds(invoices.filter(invoice => sessionStorage.getItem(`pharmacy-payment-attempt:${invoice.id}`)).map(invoice => invoice.id));
  }, [invoices]);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<PaymentStatusFilter>('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<PaymentMethodFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange>(() => (initialSearch() ? 'all' : 'today'));
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

  const handleViewInvoice = async (invoiceId: string) => {
    try {
      setLoading(true);
      const invoice = await apiClient.get(`/pharmacy/invoices/${invoiceId}`);
      
      const win = window.open('', '_blank');
      if (!win) {
        alert('Please allow pop-ups to view the invoice');
        return;
      }
      const html = renderPharmacyInvoiceHtml(invoice);
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
      const html = renderPharmacyInvoiceHtml(invoice);
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

  /**
   * @cc [owner:nareshshah139,label:product] collect-remaining-balance
   * Mark as paid MUST collect the freshly loaded remaining balance, never the original total.
   * An uncertain payment MUST retain its request key and exact amount across retries and reloads.
   */
  const handleMarkAsPaid = async (invoice: PharmacyInvoiceSummary) => {
    if (paymentInFlight.current) return;
    paymentInFlight.current = true;
    const storageKey = `pharmacy-payment-attempt:${invoice.id}`;
    try {
      setLoading(true);
      const saved = sessionStorage.getItem(storageKey);
      let payment: { requestKey: string; amount: number; method: string; reference: string };
      if (saved) {
        payment = JSON.parse(saved);
      } else {
        const latest = await apiClient.get<PharmacyInvoiceSummary & { payments: Array<{ status: string; amount: number }> }>(`/pharmacy/invoices/${invoice.id}`);
        const amount = Math.round(Math.max(0, latest.totalAmount - latest.payments
          .filter(entry => entry.status === 'COMPLETED').reduce((sum, entry) => sum + entry.amount, 0)) * 100) / 100;
        if (amount <= 0) {
          await loadInvoices();
          alert('This invoice has no remaining balance.');
          return;
        }
        payment = {
          requestKey: Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''),
          amount,
          method: latest.paymentMethod || 'CASH',
          reference: `Payment for ${invoice.invoiceNumber}`,
        };
      }
      if (!confirm(`Mark invoice ${invoice.invoiceNumber} as paid?\n\nRemaining payment: ₹${payment.amount.toFixed(2)}`)) return;
      sessionStorage.setItem(storageKey, JSON.stringify(payment));
      setPendingPaymentIds(previous => [...new Set([...previous, invoice.id])]);
      await apiClient.post(`/pharmacy/invoices/${invoice.id}/payments`, payment);
      sessionStorage.removeItem(storageKey);
      setPendingPaymentIds(previous => previous.filter(id => id !== invoice.id));
      await loadInvoices();
      alert('Invoice marked as paid successfully');
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      if (status === 400 || status === 404) {
        sessionStorage.removeItem(storageKey);
        setPendingPaymentIds(previous => previous.filter(id => id !== invoice.id));
      }
      console.error('Failed to mark invoice as paid:', error);
      alert('Payment could not be confirmed. Retry to reconcile the same payment.');
    } finally {
      paymentInFlight.current = false;
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
      <PageHeader title="Pharmacy Invoices" description="Manage and track pharmacy billing" />

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
            <LoadingSkeleton label="Loading invoices…" variant="cards" />
          ) : invoices.length === 0 ? (
            <EmptyState title="No invoices found" description="Try a different search or adjust the filters." icon={FileText} />
          ) : (
            <div className="space-y-4">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{invoice.invoiceNumber}</h3>
                        <StatusBadge domain="invoice" status={invoice.status} />
                        <StatusBadge domain="invoice" status={invoice.paymentStatus} />
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
                          <p><strong>Date:</strong> {displayClinicDate(invoice.invoiceDate)}</p>
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
                      {(pendingPaymentIds.includes(invoice.id) || (invoice.status !== 'CANCELLED' && (invoice.paymentStatus === 'PENDING' || invoice.paymentStatus === 'PARTIALLY_PAID'))) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkAsPaid(invoice)}
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          title={pendingPaymentIds.includes(invoice.id) ? "Retry Payment" : "Mark as Paid"}
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