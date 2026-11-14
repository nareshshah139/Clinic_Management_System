import { displayClinicDateTime } from '../../common/date-display';
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { addDays, clinicDay, clinicDayOf, clinicInstants } from '../pharmacy/register-utils';
import { reportRange, type ReportRange } from './report-range';
import { Prisma } from '@prisma/client';
import { viewerGrants } from '../../shared/access/viewer-grants';
import { readStockPage } from '../inventory/inventory-stock-query';
import { clinicBillsDue } from '../billing/billing.service';
import { clinicBillAccess } from '../billing/billing-access';
import {
  RevenueReportResponseDto,
  PaymentBreakdownDto,
  DailyRevenueDto,
  DoctorRevenueDto,
  ServiceRevenueDto,
  PatientReportResponseDto,
  AgeGroupDto,
  GenderBreakdownDto,
  CityBreakdownDto,
  RegistrationTrendDto,
  TopVisitingPatientDto,
  DoctorReportResponseDto,
  DoctorMetricsDto,
  DepartmentBreakdownDto,
  TopPerformingDoctorDto,
  AppointmentReportResponseDto,
  AppointmentStatusBreakdownDto,
  VisitTypeBreakdownDto,
  DailyAppointmentTrendDto,
  DoctorAppointmentBreakdownDto,
  RoomUtilizationDto,
  PeakHourDto,
  InventoryReportResponseDto,
  ItemTypeBreakdownDto,
  CategoryBreakdownDto,
  ManufacturerBreakdownDto,
  LowStockAlertDto,
  ExpiryAlertDto,
  TopSellingItemDto,
  TransactionSummaryDto,
  PaymentReportResponseDto,
  PaymentModeBreakdownDto,
  GatewayBreakdownDto,
  DailyPaymentTrendDto,
  ReconciliationSummaryDto,
  RefundSummaryDto,
  DashboardResponseDto,
  RecentAppointmentDto,
  RevenueTrendDto,
  TopDoctorDto,
  ExportReportDto,
  ExportResponseDto,
  ReportPeriod,
  CancellationReasonDto,
  RefundReasonDto,
} from './dto/reports.dto';
import {
  RevenueQueryDto,
  PatientQueryDto,
  DoctorQueryDto,
  AppointmentQueryDto,
  InventoryQueryDto,
  PaymentQueryDto,
  DashboardQueryDto as DashboardQuery,
} from './dto/query-reports.dto';

