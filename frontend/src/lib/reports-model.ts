export type ReportTab = 'revenue' | 'patients' | 'doctors' | 'appointments' | 'inventory' | 'payments';

export type ReportExportType = 'REVENUE' | 'PATIENT' | 'DOCTOR' | 'APPOINTMENT' | 'INVENTORY' | 'PAYMENT';

export const REPORT_EXPORT_TYPE: Record<ReportTab, ReportExportType> = {
  revenue: 'REVENUE',
  patients: 'PATIENT',
  doctors: 'DOCTOR',
  appointments: 'APPOINTMENT',
  inventory: 'INVENTORY',
  payments: 'PAYMENT',
};
