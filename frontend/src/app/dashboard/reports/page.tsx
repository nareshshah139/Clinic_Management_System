'use client';

import { displayClinicDate, displayCalendarDate } from '@/lib/date-display';
import { PageHeader } from '@/components/ui/page-header';
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QuickGuide } from '@/components/common/QuickGuide';
import {
  BarChart3,
  Calendar,
  Users,
  DollarSign,
  TrendingUp,
  FileText,
  Activity,
  PieChart,
  AlertCircle,
  Package,
  CreditCard,
  Clock,
  UserCheck,
  Building2,
  Stethoscope,
  ShoppingCart,
  RefreshCw,
} from 'lucide-react';
import { apiClient } from '@/lib/api';

type ReportType = 'revenue' | 'patients' | 'doctors' | 'appointments' | 'inventory' | 'payments';
type ExportFormat = 'JSON' | 'CSV' | 'PDF' | 'EXCEL';

interface ReportData {
  revenue?: RevenueReportData;
  patients?: PatientReportData;
  doctors?: DoctorReportData;
  appointments?: AppointmentReportData;
  inventory?: InventoryReportData;
  payments?: PaymentReportData;
}

interface RevenueReportData {
  totalRevenue: number;
  totalGst: number;
  netRevenue: number;
  totalInvoices: number;
  paymentBreakdown?: PaymentBreakdown[];
  doctorBreakdown?: DoctorBreakdown[];
}

interface PatientReportData {
  totalPatients: number;
  newPatients: number;
  returningPatients: number;
  ageGroupBreakdown?: AgeGroupBreakdown[];
  genderBreakdown?: GenderBreakdown[];
  topVisitingPatients?: TopVisitingPatient[];
}

interface DoctorReportData {
  totalDoctors: number;
  activeDoctors: number;
  departmentBreakdown?: DepartmentBreakdown[];
  doctorMetrics?: DoctorMetrics[];
}

interface AppointmentReportData {
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  completionRate: number;
  cancellationRate: number;
  noShowRate: number;
  peakHours?: PeakHour[];
  roomUtilization?: RoomUtilization[];
}

interface InventoryReportData {
  totalItems: number;
  totalValue: number;
  lowStockItems: number;
  outOfStockItems: number;
  topSellingItems?: TopSellingItem[];
  lowStockAlerts?: LowStockAlert[];
}

interface PaymentReportData {
  totalPayments: number;
  totalAmount: number;
  successfulPayments: number;
  failedPayments: number;
  successRate: number;
  paymentModeBreakdown?: PaymentModeBreakdown[];
  reconciliationSummary?: ReconciliationSummary;
}

interface PaymentBreakdown {
  mode: string;
  amount: number;
  percentage: number;
  transactionCount: number;
}

interface DoctorBreakdown {
  doctorName: string;
  revenue: number;
  visitCount: number;
  averageRevenuePerPatient: number;
}

interface AgeGroupBreakdown {
  ageGroup: string;
  count: number;
  percentage: number;
}

interface GenderBreakdown {
  gender: string;
  count: number;
  percentage: number;
}

interface TopVisitingPatient {
  patientName: string;
  visitCount: number;
  lastVisitDate: string;
  totalRevenue: number;
}

interface DepartmentBreakdown {
  department: string;
  doctorCount: number;
}

interface DoctorMetrics {
  doctorName: string;
  department: string;
  totalAppointments: number;
  completedAppointments: number;
  completionRate: number;
  totalRevenue: number;
  averageRevenuePerAppointment: number;
}

interface PeakHour {
  hour: number;
  appointmentCount: number;
  percentage: number;
}

interface RoomUtilization {
  roomName: string;
  totalAppointments: number;
  utilizationPercentage: number;
  averageAppointmentsPerDay: number;
}

interface TopSellingItem {
  itemName: string;
  quantitySold: number;
  totalRevenue: number;
  averageSellingPrice: number;
}

interface LowStockAlert {
  itemName: string;
  currentStock: number;
  reorderLevel: number;
}

interface PaymentModeBreakdown {
  mode: string;
  totalAmount: number;
  transactionCount: number;
  percentage: number;
  successRate: number;
}

interface ReconciliationSummary {
  totalTransactions: number;
  reconciledTransactions: number;
  pendingReconciliation: number;
  reconciliationRate: number;
}

