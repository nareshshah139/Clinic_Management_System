'use client';

import { Bell, Search, Settings, User, Calendar, Users, Palette } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useState, useEffect, useRef } from 'react';
import { formatDob } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useDashboardUser } from './dashboard-user-context';
import { apiClient } from '@/lib/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useBrandedMode } from './branded-mode-context';
import { ReceptionistTour } from '@/components/tours/ReceptionistTour';

interface SearchResult {
  id: string;
  type: 'patient' | 'appointment' | 'user';
  title: string;
  subtitle?: string;
  description?: string;
  icon: any;
  href: string;
}

export function Header() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { user, loading } = useDashboardUser();
  const { brandedEnabled, toggleBranded, loading: brandedLoading } = useBrandedMode();

  type NotificationItem = {
    id: string;
    title: string;
    description?: string;
    href: string;
    variant?: 'default' | 'warning' | 'destructive' | 'success';
  };

  const [notifItems, setNotifItems] = useState<NotificationItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [whatsappAutoConfirm, setWhatsappAutoConfirm] = useState(false);
  const [whatsappUseTemplate, setWhatsappUseTemplate] = useState(false);
  const [whatsappTemplateName, setWhatsappTemplateName] = useState('');
  const [whatsappTemplateLanguage, setWhatsappTemplateLanguage] = useState('en');

  // Load system alerts and map to role-based notifications
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (loading) return;
      if (!user) return;
      try {
        setNotifLoading(true);
        const alerts: any = await apiClient.getSystemAlerts<any>();
        if (!mounted) return;
        const role = (user as any)?.role as string | undefined;
        const items: NotificationItem[] = buildRoleNotifications(alerts, role);
        setNotifItems(items);
      } catch (e) {
        // Fail silently; leave notifications empty
        setNotifItems([]);
      } finally {
        setNotifLoading(false);
      }
    };
    void load();

    // Optional light polling to keep fresh
    const interval = setInterval(() => {
      void load();
    }, 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [loading, user]);

  useEffect(() => {
    try {
      const enabled = Boolean((user as any)?.metadata?.whatsappAutoConfirmAppointments);
      setWhatsappAutoConfirm(enabled);
      const useTpl = Boolean((user as any)?.metadata?.whatsappUseTemplate);
      setWhatsappUseTemplate(useTpl);
      const tplName = String((user as any)?.metadata?.whatsappTemplateName || '');
      setWhatsappTemplateName(tplName);
      const tplLang = String((user as any)?.metadata?.whatsappTemplateLanguage || 'en');
      setWhatsappTemplateLanguage(tplLang);
    } catch {}
  }, [user]);

  function buildRoleNotifications(alerts: any, role?: string): NotificationItem[] {
    const items: NotificationItem[] = [];
    const counts = alerts?.counts || {};
    const lowStock = alerts?.lowStockAlerts || [];
    const expiry = alerts?.expiryAlerts || [];
    const overdue = alerts?.overdueInvoices || [];
    const pending = alerts?.pendingPayments || [];
    const upcoming = alerts?.upcomingAppointments || [];

    const pushMany = (arr: NotificationItem[], max: number = 5) =>
      arr.slice(0, max).forEach((it) => items.push(it));

    const roleUpper = (role || '').toUpperCase();
    switch (roleUpper) {
      case 'DOCTOR': {
        const list: NotificationItem[] = (upcoming || []).map((a: any) => ({
          id: `appt-${a.id}`,
          title: `${a.patientName || 'Patient'} at ${formatTime(a.time)}`,
          description: `${a.visitType || 'Visit'} • ${a.status}`,
          href: `/dashboard/visits?appointmentId=${encodeURIComponent(a.id)}`,
          variant: 'default',
        }));
        pushMany(list, 6);
        break;
      }
      case 'RECEPTION': {
        const apptItems: NotificationItem[] = (upcoming || []).map((a: any) => ({
          id: `appt-${a.id}`,
          title: `Upcoming: ${a.patientName || 'Patient'} at ${formatTime(a.time)}`,
          description: `${a.visitType || 'Visit'} • Dr. ${a.doctorName || ''}`.trim(),
          href: `/dashboard/appointments`,
        }));
        const invItems: NotificationItem[] = (overdue || []).map((inv: any) => ({
          id: `inv-${inv.id}`,
          title: `Overdue Invoice ${inv.invoiceNo}`,
          description: `${inv.patient?.name || 'Patient'} • Due ${formatDate(inv.dueDate)}`,
          href: `/dashboard/billing?tab=invoices`,
          variant: 'warning',
        }));
        pushMany(apptItems, 4);
        pushMany(invItems, 3);
        break;
      }
      case 'PHARMACIST':
      case 'INVENTORY': {
        const stockItems: NotificationItem[] = (lowStock || []).map((i: any) => ({
          id: `stock-${i.itemId}`,
          title: `Low stock: ${i.itemName}`,
          description: `Stock ${i.currentStock} • Reorder ${i.reorderLevel}`,
          href: `/dashboard/inventory?tab=low-stock`,
          variant: 'destructive',
        }));
        const expItems: NotificationItem[] = (expiry || []).map((i: any) => ({
          id: `exp-${i.itemId}`,
          title: `Expiring soon: ${i.itemName}`,
          description: `${i.daysUntilExpiry} days left • Qty ${i.currentStock}`,
          href: `/dashboard/inventory?tab=expiry`,
          variant: 'warning',
        }));
        pushMany(stockItems, 5);
        pushMany(expItems, 3);
        break;
      }
      case 'ACCOUNTANT':
      case 'BILLING': {
        const payItems: NotificationItem[] = (pending || []).map((p: any) => ({
          id: `pay-${p.id}`,
          title: `Pending ${formatCurrency(p.amount)} (${p.mode})`,
          description: `Invoice ${p.invoice?.invoiceNo || ''} • ${formatRelative(p.createdAt)}`,
          href: `/dashboard/billing?tab=payments`,
          variant: 'warning',
        }));
        const invItems: NotificationItem[] = (overdue || []).map((inv: any) => ({
          id: `inv-${inv.id}`,
          title: `Overdue Invoice ${inv.invoiceNo}`,
          description: `${inv.patient?.name || 'Patient'} • Due ${formatDate(inv.dueDate)}`,
          href: `/dashboard/billing?tab=invoices`,
          variant: 'destructive',
        }));
        pushMany(payItems, 5);
        pushMany(invItems, 3);
        break;
      }
      case 'OWNER':
      case 'ADMIN':
      default: {
        // Summary items for admins/owners (and fallback)
        const summary: NotificationItem[] = [];
        if (counts.overdueInvoices > 0) {
          summary.push({
            id: 'summary-overdue',
            title: `${counts.overdueInvoices} overdue invoice${counts.overdueInvoices === 1 ? '' : 's'}`,
            description: 'Billing attention needed',
            href: '/dashboard/billing?tab=invoices',
            variant: 'destructive',
          });
        }
        if (counts.pendingPayments > 0) {
          summary.push({
            id: 'summary-pending',
            title: `${counts.pendingPayments} pending payment${counts.pendingPayments === 1 ? '' : 's'}`,
            description: 'Reconciliation required',
            href: '/dashboard/billing?tab=payments',
            variant: 'warning',
          });
        }
        if (counts.lowStockAlerts > 0) {
          summary.push({
            id: 'summary-stock',
            title: `${counts.lowStockAlerts} low-stock item${counts.lowStockAlerts === 1 ? '' : 's'}`,
            description: 'Restock inventory',
            href: '/dashboard/inventory?tab=low-stock',
          });
        }
        if (counts.expiryAlerts > 0) {
          summary.push({
            id: 'summary-expiry',
            title: `${counts.expiryAlerts} near-expiry item${counts.expiryAlerts === 1 ? '' : 's'}`,
            description: 'Check expirations',
            href: '/dashboard/inventory?tab=expiry',
            variant: 'warning',
          });
        }
        if (counts.upcomingAppointments > 0) {
          summary.push({
            id: 'summary-appts',
            title: `${counts.upcomingAppointments} upcoming appointment${counts.upcomingAppointments === 1 ? '' : 's'}`,
            description: 'Within 48 hours',
            href: '/dashboard/appointments',
          });
        }
        pushMany(summary, 6);
        break;
      }
    }
    return items;
  }

  function formatTime(value: string | Date): string {
    const d = new Date(value);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  function formatDate(value: string | Date): string {
    const d = new Date(value);
    return d.toLocaleDateString();
  }
  function formatCurrency(amount: number): string {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR' }).format(amount || 0);
    } catch {
      return `₹${(amount || 0).toFixed(2)}`;
    }
  }
  function formatRelative(value: string | Date): string {
    const d = new Date(value);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    return `${days}d ago`;
  }

  // Close search results when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Debounced search
  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        performSearch(searchQuery.trim());
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(delayedSearch);
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    try {
      setIsSearching(true);
      const results: SearchResult[] = [];

      // Search patients
      try {
        const patientRes: any = await apiClient.getPatients({ search: query, limit: 5 });
        const patients = patientRes.data || patientRes.patients || [];
        patients.forEach((patient: any) => {
          results.push({
            id: patient.id,
            type: 'patient',
            title: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || patient.name || 'Unknown Patient',
            subtitle: patient.phone || patient.email,
            description: `Patient • ${patient.gender || 'Unknown'} • ${formatDob(patient.dob)}`,
            icon: Users,
            href: `/dashboard/patients?search=${encodeURIComponent(patient.id)}`,
          });
        });
      } catch (e) {
        console.error('Failed to search patients', e);
      }

      // Search appointments (recent ones)
      try {
        const appointmentRes: any = await apiClient.getAppointments({ 
          search: query, 
          limit: 5,
          sortBy: 'date',
          sortOrder: 'desc'
        });
        const appointments = appointmentRes.appointments || appointmentRes.data || [];
        appointments.forEach((appointment: any) => {
          const patientName = appointment.patient?.name || `${appointment.patient?.firstName || ''} ${appointment.patient?.lastName || ''}`.trim() || 'Unknown Patient';
          const doctorName = appointment.doctor ? `${appointment.doctor.firstName || ''} ${appointment.doctor.lastName || ''}`.trim() : 'Unknown Doctor';
          results.push({
            id: appointment.id,
            type: 'appointment',
            title: `${patientName} - ${appointment.slot}`,
            subtitle: `Dr. ${doctorName}`,
            description: `Appointment • ${new Date(appointment.date).toLocaleDateString()} • ${appointment.visitType || 'OPD'}`,
            icon: Calendar,
            href: `/dashboard/appointments`,
          });
        });
      } catch (e) {
        console.error('Failed to search appointments', e);
      }

      // Search users/doctors
      try {
        const userRes: any = await apiClient.getUsers({ search: query, limit: 3 });
        const users = userRes.users || userRes.data || [];
        users.forEach((user: any) => {
          results.push({
            id: user.id,
            type: 'user',
            title: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || 'Unknown User',
            subtitle: user.email,
            description: `${user.role || 'User'} • ${user.specialization || 'General'}`,
            icon: User,
            href: `/dashboard/users?search=${encodeURIComponent(user.id)}`,
          });
        });
      } catch (e) {
        console.error('Failed to search users', e);
      }

      setSearchResults(results);
      setShowResults(results.length > 0);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
      setShowResults(false);
    } finally {
      setIsSearching(false);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false);
    setSearchQuery('');
    router.push(result.href);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchResults.length > 0) {
      handleResultClick(searchResults[0]);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* Search */}
      <div className="flex-1 max-w-md relative" ref={searchRef}>
        <form onSubmit={handleSearchSubmit}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search patients, appointments, doctors..."
              className="pl-10 pr-4 py-2 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) {
                  setShowResults(true);
                }
              }}
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              </div>
            )}
          </div>
        </form>

        {/* Search Results Dropdown */}
        {showResults && searchResults.length > 0 && (
          <Card className="absolute top-full left-0 right-0 mt-1 z-50 max-h-96 overflow-y-auto shadow-lg">
            <CardContent className="p-0">
              {searchResults.map((result, index) => {
                const IconComponent = result.icon;
                return (
                  <div
                    key={`${result.type}-${result.id}-${index}`}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    onClick={() => handleResultClick(result)}
                  >
                    <div className="flex-shrink-0">
                      <div className={`p-2 rounded-lg ${
                        result.type === 'patient' ? 'bg-blue-100 text-blue-600' :
                        result.type === 'appointment' ? 'bg-green-100 text-green-600' :
                        'bg-purple-100 text-purple-600'
                      }`}>
                        <IconComponent className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {result.title}
                      </p>
                      {result.subtitle && (
                        <p className="text-xs text-gray-600 truncate">
                          {result.subtitle}
                        </p>
                      )}
                      {result.description && (
                        <p className="text-xs text-gray-500 truncate">
                          {result.description}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {result.type === 'patient' ? 'Patient' : 
                         result.type === 'appointment' ? 'Appointment' : 'Staff'}
                      </Badge>
                    </div>
                  </div>
                );
              })}
              {searchQuery.length >= 2 && (
                <div className="p-3 bg-gray-50 border-t">
                  <p className="text-xs text-gray-500 text-center">
                    Press Enter to go to first result • Type more to refine search
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* No Results */}
        {showResults && searchResults.length === 0 && searchQuery.length >= 2 && !isSearching && (
          <Card className="absolute top-full left-0 right-0 mt-1 z-50 shadow-lg">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-gray-500">No results found for "{searchQuery}"</p>
              <p className="text-xs text-gray-400 mt-1">Try searching for patient names, phone numbers, or doctor names</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right section */
      }
      <div className="flex items-center space-x-4">
        {/* Receptionist Tour Button */}
        {user?.role === 'RECEPTION' && (
          <div className="pr-2 border-r border-gray-200 mr-2">
            <ReceptionistTour />
          </div>
        )}
        
        {/* Branded mode toggle */}
        <div className="flex items-center gap-2 pr-2 border-r border-gray-200 mr-2">
          <Palette className="h-4 w-4 text-gray-500" />
          <span className="text-xs text-gray-600">Branded</span>
          <Switch
            checked={brandedEnabled}
            onCheckedChange={() => toggleBranded()}
            aria-label="Toggle branded mode"
            disabled={brandedLoading}
          />
        </div>
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="relative">
              <Bell className="h-5 w-5" />
              {notifItems.length > 0 && (
                <Badge
                  variant={notifItems.some((n) => n.variant === 'destructive') ? 'destructive' : 'default'}
                  className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full p-0 flex items-center justify-center text-[10px]"
                >
                  {notifItems.length > 9 ? '9+' : String(notifItems.length)}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>
              Notifications {notifLoading ? '• Loading…' : ''}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifItems.length === 0 && !notifLoading && (
              <div className="px-3 py-6 text-sm text-gray-500">No notifications</div>
            )}
            {notifItems.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => router.push(n.href)}
                className={
                  n.variant === 'destructive'
                    ? 'text-red-600'
                    : n.variant === 'warning'
                      ? 'text-yellow-700'
                      : ''
                }
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{n.title}</span>
                  {n.description && (
                    <span className="text-xs text-gray-500">{n.description}</span>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
            {notifItems.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/dashboard/reports')}>
                  View reports & alerts
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Settings */}
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="Open settings"><Settings className="h-5 w-5" /></Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>My Settings</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {String((user as any)?.role || '').toUpperCase() === 'DOCTOR' && (
                <>
                  <div className="border rounded p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Send WhatsApp on appointment creation</div>
                        <div className="text-xs text-gray-500">Enable automatic WhatsApp confirmation to patients when you are the doctor.</div>
                      </div>
                      <Switch checked={whatsappAutoConfirm} onCheckedChange={(v: boolean) => setWhatsappAutoConfirm(v)} />
                    </div>
                    <div className="text-xs text-gray-500">Requires backend WhatsApp credentials. Uses text messages by default.</div>
                  </div>

                  <div className="border rounded p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Use WhatsApp Template</div>
                        <div className="text-xs text-gray-500">Recommended for sending messages outside the 24h window.</div>
                      </div>
                      <Switch checked={whatsappUseTemplate} onCheckedChange={(v: boolean) => setWhatsappUseTemplate(v)} />
                    </div>
                    {whatsappUseTemplate && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm">Template Name</label>
                          <Input value={whatsappTemplateName} onChange={(e) => setWhatsappTemplateName(e.target.value)} placeholder="e.g., appointment_confirm" />
                        </div>
                        <div>
                          <label className="text-sm">Language Code</label>
                          <Input value={whatsappTemplateLanguage} onChange={(e) => setWhatsappTemplateLanguage(e.target.value)} placeholder="e.g., en, en_US, hi" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border rounded p-3 bg-gray-50">
                    <div className="font-medium mb-2">How to enable WhatsApp (Doctor steps)</div>
                    <ol className="list-decimal ml-5 space-y-1 text-gray-600 text-sm">
                      <li>Ask the admin to configure WhatsApp Cloud API credentials on the server.</li>
                      <li>Toggle "Send WhatsApp on appointment creation" to enable automatic messages.</li>
                      <li>Optional: Toggle "Use WhatsApp Template", then enter your approved template name and language.</li>
                      <li>Book or receive a new appointment to test delivery.</li>
                    </ol>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSettingsOpen(false)}>Close</Button>
                <Button onClick={async () => {
                  try {
                    if (!user?.id) return;
                    const metadata = {
                      ...(user as any)?.metadata,
                      whatsappAutoConfirmAppointments: whatsappAutoConfirm,
                      whatsappUseTemplate,
                      whatsappTemplateName: whatsappTemplateName || undefined,
                      whatsappTemplateLanguage: whatsappTemplateLanguage || undefined,
                    };
                    await apiClient.updateUserProfile(user.id, { metadata });
                    setSettingsOpen(false);
                  } catch (e) {
                    // optional toast could be added here if available
                  }
                }}>Save</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* User menu */}
        <div className="flex items-center space-x-2">
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
            <User className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-sm">
            <p className="font-medium text-gray-900">
              {loading ? 'Loading…' : `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Unknown User'}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
} 