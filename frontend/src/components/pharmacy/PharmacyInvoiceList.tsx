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
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import type {
  PharmacyInvoiceListResponse,
  PharmacyInvoiceSummary,
  PharmacyInvoiceStatus,
  PharmacyPaymentMethod,
  PharmacyPaymentStatus,
} from '@/lib/types';

type StatusFilter = PharmacyInvoiceStatus | 'all';
type PaymentStatusFilter = PharmacyPaymentStatus | 'all';
type PaymentMethodFilter = PharmacyPaymentMethod | 'all';
type DateRange = 'all' | 'today' | 'week' | 'month' | 'quarter';

const STATUS_COLORS: Record<PharmacyInvoiceStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  DISPENSED: 'bg-green-100 text-green-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const PAYMENT_STATUS_COLORS: Record<PharmacyPaymentStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  REFUNDED: 'bg-purple-100 text-purple-800',
  PARTIALLY_PAID: 'bg-orange-100 text-orange-800',
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

  const handleViewInvoice = (invoiceId: string) => {
    // TODO: Implement view invoice functionality
    console.log('View invoice:', invoiceId);
  };

  const handleEditInvoice = (invoiceId: string) => {
    // TODO: Implement edit invoice functionality
    console.log('Edit invoice:', invoiceId);
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;

    try {
      // TODO: Implement delete invoice API call
      // await apiClient.delete(`/pharmacy/invoices/${invoiceId}`);
      await loadInvoices();
    } catch (error) {
      console.error('Failed to delete invoice:', error);
      alert('Failed to delete invoice. Please try again.');
    }
  };

  const handleDownloadInvoice = (invoiceId: string) => {
    // TODO: Implement download invoice functionality
    console.log('Download invoice:', invoiceId);
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
                onValueChange={(value) => {
                  setStatusFilter(value as StatusFilter);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                  <SelectItem value="DISPENSED">Dispensed</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Payment Status</Label>
              <Select
                value={paymentStatusFilter}
                onValueChange={(value) => {
                  setPaymentStatusFilter(value as PaymentStatusFilter);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All payments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payments</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                  <SelectItem value="REFUNDED">Refunded</SelectItem>
                  <SelectItem value="PARTIALLY_PAID">Partially Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Payment Method</Label>
              <Select
                value={paymentMethodFilter}
                onValueChange={(value) => {
                  setPaymentMethodFilter(value as PaymentMethodFilter);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All methods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="CARD">Card</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="NETBANKING">Net Banking</SelectItem>
                  <SelectItem value="WALLET">Wallet</SelectItem>
                  <SelectItem value="INSURANCE">Insurance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Date Range</Label>
              <Select
                value={dateRange}
                onValueChange={(value) => {
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
                      {invoice.status === 'DRAFT' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditInvoice(invoice.id)}
                          title="Edit Invoice"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
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