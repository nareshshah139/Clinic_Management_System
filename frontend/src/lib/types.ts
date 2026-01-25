// System Statistics from backend
export interface SystemStatistics {
  users: {
    total: number;
    active: number;
  };
  branches: {
    total: number;
    active: number;
  };
  system: {
    status: string;
    version: string;
    uptime: number;
  };
  generatedAt: string;
}

// System Alert
export interface SystemAlert {
  id: string;
  title: string;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  type: string;
  createdAt: string;
}

// Enums
import type { AppointmentStatus } from '@cms/shared-types';
export { UserRole, AppointmentStatus } from '@cms/shared-types';
export type VisitType = 'OPD' | 'TELEMED' | 'PROCEDURE';

// Room
export interface Room {
  id: string;
  name: string;
  type: string;
  capacity: number;
  isActive: boolean;
  branchId: string;
  createdAt: string;
  updatedAt: string;
}

// Room Schedule
export interface RoomSchedule {
  roomId: string;
  roomName: string;
  roomType: string;
  date: string;
  appointments: Array<{
    id: string;
    slot: string;
    patient: { id: string; name: string; phone?: string; email?: string; gender?: string; dob?: string; age?: number };
    doctor: { id: string; firstName: string; lastName: string };
    visitType?: string;
    status?: string;
    isFollowUp?: boolean;
    visit?: { id: string; status?: string | null };
  }>;
}

// Appointment
export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  date: string;
  slot: string;
  status: AppointmentStatus;
  visitType: VisitType;
  notes?: string;
  source?: string;
  branchId: string;
  roomId?: string;
  tokenNumber?: number;
  createdAt: string;
  updatedAt: string;
  patient?: {
    id: string;
    firstName: string;
    lastName: string;
    name: string;
    phone?: string;
    email?: string;
  };
  doctor?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  room?: Room;
  visit?: {
    id: string;
    status?: string | null;
  } | null;
}

// Appointment in slot format (for UI)
export interface AppointmentInSlot {
  id: string;
  slot: string;
  patient: { id: string; name: string; phone?: string; email?: string; gender?: string; dob?: string; age?: number };
  doctor: { id?: string; firstName: string; lastName: string };
  visitType: VisitType;
  room?: { id: string; name: string; type: string };
  status: AppointmentStatus;
  visit?: { id: string; status?: string | null };
  isFollowUp?: boolean;
}

// Available Slots
export interface AvailableSlot {
  time: string;
  available: boolean;
}

// Doctor Schedule
export interface DoctorSchedule {
  doctorId: string;
  date: string;
  appointments: Appointment[];
}

// Patient
export interface Patient {
  id: string;
  patientCode?: string;
  abhaId?: string;
  firstName: string;
  lastName: string;
  name: string; // Computed field for display
  email?: string;
  phone: string;
  gender: string;
  dob: string;
  address?: string;
  city?: string;
  state?: string;
  referralSource?: string;
  emergencyContact?: string;
  createdAt: string;
  updatedAt: string;
  allergies?: string | null;
  medicalHistory?: string | null;
  portalUserId?: string | null;
  lastVisitDate?: string | null;
}

// User
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  branchId: string;
  employeeId?: string;
  designation?: string;
  department?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any> | null;
}

// API Response wrappers
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Appointment API responses
export interface GetUsersResponse {
  users: User[];
  total?: number;
}

export interface GetPatientsResponse {
  patients: Patient[];
  data: Patient[];
  total?: number;
}

