import { UserRole } from '@cms/shared-types';

interface DefaultDoctorInput {
  role: string | undefined;
  userId: string | undefined;
  current: string;
  appointmentDoctorId?: string;
  appointmentPending?: boolean;
}

export function resolveDefaultDoctorId({
  role,
  userId,
  current,
  appointmentDoctorId,
  appointmentPending,
}: DefaultDoctorInput): string {
  if (appointmentPending) return '';
  if (appointmentDoctorId) return appointmentDoctorId;
  if (current) return current;
  if (role === UserRole.DOCTOR && userId) return userId;
  return '';
}