interface SystemAlerts {
  counts: {
    overdueInvoices: number;
    lowStockAlerts: number;
    expiryAlerts: number;
    pendingPayments: number;
    upcomingAppointments: number;
  };
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportType>('revenue');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    endDate: new Date().toISOString().split('T')[0], // today
  });
  const [reportData, setReportData] = useState<ReportData>({});
  const [systemAlerts, setSystemAlerts] = useState<SystemAlerts | null>(null);

  const reportTypes = [
    {
      id: 'revenue' as ReportType,
      name: 'Revenue Report',
      description: 'Financial performance and revenue analysis',
      icon: DollarSign,
      color: 'text-success-text',
    },
    {
      id: 'patients' as ReportType,
      name: 'Patient Analytics',
      description: 'Patient demographics and statistics',
      icon: Users,
      color: 'text-info-text',
    },
    {
      id: 'doctors' as ReportType,
      name: 'Doctor Performance',
      description: 'Doctor productivity and patient metrics',
      icon: Activity,
      color: 'text-highlight-text',
    },
    {
      id: 'appointments' as ReportType,
      name: 'Appointment Analytics',
      description: 'Scheduling patterns and appointment data',
      icon: Calendar,
      color: 'text-warning-text',
    },
    {
      id: 'inventory' as ReportType,
      name: 'Inventory Report',
      description: 'Stock levels and inventory movements',
      icon: BarChart3,
      color: 'text-highlight-text',
    },
    {
      id: 'payments' as ReportType,
      name: 'Payment Analytics',
      description: 'Payment methods and transaction analysis',
      icon: TrendingUp,
      color: 'text-info-text',
    },
  ];

  const loadSystemData = useCallback(async () => {
    try {
      const [alerts] = await Promise.all([
        apiClient.get<SystemAlerts>('/reports/alerts'),
      ]);
      setSystemAlerts(alerts as SystemAlerts);
    } catch (error) {
      console.error('Error loading system data:', error);
    }
  }, []);

  const generateReport = useCallback(async () => {
    try {
      setLoading(true);
      let response;
      
      const params = {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      };

      switch (selectedReport) {
        case 'revenue':
          response = await apiClient.getRevenueReport({ ...params, includePaymentBreakdown: true });
          break;
        case 'patients':
          response = await apiClient.getPatientReport(params);
          break;
        case 'doctors':
          response = await apiClient.getDoctorReport({ ...params, includePerformanceMetrics: true, includeRevenueMetrics: true });
          break;
        case 'appointments':
          response = await apiClient.get('/reports/appointments', { 
            ...params, 
            includePeakHours: true, 
            includeRoomUtilization: true, 
            includeWaitTimes: true,
            includeCancellationReasons: true 
          });
          break;
        case 'inventory':
          response = await apiClient.get('/reports/inventory', { 
            ...params, 
            includeLowStock: true, 
            includeExpired: true, 
            includeTransactionHistory: true 
          });
          break;
        case 'payments':
          response = await apiClient.get('/reports/payments', { 
            ...params, 
            includeReconciliation: true, 
            includeRefunds: true 
          });
          break;
        default:
          response = null;
      }

      setReportData(prev => ({ ...prev, [selectedReport]: response }));
    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedReport, dateRange]);

  useEffect(() => {
    loadSystemData();
    generateReport();
  }, [loadSystemData, generateReport]);

  const exportReport = async (format: ExportFormat) => {
    try {
      const params = {
        reportType: selectedReport.toUpperCase(),
        exportFormat: format,
        parameters: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        },
      };

      const response = await apiClient.post('/reports/export', params) as { fileUrl?: string; fileName?: string };
      
      // Handle the data URL response
      if (response.fileUrl) {
        const link = document.createElement('a');
        link.href = response.fileUrl;
        link.download = response.fileName || `${selectedReport}_report_${dateRange.startDate}_to_${dateRange.endDate}.${format.toLowerCase()}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Error exporting report:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const renderRevenueReport = () => {
    const data = reportData.revenue;
    if (!data) return null;

    return (
      <div className="space-y-6">
        {/* Main Revenue Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <DollarSign className="h-5 w-5 text-success-text mr-2" />
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                </div>
                <p className="text-2xl font-bold text-success-text">
                  {formatCurrency(data.totalRevenue || 0)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <FileText className="h-5 w-5 text-info-text mr-2" />
                  <p className="text-sm text-muted-foreground">GST Amount</p>
                </div>
                <p className="text-2xl font-bold text-info-text">
                  {formatCurrency(data.totalGst || 0)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <TrendingUp className="h-5 w-5 text-highlight-text mr-2" />
                  <p className="text-sm text-muted-foreground">Net Revenue</p>
                </div>
                <p className="text-2xl font-bold text-highlight-text">
                  {formatCurrency(data.netRevenue || 0)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <FileText className="h-5 w-5 text-warning-text mr-2" />
                  <p className="text-sm text-muted-foreground">Total Invoices</p>
                </div>
                <p className="text-2xl font-bold text-warning-text">
                  {data.totalInvoices || 0}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payment Breakdown */}
        {data.paymentBreakdown && data.paymentBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CreditCard className="h-5 w-5 mr-2" />
                Payment Mode Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data.paymentBreakdown.map((payment: PaymentBreakdown, index: number) => (
                  <div key={index} className="p-3 bg-background rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{payment.mode}</span>
                      <Badge variant="secondary">{formatPercentage(payment.percentage)}</Badge>
                    </div>
                    <div className="mt-1">
                      <p className="text-lg font-bold">{formatCurrency(payment.amount)}</p>
                      <p className="text-sm text-muted-foreground">{payment.transactionCount} transactions</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Doctor Revenue Breakdown */}
        {data.doctorBreakdown && data.doctorBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Stethoscope className="h-5 w-5 mr-2" />
                Top Performing Doctors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.doctorBreakdown.slice(0, 5).map((doctor: DoctorBreakdown, index: number) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-background rounded-lg">
                    <div>
                      <p className="font-medium">{doctor.doctorName}</p>
                      <p className="text-sm text-muted-foreground">{doctor.visitCount} visits</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(doctor.revenue)}</p>
                      <p className="text-sm text-muted-foreground">Avg: {formatCurrency(doctor.averageRevenuePerPatient)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderPatientsReport = () => {
    const data = reportData.patients;
    if (!data) return null;

    return (
      <div className="space-y-6">
        {/* Main Patient Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Users className="h-5 w-5 text-info-text mr-2" />
                  <p className="text-sm text-muted-foreground">Total Patients</p>
                </div>
                <p className="text-2xl font-bold text-info-text">
                  {data.totalPatients || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <UserCheck className="h-5 w-5 text-success-text mr-2" />
                  <p className="text-sm text-muted-foreground">New Patients</p>
                </div>
                <p className="text-2xl font-bold text-success-text">
                  {data.newPatients || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <RefreshCw className="h-5 w-5 text-warning-text mr-2" />
                  <p className="text-sm text-muted-foreground">Returning Patients</p>
                </div>
                <p className="text-2xl font-bold text-warning-text">
                  {data.returningPatients || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Calendar className="h-5 w-5 text-highlight-text mr-2" />
                  <p className="text-sm text-muted-foreground">Avg Age</p>
                </div>
                <p className="text-2xl font-bold text-highlight-text">
                  {data.ageGroupBreakdown ? 
                    Math.round(data.ageGroupBreakdown.reduce((acc: number, group: AgeGroupBreakdown) => acc + (group.count * parseFloat(group.ageGroup.split('-')[0] || '0')), 0) / data.totalPatients) 
                    : 0}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gender Breakdown */}
        {data.genderBreakdown && data.genderBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <PieChart className="h-5 w-5 mr-2" />
                Gender Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data.genderBreakdown.map((gender: GenderBreakdown, index: number) => (
                  <div key={index} className="p-3 bg-background rounded-lg text-center">
                    <p className="font-medium capitalize">{gender.gender}</p>
                    <p className="text-2xl font-bold mt-1">{gender.count}</p>
                    <Badge variant="secondary">{formatPercentage(gender.percentage)}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Visiting Patients */}
        {data.topVisitingPatients && data.topVisitingPatients.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2" />
                Most Frequent Patients
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.topVisitingPatients.slice(0, 5).map((patient: TopVisitingPatient, index: number) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-background rounded-lg">
                    <div>
                      <p className="font-medium">{patient.patientName}</p>
                      <p className="text-sm text-muted-foreground">Last visit: {displayClinicDate(patient.lastVisitDate)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{patient.visitCount} visits</p>
                      <p className="text-sm text-muted-foreground">{formatCurrency(patient.totalRevenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderDoctorsReport = () => {
    const data = reportData.doctors;
    if (!data) return null;

    return (
      <div className="space-y-6">
        {/* Main Doctor Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Stethoscope className="h-5 w-5 text-info-text mr-2" />
                  <p className="text-sm text-muted-foreground">Total Doctors</p>
                </div>
                <p className="text-2xl font-bold text-info-text">
                  {data.totalDoctors || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Activity className="h-5 w-5 text-success-text mr-2" />
                  <p className="text-sm text-muted-foreground">Active Doctors</p>
                </div>
                <p className="text-2xl font-bold text-success-text">
                  {data.activeDoctors || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Building2 className="h-5 w-5 text-highlight-text mr-2" />
                  <p className="text-sm text-muted-foreground">Departments</p>
                </div>
                <p className="text-2xl font-bold text-highlight-text">
                  {data.departmentBreakdown?.length || 0}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Doctor Performance Metrics */}
        {data.doctorMetrics && data.doctorMetrics.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Activity className="h-5 w-5 mr-2" />
                Doctor Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.doctorMetrics.slice(0, 5).map((doctor: DoctorMetrics, index: number) => (
                  <div key={index} className="p-4 bg-background rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium">{doctor.doctorName}</p>
                        <p className="text-sm text-muted-foreground">{doctor.department}</p>
                      </div>
                      <Badge variant="secondary">{formatPercentage(doctor.completionRate)}</Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Appointments</p>
                        <p className="font-bold">{doctor.totalAppointments}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Completed</p>
                        <p className="font-bold text-success-text">{doctor.completedAppointments}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Revenue</p>
                        <p className="font-bold">{formatCurrency(doctor.totalRevenue)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Avg/Appt</p>
                        <p className="font-bold">{formatCurrency(doctor.averageRevenuePerAppointment)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderAppointmentsReport = () => {
    const data = reportData.appointments;
    if (!data) return null;

    return (
      <div className="space-y-6">
        {/* Main Appointment Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Calendar className="h-5 w-5 text-info-text mr-2" />
                  <p className="text-sm text-muted-foreground">Total Appointments</p>
                </div>
                <p className="text-2xl font-bold text-info-text">
                  {data.totalAppointments || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <UserCheck className="h-5 w-5 text-success-text mr-2" />
                  <p className="text-sm text-muted-foreground">Completed</p>
                </div>
                <p className="text-2xl font-bold text-success-text">
                  {data.completedAppointments || 0}
                </p>
                <Badge variant="secondary" className="mt-1">
                  {formatPercentage(data.completionRate || 0)}
                </Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <AlertCircle className="h-5 w-5 text-destructive-text mr-2" />
                  <p className="text-sm text-muted-foreground">Cancelled</p>
                </div>
                <p className="text-2xl font-bold text-destructive-text">
                  {data.cancelledAppointments || 0}
                </p>
                <Badge variant="secondary" className="mt-1">
                  {formatPercentage(data.cancellationRate || 0)}
                </Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Clock className="h-5 w-5 text-warning-text mr-2" />
                  <p className="text-sm text-muted-foreground">No Show</p>
                </div>
                <p className="text-2xl font-bold text-warning-text">
                  {data.noShowAppointments || 0}
                </p>
                <Badge variant="secondary" className="mt-1">
                  {formatPercentage(data.noShowRate || 0)}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Peak Hours */}
        {data.peakHours && data.peakHours.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                Peak Hours
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {data.peakHours.slice(0, 8).map((peak: PeakHour, index: number) => (
                  <div key={index} className="p-3 bg-background rounded-lg text-center">
                    <p className="font-medium">{peak.hour}:00</p>
                    <p className="text-lg font-bold mt-1">{peak.appointmentCount}</p>
                    <Badge variant="secondary">{formatPercentage(peak.percentage)}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Room Utilization */}
        {data.roomUtilization && data.roomUtilization.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Building2 className="h-5 w-5 mr-2" />
                Room Utilization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.roomUtilization.map((room: RoomUtilization, index: number) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-background rounded-lg">
                    <div>
                      <p className="font-medium">{room.roomName}</p>
                      <p className="text-sm text-muted-foreground">Avg: {room.averageAppointmentsPerDay.toFixed(1)} per day</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{room.totalAppointments} appointments</p>
                      <Badge variant="secondary">{formatPercentage(room.utilizationPercentage)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderInventoryReport = () => {
    const data = reportData.inventory;
    if (!data) return null;

    return (
      <div className="space-y-6">
        {/* Main Inventory Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Package className="h-5 w-5 text-info-text mr-2" />
                  <p className="text-sm text-muted-foreground">Total Items</p>
                </div>
                <p className="text-2xl font-bold text-info-text">
                  {data.totalItems || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <DollarSign className="h-5 w-5 text-success-text mr-2" />
                  <p className="text-sm text-muted-foreground">Total Value</p>
                </div>
                <p className="text-2xl font-bold text-success-text">
                  {formatCurrency(data.totalValue || 0)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <AlertCircle className="h-5 w-5 text-destructive-text mr-2" />
                  <p className="text-sm text-muted-foreground">Low Stock</p>
                </div>
                <p className="text-2xl font-bold text-destructive-text">
                  {data.lowStockItems || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <AlertCircle className="h-5 w-5 text-warning-text mr-2" />
                  <p className="text-sm text-muted-foreground">Out of Stock</p>
                </div>
                <p className="text-2xl font-bold text-warning-text">
                  {data.outOfStockItems || 0}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Selling Items */}
        {data.topSellingItems && data.topSellingItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <ShoppingCart className="h-5 w-5 mr-2" />
                Top Selling Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.topSellingItems.slice(0, 5).map((item: TopSellingItem, index: number) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-background rounded-lg">
                    <div>
                      <p className="font-medium">{item.itemName}</p>
                      <p className="text-sm text-muted-foreground">Qty sold: {item.quantitySold}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(item.totalRevenue)}</p>
                      <p className="text-sm text-muted-foreground">Avg: {formatCurrency(item.averageSellingPrice)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Low Stock Alerts */}
        {data.lowStockAlerts && data.lowStockAlerts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertCircle className="h-5 w-5 mr-2 text-destructive-text" />
                Low Stock Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.lowStockAlerts.slice(0, 5).map((item: LowStockAlert, index: number) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-destructive-soft rounded-lg">
                    <div>
                      <p className="font-medium">{item.itemName}</p>
                      <p className="text-sm text-destructive-text">Reorder Level: {item.reorderLevel}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-destructive-text">{item.currentStock} left</p>
                      <Badge variant="destructive">Low Stock</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderPaymentsReport = () => {
    const data = reportData.payments;
    if (!data) return null;

    return (
      <div className="space-y-6">
        {/* Main Payment Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <CreditCard className="h-5 w-5 text-info-text mr-2" />
                  <p className="text-sm text-muted-foreground">Total Payments</p>
                </div>
                <p className="text-2xl font-bold text-info-text">
                  {data.totalPayments || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <DollarSign className="h-5 w-5 text-success-text mr-2" />
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                </div>
                <p className="text-2xl font-bold text-success-text">
                  {formatCurrency(data.totalAmount || 0)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <UserCheck className="h-5 w-5 text-success-text mr-2" />
                  <p className="text-sm text-muted-foreground">Successful</p>
                </div>
                <p className="text-2xl font-bold text-success-text">
                  {data.successfulPayments || 0}
                </p>
                <Badge variant="secondary" className="mt-1">
                  {formatPercentage(data.successRate || 0)}
                </Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <AlertCircle className="h-5 w-5 text-destructive-text mr-2" />
                  <p className="text-sm text-muted-foreground">Failed</p>
                </div>
                <p className="text-2xl font-bold text-destructive-text">
                  {data.failedPayments || 0}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payment Mode Breakdown */}
        {data.paymentModeBreakdown && data.paymentModeBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CreditCard className="h-5 w-5 mr-2" />
                Payment Mode Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data.paymentModeBreakdown.map((mode: PaymentModeBreakdown, index: number) => (
                  <div key={index} className="p-3 bg-background rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">{mode.mode}</span>
                      <Badge variant="secondary">{formatPercentage(mode.percentage)}</Badge>
                    </div>
                    <div>
                      <p className="text-lg font-bold">{formatCurrency(mode.totalAmount)}</p>
                      <p className="text-sm text-muted-foreground">{mode.transactionCount} transactions</p>
                      <p className="text-sm text-success-text">Success: {formatPercentage(mode.successRate)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reconciliation Summary */}
        {data.reconciliationSummary && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Reconciliation Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-3 bg-background rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">Total Transactions</p>
                  <p className="text-xl font-bold">{data.reconciliationSummary.totalTransactions}</p>
                </div>
                <div className="p-3 bg-success-soft rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">Reconciled</p>
                  <p className="text-xl font-bold text-success-text">{data.reconciliationSummary.reconciledTransactions}</p>
                </div>
                <div className="p-3 bg-warning-soft rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-xl font-bold text-warning-text">{data.reconciliationSummary.pendingReconciliation}</p>
                </div>
                <div className="p-3 bg-info-soft rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">Rate</p>
                  <p className="text-xl font-bold text-info-text">{formatPercentage(data.reconciliationSummary.reconciliationRate)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderReportContent = () => {
    if (loading) {
      return (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-md animate-pulse" />
          ))}
        </div>
      );
    }

    const currentData = reportData[selectedReport];
    if (!currentData) {
      return (
        <div className="text-center py-8">
          <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No data available for the selected period</p>
        </div>
      );
    }

    // Render different content based on report type
    switch (selectedReport) {
      case 'revenue':
        return renderRevenueReport();
      case 'patients':
        return renderPatientsReport();
      case 'doctors':
        return renderDoctorsReport();
      case 'appointments':
        return renderAppointmentsReport();
      case 'inventory':
        return renderInventoryReport();
      case 'payments':
        return renderPaymentsReport();
      default:
        return (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Report data will be displayed here</p>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title={<>Reports & Analytics</>} description={<>Generate comprehensive reports and analyze your clinic&apos;s performance</>} actions={<><QuickGuide
          title="Reports & Analytics Guide"
          sections={[
            {
              title: "Report Types",
              items: [
                "Revenue Report: Financial performance and payment analysis",
                "Patient Analytics: Demographics and visit statistics",
                "Doctor Performance: Productivity and revenue metrics",
                "Appointments: Scheduling patterns and completion rates",
                "Inventory: Stock levels and sales analysis",
                "Payments: Transaction analysis and reconciliation"
              ]
            },
            {
              title: "Generating Reports",
              items: [
                "Select a report type from the cards",
                "Set date range using the date picker",
                "Click 'Generate Report' to create the report",
                "View detailed metrics and breakdowns"
              ]
            },
            {
              title: "Exporting Data",
              items: [
                "Export reports in JSON, CSV, PDF, or Excel formats",
                "Use exports for external analysis or record keeping",
                "PDF exports are formatted for printing",
                "CSV/Excel exports can be opened in spreadsheet software"
              ]
            }
          ]}
        /></>} />

      {/* System Alerts */}
      {systemAlerts && systemAlerts.counts && (
        <Card className="border-warning-border bg-warning-soft">
          <CardHeader>
            <CardTitle className="flex items-center text-warning-text">
              <AlertCircle className="h-5 w-5 mr-2" />
              System Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div className="text-center">
                <p className="text-warning-text">Overdue Invoices</p>
                <p className="text-lg font-bold">{systemAlerts.counts.overdueInvoices}</p>
              </div>
              <div className="text-center">
                <p className="text-destructive-text">Low Stock</p>
                <p className="text-lg font-bold">{systemAlerts.counts.lowStockAlerts}</p>
              </div>
              <div className="text-center">
                <p className="text-warning-text">Expiry Alerts</p>
                <p className="text-lg font-bold">{systemAlerts.counts.expiryAlerts}</p>
              </div>
              <div className="text-center">
                <p className="text-info-text">Pending Payments</p>
                <p className="text-lg font-bold">{systemAlerts.counts.pendingPayments}</p>
              </div>
              <div className="text-center">
                <p className="text-success-text">Upcoming Appointments</p>
                <p className="text-lg font-bold">{systemAlerts.counts.upcomingAppointments}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report Type Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportTypes.map((report) => (
          <Card
            key={report.id}
            className={`cursor-pointer transition-all ${
              selectedReport === report.id
                ? 'ring-2 ring-info-border bg-info-soft'
                : 'hover:shadow-sm'
            }`}
            onClick={() => setSelectedReport(report.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg bg-muted`}>
                  <report.icon className={`h-6 w-6 ${report.color}`} />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">{report.name}</h3>
                  <p className="text-sm text-muted-foreground">{report.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground mb-2 block">
                Date Range
              </label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                />
                <Input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={generateReport} disabled={loading}>
                {loading ? 'Generating...' : 'Generate Report'}
              </Button>
              <Select onValueChange={(format: ExportFormat) => exportReport(format)}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Export" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="JSON">JSON</SelectItem>
                  <SelectItem value="CSV">CSV</SelectItem>
                  <SelectItem value="PDF">PDF</SelectItem>
                  <SelectItem value="EXCEL">Excel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            {(() => { const Icon = reportTypes.find(r => r.id === selectedReport)?.icon; return Icon ? <Icon className="h-5 w-5 mr-2" /> : null; })()}
            {reportTypes.find(r => r.id === selectedReport)?.name}
          </CardTitle>
          <CardDescription>
            Report for {displayCalendarDate(dateRange.startDate)} to {displayCalendarDate(dateRange.endDate)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {renderReportContent()}
        </CardContent>
      </Card>
    </div>
  );
} 