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

// Appointment
export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  scheduledAt: string;
  status: string;
  visitType: string;
  patient?: {
    firstName: string;
    lastName: string;
  };
}

// Patient
export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
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
