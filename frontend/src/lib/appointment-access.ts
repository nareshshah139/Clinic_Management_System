import { AppointmentStatus, UserRole } from '@cms/shared-types';

/**
 * The roles the server admits, with their seeded grants, to GET /appointments and a doctor's
 * schedule: OWNER, ADMIN and DOCTOR always, MANAGER, NURSE and RECEPTION through appointments:read.
 */
export const APPOINTMENT_READ_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'DOCTOR', 'NURSE', 'RECEPTION'];

/** The roles the server admits to GET /appointments/rooms: MANAGER holds no rooms grant. */
export const ROOM_READ_ROLES = ['OWNER', 'ADMIN', 'DOCTOR', 'NURSE', 'RECEPTION'];

/** The roles the server admits to POST /visits, which a started visit makes. */
export const START_VISIT_ROLES: readonly string[] = [UserRole.OWNER, UserRole.ADMIN, UserRole.DOCTOR];

/** The role that records vitals and photos in a visit that exists, but may not create one. */
const OPEN_VISIT_ROLES: readonly string[] = [UserRole.NURSE];

const VISIT_STATUSES: readonly string[] = [AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS];

export type VisitAction = 'Start visit' | 'Continue visit' | 'Open visit';

/** The one visit action the row and the details dialog offer an appointment to a role, or none. */
export function visitActionFor(role: string | undefined, appointment: { status: string; visit?: { id?: string } | null }): VisitAction | null {
  if (!VISIT_STATUSES.includes(appointment.status)) return null;
  const creates = START_VISIT_ROLES.includes(role ?? '');
  if (appointment.visit?.id) return creates ? 'Continue visit' : OPEN_VISIT_ROLES.includes(role ?? '') ? 'Open visit' : null;
  return creates ? 'Start visit' : null;
}
