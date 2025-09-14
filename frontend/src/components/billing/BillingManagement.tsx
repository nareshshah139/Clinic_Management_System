'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { apiClient } from '@/lib/api';
import type { Invoice } from '@/lib/types';

export default function BillingManagement() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ patientId: '', description: '', amount: '' });

  // Autocomplete state for patient selection
  const [patientQuery, setPatientQuery] = useState('');
  const [patientOptions, setPatientOptions] = useState<any[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [showPatientMenu, setShowPatientMenu] = useState(false);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const res = await apiClient.getInvoices({ limit: 50 });
      setInvoices(res.data || []);
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

  const createInvoice = async () => {
    try {
      setLoading(true);
      await apiClient.createInvoice({
        patientId: form.patientId,
        items: [
          { description: form.description, quantity: 1, unitPrice: Number(form.amount) || 0, discountPercentage: 0, gstRate: 18 },
        ],
      });
      setOpen(false);
      setForm({ patientId: '', description: '', amount: '' });
      await fetchInvoices();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to create invoice', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-gray-900">Invoices</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Create Invoice</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="relative">
                <Label>Patient</Label>
                <div className="relative">
                  <Input
                    placeholder="Search patient by name, phone, or email"
                    value={patientQuery}
                    onChange={(e) => { setPatientQuery(e.target.value); setShowPatientMenu(true); }}
                    onFocus={() => setShowPatientMenu(true)}
                  />
                  {showPatientMenu && (
                    <div className="absolute z-20 mt-1 w-full bg-white border rounded shadow max-h-64 overflow-auto">
                      {searchingPatients && (
                        <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
                      )}
                      {!searchingPatients && patientOptions.length === 0 && (
                        <div className="px-3 py-2 text-xs text-gray-500">No results</div>
                      )}
                      {!searchingPatients && patientOptions.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setForm({ ...form, patientId: p.id });
                            setPatientQuery(p.name || p.phone || p.email || p.id);
                            setShowPatientMenu(false);
                          }}
                          className={`w-full text-left px-3 py-2 hover:bg-gray-50 text-sm ${form.patientId === p.id ? 'bg-gray-50' : ''}`}
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
                {form.patientId && (
                  <div className="text-xs text-gray-600 mt-1">Selected ID: {form.patientId}</div>
                )}
              </div>
              <div>
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <Label>Amount</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={createInvoice} disabled={loading}>Create</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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
                    <TableHead>#</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                      <TableCell>{inv.patient?.firstName} {inv.patient?.lastName}</TableCell>
                      <TableCell><Badge variant="secondary">{inv.status}</Badge></TableCell>
                      <TableCell>₹{inv.totalAmount?.toLocaleString?.('en-IN')}</TableCell>
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