/** groupBy rows keyed by instant, summed into clinic days, oldest first. */
function byClinicDay<T extends { createdAt: Date }>(groups: T[], amount: (g: T) => number, count: (g: T) => number) {
  const days = new Map<string, { amount: number; count: number }>();
  for (const g of groups) {
    const day = clinicDay(g.createdAt);
    const total = days.get(day) ?? { amount: 0, count: 0 };
    days.set(day, { amount: total.amount + amount(g), count: total.count + count(g) });
  }
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date, ...total }));
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // REVENUE REPORTS
  /**
   * @cc [owner:nareshshah139,label:product] revenuereport-branch-payment-counts
   * Payment groups MUST count matching branch payments without ambiguous joined-column references.
   */
  async generateRevenueReport(query: RevenueQueryDto, branchId: string): Promise<RevenueReportResponseDto> {
    const { startDate, endDate, period, doctorId, paymentMode, serviceType, includePaymentBreakdown } = query;
    const dateRange = reportRange({ startDate, endDate, period });

    const wherePayments: any = {
      reconStatus: 'COMPLETED',
      createdAt: dateRange.instants,
      invoice: {
        branchId,
        ...(doctorId ? { OR: [{ visit: { doctorId } }, { appointment: { doctorId } }] } : {}),
        ...(serviceType ? { items: { some: { service: { type: { equals: serviceType, mode: 'insensitive' } } } } } : {}),
      },
    };
    if (paymentMode) {
      wherePayments.mode = paymentMode as any;
    }

    const [sumAgg, paymentCount, invoiceIdGroups, paymentModeGroups, dailyGroups] = await Promise.all([
      this.prisma.newPayment.aggregate({ where: wherePayments, _sum: { amount: true } }),
      this.prisma.newPayment.count({ where: wherePayments }),
      this.prisma.newPayment.groupBy({ by: ['invoiceId'], where: wherePayments, _count: { invoiceId: true } }),
      includePaymentBreakdown
        ? this.prisma.newPayment.groupBy({ by: ['mode'], where: wherePayments, _sum: { amount: true }, _count: { _all: true } })
        : Promise.resolve([] as any[]),
      this.prisma.newPayment.groupBy({ by: ['createdAt'], where: wherePayments, _sum: { amount: true }, _count: { _all: true } }),
    ]);

    const totalRevenue = sumAgg._sum.amount ?? 0;
    const totalInvoices = invoiceIdGroups.length;

    const paymentBreakdown: PaymentBreakdownDto[] = (paymentModeGroups as any[]).map((g) => ({
      mode: g.mode,
      amount: g._sum.amount ?? 0,
      percentage: totalRevenue ? (100 * (g._sum.amount ?? 0)) / totalRevenue : 0,
      transactionCount: g._count._all,
    }));

    const dailyBreakdown: DailyRevenueDto[] = byClinicDay(dailyGroups, (g) => g._sum.amount ?? 0, (g) => g._count._all).map((d) => ({
      date: d.date,
      revenue: d.amount,
      invoiceCount: d.count,
      averageInvoiceValue: d.count ? d.amount / d.count : 0,
    }));

    // Each payment carries the invoice's GST in proportion to the share of the invoice it paid.
    const gstPayments = await this.prisma.newPayment.findMany({
      where: wherePayments,
      select: { amount: true, invoice: { select: { total: true, items: { select: { total: true, gstRate: true } } } } },
    });
    let totalGst = 0;
    for (const p of gstPayments) {
      const invoiceGst = p.invoice.items.reduce((sum, it) => sum + (it.total * it.gstRate) / 100, 0);
      if (p.invoice.total > 0) totalGst += (p.amount * invoiceGst) / p.invoice.total;
    }

    // Doctor revenue breakdown via included joins
    const doctorBreakdown = await this.getDoctorRevenueBreakdown(wherePayments);
    const serviceBreakdown = await this.getServiceRevenueBreakdown(wherePayments);

    return {
      totalRevenue,
      totalGst,
      netRevenue: Math.max(0, totalRevenue - totalGst),
      totalInvoices,
      averageInvoiceValue: paymentCount ? totalRevenue / paymentCount : 0,
      paymentBreakdown,
      dailyBreakdown,
      doctorBreakdown,
      serviceBreakdown,
      generatedAt: new Date(),
      period: dateRange.period,
    };
  }

  private async getDoctorRevenueBreakdown(paymentWhere: any): Promise<DoctorRevenueDto[]> {
    const doctor = { select: { id: true, firstName: true, lastName: true } };
    const payments = await this.prisma.newPayment.findMany({
      where: paymentWhere,
      select: {
        amount: true,
        invoice: { select: { patientId: true, visit: { select: { doctor } }, appointment: { select: { doctor } } } },
      },
    });

    const doctorMap = new Map<string, { id: string; name: string; revenue: number; patients: Set<string> }>();
    for (const p of payments) {
      const d = p.invoice.visit?.doctor ?? p.invoice.appointment?.doctor;
      if (!d) continue;
      const current = doctorMap.get(d.id) ?? { id: d.id, name: `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Doctor', revenue: 0, patients: new Set<string>() };
      current.revenue += p.amount;
      current.patients.add(p.invoice.patientId);
      doctorMap.set(d.id, current);
    }

    const result: DoctorRevenueDto[] = Array.from(doctorMap.values()).map((d) => ({
      doctorId: d.id,
      doctorName: d.name,
      revenue: d.revenue,
      patientCount: d.patients.size,
      averageRevenuePerPatient: d.patients.size ? d.revenue / d.patients.size : 0,
      visitCount: d.patients.size,
    }));

    result.sort((a, b) => b.revenue - a.revenue);
    return result;
  }

  /**
   * @cc [owner:nareshshah139] paid-service-revenue
   * Service revenue MUST allocate each selected payment across its stored invoice lines;
   * multiple partial payments cannot count the full invoice repeatedly or duplicate service counts.
   */
  private async getServiceRevenueBreakdown(paymentWhere: any): Promise<ServiceRevenueDto[]> {
    const payments = await this.prisma.newPayment.findMany({
      where: paymentWhere,
      include: { invoice: { select: { items: { include: { service: true } } } } },
    });
    const map = new Map<string, { revenue: number; count: number }>();
    const counted = new Set<string>();
    for (const payment of payments) {
      const items = payment.invoice?.items || [];
      const total = items.reduce((sum, item) => sum + Math.max(0, item.total), 0);
      if (total <= 0) continue;
      for (const item of items) {
        const key = item.service?.type || item.service?.name || 'Unknown';
        const current = map.get(key) || { revenue: 0, count: 0 };
        current.revenue += payment.amount * Math.max(0, item.total) / total;
        if (!counted.has(item.id)) {
          current.count += item.qty;
          counted.add(item.id);
        }
        map.set(key, current);
      }
    }
    return Array.from(map.entries()).map(([serviceType, v]) => ({
      serviceType,
      revenue: v.revenue,
      serviceCount: v.count,
      averageServiceValue: v.count ? v.revenue / v.count : 0,
    }));
  }

  // PATIENT REPORTS
  async generatePatientReport(query: PatientQueryDto, branchId: string): Promise<PatientReportResponseDto> {
    const { startDate, endDate, period, minAge, maxAge, gender, city } = query;
    const dateRange = reportRange({ startDate, endDate, period });

    const wherePatients: any = { branchId };
    if (gender) wherePatients.gender = gender;
    if (city) wherePatients.city = city;

    const [patients, newPatientsCount, visitsInRange, totalPatientsCount] = await Promise.all([
      this.prisma.patient.findMany({ where: wherePatients }),
      this.prisma.patient.count({ where: { ...wherePatients, createdAt: dateRange.instants } }),
      this.prisma.visit.findMany({ where: { createdAt: dateRange.instants, patient: { branchId } }, select: { patientId: true } }),
      this.prisma.patient.count({ where: wherePatients }),
    ]);

    const now = new Date();
    const resolveAge = (p: any): number | null => {
      if (p.age != null) return p.age;
      if (p.dob) return this.ageFromDob(new Date(p.dob), now);
      return null;
    };

    const filtered = patients.filter((p) => {
      const age = resolveAge(p);
      if (age === null) return true;
      if (minAge != null && age < minAge) return false;
      if (maxAge != null && age > maxAge) return false;
      return true;
    });

    const ageBuckets: [string, (age: number) => boolean][] = [
      ['0-17', (a) => a <= 17],
      ['18-30', (a) => a >= 18 && a <= 30],
      ['31-45', (a) => a >= 31 && a <= 45],
      ['46-60', (a) => a >= 46 && a <= 60],
      ['61+', (a) => a >= 61],
    ];

    const ageGroupMap = new Map<string, number>();
    for (const p of filtered) {
      const age = resolveAge(p);
      if (age === null) continue;
      const bucket = ageBuckets.find((b) => b[1](age))?.[0] ?? 'Unknown';
      ageGroupMap.set(bucket, (ageGroupMap.get(bucket) || 0) + 1);
    }
    const ageGroupBreakdown: AgeGroupDto[] = Array.from(ageGroupMap.entries()).map(([ageGroup, count]) => ({
      ageGroup,
      count,
      percentage: filtered.length ? (100 * count) / filtered.length : 0,
    }));

    // Gender breakdown
    const genderMap = new Map<string, number>();
    for (const p of filtered) genderMap.set(p.gender || 'Unknown', (genderMap.get(p.gender || 'Unknown') || 0) + 1);
    const genderBreakdown: GenderBreakdownDto[] = Array.from(genderMap.entries()).map(([genderKey, count]) => ({
      gender: genderKey,
      count,
      percentage: filtered.length ? (100 * count) / filtered.length : 0,
    }));

    // City breakdown
    const cityMap = new Map<string, number>();
    for (const p of filtered) if (p.city) cityMap.set(p.city, (cityMap.get(p.city) || 0) + 1);
    const cityBreakdown: CityBreakdownDto[] = Array.from(cityMap.entries()).map(([cityName, count]) => ({
      city: cityName,
      count,
      percentage: filtered.length ? (100 * count) / filtered.length : 0,
    }));

    // Registration trends (by createdAt)
    const createdGroups = await this.prisma.patient.groupBy({
      by: ['createdAt'],
      where: { ...wherePatients, createdAt: dateRange.instants },
      _count: { id: true },
    });
    const registrationTrends: RegistrationTrendDto[] = byClinicDay(createdGroups, () => 0, (g) => g._count.id).map((d) => ({
      date: d.date,
      registrations: d.count,
    }));

    const distinctPatientsInVisits = new Set(visitsInRange.map((v) => v.patientId));
    const returningPatients = Math.max(0, distinctPatientsInVisits.size - newPatientsCount);

    return {
      totalPatients: totalPatientsCount,
      newPatients: newPatientsCount,
      returningPatients,
      ageGroupBreakdown,
      genderBreakdown,
      cityBreakdown,
      registrationTrends,
      topVisitingPatients: await this.getTopVisitingPatients(branchId, dateRange),
      generatedAt: new Date(),
      period: dateRange.period,
    };
  }

  private ageFromDob(dob: Date, now: Date): number | null {
    if (!dob) return null;
    // Check if DOB is today's date (default placeholder) - ignore time component
    const isToday = 
      dob.getFullYear() === now.getFullYear() &&
      dob.getMonth() === now.getMonth() &&
      dob.getDate() === now.getDate();
    
    if (isToday) return null; // Skip calculation for default date
    
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    return age >= 0 ? age : null;
  }

  private async getTopVisitingPatients(branchId: string, dateRange: ReportRange): Promise<TopVisitingPatientDto[]> {
    const visits = await this.prisma.visit.groupBy({
      by: ['patientId'],
      where: { createdAt: dateRange.instants, patient: { branchId } },
      _count: { patientId: true },
    });
    const top = visits.sort((a, b) => b._count.patientId - a._count.patientId).slice(0, 10);
    const patientIds = top.map((t) => t.patientId);
    if (patientIds.length === 0) return [];

    const [patients, lastVisits, payments] = await Promise.all([
      this.prisma.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, name: true } }),
      this.prisma.visit.findMany({
        where: { patientId: { in: patientIds }, createdAt: dateRange.instants },
        orderBy: { createdAt: 'desc' },
        select: { patientId: true, createdAt: true },
      }),
      this.prisma.newPayment.findMany({
        where: { reconStatus: 'COMPLETED', createdAt: dateRange.instants, invoice: { patientId: { in: patientIds } } },
        select: { amount: true, invoice: { select: { patientId: true } } },
      }),
    ]);

    const patientMap = new Map(patientIds.map((id) => [id, patients.find((p) => p.id === id)?.name || 'Patient'] as const));
    const lastVisitMap = new Map<string, Date>();
    for (const lv of lastVisits) if (!lastVisitMap.has(lv.patientId)) lastVisitMap.set(lv.patientId, lv.createdAt);
    const revenueMap = new Map<string, number>();
    for (const p of payments) revenueMap.set(p.invoice.patientId, (revenueMap.get(p.invoice.patientId) || 0) + p.amount);

    return top.map((t) => ({
      patientId: t.patientId,
      patientName: patientMap.get(t.patientId) || 'Patient',
      visitCount: t._count.patientId,
      lastVisitDate: lastVisitMap.get(t.patientId) || new Date(),
      totalRevenue: revenueMap.get(t.patientId) || 0,
    }));
  }

  // DOCTOR REPORTS
  async generateDoctorReport(query: DoctorQueryDto, branchId: string): Promise<DoctorReportResponseDto> {
    const { startDate, endDate, period, department, includePerformanceMetrics, includeRevenueMetrics } = query;
    const dateRange = reportRange({ startDate, endDate, period });

    const whereDoctors: any = { branchId, role: 'DOCTOR' };
    if (department) whereDoctors.department = department;

    const [doctors, activeDoctors] = await Promise.all([
      this.prisma.user.findMany({ where: whereDoctors, select: { id: true, firstName: true, lastName: true, department: true, status: true } }),
      this.prisma.user.count({ where: { ...whereDoctors, status: 'ACTIVE' } }),
    ]);

    const doctorMetrics: DoctorMetricsDto[] = includePerformanceMetrics
      ? await Promise.all(
          doctors.map(async (d) => {
            const apptWhere = { doctorId: d.id, date: dateRange.instants, branchId } as any;
            const [total, completed, cancelled, noShow, payments] = await Promise.all([
              this.prisma.appointment.count({ where: apptWhere }),
              this.prisma.appointment.count({ where: { ...apptWhere, status: 'COMPLETED' } }),
              this.prisma.appointment.count({ where: { ...apptWhere, status: 'CANCELLED' } }),
              this.prisma.appointment.count({ where: { ...apptWhere, status: 'NO_SHOW' } }),
              this.prisma.newPayment.aggregate({
                where: {
                  reconStatus: 'COMPLETED',
                  createdAt: dateRange.instants,
                  invoice: { branchId, OR: [{ visit: { doctorId: d.id } }, { appointment: { doctorId: d.id } }] },
                },
                _sum: { amount: true },
              }),
            ]);
            const totalRevenue = payments._sum.amount ?? 0;
            return {
              doctorId: d.id,
              doctorName: `${d.firstName} ${d.lastName}`.trim(),
              department: d.department || 'General',
              totalAppointments: total,
              completedAppointments: completed,
              cancelledAppointments: cancelled,
              noShowAppointments: noShow,
              completionRate: total ? (100 * completed) / total : 0,
              averageConsultationTime: 0, // Placeholder until actual tracking exists
              totalRevenue,
              averageRevenuePerAppointment: total ? totalRevenue / total : 0,
              patientSatisfactionScore: 0, // Placeholder
            };
          }),
        )
      : [];

    const departmentBreakdown: DepartmentBreakdownDto[] = await this.getDepartmentBreakdown(branchId);

    const topPerformers: TopPerformingDoctorDto[] = includeRevenueMetrics
      ? doctorMetrics
          .slice()
          .sort((a, b) => b.totalRevenue - a.totalRevenue)
          .slice(0, 10)
          .map((m) => ({
            doctorId: m.doctorId,
            doctorName: m.doctorName,
            department: m.department,
            performanceScore: m.completionRate,
            totalRevenue: m.totalRevenue,
            patientCount: m.totalAppointments,
            completionRate: m.completionRate,
          }))
      : [];

    return {
      totalDoctors: doctors.length,
      activeDoctors,
      doctorMetrics,
      departmentBreakdown,
      topPerformers,
      generatedAt: new Date(),
      period: dateRange.period,
    };
  }

  private async getDepartmentBreakdown(branchId: string): Promise<DepartmentBreakdownDto[]> {
    const users = await this.prisma.user.groupBy({ by: ['department'], where: { branchId, role: 'DOCTOR' }, _count: { id: true } });
    return users.map((u) => ({
      department: u.department || 'General',
      doctorCount: u._count.id,
      totalAppointments: 0,
      totalRevenue: 0,
      averageRevenuePerDoctor: 0,
    }));
  }

  // APPOINTMENT REPORTS
  async generateAppointmentReport(query: AppointmentQueryDto, branchId: string): Promise<AppointmentReportResponseDto> {
    const { startDate, endDate, period, doctorId, status, visitType, roomId, includePeakHours, includeRoomUtilization, includeWaitTimes, includeCancellationReasons } = query as any;
    const dateRange = reportRange({ startDate, endDate, period });

    const where: any = { branchId, date: dateRange.instants };
    if (doctorId) where.doctorId = doctorId;
    if (status) where.status = status;
    if (visitType) where.visitType = visitType;
    if (roomId) where.roomId = roomId;

    const [total, completed, cancelled, noShow, statusGroups, typeGroups, appts] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.count({ where: { ...where, status: 'COMPLETED' } }),
      this.prisma.appointment.count({ where: { ...where, status: 'CANCELLED' } }),
      this.prisma.appointment.count({ where: { ...where, status: 'NO_SHOW' } }),
      this.prisma.appointment.groupBy({ by: ['status'], where, _count: { id: true } }),
      this.prisma.appointment.groupBy({ by: ['visitType'], where, _count: { id: true } }),
      this.prisma.appointment.findMany({ where, select: { id: true, date: true, status: true, doctorId: true, roomId: true, slot: true } }),
    ]);

    const statusBreakdown: AppointmentStatusBreakdownDto[] = statusGroups.map((g) => ({ status: g.status as any, count: g._count.id, percentage: total ? (100 * g._count.id) / total : 0 }));
    const visitTypeBreakdown: VisitTypeBreakdownDto[] = typeGroups.map((g) => ({ visitType: g.visitType as any, count: g._count.id, percentage: total ? (100 * g._count.id) / total : 0 }));

    // Daily trends (bucket by YYYY-MM-DD)
    const trendMap = new Map<string, { total: number; completed: number; cancelled: number }>();
    for (const a of appts) {
      const key = clinicDay(a.date);
      const entry = trendMap.get(key) || { total: 0, completed: 0, cancelled: 0 };
      entry.total += 1;
      if (a.status === 'COMPLETED') entry.completed += 1;
      if (a.status === 'CANCELLED') entry.cancelled += 1;
      trendMap.set(key, entry);
    }
    const dailyTrends: DailyAppointmentTrendDto[] = Array.from(trendMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, v]) => ({ date, appointmentCount: v.total, completedCount: v.completed, cancelledCount: v.cancelled, completionRate: v.total ? (100 * v.completed) / v.total : 0 }));

    // Doctor breakdown
    const doctorMap = new Map<string, { total: number; completed: number; cancelled: number }>();
    for (const a of appts) {
      if (!a.doctorId) continue;
      const entry = doctorMap.get(a.doctorId) || { total: 0, completed: 0, cancelled: 0 };
      entry.total += 1;
      if (a.status === 'COMPLETED') entry.completed += 1;
      if (a.status === 'CANCELLED') entry.cancelled += 1;
      doctorMap.set(a.doctorId, entry);
    }
    const doctorBreakdown: DoctorAppointmentBreakdownDto[] = Array.from(doctorMap.entries()).map(([doctorId, v]) => ({
      doctorId,
      doctorName: doctorId,
      totalAppointments: v.total,
      completedAppointments: v.completed,
      cancelledAppointments: v.cancelled,
      completionRate: v.total ? (100 * v.completed) / v.total : 0,
      averageConsultationTime: 0,
    }));

    // Room utilization
    let roomUtilization: RoomUtilizationDto[] = [];
    if (includeRoomUtilization) {
      const roomMap = new Map<string, { total: number }>();
      for (const a of appts) {
        if (!a.roomId) continue;
        const entry = roomMap.get(a.roomId) || { total: 0 };
        entry.total += 1;
        roomMap.set(a.roomId, entry);
      }
      roomUtilization = Array.from(roomMap.entries()).map(([roomId, v]) => ({
        roomId,
        roomName: roomId,
        totalAppointments: v.total,
        utilizationPercentage: total ? (100 * v.total) / total : 0,
        averageAppointmentsPerDay: v.total / Math.max(1, dailyTrends.length),
      }));
    }

    // Peak hours
    let peakHours: PeakHourDto[] = [];
    if (includePeakHours) {
      const hourMap = new Map<number, number>();
      for (const a of appts) {
        const slot = a.slot || '';
        const hour = Number(slot.split(':')[0]) || new Date(a.date).getHours();
        hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
      }
      const totalAppts = appts.length || 1;
      peakHours = Array.from(hourMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([hour, count]) => ({ hour, appointmentCount: count, percentage: (100 * count) / totalAppts }));
    }

    // Average wait time (minutes) using Visit.createdAt - Appointment.date for completed appointments
    let averageWaitTime = 0;
    if (includeWaitTimes) {
      const apptIds = appts.map((a) => a.id);
      if (apptIds.length > 0) {
        const visits = await this.prisma.visit.findMany({
          where: { appointmentId: { in: apptIds } },
          select: { appointmentId: true, createdAt: true },
        });
        const visitByAppt = new Map<string, Date>();
        for (const v of visits) if (v.appointmentId) visitByAppt.set(v.appointmentId, v.createdAt);
        let totalWait = 0;
        let count = 0;
        for (const a of appts) {
          if (a.status !== 'COMPLETED') continue;
          const vTime = a.id ? visitByAppt.get(a.id) : undefined;
          if (!vTime) continue;
          const diffMs = vTime.getTime() - new Date(a.date).getTime();
          if (diffMs >= 0) {
            totalWait += diffMs / 60000;
            count += 1;
          }
        }
        averageWaitTime = count ? totalWait / count : 0;
      }
    }

    // Cancellation reasons
    let cancellationReasons: CancellationReasonDto[] | undefined;
    if (includeCancellationReasons) {
      const cancelled = await this.prisma.appointment.findMany({ where: { ...where, status: 'CANCELLED' }, select: { notes: true } });
      const map = new Map<string, number>();
      for (const c of cancelled) {
        const reason = (c as any).notes?.split('\n').find((l: string) => l.toLowerCase().startsWith('cancelled:'))?.split(':').slice(1).join(':').trim() || 'Unknown';
        map.set(reason, (map.get(reason) || 0) + 1);
      }
      cancellationReasons = Array.from(map.entries()).map(([reason, count]) => ({ reason, count }));
    }

    return {
      totalAppointments: total,
      completedAppointments: completed,
      cancelledAppointments: cancelled,
      noShowAppointments: noShow,
      completionRate: total ? (100 * completed) / total : 0,
      cancellationRate: total ? (100 * cancelled) / total : 0,
      noShowRate: total ? (100 * noShow) / total : 0,
      statusBreakdown,
      visitTypeBreakdown,
      dailyTrends,
      doctorBreakdown,
      roomUtilization,
      averageWaitTime: includeWaitTimes ? averageWaitTime : 0,
      peakHours,
      cancellationReasons,
      generatedAt: new Date(),
      period: dateRange.period,
    };
  }

  // INVENTORY REPORTS
  async generateInventoryReport(query: InventoryQueryDto, branchId: string): Promise<InventoryReportResponseDto> {
    const { startDate, endDate, period, itemType, category, manufacturer, includeLowStock, includeExpired, includeTransactionHistory } = query;
    const dateRange = reportRange({ startDate, endDate, period });

    const whereItem: any = { branchId };
    if (itemType) whereItem.type = itemType as any;
    if (category) whereItem.category = category;
    if (manufacturer) whereItem.manufacturer = manufacturer;
    if ((query as any).minStockLevel != null) whereItem.currentStock = { ...(whereItem.currentStock || {}), gte: (query as any).minStockLevel };
    if ((query as any).maxStockLevel != null) whereItem.currentStock = { ...(whereItem.currentStock || {}), lte: (query as any).maxStockLevel };

    const items = await this.prisma.inventoryItem.findMany({ where: whereItem });
    const totalItems = items.length;
    const totalValue = items.reduce((s, it) => s + (it.currentStock || 0) * (it.sellingPrice || 0), 0);
    const lowStockItems = items.filter((i) => i.minStockLevel != null && i.currentStock <= (i.minStockLevel || 0)).length;
    const expiredItems = items.filter((i) => i.expiryDate && i.expiryDate < new Date()).length;
    const outOfStockItems = items.filter((i) => (i.currentStock || 0) <= 0).length;

    const byTypeMap = new Map<string, { count: number; value: number }>();
    const byCategoryMap = new Map<string, { count: number; value: number }>();
    const byManufacturerMap = new Map<string, { count: number; value: number }>();
    for (const it of items) {
      const value = (it.currentStock || 0) * (it.sellingPrice || 0);
      const tKey = it.type || 'UNKNOWN';
      byTypeMap.set(tKey as any, { count: (byTypeMap.get(tKey as any)?.count || 0) + 1, value: (byTypeMap.get(tKey as any)?.value || 0) + value });
      const cKey = it.category || 'Uncategorized';
      byCategoryMap.set(cKey, { count: (byCategoryMap.get(cKey)?.count || 0) + 1, value: (byCategoryMap.get(cKey)?.value || 0) + value });
      const mKey = it.manufacturer || 'Unknown';
      byManufacturerMap.set(mKey, { count: (byManufacturerMap.get(mKey)?.count || 0) + 1, value: (byManufacturerMap.get(mKey)?.value || 0) + value });
    }

    const itemTypeBreakdown: ItemTypeBreakdownDto[] = Array.from(byTypeMap.entries()).map(([itemTypeKey, v]) => ({ itemType: itemTypeKey as any, count: v.count, totalValue: v.value, percentage: totalValue ? (100 * v.value) / totalValue : 0 }));
    const categoryBreakdown: CategoryBreakdownDto[] = Array.from(byCategoryMap.entries()).map(([categoryKey, v]) => ({ category: categoryKey, count: v.count, totalValue: v.value, percentage: totalValue ? (100 * v.value) / totalValue : 0 }));
    const manufacturerBreakdown: ManufacturerBreakdownDto[] = Array.from(byManufacturerMap.entries()).map(([manufacturerKey, v]) => ({ manufacturer: manufacturerKey, count: v.count, totalValue: v.value, percentage: totalValue ? (100 * v.value) / totalValue : 0 }));

    // Supplier breakdown (best-effort using manufacturer/supplier field)
    const supplierMap = new Map<string, { count: number; value: number }>();
    for (const it of items) {
      const key = (it as any).supplier || (it as any).manufacturer || 'Unknown';
      const value = (it.currentStock || 0) * (it.sellingPrice || 0);
      const cur = supplierMap.get(key) || { count: 0, value: 0 };
      cur.count += 1;
      cur.value += value;
      supplierMap.set(key, cur);
    }
    const supplierBreakdown = Array.from(supplierMap.entries()).map(([supplier, v]) => ({ supplier, count: v.count, totalValue: v.value }));

    const [topSellingItems, transactionSummary] = await Promise.all([
      this.getTopSellingItems(branchId, dateRange),
      includeTransactionHistory ? this.getTransactionSummary(branchId, dateRange) : Promise.resolve({
        totalTransactions: 0,
        purchaseTransactions: 0,
        saleTransactions: 0,
        returnTransactions: 0,
        adjustmentTransactions: 0,
        totalPurchaseValue: 0,
        totalSaleValue: 0,
        profitMargin: 0,
      }),
    ]);

    const lowStockAlerts: LowStockAlertDto[] = includeLowStock
      ? items
          .filter((i) => i.minStockLevel != null && i.currentStock <= (i.minStockLevel || 0))
          .map((i) => ({ itemId: i.id, itemName: i.name, currentStock: i.currentStock, reorderLevel: i.minStockLevel || 0, daysUntilStockout: -1 }))
      : [];

    const expiryAlerts: ExpiryAlertDto[] = includeExpired
      ? items
          .filter((i) => i.expiryDate && i.expiryDate > new Date() && i.expiryDate < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
          .map((i) => ({ itemId: i.id, itemName: i.name, expiryDate: i.expiryDate!, daysUntilExpiry: Math.ceil((i.expiryDate!.getTime() - Date.now()) / (24 * 60 * 60 * 1000)), currentStock: i.currentStock }))
      : [];

    return {
      totalItems,
      totalValue,
      lowStockItems,
      expiredItems,
      outOfStockItems,
      itemTypeBreakdown,
      categoryBreakdown,
      manufacturerBreakdown,
      lowStockAlerts,
      expiryAlerts,
      topSellingItems,
      transactionSummary,
      supplierBreakdown,
      generatedAt: new Date(),
      period: dateRange.period,
    };
  }

  private async getTopSellingItems(branchId: string, dateRange: ReportRange): Promise<TopSellingItemDto[]> {
    const tx = await this.prisma.stockTransaction.findMany({
      where: { branchId, type: 'SALE', createdAt: dateRange.instants },
      select: { itemId: true, quantity: true, unitPrice: true, item: { select: { name: true } } },
    });
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const t of tx) {
      const cur = map.get(t.itemId) || { name: t.item?.name || 'Item', qty: 0, revenue: 0 };
      cur.qty += t.quantity || 0;
      cur.revenue += (t.quantity || 0) * (t.unitPrice || 0);
      map.set(t.itemId, cur);
    }
    return Array.from(map.entries())
      .map(([itemId, v]) => ({ itemId, itemName: v.name, quantitySold: v.qty, totalRevenue: v.revenue, averageSellingPrice: v.qty ? v.revenue / v.qty : 0 }))
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 10);
  }

  private async getTransactionSummary(branchId: string, dateRange: ReportRange): Promise<TransactionSummaryDto> {
    const where = { branchId, createdAt: dateRange.instants } as any;
    const [total, purchase, sale, ret, adj] = await Promise.all([
      this.prisma.stockTransaction.count({ where }),
      this.prisma.stockTransaction.count({ where: { ...where, type: 'PURCHASE' } }),
      this.prisma.stockTransaction.count({ where: { ...where, type: 'SALE' } }),
      this.prisma.stockTransaction.count({ where: { ...where, type: 'RETURN' } }),
      this.prisma.stockTransaction.count({ where: { ...where, type: 'ADJUSTMENT' } }),
    ]);
    const sums = await this.prisma.stockTransaction.aggregate({ where, _sum: { totalAmount: true } });
    const saleSum = await this.prisma.stockTransaction.aggregate({ where: { ...where, type: 'SALE' }, _sum: { totalAmount: true } });
    const purchaseSum = await this.prisma.stockTransaction.aggregate({ where: { ...where, type: 'PURCHASE' }, _sum: { totalAmount: true } });
    const totalSaleValue = saleSum._sum.totalAmount || 0;
    const totalPurchaseValue = purchaseSum._sum.totalAmount || 0;
    const profitMargin = totalPurchaseValue ? ((totalSaleValue - totalPurchaseValue) / totalPurchaseValue) * 100 : 0;
    return { totalTransactions: total, purchaseTransactions: purchase, saleTransactions: sale, returnTransactions: ret, adjustmentTransactions: adj, totalPurchaseValue, totalSaleValue, profitMargin };
  }

  // PAYMENT REPORTS
  /**
   * @cc [owner:nareshshah139,label:product] paymentreport-branch-payment-counts
   * Payment groups MUST count matching branch payments without ambiguous joined-column references.
   * Refund summaries MUST use branch-scoped completed refund records from clinic billing.
   */
  async generatePaymentReport(query: PaymentQueryDto, branchId: string): Promise<PaymentReportResponseDto> {
    const { startDate, endDate, period, paymentMode, gateway, includeReconciliation, includeRefunds } = query;
    const dateRange = reportRange({ startDate, endDate, period });

    const where: any = {
      invoice: { branchId },
      createdAt: dateRange.instants,
    };
    if (paymentMode) where.mode = paymentMode as any; // Fixed: use 'mode' instead of 'method'
    if (gateway) where.gateway = gateway;

    const [totalAmountAgg, totalPayments, successfulPayments, failedPayments, pendingPayments, modeGroups, gatewayGroups, dailyGroups, dailySuccess, dailyFailed] = await Promise.all([
      this.prisma.newPayment.aggregate({ where, _sum: { amount: true } }),
      this.prisma.newPayment.count({ where }),
      this.prisma.newPayment.count({ where: { ...where, reconStatus: 'COMPLETED' } }),
      this.prisma.newPayment.count({ where: { ...where, reconStatus: 'FAILED' } }),
      this.prisma.newPayment.count({ where: { ...where, reconStatus: 'PENDING' } }),
      this.prisma.newPayment.groupBy({ by: ['mode'], where, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.newPayment.groupBy({ by: ['gateway'], where, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.newPayment.groupBy({ by: ['createdAt'], where, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.newPayment.groupBy({ by: ['createdAt'], where: { ...where, reconStatus: 'COMPLETED' }, _count: { _all: true } }),
      this.prisma.newPayment.groupBy({ by: ['createdAt'], where: { ...where, reconStatus: 'FAILED' }, _count: { _all: true } }),
    ]);

    const totalAmount = totalAmountAgg._sum.amount || 0;
    const paymentModeBreakdown: PaymentModeBreakdownDto[] = modeGroups.map((g) => ({ mode: g.mode as any, transactionCount: g._count._all, totalAmount: g._sum.amount || 0, percentage: totalAmount ? (100 * (g._sum.amount || 0)) / totalAmount : 0, successRate: totalPayments ? (100 * successfulPayments) / totalPayments : 0 }));
    const gatewayBreakdown: GatewayBreakdownDto[] = gatewayGroups.map((g) => ({ gateway: g.gateway || 'N/A', transactionCount: g._count._all, totalAmount: g._sum.amount || 0, successRate: successfulPayments ? (100 * successfulPayments) / totalPayments : 0, averageTransactionAmount: g._count._all ? (g._sum.amount || 0) / g._count._all : 0 }));

    const countsByDay = (groups: typeof dailySuccess) => new Map(byClinicDay(groups, () => 0, (g) => g._count._all).map((d) => [d.date, d.count]));
    const successMap = countsByDay(dailySuccess);
    const failedMap = countsByDay(dailyFailed);

    const dailyTrends: DailyPaymentTrendDto[] = byClinicDay(dailyGroups, (g) => g._sum.amount || 0, (g) => g._count._all).map((d) => (
      { date: d.date, paymentCount: d.count, totalAmount: d.amount, successfulPayments: successMap.get(d.date) || 0, failedPayments: failedMap.get(d.date) || 0 }
    ));

    const reconciliationSummary: ReconciliationSummaryDto = includeReconciliation
      ? { totalTransactions: totalPayments, reconciledTransactions: successfulPayments, pendingReconciliation: pendingPayments, reconciliationRate: totalPayments ? (100 * successfulPayments) / totalPayments : 0, discrepancyAmount: Math.max(0, totalAmount - (modeGroups.reduce((s, g) => s + ((g._sum?.amount as number) || 0), 0))) }
      : { totalTransactions: 0, reconciledTransactions: 0, pendingReconciliation: 0, reconciliationRate: 0, discrepancyAmount: 0 };

    let refundSummary: RefundSummaryDto = { totalRefunds: 0, totalRefundAmount: 0, refundRate: 0, averageRefundAmount: 0, refundReasons: [] };
    if (includeRefunds) {
      const refundWhere: Prisma.NewPaymentWhereInput = {
        invoice: { branchId }, createdAt: dateRange.instants,
        reconStatus: 'COMPLETED', ...(paymentMode ? { mode: paymentMode as any } : {}), ...(gateway ? { gateway } : {}),
      };
      const [refunds, positivePayments] = await Promise.all([
        this.prisma.newPayment.findMany({ where: { ...refundWhere, amount: { lt: 0 }, reference: { startsWith: 'REFUND' } }, select: { amount: true, reference: true } }),
        this.prisma.newPayment.count({ where: { ...refundWhere, amount: { gt: 0 } } }),
      ]);
      const amountsByReason = new Map<string, { count: number; amount: number }>();
      for (const refund of refunds) {
        const reason = refund.reference?.replace(/^REFUND:?\s*/, '').trim() || 'Unspecified';
        const entry = amountsByReason.get(reason) ?? { count: 0, amount: 0 };
        entry.count += 1;
        entry.amount += Math.abs(refund.amount);
        amountsByReason.set(reason, entry);
      }
      const totalRefundAmount = refunds.reduce((sum, refund) => sum + Math.abs(refund.amount), 0);
      refundSummary = {
        totalRefunds: refunds.length, totalRefundAmount,
        refundRate: positivePayments ? 100 * refunds.length / positivePayments : 0,
        averageRefundAmount: refunds.length ? totalRefundAmount / refunds.length : 0,
        refundReasons: Array.from(amountsByReason, ([reason, value]) => ({ reason, ...value, percentage: 100 * value.count / refunds.length })),
      };
    }

    return {
      totalPayments,
      totalAmount,
      successfulPayments,
      failedPayments,
      pendingPayments,
      successRate: totalPayments ? (100 * successfulPayments) / totalPayments : 0,
      paymentModeBreakdown,
      gatewayBreakdown,
      dailyTrends,
      reconciliationSummary,
      refundSummary,
      generatedAt: new Date(),
      period: dateRange.period,
    };
  }

  // DASHBOARD
  /**
   * @cc [owner:nareshshah139,label:product] dashboard-branch-payment-counts
   * Payment groups MUST count matching branch payments without ambiguous joined-column references.
   */
  async generateDashboard(query: DashboardQuery, branchId: string): Promise<DashboardResponseDto> {
    const day = (query.date && clinicDayOf(query.date)) || clinicDay(new Date());
    const today = clinicInstants(day, day);
    const lastSevenDays = clinicInstants(addDays(day, -6), day);

    const [appointments, completed, revenueAgg, patients, activeDoctors, lowStockAlerts, pendingPayments, recentAppointmentsRaw, revenueLast7] = await Promise.all([
      this.prisma.appointment.count({ where: { branchId, date: today } }),
      this.prisma.appointment.count({ where: { branchId, date: today, status: 'COMPLETED' } }),
      this.prisma.newPayment.aggregate({ where: { invoice: { branchId }, reconStatus: 'COMPLETED', createdAt: today }, _sum: { amount: true } }),
      this.prisma.patient.count({ where: { branchId, createdAt: today } }),
      this.prisma.appointment.groupBy({ by: ['doctorId'], where: { branchId, date: today }, _count: { doctorId: true } }),
      this.prisma.inventoryItem.count({ where: { branchId, NOT: { minStockLevel: null }, AND: [{ currentStock: { lte: 0 } }, { minStockLevel: { gt: 0 } }] } }),
      this.prisma.newPayment.count({ where: { invoice: { branchId }, reconStatus: 'PENDING' } }),
      this.prisma.appointment.findMany({ where: { branchId }, orderBy: { date: 'desc' }, take: 10, select: { id: true, date: true, status: true, visitType: true, patient: { select: { name: true } }, doctor: { select: { firstName: true, lastName: true } } } }),
      this.prisma.newPayment.groupBy({ by: ['createdAt'], where: { invoice: { branchId }, reconStatus: 'COMPLETED', createdAt: lastSevenDays }, _sum: { amount: true }, _count: { _all: true } }),
    ]);

    const recentAppointments: RecentAppointmentDto[] = recentAppointmentsRaw.map((a) => ({
      appointmentId: a.id,
      patientName: a.patient?.name || 'Patient',
      doctorName: `${a.doctor?.firstName || ''} ${a.doctor?.lastName || ''}`.trim(),
      appointmentTime: a.date,
      status: a.status as any,
      visitType: a.visitType as any,
    }));

    const revenueTrends: RevenueTrendDto[] = byClinicDay(revenueLast7, (g) => g._sum.amount || 0, (g) => g._count._all)
      .map((d) => ({ date: d.date, revenue: d.amount, invoiceCount: d.count }));

    const topDoctors: TopDoctorDto[] = activeDoctors
      .sort((a, b) => b._count.doctorId - a._count.doctorId)
      .slice(0, 5)
      .map((d) => ({ doctorId: d.doctorId || 'N/A', doctorName: d.doctorId || 'Doctor', revenue: 0, patientCount: d._count.doctorId }));

    return {
      todayAppointments: appointments,
      todayCompleted: completed,
      todayRevenue: revenueAgg._sum.amount || 0,
      todayPatients: patients,
      todayActiveDoctors: activeDoctors.length,
      lowStockAlerts,
      pendingPayments,
      recentAppointments,
      revenueTrends,
      topDoctors,
      generatedAt: new Date(),
    };
  }

  // EXPORTS
  async exportReport(exportDto: ExportReportDto, branchId: string): Promise<ExportResponseDto> {
    const { reportType, exportFormat, parameters } = exportDto;

    let data: any;
    switch (reportType) {
      case 'REVENUE':
        data = await this.generateRevenueReport(parameters as any, branchId);
        break;
      case 'PATIENT':
        data = await this.generatePatientReport(parameters as any, branchId);
        break;
      case 'DOCTOR':
        data = await this.generateDoctorReport(parameters as any, branchId);
        break;
      case 'APPOINTMENT':
        data = await this.generateAppointmentReport(parameters as any, branchId);
        break;
      case 'INVENTORY':
        data = await this.generateInventoryReport(parameters as any, branchId);
        break;
      case 'PAYMENT':
        data = await this.generatePaymentReport(parameters as any, branchId);
        break;
      default:
        throw new BadRequestException(`Unsupported report type: ${reportType}`);
    }

    // Generate export content
    const timestamp = Date.now();
    const fileBase = `${reportType}-report-${timestamp}`;
    let fileUrl = '';
    let fileName = '';
    let fileSize = 0;

    if (exportFormat === 'JSON') {
      const jsonString = JSON.stringify(data, null, 2);
      const base64 = Buffer.from(jsonString).toString('base64');
      fileUrl = `data:application/json;base64,${base64}`;
      fileName = `${fileBase}.json`;
      fileSize = jsonString.length;
    } else if (exportFormat === 'CSV') {
      const rows = this.prepareRowsForCsv(reportType, data);
      const csv = this.arrayOfObjectsToCsv(rows);
      const base64 = Buffer.from(csv).toString('base64');
      fileUrl = `data:text/csv;base64,${base64}`;
      fileName = `${fileBase}.csv`;
      fileSize = csv.length;
    } else if (exportFormat === 'PDF') {
      // Build a simple PDF with summary and key rows
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {});

      doc.fontSize(18).text(`${reportType} Report`, { underline: true });
      doc.moveDown();
      doc.fontSize(10).text(`Generated: ${displayClinicDateTime(new Date())}`);
      doc.moveDown();

      const rows = this.prepareRowsForCsv(reportType, data);
      const maxLines = Math.min(50, rows.length);
      for (let i = 0; i < maxLines; i++) {
        const row = rows[i];
        const line = Object.entries(row)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' | ');
        doc.text(line);
      }
      if (rows.length > maxLines) doc.text(`... and ${rows.length - maxLines} more rows`);

      doc.end();
      const pdfBuffer = Buffer.concat(chunks);
      const base64 = pdfBuffer.toString('base64');
      fileUrl = `data:application/pdf;base64,${base64}`;
      fileName = `${fileBase}.pdf`;
      fileSize = pdfBuffer.length;
    } else if (exportFormat === 'EXCEL') {
      // Build a workbook with a single sheet from rows
      const XLSX = require('xlsx');
      const rows = this.prepareRowsForCsv(reportType, data);
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const base64 = Buffer.from(excelBuffer).toString('base64');
      fileUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
      fileName = `${fileBase}.xlsx`;
      fileSize = (excelBuffer as Buffer).length;
    } else {
      throw new BadRequestException('Unsupported report export format');
    }

    return {
      fileUrl,
      fileName,
      fileSize,
      format: exportFormat as any,
      exportedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  private prepareRowsForCsv(reportType: string, data: any): Array<Record<string, any>> {
    switch (reportType) {
      case 'REVENUE': {
        const headerRow = [{ metric: 'Total Revenue', value: data.totalRevenue }, { metric: 'Total GST', value: data.totalGst }, { metric: 'Net Revenue', value: data.netRevenue }];
        const daily = (data.dailyBreakdown || []).map((d: any) => ({ date: d.date, revenue: d.revenue, invoiceCount: d.invoiceCount, averageInvoiceValue: d.averageInvoiceValue }));
        return [...headerRow, { metric: '---', value: '---' }, ...daily];
      }
      case 'PATIENT': {
        const totals = [{ metric: 'Total Patients', value: data.totalPatients }, { metric: 'New Patients', value: data.newPatients }, { metric: 'Returning Patients', value: data.returningPatients }];
        const trends = (data.registrationTrends || []).map((t: any) => ({ date: t.date, registrations: t.registrations }));
        return [...totals, { metric: '---', value: '---' }, ...trends];
      }
      case 'DOCTOR': {
        return (data.doctorMetrics || []).map((m: any) => ({ doctorId: m.doctorId, doctorName: m.doctorName, department: m.department, totalAppointments: m.totalAppointments, completionRate: m.completionRate, totalRevenue: m.totalRevenue }));
      }
      case 'APPOINTMENT': {
        return (data.dailyTrends || []).map((t: any) => ({ date: t.date, appointmentCount: t.appointmentCount, completedCount: t.completedCount, cancelledCount: t.cancelledCount, completionRate: t.completionRate }));
      }
      case 'INVENTORY': {
        return (data.topSellingItems || []).map((i: any) => ({ itemId: i.itemId, itemName: i.itemName, quantitySold: i.quantitySold, totalRevenue: i.totalRevenue, averageSellingPrice: i.averageSellingPrice }));
      }
      case 'PAYMENT': {
        return (data.dailyTrends || []).map((t: any) => ({ date: t.date, paymentCount: t.paymentCount, totalAmount: t.totalAmount, successfulPayments: t.successfulPayments, failedPayments: t.failedPayments }));
      }
      default:
        return Array.isArray(data) ? data : [data];
    }
  }

  private arrayOfObjectsToCsv(rows: Array<Record<string, any>>): string {
    if (!rows || rows.length === 0) return '';
    const allKeys = new Set<string>();
    for (const r of rows) Object.keys(r).forEach((k) => allKeys.add(k));
    const headers = Array.from(allKeys);
    const escape = (val: any) => {
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map((h) => escape(r[h])).join(','));
    }
    return lines.join('\n');
  }

  // SYSTEM STATISTICS
  async getSystemStatistics(branchId: string): Promise<any> {
    const day = clinicDay(new Date());
    const today = clinicInstants(day, day);
    const thisMonth = clinicInstants(`${day.slice(0, 7)}-01`, day);

    const [
      totalPatients,
      totalAppointments,
      completedAppointments,
      cancelledAppointments,
      noShowAppointments,
      todayAppointments,
      todayCompleted,
      paymentsThisMonthAgg,
      pendingPayments,
      outstandingInvoices,
      lowStockItems,
      outOfStockItems,
      activeDoctors,
    ] = await Promise.all([
      this.prisma.patient.count({ where: { branchId } }),
      this.prisma.appointment.count({ where: { branchId } }),
      this.prisma.appointment.count({ where: { branchId, status: 'COMPLETED' as any } }),
      this.prisma.appointment.count({ where: { branchId, status: 'CANCELLED' as any } }),
      this.prisma.appointment.count({ where: { branchId, status: 'NO_SHOW' as any } }),
      this.prisma.appointment.count({ where: { branchId, date: today } }),
      this.prisma.appointment.count({ where: { branchId, date: today, status: 'COMPLETED' as any } }),
      this.prisma.newPayment.aggregate({ where: { invoice: { branchId }, reconStatus: 'COMPLETED', createdAt: thisMonth }, _sum: { amount: true } }),
      this.prisma.newPayment.count({ where: { invoice: { branchId }, reconStatus: 'PENDING' } }),
      this.prisma.newInvoice.count({ where: { branchId, status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] } } }),
      this.prisma.inventoryItem.count({ where: { branchId, NOT: { minStockLevel: null }, AND: [{ currentStock: { lte: 0 } }, { minStockLevel: { gt: 0 } }] } }),
      this.prisma.inventoryItem.count({ where: { branchId, currentStock: { lte: 0 } } }),
      this.prisma.user.count({ where: { branchId, role: 'DOCTOR' as any, status: 'ACTIVE' as any } }),
    ]);

    const completionRate = totalAppointments ? (100 * completedAppointments) / totalAppointments : 0;
    const cancellationRate = totalAppointments ? (100 * cancelledAppointments) / totalAppointments : 0;
    const noShowRate = totalAppointments ? (100 * noShowAppointments) / totalAppointments : 0;

    return {
      totals: {
        patients: totalPatients,
        appointments: totalAppointments,
        revenueThisMonth: (paymentsThisMonthAgg as any)._sum?.amount || 0,
      },
      appointmentMetrics: {
        completed: completedAppointments,
        cancelled: cancelledAppointments,
        noShow: noShowAppointments,
        completionRate,
        cancellationRate,
        noShowRate,
        todayAppointments,
        todayCompleted,
      },
      billing: {
        pendingPayments,
        outstandingInvoiceCount: outstandingInvoices,
      },
      inventory: {
        lowStockItems,
        outOfStockItems,
      },
      doctors: {
        activeDoctors,
      },
      generatedAt: new Date(),
    };
  }

  // SYSTEM ALERTS
  /**
   * @cc [owner:nareshshah139,label:security] pharmacist-stock-alerts
   * A pharmacist MUST receive only the stock alerts (low stock and expiry), never invoices,
   * payments or appointments.
   */
  /**
   * @cc [owner:nareshshah139,label:security] alerts-by-grant
   * Every signed-in user MUST get a 200 from system alerts, holding only the sections whose own
   * permission the user holds: overdue invoices need billing:invoice:read, pending payments
   * billing:payment:read, appointments appointments:read, low stock and expiry their inventory
   * alert permissions. A user with no matching grant, or no record, MUST get empty sections.
   */
  async getSystemAlerts(branchId: string, viewer: { id?: string; role?: string }): Promise<any> {
    const grants = await viewerGrants(this.prisma, viewer);
    const sees = {
      invoices: grants.has('billing:invoice:read'),
      payments: grants.has('billing:payment:read'),
      appointments: grants.has('appointments:read'),
      lowStock: grants.has('inventory:alerts:lowStock'),
      expiry: grants.has('inventory:alerts:expiry'),
    };
    const now = new Date();
    const in48Hours = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const noStock = { rows: [] as any[], total: 0 };
    const openBills = clinicBillsDue(branchId);

    const [billsDue, billsDueSum, billAccess, low, expiring, pendingPaymentsList, upcomingAppointments] = await Promise.all([
      !sees.invoices ? [] : this.prisma.newInvoice.findMany({
        where: openBills,
        select: {
          id: true, invoiceNo: true, balance: true, status: true, createdAt: true, dueDate: true,
          patient: { select: { id: true, name: true } },
          appointment: { select: { id: true, doctorId: true, date: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 10,
      }),
      !sees.invoices ? null : this.prisma.newInvoice.aggregate({ where: openBills, _count: true, _sum: { balance: true } }),
      sees.invoices && viewer.id && viewer.role ? clinicBillAccess(this.prisma, { id: viewer.id, role: viewer.role }) : null,
      !sees.lowStock ? noStock : readStockPage(this.prisma, branchId, { stock: 'LOW', sortBy: 'available', limit: 10 }, (item) => item),
      !sees.expiry ? noStock : readStockPage(this.prisma, branchId, { expiryMonths: '3', sortBy: 'expiryDate', limit: 10 }, (item) => item),
      !sees.payments ? [] : this.prisma.newPayment.findMany({
        where: { 
          reconStatus: 'PENDING',
          invoice: { branchId }
        },
        select: { id: true, amount: true, mode: true, createdAt: true, invoice: { select: { id: true, invoiceNo: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      !sees.appointments ? [] : this.prisma.appointment.findMany({
        where: { branchId, date: { gt: now, lt: in48Hours }, status: { notIn: ['CANCELLED'] } },
        select: { 
          id: true, 
          date: true, 
          status: true, 
          visitType: true, 
          patient: { select: { id: true, name: true } }, 
          doctor: { select: { id: true, firstName: true, lastName: true } } 
        },
        orderBy: { date: 'asc' },
        take: 10,
      }),
    ]);

    const availableOf = (item: { currentStock: number; heldStock?: number | null }) => item.currentStock - (item.heldStock ?? 0);
    const lowNames = [...new Set(low.rows.map((i: any) => i.name as string))];
    const byName = lowNames.length
      ? await this.prisma.inventoryItem.groupBy({
          by: ['name'],
          where: { branchId, status: 'ACTIVE', name: { in: lowNames }, OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] },
          _sum: { currentStock: true, heldStock: true },
        })
      : [];
    const availableInAll = new Map(byName.map((g) => [g.name, (g._sum.currentStock ?? 0) - (g._sum.heldStock ?? 0)]));

    return {
      counts: {
        billsDue: billsDueSum?._count ?? 0,
        lowStockAlerts: low.total,
        expiryAlerts: expiring.total,
        pendingPayments: pendingPaymentsList.length,
        upcomingAppointments: upcomingAppointments.length,
      },
      billsDueBalance: billsDueSum?._sum.balance ?? 0,
      canTakePayment: billAccess?.takePayment ?? false,
      billsDue: billsDue.map((b) => ({
        id: b.id,
        invoiceNo: b.invoiceNo,
        balance: b.balance,
        status: b.status,
        dueDate: b.dueDate,
        billDate: clinicDay(b.createdAt),
        patient: b.patient,
        appointment: b.appointment && { id: b.appointment.id, doctorId: b.appointment.doctorId, day: b.appointment.date.toISOString().slice(0, 10) },
      })),
      lowStockAlerts: low.rows.map((i: any) => ({
        itemId: i.id,
        itemName: i.name,
        currentStock: i.currentStock,
        available: availableOf(i),
        availableInAll: Math.max(availableOf(i), availableInAll.get(i.name) ?? 0),
        reorderLevel: i.minStockLevel ?? i.reorderLevel ?? 0,
      })),
      expiryAlerts: expiring.rows.map((i: any) => ({
        itemId: i.id,
        itemName: i.name,
        expiryDate: i.expiryDate,
        daysUntilExpiry: Math.ceil((new Date(i.expiryDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
        currentStock: i.currentStock,
      })),
      pendingPayments: pendingPaymentsList,
      upcomingAppointments: upcomingAppointments.map((a) => ({
        id: a.id,
        time: a.date,
        status: a.status,
        visitType: a.visitType,
        patientId: (a as any).patient?.id,
        patientName: (a as any).patient?.name || 'Patient',
        doctorName: `${(a as any).doctor?.firstName || ''} ${(a as any).doctor?.lastName || (a as any).doctor?.name || ''}`.trim(),
      })),
      generatedAt: new Date(),
    };
  }

  // UTILITIES
}
