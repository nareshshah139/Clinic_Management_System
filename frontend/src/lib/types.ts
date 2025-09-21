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
export type VisitType = 'OPD' | 'TELEMED' | 'PROCEDURE';
export type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

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
    patient: { id: string; name: string; phone?: string };
    doctor: { id: string; firstName: string; lastName: string };
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
}

// Appointment in slot format (for UI)
export interface AppointmentInSlot {
  id: string;
  slot: string;
  patient: { id: string; name: string; phone?: string; email?: string };
  doctor: { firstName: string; lastName: string };
  visitType: VisitType;
  room?: { id: string; name: string; type: string };
  status: AppointmentStatus;
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
  createdAt: string;
  updatedAt: string;
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
