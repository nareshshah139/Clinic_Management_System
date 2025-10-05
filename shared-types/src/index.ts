// Shared enums for roles and statuses to avoid string literal drift across FE/BE

export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  DOCTOR = 'DOCTOR',
  NURSE = 'NURSE',
  RECEPTION = 'RECEPTION',
  PHARMACIST = 'PHARMACIST',
  ACCOUNTANT = 'ACCOUNTANT',
}

export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  CHECKED_IN = 'CHECKED_IN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export enum VisitStatus {
  DRAFT = 'DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export type AnyRole = `${UserRole}`;
export type AnyAppointmentStatus = `${AppointmentStatus}`;
export type AnyVisitStatus = `${VisitStatus}`;


