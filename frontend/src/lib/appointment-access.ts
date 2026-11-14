import { UserRole } from '@cms/shared-types';

/**
 * The roles the server admits, with their seeded grants, to GET /appointments and a doctor's
 * schedule: OWNER, ADMIN and DOCTOR always, MANAGER, NURSE and RECEPTION through appointments:read.
 */
export const APPOINTMENT_READ_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'DOCTOR', 'NURSE', 'RECEPTION'];

/** The roles the server admits to GET /appointments/rooms: MANAGER holds no rooms grant. */
export const ROOM_READ_ROLES = ['OWNER', 'ADMIN', 'DOCTOR', 'NURSE', 'RECEPTION'];

/** The roles the server admits to POST /visits, which a started visit makes. */
export const START_VISIT_ROLES: readonly string[] = [UserRole.OWNER, UserRole.ADMIN, UserRole.DOCTOR];
