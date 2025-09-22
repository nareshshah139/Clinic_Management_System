'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users,
  Package,
  TrendingUp,
  AlertTriangle,
  Clock,
  Database,
  Download,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import type { SystemStatistics, SystemAlert, Appointment } from '@/lib/types';

type MinimalUser = { role?: string } | null;

export default function DashboardPage() {
  const [statistics, setStatistics] = useState<SystemStatistics | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [todaysAppointments, setTodaysAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<MinimalUser>(null);
  const [backupLoading, setBackupLoading] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        
        // Fetch system statistics and current user
        const [stats, user] = await Promise.all([
          apiClient.getSystemStatistics(),
          apiClient.get('/auth/me')
        ]);
        setStatistics(stats as SystemStatistics);
        setCurrentUser((user as MinimalUser) ?? null);

        // For now, provide mock data for alerts and appointments since these endpoints aren't available in minimal mode
        setAlerts([
          {
            id: '1',
            title: 'System Status',
            message: 'All systems operational',
            severity: 'LOW',
            type: 'system',
            createdAt: new Date().toISOString(),
          },
          {
            id: '2',
            title: 'Database Connection',
            message: 'PostgreSQL connection stable',
            severity: 'LOW',
            type: 'database',
            createdAt: new Date().toISOString(),
          },
        ]);

        // Mock today's appointments
        setTodaysAppointments([
          {
            id: '1',
            patientId: 'patient-1',
            doctorId: 'test-doctor-1',
            date: new Date().toISOString(),
            slot: '10:00',
            status: 'SCHEDULED',
            visitType: 'OPD',
            branchId: 'branch-1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            patient: {
              id: 'patient-1',
              firstName: 'John',
              lastName: 'Doe',
              name: 'John Doe',
              phone: '9000000000',
            },
          },
          {
            id: '2',
            patientId: 'patient-2',
            doctorId: 'test-doctor-1',
            date: new Date(Date.now() + 3600000).toISOString(),
            slot: '11:00',
            status: 'CONFIRMED',
            visitType: 'OPD',
            branchId: 'branch-1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            patient: {
              id: 'patient-2',
              firstName: 'Jane',
              lastName: 'Smith',
              name: 'Jane Smith',
              phone: '9000000001',
            },
          },
        ]);
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
  }, []);

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

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Welcome back! Here&apos;s what&apos;s happening at your clinic today.</p>
        </div>
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Users',
      value: statistics?.users?.total || 0,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Active Users',
      value: statistics?.users?.active || 0,
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Total Branches',
      value: statistics?.branches?.total || 0,
      icon: Package,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      title: 'System Status',
      value: statistics?.system?.status || 'unknown',
      icon: TrendingUp,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome back! Here&apos;s what&apos;s happening at your clinic today.</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-full ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Admin Controls */}
      {currentUser?.role === 'ADMIN' || currentUser?.role === 'OWNER' ? (
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
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
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
              <p className="text-gray-500 text-center py-4">No alerts at this time</p>
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
                        ? 'destructive' 
                        : alert.severity === 'MEDIUM' 
                        ? 'secondary' 
                        : 'default'
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
        <Card>
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
                {todaysAppointments.map((appointment, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {appointment.patient?.firstName} {appointment.patient?.lastName}
                      </p>
                      <p className="text-xs text-gray-600">
                        {new Date(appointment.date).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })} - {appointment.slot}
                      </p>
                    </div>
                    <Badge variant={
                      appointment.status === 'CONFIRMED' 
                        ? 'default' 
                        : appointment.status === 'IN_PROGRESS'
                        ? 'secondary'
                        : appointment.status === 'COMPLETED'
                        ? 'default'
                        : 'outline'
                    }>
                      {appointment.status}
                    </Badge>
                  </div>
                ))}
                <Button variant="outline" className="w-full mt-4">
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