// Backend select shape for patients listing
export interface BackendPatientRow {
  id: string;
  patientCode?: string | null;
  abhaId?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  gender?: string | null;
  dob: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  city?: string | null;
  state?: string | null;
  referralSource?: string | null;
  portalUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface GetPatientsResponseWithMeta {
  data: BackendPatientRow[];
  meta?: PaginationMeta;
  patients?: BackendPatientRow[]; // tolerate alternate naming
  total?: number; // tolerate legacy total-only shape
}

export interface GetRoomsResponse {
  rooms: Room[];
}

export interface GetAvailableSlotsResponse {
  slots: AvailableSlot[];
  availableSlots: string[];
}

export interface GetDoctorScheduleResponse {
  appointments: Appointment[];
  doctorId: string;
  date: string;
}

export interface RescheduleAppointmentPayload {
  date: string;
  slot: string;
  roomId?: string;
  notes?: string;
}

// Create Appointment DTO
export interface CreateAppointmentDto {
  patientId: string;
  doctorId: string;
  roomId?: string;
  date: string;
  slot: string;
  visitType?: VisitType;
  notes?: string;
  source?: string;
}

// Time Slot Configuration
export interface TimeSlotConfig {
  startHour: number;
  endHour: number;
  stepMinutes: number;
  timezone: string;
}



// Billing
export interface InvoiceItemSummary {
  id?: string;
  serviceId?: string;
  name?: string;
  description?: string;
  qty: number;
  unitPrice: number;
  discount?: number;
  gstRate: number;
  total: number;
}

export interface InvoicePatientSummary {
  id: string;
  name?: string;
  phone?: string;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  total: number;
  received: number;
  balance: number;
  createdAt: string;
  patient?: InvoicePatientSummary;
  items?: InvoiceItemSummary[];
}

export type ItemCategory = 'MEDICINE' | 'EQUIPMENT' | 'SUPPLIES' | 'OTHER';

// Pharmacy Billing
export type PharmacyInvoiceStatus = 'DRAFT' | 'PENDING' | 'CONFIRMED' | 'DISPENSED' | 'COMPLETED' | 'CANCELLED';
export type PharmacyPaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_PAID';
export type PharmacyPaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'NETBANKING' | 'WALLET' | 'INSURANCE';

export interface PharmacyInvoiceItem {
  id: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  itemType: 'DRUG' | 'PACKAGE';
  drug?: {
    id: string;
    name: string;
    manufacturerName?: string;
    packSizeLabel?: string;
    composition1?: string;
    composition2?: string;
    strength?: string;
    dosageForm?: string;
  } | null;
  package?: {
    id: string;
    name: string;
    category?: string;
    subcategory?: string;
    packagePrice?: number;
    originalPrice?: number;
    discountPercent?: number;
  } | null;
}

export interface PharmacyInvoiceSummary {
  id: string;
  invoiceNumber: string;
  patientId: string;
  patient: {
    id: string;
    name: string;
    phone?: string;
  };
  doctor?: {
    id: string;
    firstName?: string;
    lastName?: string;
  } | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: PharmacyPaymentMethod;
  paymentStatus: PharmacyPaymentStatus;
  status: PharmacyInvoiceStatus;
  billingName: string;
  billingPhone: string;
  invoiceDate: string;
  createdAt: string;
  updatedAt: string;
  items: PharmacyInvoiceItem[];
}

export interface PharmacyInvoiceListResponse {
  data: PharmacyInvoiceSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface PharmacyInvoiceQueryParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  patientId?: string;
  doctorId?: string;
  status?: PharmacyInvoiceStatus | 'all';
  paymentStatus?: PharmacyPaymentStatus | 'all';
  paymentMethod?: PharmacyPaymentMethod | 'all';
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  sku?: string;
  barcode?: string;
  category?: ItemCategory;
  manufacturer?: string;
  currentStock: number;
  reorderLevel: number;
  costPrice: number;
  sellingPrice?: number;
  updatedAt?: string;
}

// Visit summaries used in procedures dashboard
export interface VisitSummary {
  id: string;
  patientId: string;
  doctorId: string;
  createdAt: string;
  updatedAt?: string;
  appointmentId?: string | null;
  status?: string | null;
  visitType?: string | null;
  plan?: unknown;
  exam?: unknown;
  vitals?: unknown;
  complaints?: unknown;
  diagnosis?: unknown;
  scribeJson?: unknown;
}

export interface ProcedureVisitResponse {
  visits?: VisitSummary[];
  data?: VisitSummary[];
}

export interface StaffSummary {
  id: string;
  firstName: string;
  lastName: string;
  role?: string;
}

export interface VisitTimelineEntry {
  id: string;
  createdAt?: string;
  complaints?: unknown;
  diagnosis?: unknown;
  plan?: unknown;
  followUp?: string | null;
  scribeJson?: unknown;
  vitals?: unknown;
  doctor?: { firstName?: string; lastName?: string } | null;
  prescription?: { id: string; createdAt?: string | null } | null;
}

export interface PatientVisitHistoryPayload {
  visits?: VisitTimelineEntry[];
  data?: VisitTimelineEntry[];
}

export type PatientVisitHistoryResponse = VisitTimelineEntry[] | PatientVisitHistoryPayload;

export interface VisitPatientSummary {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone?: string;
  email?: string;
  gender?: string;
  dob?: string;
  allergies?: string | null;
  medicalHistory?: string | null;
}

export interface VisitDetails {
  id: string;
  patientId: string;
  doctorId: string;
  appointmentId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  complaints?: unknown;
  examination?: unknown;
  diagnosis?: unknown;
  plan?: unknown;
  vitals?: unknown;
  status?: string;
  metadata?: Record<string, unknown>;
}
