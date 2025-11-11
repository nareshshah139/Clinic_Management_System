import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
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

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // REVENUE REPORTS
  async generateRevenueReport(query: RevenueQueryDto, branchId: string): Promise<RevenueReportResponseDto> {
    const { startDate, endDate, period, doctorId, paymentMode, serviceType, includePaymentBreakdown } = query;
    const dateRange = this.calculateDateRange(startDate, endDate, period);

    const wherePayments: any = {
      reconStatus: 'COMPLETED',
      createdAt: { gte: dateRange.start, lte: dateRange.end },
      // Use relation filter on invoice
      invoice: {
        is: {
          patient: { branchId },
          ...(doctorId
            ? { OR: [{ visit: { doctorId } }, { appointment: { doctorId } }] }
            : {}),
          ...(serviceType
            ? { items: { contains: serviceType, mode: 'insensitive' } }
            : {}),
        },
      },
    };
    if (paymentMode) {
      wherePayments.mode = paymentMode as any;
    }

    const [sumAgg, paymentCount, invoiceIdGroups, paymentModeGroups, dailyGroups] = await Promise.all([
      this.prisma.payment.aggregate({ where: wherePayments, _sum: { amount: true } }),
      this.prisma.payment.count({ where: wherePayments }),
      this.prisma.payment.groupBy({ by: ['invoiceId'], where: wherePayments, _count: { invoiceId: true } }),
      includePaymentBreakdown
        ? this.prisma.payment.groupBy({ by: ['mode'], where: wherePayments, _sum: { amount: true }, _count: { id: true } })
        : Promise.resolve([] as any[]),
      this.prisma.payment.groupBy({ by: ['createdAt'], where: wherePayments, _sum: { amount: true }, _count: { id: true } }),
    ]);

    const totalRevenue = sumAgg._sum.amount ?? 0;
    const totalInvoices = invoiceIdGroups.length;

    const paymentBreakdown: PaymentBreakdownDto[] = (paymentModeGroups as any[]).map((g) => ({
      mode: g.mode,
      amount: g._sum.amount ?? 0,
      percentage: totalRevenue ? (100 * (g._sum.amount ?? 0)) / totalRevenue : 0,
      transactionCount: g._count.id,
    }));

    const dailyBreakdown: DailyRevenueDto[] = dailyGroups.map((g) => ({
      date: new Date(g.createdAt).toISOString().split('T')[0],
      revenue: g._sum.amount ?? 0,
      invoiceCount: g._count.id,
      averageInvoiceValue: g._count.id ? (g._sum.amount ?? 0) / g._count.id : 0,
    }));

    // Compute GST from related invoices' items
    const invoiceIdsForGst = invoiceIdGroups.map((g: any) => g.invoiceId).filter(Boolean);
    let totalGst = 0;
    if (invoiceIdsForGst.length > 0) {
      const invoicesForGst = await this.prisma.invoice.findMany({
        where: { id: { in: invoiceIdsForGst } },
        select: { items: true },
      });
      for (const inv of invoicesForGst) {
        const itemsRaw = (inv as any).items;
        if (!itemsRaw) continue;
        try {
          const items = typeof itemsRaw === 'string' ? JSON.parse(itemsRaw) : itemsRaw;
          for (const it of items as any[]) {
            const quantity = Number(it.quantity ?? it.qty ?? 1);
            const unitPrice = Number(it.unitPrice ?? it.price ?? 0);
            const discountPct = Number(it.discount ?? 0);
            const gstRate = Number(it.gstRate ?? it.gst ?? 0);
            const discounted = quantity * unitPrice * (1 - discountPct / 100);
            totalGst += (discounted * gstRate) / 100;
          }
        } catch (_) {
          // ignore parse errors
        }
      }
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
      period: this.formatPeriod(dateRange),
    };
  }

  private async getDoctorRevenueBreakdown(paymentWhere: any): Promise<DoctorRevenueDto[]> {
    // Fetch payments with invoice visitId only (Invoice has no direct visit relation in schema)
    const payments = await this.prisma.payment.findMany({
      where: paymentWhere,
      select: {
        amount: true,
        invoice: { select: { id: true, visitId: true } },
      },
    });

    const visitIdSet = new Set<string>();
    for (const p of payments) if (p.invoice?.visitId) visitIdSet.add(p.invoice.visitId);
    const visitIds = Array.from(visitIdSet);

    const visits = visitIds.length
      ? await this.prisma.visit.findMany({
          where: { id: { in: visitIds } },
          select: { id: true, doctorId: true, doctor: { select: { id: true, firstName: true, lastName: true } } },
        })
      : [];
    const visitIdToDoctor = new Map<string, { id: string; name: string }>();
    for (const v of visits) {
      const name = `${v.doctor?.firstName || ''} ${v.doctor?.lastName || ''}`.trim() || 'Doctor';
      visitIdToDoctor.set(v.id, { id: v.doctorId, name });
    }

    const doctorMap = new Map<string, { id: string; name: string; revenue: number; visitCount: number }>();
    for (const p of payments) {
      const vInfo = p.invoice?.visitId ? visitIdToDoctor.get(p.invoice.visitId) : undefined;
      if (!vInfo?.id) continue;
      const current = doctorMap.get(vInfo.id) || { id: vInfo.id, name: vInfo.name, revenue: 0, visitCount: 0 };
      current.revenue += p.amount;
      current.visitCount += 1;
      doctorMap.set(vInfo.id, current);
    }

    const result: DoctorRevenueDto[] = Array.from(doctorMap.values()).map((d) => ({
      doctorId: d.id,
      doctorName: d.name,
      revenue: d.revenue,
      patientCount: d.visitCount,
      averageRevenuePerPatient: d.visitCount ? d.revenue / d.visitCount : 0,
      visitCount: d.visitCount,
    }));

    result.sort((a, b) => b.revenue - a.revenue);
    return result;
  }

  private async getServiceRevenueBreakdown(paymentWhere: any): Promise<ServiceRevenueDto[]> {
    // Best-effort: parse invoice.items (JSON string) and aggregate by category/name
    const payments = await this.prisma.payment.findMany({
      where: paymentWhere,
      include: { invoice: { select: { items: true } } },
    });
    const map = new Map<string, { revenue: number; count: number }>();
    for (const p of payments) {
      const itemsRaw = p.invoice?.items;
      if (!itemsRaw) continue;
      try {
        const items = JSON.parse(itemsRaw) as Array<any>;
        for (const it of items) {
          const key = it.category || it.name || 'Unknown';
          const total = (it.quantity || it.qty || 1) * (it.unitPrice || it.price || 0);
          const current = map.get(key) || { revenue: 0, count: 0 };
          current.revenue += total;
          current.count += 1;
          map.set(key, current);
        }
      } catch (_) {
        // ignore parse errors
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
    const dateRange = this.calculateDateRange(startDate, endDate, period);

    const wherePatients: any = { branchId };
    if (gender) wherePatients.gender = gender;
    if (city) wherePatients.city = city;

    const [patients, newPatientsCount, visitsInRange, totalPatientsCount] = await Promise.all([
      this.prisma.patient.findMany({ where: wherePatients }),
      this.prisma.patient.count({ where: { ...wherePatients, createdAt: { gte: dateRange.start, lte: dateRange.end } } }),
      this.prisma.visit.findMany({ where: { createdAt: { gte: dateRange.start, lte: dateRange.end }, patient: { branchId } }, select: { patientId: true } }),
      this.prisma.patient.count({ where: wherePatients }),
    ]);

    // Age filter and groups
    const now = new Date();
    const filtered = patients.filter((p) => {
      const age = this.ageFromDob(new Date(p.dob), now);
      if (age === null) return true; // Include patients with default/missing DOB in all filters
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
      const age = this.ageFromDob(new Date(p.dob), now);
      if (age === null) {
        // Skip age grouping for patients with default/missing DOB
        continue;
      }
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
      where: { ...wherePatients, createdAt: { gte: dateRange.start, lte: dateRange.end } },
      _count: { id: true },
    });
    const registrationTrends: RegistrationTrendDto[] = createdGroups.map((g) => ({
      date: new Date(g.createdAt).toISOString().split('T')[0],
      registrations: g._count.id,
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
      period: this.formatPeriod(dateRange),
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

  private async getTopVisitingPatients(branchId: string, dateRange: { start: Date; end: Date }): Promise<TopVisitingPatientDto[]> {
    const visits = await this.prisma.visit.groupBy({
      by: ['patientId'],
      where: { createdAt: { gte: dateRange.start, lte: dateRange.end }, patient: { branchId } },
      _count: { patientId: true },
    });
    const top = visits.sort((a, b) => b._count.patientId - a._count.patientId).slice(0, 10);
    const patientIds = top.map((t) => t.patientId);
    if (patientIds.length === 0) return [];

    const [patients, lastVisits, payments] = await Promise.all([
      this.prisma.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, name: true } }),
      this.prisma.visit.findMany({
        where: { patientId: { in: patientIds }, createdAt: { gte: dateRange.start, lte: dateRange.end } },
        orderBy: { createdAt: 'desc' },
        select: { patientId: true, createdAt: true },
      }),
      this.prisma.payment.findMany({
        where: { reconStatus: 'COMPLETED', createdAt: { gte: dateRange.start, lte: dateRange.end }, invoice: { patientId: { in: patientIds } } },
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
    const dateRange = this.calculateDateRange(startDate, endDate, period);

    const whereDoctors: any = { branchId, role: 'DOCTOR' };
    if (department) whereDoctors.department = department;

    const [doctors, activeDoctors] = await Promise.all([
      this.prisma.user.findMany({ where: whereDoctors, select: { id: true, firstName: true, lastName: true, department: true, status: true } }),
      this.prisma.user.count({ where: { ...whereDoctors, status: 'ACTIVE' } }),
    ]);

    const doctorMetrics: DoctorMetricsDto[] = includePerformanceMetrics
      ? await Promise.all(
          doctors.map(async (d) => {
            const apptWhere = { doctorId: d.id, date: { gte: dateRange.start, lte: dateRange.end }, branchId } as any;
            const [total, completed, cancelled, noShow, payments] = await Promise.all([
              this.prisma.appointment.count({ where: apptWhere }),
              this.prisma.appointment.count({ where: { ...apptWhere, status: 'COMPLETED' } }),
              this.prisma.appointment.count({ where: { ...apptWhere, status: 'CANCELLED' } }),
              this.prisma.appointment.count({ where: { ...apptWhere, status: 'NO_SHOW' } }),
              this.prisma.payment.findMany({
                where: { createdAt: { gte: dateRange.start, lte: dateRange.end } as any },
                select: { amount: true },
              }),
            ]);
            const totalRevenue = payments.reduce((s, p) => s + (p as any).amount, 0);
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
      period: this.formatPeriod(dateRange),
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
    const dateRange = this.calculateDateRange(startDate, endDate, period);

    const where: any = { branchId, date: { gte: dateRange.start, lte: dateRange.end } };
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
      const key = new Date(a.date).toISOString().split('T')[0];
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
      period: this.formatPeriod(dateRange),
    };
  }

  // INVENTORY REPORTS
  async generateInventoryReport(query: InventoryQueryDto, branchId: string): Promise<InventoryReportResponseDto> {
    const { startDate, endDate, period, itemType, category, manufacturer, includeLowStock, includeExpired, includeTransactionHistory } = query;
    const dateRange = this.calculateDateRange(startDate, endDate, period);

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
      period: this.formatPeriod(dateRange),
    };
  }

  private async getTopSellingItems(branchId: string, dateRange: { start: Date; end: Date }): Promise<TopSellingItemDto[]> {
    const tx = await this.prisma.stockTransaction.findMany({
      where: { branchId, type: 'SALE', createdAt: { gte: dateRange.start, lte: dateRange.end } },
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

  private async getTransactionSummary(branchId: string, dateRange: { start: Date; end: Date }): Promise<TransactionSummaryDto> {
    const where = { branchId, createdAt: { gte: dateRange.start, lte: dateRange.end } } as any;
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
  async generatePaymentReport(query: PaymentQueryDto, branchId: string): Promise<PaymentReportResponseDto> {
    const { startDate, endDate, period, paymentMode, gateway, includeReconciliation, includeRefunds } = query;
    const dateRange = this.calculateDateRange(startDate, endDate, period);

    const where: any = {
      invoice: { is: { patient: { branchId } } },
      createdAt: { gte: dateRange.start, lte: dateRange.end },
    };
    if (paymentMode) where.mode = paymentMode as any; // Fixed: use 'mode' instead of 'method'
    if (gateway) where.gateway = gateway;

    const [totalAmountAgg, totalPayments, successfulPayments, failedPayments, pendingPayments, modeGroups, gatewayGroups, dailyGroups, dailySuccess, dailyFailed] = await Promise.all([
      this.prisma.payment.aggregate({ where, _sum: { amount: true } }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.count({ where: { ...where, reconStatus: 'COMPLETED' } }),
      this.prisma.payment.count({ where: { ...where, reconStatus: 'FAILED' } }),
      this.prisma.payment.count({ where: { ...where, reconStatus: 'PENDING' } }),
      this.prisma.payment.groupBy({ by: ['mode'], where, _sum: { amount: true }, _count: { id: true } }),
      this.prisma.payment.groupBy({ by: ['gateway'], where, _sum: { amount: true }, _count: { id: true } }),
      this.prisma.payment.groupBy({ by: ['createdAt'], where, _sum: { amount: true }, _count: { id: true } }),
      this.prisma.payment.groupBy({ by: ['createdAt'], where: { ...where, reconStatus: 'COMPLETED' }, _count: { id: true } }),
      this.prisma.payment.groupBy({ by: ['createdAt'], where: { ...where, reconStatus: 'FAILED' }, _count: { id: true } }),
    ]);

    const totalAmount = totalAmountAgg._sum.amount || 0;
    const paymentModeBreakdown: PaymentModeBreakdownDto[] = modeGroups.map((g) => ({ mode: g.mode as any, transactionCount: g._count.id, totalAmount: g._sum.amount || 0, percentage: totalAmount ? (100 * (g._sum.amount || 0)) / totalAmount : 0, successRate: totalPayments ? (100 * successfulPayments) / totalPayments : 0 }));
    const gatewayBreakdown: GatewayBreakdownDto[] = gatewayGroups.map((g) => ({ gateway: g.gateway || 'N/A', transactionCount: g._count.id, totalAmount: g._sum.amount || 0, successRate: successfulPayments ? (100 * successfulPayments) / totalPayments : 0, averageTransactionAmount: g._count.id ? (g._sum.amount || 0) / g._count.id : 0 }));

    const successMap = new Map<string, number>();
    for (const g of dailySuccess) successMap.set(new Date(g.createdAt).toISOString().split('T')[0], g._count.id);
    const failedMap = new Map<string, number>();
    for (const g of dailyFailed) failedMap.set(new Date(g.createdAt).toISOString().split('T')[0], g._count.id);

    const dailyTrends: DailyPaymentTrendDto[] = dailyGroups.map((g) => {
      const key = new Date(g.createdAt).toISOString().split('T')[0];
      return { date: key, paymentCount: g._count.id, totalAmount: g._sum.amount || 0, successfulPayments: successMap.get(key) || 0, failedPayments: failedMap.get(key) || 0 };
    });

    const reconciliationSummary: ReconciliationSummaryDto = includeReconciliation
      ? { totalTransactions: totalPayments, reconciledTransactions: successfulPayments, pendingReconciliation: pendingPayments, reconciliationRate: totalPayments ? (100 * successfulPayments) / totalPayments : 0, discrepancyAmount: Math.max(0, totalAmount - (modeGroups.reduce((s, g) => s + ((g._sum?.amount as number) || 0), 0))) }
      : { totalTransactions: 0, reconciledTransactions: 0, pendingReconciliation: 0, reconciliationRate: 0, discrepancyAmount: 0 };

    const refundSummary: RefundSummaryDto = includeRefunds
      ? {
          totalRefunds: await this.prisma.payment.count({ where: { ...where, status: 'REFUNDED' } }),
          totalRefundAmount: (await this.prisma.payment.aggregate({ where: { ...where, status: 'REFUNDED' }, _sum: { amount: true } }))._sum.amount || 0,
          refundRate: totalPayments ? (100 * (await this.prisma.payment.count({ where: { ...where, status: 'REFUNDED' } }))) / totalPayments : 0,
          averageRefundAmount: 0,
          refundReasons: await this.getRefundReasons(branchId, dateRange),
        }
      : { totalRefunds: 0, totalRefundAmount: 0, refundRate: 0, averageRefundAmount: 0, refundReasons: [] };

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
      period: this.formatPeriod(dateRange),
    };
  }

  private async getRefundReasons(branchId: string, range: { start: Date; end: Date }): Promise<RefundReasonDto[]> {
    const refunds = await this.prisma.payment.findMany({ where: { createdAt: { gte: range.start, lte: range.end }, status: 'REFUNDED' as any } as any, select: { amount: true, notes: true } as any });
    const map = new Map<string, { count: number; amount: number }>();
    for (const r of refunds as any[]) {
      const reason = r.notes || 'N/A';
      const cur = map.get(reason) || { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += r.amount || 0;
      map.set(reason, cur);
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v.count, 0) || 1;
    return Array.from(map.entries()).map(([reason, v]) => ({ reason, count: v.count, amount: v.amount, percentage: (100 * v.count) / total }));
  }

  // DASHBOARD
  async generateDashboard(query: DashboardQuery, branchId: string): Promise<DashboardResponseDto> {
    const target = query.date ? new Date(query.date) : new Date();
    const start = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const end = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59);

    const [appointments, completed, revenueAgg, patients, activeDoctors, lowStockAlerts, pendingPayments, recentAppointmentsRaw, revenueLast7] = await Promise.all([
      this.prisma.appointment.count({ where: { branchId, date: { gte: start, lte: end } } }),
      this.prisma.appointment.count({ where: { branchId, date: { gte: start, lte: end }, status: 'COMPLETED' } }),
      this.prisma.newPayment.aggregate({ where: { invoice: { branchId }, reconStatus: 'COMPLETED', createdAt: { gte: start, lte: end } }, _sum: { amount: true } }),
      this.prisma.patient.count({ where: { branchId, createdAt: { gte: start, lte: end } } }),
      this.prisma.appointment.groupBy({ by: ['doctorId'], where: { branchId, date: { gte: start, lte: end } }, _count: { doctorId: true } }),
      this.prisma.inventoryItem.count({ where: { branchId, NOT: { minStockLevel: null }, AND: [{ currentStock: { lte: 0 } }, { minStockLevel: { gt: 0 } }] } }),
      this.prisma.newPayment.count({ where: { invoice: { branchId }, reconStatus: 'PENDING' } }),
      this.prisma.appointment.findMany({ where: { branchId }, orderBy: { date: 'desc' }, take: 10, select: { id: true, date: true, status: true, visitType: true, patient: { select: { name: true } }, doctor: { select: { firstName: true, lastName: true } } } }),
      this.prisma.newPayment.groupBy({ by: ['createdAt'], where: { invoice: { branchId }, reconStatus: 'COMPLETED', createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), lte: end } }, _sum: { amount: true }, _count: { id: true } }),
    ]);

    const recentAppointments: RecentAppointmentDto[] = recentAppointmentsRaw.map((a) => ({
      appointmentId: a.id,
      patientName: a.patient?.name || 'Patient',
      doctorName: `${a.doctor?.firstName || ''} ${a.doctor?.lastName || ''}`.trim(),
      appointmentTime: a.date,
      status: a.status as any,
      visitType: a.visitType as any,
    }));

    const revenueTrends: RevenueTrendDto[] = revenueLast7
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((g) => ({ date: new Date(g.createdAt).toISOString().split('T')[0], revenue: g._sum.amount || 0, invoiceCount: g._count.id }));

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
      doc.fontSize(10).text(`Generated: ${new Date().toISOString()}`);
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
      // Minimal export simulation for other formats
      fileUrl = `/exports/${reportType}-${timestamp}.${exportFormat.toLowerCase()}`;
      fileName = `${fileBase}.${exportFormat.toLowerCase()}`;
      fileSize = JSON.stringify(data).length;
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
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

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
      this.prisma.appointment.count({ where: { branchId, date: { gte: startOfDay, lte: endOfDay } } }),
      this.prisma.appointment.count({ where: { branchId, date: { gte: startOfDay, lte: endOfDay }, status: 'COMPLETED' as any } }),
      this.prisma.newPayment.aggregate({ where: { invoice: { branchId }, reconStatus: 'COMPLETED', createdAt: { gte: startOfMonth, lte: now } }, _sum: { amount: true } }),
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
  async getSystemAlerts(branchId: string): Promise<any> {
    const now = new Date();
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const in48Hours = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const [overdueInvoices, lowStockAlerts, expiryAlerts, pendingPaymentsList, upcomingAppointments] = await Promise.all([
      this.prisma.newInvoice.findMany({
        where: { branchId, status: 'OVERDUE' },
        select: { id: true, invoiceNo: true, total: true, dueDate: true, patient: { select: { id: true, name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
      this.prisma.inventoryItem.findMany({
        where: { branchId, NOT: { minStockLevel: null }, AND: [{ currentStock: { lte: 0 } }, { minStockLevel: { gt: 0 } }] },
        select: { id: true, name: true, currentStock: true, minStockLevel: true },
        orderBy: { currentStock: 'asc' },
        take: 10,
      }),
      this.prisma.inventoryItem.findMany({
        where: { branchId, expiryDate: { gt: now, lt: in30Days } },
        select: { id: true, name: true, expiryDate: true, currentStock: true },
        orderBy: { expiryDate: 'asc' },
        take: 10,
      }),
      this.prisma.newPayment.findMany({
        where: { 
          reconStatus: 'PENDING',
          invoice: { branchId }
        },
        select: { id: true, amount: true, mode: true, createdAt: true, invoice: { select: { id: true, invoiceNo: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.appointment.findMany({
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

    return {
      counts: {
        overdueInvoices: overdueInvoices.length,
        lowStockAlerts: lowStockAlerts.length,
        expiryAlerts: expiryAlerts.length,
        pendingPayments: pendingPaymentsList.length,
        upcomingAppointments: upcomingAppointments.length,
      },
      overdueInvoices,
      lowStockAlerts: lowStockAlerts.map((i) => ({
        itemId: i.id,
        itemName: i.name,
        currentStock: i.currentStock,
        reorderLevel: (i as any).minStockLevel || 0,
      })),
      expiryAlerts: expiryAlerts.map((i) => ({
        itemId: i.id,
        itemName: i.name,
        expiryDate: i.expiryDate!,
        daysUntilExpiry: Math.ceil(((i.expiryDate as Date).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
        currentStock: i.currentStock,
      })),
      pendingPayments: pendingPaymentsList,
      upcomingAppointments: upcomingAppointments.map((a) => ({
        id: a.id,
        time: a.date,
        status: a.status,
        visitType: a.visitType,
        patientName: (a as any).patient?.name || 'Patient',
        doctorName: `${(a as any).doctor?.firstName || ''} ${(a as any).doctor?.lastName || (a as any).doctor?.name || ''}`.trim(),
      })),
      generatedAt: new Date(),
    };
  }

  // UTILITIES
  private calculateDateRange(startDate?: string, endDate?: string, period?: ReportPeriod): { start: Date; end: Date } {
    const now = new Date();
    if (startDate && endDate) return { start: new Date(startDate), end: new Date(endDate) };
    switch (period) {
      case 'DAILY':
        return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59) };
      case 'WEEKLY':
        const sow = new Date(now);
        sow.setDate(now.getDate() - now.getDay());
        return { start: new Date(sow.getFullYear(), sow.getMonth(), sow.getDate()), end: new Date(sow.getFullYear(), sow.getMonth(), sow.getDate() + 6, 23, 59, 59) };
      case 'MONTHLY':
        return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
      case 'QUARTERLY':
        const q = Math.floor(now.getMonth() / 3);
        return { start: new Date(now.getFullYear(), q * 3, 1), end: new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59) };
      case 'YEARLY':
        return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31, 23, 59, 59) };
      default:
        return { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end: now };
    }
  }

  private formatPeriod(range: { start: Date; end: Date }): string {
    return `${range.start.toISOString().split('T')[0]} to ${range.end.toISOString().split('T')[0]}`;
  }
}
