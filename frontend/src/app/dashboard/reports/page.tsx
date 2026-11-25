'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { displayClinicDate, displayCalendarDate } from '@/lib/date-display';
import { PageHeader } from '@/components/ui/page-header';
import { Suspense, useEffect, useMemo, useRef, useState, useCallback, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/lib/utils';
import { REPORT_EXPORT_TYPE } from '@/lib/reports-model';
import { QuickGuide } from '@/components/common/QuickGuide';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  CreditCard,
  Clock,
  Building2,
  Stethoscope,
  ShoppingCart,
  ChevronDown,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { paymentModeLabel } from '@/lib/clinic-payment-modes';
import { rangeError, type DayRange } from '@/lib/date-ranges';
import { clinicToday } from '@/components/pharmacy/pharmacy-report-model';
import { PeriodPicker } from '@/components/pharmacy/reports/ReportToolbar';
import { reportHref } from '@/components/pharmacy/reports/report-catalog';
import { LOW_STOCK_DEFINITION } from '@/lib/clinic-counts';
import type { ReportTab } from '@/lib/reports-model';
import { enumLabel } from '@/lib/labels';
import { isCompleteRange, readReportParams, reportsHref, type ReportParams } from '@/components/reports/report-params';
import { AgeGroupChart, DailyRevenueChart, type DailyRevenue } from '@/components/reports/ReportCharts';
import { SystemAlertsBand, type SystemAlerts } from '@/components/reports/SystemAlertsBand';

type ReportType = ReportTab;
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
  dailyBreakdown?: DailyRevenue[];
  doctorBreakdown?: DoctorBreakdown[];
}

interface PatientReportData {
  totalPatients: number;
  newPatients: number;
  returningPatients: number;
  averageAge?: number | null;
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

function ClinicScopeNote() {
  return (
    <p className="text-sm text-muted-foreground">
      Clinic bills only: consultations and procedures. Pharmacy sales are in{' '}
      <Link href="/dashboard/pharmacy/reports" className="font-medium text-foreground underline underline-offset-4">Pharmacy Reports</Link>, and{' '}
      <Link href={reportHref('daily-collection')} className="font-medium text-foreground underline underline-offset-4">Daily Collection</Link> shows both together.
    </p>
  );
}

/** Dates are drafted here and applied with Show report, so a half-typed date never fetches; a preset applies at once. */
function ReportDates({ applied, today, loading, onApply }: { applied: DayRange; today: string; loading: boolean; onApply: (range: DayRange) => void }) {
  const [draft, setDraft] = useState(applied);
  useEffect(() => setDraft(applied), [applied]);
  const complete = isCompleteRange(draft);
  const problem = complete ? rangeError(draft) : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (complete && !problem) onApply(draft);
  };
  return (
    <form onSubmit={submit} aria-label="Report dates" className="flex flex-wrap items-end gap-2 [&_label]:flex [&_label]:flex-col [&_label]:gap-1 [&_label]:font-medium [&_input]:h-10 [&_input]:w-36">
      <PeriodPicker
        value={draft}
        today={today}
        onChange={setDraft}
        onPreset={(range) => {
          setDraft(range);
          onApply(range);
        }}
      />
      <Button type="submit" disabled={loading || !complete || Boolean(problem)}>
        {loading ? 'Loading…' : 'Show report'}
      </Button>
      {problem && (
        <p role="alert" className="basis-full text-sm font-medium text-destructive-text">
          {problem}
        </p>
      )}
    </form>
  );
}

