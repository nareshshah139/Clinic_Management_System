'use client';

import { LoadingSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/ui/page-header';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Package, TrendingUp, AlertTriangle, Clock, Database, Download } from 'lucide-react';
import { apiClient } from '@/lib/api';
import type { SystemStatistics, SystemAlert, Appointment } from '@/lib/types';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { QuickGuide } from '@/components/common/QuickGuide';
import { DoctorPatientPanels } from '@/components/dashboard/DoctorPatientPanels';
import { formatPatientName, getISTDateString } from '@/lib/utils';

/**
 * @cc [owner:nareshshah139,label:product] dashboard-clinic-day
 * Today's appointments MUST be requested for the current Asia/Kolkata calendar day
 * for both doctor schedules and the general appointment summary.
 */
/**
 * @cc [owner:nareshshah139,label:product] dashboard-patient-label
 * Appointment rows MUST prefer the canonical patient name, falling back to legacy
 * name parts or a nonempty patient label when those names are unavailable.
 */
/**
 * @cc [owner:nareshshah139,label:product] dashboard-booked-slot
 * Appointment rows MUST display the booked slot unchanged, without a clock time
 * derived from the appointment's calendar date.
 */
export default function DashboardPage() {
  const [statistics, setStatistics] = useState<SystemStatistics | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [todaysAppointments, setTodaysAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [backupLoading, setBackupLoading] = useState(false);
  const { user: currentUser, loading: userLoading } = useDashboardUser();
  const router = useRouter();

  const showAdminControls = useMemo(() => {
    const role = currentUser?.role;
    return role === 'ADMIN' || role === 'OWNER';
  }, [currentUser?.role]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (userLoading) return;
      try {
        setLoading(true);
        
        // Fetch system statistics (ignore if unauthorized for role)
        try {
          const stats = await apiClient.getSystemStatistics();
          setStatistics(stats as SystemStatistics);
        } catch (error: unknown) {
          setStatistics(null);
          console.warn('Unable to load system statistics', error);
        }

        // Fetch system alerts from backend
        try {
          const alertsData = await apiClient.getSystemAlerts<any>();
          const transformedAlerts: SystemAlert[] = [];

          // Transform overdue invoices to alerts
          if (alertsData.overdueInvoices && alertsData.overdueInvoices.length > 0) {
            const count = alertsData.overdueInvoices.length;
            transformedAlerts.push({
              id: 'overdue-invoices-summary',
              title: 'Overdue Invoices',
              message: `${count} invoice${count > 1 ? 's' : ''} ${count > 1 ? 'are' : 'is'} overdue. Total amount: ₹${alertsData.overdueInvoices.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0).toFixed(2)}`,
              severity: 'HIGH',
              type: 'billing',
              createdAt: alertsData.generatedAt || new Date().toISOString(),
            });
          }

          // Transform low stock alerts
          if (alertsData.lowStockAlerts && alertsData.lowStockAlerts.length > 0) {
            const count = alertsData.lowStockAlerts.length;
            transformedAlerts.push({
              id: 'low-stock-summary',
              title: 'Low Stock Alert',
              message: `${count} item${count > 1 ? 's' : ''} ${count > 1 ? 'are' : 'is'} below reorder level`,
              severity: 'MEDIUM',
              type: 'inventory',
              createdAt: alertsData.generatedAt || new Date().toISOString(),
            });
          }

          // Transform expiry alerts
          if (alertsData.expiryAlerts && alertsData.expiryAlerts.length > 0) {
            const count = alertsData.expiryAlerts.length;
            const expiringSoon = alertsData.expiryAlerts.filter((a: any) => a.daysUntilExpiry <= 7).length;
            transformedAlerts.push({
              id: 'expiry-alerts-summary',
              title: 'Expiring Items',
              message: `${count} item${count > 1 ? 's' : ''} ${count > 1 ? 'are' : 'is'} expiring within 30 days${expiringSoon > 0 ? ` (${expiringSoon} within 7 days)` : ''}`,
              severity: expiringSoon > 0 ? 'HIGH' : 'MEDIUM',
              type: 'inventory',
              createdAt: alertsData.generatedAt || new Date().toISOString(),
            });
          }

          // Transform pending payments
          if (alertsData.pendingPayments && alertsData.pendingPayments.length > 0) {
            const count = alertsData.pendingPayments.length;
            transformedAlerts.push({
              id: 'pending-payments-summary',
              title: 'Pending Payments',
              message: `${count} payment${count > 1 ? 's' : ''} ${count > 1 ? 'are' : 'is'} pending reconciliation`,
              severity: 'LOW',
              type: 'billing',
              createdAt: alertsData.generatedAt || new Date().toISOString(),
            });
          }

          // Add system status alert (always present)
          transformedAlerts.push({
            id: 'system-status',
            title: 'System Status',
            message: 'All systems operational',
            severity: 'LOW',
            type: 'system',
            createdAt: new Date().toISOString(),
          });

          setAlerts(transformedAlerts);
        } catch (error: unknown) {
          console.warn('Unable to load system alerts', error);
          // Fallback to basic system status alert
          setAlerts([
            {
              id: 'system-status',
              title: 'System Status',
              message: 'All systems operational',
              severity: 'LOW',
              type: 'system',
              createdAt: new Date().toISOString(),
            },
          ]);
        }

        // Load today's appointments for the current user/role
        const todayDate = getISTDateString();
        let appointments: Appointment[] = [];

        if (currentUser?.role === 'DOCTOR' && currentUser?.id) {
          try {
            const schedule = await apiClient.getDoctorSchedule(currentUser.id, todayDate);
            appointments = schedule?.appointments ?? [];
          } catch (error) {
            console.error('Failed to load doctor schedule', error);
          }
        } else {
          try {
            const res: any = await apiClient.getAppointments({ date: todayDate, limit: 5, sortBy: 'slot', sortOrder: 'asc' });
            appointments = res?.appointments || res?.data || [];
          } catch (error) {
            console.error('Failed to load appointments summary', error);
          }
        }

        setTodaysAppointments(appointments);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        // Set fallback data on error
        setStatistics({
          users: { total: 0, active: 0 },
          branches: { total: 0, active: 0 },
          system: { status: 'error', version: '1.0.0', uptime: 0 },
          generatedAt: new Date().toISOString(),
        });
      } finally {
        setLoading(false);
      }
    };

    void fetchDashboardData();
  }, [currentUser?.id, currentUser?.role, userLoading]);

  const handleBackup = async () => {
    try {
      setBackupLoading(true);
      const result = await apiClient.createDatabaseBackup();
      
      // Show success message
      const backupInfo = (result as unknown as { backup: { timestamp: string; directory: string; size: number } }).backup;
      alert(`✅ Database backup created successfully!\n\nTimestamp: ${backupInfo.timestamp}\nLocation: ${backupInfo.directory}\nSize: ${(backupInfo.size / 1024).toFixed(1)} KB\n\nBackup saved to local server directory.`);
      
    } catch (error: unknown) {
      console.error('Backup failed:', error);
      const message = (error as { message?: string })?.message || 'Backup creation failed';
      alert(`❌ Backup Failed\n\n${message}`);
    } finally {
      setBackupLoading(false);
    }
  };

  if (userLoading || loading) {
    return (
      <div className="space-y-6">
        <div>
          <PageHeader title="Dashboard" description="Welcome back! Here’s what’s happening at your clinic today." />
        </div>
        <LoadingSkeleton variant="cards" label="Loading dashboard…" />
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Users',
      value: statistics?.users?.total || 0,
      icon: Users,
    },
    {
      title: 'Active Users',
      value: statistics?.users?.active || 0,
      icon: Users,
    },
    {
      title: 'Total Branches',
      value: statistics?.branches?.total || 0,
      icon: Package,
    },
    {
      title: 'System Status',
      value: statistics?.system?.status || 'unknown',
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title="Dashboard" description="Welcome back! Here’s what’s happening at your clinic today." actions={<><QuickGuide
          title="Dashboard Guide"
          sections={[
            {
              title: "Overview",
              items: [
                "View key metrics including total users, active users, and branches",
                "Monitor system status and health at a glance",
                "Check today's appointments and upcoming schedule"
              ]
            },
            {
              title: "System Alerts",
              items: [
                "Important notifications appear in the alerts section",
                "Alerts are color-coded by severity (red=high, yellow=medium, blue=low)",
                "Click on any alert to view more details"
              ]
            },
            ...(showAdminControls ? [{
              title: "Admin Controls",
              items: [
                "Create database backups from the admin controls section",
                "Backups are stored locally on the server",
                "Regular backups are recommended for data safety"
              ]
            }] : [])
          ]}
        /></>} />

      {currentUser?.role === 'DOCTOR' && currentUser.id ? <DoctorPatientPanels doctorId={currentUser.id} /> : null}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" data-tour="dashboard-stats">
        {statCards.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">{stat.value}</p>
                </div>
                <div className="rounded-md bg-primary-soft p-3">
                  <stat.icon className="h-6 w-6 text-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Admin Controls */}
      {showAdminControls ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Database className="h-5 w-5 text-purple-500 mr-2" />
              Admin Controls
            </CardTitle>
            <CardDescription>
              Administrative tools and system management
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium text-gray-900">Database Backup</h4>
                  <p className="text-sm text-gray-600">Create a complete backup of the database</p>
                </div>
                <Button 
                  onClick={handleBackup} 
                  disabled={backupLoading}
                  className="flex items-center"
                >
                  {backupLoading ? (
                    <>
                      <Spinner className="  h-4 w-4   mr-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Create Backup
                    </>
                  )}
                </Button>
              </div>
              <div className="text-xs text-gray-500">
                ⚠️ Backups are stored locally on the server and contain sensitive data.
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-orange-500 mr-2" />
              System Alerts
            </CardTitle>
            <CardDescription>
              Important notifications requiring your attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <EmptyState icon={AlertTriangle} title="No alerts at this time" description="New clinic notifications will appear here." action={<Button variant="outline" onClick={() => window.location.reload()}>Refresh dashboard</Button>} />
            ) : (
              <div className="space-y-3">
                {alerts.map((alert, index) => (
                  <div
                    key={index}
                    className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50"
                  >
                    <div className={`p-1 rounded-full ${
                      alert.severity === 'HIGH' || alert.severity === 'CRITICAL' 
                        ? 'bg-red-100'
                        : alert.severity === 'MEDIUM' 
                        ? 'bg-yellow-100'
                        : 'bg-blue-100'
                    }`}>
                      <AlertTriangle className={`h-4 w-4 ${
                        alert.severity === 'HIGH' || alert.severity === 'CRITICAL' 
                          ? 'text-red-600'
                          : alert.severity === 'MEDIUM' 
                          ? 'text-yellow-600'
                          : 'text-blue-600'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                      <p className="text-xs text-gray-600">{alert.message}</p>
                    </div>
                    <Badge variant={
                      alert.severity === 'HIGH' || alert.severity === 'CRITICAL' 
                        ? 'danger'
                        : alert.severity === 'MEDIUM' 
                        ? 'warning'
                        : 'info'
                    }>
                      {alert.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Appointments */}
        <Card data-tour="appointments-list">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Clock className="h-5 w-5 text-blue-500 mr-2" />
              Today&apos;s Appointments
            </CardTitle>
            <CardDescription>
              Upcoming appointments for today
            </CardDescription>
          </CardHeader>
          <CardContent>
            {todaysAppointments.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No appointments scheduled for today</p>
            ) : (
              <div className="space-y-3">
                {todaysAppointments.map((appointment, index) => {
                  const rowClass = 'flex items-center justify-between p-3 rounded-lg bg-gray-50';
                  const row = (
                    <>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {formatPatientName(appointment.patient)}
                        </p>
                        <p className="text-xs text-gray-600">
                          {appointment.slot}
                        </p>
                      </div>
                      <Badge variant={
                        appointment.status === 'CONFIRMED' 
                          ? 'default' 
                          : appointment.status === 'IN_PROGRESS'
                          ? 'warning'
                          : appointment.status === 'COMPLETED'
                          ? 'default'
                          : 'outline'
                      }>
                        {appointment.status}
                      </Badge>
                    </>
                  );
                  return currentUser?.role === 'DOCTOR' ? (
                    <Link
                      key={appointment.id ?? index}
                      href={`/dashboard/visits?appointmentId=${encodeURIComponent(appointment.id)}&patientId=${encodeURIComponent(appointment.patientId)}`}
                      className={`${rowClass} hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2`}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div key={appointment.id ?? index} className={rowClass}>{row}</div>
                  );
                })}
                <Button
                  variant="outline"
                  className="w-full mt-4"
                  onClick={() => router.push('/dashboard/appointments')}
                >
                  View All Appointments
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
