import { UserRole } from '@cms/shared-types';

interface DefaultDoctorInput {
  role: string | undefined;
  userId: string | undefined;
  current: string;
  appointmentDoctorId?: string;
}

export function resolveDefaultDoctorId({ role, userId, current, appointmentDoctorId }: DefaultDoctorInput): string {
  if (current) return current;
  if (role === UserRole.DOCTOR && userId) return userId;
  return appointmentDoctorId ?? '';
}