function ReportsWorkspace() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = clinicToday();
  const { tab: selectedReport, from, to } = readReportParams(searchParams, today);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<{ message: string; forbidden: boolean } | null>(null);
  const requestSeq = useRef(0);
  const [reportData, setReportData] = useState<ReportData>({});
  const [systemAlerts, setSystemAlerts] = useState<SystemAlerts | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const dateRange = { startDate: from, endDate: to };
  const applied = useMemo(() => ({ from, to }), [from, to]);

  const navigate = (next: Partial<ReportParams>) =>
    router.replace(reportsHref({ tab: selectedReport, from, to, ...next }), { scroll: false });

  const reportTypes = [
    {
      id: 'revenue' as ReportType,
      name: 'Revenue',
      description: 'Clinic takings and revenue analysis',
      icon: DollarSign,
    },
    {
      id: 'patients' as ReportType,
      name: 'Patients',
      description: 'Patient demographics and statistics',
      icon: Users,
    },
    {
      id: 'doctors' as ReportType,
      name: 'Doctors',
      description: 'Doctor productivity and patient metrics',
      icon: Activity,
    },
    {
      id: 'appointments' as ReportType,
      name: 'Appointments',
      description: 'Scheduling patterns and appointment data',
      icon: Calendar,
    },
    {
      id: 'inventory' as ReportType,
      name: 'Inventory',
      description: 'Stock levels and inventory movements',
      icon: BarChart3,
    },
    {
      id: 'payments' as ReportType,
      name: 'Payments',
      description: 'Clinic payment methods and transaction analysis',
      icon: TrendingUp,
    },
  ];

  const loadSystemData = useCallback(async () => {
    try {
      setAlertsError(null);
      setSystemAlerts(await apiClient.get<SystemAlerts>('/reports/alerts'));
    } catch (error) {
      setAlertsError(getErrorMessage(error) || 'System alerts could not be loaded.');
    }
  }, []);

  const generateReport = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      setLoading(true);
      setLoadError(null);
      setReportData(prev => ({ ...prev, [selectedReport]: undefined }));
      let response;

      const params = { startDate: from, endDate: to };

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

      if (seq !== requestSeq.current) return;
      setReportData(prev => ({ ...prev, [selectedReport]: response }));
    } catch (error) {
      if (seq !== requestSeq.current) return;
      const forbidden = (error as { status?: number })?.status === 403;
      setLoadError({
        forbidden,
        message: forbidden
          ? "You don't have access to this report. Ask an admin to grant it."
          : getErrorMessage(error) || 'The report could not be loaded.',
      });
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [selectedReport, from, to]);

  useEffect(() => {
    loadSystemData();
  }, [loadSystemData]);

  useEffect(() => {
    generateReport();
  }, [generateReport]);

  const applyRange = (range: DayRange) => {
    if (range.from === from && range.to === to) generateReport();
    else navigate(range);
  };

  const exportReport = async (format: ExportFormat) => {
    try {
      const params = {
        reportType: REPORT_EXPORT_TYPE[selectedReport],
        exportFormat: format,
        parameters: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        },
      };

      const response = await apiClient.post('/reports/export', params) as { fileUrl?: string; fileName?: string };

      if (response.fileUrl) {
        const link = document.createElement('a');
        link.href = response.fileUrl;
        link.download = response.fileName || `${selectedReport}_report_${dateRange.startDate}_to_${dateRange.endDate}.${format.toLowerCase()}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Could not export the report', description: getErrorMessage(error) });
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
        <ClinicScopeNote />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                </div>
                <p className="text-2xl font-bold">
                  {formatCurrency(data.totalRevenue || 0)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">GST Amount</p>
                </div>
                <p className="text-2xl font-bold">
                  {formatCurrency(data.totalGst || 0)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">Net Revenue</p>
                </div>
                <p className="text-2xl font-bold">
                  {formatCurrency(data.netRevenue || 0)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">Total Invoices</p>
                </div>
                <p className="text-2xl font-bold">
                  {data.totalInvoices || 0}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" aria-hidden="true" />
              Takings per day
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DailyRevenueChart range={applied} days={data.dailyBreakdown ?? []} />
          </CardContent>
        </Card>

        {data.paymentBreakdown && data.paymentBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CreditCard className="h-5 w-5 mr-2" />
                Payment Mode Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.paymentBreakdown.map((payment: PaymentBreakdown, index: number) => (
                  <div key={index} className="p-3 bg-muted rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{paymentModeLabel(payment.mode)}</span>
                      <Badge variant="secondary">{formatPercentage(payment.percentage)}</Badge>
                    </div>
                    <div className="mt-1">
                      <p className="text-lg font-bold">{formatCurrency(payment.amount)}</p>
                      <p className="text-sm text-muted-foreground">{payment.transactionCount} {payment.transactionCount === 1 ? 'transaction' : 'transactions'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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
                  <div key={index} className="flex justify-between items-center p-3 bg-muted rounded-lg">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">Total Patients</p>
                </div>
                <p className="text-2xl font-bold">
                  {data.totalPatients || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">New Patients</p>
                </div>
                <p className="text-2xl font-bold">
                  {data.newPatients || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">Returning Patients</p>
                </div>
                <p className="text-2xl font-bold">
                  {data.returningPatients || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">Avg Age</p>
                </div>
                <p className="text-2xl font-bold">
                  {data.averageAge == null ? '—' : Math.round(data.averageAge)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {data.ageGroupBreakdown && data.ageGroupBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="h-5 w-5 mr-2" aria-hidden="true" />
                Age Groups
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AgeGroupChart groups={data.ageGroupBreakdown} />
            </CardContent>
          </Card>
        )}

        {data.genderBreakdown && data.genderBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <PieChart className="h-5 w-5 mr-2" />
                Gender Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.genderBreakdown.map((gender: GenderBreakdown, index: number) => (
                  <div key={index} className="p-3 bg-muted rounded-lg text-center">
                    <p className="font-medium">{enumLabel('gender', gender.gender)}</p>
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
                  <div key={index} className="flex justify-between items-center p-3 bg-muted rounded-lg">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">Total Doctors</p>
                </div>
                <p className="text-2xl font-bold">
                  {data.totalDoctors || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">Active Doctors</p>
                </div>
                <p className="text-2xl font-bold">
                  {data.activeDoctors || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">Departments</p>
                </div>
                <p className="text-2xl font-bold">
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
                  <div key={index} className="p-4 bg-muted rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium">{doctor.doctorName}</p>
                        <p className="text-sm text-muted-foreground">{doctor.department}</p>
                      </div>
                      <Badge variant="secondary">{formatPercentage(doctor.completionRate)}</Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">Total Appointments</p>
                </div>
                <p className="text-2xl font-bold">
                  {data.totalAppointments || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
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
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
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
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {data.peakHours.slice(0, 8).map((peak: PeakHour, index: number) => (
                  <div key={index} className="p-3 bg-muted rounded-lg text-center">
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
                  <div key={index} className="flex justify-between items-center p-3 bg-muted rounded-lg">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">Total Items</p>
                </div>
                <p className="text-2xl font-bold">
                  {data.totalItems || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">Total Value</p>
                </div>
                <p className="text-2xl font-bold">
                  {formatCurrency(data.totalValue || 0)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">Low Stock</p>
                </div>
                <p className="text-2xl font-bold text-warning-text">
                  {data.lowStockItems || 0}
                </p>
                <p className="text-xs text-muted-foreground">{LOW_STOCK_DEFINITION}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">Out of Stock</p>
                </div>
                <p className="text-2xl font-bold text-destructive-text">
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
                  <div key={index} className="flex justify-between items-center p-3 bg-muted rounded-lg">
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

        {data.lowStockAlerts && data.lowStockAlerts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertCircle className="h-5 w-5 mr-2 text-warning-text" aria-hidden="true" />
                Low Stock Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.lowStockAlerts.slice(0, 5).map((item: LowStockAlert, index: number) => {
                  const out = item.currentStock <= 0;
                  return (
                    <div key={index} className={`flex justify-between items-center p-3 rounded-lg ${out ? 'bg-destructive-soft' : 'bg-warning-soft'}`}>
                      <div>
                        <p className="font-medium">{item.itemName}</p>
                        <p className="text-sm text-muted-foreground">Minimum: {item.reorderLevel}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${out ? 'text-destructive-text' : 'text-warning-text'}`}>{item.currentStock} left</p>
                        <Badge variant={out ? 'danger' : 'warning'}>{out ? 'Out of Stock' : 'Low Stock'}</Badge>
                      </div>
                    </div>
                  );
                })}
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
        <ClinicScopeNote />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">Total Payments</p>
                </div>
                <p className="text-2xl font-bold">
                  {data.totalPayments || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                </div>
                <p className="text-2xl font-bold">
                  {formatCurrency(data.totalAmount || 0)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
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
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div>
                <div className="mb-1">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.paymentModeBreakdown.map((mode: PaymentModeBreakdown, index: number) => (
                  <div key={index} className="p-3 bg-muted rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">{paymentModeLabel(mode.mode)}</span>
                      <Badge variant="secondary">{formatPercentage(mode.percentage)}</Badge>
                    </div>
                    <div>
                      <p className="text-lg font-bold">{formatCurrency(mode.totalAmount)}</p>
                      <p className="text-sm text-muted-foreground">{mode.transactionCount} {mode.transactionCount === 1 ? 'transaction' : 'transactions'}</p>
                      <p className="text-sm text-muted-foreground">Successful: {formatPercentage(mode.successRate)}</p>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="p-3 bg-muted rounded-lg text-center">
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

    if (loadError) {
      return (
        <div role="alert" className="text-center py-8 space-y-3">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" aria-hidden="true" />
          <p className="font-medium">{loadError.forbidden ? 'Access denied' : 'Could not load this report'}</p>
          <p className="text-muted-foreground">{loadError.message}</p>
          {!loadError.forbidden && <Button variant="outline" onClick={generateReport}>Retry</Button>}
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
      <PageHeader title={<>Reports & Analytics</>} actions={<><QuickGuide
          title="Reports & Analytics Guide"
          sections={[
            {
              title: "Report Types",
              items: [
                "Revenue: clinic takings per day, by payment mode and by doctor. Pharmacy sales are in Pharmacy Reports",
                "Patient Analytics: Demographics and visit statistics",
                "Doctor Performance: Productivity and revenue metrics",
                "Appointments: Scheduling patterns and completion rates",
                "Inventory: Stock levels and sales analysis",
                "Payments: clinic payment success by mode and reconciliation"
              ]
            },
            {
              title: "Choosing dates",
              items: [
                "Select a report type from the tabs",
                "Pick a Period such as This month or This financial year; it applies at once",
                "Or choose Choose dates…, type From and To as dd/mm/yyyy, and press Show report",
                "The address bar keeps the report and dates, so a bookmark or shared link opens the same view",
                "Click a System Alerts count to see the items behind it"
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

      {systemAlerts?.counts && <SystemAlertsBand alerts={systemAlerts} />}
      {alertsError && (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive-text">
          System alerts could not be loaded: {alertsError}
          <Button variant="outline" size="sm" onClick={loadSystemData}>Retry alerts</Button>
        </p>
      )}

      <Tabs value={selectedReport} onValueChange={(value: string) => navigate({ tab: value as ReportType })} className="gap-4">
        <TabsList aria-label="Report" className="justify-start">
          {reportTypes.map((report) => (
            <TabsTrigger key={report.id} value={report.id} className="flex-none px-3">
              <report.icon aria-hidden="true" />
              {report.name}
            </TabsTrigger>
          ))}
        </TabsList>
        {reportTypes.map((report) => (
          <TabsContent key={report.id} value={report.id}>
            <Card>
              <CardHeader className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0 space-y-1.5">
                  <p className="font-medium text-foreground">{report.description}</p>
                  <CardDescription>
                    Report for {displayCalendarDate(dateRange.startDate)} to {displayCalendarDate(dateRange.endDate)}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <ReportDates applied={applied} today={today} loading={loading} onApply={applyRange} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" aria-label="Export report">
                        Export
                        <ChevronDown aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => exportReport('JSON')}>JSON</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => exportReport('CSV')}>CSV</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => exportReport('PDF')}>PDF</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => exportReport('EXCEL')}>Excel</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                {renderReportContent()}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="cards" label="Loading reports…" />}>
      <ReportsWorkspace />
    </Suspense>
  );
}
