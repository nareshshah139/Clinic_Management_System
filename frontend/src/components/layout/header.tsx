'use client';

import { displayUtcDate } from '@/lib/date-display';
import { enumLabel } from '@/lib/labels';
import { statusLabel } from '@/lib/status-variants';
import { appointmentsHref } from '@/lib/appointments-link';
import { Spinner } from '@/components/ui/spinner';
import { Bell, Settings, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect } from 'react';
import { getErrorMessage } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useDashboardUser } from './dashboard-user-context';
import { GlobalSearch } from './global-search';
import { ColourThemeSetting } from './colour-theme-setting';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { LOW_STOCK_HREF, UPCOMING_DEFINITION } from '@/lib/clinic-counts';
import {
  buildTemplateSelectionValue,
  getSelectableWhatsAppTemplates,
  parseTemplateSelectionValue,
  parseWhatsAppSettings,
  parseMetadataObject,
  validateWhatsAppTemplateChoice,
  type WhatsAppTemplateOption,
} from '@/lib/whatsapp-settings';
import { plural } from '@/lib/labels';

const ReceptionistTour = dynamic(() => import('@/components/tours/ReceptionistTour').then((m) => m.ReceptionistTour), { ssr: false });
const DoctorSignatureSettings = dynamic(() => import('@/components/users/DoctorSignatureSettings').then((m) => m.DoctorSignatureSettings), { ssr: false });
const DoctorLetterheadSettings = dynamic(() => import('@/components/users/DoctorLetterheadSettings').then((m) => m.DoctorLetterheadSettings), { ssr: false });
const DoctorAvailabilitySettings = dynamic(() => import('@/components/users/DoctorAvailabilitySettings').then((m) => m.DoctorAvailabilitySettings), { ssr: false });

const DUE_SALES = '/dashboard/pharmacy/sales?pay=CREDIT';

/**
 * @cc [owner:nareshshah139,label:accessibility] notification-control-label
 * The notifications control has an accessible name whether or not notifications are present.
 */
