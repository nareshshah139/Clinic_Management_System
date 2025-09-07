'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users,
  Calendar,
  CreditCard,
  Package,
  TrendingUp,
  AlertTriangle,
  Clock,
  DollarSign,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import type { SystemStatistics, SystemAlert, Appointment } from '@/lib/types';

export default function DashboardPage() {
  const [statistics, setStatistics] = useState<SystemStatistics | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [todaysAppointments, setTodaysAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        
        // Fetch system statistics
        const stats = await apiClient.getSystemStatistics();
        setStatistics(stats);

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
            scheduledAt: new Date().toISOString(),
            status: 'SCHEDULED',
            visitType: 'OPD',
            patient: {
              firstName: 'John',
              lastName: 'Doe',
            },
          },
          {
            id: '2',
            patientId: 'patient-2',
            doctorId: 'test-doctor-1',
            scheduledAt: new Date(Date.now() + 3600000).toISOString(),
            status: 'CONFIRMED',
            visitType: 'OPD',
            patient: {
              firstName: 'Jane',
              lastName: 'Smith',
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

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Welcome back! Here's what's happening at your clinic today.</p>
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
        <p className="text-gray-600">Welcome back! Here's what's happening at your clinic today.</p>
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
              Today's Appointments
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
                        {new Date(appointment.scheduledAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })} - {appointment.visitType}
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
