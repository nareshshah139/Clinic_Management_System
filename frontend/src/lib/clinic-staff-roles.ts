import { UserRole } from '@cms/shared-types';

/** The roles the server's clinic staff routes admit (patients, user profiles): every staff role but the lab technician. */
export const CLINIC_STAFF_ROLES: string[] = [
  UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.DOCTOR,
  UserRole.NURSE, UserRole.RECEPTION, UserRole.PHARMACIST, UserRole.ACCOUNTANT,
];