export function Header() {
  const router = useRouter();
  const { user, loading, refresh } = useDashboardUser();
  const { toast } = useToast();

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
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [whatsappAutoConfirm, setWhatsappAutoConfirm] = useState(false);
  const [whatsappUseTemplate, setWhatsappUseTemplate] = useState(false);
  const [whatsappTemplateName, setWhatsappTemplateName] = useState('');
  const [whatsappTemplateLanguage, setWhatsappTemplateLanguage] = useState('en');
  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsAppTemplateOption[]>([]);
  const [whatsappTemplatesLoading, setWhatsappTemplatesLoading] = useState(false);

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
    const settings = parseWhatsAppSettings((user as any)?.metadata);
    setWhatsappAutoConfirm(settings.autoConfirm);
    setWhatsappUseTemplate(settings.useTemplate);
    setWhatsappTemplateName(settings.templateName);
    setWhatsappTemplateLanguage(settings.templateLanguage);
  }, [user]);

  useEffect(() => {
    const isDoctor = String((user as any)?.role || '').toUpperCase() === 'DOCTOR';
    if (!settingsOpen || !isDoctor || loading) return;

    let cancelled = false;
    const loadTemplates = async () => {
      try {
        setWhatsappTemplatesLoading(true);
        const templates = await apiClient.getWhatsAppTemplates({ touchpoint: 'appointment_confirmation' });
        if (!cancelled) {
          setWhatsappTemplates(getSelectableWhatsAppTemplates(templates));
        }
      } catch {
        if (!cancelled) {
          setWhatsappTemplates([]);
        }
      } finally {
        if (!cancelled) {
          setWhatsappTemplatesLoading(false);
        }
      }
    };

    void loadTemplates();

    return () => {
      cancelled = true;
    };
  }, [loading, settingsOpen, user]);

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
          title: `${a.patientName || 'Patient'} on ${displayUtcDate(a.time)}`,
          description: `${a.visitType ? enumLabel('visitType', a.visitType) : 'Visit'} • ${statusLabel('appointment', a.status)}`,
          href: `/dashboard/visits?appointmentId=${encodeURIComponent(a.id)}`,
          variant: 'default',
        }));
        pushMany(list, 6);
        break;
      }
      case 'RECEPTION': {
        const apptItems: NotificationItem[] = (upcoming || []).map((a: any) => ({
          id: `appt-${a.id}`,
          title: `Upcoming: ${a.patientName || 'Patient'} on ${displayUtcDate(a.time)}`,
          description: `${a.visitType ? enumLabel('visitType', a.visitType) : 'Visit'} • Dr. ${a.doctorName || ''}`.trim(),
          href: appointmentsHref(String(a.time ?? '').slice(0, 10)),
        }));
        const invItems: NotificationItem[] = (overdue || []).map((inv: any) => ({
          id: `inv-${inv.id}`,
          title: `Overdue Invoice ${inv.invoiceNo}`,
          description: `${inv.patient?.name || 'Patient'} • Due ${displayUtcDate(inv.dueDate)}`,
          href: DUE_SALES,
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
          href: LOW_STOCK_HREF,
          variant: 'destructive',
        }));
        const expItems: NotificationItem[] = (expiry || []).map((i: any) => ({
          id: `exp-${i.itemId}`,
          title: `Expiring soon: ${i.itemName}`,
          description: `${plural(i.daysUntilExpiry, 'day')} left • Qty ${i.currentStock}`,
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
          href: DUE_SALES,
          variant: 'warning',
        }));
        const invItems: NotificationItem[] = (overdue || []).map((inv: any) => ({
          id: `inv-${inv.id}`,
          title: `Overdue Invoice ${inv.invoiceNo}`,
          description: `${inv.patient?.name || 'Patient'} • Due ${displayUtcDate(inv.dueDate)}`,
          href: DUE_SALES,
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
            href: DUE_SALES,
            variant: 'destructive',
          });
        }
        if (counts.pendingPayments > 0) {
          summary.push({
            id: 'summary-pending',
            title: `${counts.pendingPayments} pending payment${counts.pendingPayments === 1 ? '' : 's'}`,
            description: 'Reconciliation required',
            href: DUE_SALES,
            variant: 'warning',
          });
        }
        if (counts.lowStockAlerts > 0) {
          summary.push({
            id: 'summary-stock',
            title: `${counts.lowStockAlerts} low-stock item${counts.lowStockAlerts === 1 ? '' : 's'}`,
            description: 'Restock inventory',
            href: LOW_STOCK_HREF,
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
            description: UPCOMING_DEFINITION,
            href: '/dashboard/appointments',
          });
        }
        pushMany(summary, 6);
        break;
      }
    }
    return items;
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

  const selectedTemplateValue = buildTemplateSelectionValue(
    whatsappTemplateName,
    whatsappTemplateLanguage,
  );
  const selectedSavedTemplateValue = whatsappTemplates.some(
    (template) => template.value === selectedTemplateValue,
  )
    ? selectedTemplateValue
    : undefined;

  const saveDoctorSettings = async () => {
    if (!user?.id) return;

    const validationMessage = validateWhatsAppTemplateChoice({
      useTemplate: whatsappUseTemplate,
      templateName: whatsappTemplateName,
      templateLanguage: whatsappTemplateLanguage,
    });
    if (validationMessage) {
      toast({
        variant: 'warning',
        title: 'WhatsApp settings incomplete',
        description: validationMessage,
      });
      return;
    }

    try {
      setSettingsSaving(true);
      const existingMetadata = parseMetadataObject((user as any)?.metadata);
      const metadata = {
        ...existingMetadata,
        whatsappAutoConfirmAppointments: whatsappAutoConfirm,
        whatsappUseTemplate,
        whatsappTemplateName: whatsappUseTemplate ? whatsappTemplateName.trim() || undefined : undefined,
        whatsappTemplateLanguage: whatsappUseTemplate ? whatsappTemplateLanguage.trim() || undefined : undefined,
      };

      await apiClient.updateUserProfile(user.id, { metadata });
      await refresh();
      setSettingsOpen(false);
      toast({
        variant: 'success',
        title: 'Settings saved',
        description: 'WhatsApp preferences updated.',
      });
    } catch (error) {
      toast({
        variant: 'warning',
        title: 'Save failed',
        description: getErrorMessage(error) || 'Could not save WhatsApp settings.',
      });
    } finally {
      setSettingsSaving(false);
    }
  };

  const isDoctor = String((user as any)?.role || '').toUpperCase() === 'DOCTOR';

  return (
    <header className="h-16 bg-white border-b border-border flex items-center justify-between px-6">
      <GlobalSearch />

      {/* Right section */
      }
      <div className="flex items-center space-x-4">
        {/* Receptionist Tour Button */}
        {user?.role === 'RECEPTION' && (
          <div className="pr-2 border-r border-border mr-2">
            <ReceptionistTour />
          </div>
        )}
        
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="relative" aria-label="Notifications">
              <Bell className="h-5 w-5" />
              {notifItems.length > 0 && (
                <Badge
                  variant={notifItems.some((n) => n.variant === 'destructive') ? 'destructive' : 'default'}
                  className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full p-0 flex items-center justify-center text-xs"
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
              <div className="px-3 py-6 text-sm text-muted-foreground">No notifications</div>
            )}
            {notifItems.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => router.push(n.href)}
                className={
                  n.variant === 'destructive'
                    ? 'text-destructive-text'
                    : n.variant === 'warning'
                      ? 'text-warning-text'
                      : ''
                }
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{n.title}</span>
                  {n.description && (
                    <span className="text-xs text-muted-foreground">{n.description}</span>
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
          <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>My Settings</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <ColourThemeSetting />
              {isDoctor && (
                <>
                  {settingsOpen && user?.id && <DoctorSignatureSettings doctorId={user.id} />}
                  {settingsOpen && user?.id && <DoctorLetterheadSettings doctorId={user.id} />}
                  {settingsOpen && user?.id && <DoctorAvailabilitySettings doctorId={user.id} />}
                  <div className="border rounded-md p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Send WhatsApp on appointment creation</div>
                        <div className="text-xs text-muted-foreground">Enable automatic WhatsApp confirmation to patients when you are the doctor.</div>
                      </div>
                      <Switch aria-label="Send WhatsApp on appointment creation" checked={whatsappAutoConfirm} onCheckedChange={(v: boolean) => setWhatsappAutoConfirm(v)} />
                    </div>
                    <div className="text-xs text-muted-foreground">Requires backend WhatsApp credentials. Uses text messages by default.</div>
                  </div>

                  <div className="border rounded-md p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Use WhatsApp Template</div>
                        <div className="text-xs text-muted-foreground">Recommended for sending messages outside the 24h window.</div>
                      </div>
                      <Switch aria-label="Use WhatsApp template" checked={whatsappUseTemplate} onCheckedChange={(v: boolean) => setWhatsappUseTemplate(v)} />
                    </div>
                    {whatsappUseTemplate && (
                      <div className="space-y-3">
                        {whatsappTemplatesLoading ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Spinner className="h-3.5 w-3.5 " />
                            Loading approved templates…
                          </div>
                        ) : whatsappTemplates.length > 0 ? (
                          <div>
                            <label htmlFor="settings-wa-template" className="text-sm">Approved Templates</label>
                            <Select
                              value={selectedSavedTemplateValue}
                              onValueChange={(value: string) => {
                                const next = parseTemplateSelectionValue(value);
                                setWhatsappTemplateName(next.templateName);
                                setWhatsappTemplateLanguage(next.templateLanguage);
                              }}
                            >
                              <SelectTrigger id="settings-wa-template">
                                <SelectValue placeholder="Select a saved appointment template" />
                              </SelectTrigger>
                              <SelectContent>
                                {whatsappTemplates.map((template) => (
                                  <SelectItem key={template.value} value={template.value}>
                                    {template.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="text-xs text-muted-foreground mt-1">
                              Selecting from saved templates avoids name and language mismatches.
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            No active appointment templates were found. You can still enter the template name and language manually.
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="settings-wa-template-name" className="text-sm">Template Name</label>
                            <Input id="settings-wa-template-name"
                              value={whatsappTemplateName}
                              onChange={(e) => setWhatsappTemplateName(e.target.value)}
                              placeholder="e.g., appointment_confirm"
                            />
                          </div>
                          <div>
                            <label htmlFor="settings-wa-template-language" className="text-sm">Language Code</label>
                            <Input id="settings-wa-template-language"
                              value={whatsappTemplateLanguage}
                              onChange={(e) => setWhatsappTemplateLanguage(e.target.value)}
                              placeholder="e.g., en, en_US, hi"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border rounded-md p-3 bg-muted">
                    <div className="font-medium mb-2">How to enable WhatsApp (Doctor steps)</div>
                    <ol className="list-decimal ml-5 space-y-1 text-muted-foreground text-sm">
                      <li>Ask the admin to configure WhatsApp Cloud API credentials on the server.</li>
                      <li>Toggle "Send WhatsApp on appointment creation" to enable automatic messages.</li>
                      <li>Optional: Toggle "Use WhatsApp Template", then enter your approved template name and language.</li>
                      <li>Book or receive a new appointment to test delivery.</li>
                    </ol>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSettingsOpen(false)} disabled={settingsSaving}>Close</Button>
                {isDoctor && (
                  <Button onClick={() => void saveDoctorSettings()} disabled={settingsSaving}>
                    {settingsSaving ? (
                      <>
                        <Spinner className="h-4 w-4 " />
                        Saving…
                      </>
                    ) : (
                      'Save'
                    )}
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* User menu */}
        <div className="flex items-center space-x-2">
          <div className="h-8 w-8 rounded-full bg-info-soft flex items-center justify-center">
            <User className="h-4 w-4 text-info-text" />
          </div>
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {loading ? 'Loading…' : `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Unknown User'}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
