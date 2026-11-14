import { UserRole } from '@cms/shared-types';

/** The roles the sidebar admits to Visits, so the only roles that can start one. */
const VISIT_ROLES: string[] = [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.DOCTOR, UserRole.NURSE];

export const canStartVisit = (role?: string | null): boolean => !!role && VISIT_ROLES.includes(role);
