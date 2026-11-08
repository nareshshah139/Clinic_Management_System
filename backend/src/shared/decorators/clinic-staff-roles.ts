import { UserRole } from '@prisma/client';

/**
 * @cc [owner:nareshshah139,label:security] clinical-staff-access
 * Clinical patient and visit routes MUST allow clinic staff while excluding patient and lab technician roles,
 * unless a narrower route-specific policy applies.
 */
export const CLINIC_STAFF_ROLES: UserRole[] = [
  UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.DOCTOR,
  UserRole.NURSE, UserRole.RECEPTION, UserRole.PHARMACIST, UserRole.ACCOUNTANT,
];

/**
 * @cc [owner:nareshshah139,label:security] pharmacy-operations-boundary
 * Pharmacy operations MUST exclude roles outside clinic management, doctors, pharmacy and reception staff.
 */
export const PHARMACY_OPERATIONS_ROLES: UserRole[] = [
  UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.DOCTOR, UserRole.PHARMACIST, UserRole.RECEPTION,
];
